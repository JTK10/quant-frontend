"""Publish five-minute Viper scans from Ocelot's existing atomic Pallas exports."""
import argparse
import base64
from datetime import datetime, timedelta
import json
from pathlib import Path
import sqlite3
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from viper_engine import Engine, clock, minute, positive

IST = ZoneInfo("Asia/Kolkata")
INPUT = Path("/home/ubuntu/pallas/input")
CONFIG = Path("/home/ubuntu/ocelot/ords.json")
ENGINE = "viper-v1"
CUTS = [clock(slot) for slot in range(555, 931, 5)]
MAX_DOCUMENT = 20 * 1024
MAX_READBACK = 3 * 1024 * 1024
EVENTS = {"RECLAIM COVERING", "STRICT IGNITION", "BRIDGE IGNITION", "EXHAUSTED",
          "BREAKDOWN COVERING", "PAIN IGNITION"}
IGNITIONS = {"STRICT IGNITION", "BRIDGE IGNITION", "PAIN IGNITION"}
ACTIVE = {"STALKING", "SQUEEZING", "ACTIVE DATA GAP", "TRACKING"}


def encode(value):
    return json.dumps(value, separators=(",", ":"), allow_nan=False).encode()


def read_json(path, limit):
    with path.open("rb") as handle:
        blob = handle.read(limit + 1)
    if len(blob) > limit:
        raise ValueError("Viper input exceeds byte budget")
    return json.loads(blob)


def read_cut(day, cut, now):
    document = read_json(INPUT / (day.replace("-", "") + "-" + cut.replace(":", "") + ".json"), 4_000_000)
    exported = document.get("exported_at")
    nominal = datetime.fromisoformat(day + "T" + cut).replace(tzinfo=IST).timestamp()
    if not positive(exported) or not nominal <= exported <= min(now, nominal + 300):
        raise ValueError("Viper input receipt is outside cut window")
    received = document.get("chain_received")
    if not isinstance(received, dict):
        raise ValueError("Viper input receipts unavailable")
    document["chain_received"] = {
        symbol: receipt for symbol, receipt in received.items()
        if positive(receipt) and nominal - 120 <= receipt <= exported
    }
    if not document["chain_received"]:
        raise ValueError("Viper has no verified receipts")
    return document


def prior_regular(day, calendar):
    previous = datetime.fromisoformat(day).date()
    for _ in range(20):
        previous -= timedelta(days=1)
        if calendar.regular_day(previous):
            return previous.isoformat()
    raise ValueError("No prior regular session in NSE calendar")


def snapshot(engine, source, now, recovered):
    rows = engine.advance(source)
    day, cut = engine.day, engine.state["last"]
    ymd, hhmm = day.replace("-", ""), cut.replace(":", "")
    doc = {
        "source": "viper", "engine": ENGINE, "date": day, "sig_date": ymd,
        "kind": "SNAPSHOT", "cut": cut, "baseline": engine.state["baseline"],
        "Doc_ID": f"viper|{ENGINE}|{ymd}|{hhmm}", "cap": "VIPER", "name": "", "side": "NEUTRAL",
        "ts": now, "time": datetime.fromtimestamp(now, IST).strftime("%H:%M:%S"),
        "recovered": recovered, "chain_exported_at": source["exported_at"],
        "limited": False, "omitted_events": 0, "bull": [], "bear": [],
    }
    # Events take priority over ongoing/ordinary watch rows when a busy cut hits the transport budget.
    used = len(encode(doc)) + 20
    for states in (IGNITIONS, EVENTS - IGNITIONS, ACTIVE):
        for side in ("bull", "bear"):
            for row in rows[side]:
                if row["state"] not in states:
                    continue
                size = len(encode(row)) + 1
                if used + size > MAX_DOCUMENT:
                    doc["omitted_events"] += int(row["state"] in EVENTS)
                    doc["limited"] = True
                    continue
                used += size
                doc[side].append(row)
    return doc


