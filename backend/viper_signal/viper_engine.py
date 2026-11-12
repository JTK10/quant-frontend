"""Incremental Viper signal rules from the approved offline replay SQL."""
from datetime import date
from math import isfinite


def minute(cut):
    return int(cut[:2]) * 60 + int(cut[3:5])


def clock(value):
    return f"{value // 60:02}:{value % 60:02}" if value is not None else None


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def positive(value):
    return number(value) and value > 0


def input_data(document, day, cut):
    if (document.get("date") != day or document.get("cut") not in (cut, cut + ":00")
            or document.get("degraded") is not False):
        raise ValueError("Viper source date/cut/quality mismatch")
    expiry = document["expiry"]
    if date.fromisoformat(expiry) < date.fromisoformat(day):
        raise ValueError("Viper source expiry unavailable")
    chains, baselines, received = (document[key] for key in ("chains", "baselines", "chain_received"))
    if not (0 < len(chains) <= 350 and isinstance(received, dict)):
        raise ValueError("Viper source coverage unavailable")
    return expiry, chains, baselines, received


def chain_map(contracts, watch=None):
    if len(contracts) > 1800:
        raise ValueError("Viper source contract budget")
    result = {}
    for strike, leg, premium, oi, prev, _ in contracts:
        if not positive(strike) or leg not in ("CE", "PE"):
            continue
        key = f"{leg}|{float(strike)}"
        if watch is not None and key not in watch:
            continue
        if key in result:
            raise ValueError("Duplicate Viper source strike")
        if number(oi) and oi >= 0:
            result[key] = (strike, leg, premium if number(premium) else None, oi, prev)
    return result


