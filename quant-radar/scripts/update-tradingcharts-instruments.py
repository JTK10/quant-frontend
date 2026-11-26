"""Generate the TradingCharts NSE lookup from Dhan's public instrument master."""

import csv
import io
import json
from pathlib import Path
from urllib.request import urlopen


SOURCE = "https://images.dhan.co/api-data/api-scrip-master.csv"
OUTPUT = Path(__file__).resolve().parents[1] / "utils" / "tradingChartsInstruments.json"
EQUITY_SERIES = ("EQ", "BE", "BZ", "SM", "ST")
MAX_BYTES = 64_000_000


def main():
    with urlopen(SOURCE, timeout=40) as response:
        payload = response.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise ValueError("Dhan instrument master exceeds the download limit")

    instruments = {}
    priorities = {}
    for row in csv.DictReader(io.StringIO(payload.decode("utf-8-sig"))):
        if row["SEM_EXM_EXCH_ID"] != "NSE":
            continue
        segment = row["SEM_SEGMENT"]
        instrument = row["SEM_INSTRUMENT_NAME"]
        series = row["SEM_SERIES"]
        if (segment, instrument) == ("I", "INDEX"):
            priority = 0
        elif (segment, instrument) == ("E", "EQUITY") and series in EQUITY_SERIES:
            priority = EQUITY_SERIES.index(series) + 1
        else:
            continue

        symbol = row["SEM_TRADING_SYMBOL"].strip()
        security_id = int(row["SEM_SMST_SECURITY_ID"])
        if not symbol or security_id <= 0:
            raise ValueError("Invalid Dhan instrument")
        candidate = f"NSE{segment}{security_id}:{symbol}"
        previous_priority = priorities.get(symbol)
        if previous_priority == priority and instruments[symbol] != candidate:
            raise ValueError(f"Ambiguous Dhan instrument for {symbol}")
        if previous_priority is None or priority < previous_priority:
            instruments[symbol] = candidate
            priorities[symbol] = priority

    if len(instruments) < 2000 or not {"NIFTY", "RELIANCE", "INDIA VIX"} <= instruments.keys():
        raise ValueError("Dhan instrument master appears incomplete")
    OUTPUT.write_text(json.dumps(instruments, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(instruments)} NSE stock and index identifiers")


if __name__ == "__main__":
    main()
