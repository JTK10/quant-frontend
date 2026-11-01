"""Aurum v1.1 extended-window gates and cash/chain features. Stdlib only.

No outcome, option-return or whole-day rank enters eligibility. Prices are
completed-candle references, not fills. The locked research directory is read
only; this module is a separately deployable implementation of its rules.
"""
import math

ENGINE = 'aurum-v1.1'
BAR_START_FIRST = '09:30'
BAR_START_LAST = '11:25'
SIGNAL_FIRST = '09:35'
SIGNAL_LAST = '11:30'
INPUT_FIRST = '09:20'
STREAM_END = '11:35'
SIGNAL_CUTS = tuple(f'{m//60:02}:{m%60:02}' for m in range(575, 691, 5))
MORNING = tuple(f'{m//60:02}:{m%60:02}' for m in range(555, 686, 5))


def number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def rounded(value, digits):
    """Match NumPy/Pandas baseline scaled bankers rounding without importing it."""
    scale = 10**digits
    return round(value*scale)/scale


def gate(f):
    """Evaluate saved feature semantics, preserving baseline rounding."""
    required = ('nifty_from_open', 'hist_adr_pct', 'prior_day_chg', 'oi_dom_contemp',
                'rvol_5m', 'rvol_cum', 'prior_max_close', 'prior_min_close', 'Close',
                'mv', 'dir_c_mv', 'c_body', 'adverse_wick_pct', 'vwap_dist_pct')
    if any(not number(f.get(k)) for k in required):
        return False
    bull = f.get('direction') == 'BULL'
    return bool(
        BAR_START_FIRST <= f.get('time_ist', '') <= BAR_START_LAST
        and f.get('brk_or15') and f.get('brk_pd') and f.get('vwap_aligned')
        and (f['Close'] > f['prior_max_close'] if bull else f['Close'] < f['prior_min_close'])
        and f['vwap_dist_pct'] <= 1.25
        and not (not bull and f['prior_day_chg'] <= -3 and f['mv'] <= -2.5)
        and (f['nifty_from_open'] >= -.15 if bull else f['nifty_from_open'] <= -.05)
        and f['hist_adr_pct'] >= 2.3 and .2 <= f['dir_c_mv'] <= .85
        and f['c_body'] >= 50 and f['adverse_wick_pct'] <= 30
        and f['rvol_5m'] >= 2 and f['rvol_cum'] >= 1.5
        and f['oi_dom_contemp'] >= (-.30 if f.get('wall_breached') else -.05))


def compact_history(days, observations=21):
    """Keep40 daily summaries and latest21 observed rows for each eligible slot.

    Twenty rows support live RVOL; the extra observation preserves20 earlier
    samples when an isolated benchmark replays the seed's final historical day.
    Daily OHLC/complete flags remain available even when their old bars are empty.
    """
    days[:] = sorted(days, key=lambda d:d['date'])[-40:]
    counts = {}
    for day in reversed(days):
        kept = []
        for bar in day['bars']:
            hm = bar[0]
            if BAR_START_FIRST <= hm <= BAR_START_LAST and counts.get(hm, 0) < observations:
                kept.append(bar)
                counts[hm] = counts.get(hm, 0)+1
        day['bars'] = kept
    return days


