"""Durable, causal PAPER trade accounting. No broker order functions."""
import hashlib
import json
import math
import os
import re
from datetime import datetime
from decimal import Decimal, ROUND_FLOOR
from pathlib import Path
from zoneinfo import ZoneInfo

IST = ZoneInfo('Asia/Kolkata')
VERSION = 'kairos2-paper-1'
MODEL = 'pallas-revpole-lgb-d53e5a653f19'
ENGINE3_MODEL = 'pallas-pdh-lgb-20261006'
ENGINE3_SUBMODEL = 'pallas_pdh_break_ai'
ENTRY_POLICY = 'pallas-e3-oi-cross-20261007'
BUDGET = 30000
QUOTE_AGE = 30
ENTRY_AGE = 90
TRAIL = ((15, 2), (25, 15), (40, 25), (60, 40), (100, 70))


def epoch(value):
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.replace('.', '', 1).isdigit()):
        v = float(value)
        return v / 1000 if v > 10**11 else v
    iso = str(value).replace('Z', '+00:00')
    # VM Python 3.10 accepts 3/6 fractional digits; Upstox also sends 1/2/9.
    iso = re.sub(r'\.(\d+)(?=[+-]\d{2}:?\d{2}$)', lambda m: '.' + (m[1] + '000000')[:6], iso)
    d = datetime.fromisoformat(iso)
    if d.tzinfo is None:
        raise ValueError('Timestamp needs offset')
    return d.timestamp()


def stamp(now):
    return datetime.fromtimestamp(now, IST).isoformat()


def day(now):
    return datetime.fromtimestamp(now, IST).date().isoformat()


def hm(now):
    return datetime.fromtimestamp(now, IST).strftime('%H:%M:%S')


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def integer(value):
    return positive(value) and int(value) == value


def accepted_signal_model(event):
    """Keep Engines 1/2 rules; Engine 3 additionally requires prior R1 crossed."""
    model, submodel = event.get('AI_Model_ID'), event.get('AI_Submodel')
    if model == MODEL:
        return submodel != ENGINE3_SUBMODEL
    if model != ENGINE3_MODEL or submodel != ENGINE3_SUBMODEL:
        return False
    spot, line = event.get('Breakout_Spot'), event.get('Prior_OI_Line')
    return (event.get('Pattern_Type') == 'PDH_BREAK_FLAG' and event.get('Side') == 'BULL'
            and event.get('Prior_OI_Line_Type') == 'R1' and positive(spot) and positive(line)
            and spot >= line)


def quote_valid(q, now, key):
    try:
        return (q['key'] == key and 0 <= now - q['received_at'] <= 10 and
                0 <= now - q['quote_at'] <= QUOTE_AGE and q['quote_at'] <= q['received_at'] and
                day(q['quote_at']) == day(now) and positive(q.get('last_trade_at')) and
                q['last_trade_at'] <= q['quote_at'] and day(q['last_trade_at']) == day(now))
    except (KeyError, TypeError, ValueError):
        return False


def book(levels, buy):
    """Aggregate identical prices; ignore invalid or empty depth levels."""
    out = {}
    for row in levels[:5]:
        p, n = row.get('price'), row.get('quantity')
        if positive(p) and integer(n):
            price = Decimal(str(p))
            out[price] = out.get(price, 0) + int(n)
    return sorted(out.items(), reverse=not buy)


def cost(levels, quantity):
    remaining, amount = quantity, Decimal(0)
    for price, available in levels:
        n = min(remaining, available)
        amount += price * n
        remaining -= n
        if not remaining:
            return amount
    return None


def buy_size(q, lot, minimum_lot):
    if not integer(lot) or not integer(minimum_lot) or minimum_lot % lot:
        return None
    levels = book(q.get('asks', []), True)
    if not levels:
        return None
    upper = min(sum(n for _, n in levels) // lot,
                int((Decimal(BUDGET) / levels[0][0] / lot).to_integral_value(rounding=ROUND_FLOOR)))
    lo, hi = 0, upper
    while lo < hi:
        mid = (lo + hi + 1) // 2
        amount = cost(levels, mid * lot)
        if amount is not None and amount <= BUDGET:
            lo = mid
        else:
            hi = mid - 1
    if lo * lot < minimum_lot:
        return None
    amount = cost(levels, lo * lot)
    return dict(lots=lo, quantity=lo * lot, capital_used=float(amount),
                fill=float(amount / (lo * lot)), lot_size=lot)


def sell_mark(q, quantity):
    value = cost(book(q.get('bids', []), False), quantity)
    return float(value / quantity) if value is not None and quantity > 0 else None


