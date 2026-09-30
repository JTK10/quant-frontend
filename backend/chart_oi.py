"""Compact strike OI snapshots, independent of scanner classifications.

Each symbol: [symbol, spot, expiry, PE support walls, CE resistance walls].
Each wall: [strike, total OI, OI minus provider previous-session OI].
"""
import json
import math
import time
from collections import defaultdict


def build_levels(chain_rows):
    groups = defaultdict(list)
    for row in chain_rows:
        groups[(str(row[1]), str(row[2]))].append(row)
    result = []
    # Never combine contracts across expiries.
    front = {}
    for (symbol, expiry), rows in sorted(groups.items()):
        if symbol in front:
            continue
        valid = [float(r[5]) for r in rows if r[5] and math.isfinite(float(r[5])) and float(r[5]) > 0]
        if not valid:
            continue
        spot = sorted(valid)[len(valid) // 2]
        front[symbol] = expiry
        walls = {}
        for leg in ("PE", "CE"):
            candidates = {}
            for r in rows:
                strike, oi = float(r[3]), int(r[8] or 0)
                if str(r[4]) != leg or oi <= 0 or not math.isfinite(strike):
                    continue
                if (leg == "PE" and not 0.94 * spot <= strike <= spot) or (leg == "CE" and not spot <= strike <= 1.06 * spot):
                    continue
                candidates[strike] = [strike, oi, oi - int(r[9]) if r[9] is not None else None]
            walls[leg] = sorted(candidates.values(), key=lambda w: (-w[1], abs(w[0] - spot), w[0]))[:2]
        result.append([symbol, round(spot, 2), expiry, walls["PE"], walls["CE"]])
    return result


async def publish_chart_oi(client, cut_ts, chain_rows, degraded, cfg, get_token):
    """All failures stay in this optional publisher; caller also bounds its time."""
    if not cfg:
        return False
    doc = {"source": "chart_oi", "cap": "CHART_OI", "name": "", "side": "NEUTRAL",
           "ts": time.time(), "time": cut_ts.strftime("%H:%M:00"),
           "cut": cut_ts.strftime("%H:%M"), "sig_date": cut_ts.strftime("%Y%m%d"),
           "date": cut_ts.strftime("%Y-%m-%d"), "degraded": bool(degraded),
           "oi_levels": build_levels(chain_rows)}
    token = await get_token(client, cfg)
    documents = [doc]
    if doc["cut"] == "15:25":
        documents.append({**doc, "source": "chart_oi_close", "cap": "CHART_OI_CLOSE"})
    for payload in documents:
        response = await client.post(cfg["base"] + cfg["path"],
                                     content=json.dumps(payload, allow_nan=False),
                                     headers={"Authorization": "Bearer " + token,
                                              "Content-Type": "application/json"}, timeout=8)
        response.raise_for_status()
    return True
