"""Causal Phoenix bull and bear gates using existing cash/option captures."""
from viper_engine import Engine, minute, clock, number, positive

SLOTS = [clock(t) for t in range(555, 930, 5)]
IGNITIONS = {"STRICT IGNITION", "BRIDGE IGNITION", "PAIN IGNITION"}


def quote_map(contracts, leg):
    return {str(float(strike)): [oi, premium] for strike, option_leg, premium, oi, _, _ in contracts
            if option_leg == leg and positive(strike) and number(oi) and oi >= 0}


def cross_leg(current, previous, anchor, close, bear=False):
    if not current:
        return None, None
    key = min(current, key=lambda k: (abs(float(k) - anchor), float(k)))
    now, old = current[key], previous.get(key)
    if bear and abs(float(key) / close - 1) > .015:
        return None, False
    if not old or not positive(old[0]) or not positive(old[1]) or not positive(now[1]):
        return None, None
    delta = 100 * (now[0] / old[0] - 1)
    premium = 100 * (now[1] / old[1] - 1)
    return delta, delta > 3 and premium <= 0


class SignalEngine:
    def __init__(self, day, baseline_doc=None, state=None, prior_cash=None):
        self.day = day
        if state is not None:
            self.state = state
            self.viper = Engine(day, state=state["viper"])
            return
        if prior_cash["date"] != baseline_doc["date"]:
            raise ValueError("Cash and chain baseline differ")
        self.viper = Engine(day, baseline_doc)
        seed, levels = {}, {}
        for symbol, bars in prior_cash["bars"].items():
            daily = prior_cash.get('daily',{}).get(symbol)
            full = len(bars) == 75
            has_daily = (isinstance(daily,list) and len(daily)==2
                         and all(positive(v) for v in daily) and daily[0]>=daily[1])
            if ((full or has_daily) and bars and [b[0] for b in bars] == SLOTS[:len(bars)]
                    and all(all(number(v) for v in b[1:]) and min(b[1:5]) > 0 and b[5] >= 0 for b in bars)):
                seed[symbol] = bars
                levels[symbol] = daily if has_daily else [max(b[2] for b in bars),min(b[3] for b in bars)]
        if not seed:
            raise ValueError("No complete prior cash session")
        self.state = dict(baseline=baseline_doc["date"], last=None, viper=self.viper.state,
                          prior=seed, levels=levels, cash={}, chains={}, trackers={}, emitted=[], first=[])

    def cash_features(self, symbol, cut, bear):
        prior = self.state["prior"].get(symbol)
        bars = self.state["cash"].get(symbol, [])
        expected = SLOTS[:max(0, (minute(cut) - 555) // 5)]
        if not prior or not bars or [b[0] for b in bars] != expected:
            return None
        volume = sum(b[5] for b in bars)
        if volume <= 0:
            return None
        levels = self.state.get('levels',{}).get(symbol)
        level = levels[1 if bear else 0] if levels else min(b[3] for b in prior) if bear else max(b[2] for b in prior)
        vwap = sum((b[2]+b[3]+b[4])/3*b[5] for b in bars)/volume
        holds = [(b[4] < level if bear else b[4] > level) for b in bars]
        start = max([-1] + [i for i, held in enumerate(holds) if not held]) + 1
        crossings = []
        for i, bar in enumerate(bars):
            previous = bars[i-1][4] if i else bar[1]
            crossed = previous >= level > bar[4] if bear else previous <= level < bar[4]
            if crossed:
                crossings.append(clock(minute(bar[0])+5))
        # Opening gaps below PDL are eligible for the established bear V2 hold.
        gap = bear and bars[0][1] < level and bars[0][4] < level
        if gap:
            crossings.insert(0, "09:20")
        total = sum(b[5] for b in prior[:len(bars)]) if len(prior)>=len(bars) else 0
        leg_total = sum(b[5] for b in prior[start:len(bars)]) if len(prior)>=len(bars) else 0
        return dict(level=level, close=bars[-1][4], vwap=vwap,
                    aligned=bars[-1][4] < vwap if bear else bars[-1][4] > vwap,
                    holds=holds[-1], readyAllowed=not (not bear and start == 0 and bars[0][1] > level),
                    crosses=crossings, streak=clock(555+5*(start+1)) if start < len(bars) else None,
                    rvol=volume/total if total > 0 else None,
                    active=sum(b[5] for b in bars[start:])/leg_total if leg_total > 0 else None)

    def accept_cash(self, source):
        if source.get('date') != self.day:
            raise ValueError('Cash source session mismatch')
        cut = source["cut"][:5]
        expected = clock(minute(cut)-5)
        for symbol, candle in source.get("candles", {}).items():
            values = [candle.get(k) for k in ("open","high","low","close","volume")]
            if (candle.get("time", "")[:5] != expected or expected not in SLOTS
                    or not all(number(v) for v in values) or min(values[:4]) <= 0 or values[4] < 0):
                continue
            o, h, low, c, _ = values
            if not low <= min(o,c) <= max(o,c) <= h:
                continue
            bars = self.state["cash"].setdefault(symbol, [])
            if not bars or bars[-1][0] < expected:
                bars.append([expected, *values])

    def cash_seed(self, close=None):
        complete = {s:bars for s,bars in self.state['cash'].items()
                    if [b[0] for b in bars] == SLOTS}
        daily = {}
        if close is not None:
            if close.get('date') != self.day:
                raise ValueError('Daily close session mismatch')
            for symbol, rows in close.get('bars',{}).items():
                bars = self.state['cash'].get(symbol,[])
                if (bars and [b[0] for b in bars] == SLOTS[:len(bars)]
                    and [r[0] for r in rows] == SLOTS
                    and all(len(r)==5 and all(positive(v) for v in r[1:])
                            and r[3]<=min(r[1],r[4])<=max(r[1],r[4])<=r[2] for r in rows)):
                    daily[symbol]=[max(r[2] for r in rows),min(r[3] for r in rows)]
                    complete[symbol]=bars
        if not complete:
            raise ValueError('No complete cash prefixes for next session')
        return dict(date=self.day,bars=complete,daily=daily)

    def advance(self, source):
        cut = source["cut"][:5]
        rows = self.viper.advance(source)
        self.state["viper"] = self.viper.state
        self.accept_cash(source)
        quotes = {}
        for symbol in self.viper.state["symbols"]:
            if symbol not in source["chain_received"]:
                continue
            contracts = source["chains"].get(symbol, [])
            quotes[symbol] = {"CE": quote_map(contracts, "CE"), "PE": quote_map(contracts, "PE")}
        history = self.state["chains"]
        previous = history.get(clock(minute(cut)-15), {})
        output = {"bull": [], "bear": []}
        for side in ("bull", "bear"):
            bear = side == "bear"
            for row in rows[side]:
                symbol = row["symbol"]
                features = self.cash_features(symbol, cut, bear)
                if not features:
                    continue
                key = "|".join([side, symbol, row["expiry"], str(float(row["strike"]))])
                track = self.state["trackers"].setdefault(key, {"watch": None, "ignition": None,
                    "ignitionType": None, "readySeen": False, "standardSeen": False, "directSeen": False})
                is_watch = row["state"] in {"RECLAIM COVERING", "BREAKDOWN COVERING"}
                # PUT first_watch can coincide with direct ignition.
                if (is_watch or (bear and row.get("first_watch") == cut)) and track["watch"] is None:
                    track["watch"] = cut
                if row["state"] in IGNITIONS and track["ignition"] is None:
                    track["ignition"], track["ignitionType"] = cut, row["state"]
                opposite = "CE" if bear else "PE"
                anchor = features["close"] if bear else features["level"]
                change, confirms = cross_leg(quotes.get(symbol, {}).get(opposite, {}),
                    previous.get(symbol, {}).get(opposite, {}), anchor, features["close"], bear)
                confirms = confirms and row["unwind"] < 0 if row["unwind"] is not None and confirms is not None else None
                watch, ignition = track["watch"], track["ignition"]
                route = None
                if not bear and watch and features["holds"] and features["readyAllowed"] and not track["readySeen"]:
                    track["readySeen"] = True
                    ready = max(watch, features["streak"])
                    fast = (ready == cut and not ignition and cut <= "11:30" and features["aligned"]
                            and features["rvol"] is not None and features["rvol"] >= 1.5
                            and features["active"] is not None and features["active"] >= 3
                            and row["unwind"] is not None and row["unwind"] <= -8 and confirms and change >= 5)
                    if fast:
                        route = "Pre-ignition fast-track"
                    elif ready == cut and ignition and features["aligned"] and confirms:
                        route = "Ignition active at ready"
                if ignition == cut and watch and not track["standardSeen"]:
                    track["standardSeen"] = True
                    crosses = [t for t in features["crosses"] if t >= watch]
                    breakout = crosses[0] if crosses else features["streak"] if features["holds"] and features["streak"] < watch else None
                    if breakout:
                        ready = max(watch, breakout)
                        if bear and watch == ignition and not crosses:
                            ready = breakout
                        if 0 <= minute(cut)-minute(ready) <= 15:
                            route = route or ("Ordered breakdown" if bear and crosses else
                                              "Early breakdown held" if bear else "Standard ignition")
                direct_state = row["state"] == ("TRACKING" if bear else "SQUEEZING")
                if (route is None and ignition and cut > ignition and cut in features["crosses"]
                        and direct_state and not track["directSeen"] and row["unwind"] is not None
                        and row["unwind"] <= .5 and positive(row["premium"])
                        and (not bear or (row["spot"] is not None and row["spot"] <= row["strike"]))):
                    track["directSeen"] = True
                    route = "Ignition then breakdown" if bear else "Ignition then PDH"
                if bear and route:
                    track["directSeen"] = True
                    volume = ((features["rvol"] is not None and features["rvol"] >= 1.5)
                              or (features["active"] is not None and features["active"] >= .85))
                    if not features["aligned"] or not (volume or confirms):
                        route = None
                if not route:
                    continue
                identifier = key + "|" + cut
                if identifier in self.state["emitted"]:
                    continue
                self.state["emitted"].append(identifier)
                output[side].append(dict(side="BEAR" if bear else "BULL", symbol=symbol, cut=cut, route=route,
                    strike=row["strike"], level=round(features["level"], 2), rvol=features["rvol"],
                    activeRvol=features["active"], unwind=row["unwind"], opposite=change,
                    oppositeConfirmed=confirms, first=False, expiry=row["expiry"],
                    referencePrice=features["close"], decisionVwap=features["vwap"]))
        for side in output:
            output[side].sort(key=lambda r: (r["symbol"], abs(r["strike"]-r["level"]), r["strike"]))
            for row in output[side]:
                first_key = side + "|" + row["symbol"]
                row["first"] = first_key not in self.state["first"]
                if row["first"]:
                    self.state["first"].append(first_key)
        self.state["chains"] = {t: q for t,q in history.items() if minute(t) > minute(cut)-15}
        self.state["chains"][cut] = quotes
        self.state["last"] = cut
        return output
