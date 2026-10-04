"""New WebSocket fan-out for the existing VM1 JSONL tick feed.

This process is separate from footprint.service. It has no feed ownership and
never writes to the recorder: it only tails the recorder's JSONL output.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from bar_aggregator import CandleAggregator, parse_feed_line
from history_store import HistoryStore

IST = ZoneInfo("Asia/Kolkata")
FEED_PATH = Path(os.environ.get("FEED_PATH", "feed.jsonl"))
FEED_DIRECTORY = os.environ.get("FEED_DIRECTORY")
NAME_SOURCE = Path(os.environ.get("NAME_SOURCE", "symbols.json"))
HISTORY_DIRECTORY = Path(os.environ.get("HISTORY_DIRECTORY", "history"))
HOST = os.environ.get("CHART_STREAM_HOST", "127.0.0.1")
PORT = int(os.environ.get("CHART_STREAM_PORT", "8765"))


def current_feed_path() -> Path:
    if FEED_DIRECTORY:
        day = datetime.now(IST).strftime("%Y%m%d")
        return Path(FEED_DIRECTORY) / f"feed_{day}.jsonl"
    return FEED_PATH


def load_names() -> dict[str, str]:
    if not NAME_SOURCE.exists():
        return {}
    with NAME_SOURCE.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    if not isinstance(raw, dict):
        return {}
    return {
        str(instrument_key): str(symbol).strip()
        for instrument_key, symbol in raw.items()
        if str(symbol).strip()
    }


class Hub:
    def __init__(self, names: dict[str, str]) -> None:
        self.clients: dict[Any, set[str]] = {}
        self.queues: dict[Any, asyncio.Queue] = {}
        self.writers: dict[Any, asyncio.Task] = {}
        self.aggregator = CandleAggregator()
        self.names = names
        self.history = HistoryStore(HISTORY_DIRECTORY)

    async def send(self, websocket: Any, payload: dict[str, Any]) -> None:
        try:
            await asyncio.wait_for(websocket.send(json.dumps(payload, separators=(",", ":"))), timeout=2)
        except Exception:
            self.clients.pop(websocket, None)

    async def writer(self, websocket: Any, queue: asyncio.Queue) -> None:
        try:
            while True:
                await self.send(websocket, await queue.get())
                if websocket not in self.clients:
                    await websocket.close(code=1013, reason="Slow stream consumer; reconnect")
                    return
        except asyncio.CancelledError:
            return

    async def broadcast(self, payload: dict[str, Any]) -> None:
        symbol = payload.get("symbol")
        for ws, subscriptions in list(self.clients.items()):
            if subscriptions and symbol not in subscriptions and payload.get("instrument_key") not in subscriptions:
                continue
            queue = self.queues.get(ws)
            if queue is None:
                continue
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Never let a blocked client stall the recorder tail/other charts.
                self.clients.pop(ws, None)
                task = self.writers.get(ws)
                if task:
                    task.cancel()
                asyncio.create_task(ws.close(code=1013, reason="Stream queue overflow; reconnect"))
        await asyncio.sleep(0)

    async def handler(self, websocket: Any) -> None:
        self.clients[websocket] = set()
        queue = self.queues[websocket] = asyncio.Queue(maxsize=256)
        self.writers[websocket] = asyncio.create_task(self.writer(websocket, queue))
        await self.send(websocket, {"type": "ready", "interval": "5m", "receipt_timestamps": True})
        try:
            async for message in websocket:
                try:
                    command = json.loads(message)
                except json.JSONDecodeError:
                    continue
                if command.get("type") == "subscribe":
                    subscriptions = {str(value) for value in command.get("symbols", [])}
                    self.clients[websocket] = subscriptions
                    if command.get("history") is False:
                        # Pallas reconstructs completed bars from VM2 exports.
                        # Do not load 20 days of files for a universe-wide client.
                        await self.send(websocket, {"type": "snapshot", "bars": [], "live_only": True})
                    else:
                        history = self.history.snapshot(subscriptions, self.names)
                        active = self.aggregator.snapshot(subscriptions)
                        await self.send(websocket, {"type": "snapshot", "bars": history + active})
                elif command.get("type") == "unsubscribe":
                    self.clients[websocket] = set()
        finally:
            self.clients.pop(websocket, None)
            self.queues.pop(websocket, None)
            task = self.writers.pop(websocket, None)
            if task:
                task.cancel()


async def tail_feed(hub: Hub) -> None:
    open_path: Path | None = None
    feed = None
    while True:
        desired_path = current_feed_path()
        if desired_path != open_path:
            if feed:
                feed.close()
            feed = None
            open_path = desired_path
            hub.aggregator.reset()
        if feed is None:
            if not desired_path.exists():
                await asyncio.sleep(1)
                continue
            feed = desired_path.open("r", encoding="utf-8")
            print(f"chart stream tailing {desired_path}", flush=True)
        line = feed.readline()
        if not line:
            await asyncio.sleep(0.2)
            continue
        for key, epoch, ltp, vtt, trade_ts in parse_feed_line(line, include_metadata=True):
            symbol = hub.names.get(key, key.split("|")[-1])
            for event in hub.aggregator.push(instrument_key=key, symbol=symbol, epoch_seconds=epoch, ltp=ltp, vtt=vtt):
                event["recv_ts"] = epoch
                event["stream_ts"] = time.time()
                event["trade_ts"] = trade_ts
                await hub.broadcast(event)


async def main() -> None:
    try:
        import websockets
    except ImportError as exc:
        raise SystemExit("Install this isolated service dependency: pip install -r requirements.txt") from exc
    hub = Hub(load_names())
    async with websockets.serve(hub.handler, HOST, PORT, max_size=64 * 1024):
        print(f"chart stream listening on ws://{HOST}:{PORT}", flush=True)
        await tail_feed(hub)


if __name__ == "__main__":
    asyncio.run(main())
