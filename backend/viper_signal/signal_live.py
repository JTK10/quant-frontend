"""Publish five-minute Viper scans from Ocelot's existing atomic Pallas exports."""
import argparse
import base64
from datetime import datetime, timedelta
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from viper_engine import clock, minute, positive
from signal_engine import SignalEngine as Engine

IST = ZoneInfo("Asia/Kolkata")
INPUT = Path("/home/ubuntu/pallas/input")
CONFIG = Path("/home/ubuntu/ocelot/ords.json")
ENGINE = "phoenix-live-v1"
CUTS = [clock(slot) for slot in range(555, 931, 5)]
MAX_DOCUMENT = 20 * 1024
MAX_READBACK = 3 * 1024 * 1024
EVENTS = {"RECLAIM COVERING", "STRICT IGNITION", "BRIDGE IGNITION", "EXHAUSTED",
          "BREAKDOWN COVERING", "PAIN IGNITION"}
IGNITIONS = {"STRICT IGNITION", "BRIDGE IGNITION", "PAIN IGNITION"}
ACTIVE = {"STALKING", "SQUEEZING", "ACTIVE DATA GAP", "TRACKING"}


def encode(value):
    return json.dumps(value, separators=(",", ":"), allow_nan=False).encode()


def atomic(path, document):
    temp = path.with_suffix(".tmp")
    temp.write_bytes(encode(document))
    os.replace(temp, path)


def health(db, engine, error=None):
    atomic(Path(__file__).parent / "health.json", dict(
        date=datetime.now(IST).date().isoformat(), updated_at=time.time(),
        last_session=engine.day if engine else None,
        last_cut=engine.state["last"] if engine else None, error=error,
        pending=db.execute("SELECT count(*) FROM outbox WHERE sent=0").fetchone()[0]))


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
    if not document["chain_received"] and cut == '15:30':
        document['degraded'] = True
    elif not document["chain_received"]:
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
    doc = dict(source="viper-signal", engine=ENGINE, date=day, sig_date=day.replace("-", ""),
        kind="SNAPSHOT", cut=cut, baseline=engine.state["baseline"],
        Doc_ID=f"viper-signal|{ENGINE}|{day.replace('-', '')}|{cut.replace(':', '')}",
        cap="VIPER_SIGNAL", name="", side="NEUTRAL", ts=now,
        time=datetime.fromtimestamp(now, IST).strftime("%H:%M:%S"), recovered=recovered,
        chain_exported_at=source["exported_at"], limited=False, bull=[], bear=[])
    for side in ("bull", "bear"):
        for row in rows[side]:
            row["recovered"] = recovered
            doc[side].append(row)
            if len(encode(doc)) > MAX_DOCUMENT:
                raise ValueError("Signal document exceeds transport budget")
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
        query = urlencode({"src": "viper-signal", "sig_date": day.replace("-", ""), "limit": 100})
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
            if doc.get("source") != "viper-signal" or doc.get("date") != day:
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
    seed_path = Path(__file__).parent / 'cash-seeds' / (previous+'.json')
    if not seed_path.exists():
        prior_state=db.execute('SELECT state FROM tracking WHERE day=?',(previous,)).fetchone()
        if prior_state:
            save_closing_seed(Engine(previous,state=json.loads(prior_state[0])))
    return Engine(day, read_cut(previous, "15:25", now), prior_cash=read_json(seed_path, 2_000_000))


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
        if doc.get("degraded") is False or cut == '15:30':
            return doc
    return None


def retry_prior(db, publisher, day, now):
    pending = db.execute("""SELECT date FROM outbox
      WHERE sent=0 AND attempts<8 AND retry<=? AND date<? ORDER BY date DESC LIMIT 1""",
      (now, day)).fetchone()
    return bool(pending and deliver_one(db, publisher, pending[0], now))


def save_closing_seed(engine):
    # Reuse the existing full-session OHLC export. Its last bars need not have
    # volume: volume denominators remain limited to exact earlier saved slots.
    close = read_json(Path('/home/ubuntu/lupus') / ('close-'+engine.day+'.json'),2_000_000)
    seed = engine.cash_seed(close)
    folder = Path(__file__).parent / 'cash-seeds'
    folder.mkdir(exist_ok=True)
    atomic(folder / (engine.day+'.json'),seed)
    engine.state['seeded'] = True
    return len(seed['bars'])


