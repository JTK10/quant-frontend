import math
PC = lambda a,b: 100*(a/b-1) if b and a is not None else float("nan")
def compute_cash_features(bs, prior):
    if len(bs) < 3 or any((b['v'] is None or b['v'] < 0 for b in bs)):
        return None
    vol = sum((b['v'] for b in bs))
    if vol <= 0:
        return None
    p = bs[-1]['c']
    o = bs[0]['o']
    h = max((b['h'] for b in bs))
    l = min((b['l'] for b in bs))
    vw = sum(((b['h'] + b['l'] + b['c']) / 3 * b['v'] for b in bs)) / vol
    span = bs[-1]['h'] - bs[-1]['l']
    opening_range = bs[0]['h'] - bs[0]['l']
    pv = sum((b['v'] or 0 for b in prior[:len(bs)])) if prior else 0
    old3 = bs[-4:-1]
    prevvol = bs[-2]['v']
    return dict(price=p, opening=o, from_open_pct=PC(p, o), gap_pct=PC(o, prior[-1]['c']) if prior else math.nan, vwap_distance_pct=PC(p, vw), momentum_last5_pct=PC(p, bs[-2]['c']), momentum_last10_pct=PC(p, bs[-3]['c']), relative_morning_volume=vol / pv if pv > 0 and len(prior) >= len(bs) else math.nan, cash_volume_acceleration=bs[-1]['v'] / prevvol if prevvol > 0 else math.nan, opening_range_pct=100 * opening_range / o if o else 0, opening_body_fraction=(bs[0]['c'] - o) / opening_range if opening_range else 0, opening_rebound_fraction=(max((b['h'] for b in bs[1:-1])) - bs[0]['l']) / opening_range if opening_range and len(bs) > 2 else 0, last_body_fraction=(p - bs[-1]['o']) / span if span else 0, morning_range_pct=PC(h, l), location_in_morning_range=(p - l) / (h - l) if h > l else 0.5, coil_before_release_ratio=(max((b['h'] for b in old3)) - min((b['l'] for b in old3))) / opening_range if opening_range and len(old3) == 3 else math.nan, breaks_prior3_high=int(p > max((b['h'] for b in old3))) if len(old3) == 3 else 0, breaks_prior3_low=int(p < min((b['l'] for b in old3))) if len(old3) == 3 else 0, above_opening_high=int(p > bs[0]['h']), below_opening_low=int(p < bs[0]['l']), morning_volume_log=math.log1p(vol), efficiency=abs(p - o) / sum((b['h'] - b['l'] for b in bs)) if sum((b['h'] - b['l'] for b in bs)) > 0 else 0, vwap=vw, high=h, low=l)