def cash_features(bars, history, nifty):
    """One chronological completed-bar prefix plus earlier per-symbol history.

    history: list of {date, bars:[[hm, volume, cumulative_volume],...],
      high,low,close,complete}. Last20 observed rows per slot, excluding today,
    follow the frozen evaluated RVOL definition. Daily baseline uses the latest
    earlier session. ADR uses last5 complete sessions, never a partial day.
    """
    if not bars or len(bars) < 4:
        raise ValueError('Incomplete opening sequence')
    hm = bars[-1]['hm']
    expected = [f'{m//60:02}:{m%60:02}' for m in range(555, int(hm[:2])*60+int(hm[3:])+1, 5)]
    if [b['hm'] for b in bars] != expected:
        raise ValueError('Missing or duplicate completed cash bar')
    if not history or len(history) < 2:
        raise ValueError('Previous cash sessions unavailable')
    prior, preprior = history[-1], history[-2]
    if not prior.get('complete') or not preprior.get('complete'):
        raise ValueError('Previous full-session cash context unavailable')
    recent = history[-5:]
    if len(recent) != 5 or not all(x.get('complete') for x in recent):
        raise ValueError('Five complete ADR sessions unavailable')
    if not nifty or not number(nifty.get('open')) or not number(nifty.get('close')) or nifty['open'] <= 0:
        raise ValueError('Nifty same-cut reference unavailable')
    current, past = bars[-1], bars[:-1]
    o, h, l, c = (current[k] for k in ('o', 'h', 'l', 'c'))
    rng = h-l
    if rng <= 0 or prior['close'] <= 0 or preprior['close'] <= 0:
        raise ValueError('Invalid cash range or baseline')
    cv = sum(b['v'] for b in bars)
    if cv <= 0:
        raise ValueError('Zero cumulative volume')
    vwap = rounded(sum((b['h']+b['l']+b['c'])/3*b['v'] for b in bars)/cv, 2)
    slots = []
    for day in history:
        slot = next((b for b in day['bars'] if b[0] == hm), None)
        if slot is not None:
            slots.append(slot)
    slots = slots[-20:]
    if len(slots) < 5 or sum(b[1] for b in slots) <= 0 or sum(b[2] for b in slots) <= 0:
        raise ValueError('Insufficient previous20 same-slot volume')
    mv = rounded((c-prior['close'])/prior['close']*100, 2)
    bull = mv >= 0
    c_mv = rounded((c-o)/o*100, 2)
    opposite = [b for b in past if (b['c'] < b['o'] if bull else b['c'] > b['o'])]
    boundary = opposite[-1]['h' if bull else 'l'] if opposite else None
    return dict(time_ist=hm, direction='BULL' if bull else 'BEAR', Close=c, mv=mv,
        dir_c_mv=c_mv if bull else -c_mv, c_body=rounded(abs(c-o)/rng*100, 1),
        adverse_wick_pct=rounded((h-c if bull else c-l)/rng*100, 1),
        vwap=vwap, vwap_aligned=c > vwap if bull else c < vwap,
        vwap_dist_pct=rounded(abs(c-vwap)/vwap*100, 2),
        brk_or15=c > max(b['h'] for b in bars[:3]) if bull else c < min(b['l'] for b in bars[:3]),
        brk_pd=c > prior['high'] if bull else c < prior['low'],
        pdh=prior['high'], pdl=prior['low'], day_open=bars[0]['o'],
        prior_day_chg=100*(prior['close']/preprior['close']-1),
        prior_max_close=max(b['c'] for b in past), prior_min_close=min(b['c'] for b in past),
        hist_adr_pct=sum((d['high']-d['low'])/d['close']*100 for d in recent)/5,
        nifty_from_open=100*(nifty['close']/nifty['open']-1),
        rvol_5m=rounded(current['v']/(sum(b[1] for b in slots)/len(slots)), 2),
        rvol_cum=rounded(cv/(sum(b[2] for b in slots)/len(slots)), 2),
        rvol_history_samples=len(slots), pullback_confirmed=bool(opposite and (c > boundary if bull else c < boundary)))


def chain_features(rows, session_open, close, side):
    """Ocelot export rows [strike,leg,ltp,oi,prev_oi,volume]."""
    near = []
    for row in rows:
        if len(row) < 4 or not number(row[0]) or not number(row[3]) or row[3] < 0:
            continue
        rel = (row[0]-session_open)/session_open
        if abs(rel) <= .06 and row[1] in ('CE', 'PE'):
            near.append((row[0], row[1], row[3], rel))
    totals = {leg: sum(r[2] for r in near if r[1] == leg) for leg in ('CE', 'PE')}
    if any(not any(r[1] == leg for r in near) for leg in ('CE', 'PE')):
        raise ValueError('Both chain legs unavailable')
    calls = [r for r in near if r[1] == 'CE' and -.01 <= r[3] <= .05]
    puts = [r for r in near if r[1] == 'PE' and -.05 <= r[3] <= .01]
    # The frozen data has no wall-OI ties among selected rows. Stable source
    # order is retained on ties, rather than inventing a future preference.
    cw = max(calls, key=lambda r:r[2])[0] if calls else None
    pw = max(puts, key=lambda r:r[2])[0] if puts else None
    bull = side == 'BULL'
    dom, opp = (totals['PE'], totals['CE']) if bull else (totals['CE'], totals['PE'])
    return dict(oi_dom_contemp=rounded((dom-opp)/(dom+opp+1), 2),
                ce_wall_strike=cw, pe_wall_strike=pw,
                wall_breached=bool(cw is not None and close >= cw) if bull else bool(pw is not None and close <= pw))


def evaluate(bars, history, rows, nifty):
    f = cash_features(bars, history, nifty)
    f.update(chain_features(rows, f['day_open'], f['Close'], f['direction']))
    return gate(f), f