def run(db, calendar):
    publisher = Publisher()
    engine, active_day = None, None
    last_input_error = 0
    health_due = 0
    while True:
        now = time.time()
        local = datetime.fromtimestamp(now, IST)
        day = local.date().isoformat()
        if now >= health_due:
            health(db, engine)
            health_due = now + 60
        if (engine and engine.day == day and local.strftime('%H:%M') >= '15:35'
                and not engine.state.get('seeded')):
            try:
                count = save_closing_seed(engine)
                with db:
                    db.execute('INSERT OR REPLACE INTO tracking(day,state) VALUES (?,?)',
                               (day,encode(engine.state).decode()))
                print(f'Viper next-session seed {day}: {count} validated full-day levels',flush=True)
            except (OSError, ValueError, KeyError, TypeError):
                health(db,engine,'Waiting for complete close cash export')
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
                cut = source['cut'][:5]
                if source.get('degraded') is not False:
                    # The close export may have stale chain receipts while its
                    # completed cash candle remains valid. Seed cash only; no alert.
                    engine.accept_cash(source)
                    engine.state['last'] = cut
                    doc = None
                else:
                    doc = snapshot(engine, source, now, now - source["exported_at"] > 300)
                if cut == '15:30':
                    try:
                        folder = Path(__file__).parent / 'cash-seeds'
                        folder.mkdir(exist_ok=True)
                        atomic(folder / (day+'.json'),engine.cash_seed())
                        engine.state['seeded'] = True
                    except ValueError:
                        pass  # Existing 15:40 close exporter completes daily levels.
                with db:
                    if doc is not None:
                        enqueue(db, doc)
                    db.execute("INSERT OR REPLACE INTO tracking(day,state) VALUES (?,?)",
                               (day, encode(engine.state).decode()))
                health(db, engine)
                if doc is None:
                    print(f'Viper close cash seeded {day} (degraded chain not published)',flush=True)
                else:
                    print(f"Viper consumed {day} {cut} (export lag {now-source['exported_at']:.1f}s, "
                          f"{len(doc['bull'])}/{len(doc['bear'])} rows, {len(encode(doc))} bytes)", flush=True)
        except (OSError, ValueError, KeyError, TypeError) as error:
            health(db, engine, type(error).__name__)
            engine = None
            if now - last_input_error > 300:
                print(f"Viper input pending {day} ({type(error).__name__})", flush=True)
                last_input_error = now
        worked = deliver_one(db, publisher, day, now) or retry_prior(db, publisher, day, now)
        time.sleep(8 if worked else 20)


def sample(db, calendar, day, publish):
    now = time.time()
    previous = prior_regular(day, calendar)
    engine = Engine(day, read_cut(previous, "15:25", now), prior_cash=read_json(Path(__file__).parent / "cash-seeds" / (previous + ".json"), 2_000_000))
    sample_doc = None
    documents = []
    for cut in CUTS[:7]:
        source = read_cut(day, cut, now)
        sample_doc = snapshot(engine, source, now, True)
        documents.append(sample_doc)
        print(f"Viper sample {day} {cut} {len(sample_doc['bull'])}/{len(sample_doc['bear'])} rows "
              f"{len(encode(sample_doc))} bytes", flush=True)
    if publish:
        publisher = Publisher()
        for doc in documents:
            doc["validation"] = True
            with db:
                enqueue(db, doc)
            deliver_one(db, publisher, day, now)
        found = publisher.read(day)
        row = found.get(sample_doc["Doc_ID"])
        if row != sample_doc:
            raise RuntimeError("Viper ORDS sample read-back did not match")
        print(f"Viper verified ORDS {sample_doc['Doc_ID']} ({len(found)} documents)", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/home/ubuntu/viper-signal"))
    parser.add_argument("--sample")
    parser.add_argument("--publish-sample", action="store_true")
    args = parser.parse_args()
    sys.path.insert(0, "/home/ubuntu/market-calendar")
    import nse_calendar
    if args.sample and not args.publish_sample:
        sample(None, nse_calendar, args.sample, False)
        return
    import fcntl
    with (args.root / "worker.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        db = open_state(args.root / "state.sqlite")
        if args.sample:
            sample(db, nse_calendar, args.sample, True)
        else:
            run(db, nse_calendar)


if __name__ == "__main__":
    main()
