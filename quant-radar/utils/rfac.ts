import rfacSeedRaw from "@/data/rfac-seed.json";

type SeedFile = {
  schema_version?: number;
  window?: number;
  through?: string;
  symbols?: Record<string, Record<string, number>>;
  hl?: Record<string, Record<string, [number, number]>>;
};

const SEED = (rfacSeedRaw as unknown as SeedFile).symbols ?? {};
const HL_SEED = (rfacSeedRaw as unknown as SeedFile).hl ?? {};
const WINDOW = (rfacSeedRaw as unknown as SeedFile).window ?? 32;
const MIN_DIFFS = 10;
const EXCLUDED_DATES = new Set(["2026-10-02", "2026-11-08"]);

const denomCache = new Map<string, number | null>();
const levelCache = new Map<string, [number, number | null, number, number | null] | null>();

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Strictly causal 32-day Mean(|Close_d - Close_{d-1}|) using only trading days < isoDate.
 */
export function causalRfacDenom(symbol: string, isoDate: string): number | null {
  const sym = symbol.trim().toUpperCase();
  const key = `${isoDate}|${sym}`;
  if (denomCache.has(key)) return denomCache.get(key)!;
  const days = SEED[sym];
  if (!days) {
    denomCache.set(key, null);
    return null;
  }
  const vals = Object.entries(days)
    .filter(([d, v]) => d < isoDate && !EXCLUDED_DATES.has(d) && finite(v) && v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-(WINDOW + 1))
    .map(([, v]) => v);
  if (vals.length < MIN_DIFFS + 1) {
    denomCache.set(key, null);
    return null;
  }
  let sum = 0;
  for (let i = 1; i < vals.length; i++) sum += Math.abs(vals[i] - vals[i - 1]);
  const mean = sum / (vals.length - 1);
  const out = mean > 0 ? mean : null;
  if (denomCache.size > 8000) denomCache.clear();
  denomCache.set(key, out);
  return out;
}

/**
 * Strictly causal prior 3-day & 5-day High/Low using only regular sessions < isoDate.
 * Returns [hi3, hi5 (or null if <5 prior days), lo3, lo5 (or null if <5 prior days)].
 */
export function causalClearSkyLevels(
  symbol: string,
  isoDate: string,
): [number, number | null, number, number | null] | null {
  const sym = symbol.trim().toUpperCase();
  const key = `${isoDate}|${sym}`;
  if (levelCache.has(key)) return levelCache.get(key)!;
  const days = HL_SEED[sym];
  if (!days) {
    levelCache.set(key, null);
    return null;
  }
  const pairs = Object.entries(days)
    .filter(
      ([d, pair]) =>
        d < isoDate &&
        !EXCLUDED_DATES.has(d) &&
        Array.isArray(pair) &&
        pair.length === 2 &&
        finite(pair[0]) &&
        finite(pair[1]) &&
        pair[0] > 0 &&
        pair[1] > 0 &&
        pair[0] >= pair[1],
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-5)
    .map(([, pair]) => pair);
  if (pairs.length < 3) {
    levelCache.set(key, null);
    return null;
  }
  const p3 = pairs.slice(-3);
  const hi3 = Math.max(...p3.map((p) => p[0]));
  const lo3 = Math.min(...p3.map((p) => p[1]));
  const hi5 = pairs.length >= 5 ? Math.max(...pairs.map((p) => p[0])) : null;
  const lo5 = pairs.length >= 5 ? Math.min(...pairs.map((p) => p[1])) : null;
  const out: [number, number | null, number, number | null] = [hi3, hi5, lo3, lo5];
  if (levelCache.size > 8000) levelCache.clear();
  levelCache.set(key, out);
  return out;
}

function applyClearSky(row: Record<string, unknown>, sym: string, isoDate: string, price: number | null) {
  // Preserve native VM2 Clear-Sky fields verbatim when already populated.
  if (finite(row.cs_b) || finite(row.cs_s) || Array.isArray(row.cs_l)) return;
  if (price === null || price <= 0) return;
  const levels = causalClearSkyLevels(sym, isoDate);
  if (!levels) return;
  const [hi3, hi5, lo3, lo5] = levels;
  const csB = hi5 !== null && price > hi5 ? 5 : price > hi3 ? 3 : 0;
  const csS = lo5 !== null && price < lo5 ? 5 : price < lo3 ? 3 : 0;
  if (csB) row.cs_b = csB;
  if (csS) row.cs_s = csS;
  if (csB || csS) {
    row.cs_l = [
      Math.round(hi3 * 100) / 100,
      Math.round((hi5 ?? hi3) * 100) / 100,
      Math.round(lo3 * 100) / 100,
      Math.round((lo5 ?? lo3) * 100) / 100,
    ];
  }
}