class Publisher:
    def __init__(self):
        cfg = read_json(CONFIG, 64000)
        self.base = cfg["base"].rstrip("/")
        parsed = urlsplit(self.base)
        path = cfg["path"]
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or not path.startswith("/") or path.startswith("//") or "?" in path or "#" in path):
            raise ValueError("Viper requires configured HTTPS ORDS origin")
        self.url = self.base + path
        self.basic = base64.b64encode(f'{cfg["client_id"]}:{cfg["client_secret"]}'.encode()).decode()
        self.token, self.expires = "", 0

    @staticmethod
    def request(method, url, headers, body=None, limit=64_000):
        req = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(req, timeout=12) as response:
                code, data = response.status, response.read(limit + 1)
        except HTTPError as error:
            code, data = error.code, error.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Viper ORDS response exceeds byte budget")
        return code, data

    def headers(self):
        now = time.time()
        if not self.token or self.expires <= now:
            code, raw = self.request("POST", self.base + "/oauth/token", {
                "Authorization": "Basic " + self.basic, "Content-Type": "application/x-www-form-urlencoded",
            }, b"grant_type=client_credentials")
            if code != 200:
                raise RuntimeError(f"Viper ORDS authentication HTTP {code}")
            doc = json.loads(raw)
            self.token = doc["access_token"]
            self.expires = now + max(1, float(doc.get("expires_in", 300)) - 60)
        return {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}

    def read(self, day):
        query = urlencode({"src": "viper", "sig_date": day.replace("-", ""), "limit": 100})
        code, data = self.request("GET", self.url + "?" + query, self.headers(), limit=MAX_READBACK)
        if code == 401:
            self.token = ""
        if code != 200:
            raise RuntimeError(f"Viper ORDS read-back HTTP {code}")
        payload = json.loads(data)
        rows = payload.get("items")
        if not isinstance(rows, list) or len(rows) > 76 or payload.get("hasMore"):
            raise ValueError("Viper ORDS read-back incomplete")
        found = {}
        for item in rows:
            doc = item.get("doc", item)
            if isinstance(doc, str):
                doc = json.loads(doc)
            if doc.get("source") != "viper" or doc.get("date") != day:
                raise ValueError("Viper ORDS read-back source/date mismatch")
            found[doc["Doc_ID"]] = doc
        return found

    def publish(self, doc):
        code, _ = self.request("POST", self.url, self.headers(), encode(doc))
        if code == 401:
            self.token = ""
        if not 200 <= code < 300:
            raise RuntimeError(f"Viper ORDS publication HTTP {code}")