class Trader:
    def __init__(self, root, boot_at):
        self.root, self.boot_at = Path(root), boot_at
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / 'state.json'
        if self.path.exists():
            self.state = json.loads(self.path.read_text())  # Corrupt state fails closed.
            if self.state.get('schema') != 1 or self.state.get('engine') != VERSION:
                raise ValueError('Unknown persisted state schema')
        else:
            self.state = dict(schema=1, engine=VERSION, date=day(boot_at), taken=False,
                              seen={}, position=None, pending=[], sequence=0, last_mtm=0,
                              last_health=0, status='Starting')
        self.roll(boot_at)
        self.save()

    def save(self):
        temporary = self.path.with_suffix('.tmp')
        with temporary.open('w', encoding='utf-8') as stream:
            json.dump(self.state, stream, separators=(',', ':'), allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, self.path)

    def roll(self, now):
        if self.state['date'] != day(now):
            self.state.update(date=day(now), taken=False, seen={}, last_mtm=0, last_health=0)
            # An overdue position is kept, never implicitly closed at midnight.
            if self.state['position']:
                self.state['status'] = 'Previous-session exit pending'

    def emit(self, kind, now, payload=None, trade_day=None):
        self.state['sequence'] += 1
        date = trade_day or self.state['date']
        doc = dict(source='kairos2', cap='KAIROS2', mode='paper', engine=VERSION,
                   kind=kind, event=kind, name='', side='NEUTRAL', date=date,
                   sig_date=date.replace('-', ''), ts=now, time=hm(now),
                   checked_at=stamp(now))
        doc.update(payload or {})
        identity = f"{VERSION}|{date}|{self.state['sequence']}|{kind}"
        doc['Doc_ID'] = hashlib.sha256(identity.encode()).hexdigest()
        self.state['pending'].append(doc)
        return doc

    def eligible(self, event, now, opening, closing):
        try:
            issued = epoch(event['Issued_At'])
            score = event['AI_Score']
            scored = epoch(event['AI_Scored_At'])
            cutoff = min(closing, epoch(day(now) + 'T11:30:00+05:30'))
            return (event['Event_Type'] == 'CONFIRMED_CLOSE' and event['Confirmation_Status'] == 'CONFIRMED'
                    and event.get('Recovered') is False and event['AI_Status'] == 'SCORED'
                    and accepted_signal_model(event) and isinstance(score, (int, float))
                    and not isinstance(score, bool) and math.isfinite(score) and .7 <= score <= 1
                    and event['Date'] == day(now) and day(issued) == day(now)
                    and opening <= issued <= now < cutoff and self.boot_at <= issued
                    and now - issued <= ENTRY_AGE and scored <= issued
                    and day(scored) == day(now) and event['Expiry'] >= day(now)
                    and event['Side'] in ('BULL', 'BEAR')
                    and event['Leg'] == ('CE' if event['Side'] == 'BULL' else 'PE')
                    and positive(event['Strike']) and bool(event['Event_ID']))
        except (KeyError, TypeError, ValueError, OverflowError):
            return False

    def candidates(self, events, now, opening, closing):
        self.roll(now)
        if self.state['position'] or self.state['taken']:
            return []
        items = [e for e in events if e.get('Event_ID') not in self.state['seen']
                 and self.eligible(e, now, opening, closing)]
        # Only already-issued events; tie-break within the same closed bar.
        return sorted(items, key=lambda e: (epoch(e['Issued_At']), e['Signal_Time'], -e['AI_Score'], e['Symbol']))

    def reject(self, event, now, reason):
        self.state['seen'][event['Event_ID']] = reason
        self.state['status'] = 'Skipped ' + event['Symbol'] + ': ' + reason
        self.emit('SKIP', now, dict(name=event['Symbol'], signal_id=event['Event_ID'], reason=reason,
                                   ai_score=event['AI_Score'], model_id=event['AI_Model_ID']))
        self.save()

    def enter(self, event, contract, q, now, opening, closing):
        if not self.candidates([event], now, opening, closing):
            return None
        exact = (contract.get('expiry') == event['Expiry'] and contract.get('leg') == event['Leg']
                 and contract.get('strike') == event['Strike'] and contract.get('underlying') == event['Symbol'])
        if not exact or not quote_valid(q, now, contract.get('key')) or q['quote_at'] < epoch(event['Issued_At']):
            return None
        size = buy_size(q, contract.get('lot_size'), contract.get('minimum_lot'))
        if not size:
            self.reject(event, now, 'Whole lot/depth exceeds available Rs30,000 budget')
            return None
        if sell_mark(q, size['quantity']) is None:
            self.reject(event, now, 'Insufficient quoted bid depth')
            return None
        top_bid = book(q.get('bids', []), False)[0][0]
        top_ask = book(q.get('asks', []), True)[0][0]
        if top_bid > top_ask:
            return None
        position = dict(date=day(now), signal_id=event['Event_ID'], name=contract['name'],
                        side='LONG' if event['Side'] == 'BULL' else 'SHORT', underlying=event['Symbol'],
                        expiry=contract['expiry'], strike=contract['strike'], leg=contract['leg'],
                        opt_key=contract['key'], ai_score=event['AI_Score'], model_id=event['AI_Model_ID'],
                        ai_submodel=event.get('AI_Submodel'),
                        engine3_oi_cross_required=event['AI_Model_ID'] == ENGINE3_MODEL,
                        breakout_spot=event.get('Breakout_Spot'), prior_oi_line=event.get('Prior_OI_Line'),
                        prior_oi_line_type=event.get('Prior_OI_Line_Type'),
                        signal_issued_at=event['Issued_At'], entry_at=stamp(now), quote_at=stamp(q['quote_at']),
                        **size, entry_fill=size['fill'], peak_gain_pct=0., stop_pct=-15.,
                        stop_premium=size['fill'] * .85, closing=closing, last_quote_epoch=q['quote_at'])
        self.state.update(position=position, taken=True, status='Paper position open', last_mtm=0)
        self.state['seen'][event['Event_ID']] = 'ENTERED'
        payload = {k: v for k, v in position.items() if k not in ('date', 'closing', 'last_quote_epoch', 'fill')}
        payload.update(entry=size['fill'], pnl=0., bid=float(top_bid), ask=float(top_ask))
        doc = self.emit('ENTRY', now, payload)
        self.save()  # Position + entry outbox commit atomically, before publication.
        return doc

    def mark(self, q, now):
        p = self.state['position']
        if not p:
            return None
        self.roll(now)
        if not quote_valid(q, now, p['opt_key']) or q['quote_at'] < p['last_quote_epoch']:
            self.state['status'] = 'Exit/mark pending: stale or unavailable option quote'
            self.save()
            return None
        mark = sell_mark(q, p['quantity'])
        if mark is None:
            self.state['status'] = 'Exit/mark pending: insufficient bid depth'
            self.save()
            return None
        gain = (mark / p['entry_fill'] - 1) * 100
        reason = None
        cutoff = min(p['closing'], epoch(p['date'] + 'T11:30:00+05:30'))
        if now >= cutoff:
            reason = 'TIME_EXIT_1130' if day(now) == p['date'] else 'OVERDUE_TIME_EXIT'
        elif mark <= p['stop_premium']:
            reason = 'STOP_LOSS' if p['stop_pct'] < 0 else 'TRAILING_STOP'
        p['peak_gain_pct'] = max(p['peak_gain_pct'], gain)
        for trigger, stop in TRAIL:
            if p['peak_gain_pct'] + 1e-9 >= trigger:
                p['stop_pct'] = max(p['stop_pct'], stop)
        p['stop_premium'] = p['entry_fill'] * (1 + p['stop_pct'] / 100)
        p['last_quote_epoch'] = q['quote_at']
        payload = {k: v for k, v in p.items() if k not in ('date', 'closing', 'last_quote_epoch', 'fill')}
        payload.update(entry=mark, quote_at=stamp(q['quote_at']), gain_pct=round(gain, 4),
                       pnl=round((mark - p['entry_fill']) * p['quantity'], 2))
        if reason:
            payload.update(reason=reason, exit_at=stamp(now))
            doc = self.emit('EXIT', now, payload, p['date'])
            self.state.update(position=None, status='Daily paper trade complete')
            self.save()
            return doc
        doc = None
        if now - self.state['last_mtm'] >= 30 and len(self.state['pending']) < 1000:
            doc = self.emit('MTM', now, payload, p['date'])
            self.state['last_mtm'] = now
        self.state['status'] = 'Paper position open'
        self.save()  # Persist trail even when a website mark is not due.
        return doc

    def health(self, now, status=None, extra=None):
        self.roll(now)
        if status:
            self.state['status'] = status
        p = self.state['position']
        h = dict(date=day(now), mode='paper', engine=VERSION, model_id=MODEL,
                 accepted_model_ids=[MODEL, ENGINE3_MODEL], engine3_model_id=ENGINE3_MODEL,
                 engine3_oi_cross_required=True, entry_policy=ENTRY_POLICY,
                 status=self.state['status'], checked_at=stamp(now), ai_threshold=.7,
                 budget=BUDGET, daily_trade_taken=self.state['taken'],
                 open_positions=int(p is not None), pending_publications=len(self.state['pending']),
                 position_date=p['date'] if p else None, **(extra or {}))
        path = self.root / 'health.json'
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(h, separators=(',', ':'), allow_nan=False))
        os.replace(temp, path)
        # Bound overnight/no-trade publication to one per 15 minutes.
        previous = self.state.get('health_status')
        interval = 60 if '09:15:00' <= hm(now) <= '11:35:00' else 900
        if len(self.state['pending']) < 1000 and (previous != h['status'] or
                self.state.get('health_policy') != ENTRY_POLICY or now - self.state['last_health'] >= interval):
            self.emit('HEALTH', now, {**{k: v for k, v in h.items() if k not in ('date', 'mode', 'engine', 'checked_at')},
                                    'heartbeat_seconds': interval})
            self.state.update(last_health=now, health_status=h['status'], health_policy=ENTRY_POLICY)
        self.save()
        return h
