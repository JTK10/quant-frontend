"""Bounded per-symbol historical candle reader for the live chart service."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from urllib.parse import quote
from typing import Any, Iterable


def history_filename(symbol: str) -> str:
    return f"{quote(symbol.upper(), safe='')}.json.gz"


class HistoryStore:
    """Read only requested symbol files; never open the full candle master."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def snapshot(self, subscriptions: Iterable[str], names: dict[str, str]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        seen: set[str] = set()
        for subscription in subscriptions:
            symbol = names.get(subscription, subscription).strip().upper()
            if not symbol or symbol in seen:
                continue
            seen.add(symbol)
            path = self.directory / history_filename(symbol)
            try:
                with gzip.open(path, "rt", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except (FileNotFoundError, OSError, json.JSONDecodeError):
                continue
            if isinstance(payload, list):
                rows.extend(row for row in payload if isinstance(row, dict))
        return rows