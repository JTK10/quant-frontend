"""Kairos Clean Runner (kairos_cr) — 3-Trades/Day (1 Lot/Trade) Causal Paper Execution Hook for VM2 Ocelot.

Runs fail-open inside VM2 ocelot.py at every completed 5-minute cut (09:20-15:15 IST):
  - Zero extra processes, zero extra broker subscriptions, ~0 extra RAM on 1 GB VM2.
  - Uses Ocelot's already-fetched 5-minute option chain rows (ltp, bid, ask, oi, vol, spot)
    and rusty_clean_runner.py's causal ★T1/★T2 signals.

Locked Zero-Overfit Production Spec (2026-11-23):
  - Signals: ★T1 + ★T2 only, 09:20-10:35 IST, chronological (cut ASC, tier ASC, score DESC, symbol ASC)
  - Sizing & Caps: Max 3 trades/day, 1 lot/trade, max 1 per symbol, no slot recycling
  - Contract Guards: Nearest ATM (CE Bull / PE Bear, fallback ITM1->OTM1), DTE >= 2,
    LTP >= ₹2.0, OI > 0, volume >= 1 lot, spread <= 5.0%, 1-lot premium <= ₹45,000
  - Exits (strictly evaluated BEFORE peak/state upgrade on each distinct completed 5m cut):
      * OPEN     : Hard SL -30% (`ltp <= entry_ltp * 0.70`) -> STOP_LOSS
      * BE_ARMED : Armed at +30% peak -> floor +5% (`ltp <= entry_ltp * 1.05`) -> BREAKEVEN_LOCK
      * TRAILING : Armed at +60% peak -> trail 25% below peak, clamped >= +5% -> TRAILING_STOP
      * EOD      : Mandatory square-off at 15:15 IST -> EOD_1515
  - Circuit Breaker: -₹18,000 (realized + unrealized net MTM) halts new entries
  - Shadow-Only Log: Records hypothetical CashPD (0.7% back inside PDH/PDL while opt <= -10%)
    in metadata only — does NOT trigger exits.
  - Paper Accounting: Live Ask entry / Live Bid exit (LTP ± 0.5% fallback if book absent) + exact NSE charges.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import math
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

IST = timezone(timedelta(hours=5, minutes=30))
INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"

SOURCE = "kairos_cr"
CAP = "KAIROS_CR"
ENGINE_VERSION = "kairos-cr-paper-v1"
ENTRY_POLICY = "cr-t12-3trades-1lot-atm-sl30-be30to5-tr60-25-eod1515"

MAX_TRADES_PER_DAY = 3
LOTS_PER_TRADE = 1
ALLOWED_TIERS = (1, 2)
ENTRY_START_IST = "09:20"
ENTRY_END_IST = "10:35"
EOD_SQUARE_OFF_IST = "15:15"
DAILY_LOSS_CAP_INR = -18000.0

MIN_DTE = 2
MIN_OPTION_LTP = 2.0
MAX_SPREAD_PCT = 5.0
MAX_PREMIUM_PER_LOT_INR = 45000.0
FALLBACK_SLIP = 0.005

SL_PCT = -30.0
BE_TRIGGER_PCT = 30.0
BE_FLOOR_PCT = 5.0
TRAIL_TRIGGER_PCT = 60.0
TRAIL_DROP_PCT = 25.0

SHADOW_CASH_PD_PCT = 0.7
SHADOW_CASH_OPT_MAX = -10.0

DEFAULT_DATA_DIR = Path("/home/ubuntu/ocelot/kairos_cr_data")


def calc_nse_option_charges(entry_px: float, exit_px: float, qty: int) -> float:
    """Exact Indian NSE Stock Options statutory taxes & charges + ₹20/leg brokerage."""
    buy_val = entry_px * qty
    sell_val = exit_px * qty
    turnover = buy_val + sell_val
    brokerage = 40.0
    stt = 0.001 * sell_val
    exch = 0.0003503 * turnover
    sebi = 0.000001 * turnover
    stamp = 0.00003 * buy_val
    gst = 0.18 * (brokerage + exch + sebi)
    return round(brokerage + stt + exch + sebi + stamp + gst, 2)


def _atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"), allow_nan=False)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def _dte_days(day_iso: str, expiry_iso: Optional[str]) -> Optional[int]:
    if not expiry_iso:
        return None
    try:
        return (date.fromisoformat(str(expiry_iso)[:10]) - date.fromisoformat(str(day_iso)[:10])).days
    except ValueError:
        return None


def _fmt_strike(k: float) -> str:
    return str(int(k)) if float(k).is_integer() else f"{float(k):g}"


def _valid_book(bid: Optional[float], ask: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
    b = float(bid) if (bid is not None and math.isfinite(float(bid)) and float(bid) > 0) else None
    a = float(ask) if (ask is not None and math.isfinite(float(ask)) and float(ask) > 0) else None
    if b is not None and a is not None and b > a:
        return None, None
    return b, a


def _chain_by_symbol(chain_rows: Optional[List[tuple]]) -> Dict[str, List[dict]]:
    """Convert Ocelot's chain_rows tuples into per-symbol option rows.

    Ocelot tuple schema (ocelot.py:1371-1376):
      (cut_ts, sym, expiry, strike, leg, spot, ltp, close_price, oi, prev_oi, vol,
       bid_price, ask_price, bid_qty, ask_qty, delta, iv)
    """
    out: Dict[str, List[dict]] = {}
    if not chain_rows:
        return out
    for row in chain_rows:
        if isinstance(row, dict):
            sym = str(row.get("symbol") or "").upper()
            if sym:
                out.setdefault(sym, []).append(row)
            continue
        if len(row) < 13:
            continue
        sym = str(row[1]).upper()
        out.setdefault(sym, []).append({
            "symbol": sym,
            "expiry": str(row[2])[:10],
            "strike": float(row[3]),
            "leg": str(row[4]).upper(),
            "spot": float(row[5]) if row[5] is not None else 0.0,
            "ltp": float(row[6]) if row[6] is not None else 0.0,
            "oi": int(row[8] or 0),
            "vol": int(row[10] or 0),
            "bid": float(row[11]) if row[11] is not None else None,
            "ask": float(row[12]) if row[12] is not None else None,
        })
    return out


def _infer_lot_size_gcd(rows: List[dict]) -> Optional[int]:
    """Conservative fallback if NSE.json.gz cache is missing for a symbol."""
    vals = []
    for r in rows:
        for k in ("oi", "vol"):
            v = int(r.get(k) or 0)
            if v > 0:
                vals.append(v)
    if len(vals) < 4:
        return None
    g = vals[0]
    for v in vals[1:]:
        g = math.gcd(g, v)
    return g if 10 <= g <= 50000 else None


class LotSizeStore:
    """Loads & caches exact daily NSE F&O lot sizes from Upstox NSE.json.gz."""

    def __init__(self, data_dir: Path = DEFAULT_DATA_DIR):
        self.data_dir = Path(data_dir)
        self.day: Optional[str] = None
        self.lots: Dict[str, int] = {}  # "SYM|YYYY-MM-DD" -> lot_size, plus "SYM" -> front lot_size

    def _cache_path(self, day_iso: str) -> Path:
        return self.data_dir / f"lot_sizes_{day_iso}.json"

    def load_cached(self, day_iso: str) -> bool:
        p = self._cache_path(day_iso)
        if p.exists():
            raw = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and raw.get("day") == day_iso and isinstance(raw.get("lots"), dict):
                self.day = day_iso
                self.lots = {str(k): int(v) for k, v in raw["lots"].items() if int(v) > 0}
                return bool(self.lots)
        # Fallback: newest prior cache if today's hasn't been fetched yet
        if self.data_dir.exists():
            prior = sorted(self.data_dir.glob("lot_sizes_*.json"), reverse=True)
            for cand in prior[:3]:
                try:
                    raw = json.loads(cand.read_text(encoding="utf-8"))
                    if isinstance(raw, dict) and isinstance(raw.get("lots"), dict) and raw["lots"]:
                        self.lots = {str(k): int(v) for k, v in raw["lots"].items() if int(v) > 0}
                        return True
                except Exception:
                    continue
        return False

    async def ensure_loaded(self, client: Any, day_iso: str) -> int:
        if self.day == day_iso and self.lots:
            return len(self.lots)
        if self.load_cached(day_iso) and self.day == day_iso:
            return len(self.lots)
        if client is None:
            return len(self.lots)
        try:
            r = await client.get(INSTRUMENT_URL, timeout=90)
            if r.status_code == 200:
                rows = json.loads(gzip.decompress(r.content).decode("utf-8"))
                lots: Dict[str, int] = {}
                for x in rows:
                    if x.get("segment") != "NSE_FO" or x.get("instrument_type") not in ("CE", "PE"):
                        continue
                    sym = x.get("underlying_symbol")
                    exp_ms = x.get("expiry")
                    lot = x.get("lot_size")
                    if not (sym and exp_ms and lot and int(lot) > 0):
                        continue
                    exp_s = datetime.fromtimestamp(exp_ms / 1000.0, IST).strftime("%Y-%m-%d")
                    sym_u = str(sym).upper()
                    lot_i = int(lot)
                    lots[f"{sym_u}|{exp_s}"] = lot_i
                    if sym_u not in lots:
                        lots[sym_u] = lot_i
                if lots:
                    self.day = day_iso
                    self.lots = lots
                    _atomic_write_json(self._cache_path(day_iso), {"day": day_iso, "lots": lots})
        except Exception:
            self.load_cached(day_iso)
        return len(self.lots)

    def lookup(self, symbol: str, expiry: str, chain_rows: Optional[List[dict]] = None) -> Optional[int]:
        sym_u = str(symbol).upper()
        exp_s = str(expiry)[:10]
        hit = self.lots.get(f"{sym_u}|{exp_s}") or self.lots.get(sym_u)
        if hit and hit > 0:
            return int(hit)
        if chain_rows:
            return _infer_lot_size_gcd(chain_rows)
        return None


class KairosCleanRunnerEngine:
    """Durable, strictly causal 3-trades/day paper execution state machine."""

    def __init__(self, data_dir: Path = DEFAULT_DATA_DIR, lot_store: Optional[LotSizeStore] = None):
        self.data_dir = Path(data_dir)
        self.lot_store = lot_store or LotSizeStore(self.data_dir)
        self.state: Dict[str, Any] = {}
        self.day: Optional[str] = None

    def _state_path(self, day_iso: str) -> Path:
        return self.data_dir / f"state_{day_iso}.json"

    def load_day(self, day_iso: str) -> None:
        if self.day == day_iso and self.state.get("date") == day_iso:
            return
        self.day = day_iso
        p = self._state_path(day_iso)
        if p.exists():
            raw = json.loads(p.read_text(encoding="utf-8"))
            if raw.get("schema") == 1 and raw.get("date") == day_iso:
                self.state = raw
                return
        self.state = {
            "schema": 1,
            "engine": ENGINE_VERSION,
            "date": day_iso,
            "sequence": 0,
            "last_cut": "",
            "taken_symbols": [],
            "skipped_ids": [],
            "positions": [],
            "pending": [],
            "status": "Ready for 09:20 IST Clean-Runner signals",
            "last_decision": None,
            "last_error": None,
        }
        self.save()

    def save(self) -> None:
        if not self.day:
            return
        if len(self.state.get("pending", [])) > 500:
            self.state["pending"] = self.state["pending"][-500:]
        _atomic_write_json(self._state_path(self.day), self.state)

    def _emit(self, kind: str, now_ts: float, hm_str: str, payload: Dict[str, Any]) -> dict:
        self.state["sequence"] = int(self.state.get("sequence", 0)) + 1
        seq = self.state["sequence"]
        day_iso = self.state["date"]
        checked_at = datetime.fromtimestamp(now_ts, IST).isoformat()
        doc: Dict[str, Any] = {
            "source": SOURCE,
            "cap": CAP,
            "mode": "paper",
            "engine": ENGINE_VERSION,
            "entry_policy": ENTRY_POLICY,
            "kind": kind,
            "event": kind,
            "name": "",
            "side": "NEUTRAL",
            "date": day_iso,
            "sig_date": day_iso.replace("-", ""),
            "ts": round(now_ts, 3),
            "time": hm_str if len(hm_str) == 8 else f"{hm_str}:00",
            "checked_at": checked_at,
        }
        doc.update(payload)
        identity = f"{ENGINE_VERSION}|{day_iso}|{seq}|{kind}"
        doc["Doc_ID"] = hashlib.sha256(identity.encode("utf-8")).hexdigest()
        self.state["pending"].append(doc)
        return doc

    def _open_positions(self) -> List[dict]:
        return [p for p in self.state["positions"] if p["state"] != "CLOSED"]

    def _realized_net(self) -> float:
        return sum(float(p.get("net_pnl") or 0.0) for p in self.state["positions"] if p["state"] == "CLOSED")

    def _unrealized_net(self) -> float:
        return sum(float(p.get("unrealized_net_pnl") or 0.0) for p in self.state["positions"] if p["state"] != "CLOSED")

    def _total_net_mtm(self) -> float:
        return self._realized_net() + self._unrealized_net()

    def _select_contract(
        self,
        day_iso: str,
        sym: str,
        side: str,
        expiry: str,
        spot: float,
        rows: List[dict],
    ) -> Tuple[Optional[dict], Optional[str]]:
        dte = _dte_days(day_iso, expiry)
        if dte is not None and dte < MIN_DTE:
            return None, f"DTE {dte} < {MIN_DTE} expiry guard"

        leg = "CE" if side == "BULL" else "PE"
        lot = self.lot_store.lookup(sym, expiry, rows)
        if not lot or lot <= 0:
            return None, "Missing verified NSE lot size"

        valid = [
            r for r in rows
            if r.get("leg") == leg
            and float(r.get("ltp") or 0.0) >= MIN_OPTION_LTP
            and int(r.get("oi") or 0) > 0
            and int(r.get("vol") or 0) >= lot
        ]
        if not valid:
            return None, f"No liquid {leg} strike (ltp>=2, oi>0, vol>=1 lot)"

        by_k = {float(r["strike"]): r for r in valid}
        strikes = sorted(by_k.keys())
        atm_idx = min(range(len(strikes)), key=lambda i: abs(strikes[i] - spot))
        itm_idx = atm_idx - 1 if side == "BULL" else atm_idx + 1
        otm_idx = atm_idx + 1 if side == "BULL" else atm_idx - 1

        last_reason = "No contract passed liquidity/capital guards"
        for stype, idx in (("ATM", atm_idx), ("ITM1", itm_idx), ("OTM1", otm_idx)):
            if not (0 <= idx < len(strikes)):
                continue
            k = strikes[idx]
            row = by_k[k]
            ltp = float(row["ltp"])
            bid, ask = _valid_book(row.get("bid"), row.get("ask"))
            spread_pct = None
            if bid is not None and ask is not None and ltp > 0:
                spread_pct = (ask - bid) / ltp * 100.0
                if spread_pct > MAX_SPREAD_PCT:
                    last_reason = f"{stype} {_fmt_strike(k)} {leg} spread {spread_pct:.1f}% > {MAX_SPREAD_PCT:.0f}%"
                    continue
            fill_entry = ask if (ask is not None and ask > 0) else round(ltp * (1.0 + FALLBACK_SLIP), 2)
            fill_mode = "LIVE_ASK" if (ask is not None and ask > 0) else "LTP_SLIP"
            cap_used = fill_entry * lot * LOTS_PER_TRADE
            if cap_used > MAX_PREMIUM_PER_LOT_INR:
                last_reason = f"{stype} {_fmt_strike(k)} {leg} premium Rs{cap_used:,.0f} > Rs{MAX_PREMIUM_PER_LOT_INR:,.0f}"
                continue
            return {
                "symbol": sym,
                "side": side,
                "leg": leg,
                "expiry": str(row.get("expiry") or expiry)[:10],
                "dte": dte,
                "strike": k,
                "strike_type": stype,
                "name": f"{sym} {_fmt_strike(k)} {leg}",
                "lot_size": lot,
                "lots": LOTS_PER_TRADE,
                "quantity": lot * LOTS_PER_TRADE,
                "raw_ltp": round(ltp, 2),
                "bid": round(bid, 2) if bid is not None else None,
                "ask": round(ask, 2) if ask is not None else None,
                "spread_pct": round(spread_pct, 2) if spread_pct is not None else None,
                "fill_entry": round(fill_entry, 2),
                "fill_mode": fill_mode,
                "capital_used": round(cap_used, 2),
                "spot": round(float(row.get("spot") or spot), 2),
            }, None
        return None, last_reason

    def _emit_skip(self, now_ts: float, hm_now: str, sig: dict, reason: str) -> None:
        sid = f"{self.day}_{hm_now.replace(':', '')}_{sig['symbol']}_{sig['side']}"
        if sid in self.state["skipped_ids"]:
            return
        self.state["skipped_ids"].append(sid)
        self.state["last_decision"] = {"symbol": sig["symbol"], "cut": hm_now, "reason": f"Skipped: {reason}"}
        self._emit("SKIP", now_ts, hm_now, {
            "signal_id": sid,
            "name": sig["symbol"],
            "underlying": sig["symbol"],
            "side": "LONG" if sig["side"] == "BULL" else "SHORT",
            "cr_tier": sig["tier"],
            "cr_lane": sig["lane"],
            "cr_score": sig["score"],
            "signal_cut": hm_now,
            "reason": reason,
        })

    def process_cut(
        self,
        day_iso: str,
        hm_now: str,
        now_ts: float,
        rusty_doc: Optional[dict],
        chain_rows: Optional[List[tuple]],
        lv: Optional[Dict[str, dict]],
        expiry: Optional[str],
    ) -> Dict[str, Any]:
        """Process one completed 5-minute Ocelot cut deterministically & causally."""
        self.load_day(day_iso)

        # Idempotency guard: never re-evaluate the same or an older 5-minute cut
        if self.state.get("last_cut") and hm_now <= self.state["last_cut"]:
            return {"skipped_duplicate_cut": hm_now}

        by_sym = _chain_by_symbol(chain_rows)
        lv = lv or {}
        dte_now = _dte_days(day_iso, expiry)

        # ------------------------------------------------------------------
        # 1) UPDATE & EVALUATE EXITS ON ALL OPEN POSITIONS (BEFORE NEW ENTRIES)
        # ------------------------------------------------------------------
        for pos in self._open_positions():
            if hm_now <= pos["entry_cut"]:
                continue
            sym_rows = by_sym.get(pos["underlying"], [])
            match = None
            for r in sym_rows:
                if r["leg"] == pos["leg"] and abs(float(r["strike"]) - float(pos["strike"])) < 1e-6:
                    match = r
                    break

            if match is None or float(match.get("ltp") or 0.0) <= 0:
                # At or after 15:15 EOD, force square-off at last known mark if quote missing
                if hm_now >= EOD_SQUARE_OFF_IST:
                    ltp_now = float(pos["last_ltp"])
                    bid_now, ask_now = pos.get("last_bid"), pos.get("last_ask")
                    spot_now = float(pos.get("last_spot") or pos.get("entry_spot") or 0.0)
                else:
                    continue
            else:
                ltp_now = float(match["ltp"])
                bid_now, ask_now = _valid_book(match.get("bid"), match.get("ask"))
                spot_now = float(match.get("spot") or pos.get("last_spot") or 0.0)

            raw_entry = float(pos["raw_entry_ltp"])
            fill_entry = float(pos["fill_entry"])
            qty = int(pos["quantity"])
            peak_ltp = float(pos["peak_ltp"])
            opt_ret = (ltp_now / raw_entry - 1.0) * 100.0

            # Shadow-only CashPD (0.7%, opt <= -10%) diagnostic — NEVER triggers exits
            if not pos.get("shadow_cash_pd") and opt_ret <= SHADOW_CASH_OPT_MAX and spot_now > 0:
                pd_lvl = float(pos.get("pd_level") or 0.0)
                if pd_lvl > 0:
                    reclaimed = (
                        (pos["raw_side"] == "BULL" and spot_now < pd_lvl * (1.0 - SHADOW_CASH_PD_PCT / 100.0))
                        or (pos["raw_side"] == "BEAR" and spot_now > pd_lvl * (1.0 + SHADOW_CASH_PD_PCT / 100.0))
                    )
                    if reclaimed:
                        pos["shadow_cash_pd"] = {
                            "cut": hm_now,
                            "spot": round(spot_now, 2),
                            "ltp": round(ltp_now, 2),
                            "opt_ret": round(opt_ret, 2),
                        }

            # STRICTLY CAUSAL STOP CHECK BEFORE UPDATING PEAK OR STATE
            reason: Optional[str] = None
            cur_state = pos["state"]
            if hm_now >= EOD_SQUARE_OFF_IST:
                reason = "EOD_1515"
            elif cur_state == "TRAILING":
                stop_px = max(raw_entry * (1.0 + BE_FLOOR_PCT / 100.0), peak_ltp * (1.0 - TRAIL_DROP_PCT / 100.0))
                if ltp_now <= stop_px:
                    reason = "TRAILING_STOP"
            elif cur_state == "BE_ARMED":
                stop_px = raw_entry * (1.0 + BE_FLOOR_PCT / 100.0)
                if ltp_now <= stop_px:
                    reason = "BREAKEVEN_LOCK"
            elif cur_state == "OPEN":
                stop_px = raw_entry * (1.0 + SL_PCT / 100.0)
                if ltp_now <= stop_px:
                    reason = "STOP_LOSS"

            # Mark / Exit fill using live Bid (or LTP - 0.5% fallback)
            mark_exit = bid_now if (bid_now is not None and bid_now > 0) else max(0.05, round(ltp_now * (1.0 - FALLBACK_SLIP), 2))
            exit_fill_mode = "LIVE_BID" if (bid_now is not None and bid_now > 0) else "LTP_SLIP"
            est_charges = calc_nse_option_charges(fill_entry, mark_exit, qty)
            gross_pnl = round((ltp_now - raw_entry) * qty, 2)
            net_pnl = round((mark_exit - fill_entry) * qty - est_charges, 2)

            pos["last_ltp"] = round(ltp_now, 2)
            pos["last_bid"] = round(bid_now, 2) if bid_now is not None else None
            pos["last_ask"] = round(ask_now, 2) if ask_now is not None else None
            pos["last_spot"] = round(spot_now, 2)
            pos["last_cut"] = hm_now

            if reason is not None:
                pos["state"] = "CLOSED"
                pos["exit_cut"] = hm_now
                pos["exit_at"] = datetime.fromtimestamp(now_ts, IST).isoformat()
                pos["exit_reason"] = reason
                pos["raw_exit_ltp"] = round(ltp_now, 2)
                pos["fill_exit"] = round(mark_exit, 2)
                pos["exit_fill_mode"] = exit_fill_mode
                pos["gross_pnl"] = gross_pnl
                pos["charges"] = est_charges
                pos["net_pnl"] = net_pnl
                pos["unrealized_net_pnl"] = 0.0
                self.state["last_decision"] = {
                    "symbol": pos["underlying"],
                    "cut": hm_now,
                    "reason": f"Exit {reason} @ Rs{mark_exit:.2f} (Net {net_pnl:+,.0f})",
                }
                self._emit("EXIT", now_ts, hm_now, {
                    "signal_id": pos["signal_id"],
                    "name": pos["name"],
                    "underlying": pos["underlying"],
                    "side": pos["side"],
                    "expiry": pos["expiry"],
                    "strike": pos["strike"],
                    "dte": pos["dte"],
                    "cr_tier": pos["cr_tier"],
                    "cr_lane": pos["cr_lane"],
                    "cr_score": pos["cr_score"],
                    "cr_state": "CLOSED",
                    "entry_fill": fill_entry,
                    "entry": round(mark_exit, 2),
                    "ref_prem": round(ltp_now, 2),
                    "bid": pos["last_bid"],
                    "ask": pos["last_ask"],
                    "fill_mode": exit_fill_mode,
                    "quantity": qty,
                    "lots": pos["lots"],
                    "lot_size": pos["lot_size"],
                    "capital_used": pos["capital_used"],
                    "stop_premium": pos["stop_premium"],
                    "stop_pct": pos["stop_pct"],
                    "peak_ltp": pos["peak_ltp"],
                    "peak_gain_pct": round((pos["peak_ltp"] / raw_entry - 1.0) * 100.0, 2),
                    "gain_pct": round(opt_ret, 2),
                    "gross_pnl": gross_pnl,
                    "charges": est_charges,
                    "pnl": net_pnl,
                    "reason": reason,
                    "entry_at": pos["entry_at"],
                    "exit_at": pos["exit_at"],
                    "quote_at": pos["exit_at"],
                    "shadow_cash_pd": pos.get("shadow_cash_pd"),
                })
            else:
                # Advance peak & stop state STRICTLY AFTER stop check
                if ltp_now > peak_ltp:
                    peak_ltp = ltp_now
                    pos["peak_ltp"] = round(peak_ltp, 2)
                peak_ret = (peak_ltp / raw_entry - 1.0) * 100.0
                if peak_ret >= TRAIL_TRIGGER_PCT:
                    pos["state"] = "TRAILING"
                    sp = max(raw_entry * (1.0 + BE_FLOOR_PCT / 100.0), peak_ltp * (1.0 - TRAIL_DROP_PCT / 100.0))
                    pos["stop_premium"] = round(sp, 2)
                    pos["stop_pct"] = round((sp / raw_entry - 1.0) * 100.0, 1)
                elif peak_ret >= BE_TRIGGER_PCT and pos["state"] == "OPEN":
                    pos["state"] = "BE_ARMED"
                    sp = raw_entry * (1.0 + BE_FLOOR_PCT / 100.0)
                    pos["stop_premium"] = round(sp, 2)
                    pos["stop_pct"] = BE_FLOOR_PCT
                pos["unrealized_net_pnl"] = net_pnl
                self._emit("MTM", now_ts, hm_now, {
                    "signal_id": pos["signal_id"],
                    "name": pos["name"],
                    "underlying": pos["underlying"],
                    "side": pos["side"],
                    "expiry": pos["expiry"],
                    "strike": pos["strike"],
                    "dte": pos["dte"],
                    "cr_tier": pos["cr_tier"],
                    "cr_lane": pos["cr_lane"],
                    "cr_score": pos["cr_score"],
                    "cr_state": pos["state"],
                    "entry_fill": fill_entry,
                    "entry": round(mark_exit, 2),
                    "ref_prem": round(ltp_now, 2),
                    "bid": pos["last_bid"],
                    "ask": pos["last_ask"],
                    "fill_mode": exit_fill_mode,
                    "quantity": qty,
                    "lots": pos["lots"],
                    "lot_size": pos["lot_size"],
                    "capital_used": pos["capital_used"],
                    "stop_premium": pos["stop_premium"],
                    "stop_pct": pos["stop_pct"],
                    "peak_ltp": pos["peak_ltp"],
                    "peak_gain_pct": round(peak_ret, 2),
                    "gain_pct": round(opt_ret, 2),
                    "gross_pnl": gross_pnl,
                    "charges": est_charges,
                    "pnl": net_pnl,
                    "quote_at": datetime.fromtimestamp(now_ts, IST).isoformat(),
                    "shadow_cash_pd": pos.get("shadow_cash_pd"),
                })

        # ------------------------------------------------------------------
        # 2) INGEST NEW CLEAN-RUNNER ★T1/★T2 SIGNALS AT THIS CUT (09:20-10:35)
        # ------------------------------------------------------------------
        if ENTRY_START_IST <= hm_now <= ENTRY_END_IST and isinstance(rusty_doc, dict):
            incoming: List[dict] = []
            for side_key, side_lbl in (("bull", "BULL"), ("bear", "BEAR")):
                for row in rusty_doc.get(side_key) or []:
                    if not isinstance(row, dict):
                        continue
                    tier = row.get("cr_tier")
                    cr_cut = str(row.get("cr_cut") or "")
                    if tier not in ALLOWED_TIERS or cr_cut != hm_now:
                        continue
                    sym = str(row.get("n") or row.get("symbol") or "").upper()
                    if not sym:
                        continue
                    incoming.append({
                        "symbol": sym,
                        "side": side_lbl,
                        "tier": int(tier),
                        "lane": str(row.get("cr_lane") or ""),
                        "score": float(row.get("cr_score") or 0.0),
                        "spot": float(row.get("spot") or row.get("c_close") or 0.0),
                    })

            # Deterministic causal tie-break: Tier ASC, Score DESC, Symbol ASC
            incoming.sort(key=lambda s: (s["tier"], -s["score"], s["symbol"]))

            for sig in incoming:
                sym = sig["symbol"]
                if sym in self.state["taken_symbols"]:
                    continue
                if len(self.state["positions"]) >= MAX_TRADES_PER_DAY:
                    self._emit_skip(now_ts, hm_now, sig, f"Daily {MAX_TRADES_PER_DAY}-trade cap reached")
                    continue
                if self._total_net_mtm() <= DAILY_LOSS_CAP_INR:
                    self._emit_skip(now_ts, hm_now, sig, f"Daily MTM breaker hit ({self._total_net_mtm():+,.0f} <= {DAILY_LOSS_CAP_INR:,.0f})")
                    continue

                sym_rows = by_sym.get(sym, [])
                spot = sig["spot"] or (float(sym_rows[0]["spot"]) if sym_rows else 0.0)
                exp_use = str(expiry or (sym_rows[0]["expiry"] if sym_rows else ""))[:10]
                if not sym_rows or spot <= 0 or not exp_use:
                    self._emit_skip(now_ts, hm_now, sig, "Option chain unavailable at cut")
                    continue

                contract, rej = self._select_contract(day_iso, sym, sig["side"], exp_use, spot, sym_rows)
                if contract is None:
                    self._emit_skip(now_ts, hm_now, sig, rej or "Contract guard rejected")
                    continue

                sid = f"{day_iso}_{hm_now.replace(':', '')}_{sym}_{sig['side']}"
                lv_sym = lv.get(sym) or {}
                pd_lvl = float(lv_sym.get("pdh") or 0.0) if sig["side"] == "BULL" else float(lv_sym.get("pdl") or 0.0)
                stop_px = round(contract["raw_ltp"] * (1.0 + SL_PCT / 100.0), 2)
                entry_at = datetime.fromtimestamp(now_ts, IST).isoformat()

                pos = {
                    "signal_id": sid,
                    "name": contract["name"],
                    "underlying": sym,
                    "side": "LONG" if sig["side"] == "BULL" else "SHORT",
                    "raw_side": sig["side"],
                    "leg": contract["leg"],
                    "expiry": contract["expiry"],
                    "dte": contract["dte"],
                    "strike": contract["strike"],
                    "strike_type": contract["strike_type"],
                    "lot_size": contract["lot_size"],
                    "lots": contract["lots"],
                    "quantity": contract["quantity"],
                    "cr_tier": sig["tier"],
                    "cr_lane": sig["lane"],
                    "cr_score": sig["score"],
                    "entry_cut": hm_now,
                    "entry_at": entry_at,
                    "entry_spot": contract["spot"],
                    "pd_level": round(pd_lvl, 2),
                    "raw_entry_ltp": contract["raw_ltp"],
                    "fill_entry": contract["fill_entry"],
                    "entry_fill_mode": contract["fill_mode"],
                    "capital_used": contract["capital_used"],
                    "peak_ltp": contract["raw_ltp"],
                    "last_ltp": contract["raw_ltp"],
                    "last_bid": contract["bid"],
                    "last_ask": contract["ask"],
                    "last_spot": contract["spot"],
                    "last_cut": hm_now,
                    "state": "OPEN",
                    "stop_premium": stop_px,
                    "stop_pct": SL_PCT,
                    "unrealized_net_pnl": 0.0,
                    "gross_pnl": 0.0,
                    "charges": 0.0,
                    "net_pnl": 0.0,
                    "shadow_cash_pd": None,
                }
                self.state["positions"].append(pos)
                self.state["taken_symbols"].append(sym)
                self.state["last_decision"] = {
                    "symbol": sym,
                    "cut": hm_now,
                    "reason": f"Entered ★T{sig['tier']} {contract['name']} @ Rs{contract['fill_entry']:.2f} ({contract['fill_mode']})",
                }
                self._emit("ENTRY", now_ts, hm_now, {
                    "signal_id": sid,
                    "name": pos["name"],
                    "underlying": sym,
                    "side": pos["side"],
                    "expiry": pos["expiry"],
                    "strike": pos["strike"],
                    "dte": pos["dte"],
                    "cr_tier": sig["tier"],
                    "cr_lane": sig["lane"],
                    "cr_score": sig["score"],
                    "cr_state": "OPEN",
                    "signal_cut": hm_now,
                    "entry": pos["fill_entry"],
                    "entry_fill": pos["fill_entry"],
                    "ref_prem": pos["raw_entry_ltp"],
                    "bid": contract["bid"],
                    "ask": contract["ask"],
                    "slip_pct": contract["spread_pct"],
                    "fill_mode": contract["fill_mode"],
                    "quantity": pos["quantity"],
                    "lots": pos["lots"],
                    "lot_size": pos["lot_size"],
                    "capital_used": pos["capital_used"],
                    "stop_premium": stop_px,
                    "stop_pct": SL_PCT,
                    "peak_ltp": pos["peak_ltp"],
                    "peak_gain_pct": 0.0,
                    "gain_pct": 0.0,
                    "gross_pnl": 0.0,
                    "charges": 0.0,
                    "pnl": 0.0,
                    "entry_at": entry_at,
                    "quote_at": entry_at,
                })

        # ------------------------------------------------------------------
        # 3) HEALTH HEARTBEAT & ATOMIC SAVE
        # ------------------------------------------------------------------
        open_cnt = len(self._open_positions())
        used_slots = len(self.state["positions"])
        breaker_hit = self._total_net_mtm() <= DAILY_LOSS_CAP_INR
        if hm_now >= EOD_SQUARE_OFF_IST and open_cnt == 0:
            status = f"Session complete ({used_slots}/{MAX_TRADES_PER_DAY} trades)"
        elif open_cnt > 0:
            status = f"Monitoring {open_cnt} open ({used_slots}/{MAX_TRADES_PER_DAY} slots)"
        elif breaker_hit:
            status = f"Daily loss breaker active ({self._total_net_mtm():+,.0f})"
        elif hm_now > ENTRY_END_IST:
            status = f"Entry window closed ({used_slots}/{MAX_TRADES_PER_DAY} trades)"
        else:
            status = f"Scanning ★T1/★T2 ({used_slots}/{MAX_TRADES_PER_DAY} slots)"

        self.state["last_cut"] = hm_now
        self.state["status"] = status
        self._emit("HEALTH", now_ts, hm_now, {
            "status": status,
            "last_cut": hm_now,
            "expiry": str(expiry or "")[:10],
            "dte": dte_now,
            "open_positions": open_cnt,
            "slots_used": used_slots,
            "daily_entries": used_slots,
            "max_trades": MAX_TRADES_PER_DAY,
            "daily_loss_cap": DAILY_LOSS_CAP_INR,
            "breaker_hit": breaker_hit,
            "heartbeat_seconds": 300 if "09:15" <= hm_now <= "15:30" else 900,
            "last_decision": self.state.get("last_decision"),
            "last_error": self.state.get("last_error"),
        })
        self.save()
        return {"cut": hm_now, "open": open_cnt, "slots_used": used_slots, "pending": len(self.state["pending"])}

    def emit_startup_health(self, day_iso: str, now_ts: float, expiry: Optional[str], lots_count: int) -> None:
        self.load_day(day_iso)
        hm_now = datetime.fromtimestamp(now_ts, IST).strftime("%H:%M:%S")
        open_cnt = len(self._open_positions())
        used_slots = len(self.state["positions"])
        dte_now = _dte_days(day_iso, expiry)
        status = (
            f"Monitoring {open_cnt} open ({used_slots}/{MAX_TRADES_PER_DAY} slots)"
            if open_cnt > 0
            else f"Ready · {lots_count} NSE lot sizes loaded (exp {str(expiry or '')[:10]})"
        )
        self.state["status"] = status
        self._emit("HEALTH", now_ts, hm_now, {
            "status": status,
            "last_cut": self.state.get("last_cut") or "",
            "expiry": str(expiry or "")[:10],
            "dte": dte_now,
            "open_positions": open_cnt,
            "slots_used": used_slots,
            "daily_entries": used_slots,
            "max_trades": MAX_TRADES_PER_DAY,
            "daily_loss_cap": DAILY_LOSS_CAP_INR,
            "breaker_hit": self._total_net_mtm() <= DAILY_LOSS_CAP_INR,
            "heartbeat_seconds": 900,
            "last_decision": self.state.get("last_decision"),
            "last_error": self.state.get("last_error"),
        })
        self.save()

    async def flush_pending(self, client: Any, cfg: Optional[dict], ords_token_fn: Callable) -> int:
        """Publish queued docs to ORDS with bounded timeouts; retain unsent docs for retry."""
        if not cfg or client is None or not self.state.get("pending"):
            return 0
        sent = 0
        try:
            tok = await ords_token_fn(client, cfg)
            headers = {"Authorization": "Bearer " + tok, "Content-Type": "application/json"}
            url = cfg["base"] + cfg["path"]
            remaining = []
            failed = False
            for doc in self.state["pending"]:
                if failed:
                    remaining.append(doc)
                    continue
                try:
                    r = await client.post(url, content=json.dumps(doc), headers=headers, timeout=12)
                    if r.status_code in (200, 201):
                        sent += 1
                    else:
                        self.state["last_error"] = f"ORDS HTTP {r.status_code}"
                        remaining.append(doc)
                        failed = True
                except Exception as exc:
                    self.state["last_error"] = f"ORDS {type(exc).__name__}"
                    remaining.append(doc)
                    failed = True
            if not failed:
                self.state["last_error"] = None
            self.state["pending"] = remaining
            self.save()
        except Exception as exc:
            self.state["last_error"] = f"ORDS token {type(exc).__name__}"
            self.save()
        return sent


_ENGINE: Optional[KairosCleanRunnerEngine] = None


def _get_engine() -> KairosCleanRunnerEngine:
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = KairosCleanRunnerEngine(DEFAULT_DATA_DIR)
    return _ENGINE


async def on_startup(client: Any, expiry: Optional[str], cfg: Optional[dict], ords_token_fn: Callable) -> int:
    eng = _get_engine()
    now_dt = datetime.now(IST)
    day_iso = now_dt.strftime("%Y-%m-%d")
    lots_n = await eng.lot_store.ensure_loaded(client, day_iso)
    eng.emit_startup_health(day_iso, now_dt.timestamp(), expiry, lots_n)
    return await eng.flush_pending(client, cfg, ords_token_fn)


async def on_cut(
    client: Any,
    cut_ts: datetime,
    rusty_doc: Optional[dict],
    chain_rows: Optional[List[tuple]],
    lv: Optional[Dict[str, dict]],
    expiry: Optional[str],
    cfg: Optional[dict],
    ords_token_fn: Callable,
) -> Dict[str, Any]:
    eng = _get_engine()
    day_iso = cut_ts.strftime("%Y-%m-%d")
    hm_now = cut_ts.strftime("%H:%M")
    await eng.lot_store.ensure_loaded(client, day_iso)
    res = eng.process_cut(day_iso, hm_now, time.time(), rusty_doc, chain_rows, lv, expiry)
    res["published"] = await eng.flush_pending(client, cfg, ords_token_fn)
    return res
