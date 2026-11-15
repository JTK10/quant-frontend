"""Stateful Osprey rankings from completed, existing Pallas captures."""
from bisect import bisect_right
from collections import Counter, defaultdict
from math import isfinite

OPEN = 9 * 60 + 15
CLOSE = 15 * 60 + 25
MIN_ROUTE_RANK = 75
WATCH_RANK = 90
MIN_PEERS = 10
MAX_AGE = 30
HALF_LIFE = 15

ALIASES = {"ICICIPRULI": "ICICILIFE", "PIRAMALPHARMA": "PPLPHARMA"}
BULL_TYPES = {"CE_DOWN_PE_UP", "PE_OI_BUILD", "CE_OI_SHARP_DROP", "CE_OI_SURGE", "PE_OI_DECLINE"}
BEAR_TYPES = {"CE_UP_PE_DOWN", "CE_OI_BUILD", "PE_OI_SHARP_DROP", "BOTH_LEGS_OI_WEAK", "CE_OI_DECLINE"}
NEUTRAL = {"NEUTRAL", "DUAL_OI_BUILD_CHOP"}
PATTERNS = {
    ("CE", True, True): ("CE_BUILD", "BULL"),
    ("CE", True, False): ("CE_BUILD", "BEAR"),
    ("CE", False, True): ("CE_UNWIND", "BULL"),
    ("PE", True, True): ("PE_BUILD", "BEAR"),
    ("PE", True, False): ("PE_BUILD", "BULL"),
    ("PE", False, True): ("PE_UNWIND", "BEAR"),
}


def finite(value, minimum=0):
    return isinstance(value, (int, float)) and isfinite(value) and value >= minimum


def minute(value):
    if isinstance(value, str) and len(value) >= 5 and value[2] == ":":
        try:
            hour, minutes = int(value[:2]), int(value[3:5])
        except ValueError:
            return None
        if 0 <= hour < 24 and 0 <= minutes < 60:
            return hour * 60 + minutes
    return None


def clock(value):
    return "" if value is None else f"{value // 60:02d}:{value % 60:02d}"


def score(values):
    ranked = sorted(values, reverse=True)
    return round(ranked[0] + .2 * sum(ranked[1:]), 2)


def sign(route):
    return 1 if route.endswith("_BUILD") else -1


def flow_groups(current, baseline, spots):
    """Exactly the offline three-strike, +/-3% cohort and peer percentile."""
    rows = defaultdict(list)
    peers = defaultdict(list)
    for contract, (oi, premium) in current.items():
        if contract not in baseline:
            continue
        symbol, leg, strike, _ = contract
        previous, previous_premium = baseline[contract]
        spot = spots.get(symbol)
        if not spot or abs(strike / spot - 1) > .03 or previous <= 0 or oi == previous:
            continue
        if premium <= 0 or previous_premium <= 0 or premium == previous_premium:
            continue
        signal = PATTERNS.get((leg, oi > previous, premium > previous_premium))
        if signal:
            route, side = signal
            rows[symbol, side, route].append((contract, oi - previous, previous))

    rollups = {}
    for (symbol, side, route), contracts in rows.items():
        selected = sorted(contracts, key=lambda row: (-abs(row[1]), row[0][2]))[:3]
        pct = round(100 * sum(abs(entry[1]) for entry in selected) / sum(entry[2] for entry in selected), 3)
        rollups[symbol, side, route] = pct, selected
        peers[side, route].append(pct)
    for values in peers.values():
        values.sort()
    groups = defaultdict(dict)
    for (symbol, side, route), (pct, selected) in rollups.items():
        values = peers[side, route]
        rank = round(100 * bisect_right(values, pct) / len(values), 1)
        groups[symbol, side][route] = dict(pct=pct, rank=rank, count=len(values), strikes=selected)
    return groups


