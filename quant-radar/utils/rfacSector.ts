import sectorMap from '../app/rusty/sectors.json';

export type RfacDirection = 'BULL' | 'BEAR' | 'UNAVAILABLE';

export type RfacStockRow = {
  symbol: string;
  direction: RfacDirection;
  rfac: number | null;
  currRfac: number | null;
  signedRfac: number | null;
  stale: boolean;
  o20: number | null;
  denom: number | null;
  peakCut: string;
  move: number | null;
  price: number | null;
  oiBias: number | null;
  ce: number | null;
  pe: number | null;
  classification: string;
  pdhPdlBroken: 'YES' | 'NO' | 'UNAVAILABLE';
  pdhPdlBreakTime: string;
  levelSource: string;
  rvol: number | null;
  rvolSamples: number;
  clearBull: 0 | 3 | 5;
  clearBear: 0 | 3 | 5;
  clearLevels: [number, number, number, number] | null; // [hi3, hi5, lo3, lo5]
};

export type RfacSectorRow = {
  sec: string;
  netRfac: number | null;
  avgRfac: number | null;
  bullRfac: number | null;
  bearRfac: number | null;
  bull: number;
  bear: number;
  boosted: number;
  boostedBull: number;
  boostedBear: number;
  staleCount: number;
  valid: number;
  available: number;
  total: number;
  breadth: number | null;
  stocks: RfacStockRow[];
};

export type RfacSectorBoard = {
  cut: string;
  sectors: RfacSectorRow[];
  bulls: RfacStockRow[];
  bears: RfacStockRow[];
  all: RfacStockRow[];
  unmapped: number;
};

const rfacNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const rfacMean = (vals: number[]): number | null =>
  vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;

