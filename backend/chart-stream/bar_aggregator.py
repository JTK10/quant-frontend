"""Tick-to-5-minute candle aggregation for the VM1 market-data stream."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

BAR_SECONDS = 5 * 60


@dataclass
class Candle:
    instrument_key: str
    symbol: str
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int

    def as_dict(self, *, closed: bool = False) -> dict[str, Any]:
        return {
            "type": "candle",
            "kind": "closed" if closed else "update",
            "instrument_key": self.instrument_key,
            "symbol": self.symbol,
            "time": self.time,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


@dataclass
class _State:
    candle: Candle
    last_vtt: float
    session_volume: float = 0.0


def bar_start(epoch_seconds: float) -> int:
    return int(epoch_seconds) // BAR_SECONDS * BAR_SECONDS


class CandleAggregator:
    """Convert existing VM1 ticks into active and completed five-minute bars."""

    def __init__(self, *, resync_fraction: float = 0.25) -> None:
        self._states: dict[str, _State] = {}
        self._completed: dict[str, list[Candle]] = {}
        self._resync_fraction = resync_fraction

    def push(self, *, instrument_key: str, symbol: str, epoch_seconds: float, ltp: float, vtt: float) -> list[dict[str, Any]]:
        if ltp <= 0 or vtt < 0:
            return []

        bucket = bar_start(epoch_seconds)
        state = self._states.get(instrument_key)
        if state is None:
            state = _State(Candle(instrument_key, symbol, bucket, ltp, ltp, ltp, ltp, 0), vtt)
            self._states[instrument_key] = state
            return [state.candle.as_dict()]

        delta = max(0.0, vtt - state.last_vtt)
        state.last_vtt = vtt
        # VM1 occasionally sends a VTT resync blob late in the session. It must
        # never turn into a fake volume spike on a chart.
        if state.session_volume and delta > self._resync_fraction * state.session_volume:
            delta = 0.0
        state.session_volume += delta

        events: list[dict[str, Any]] = []
        if bucket != state.candle.time:
            events.append(state.candle.as_dict(closed=True))
            self._completed.setdefault(instrument_key, []).append(state.candle)
            state.candle = Candle(instrument_key, symbol, bucket, ltp, ltp, ltp, ltp, int(delta))
        else:
            state.candle.high = max(state.candle.high, ltp)
            state.candle.low = min(state.candle.low, ltp)
            state.candle.close = ltp
            state.candle.volume += int(delta)
        events.append(state.candle.as_dict())
        return events

    def reset(self) -> None:
        """Clear prior-session state when the recorder opens a new daily feed."""
        self._states.clear()
        self._completed.clear()

    def snapshot(self, symbols: Iterable[str] | None = None) -> list[dict[str, Any]]:
        wanted = set(symbols) if symbols is not None else None
        rows = []
        for candles in self._completed.values():
            for candle in candles:
                if wanted is None or candle.symbol in wanted or candle.instrument_key in wanted:
                    rows.append(candle.as_dict(closed=True))
        for state in self._states.values():
            candle = state.candle
            if wanted is None or candle.symbol in wanted or candle.instrument_key in wanted:
                rows.append(candle.as_dict())
        return sorted(rows, key=lambda row: (row["symbol"], row["time"]))


def parse_feed_line(line: str, *, include_metadata: bool = False) -> list:
    """Read the exact JSONL feed shape already consumed by caracal_feed.py."""
    import json

    raw = json.loads(line)
    recv_ts = raw.get("recv_ts")
    feeds = (raw.get("msg") or {}).get("feeds") or {}
    if recv_ts is None or not isinstance(feeds, dict):
        return []

    rows = []
    for key, block in feeds.items():
        if not isinstance(block, dict):
            continue
        full = block.get("fullFeed") or block.get("ff") or {}
        index = full.get("indexFF")
        market = full.get("marketFF") or index
        if not isinstance(market, dict):
            continue
        try:
            ltp = float((market.get("ltpc") or {}).get("ltp"))
            # Index ticks have a price but no traded-volume field.
            # Preserve strict volume validation for equity ticks.
            vtt = 0.0 if isinstance(index, dict) and market is index else float(market.get("vtt"))
        except (TypeError, ValueError):
            continue
        if ltp > 0 and vtt >= 0:
            row = (str(key), float(recv_ts), ltp, vtt)
            if include_metadata:
                try:
                    trade_ts = float((market.get("ltpc") or {}).get("ltt")) / 1000
                except (TypeError, ValueError):
                    trade_ts = None
                row += (trade_ts,)
            rows.append(row)
    return rows

