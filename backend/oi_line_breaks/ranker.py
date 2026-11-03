"""Causal five-minute ranking of broken exact-strike OI lines.

The line's R1/R2/S1/S2 label is deliberately ignored. Rank is determined
before the target session: (days with a defended line and fresh OI, defended
days, fresh OI added on those days / latest four-line OI). CE lines must break
upward; PE lines must break downward. A first completed 5m crossing starts the
signal. Once triggered, the line remains on the board for the rest of the day.
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta

NEAR_PCT = 0.5


def cut_after(hm):
    return (datetime.strptime(hm, "%H:%M") + timedelta(minutes=5)).strftime("%H:%M")


def build_candidates(state, cash, target_day):
    source_days = sorted((d for d in state["sessions"] if d < target_day), reverse=True)[:3]
    universe = {}
    for day in source_days:
        for sym, snapshot in state["sessions"][day].items():
            if snapshot[2] < target_day:
                continue
            for leg, group in (("PE", snapshot[3]), ("CE", snapshot[4])):
                for strike, oi, delta in group:
                    key = (sym, leg, snapshot[2], float(strike))
                    universe.setdefault(key, []).append((day, int(oi), int(delta) if delta is not None else None))
    candidates = []
    for (sym, leg, expiry, strike), observations in universe.items():
        obs = {day: (oi, delta) for day, oi, delta in observations}
        latest_snapshot = state["sessions"][source_days[0]].get(sym)
        # Full-strike replays retain the original four displayed lines as the
        # stock-scale denominator, even when more strikes are candidates.
        latest_four = (int(latest_snapshot[5]) if latest_snapshot and len(latest_snapshot) > 5
                       else sum(int(w[1]) for group in latest_snapshot[3:5] for w in group)
                       if latest_snapshot else 0)
        if not latest_four:
            continue
        respected = []
        trapped = []
        fresh_added = 0
        details = []
        for day in reversed(source_days):
            session = state["sessions"][day].get(sym)
            bars = cash.get((day, sym), [])
            if not session or not bars:
                continue
            close_spot = float(session[1])  # saved chart close, later than the cash high/low extract
            high = max(float(b["h"]) for b in bars)
            low = min(float(b["l"]) for b in bars)
            near = high >= strike * (1 - NEAR_PCT / 100) if leg == "CE" else low <= strike * (1 + NEAR_PCT / 100)
            finish_on_unbroken_side = close_spot < strike if leg == "CE" else close_spot > strike
            defended = near and finish_on_unbroken_side
            oi, delta = obs.get(day, (None, None))
            built = bool(defended and delta is not None and delta > 0)
            if defended:
                respected.append(day)
            if built:
                trapped.append(day)
                fresh_added += delta
            details.append(f"{day}:near={int(near)},defended={int(defended)},"
                           f"spot={close_spot:g},OI={oi if oi is not None else '-'},"
                           f"dOI={delta if delta is not None else '-'}")
        present = sorted(obs)
        prior_oi_first = obs[present[0]][0]
        prior_oi_last = obs[present[-1]][0]
        candidates.append({
            "symbol": sym, "direction": "BULL" if leg == "CE" else "BEAR",
            "leg": leg, "strike": strike, "expiry": expiry,
            "prior_source_days": ";".join(source_days),
            "line_observed_days": len(obs), "line_observed_dates": ";".join(present),
            "respected_days": len(respected), "respected_dates": ";".join(respected),
            "trapped_buildup_days": len(trapped), "trapped_buildup_dates": ";".join(trapped),
            "fresh_oi_on_respected_days": fresh_added,
            "fresh_oi_share_pct": 100 * fresh_added / latest_four,
            "first_observed_oi": prior_oi_first, "last_observed_oi": prior_oi_last,
            "observed_net_oi_change": prior_oi_last - prior_oi_first,
            "retained_oi_build": len(obs) >= 2 and prior_oi_last > prior_oi_first,
            "qualified_two_days": len(trapped) >= 2 and len(obs) >= 2 and prior_oi_last > prior_oi_first,
            "latest_four_line_oi": latest_four,
            "price_tolerance_pct": NEAR_PCT,
            "prior_day_evidence": " | ".join(details),
        })
    return candidates


def score(line):
    return (line["qualified_two_days"], line["trapped_buildup_days"], line["respected_days"],
            line["fresh_oi_share_pct"], line["observed_net_oi_change"] / line["latest_four_line_oi"])


def first_breaks(lines, state):
    by_symbol = defaultdict(list)
    for line in lines:
        by_symbol[line["symbol"]].append(line)
    for sym, sym_lines in by_symbol.items():
        bars = state["bars"].get(sym, {})
        before = None
        for hm in sorted(bars):
            op, close = map(float, bars[hm])
            baseline = op if before is None else before
            cut = cut_after(hm)
            for line in sym_lines:
                if line.get("break_cut"):
                    continue
                strike = line["strike"]
                if (baseline <= strike < close) if line["leg"] == "CE" else (baseline >= strike > close):
                    line["break_cut"] = cut
                    line["break_close"] = close
            before = close
    return sorted({line["break_cut"] for line in lines if line.get("break_cut")})


def cumulative_board(lines, cuts, state, rank_mode="oi"):
    assert rank_mode in {"oi", "movement"}
    board = []
    leaders = []
    close_by_cut = {(sym, cut_after(hm)): float(values[1])
                    for sym, sym_bars in state["bars"].items() for hm, values in sym_bars.items()}

    def move_at(line, cut):
        now = close_by_cut.get((line["symbol"], cut))
        if now is None:
            return None
        sign = 1 if line["direction"] == "BULL" else -1
        return sign * (now / line["break_close"] - 1) * 100

    for cut in cuts:
        active = defaultdict(list)
        for line in lines:
            if line.get("break_cut") and line["break_cut"] <= cut:
                active[line["symbol"]].append(line)
        if rank_mode == "movement":
            selected = [max(items, key=lambda x: (float("-inf") if move_at(x, cut) is None
                                                       else move_at(x, cut),
                                                       score(x), -int(x["break_cut"].replace(":", ""))))
                        for items in active.values()]
            selected.sort(key=lambda x: (-(float("-inf") if move_at(x, cut) is None
                                           else move_at(x, cut)),
                                         -int(x["qualified_two_days"]),
                                         -x["trapped_buildup_days"], -x["respected_days"],
                                         -x["fresh_oi_share_pct"], x["break_cut"], x["symbol"]))
        else:
            selected = [max(items, key=lambda x: (score(x), -int(x["break_cut"].replace(":", ""))))
                        for items in active.values()]
            selected.sort(key=lambda x: (-int(x["qualified_two_days"]),
                                         -x["trapped_buildup_days"], -x["respected_days"],
                                         -x["fresh_oi_share_pct"],
                                         -x["observed_net_oi_change"] / x["latest_four_line_oi"],
                                         x["break_cut"], x["symbol"]))
        side_rank = Counter()
        for rank, line in enumerate(selected, 1):
            side_rank[line["direction"]] += 1
            now = close_by_cut.get((line["symbol"], cut))
            movement = move_at(line, cut)
            board.append({
                "cut": cut, "rank": rank, "direction_rank": side_rank[line["direction"]],
                "symbol": line["symbol"],
                "direction": line["direction"], "strike": line["strike"],
                "leg": line["leg"], "break_cut": line["break_cut"],
                "break_close": line["break_close"], "current_close": now,
                "directional_move_since_break_pct": round(movement, 3)
                    if movement is not None else None,
                "respected_days": line["respected_days"],
                "respected_dates": line["respected_dates"],
                "trapped_buildup_days": line["trapped_buildup_days"],
                "trapped_buildup_dates": line["trapped_buildup_dates"],
                "fresh_oi_on_respected_days": line["fresh_oi_on_respected_days"],
                "fresh_oi_share_pct": round(line["fresh_oi_share_pct"], 3),
                "observed_net_oi_change": line["observed_net_oi_change"],
                "line_observed_days": line["line_observed_days"],
                "retained_oi_build": line["retained_oi_build"],
                "qualified_two_days": line["qualified_two_days"],
            })
        leaders.append({"cut": cut, "active_stocks": len(selected),
                        "leader": selected[0]["symbol"] if selected else "",
                        "leader_strike": selected[0]["strike"] if selected else "",
                        "leader_break_cut": selected[0]["break_cut"] if selected else "",
                        "leader_trapped_buildup_days": selected[0]["trapped_buildup_days"] if selected else "",
                        "leader_respected_days": selected[0]["respected_days"] if selected else "",
                        "leader_fresh_oi_share_pct": round(selected[0]["fresh_oi_share_pct"], 3) if selected else ""})
    return board, leaders