class Engine:
    def __init__(self, day, baseline_doc=None, state=None):
        self.day = day
        if state is not None:
            self.state = state
            return
        baseline = baseline_doc["date"]
        if baseline >= day:
            raise ValueError("Viper baseline must precede decision session")
        expiry, chains, baselines, received = input_data(baseline_doc, baseline, "15:25")
        self.state = {"baseline": baseline, "expiry": expiry, "last": None, "symbols": {}}
        if expiry < day:
            return
        for symbol, contracts in chains.items():
            spot = baselines.get(symbol, {}).get("spot")
            if not positive(spot) or not positive(received.get(symbol)):
                continue
            tracked = {}
            for key, (strike, leg, premium, oi, prev) in chain_map(contracts).items():
                near = (.985, 1.025) if leg == "CE" else (.975, 1.015)
                if (positive(prev) and positive(premium) and oi >= 1.5 * prev
                        and strike * near[0] <= spot <= strike * near[1]):
                    reference = strike + premium if leg == "CE" else strike - .5 * premium
                    tracked[key] = {
                        "strike": strike, "leg": leg, "reference": reference, "premium": premium,
                        "build": 100 * (oi - prev) / prev, "oi": {}, "peak": None,
                        "watch": None, "recent": None, "ignition": None, "strict": None,
                        "exhausted": None,
                    }
            if tracked:
                self.state["symbols"][symbol] = tracked

    def advance(self, document):
        cut = document["cut"][:5]
        at = minute(cut)
        last = self.state["last"]
        if not 555 <= at <= 930 or at % 5 or (last is not None and last >= cut):
            raise ValueError("Invalid or duplicate Viper decision cut")
        expiry, chains, baselines, received = input_data(document, self.day, cut)
        output = {"bull": [], "bear": []}
        if expiry == self.state["expiry"]:
            for symbol, watched in self.state["symbols"].items():
                spot = baselines.get(symbol, {}).get("spot")
                has_spot = positive(spot) and positive(received.get(symbol))
                current = chain_map(chains.get(symbol, []), watched) if has_spot else {}
                for key, tracker in watched.items():
                    quote = current.get(key)
                    if quote:
                        _, _, premium, oi, _ = quote
                        row = self._advance(tracker, symbol, expiry, cut, at, spot, premium, oi)
                    else:
                        row = self._advance(tracker, symbol, expiry, cut, at, None, None, None)
                    output["bull" if tracker["leg"] == "CE" else "bear"].append(row)
        self.state["last"] = cut
        for rows in output.values():
            rows.sort(key=lambda row: (row["unwind"] is None, row["unwind"] or 0, row["symbol"], row["strike"]))
        return output

    @staticmethod
    def _advance(track, symbol, expiry, cut, at, spot, premium, oi):
        strike, reference = track["strike"], track["reference"]
        history = track["oi"]
        prev = history.get(str(at - 15))
        track["oi"] = {t: value for t, value in history.items() if int(t) > at - 15}
        if oi is not None:
            track["oi"][str(at)] = oi
            track["peak"] = oi if track["peak"] is None else max(oi, track["peak"])
        unwind = 100 * (oi - prev) / prev if oi is not None and positive(prev) else None
        fresh = unwind is not None and unwind <= -8 and positive(premium)
        covering = unwind is not None and unwind <= -2 and positive(premium)
        sustained = oi is not None and track["peak"] is not None and oi <= .9 * track["peak"]

        if track["leg"] == "CE":
            distance = 100 * (spot / reference - 1) if spot is not None else None
            watch = fresh and spot >= strike and distance < -.5
            if watch:
                track["recent"] = at
            strict = fresh and distance >= -.5
            bridge = (covering and distance >= -.5 and sustained and track["recent"] is not None
                      and at - track["recent"] <= 30)
        else:
            distance = 100 * (reference - spot) / reference if spot is not None and reference != 0 else None
            watch = fresh and spot <= strike
            pain = (spot is not None and spot <= strike and reference > 0 and distance >= -.25
                    and positive(premium) and premium >= 1.25 * track["premium"])
            strict = pain and fresh
            bridge = (pain and covering and sustained and track["watch"] is not None
                      and 0 < at - track["watch"] <= 25)
        if watch and track["watch"] is None:
            track["watch"] = at
        if strict and track["strict"] is None:
            track["strict"] = at
        if (strict or bridge) and track["ignition"] is None:
            track["ignition"] = at
        ignition = track["ignition"]

        if track["leg"] == "CE":
            if ignition is not None and at > ignition and track["exhausted"] is None and (
                (distance is not None and distance < 0) or (unwind is not None and unwind > .5)
            ):
                track["exhausted"] = at
            if at == ignition:
                state = "STRICT IGNITION" if strict else "BRIDGE IGNITION"
            elif at == track["exhausted"]:
                state = "EXHAUSTED"
            elif track["exhausted"] is not None:
                state = "CLOSED"
            elif spot is None:
                state = "UNAVAILABLE"
            elif ignition is not None:
                state = "ACTIVE DATA GAP" if unwind is None else "SQUEEZING"
            elif at == track["watch"]:
                state = "RECLAIM COVERING"
            elif abs(distance) <= 1.5 and (unwind is None or unwind > -8):
                state = "STALKING"
            else:
                state = "WATCHLIST"
        elif at == ignition:
            state = "PAIN IGNITION" if strict else "BRIDGE IGNITION"
        elif at == track["watch"]:
            state = "BREAKDOWN COVERING"
        elif spot is None or premium is None:
            state = "UNAVAILABLE"
        elif ignition is not None or track["watch"] is not None:
            state = "TRACKING"
        else:
            state = "WATCHLIST"

        def rounded(value):
            return round(value, 2) if value is not None else None

        return {
            "cut": cut, "symbol": symbol, "strike": strike, "expiry": expiry, "spot": rounded(spot),
            "premium": rounded(premium), "breakeven": rounded(reference), "distance": rounded(distance),
            "unwind": rounded(unwind), "baseline_build": rounded(track["build"]), "state": state,
            "first_watch": clock(track["watch"]), "ignition": clock(ignition),
            "strict_ignition": clock(track["strict"]),
        }
