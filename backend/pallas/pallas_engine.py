"""Incremental Frontier 1 evaluator. No database, outcome prices, or final watchlist.

Five-minute OHLC is released at its END, chain at its nominal capture timestamp.
The caller supplies only the current quote, opening quote, prior-session walls,
and cash bars already closed. Signal dictionaries are frozen on first acceptance.
"""
import math

VERSION = 'pallas-causal-1'


def minute(hm):
    return int(hm[:2]) * 60 + int(hm[3:5])


def clock(value):
    return f'{value // 60:02d}:{value % 60:02d}:00'


def finite(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


class Scanner:
    def __init__(self, day, baselines, prior_walls):
        self.day, self.baselines, self.prior_walls = day, baselines, prior_walls
        self.bars, self.opening, self.issued = {}, {}, {}
        self.last_cut = None

    def step(self, cut, closed_bars, chains):
        if self.last_cut is not None and cut <= self.last_cut:
            raise ValueError('Cuts must be unique and chronological')
        self.last_cut = cut
        new = []
        if cut == '09:15:00':
            self.opening = chains
        for sym, bar in sorted(closed_bars.items()):
            if minute(bar['hm']) + 5 != minute(cut):
                raise ValueError('Cash bar is not closed at this boundary')
            if not all(finite(bar[k]) for k in ('o', 'h', 'l', 'c')):
                continue
            history = self.bars.setdefault(sym, [])
            prior = list(history)
            history.append(dict(bar))
            if sym in self.issued or not ('09:45:00' <= bar['hm'] <= '10:45:00'):
                continue
            event = self.evaluate(sym, prior, bar, chains.get(sym, []), cut)
            if event:
                self.issued[sym] = event
                new.append(dict(event))
        return new

    def evaluate(self, sym, prior, trigger, chain, cut):
        base = self.baselines.get(sym)
        if not base or not all(finite(base[k]) and base[k] > 0 for k in ('spot', 'pdh', 'pdl', 'open')) or base['spot'] < 50:
            return None
        pole_window = [b for b in prior if b['hm'] <= '09:45:00']
        if len(pole_window) < 3:
            return None
        ph, pl = max(b['h'] for b in pole_window), min(b['l'] for b in pole_window)
        bm, sm = (ph / base['open'] - 1) * 100, (1 - pl / base['open']) * 100
        bd, sd = (ph / base['pdh'] - 1) * 100, (1 - pl / base['pdl']) * 100
        
        # 1. Standard open/PDH/PDL-anchored impulses
        bull = (bd >= .20 or bm >= 1) and ph > base['pdh']
        bear = (sd >= .20 or sm >= 1) and pl < base['pdl']
        
        # 2. Reverse Pole Flag (Top-rejection dump from morning swing high, e.g. GAIL)
        rev_bear, rev_peak_bar, rev_trough_bar, rev_move = False, None, None, 0.0
        for i, b_hi in enumerate(pole_window[:-1]):
            if b_hi['h'] == ph and ph >= base['open'] * 0.998:
                after_bars = pole_window[i+1:]
                if after_bars:
                    min_after = min(b['l'] for b in after_bars)
                    drop_from_hi = (ph - min_after) / ph * 100
                    if drop_from_hi >= 1.0:
                        rev_bear = True
                        rev_peak_bar = b_hi
                        rev_trough_bar = next(b for b in after_bars if b['l'] == min_after)
                        rev_move = drop_from_hi
                        break

        candidates = []
        if bull:
            candidates.append(('BULL', 'STANDARD', bm, ph, next(b for b in pole_window if b['h'] == ph), base['open'], None))
        if bear:
            candidates.append(('BEAR', 'STANDARD', sm, pl, next(b for b in pole_window if b['l'] == pl), base['open'], None))
        if rev_bear and not bear:
            candidates.append(('BEAR', 'REVERSE_POLE', rev_move, rev_trough_bar['l'], rev_trough_bar, rev_peak_bar['h'], rev_peak_bar))

        if not candidates:
            return None

        best_event = None
        for side, pattern_type, move, extreme, pole, pole_anchor, pole_start in candidates:
            # Trigger never establishes its own flag: OHLC cannot tell high/low order.
            flag_window = [b for b in prior if pole['hm'] < b['hm'] <= '10:35:00']
            if not flag_window:
                continue
            flag = min(flag_window, key=lambda b: b['l']) if side == 'BULL' else max(flag_window, key=lambda b: b['h'])
            depth = extreme - flag['l'] if side == 'BULL' else flag['h'] - extreme
            pb = depth / extreme * 100
            pole_pts = abs(extreme - pole_anchor)
            retrace = depth / pole_pts * 100 if pole_pts > 0 else 0
            breakout = trigger['h'] > extreme and trigger['c'] >= extreme * .998 if side == 'BULL' else trigger['l'] < extreme and trigger['c'] <= extreme * 1.002
            if not breakout:
                continue
            pole_bars = [b for b in prior if b['hm'] <= pole['hm']]
            if pattern_type == 'REVERSE_POLE' and pole_start:
                pole_bars = [b for b in prior if pole_start['hm'] <= b['hm'] <= pole['hm']]
            flag_bars = [b for b in prior if pole['hm'] < b['hm'] <= flag['hm']]
            p_range = max(b['h'] for b in pole_bars) - min(b['l'] for b in pole_bars)
            f_range = max(b['h'] for b in flag_bars) - min(b['l'] for b in flag_bars)
            ratio = round(p_range / f_range, 2) if f_range > 0 else 1
            body = round(sum(abs(b['c'] - b['o']) / (b['h'] - b['l'] if b['h'] > b['l'] else .01) * 100 for b in pole_bars) / len(pole_bars), 1)
            net_disp = abs(pole_bars[-1]['c'] - pole_bars[0]['o']) / (p_range if p_range > 0 else .01) * 100
            effective_body = max(body, round(net_disp, 1))
            # Preserve published gate precision with directional body recognition for open-drive cascades
            move_r, pb_r, retrace_r = round(move, 2), round(pb, 2), round(retrace, 1)
            if not (move_r >= 1 and .10 <= pb_r <= 2.20 and retrace_r <= 140 and ratio >= 1.50 and (body >= 40 or effective_body >= 50 or move_r >= 2.0)):
                continue
            expiries = {r['expiry'] for r in chain if r['expiry'] >= self.day}
            if len(expiries) != 1:
                continue
            expiry = next(iter(expiries))
            valid = [r for r in chain if r['expiry'] == expiry and all(finite(r[k]) for k in ('strike', 'oi', 'prev_oi', 'vol')) and r['oi'] >= 0 and r['prev_oi'] >= 0 and r['vol'] >= 0]
            leg, opp = ('CE', 'PE') if side == 'BULL' else ('PE', 'CE')
            total_vol = sum(r['vol'] for r in valid if r['leg'] == leg)
            if total_vol <= 0:
                continue
            spot = trigger['c']
            choices = [r for r in valid if r['leg'] == leg and abs(r['strike'] / spot - 1) <= .025 and r['vol'] > 0 and finite(r['ltp'])]
            if not choices:
                continue
            if side == 'BEAR':
                choices = [r for r in choices if r['strike'] >= spot] or choices
            selected = max(choices, key=lambda r: (r['vol'], -r['strike']))
            premium, volume = selected['ltp'], selected['vol']
            if premium < (.5 if spot < 150 else 1) or volume < 10000:
                continue
            share = round(volume / total_vol * 100, 1)
            prem_flow, notional = volume * premium / 1e7, volume * spot / 1e7
            if share < 17 or not (prem_flow >= .25 or notional >= 12):
                continue
            leg_change = sum(r['oi'] - r['prev_oi'] for r in valid if r['leg'] == leg)
            opp_change = sum(r['oi'] - r['prev_oi'] for r in valid if r['leg'] == opp)
            flow = 'Neutral'
            if opp_change > 0:
                flow = 'CE Writing Ceiling' if side == 'BEAR' else 'PE Writing Floor'
            elif side == 'BULL' and leg_change < -5000:
                flow = 'CE Short Covering'
            elif side == 'BEAR' and selected['oi'] - selected['prev_oi'] > 10000:
                flow = 'Put Buying'
            elif side == 'BEAR' and leg_change < -5000:
                flow = 'PE Unwinding'
            if flow == 'Neutral':
                continue
            wall_meta = self.prior_walls.get((sym, expiry), {})
            line_type = 'R1' if side == 'BULL' else 'S1'
            wall = wall_meta.get(line_type)
            respected = None
            added = spike = opening_oi = signal_oi = None
            if wall is not None:
                respected = (extreme > wall and min(b['l'] for b in flag_window) >= wall * .996) if side == 'BULL' else (extreme < wall and max(b['h'] for b in flag_window) <= wall * 1.004)
                opening_row = next((r for r in self.opening.get(sym, []) if r['expiry'] == expiry and r['leg'] == opp and r['strike'] == wall), None)
                signal_row = next((r for r in valid if r['leg'] == opp and r['strike'] == wall), None)
                if opening_row and signal_row and finite(opening_row['oi']) and opening_row['oi'] > 0:
                    opening_oi, signal_oi = opening_row['oi'], signal_row['oi']
                    added = signal_oi - opening_oi
                    spike = round(added / opening_oi * 100, 1)
            boost = 1.25 if 'Writing' in flow or 'Covering' in flow else 1
            score = round((move_r / 1.5) * (share / 20) * math.sqrt(ratio) / (retrace_r / 50 + .5) * boost, 2)
            best_event = dict(Engine=VERSION, Date=self.day, Symbol=sym, Side=side, Expiry=expiry,
                              Pole_Time=pole['hm'][:5], Pole_Move_Pct=move_r, Pole_Extreme=round(extreme, 2),
                              Flag_Time=flag['hm'][:5], Flag_Retrace_Pct=retrace_r, Flag_Pullback_Pct=pb_r,
                              Breakout_Bar_Start=trigger['hm'][:5], Signal_Time=cut[:5], Chain_Time=cut[:5],
                              Breakout_Spot=round(spot, 2), Strike=selected['strike'], Leg=leg,
                              Selected_Strike=f"{selected['strike']:g} {leg}", Reference_Premium=premium,
                              Strike_Volume=volume, Leg_Volume=total_vol, Volume_Share_Pct=share,
                              Premium_Flow_Cr=round(prem_flow, 2), Notional_Cr=round(notional, 2),
                              Flow_Type=flow, Leg_OI_Change=leg_change, Opposing_OI_Change=opp_change,
                              Prior_Wall_Date=wall_meta.get('date'), Prior_OI_Line=wall, Prior_OI_Line_Type=line_type,
                              Prior_Wall_Status='same_expiry' if wall is not None else 'unavailable_same_expiry_prior_session',
                              Line_Respect=respected, Opening_Wall_OI=opening_oi, Signal_Wall_OI=signal_oi,
                              Intraday_Wall_Buildup_Pct=spike, Intraday_Wall_OI_Added=added,
                              PF_Ratio=ratio, Pole_Body_Pct=body,
                              Strike_Distance_Pct=round(abs(selected['strike'] / spot - 1) * 100, 2), TM_Score=score)
            break
        return best_event