type SnapLike = {
  cut?: unknown;
  time?: unknown;
  bull?: Record<string, unknown>[];
  bear?: Record<string, unknown>[];
  [key: string]: unknown;
};

/**
 * Enrich chronological Rusty snapshots with strictly causal R.Fac metrics when
 * not already populated natively by VM2 rusty_rfac.py (e.g. historical sessions
 * or cuts published before VM2 rollout). Preserves native VM2 values verbatim.
 */
export function enrichRustySessionRfac<T extends SnapLike>(snapshots: T[], isoDate: string): T[] {
  if (!snapshots.length || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return snapshots;

  const state = new Map<string, { o20: number | null; pk: number; pkCut: string; lastC: number | null }>();
  const ordered = [...snapshots].sort((a, b) =>
    String(a.cut || a.time || "").localeCompare(String(b.cut || b.time || "")),
  );

  for (const snap of ordered) {
    const cut = String(snap.cut || snap.time || "").slice(0, 5);
    const nativeClearSky = snap.cs_v === 1;
    const seen = new Set<string>();
    for (const side of ["bull", "bear"] as const) {
      const list = snap[side];
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (!row || typeof row.s !== "string") continue;
        const sym = row.s.trim().toUpperCase();
        if (!sym) continue;
        // Native live VM2 R.Fac takes precedence and keeps running state in sync.
        if (finite(row.rfac) && finite(row.rfac_c) && typeof row.rfac_s === "string") {
          const cCloseNative = finite(row.c_close) ? row.c_close : null;
          if (!nativeClearSky) applyClearSky(row, sym, isoDate, cCloseNative);
          if (!seen.has(sym) && finite(row.rfac_o20) && cCloseNative !== null) {
            const denom = finite(row.rfac_d) ? row.rfac_d : causalRfacDenom(sym, isoDate);
            if (denom) {
              state.set(sym, {
                o20: row.rfac_o20,
                pk: row.rfac * denom,
                pkCut: typeof row.rfac_pk === "string" ? row.rfac_pk : cut,
                lastC: cCloseNative,
              });
            }
            seen.add(sym);
          }
          continue;
        }

        const denom = causalRfacDenom(sym, isoDate);
        const cTime = typeof row.c_time === "string" ? row.c_time.slice(0, 5) : "";
        const cOpen = finite(row.c_open) ? row.c_open : null;
        const cClose = finite(row.c_close) ? row.c_close : null;
        if (!nativeClearSky) applyClearSky(row, sym, isoDate, cClose);
        if (!denom) continue;

        let rec = state.get(sym);
        if (!rec) {
          rec = { o20: null, pk: 0, pkCut: "", lastC: null };
          state.set(sym, rec);
        }

        if (!seen.has(sym) && cTime >= "09:20" && cTime <= "15:25" && cOpen !== null && cClose !== null && cOpen > 0 && cClose > 0) {
          if (rec.o20 === null && cTime === "09:20") {
            rec.o20 = cOpen;
          }
          if (rec.o20 !== null) {
            const mv = Math.abs(cClose - rec.o20);
            if (mv > rec.pk || !rec.pkCut) {
              rec.pk = mv;
              rec.pkCut = cut || cTime;
            }
          }
          rec.lastC = cClose;
          seen.add(sym);
        }

        if (rec.o20 !== null && rec.lastC !== null) {
          const currMv = Math.abs(rec.lastC - rec.o20);
          const pkMv = Math.max(rec.pk, currMv);
          row.rfac = Math.round((pkMv / denom) * 100) / 100;
          row.rfac_c = Math.round((currMv / denom) * 100) / 100;
          row.rfac_s = rec.lastC >= rec.o20 ? "BULL" : "BEAR";
          row.rfac_o20 = Math.round(rec.o20 * 100) / 100;
          row.rfac_d = Math.round(denom * 100) / 100;
          row.rfac_pk = rec.pkCut || cut;
        }
      }
    }
  }
  return snapshots;
}