export function buildRfacSectorScope(
  snapshot: { cut?: string; time?: string; bull?: unknown[]; bear?: unknown[] },
  mapping: Record<string, string[]> = sectorMap,
): RfacSectorBoard {
  const rows = new Map<string, RfacStockRow>();

  for (const side of ['bull', 'bear'] as const) {
    const entries = snapshot[side];
    if (!Array.isArray(entries)) continue;
    for (const raw of entries) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      if (typeof r.s !== 'string') continue;
      const symbol = r.s.trim().toUpperCase();
      if (!symbol) continue;

      const rfac = rfacNum(r.rfac);
      const currRfac = rfacNum(r.rfac_c);
      const o20 = rfacNum(r.rfac_o20);
      const denom = rfacNum(r.rfac_d);
      const price = rfacNum(r.c_close);
      const move = rfacNum(r.mv);
      const rawSide = typeof r.rfac_s === 'string' ? r.rfac_s.toUpperCase() : '';
      const direction: RfacDirection =
        rawSide === 'BULL' || rawSide === 'BEAR'
          ? (rawSide as RfacDirection)
          : rfac !== null && price !== null && o20 !== null
            ? price >= o20
              ? 'BULL'
              : 'BEAR'
            : 'UNAVAILABLE';

      const signedRfac =
        rfac !== null && direction !== 'UNAVAILABLE'
          ? direction === 'BULL'
            ? rfac
            : -rfac
          : null;

      const stale = rfac !== null && currRfac !== null && rfac >= 1.2 && rfac - currRfac >= 0.5;
      const ls = typeof r.ls === 'string' ? r.ls : '';
      const pdhPdlBroken: 'YES' | 'NO' | 'UNAVAILABLE' =
        ls === 'OR'
          ? 'YES'
          : ls === 'PDH' || ls === 'PDL'
            ? r.brk === true
              ? 'YES'
              : r.brk === false
                ? 'NO'
                : 'UNAVAILABLE'
            : 'UNAVAILABLE';

      const clearBull: 0 | 3 | 5 = r.cs_b === 5 ? 5 : r.cs_b === 3 ? 3 : 0;
      const clearBear: 0 | 3 | 5 = r.cs_s === 5 ? 5 : r.cs_s === 3 ? 3 : 0;
      const rawLevels = Array.isArray(r.cs_l) && r.cs_l.length === 4 && r.cs_l.every((v) => rfacNum(v) !== null)
        ? (r.cs_l as [number, number, number, number])
        : null;

      const next: RfacStockRow = {
        symbol,
        direction,
        rfac,
        currRfac,
        signedRfac,
        stale,
        o20,
        denom,
        peakCut: typeof r.rfac_pk === 'string' ? r.rfac_pk : '',
        move,
        price,
        oiBias: rfacNum(r.oi_bias),
        ce: rfacNum(r.ce_pct),
        pe: rfacNum(r.pe_pct),
        classification: typeof r.flow_label === 'string' ? r.flow_label : 'Unavailable',
        pdhPdlBroken,
        pdhPdlBreakTime: pdhPdlBroken === 'YES' && ls !== 'OR' && typeof r.bt === 'string' ? r.bt : '',
        levelSource: ls,
        rvol: rfacNum(r.c_rvol),
        rvolSamples: rfacNum(r.c_rvol_samples) ?? 0,
        clearBull,
        clearBear,
        clearLevels: rawLevels,
      };

      const prev = rows.get(symbol);
      if (!prev || (prev.rfac === null && next.rfac !== null)) {
        rows.set(symbol, next);
      }
    }
  }

  const mapped = new Set<string>();
  const sectors: RfacSectorRow[] = Object.entries(mapping)
    .map(([sec, symbols]) => {
      const members = [...new Set(symbols.map((s) => s.trim().toUpperCase()))];
      members.forEach((s) => mapped.add(s));
      const stocks = members
        .map((s) => rows.get(s))
        .filter((r): r is RfacStockRow => !!r);

      const validStocks = stocks.filter((r) => r.rfac !== null && r.direction !== 'UNAVAILABLE');
      const bullStocks = validStocks.filter((r) => r.direction === 'BULL');
      const bearStocks = validStocks.filter((r) => r.direction === 'BEAR');
      const boostedBull = bullStocks.filter((r) => (r.rfac ?? 0) >= 1.5).length;
      const boostedBear = bearStocks.filter((r) => (r.rfac ?? 0) >= 1.5).length;
      const staleCount = validStocks.filter((r) => r.stale).length;

      stocks.sort(
        (a, b) =>
          (b.rfac ?? -1) - (a.rfac ?? -1) ||
          (b.currRfac ?? -1) - (a.currRfac ?? -1) ||
          a.symbol.localeCompare(b.symbol),
      );

      const valid = validStocks.length;
      return {
        sec,
        netRfac: rfacMean(validStocks.map((r) => r.signedRfac!)),
        avgRfac: rfacMean(validStocks.map((r) => r.rfac!)),
        bullRfac: rfacMean(bullStocks.map((r) => r.rfac!)),
        bearRfac: rfacMean(bearStocks.map((r) => r.rfac!)),
        bull: bullStocks.length,
        bear: bearStocks.length,
        boosted: boostedBull + boostedBear,
        boostedBull,
        boostedBear,
        staleCount,
        valid,
        available: stocks.length,
        total: members.length,
        breadth: valid ? (100 * (bullStocks.length - bearStocks.length)) / valid : null,
        stocks,
      };
    })
    .sort((a, b) =>
      a.netRfac === null
        ? b.netRfac === null
          ? a.sec.localeCompare(b.sec)
          : 1
        : b.netRfac === null
          ? -1
          : b.netRfac - a.netRfac || b.valid - a.valid || a.sec.localeCompare(b.sec),
    );

  const all = [...rows.values()];
  const bulls = all
    .filter((r) => r.direction === 'BULL' && r.rfac !== null)
    .sort((a, b) => (b.rfac! - a.rfac!) || (b.currRfac ?? 0) - (a.currRfac ?? 0) || a.symbol.localeCompare(b.symbol));
  const bears = all
    .filter((r) => r.direction === 'BEAR' && r.rfac !== null)
    .sort((a, b) => (b.rfac! - a.rfac!) || (b.currRfac ?? 0) - (a.currRfac ?? 0) || a.symbol.localeCompare(b.symbol));

  return {
    cut: String(snapshot.cut || snapshot.time || ''),
    sectors,
    bulls,
    bears,
    all,
    unmapped: [...rows.keys()].filter((s) => !mapped.has(s)).length,
  };
}
