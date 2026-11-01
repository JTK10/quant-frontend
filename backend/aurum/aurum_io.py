"""Bounded, source-isolated I/O for Aurum; no broker or database readers.

The orchestrator owns its one existing chart-stream subscription. This module
only accepts already-received messages and publishes compact Aurum documents.
"""
from __future__ import annotations

import base64
import json
import math
import os
from pathlib import Path
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from aurum_engine import ENGINE, SIGNAL_CUTS

IST = timezone(timedelta(hours=5, minutes=30))
STREAM_URL = "wss://140.238.241.210.sslip.io"
RUSTY_INPUT = Path("/home/ubuntu/lupus/input")
SNAPSHOT_CUTS = SIGNAL_CUTS
MAX_FEED_BYTES = 1_000_000
MAX_FEED_ROWS = 300


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def iso(now):
    return datetime.fromtimestamp(now, IST).isoformat()


def validate_day(day):
    if not isinstance(day, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        raise ValueError("Invalid session date")
    if datetime.strptime(day, "%Y-%m-%d").strftime("%Y-%m-%d") != day:
        raise ValueError("Invalid session date")
    return day


def validate_cut(cut):
    cut = str(cut)
    if re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d(?::00)?", cut) is None:
        raise ValueError("Invalid snapshot cut")
    return cut[:5]


def instant(day, cut):
    return datetime.fromisoformat(validate_day(day) + "T" + validate_cut(cut) + ":00+05:30").timestamp()


def atomic_save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    os.replace(temp, path)


def bounded_json(path, limit):
    with Path(path).open("rb") as handle:
        raw = handle.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("Input exceeds bounded size")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("Expected object input")
    return value


def context_from_rusty(root, day, cut):
    """Exact same-cut published Rusty labels; missing input stays unavailable.

    `root` is the input directory, normally /home/ubuntu/lupus/input. It must
    never point at an ORDS feed or trigger any historical query.
    """
    validate_day(day)
    cut = validate_cut(cut)
    path = Path(root) / (day.replace("-", "") + "-" + cut.replace(":", "") + ".json")
    try:
        payload = bounded_json(path, 500_000)
    except FileNotFoundError:
        return {}
    rusty = payload.get("rusty")
    if not isinstance(rusty, dict) or rusty.get("date") != day or validate_cut(rusty.get("cut", "")) != cut:
        raise ValueError("Rusty exact date/cut mismatch")
    result, duplicates = {}, set()
    for side in ("bull", "bear"):
        rows = rusty.get(side, [])
        if not isinstance(rows, list) or len(rows) > 400:
            raise ValueError("Invalid Rusty row count")
        for row in rows:
            if not isinstance(row, dict):
                continue
            symbol = row.get("s")
            if not isinstance(symbol, str) or not symbol or len(symbol) > 40:
                continue
            if symbol in result:
                duplicates.add(symbol)
                continue
            if not all(finite(row.get(k)) for k in ("ce_pct", "pe_pct", "oi_bias")):
                continue
            label = " ".join(str(row.get("flow_label") or "").split())[:100]
            result[symbol] = dict(ce_pct=row["ce_pct"], pe_pct=row["pe_pct"], oi_bias=row["oi_bias"],
                flow_label=label or "Unavailable", view=label or "Unavailable", flow_type=row.get("flow_type"),
                rusty_side=side.upper(), rusty_cut=cut, rusty_status="exact_snapshot")
    for symbol in duplicates:
        result.pop(symbol, None)
    return result


class NiftyCache:
    """Only completed Nifty bars, at most two sessions, durable across restarts."""
    def __init__(self, root):
        path = Path(root)
        self.path = path if path.suffix == ".json" else path / "nifty-cache.json"
        self._lock = threading.RLock()
        self.bars = {}
        if self.path.exists():
            saved = bounded_json(self.path, 256_000)
            for item in saved.get("bars", [])[:150]:
                if self._valid_saved(item):
                    # Every disk-loaded observation is recovered, never a fresh tick.
                    item = dict(item, recovered=True)
                    self.bars[(item["date"], item["bar_start"])] = item

    @staticmethod
    def subscription():
        return dict(type="subscribe", symbols=["NIFTY 50"], history=True)

    @staticmethod
    def _valid_saved(item):
        try:
            validate_day(item["date"])
            validate_cut(item["bar_start"])
            return (all(finite(item.get(k)) for k in ("open", "close", "available_at"))
                    and item["open"] > 0 and item["close"] > 0
                    and "09:15" <= item["bar_start"] <= "15:25"
                    and item["available_at"] >= instant(item["date"], item["bar_start"]) + 300)
        except (KeyError, TypeError, ValueError):
            return False

    def ingest_stream(self, payload, now):
        """Return new completed-bar count. Snapshot/history rows are recovered.

        Receipt time is retained independently from candle time. Active updates,
        future bars and other symbols cannot satisfy the completed-candle gate.
        """
        if not finite(now) or not isinstance(payload, dict):
            return 0
        snapshot = payload.get("type") == "snapshot"
        rows = payload.get("bars", []) if snapshot else [payload]
        if not isinstance(rows, list) or len(rows) > 2000:
            raise ValueError("Nifty stream snapshot exceeds bounded rows")
        current_day = datetime.fromtimestamp(now, IST).date().isoformat()
        changed = 0
        with self._lock:
            for row in rows:
                if not isinstance(row, dict):
                    continue
                if row.get("symbol") != "NIFTY 50" and row.get("instrument_key") != "NSE_INDEX|Nifty 50":
                    continue
                if not snapshot and (row.get("type") != "candle" or row.get("kind") != "closed"):
                    continue
                when = row.get("time")
                if not finite(when) or when % 300 != 0 or when + 300 > now:
                    continue
                dt = datetime.fromtimestamp(when, IST)
                day, hm = dt.date().isoformat(), dt.strftime("%H:%M")
                if day != current_day or not "09:15" <= hm <= "15:25":
                    continue
                values = [row.get(k) for k in ("open", "high", "low", "close")]
                if not all(finite(v) and v > 0 for v in values):
                    continue
                o, h, low, close = values
                if not low <= min(o, close) <= max(o, close) <= h:
                    continue
                recv = row.get("recv_ts")
                if recv is not None and (not finite(recv) or recv > now + 2):
                    continue
                recovered = snapshot or not finite(recv) or now - recv > 15
                value = dict(date=day, bar_start=hm, open=o, close=close, available_at=now,
                             recovered=recovered, source="existing_vm1_chart_stream")
                key = day, hm
                # First completed observation remains immutable on reconnect.
                if key not in self.bars:
                    self.bars[key] = value
                    changed += 1
            if changed:
                days = sorted({key[0] for key in self.bars})[-2:]
                self.bars = {key: value for key, value in self.bars.items() if key[0] in days}
                atomic_save(self.path, dict(schema_version=1, bars=[self.bars[k] for k in sorted(self.bars)]))
        return changed

    def context(self, day, cut):
        cut = validate_cut(cut)
        expected = datetime.fromtimestamp(instant(day, cut) - 300, IST).strftime("%H:%M")
        with self._lock:
            first, last = self.bars.get((day, "09:15")), self.bars.get((day, expected))
            if first is None or last is None:
                return None
            return dict(open=first["open"], close=last["close"], bar_start=expected,
                        available_at=last["available_at"], recovered=bool(first["recovered"] or last["recovered"]),
                        source="existing_vm1_chart_stream")


def build_context(rusty_input_root, cache, day, cut):
    return dict(date=validate_day(day), cut=validate_cut(cut), nifty=cache.context(day, cut),
                rusty=context_from_rusty(rusty_input_root, day, cut))


class Publisher:
    """Durable immutable Aurum outbox with read-back before uncertain retries.

    Uses the existing ORDS root/path and OAuth client. Credentials remain inside
    the process; transport failures expose status codes only. No other sources
    are changed. A read that is incomplete can never authorize another POST.
    """
    def __init__(self, cfg_path, root, request=None):
        self.cfg = bounded_json(cfg_path, 64_000)
        for field in ("base", "path", "client_id", "client_secret"):
            if not isinstance(self.cfg.get(field), str) or not self.cfg[field]:
                raise ValueError("Aurum publisher configuration unavailable")
        base = self.cfg["base"].rstrip("/")
        parsed = urlsplit(base)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Aurum ORDS requires configured HTTPS origin")
        path = self.cfg["path"]
        if not path.startswith("/") or path.startswith("//") or "?" in path or "#" in path:
            raise ValueError("Invalid Aurum ORDS path")
        self.base, self.url = base, base + path
        self.root = Path(root)
        self.outbox, self.sent = self.root / "outbox" / ENGINE, self.root / "sent" / ENGINE
        self.outbox.mkdir(parents=True, exist_ok=True)
        self.sent.mkdir(parents=True, exist_ok=True)
        self.request = request or self._request
        self.token, self.expiry = None, 0

    @staticmethod
    def _request(method, url, headers, data):
        req = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=10) as response:
                blob = response.read(MAX_FEED_BYTES + 1)
                status = response.status
        except HTTPError as error:
            status, blob = error.code, error.read(MAX_FEED_BYTES + 1)
        if len(blob) > MAX_FEED_BYTES:
            raise ValueError("Aurum response exceeds byte limit")
        return status, blob

    def _auth(self, now):
        if self.token and now < self.expiry:
            return self.token
        basic = base64.b64encode((self.cfg["client_id"] + ":" + self.cfg["client_secret"]).encode()).decode()
        status, blob = self.request("POST", self.base + "/oauth/token",
            {"Authorization": "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded"},
            b"grant_type=client_credentials")
        if status != 200:
            raise RuntimeError("Aurum authorization HTTP " + str(status))
        data = json.loads(blob)
        token, seconds = data.get("access_token"), data.get("expires_in", 300)
        if not isinstance(token, str) or not token or not finite(seconds) or seconds <= 0:
            raise ValueError("Invalid Aurum authorization response")
        self.token, self.expiry = token, now + max(1, seconds - min(60, seconds / 5))
        return token

    def _headers(self, now):
        return {"Authorization": "Bearer " + self._auth(now), "Content-Type": "application/json"}

    def read_back(self, day, now):
        validate_day(day)
        query = urlencode(dict(src="aurum", sig_date=day.replace("-", ""), limit=MAX_FEED_ROWS))
        status, blob = self.request("GET", self.url + "?" + query, self._headers(now), None)
        if status == 401:
            self.token, self.expiry = None, 0
        if status != 200:
            raise RuntimeError("Aurum read-back HTTP " + str(status))
        if len(blob) > MAX_FEED_BYTES:
            raise ValueError("Aurum read-back byte limit")
        payload = json.loads(blob)
        rows = payload.get("items")
        if not isinstance(rows, list) or len(rows) > MAX_FEED_ROWS or payload.get("hasMore") is True:
            raise ValueError("Incomplete Aurum source/date read-back")
        docs = {}
        for item in rows:
            if not isinstance(item, dict):
                raise ValueError("Invalid Aurum read-back row")
            doc = item.get("doc", item)
            if isinstance(doc, str):
                doc = json.loads(doc)
            if not isinstance(doc, dict):
                raise ValueError("Invalid Aurum read-back document")
            if doc.get("source") != "aurum" or str(doc.get("sig_date")) != day.replace("-", ""):
                # Reject an upstream source filter failure rather than use a
                # broad shared feed to prove that our own document is absent.
                raise ValueError("Aurum read-back source/date isolation failed")
            identifier = doc.get("Doc_ID")
            if not isinstance(identifier, str):
                raise ValueError("Aurum read-back identifier unavailable")
            docs[identifier] = doc
        return docs

    def _enqueue(self, document, kind, slot, now):
        day = validate_day(document.get("date"))
        if document.get("source") != "aurum" or document.get("engine") != ENGINE:
            raise ValueError("Aurum publication source/engine mismatch")
        doc = dict(document)
        if kind == "HEALTH":
            for field in ("signals", "coverage", "available_dates"):
                doc.pop(field, None)
        elif not isinstance(doc.get("signals"), list) or len(doc["signals"]) > 300:
            raise ValueError("Aurum snapshot exceeds signal limit")
        identifier = "aurum|" + ENGINE + "|" + day.replace("-", "") + "|" + kind + "|" + slot.replace(":", "")
        doc.update(source="aurum", engine=ENGINE, kind=kind, Doc_ID=identifier,
                   sig_date=day.replace("-", ""), cap="AURUM", name="", side="NEUTRAL", ts=now,
                   available_at=iso(now), time=datetime.fromtimestamp(now, IST).strftime("%H:%M:%S"))
        if kind == "SNAPSHOT":
            doc["decision_cut"] = slot
        blob = json.dumps(doc, separators=(",", ":"), allow_nan=False).encode()
        if len(blob) > 500_000:
            raise ValueError("Aurum publication exceeds byte limit")
        filename = day + "-" + kind + "-" + slot.replace(":", "") + ".json"
        path = self.outbox / filename
        if path.exists() or (self.sent / filename).exists():
            return identifier  # Immutable first document across duplicate/restart.
        atomic_save(path, dict(document=doc, attempts=0, attempted=False, next_try=0, error=None))
        return identifier

    def enqueue_snapshot(self, document, cut, now=None):
        cut = validate_cut(cut)
        if cut not in SNAPSHOT_CUTS:
            raise ValueError("Aurum decision cut outside locked window")
        return self._enqueue(document, "SNAPSHOT", cut, time.time() if now is None else now)

    def enqueue_health(self, document, now=None):
        now = time.time() if now is None else now
        local = datetime.fromtimestamp(now, IST)
        if local.date().isoformat() != document.get("date"):
            raise ValueError("Aurum health date mismatch")
        status = document.get("status")
        if status not in ("PENDING", "READY", "ERROR", "DEGRADED", "CLOSED"):
            raise ValueError("Invalid Aurum health status")
        # Caller emits once per quarter or status transition in the morning,
        # and once per date/status/window transition outside it. Actual-minute
        # IDs preserve PENDING -> ERROR -> READY within a single quarter without
        # a separate mutable transition counter. Same minute/state is idempotent.
        slot = local.strftime("%H:%M") + "-" + status
        return self._enqueue(document, "HEALTH", slot, now)

    def flush_one(self, now=None):
        """One bounded source/date read and at most one POST; never blind retry.

        Returns a small status; failed durable records remain for later/backoff.
        No exception message or configuration content is logged by this helper.
        """
        now = time.time() if now is None else now
        exhausted = 0
        for path in sorted(self.outbox.glob("*.json"))[:100]:
            record = bounded_json(path, 520_000)
            if record.get("attempts", 0) >= 8:
                exhausted += 1
                continue
            if record.get("next_try", 0) > now:
                continue
            doc = record["document"]
            day, identifier = validate_day(doc.get("date")), doc.get("Doc_ID")
            record["attempts"] = int(record.get("attempts", 0)) + 1
            record["next_try"] = now + min(900, 15 * 2 ** (record["attempts"] - 1))
            atomic_save(path, record)
            try:
                # Always verify first, including after an uncertain POST or a
                # process death between remote insert and local acknowledgement.
                existing = self.read_back(day, now)
                if identifier not in existing:
                    record["attempted"] = True
                    atomic_save(path, record)  # Persist uncertainty before sending.
                    status, _ = self.request("POST", self.url, self._headers(now),
                        json.dumps(doc, separators=(",", ":"), allow_nan=False).encode())
                    if status == 401:
                        self.token, self.expiry = None, 0
                    if not 200 <= status < 300:
                        raise RuntimeError("Aurum publication HTTP " + str(status))
                    existing = self.read_back(day, now)
                    if identifier not in existing:
                        raise RuntimeError("Aurum publication acknowledgement unconfirmed")
                atomic_save(self.sent / path.name, record)
                path.unlink()
                return dict(status="SENT", id=identifier)
            except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
                record["error"] = type(error).__name__
                # Read-back failures count toward bounded retries too, but cannot
                # authorize a POST. This leaves the original document intact.
                record["next_try"] = now + min(900, 15 * 2 ** max(0, int(record.get("attempts", 1)) - 1))
                atomic_save(path, record)
                return dict(status="PENDING", id=identifier, error=type(error).__name__)
        return dict(status="BLOCKED", pending=exhausted, error="RetryBudgetExhausted") if exhausted else dict(status="IDLE")
