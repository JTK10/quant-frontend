"""Causal 11-Lane Clean-Runner Maximizer enrichment for live VM2 Ocelot Rusty publications.
Pure Python stdlib only. Zero broker calls, zero database readers, zero external workers.

Causality & Zero-Future-Leakage Invariants:
- All prior-day price structure (PDH, PDL, prev_close, 3d High/Low, 5d High/Low, 10d ATR)
  and 3-5 day EOD option-selling fortress bands (pd_fresh_oi_5d_share, pd_fresh_ext_5d_L)
  are loaded strictly from sessions `< day` (never `>= day`).
- All intraday cash trajectory features (open0, run_hi, run_lo, vwap, cum_rvol, bar_rvol,
  or15_hi, or15_lo, prev_bars_broken, bar_low_holds_pd, pre_break_mae_open, mkt_breadth_dir)
  use only completed 5-minute cash candles whose bar close is `<= cut_hm`.
- All intraday option-chain pressure & seller-trap features (broken_ext_share, blk_oi_2pct_pd,
  room_entry_to_oi_wall, broken_oi_chg_prev, tgt_oi_chg_prev, opp_floor_oi_chg_open,
  tgt_ltp_chg_open, and L2_WALL_SMASH cascade tip/unwind) use only the prior EOD carry
  plus today's chain snapshots at `<= cut_hm`.
- Once a `(date, symbol, side)` triggers at cut `T` (`09:20 <= T <= 10:35`), its trigger record
  (`cr_tier`, `cr_lane`, `cr_cut`, `cr_score`) is persisted atomically in
  `rusty_clean_runner_data/YYYY-MM-DD.json` and remains sticky for all subsequent cuts `>= T`.
"""
import json
import math
import os
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).with_name("rusty_clean_runner_data")
RVOL_ROOT = Path(__file__).with_name("rusty_rvol_data")
PALLAS_DIR = Path("/home/ubuntu/pallas/input")
_store = None


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def read_json(path, limit=16_000_000):
    if not path.exists() or path.stat().st_size > limit:
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def calc_dte(day_str, expiry_str):
    if not day_str or not expiry_str or len(day_str) < 10 or len(expiry_str) < 10:
        return 10
    try:
        d0 = datetime.fromisoformat(day_str[:10]).date()
        e0 = datetime.fromisoformat(expiry_str[:10]).date()
        # Trading DTE approximation matching expiry_calendar_50d.csv (~5/7 of calendar days, bounded >=1)
        cal = (e0 - d0).days
        if cal <= 0:
            return 1
        # Exact weekday count between (d0, e0]
        w = 0
        cur = d0
        while cur < e0:
            cur += timedelta(days=1)
            if cur.weekday() < 5:
                w += 1
        return max(1, w)
    except Exception:
        return 10