class Engine:
    def __init__(self, sector_map=None, rvol_lookup=None):
        self.sectors = sector_map or {}
        self.rvol_lookup = rvol_lookup
        self.day = None
        self.last_cut = None
        self.open_cut = None
        self.opens = {}
        self.history = {}
        self.states = {}

    def _recent(self, row, routes, current, cut):
        for window in (5, 15):
            baseline = self.history.get(cut - window, {})
            choices = []
            for route, contracts in routes.items():
                previous = now = 0
                for contract in contracts:
                    old = baseline.get(contract)
                    if old is not None and old[0] > 0 and contract in current:
                        previous += old[0]
                        now += current[contract][0]
                if previous:
                    choices.append((100 * sign(route) * (now - previous) / previous, route))
            if choices:
                value, route = max(choices)
                row[f"oi_{window}m"] = round(value, 2)
                row[f"oi_{window}m_route"] = route

    def _track(self, events, current, spots, grid, candles, cut):
        snapshots = []
        for key, state in list(self.states.items()):
            symbol, side = key
            close = candles.get(symbol, {}).get("close")
            if state["confirmed"] is not None and finite(close) and not self._beyond(state["level"], close, side):
                del self.states[key]
                continue
            for route, record in list(state["routes"].items()):
                active = self._active(record["anchors"], current, route)
                if not active or cut - record["time"] > MAX_AGE:
                    del state["routes"][route]
                else:
                    record["active"] = active
            if not state["routes"]:
                del self.states[key]

        for (symbol, side), all_routes in events.items():
            routes = {r: e for r, e in all_routes.items() if e["count"] >= MIN_PEERS and e["rank"] >= MIN_ROUTE_RANK}
            if not routes:
                continue
            qualifies = any(event["rank"] >= WATCH_RANK for event in routes.values())
            if qualifies:
                row = dict(symbol=symbol, side=side, score=score(r["rank"] for r in routes.values()))
                self._recent(row, {r: [entry[0] for entry in e["strikes"]] for r,e in routes.items()}, current, cut)
                snapshots.append(row)
            key = symbol, side
            if key not in self.states:
                if not qualifies:
                    continue
                price = spots.get(symbol)
                north = side == "BULL"
                strikes = [strike for strike in grid[symbol] if price and (strike > price if north else strike < price)]
                level = (min(strikes) if north else max(strikes)) if strikes else None
                self.states[key] = dict(first=cut, confirmed=None, level=level, routes={})

            state = self.states[key]
            for route, event in routes.items():
                old = state["routes"].get(route, {}).get("anchors", {})
                anchors = {}
                for contract, _, previous in event["strikes"]:
                    anchor = old.get(contract, previous)
                    anchors[contract] = anchor if sign(route) * (current[contract][0] - anchor) > 0 else previous
                for contract, anchor in old.items():
                    if contract in current and sign(route) * (current[contract][0] - anchor) > 0:
                        anchors.setdefault(contract, anchor)
                state["routes"][route] = dict(rank=event["rank"], time=cut, anchors=anchors,
                                              active=self._active(anchors, current, route))

        tracked = {}
        for (symbol, side), state in self.states.items():
            if state["confirmed"] is None and cut > state["first"]:
                close = candles.get(symbol, {}).get("close")
                if self._beyond(state["level"], close, side):
                    state["confirmed"] = cut
            routes = state["routes"]
            evidence = " | ".join(f"{route} {clock(record['time'])}: " + ", ".join(
                f"{contract[2]:g} ({change:+,})" for contract, change in record["active"])
                for route, record in sorted(routes.items()))
            row = dict(symbol=symbol, side=side, first=clock(state["first"]),
                       last=clock(max(r["time"] for r in routes.values())), confirmed=clock(state["confirmed"]),
                       state="Confirmed" if state["confirmed"] is not None else "Watch", level=state["level"],
                       evidence=evidence,
                       score=score(r["rank"] * 2 ** (-(cut - r["time"]) / HALF_LIFE) for r in routes.values()))
            self._recent(row, {r: [entry[0] for entry in e["active"]] for r, e in routes.items()}, current, cut)
            tracked[symbol, side] = row
        return tracked, snapshots

    @staticmethod
    def _beyond(level, close, side):
        return level is not None and finite(close) and (close >= level if side == "BULL" else close <= level)

    @staticmethod
    def _active(anchors, current, route):
        active = [(contract, current[contract][0] - anchor) for contract,anchor in anchors.items() if contract in current]
        return sorted((item for item in active if sign(route) * item[1] > 0),
                      key=lambda item: (-abs(item[1]), item[0][2]))[:3]

    def _opening(self, events, current, cut, tracked, spots):
        activity, shortlisted = [], []
        represented = set()
        for (symbol, side), routes in events.items():
            represented.add(symbol)
            strong = [r["rank"] for r in routes.values() if r["rank"] >= MIN_ROUTE_RANK and r["count"] >= MIN_PEERS]
            rscore = score(strong or [r["rank"] for r in routes.values()])
            details = []
            strengthening = 0
            for route, r in sorted(routes.items(), key=lambda item: -item[1]["rank"]):
                strike_details = []
                for contract, change, _ in r["strikes"]:
                    comparisons = []
                    for window in (5, 10, 15):
                        prior = self.history.get(cut - window, {}).get(contract)
                        delta = current[contract][0] - prior[0] if prior is not None else None
                        if window == 5 and delta is not None and delta * sign(route) > 0:
                            strengthening += 1
                        comparisons.append(f"{window}m {delta:+,}" if delta is not None else f"{window}m n/a")
                    strike_details.append(f"{contract[2]:g} (open {change:+,} | " + " | ".join(comparisons) + ")")
                details.append(f"{route} {r['pct']:.2f}% since open: " + ", ".join(strike_details))
            row = dict(tracked.get((symbol, side), dict(symbol=symbol, side=side, state="Watch")))
            row.update(score=rscore, strengthening=strengthening, evidence=" | ".join(details))
            for window in (5, 15):
                row.pop(f"oi_{window}m", None)
                row.pop(f"oi_{window}m_route", None)
            self._recent(row, {route: [entry[0] for entry in record["strikes"]] for route, record in routes.items()}, current, cut)
            activity.append(row)
            if any(r["rank"] >= WATCH_RANK and r["count"] >= MIN_PEERS for r in routes.values()):
                shortlisted.append(row)
        activity.extend(dict(symbol=symbol, side="—", score=0, state="No classified flow")
                        for symbol in sorted(set(spots) - represented))
        return activity, shortlisted

    def _context(self, doc, rows, rust, candles, cut):
        if rust is not None:
            rust = rust.get("rusty", rust)
        directions = defaultdict(set)
        if (rust and (rust.get("date") or rust.get("sig_date")) == doc["date"]
                and minute(rust.get("cut") or rust.get("time")) == cut):
            for board, labels, value in (("bull", BULL_TYPES, 1), ("bear", BEAR_TYPES, -1)):
                for row in rust.get(board, []):
                    symbol = row.get("s")
                    flow_type = row.get("flow_type")
                    if symbol and row.get("ce_pct") is not None and row.get("pe_pct") is not None:
                        if flow_type in labels or flow_type in NEUTRAL:
                            directions[ALIASES.get(symbol, symbol)].add(value if flow_type in labels else 0)
        votes = {symbol: values.pop() for symbol, values in directions.items() if len(values) == 1}
        source = "Rusty OI"
        if not votes:
            source = "Osprey OI"
            scores = defaultdict(dict)
            for row in rows["All chain activity"]:
                if row["side"] in ("BULL", "BEAR"):
                    symbol = ALIASES.get(row["symbol"], row["symbol"])
                    scores[symbol][row["side"]] = row["score"]
            for symbol, values in scores.items():
                bull, bear = values.get("BULL", 0), values.get("BEAR", 0)
                votes[symbol] = (bull > bear) - (bear > bull)
        counts, net = Counter(), Counter()
        for symbol, direction in votes.items():
            sector = self.sectors.get(symbol)
            if sector:
                counts[sector] += 1
                net[sector] += direction
        context = {}
        for board in rows.values():
            for row in board:
                symbol = row["symbol"]
                if symbol not in context:
                    sector = self.sectors.get(ALIASES.get(symbol, symbol))
                    candle = candles.get(symbol, {})
                    sector_samples = counts[sector]
                    strength = round(100 * net[sector] / sector_samples, 2) if sector_samples else None
                    opened, close = self.opens.get(symbol), candle.get("close")
                    move = round(100 * (close / opened - 1), 2) if opened and finite(close, .00001) else None
                    rvol, samples = None, 0
                    volume = candle.get("volume")
                    if self.rvol_lookup and finite(volume):
                        rvol, samples = self.rvol_lookup(doc["date"], symbol, clock(cut - 5), volume)
                    context[symbol] = dict(sector=sector, sector_strength=strength, sector_samples=sector_samples,
                                           sector_source=source if sector_samples else None, rvol=rvol,
                                           rvol_sessions=samples, move_pct=move)
                row.update(context[symbol])

    def process(self, doc, rusty_doc=None):
        day = doc.get("date")
        cut = minute(doc.get("cut"))
        expiry = doc.get("expiry")
        chains = doc.get("chains")
        if (not isinstance(day, str) or not isinstance(expiry, str) or expiry < day or not chains
                or cut is None or not OPEN <= cut <= CLOSE or (cut - OPEN) % 5 or doc.get("degraded")
                or self.day is not None and (day < self.day or day == self.day and cut <= self.last_cut)):
            return None
        current, spots, grid = {}, {}, defaultdict(set)
        for symbol, contracts in chains.items():
            price = doc.get("baselines", {}).get(symbol, {}).get("spot")
            if finite(price, .00001):
                spots[symbol] = price
            for contract in contracts:
                if len(contract) < 4:
                    continue
                strike, leg, premium, oi = contract[:4]
                if leg not in ("CE", "PE") or not finite(strike, .00001) or not finite(oi):
                    continue
                key = symbol, leg, strike, expiry
                if key in current:
                    return None
                current[key] = (int(oi), premium if finite(premium) else 0)
                grid[symbol].add(strike)
        if not current:
            return None
        if self.day != day:
            self.day, self.open_cut, self.history, self.states, self.opens = day, cut, {}, {}, {}
        self.last_cut = cut
        self.history[cut] = current
        self.history = {t: snapshot for t,snapshot in self.history.items() if t >= cut - 15 or t == self.open_cut}
        candles = {symbol: candle for symbol, candle in doc.get("candles", {}).items()
                   if minute(candle.get("time")) == cut - 5}
        for symbol, candle in candles.items():
            if cut - 5 == OPEN and finite(candle.get("open"), .00001):
                self.opens[symbol] = candle["open"]
        trailing = self.history.get(max(self.open_cut, cut - 15), {})
        tracked, snapshots = self._track(flow_groups(current, trailing, spots), current, spots, grid, candles, cut)
        activity, since_open = self._opening(flow_groups(current, self.history[self.open_cut], spots), current, cut, tracked, spots)
        rows = {"All chain activity": activity, "Since open": since_open, "Tracked": list(tracked.values()), "Same cut": snapshots}
        self._context(doc, rows, rusty_doc, candles, cut)
        return rows