def open_state(path):
    db = sqlite3.connect(path)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS tracking(day TEXT PRIMARY KEY, state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox(
        id TEXT PRIMARY KEY, date TEXT NOT NULL, document TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, retry REAL NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS viper_retry ON outbox(sent,date,retry);
    """)
    return db


def enqueue(db, doc):
    db.execute("INSERT OR IGNORE INTO outbox(id,date,document) VALUES (?,?,?)",
               (doc["Doc_ID"], doc["date"], encode(doc).decode()))


def deliver_one(db, publisher, day, now):
    pending = db.execute("""SELECT id,document,attempts FROM outbox
         WHERE date=? AND sent=0 AND attempts<8 AND retry<=? ORDER BY id LIMIT 1""", (day, now)).fetchone()
    if pending is None:
        return False
    identifier, raw, attempts = pending
    with db:
        db.execute("UPDATE outbox SET attempts=attempts+1,retry=? WHERE id=?",
                   (now + min(900, 20 * 2 ** attempts), identifier))
    try:
        # The durable attempt marker precedes POST. Reconcile every uncertain attempt
        # against source/date read-back before authorizing another write.
        if attempts == 0 or identifier not in publisher.read(day):
            publisher.publish(json.loads(raw))
        with db:
            db.execute("UPDATE outbox SET sent=1 WHERE id=?", (identifier,))
        print(f"Viper published {identifier}", flush=True)
    except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        print(f"Viper publication pending {identifier} ({type(error).__name__})", flush=True)
    return True


def engine_for(db, day, now, calendar):
    saved = db.execute("SELECT state FROM tracking WHERE day=?", (day,)).fetchone()
    if saved:
        return Engine(day, state=json.loads(saved[0]))
    previous = prior_regular(day, calendar)
    return Engine(day, read_cut(previous, "15:25", now))


def next_cut(engine, local, now):
    current = local.strftime("%H:%M")
    first = engine.state["last"] or "09:14"
    for cut in CUTS:
        if cut <= first or cut > current:
            continue
        try:
            doc = read_cut(engine.day, cut, now)
        except (OSError, ValueError):
            continue
        if doc.get("degraded") is False:
            return doc
    return None


def retry_prior(db, publisher, day, now):
    pending = db.execute("""SELECT date FROM outbox
      WHERE sent=0 AND attempts<8 AND retry<=? AND date<? ORDER BY date DESC LIMIT 1""",
      (now, day)).fetchone()
    return bool(pending and deliver_one(db, publisher, pending[0], now))


def run(db, calendar):
    publisher = Publisher()
    engine, active_day = None, None
    last_input_error = 0
    while True:
        now = time.time()
        local = datetime.fromtimestamp(now, IST)
        day = local.date().isoformat()
        if not calendar.regular_day(day) or not "09:15" <= local.strftime("%H:%M") <= "15:45":
            if not deliver_one(db, publisher, day, now):
                retry_prior(db, publisher, day, now)
            time.sleep(45)
            continue
        if day != active_day:
            active_day, engine = day, None
        try:
            if engine is None:
                engine = engine_for(db, day, now, calendar)
            source = next_cut(engine, local, now)
            if source:
                doc = snapshot(engine, source, now, now - source["exported_at"] > 300)
                with db:
                    enqueue(db, doc)
                    db.execute("INSERT OR REPLACE INTO tracking(day,state) VALUES (?,?)",
                               (day, encode(engine.state).decode()))
                print(f"Viper consumed {day} {doc['cut']} (export lag {now-source['exported_at']:.1f}s, "
                      f"{len(doc['bull'])}/{len(doc['bear'])} rows, {len(encode(doc))} bytes)", flush=True)
        except (OSError, ValueError, KeyError, TypeError) as error:
            engine = None
            if now - last_input_error > 300:
                print(f"Viper input pending {day} ({type(error).__name__})", flush=True)
                last_input_error = now
        worked = deliver_one(db, publisher, day, now) or retry_prior(db, publisher, day, now)
        time.sleep(8 if worked else 20)


def sample(db, calendar, day, publish):
    now = time.time()
    previous = prior_regular(day, calendar)
    engine = Engine(day, read_cut(previous, "15:25", now))
    sample_doc = None
    for cut in CUTS[:7]:
        source = read_cut(day, cut, now)
        sample_doc = snapshot(engine, source, now, True)
        print(f"Viper sample {day} {cut} {len(sample_doc['bull'])}/{len(sample_doc['bear'])} rows "
              f"{len(encode(sample_doc))} bytes", flush=True)
    if publish:
        publisher = Publisher()
        sample_doc["validation"] = True
        with db:
            enqueue(db, sample_doc)
        deliver_one(db, publisher, day, now)
        found = publisher.read(day)
        row = found.get(sample_doc["Doc_ID"])
        if row != sample_doc:
            raise RuntimeError("Viper ORDS sample read-back did not match")
        print(f"Viper verified ORDS {sample_doc['Doc_ID']} ({len(found)} documents)", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/home/ubuntu/viper"))
    parser.add_argument("--sample")
    parser.add_argument("--publish-sample", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, "/home/ubuntu/market-calendar")
    import nse_calendar
    if args.sample and not args.publish_sample:
        sample(None, nse_calendar, args.sample, False)
        return
    import fcntl
    with (args.root / "viper.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db = open_state(args.root / "state.sqlite")
        if args.sample:
            sample(db, nse_calendar, args.sample, True)
        else:
            run(db, nse_calendar)


if __name__ == "__main__":
    main()