class CleanRunnerStore:
    def __init__(self, root=ROOT, rvol_root=RVOL_ROOT, pallas_dir=PALLAS_DIR):
        self.root = Path(root)
        self.rvol_root = Path(rvol_root)
        self.pallas_dir = Path(pallas_dir)
        self.day = None
        self.expiry = None
        self.dte = 10
        self.daily_hist = {}      # {sym: {date: [op, hi, lo, cl]}} strictly < self.day
        self.eod_chains = {}      # {date: {sym: {"expiry": exp, "spot": sp, "CE": {k: [oi, ltp]}, "PE": {k: [oi, ltp]}}}}
        self.vol_hist = {}        # {sym: {date: {hm: vol}}} strictly < self.day (last 20 sessions)
        self.daily_stats = {}     # {sym: dict(prev_cl, pdh, pdl, pd_range_pct, hi3, lo3, hi5, lo5, atr10)}
        self.fortress_cache = {}  # {(sym, side, expiry, pdh, pdl): dict(same_exp_hist_days, pd_fresh_oi_5d_share, pd_fresh_ext_5d_L)}
        self.bars_today = {}      # {sym: {hm: [op, hi, lo, cl, vol]}}
        self.base_open = {}       # {(sym, leg): {k: [poi, oi0, ltp0, ltp_eod]}}
        self.triggers = {}        # {"bull": {sym: {cr_tier, cr_lane, cr_cut, cr_score}}, "bear": {...}}

    def _load_rvol_history(self, day):
        seed_path = self.rvol_root / "seed.json"
        seed = read_json(seed_path, 16_000_000) or {}
        history = {s: dict(days) for s, days in (seed.get("symbols") or {}).items()}
        if self.rvol_root.exists():
            for p in sorted(self.rvol_root.glob("????-??-??.json")):
                if p.stem < day:
                    saved = read_json(p, 1_000_000)
                    if saved and saved.get("date") == p.stem:
                        for sym, bars in (saved.get("symbols") or {}).items():
                            history.setdefault(sym, {})[p.stem] = bars
        self.vol_hist = {}
        for sym, days in history.items():
            prior_days = [d for d in sorted(days) if d < day][-20:]
            self.vol_hist[sym] = {d: days[d] for d in prior_days}

    def _load_daily_and_eod_history(self, day):
        seed = read_json(self.root / "seed.json", 16_000_000) or {}
        d_hist = {s: dict(days) for s, days in (seed.get("daily") or {}).items()}
        e_hist = dict(seed.get("eod_chains") or {})

        # Fold in any saved daily summary files in self.root strictly < day
        if self.root.exists():
            for p in sorted(self.root.glob("eod-????-??-??.json")):
                d_str = p.stem[4:]
                if d_str < day:
                    saved = read_json(p, 4_000_000)
                    if saved and saved.get("date") == d_str:
                        for sym, ohlc in (saved.get("daily") or {}).items():
                            d_hist.setdefault(sym, {})[d_str] = ohlc
                        if saved.get("eod_chain"):
                            e_hist[d_str] = saved["eod_chain"]

        # Also harvest any 15:25 Pallas files strictly < day that aren't in e_hist yet
        if self.pallas_dir.exists():
            for p in sorted(self.pallas_dir.glob("????????-1525.json")):
                raw_d = p.stem.split("-")[0]
                d_str = f"{raw_d[:4]}-{raw_d[4:6]}-{raw_d[6:8]}"
                if d_str < day and d_str not in e_hist:
                    pdata = read_json(p, 5_000_000)
                    if pdata:
                        exp = str(pdata.get("expiry") or "")[:10]
                        bases = pdata.get("baselines") or {}
                        chains = pdata.get("chains") or {}
                        day_eod = {}
                        for sym, rows in chains.items():
                            b = bases.get(sym) or {}
                            sp = float(b.get("spot") or 0.0)
                            if sp <= 0:
                                continue
                            ce_map, pe_map = {}, {}
                            for r in rows:
                                k, leg, ltp, oi = float(r[0]), r[1], float(r[2] or 0.0), float(r[3] or 0.0)
                                if oi > 0 and abs(k / sp - 1.0) <= 0.12:
                                    if leg == "CE":
                                        ce_map[str(k)] = [oi, ltp]
                                    elif leg == "PE":
                                        pe_map[str(k)] = [oi, ltp]
                            day_eod[sym] = {"expiry": exp, "spot": sp, "CE": ce_map, "PE": pe_map}
                        if day_eod:
                            e_hist[d_str] = day_eod

        # Filter strictly < day and keep last 12 sessions for daily OHLC, last 7 sessions for EOD chains
        self.daily_hist = {}
        for sym, days in d_hist.items():
            pdays = [d for d in sorted(days) if d < day][-12:]
            if pdays:
                self.daily_hist[sym] = {d: days[d] for d in pdays}

        e_days = [d for d in sorted(e_hist) if d < day][-7:]
        self.eod_chains = {d: e_hist[d] for d in e_days}

        # Precompute daily_stats per symbol from self.daily_hist (< day)
        self.daily_stats = {}
        for sym, days_map in self.daily_hist.items():
            ds = sorted(days_map)
            if not ds:
                continue
            bars = [days_map[d] for d in ds]  # each is [op, hi, lo, cl]
            last = bars[-1]
            pdh, pdl, prev_cl = float(last[1]), float(last[2]), float(last[3])
            if prev_cl <= 0 or pdh <= 0 or pdl <= 0:
                continue
            b3 = bars[-3:]
            b5 = bars[-5:]
            b10 = bars[-10:]
            hi3 = max(float(x[1]) for x in b3) if len(b3) >= 2 else pdh
            lo3 = min(float(x[2]) for x in b3) if len(b3) >= 2 else pdl
            hi5 = max(float(x[1]) for x in b5) if len(b5) >= 3 else hi3
            lo5 = min(float(x[2]) for x in b5) if len(b5) >= 3 else lo3
            rngs = [(float(x[1]) - float(x[2])) / float(x[0]) * 100.0 for x in b10 if float(x[0]) > 0]
            atr10 = (sum(rngs) / len(rngs)) if rngs else 2.5
            self.daily_stats[sym] = {
                "prev_cl": prev_cl,
                "pdh": pdh,
                "pdl": pdl,
                "pd_range_pct": (pdh - pdl) / prev_cl * 100.0,
                "hi3": hi3,
                "lo3": lo3,
                "hi5": hi5,
                "lo5": lo5,
                "atr10": atr10 if atr10 > 0 else 2.5,
            }

    def start_day(self, day, expiry=None):
        if self.day == day:
            if expiry and expiry != self.expiry:
                self.expiry = str(expiry)[:10]
                self.dte = calc_dte(day, self.expiry)
            return
        self.day = day
        self.expiry = str(expiry)[:10] if expiry else None
        self.dte = calc_dte(day, self.expiry)
        self.fortress_cache = {}
        self.bars_today = {}
        self.base_open = {}
        self.triggers = {"bull": {}, "bear": {}}
        self._load_rvol_history(day)
        self._load_daily_and_eod_history(day)

        # Seed base_open from most recent prior EOD chain (< day)
        e_days = sorted(self.eod_chains)
        if e_days:
            prev_eod_day = e_days[-1]
            for sym, sdata in (self.eod_chains.get(prev_eod_day) or {}).items():
                for leg in ("CE", "PE"):
                    bmap = {}
                    for k_str, pair in (sdata.get(leg) or {}).items():
                        k = float(k_str)
                        oi_e, ltp_e = float(pair[0]), float(pair[1])
                        if oi_e > 0:
                            bmap[k] = [oi_e, oi_e, ltp_e, ltp_e]
                    if bmap:
                        self.base_open[(sym, leg)] = bmap

        # Restore any already-persisted same-day state (survives service restarts!)
        state_path = self.root / f"{day}.json"
        saved = read_json(state_path, 4_000_000)
        if saved and saved.get("date") == day:
            self.triggers = saved.get("triggers") or {"bull": {}, "bear": {}}
            for sym, bmap in (saved.get("bars_today") or {}).items():
                self.bars_today[sym] = {hm: list(vals) for hm, vals in bmap.items()}
            for key_str, smap in (saved.get("base_open") or {}).items():
                sym, leg = key_str.split("|", 1)
                self.base_open[(sym, leg)] = {float(k): list(v) for k, v in smap.items()}

        # Also fold in 09:15 and 09:20 Pallas files if present on disk after a mid-morning restart
        if self.pallas_dir.exists():
            compact_d = day.replace("-", "")
            for cut_init in ("0915", "0920"):
                p_init = self.pallas_dir / f"{compact_d}-{cut_init}.json"
                if p_init.exists():
                    pdata = read_json(p_init, 5_000_000)
                    if pdata:
                        self._fold_opening_chain_from_pallas(pdata.get("chains") or {}, cut_init == "0915")

    def _fold_opening_chain_from_pallas(self, chains_dict, is_0915):
        for sym, rows in chains_dict.items():
            for r in rows:
                k, leg, ltp, oi, poi = float(r[0]), r[1], float(r[2] or 0.0), float(r[3] or 0.0), float(r[4] or 0.0)
                if leg not in ("CE", "PE") or poi <= 0:
                    continue
                bmap = self.base_open.setdefault((sym, leg), {})
                if is_0915:
                    ltp_e = bmap[k][3] if k in bmap else ltp
                    bmap[k] = [poi, oi if oi > 0 else poi, ltp if ltp > 0 else ltp_e, ltp_e]
                elif k not in bmap:
                    bmap[k] = [poi, oi if oi > 0 else poi, ltp, ltp]

    def _fold_chain_rows(self, hm_now, chain_rows):
        if not chain_rows or hm_now > "09:20":
            return
        is_0915 = (hm_now == "09:15")
        for r in chain_rows:
            # r = (cut_ts, sym, expiry, strike, leg, spot, ltp, close_price, oi, prev_oi, vol, ...)
            sym, k, leg = r[1], float(r[3]), r[4]
            ltp = float(r[6] or 0.0)
            oi = float(r[8] or 0.0)
            poi = float(r[9] or 0.0)
            if leg not in ("CE", "PE") or poi <= 0:
                continue
            bmap = self.base_open.setdefault((sym, leg), {})
            if is_0915:
                ltp_e = bmap[k][3] if k in bmap else ltp
                bmap[k] = [poi, oi if oi > 0 else poi, ltp if ltp > 0 else ltp_e, ltp_e]
            elif k not in bmap:
                bmap[k] = [poi, oi if oi > 0 else poi, ltp, ltp]

    def _save_state(self):
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self.root / f"{self.day}.json"
            tmp = path.with_suffix(".tmp")
            serial_base = {
                f"{sym}|{leg}": {str(k): v for k, v in bmap.items()}
                for (sym, leg), bmap in self.base_open.items()
            }
            payload = {
                "date": self.day,
                "triggers": self.triggers,
                "bars_today": self.bars_today,
                "base_open": serial_base,
            }
            tmp.write_text(json.dumps(payload, separators=(",", ":"), allow_nan=False), encoding="utf-8")
            os.replace(tmp, path)
        except Exception:
            pass

    def _save_eod_snapshot(self, chain_rows, lv):
        """At 15:25 cut, persist today's daily OHLC and 15:25 EOD chain for future sessions (> today)."""
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self.root / f"eod-{self.day}.json"
            if path.exists():
                return
            daily_out = {}
            for sym, bmap in self.bars_today.items():
                if not bmap:
                    continue
                hms = sorted(bmap)
                op = float(bmap[hms[0]][0])
                hi = max(float(bmap[h][1]) for h in hms)
                lo = min(float(bmap[h][2]) for h in hms)
                cl = float(bmap[hms[-1]][3])
                if op > 0 and hi > 0 and lo > 0 and cl > 0:
                    daily_out[sym] = [op, hi, lo, cl]
            eod_out = {}
            if chain_rows:
                for r in chain_rows:
                    sym, exp, k, leg, sp = r[1], str(r[2])[:10], float(r[3]), r[4], float(r[5] or 0.0)
                    ltp, oi = float(r[6] or 0.0), float(r[8] or 0.0)
                    if sp > 0 and oi > 0 and abs(k / sp - 1.0) <= 0.12 and leg in ("CE", "PE"):
                        s_entry = eod_out.setdefault(sym, {"expiry": exp, "spot": sp, "CE": {}, "PE": {}})
                        s_entry[leg][str(k)] = [oi, ltp]
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps({"date": self.day, "daily": daily_out, "eod_chain": eod_out}, separators=(",", ":"), allow_nan=False), encoding="utf-8")
            os.replace(tmp, path)
        except Exception:
            pass

    def _get_fortress_features(self, sym, side, expiry, pdh, pdl):
        key = (sym, side, expiry, round(pdh, 2), round(pdl, 2))
        if key in self.fortress_cache:
            return self.fortress_cache[key]
        res = {"same_exp_hist_days": 0, "pd_fresh_oi_5d_share": None, "pd_fresh_ext_5d_L": None}
        e_days = sorted(self.eod_chains)
        if not e_days:
            self.fortress_cache[key] = res
            return res

        leg = "CE" if side == "BULL" else "PE"
        pd_lvl = pdh if side == "BULL" else pdl
        if side == "BULL":
            lo_k, hi_k = pd_lvl * 0.985, pd_lvl * 1.018
        else:
            lo_k, hi_k = pd_lvl * 0.982, pd_lvl * 1.015

        def calc_band(d_ref):
            sdata = (self.eod_chains.get(d_ref) or {}).get(sym)
            if not sdata or (expiry and sdata.get("expiry") and sdata["expiry"] != expiry):
                return None, 0.0, 0.0
            sp = float(sdata.get("spot") or 0.0)
            lmap = sdata.get(leg) or {}
            if not lmap or sp <= 0:
                return None, 0.0, 0.0
            b_oi = b_ext = 0.0
            for k_str, pair in lmap.items():
                k = float(k_str)
                oi, ltp = float(pair[0]), float(pair[1])
                if oi <= 0:
                    continue
                if lo_k <= k <= hi_k:
                    intr = max(0.0, (sp - k) if leg == "CE" else (k - sp))
                    ext = max(0.05, ltp - intr)
                    b_oi += oi
                    b_ext += oi * ext
            return lmap, b_oi, b_ext

        d_t1 = e_days[-1]
        mp1, oi1, ext1 = calc_band(d_t1)
        if mp1 is None or oi1 <= 0:
            self.fortress_cache[key] = res
            return res

        d_5 = None
        n_exp_days = 1
        for lag in range(2, min(6, len(e_days) + 1)):
            d_cand = e_days[-lag]
            sdata = (self.eod_chains.get(d_cand) or {}).get(sym)
            if sdata and (not expiry or not sdata.get("expiry") or sdata["expiry"] == expiry) and sdata.get(leg):
                d_5 = d_cand
                n_exp_days = lag

        res["same_exp_hist_days"] = n_exp_days
        if d_5 is not None:
            _, oi5, ext5 = calc_band(d_5)
            res["pd_fresh_oi_5d_share"] = (oi1 - oi5) / oi1 * 100.0
            res["pd_fresh_ext_5d_L"] = max(0.0, ext1 - ext5) / 1e5

        self.fortress_cache[key] = res
        return res

    def enrich(self, cut_ts, doc, candles=None, chain_rows=None, lv=None, expiry=None):
        day = cut_ts.strftime("%Y-%m-%d")
        hm_now = cut_ts.strftime("%H:%M")
        self.start_day(day, expiry)

        if chain_rows:
            self._fold_chain_rows(hm_now, chain_rows)

        # Record completed candle at expected = cut_ts - 5m
        expected_hm = (cut_ts - timedelta(minutes=5)).strftime("%H:%M")
        state_dirty = False
        if candles and "09:15" <= expected_hm <= "15:25":
            for sym, c in candles.items():
                if c.get("time") != expected_hm:
                    continue
                op, hi, lo, cl, vol = c.get("open"), c.get("high"), c.get("low"), c.get("close"), c.get("volume")
                if all(finite(x) and x > 0 for x in (op, hi, lo, cl)) and finite(vol) and vol >= 0:
                    s_bars = self.bars_today.setdefault(sym, {})
                    bar_tuple = [float(op), float(hi), float(lo), float(cl), float(vol)]
                    if s_bars.get(expected_hm) != bar_tuple:
                        s_bars[expected_hm] = bar_tuple
                        state_dirty = True

        # Evaluate Clean-Runner Maximizer lanes during morning window 09:20..10:35
        if "09:20" <= hm_now <= "10:35" and chain_rows and self.bars_today:
            state_dirty = self._evaluate_cut(hm_now, expected_hm, chain_rows, lv or {}) or state_dirty

        if hm_now == "15:25":
            self._save_eod_snapshot(chain_rows, lv)

        if state_dirty:
            self._save_state()

        # Attach sticky causal Clean-Runner labels to doc["bull"] and doc["bear"]
        for side_key in ("bull", "bear"):
            side_trigs = self.triggers.get(side_key) or {}
            for r in doc.get(side_key, []):
                sym = r.get("s")
                trig = side_trigs.get(sym)
                if trig and trig.get("cr_cut") and trig["cr_cut"] <= hm_now:
                    r["cr_tier"] = trig["cr_tier"]
                    r["cr_lane"] = trig["cr_lane"]
                    r["cr_cut"] = trig["cr_cut"]
                    r["cr_score"] = trig["cr_score"]
        return doc

    def _evaluate_cut(self, hm_now, bar_hm, chain_rows, lv):
        # 1. Compute causal market breadth across all symbols with completed bars up to bar_hm
        bull_cnt = bear_cnt = tot_mkt = 0
        sym_intraday = {}
        for sym, bmap in self.bars_today.items():
            if "09:15" not in bmap or bar_hm not in bmap:
                continue
            hms = [h for h in sorted(bmap) if h <= bar_hm]
            if not hms:
                continue
            open0 = float(bmap["09:15"][0])
            cur_bar = bmap[bar_hm]
            cl_b = float(cur_bar[3])
            if open0 <= 0:
                continue
            ret_open = (cl_b / open0 - 1.0) * 100.0
            tot_mkt += 1
            if ret_open > 0.10:
                bull_cnt += 1
            if ret_open < -0.10:
                bear_cnt += 1
            sym_intraday[sym] = (hms, bmap, open0)

        if tot_mkt == 0:
            return False
        mkt_bull_pct = bull_cnt / tot_mkt * 100.0
        mkt_bear_pct = bear_cnt / tot_mkt * 100.0

        # 2. Index current cut's live option chain per (sym, leg) -> {strike: (poi, oi, ltp)}
        live_chain = {}
        for r in chain_rows:
            sym, k, leg, sp = r[1], float(r[3]), r[4], float(r[5] or 0.0)
            ltp, oi, poi = float(r[6] or 0.0), float(r[8] or 0.0), float(r[9] or 0.0)
            if sp > 0 and leg in ("CE", "PE") and abs(k / sp - 1.0) <= 0.12:
                live_chain.setdefault((sym, leg), {})[k] = (poi, oi, ltp)

        changed = False
        for sym, (hms, bmap, open0) in sym_intraday.items():
            dstat = self.daily_stats.get(sym)
            lv_sym = lv.get(sym) or {}
            pdh = float(lv_sym.get("pdh") or (dstat["pdh"] if dstat else 0.0))
            pdl = float(lv_sym.get("pdl") or (dstat["pdl"] if dstat else 0.0))
            prev_cl = float(lv_sym.get("pdc") or (dstat["prev_cl"] if dstat else 0.0))
            if pdh <= 0 or pdl <= 0 or prev_cl <= 0 or pdh <= pdl:
                continue
            pd_range_pct = (pdh - pdl) / prev_cl * 100.0
            hi3 = max(pdh, float(dstat["hi3"])) if dstat else pdh
            lo3 = min(pdl, float(dstat["lo3"])) if dstat else pdl
            hi5 = max(pdh, float(dstat["hi5"])) if dstat else pdh
            lo5 = min(pdl, float(dstat["lo5"])) if dstat else pdl

            # Completed bars up to bar_hm
            seq = [bmap[h] for h in hms]
            bi = len(seq) - 1
            op_b, hi_b, lo_b, cl_b, vol_b = seq[-1]
            run_hi = max(x[1] for x in seq)
            run_lo = min(x[2] for x in seq)
            cum_v = sum(x[4] for x in seq)
            cum_pv = sum((x[1] + x[2] + x[3]) / 3.0 * x[4] for x in seq)
            vwap_b = (cum_pv / cum_v) if cum_v > 0 else cl_b

            # 20d slot RVOL (bar_rvol and cum_rvol)
            vhist = self.vol_hist.get(sym) or {}
            ev_list = []
            for h_slot in hms:
                samples = [d_bars[h_slot] for d_bars in vhist.values() if finite(d_bars.get(h_slot)) and d_bars[h_slot] >= 0]
                ev_list.append((sum(samples) / len(samples)) if samples else 0.0)
            ev_now = ev_list[-1]
            cum_ev = sum(ev_list)
            bar_rvol = (vol_b / ev_now) if ev_now > 0 else 0.0
            cum_rvol = (cum_v / cum_ev) if cum_ev > 0 else 0.0
            rng_b = (hi_b - lo_b) / op_b * 100.0 if op_b > 0 else 99.0

            for side, side_key, leg, opp_leg in (("BULL", "bull", "CE", "PE"), ("BEAR", "bear", "PE", "CE")):
                # Skip if already triggered earlier today on (sym, side_key)
                if sym in self.triggers[side_key]:
                    continue

                run_base = self.base_open.get((sym, leg))
                run_opp = self.base_open.get((sym, opp_leg))
                if not run_base:
                    continue

                # Also fold any strike newly seen in live_chain that had prev_oi > 0
                live_leg = live_chain.get((sym, leg)) or {}
                live_opp = live_chain.get((sym, opp_leg)) or {}
                for k, (poi, oi_n, ltp_n) in live_leg.items():
                    if poi > 0 and k not in run_base:
                        run_base[k] = [poi, oi_n if oi_n > 0 else poi, ltp_n, ltp_n]
                if run_opp is not None:
                    for k, (poi, oi_n, ltp_n) in live_opp.items():
                        if poi > 0 and k not in run_opp:
                            run_opp[k] = [poi, oi_n if oi_n > 0 else poi, ltp_n, ltp_n]

                clv_b = ((cl_b - lo_b) / (hi_b - lo_b) if side == "BULL" else (hi_b - cl_b) / (hi_b - lo_b)) if hi_b > lo_b else 0.5
                vwap_ok = (cl_b >= vwap_b) if side == "BULL" else (cl_b <= vwap_b)
                move_open = ((cl_b - open0) / open0 * 100.0) if side == "BULL" else ((open0 - cl_b) / open0 * 100.0)
                move_prev_cl = ((cl_b - prev_cl) / prev_cl * 100.0) if side == "BULL" else ((prev_cl - cl_b) / prev_cl * 100.0)
                mkt_breadth_dir = mkt_bull_pct if side == "BULL" else mkt_bear_pct

                candidates = []

                # ---- A. Check PDH/PDL Breakout Lanes (10 Prime Lanes + F2_5D_FORTRESS + T1_SUPER_SQUEEZE) ----
                broke_pd = (cl_b > pdh and cl_b > op_b) if side == "BULL" else (cl_b < pdl and cl_b < op_b)
                if broke_pd and clv_b >= 0.65 and vwap_ok:
                    past_pd_pct = ((cl_b - pdh) / pdh * 100.0) if side == "BULL" else ((pdl - cl_b) / pdl * 100.0)
                    open_inside_pd = (open0 <= pdh * 1.001) if side == "BULL" else (open0 >= pdl * 0.999)
                    if bi >= 3:
                        or15_lvl = max(x[1] for x in seq[:3]) if side == "BULL" else min(x[2] for x in seq[:3])
                        or15_broken = (cl_b > or15_lvl) if side == "BULL" else (cl_b < or15_lvl)
                        prev_bars_broken = (cl_b > max(x[1] for x in seq[:bi])) if side == "BULL" else (cl_b < min(x[2] for x in seq[:bi]))
                    else:
                        or15_broken = True
                        prev_bars_broken = True if bi == 0 else ((cl_b > max(x[1] for x in seq[:bi])) if side == "BULL" else (cl_b < min(x[2] for x in seq[:bi])))

                    dist_from_sess_ext = ((run_hi - cl_b) / cl_b * 100.0) if side == "BULL" else ((cl_b - run_lo) / cl_b * 100.0)
                    pre_break_mae_open = ((open0 - run_lo) / open0 * 100.0) if side == "BULL" else ((run_hi - open0) / open0 * 100.0)
                    bar_low_holds_pd = (lo_b >= pdh * 0.9985) if side == "BULL" else (hi_b <= pdl * 1.0015)
                    room_pd_to_5d_ext = ((hi5 - pdh) / pdh * 100.0) if side == "BULL" else ((pdl - lo5) / pdl * 100.0)
                    pd_vs_3d_ext_pct = ((hi3 - pdh) / pdh * 100.0) if side == "BULL" else ((pdl - lo3) / pdl * 100.0)

                    ahead_strikes = []
                    broken_strikes = []
                    for k, (poi, oi0, ltp0, _ltp_e) in run_base.items():
                        if poi <= 0 or ltp0 <= 0:
                            continue
                        dist_pd = ((k - pdh) / pdh * 100.0) if side == "BULL" else ((pdl - k) / pdl * 100.0)
                        dist_cl = ((k - cl_b) / cl_b * 100.0) if side == "BULL" else ((cl_b - k) / cl_b * 100.0)
                        dist_op = ((k - open0) / open0 * 100.0) if side == "BULL" else ((open0 - k) / open0 * 100.0)
                        intr0 = max(0.0, (open0 - k) if side == "BULL" else (k - open0))
                        ext0 = max(0.05, ltp0 - intr0)
                        ext_val = poi * ext0
                        lv_k = live_leg.get(k)
                        oi_now = lv_k[1] if (lv_k is not None and lv_k[1] > 0) else oi0
                        ltp_now = lv_k[2] if (lv_k is not None and lv_k[2] > 0) else ltp0
                        if 0.15 <= dist_pd <= 8.0:
                            ahead_strikes.append((k, dist_pd, dist_cl, poi, oi0, oi_now, ltp0, ltp_now, ext_val))
                        if -0.5 <= dist_op <= 4.5 and dist_cl <= 0.15:
                            broken_strikes.append((k, poi, oi0, oi_now, ltp0, ltp_now, ext_val))

                    if ahead_strikes:
                        tot_ahead_oi = sum(x[3] for x in ahead_strikes)
                        tot_ahead_ext = sum(x[8] for x in ahead_strikes)
                        if tot_ahead_oi > 0 and tot_ahead_ext > 0:
                            tgt_oi = max(ahead_strikes, key=lambda x: x[3])
                            tgt_ext = max(ahead_strikes, key=lambda x: x[8])
                            blk_oi_2pct_pd = sum(x[3] for x in ahead_strikes if x[1] < 2.0) / tot_ahead_oi * 100.0
                            tgt_oi_chg_prev = (tgt_oi[5] / tgt_oi[3] - 1.0) * 100.0 if tgt_oi[3] > 0 else 0.0
                            tgt_ltp_chg_open = (tgt_oi[7] / tgt_oi[6] - 1.0) * 100.0 if tgt_oi[6] > 0 else 0.0
                            tot_otm_ext_pool = sum(x[8] for x in ahead_strikes if x[1] <= 4.5) + sum(x[6] for x in broken_strikes)
                            br_ext = sum(x[6] for x in broken_strikes)
                            broken_ext_share = (br_ext / tot_otm_ext_pool * 100.0) if tot_otm_ext_pool > 0 else 0.0
                            br_poi = sum(x[1] for x in broken_strikes)
                            br_oin = sum(x[3] for x in broken_strikes)
                            broken_oi_chg_prev = ((br_oin / br_poi - 1.0) * 100.0) if br_poi > 0 else 0.0

                            opp_oi0 = opp_oin = 0.0
                            for k, (poi_o, oi0_o, _ltp0_o, _le) in (run_opp or {}).items():
                                if poi_o <= 0:
                                    continue
                                dist_behind = ((cl_b - k) / cl_b * 100.0) if side == "BULL" else ((k - cl_b) / cl_b * 100.0)
                                if -0.5 <= dist_behind <= 4.5:
                                    lv_o = live_opp.get(k)
                                    oin_o = lv_o[1] if (lv_o is not None and lv_o[1] > 0) else oi0_o
                                    opp_oi0 += oi0_o
                                    opp_oin += oin_o
                            opp_floor_oi_chg_open = ((opp_oin / opp_oi0 - 1.0) * 100.0) if opp_oi0 > 0 else 0.0

                            fort = self._get_fortress_features(sym, side, self.expiry, pdh, pdl)
                            fr5d = fort["pd_fresh_oi_5d_share"]
                            ext5d_L = fort["pd_fresh_ext_5d_L"]
                            same_exp_days = fort["same_exp_hist_days"]
                            room_entry_to_oi_wall = tgt_oi[2]

                            # 1) Standard 10-lane Prime Confluence
                            if (0.02 <= past_pd_pct <= 1.40 and rng_b <= 1.60 and open_inside_pd
                                    and pd_range_pct < 3.8 and move_prev_cl <= 3.2 and blk_oi_2pct_pd < 50.0
                                    and (prev_bars_broken or dist_from_sess_ext <= 0.15)
                                    and or15_broken and tgt_oi[0] >= 25.0 and tgt_ext[0] >= 45.0):
                                unw_any = (broken_oi_chg_prev < 0.0) or (tgt_oi_chg_prev < 0.0)
                                unw_str = (broken_oi_chg_prev <= -1.0) or (tgt_oi_chg_prev <= -1.0)
                                unw_vstr = (broken_oi_chg_prev <= -2.0) or (tgt_oi_chg_prev <= -2.0)
                                opp_add = opp_floor_oi_chg_open >= 1.0
                                opp_str = opp_floor_oi_chg_open >= 2.0
                                rvol_hi = (cum_rvol >= 1.5) and (bar_rvol >= 2.0)
                                rvol_md = (cum_rvol >= 1.2) or (bar_rvol >= 1.5)
                                brd58 = mkt_breadth_dir >= 58.0
                                brd60 = mkt_breadth_dir >= 60.0
                                brd62 = mkt_breadth_dir >= 62.0
                                strict_hi = prev_bars_broken

                                ma2 = brd58 and (room_pd_to_5d_ext <= 0.50) and (broken_ext_share >= 45.0) and unw_any and (strict_hi or pd_range_pct < 3.4)
                                ma1 = brd58 and bar_low_holds_pd and (pd_range_pct < 3.4) and (broken_ext_share >= 45.0) and unw_any
                                ma7 = strict_hi and brd58 and (pd_vs_3d_ext_pct <= 0.25) and (broken_ext_share >= 50.0) and rvol_md
                                aw2 = strict_hi and (hm_now <= "09:50") and (pd_range_pct < 3.4) and (broken_ext_share >= 55.0) and (broken_oi_chg_prev <= -1.0) and opp_add
                                ma8 = strict_hi and brd58 and (room_entry_to_oi_wall >= 2.2) and (broken_ext_share >= 50.0) and unw_any and (pd_range_pct < 3.5)
                                aw1 = strict_hi and (pd_range_pct < 3.5) and (fr5d is not None and fr5d >= 60.0) and (ext5d_L is not None and ext5d_L >= 15.0) and (
                                    rvol_hi or (hm_now >= "09:25" and clv_b >= 0.75 and tgt_ltp_chg_open >= 15.0 and (unw_any or opp_floor_oi_chg_open >= 1.5))
                                )
                                ma3 = strict_hi and brd58 and (broken_ext_share >= 55.0) and unw_str and opp_add
                                ma6 = strict_hi and brd58 and (hm_now >= "09:30") and (pd_range_pct < 3.2) and (pre_break_mae_open <= 0.35) and (broken_ext_share >= 45.0) and (unw_any or opp_str)
                                ma5 = strict_hi and brd60 and (pd_vs_3d_ext_pct <= 0.25) and (pd_range_pct < 3.5) and (pre_break_mae_open <= 0.30) and (unw_any or opp_str)
                                ma4 = strict_hi and brd58 and unw_vstr and opp_str and (pd_range_pct < 3.4)

                                n_lanes = sum(int(x) for x in (ma2, ma1, ma7, aw2, ma8, aw1, ma3, ma6, ma5, ma4))
                                prime = ma1 or aw1 or aw2 or (ma2 and brd62) or (ma7 and brd62) or (n_lanes >= 3)
                                if prime:
                                    lane = "MULTI_CONFLUENCE"
                                    for lname, flag in (
                                        ("MA4_STRONG_FLOW", ma4), ("MA5_3D_SHALLOW", ma5), ("MA6_POST930_SQZ", ma6),
                                        ("MA3_HEAVY_TRAP", ma3), ("F2_5D_FORTRESS", aw1), ("MA8_RUNWAY_WALL", ma8),
                                        ("MA1_PD_ACCEPT", ma1), ("AW2_HEAVY_SQZ", aw2), ("MA7_3D_TRAP_RVOL", ma7),
                                        ("MA2_5D_TRAP_UNW", ma2),
                                    ):
                                        if flag:
                                            lane = lname
                                    score = round(
                                        n_lanes * 2.0 + 4.0
                                        + (2.5 if bar_low_holds_pd else 0.0)
                                        + (2.5 if mkt_breadth_dir >= 68.0 else (1.5 if mkt_breadth_dir >= 62.0 else 0.5))
                                        + (2.0 if room_pd_to_5d_ext <= 0.30 else (1.2 if room_pd_to_5d_ext <= 0.50 else 0.0))
                                        + (1.8 if broken_ext_share >= 60.0 else (1.0 if broken_ext_share >= 50.0 else 0.0))
                                        + (1.5 if broken_oi_chg_prev <= -1.5 else (0.8 if broken_oi_chg_prev < 0.0 else 0.0))
                                        + (1.0 if pd_range_pct < 2.8 else 0.0)
                                        + (0.8 if clv_b >= 0.80 else 0.0),
                                        2
                                    )
                                    candidates.append((score, lane))

                            # 2) T1_F2_5D_FORTRESS standalone High-RVOL lane
                            if (same_exp_days >= 3 and 1 <= self.dte <= 21 and "09:25" <= hm_now <= "10:30"
                                    and clv_b >= 0.65 and rng_b <= 1.5 and vwap_ok and past_pd_pct <= 1.2
                                    and move_prev_cl <= 3.0 and open_inside_pd and pd_range_pct < 3.5
                                    and fr5d is not None and fr5d >= 60.0 and ext5d_L is not None and ext5d_L >= 15.0
                                    and blk_oi_2pct_pd < 50.0 and cum_rvol >= 1.5 and bar_rvol >= 2.0):
                                candidates.append((17.5, "T1_F2_5D_FORTRESS"))

                            # 3) T1_SUPER_SQUEEZE nuclear short-covering override lane
                            if (0.02 <= past_pd_pct <= 1.80 and clv_b >= 0.70 and rng_b <= 1.80 and open_inside_pd
                                    and cum_rvol >= 2.0 and bar_rvol >= 2.5
                                    and (broken_ext_share >= 50.0 or (fr5d is not None and fr5d >= 50.0))
                                    and (broken_oi_chg_prev <= -4.0 or tgt_oi_chg_prev <= -3.0)
                                    and blk_oi_2pct_pd < 35.0 and room_entry_to_oi_wall >= 2.0 and mkt_breadth_dir >= 55.0):
                                candidates.append((19.5, "T1_SUPER_SQUEEZE"))

                # ---- B. Check T1_L2_WALL_SMASH (DTE-Adaptive Seller-Trap V3 Wall-Smash Cascade, pd_range_pct < 3.5%) ----
                if (1 <= self.dte <= 21 and hm_now <= "10:30" and pd_range_pct < 3.5
                        and clv_b >= 0.65 and rng_b <= 1.5 and vwap_ok
                        and ((cl_b > op_b) if side == "BULL" else (cl_b < op_b))
                        and move_open <= 3.0 and move_prev_cl <= 3.0
                        and (cum_rvol >= 1.5 or (cum_rvol >= 1.05 and bar_rvol >= 2.8))):
                    pool_otm = []
                    for k, (poi, oi0, ltp0, ltp_eod) in run_base.items():
                        if poi <= 0 or ltp0 <= 0:
                            continue
                        dist_open = ((open0 - k) / open0 * 100.0) if side == "BEAR" else ((k - open0) / open0 * 100.0)
                        if side == "BEAR":
                            is_otm_open = (-0.5 <= dist_open <= 4.5)
                            is_gap_tr = (k > open0 * 1.005) and (k <= prev_cl * 1.005) and ((k - open0) / open0 * 100.0 <= 3.0)
                            intr = max(0.0, k - open0)
                        else:
                            is_otm_open = (-0.5 <= dist_open <= 4.5)
                            is_gap_tr = (k < open0 * 0.995) and (k >= prev_cl * 0.995) and ((open0 - k) / open0 * 100.0 <= 3.0)
                            intr = max(0.0, open0 - k)
                        if is_otm_open or is_gap_tr:
                            ext0 = max(0.05, ltp0 - intr)
                            pool_otm.append((k, poi, oi0, ltp0, ltp_eod, ext0, poi * ext0, dist_open))
                    if pool_otm:
                        tot_otm_oi = sum(x[1] for x in pool_otm)
                        tot_otm_ext = sum(x[6] for x in pool_otm)
                        strict_otm = [x for x in pool_otm if 0.20 <= x[7] <= 3.0]
                        if tot_otm_oi >= 50000 and tot_otm_ext >= 300000.0 and strict_otm:
                            w_strict = max(strict_otm, key=lambda x: x[6])
                            wall_k = w_strict[0]
                            strict_dist_open = w_strict[7]
                            broke_wall = (cl_b < wall_k) if side == "BEAR" else (cl_b > wall_k)
                            if broke_wall and strict_dist_open >= 0.8:
                                tr = [x for x in pool_otm if (x[0] > cl_b if side == "BEAR" else x[0] < cl_b)]
                                if tr:
                                    trapped_ext_share = sum(x[6] for x in tr) / tot_otm_ext * 100.0
                                    if trapped_ext_share >= 75.0:
                                        t_poi_m = t_oi_now = 0.0
                                        for x in tr:
                                            lv_k = live_leg.get(x[0])
                                            if lv_k is not None:
                                                t_poi_m += x[1]
                                                t_oi_now += lv_k[1]
                                        if t_poi_m > 0:
                                            t_oi_chg_prev = (t_oi_now - t_poi_m) / t_poi_m * 100.0
                                            ks_all = sorted(run_base.keys())
                                            if side == "BULL":
                                                tk = [k for k in ks_all if min(open0, prev_cl) * 0.995 <= k < cl_b and (k - open0) / open0 <= 0.045]
                                                tip = max(tk) if tk else wall_k
                                                past_tip_pct = (cl_b - tip) / tip * 100.0
                                            else:
                                                tk = [k for k in ks_all if cl_b < k <= max(open0, prev_cl) * 1.005 and (open0 - k) / open0 <= 0.045]
                                                tip = min(tk) if tk else wall_k
                                                past_tip_pct = (tip - cl_b) / tip * 100.0
                                            if t_oi_chg_prev < 0.0 and past_tip_pct <= 0.8:
                                                if self.dte >= 7 or (bar_rvol >= 2.0 and t_oi_chg_prev <= -2.0):
                                                    candidates.append((17.5, "T1_L2_WALL_SMASH"))

                if candidates:
                    # Pick highest runner_score candidate at this cut
                    candidates.sort(key=lambda x: x[0], reverse=True)
                    best_score, best_lane = candidates[0]
                    is_t1 = (best_score >= 17.5) or (best_lane in ("T1_SUPER_SQUEEZE", "T1_L2_WALL_SMASH", "T1_F2_5D_FORTRESS", "F2_5D_FORTRESS"))
                    is_t2 = (not is_t1) and (best_score >= 14.5)
                    tier = 1 if is_t1 else (2 if is_t2 else 3)
                    self.triggers[side_key][sym] = {
                        "cr_tier": tier,
                        "cr_lane": best_lane,
                        "cr_cut": hm_now,
                        "cr_score": round(float(best_score), 1),
                    }
                    changed = True

        return changed


def enrich(cut_ts, doc, candles=None, chain_rows=None, lv=None, expiry=None):
    global _store
    if _store is None:
        _store = CleanRunnerStore()
    return _store.enrich(cut_ts, doc, candles=candles, chain_rows=chain_rows, lv=lv, expiry=expiry)
