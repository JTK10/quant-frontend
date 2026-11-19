export const MODES = ['All chain activity', 'Since open', 'Tracked', 'Same cut'] as const;
export const STATES = ['Watch', 'Confirmed', 'No classified flow', 'Snapshot'] as const;
export const POLL_MS = 5 * 60 * 1000;
export const ROW_SCHEMA = 'rusty-oi-v1';
export const MAX_ROWS = 2200;
export const MAX_BYTES = 1024 * 1024;

export type OspreyRow = {
  ce_pct: number | null; pe_pct: number | null; oi_bias: number | null;
  setup_oi?: {date:string;levels:number[]};
  symbol: string; mode: typeof MODES[number]; side: 'BULL' | 'BEAR' | '—';
  score: number | null; oi_5m: number | null; oi_15m: number | null;
  rvol: number | null; rvol_sessions: number | null; sector_strength: number | null;
  sector_samples: number | null; move_pct: number | null; strengthening: number | null;
  sector: string; sector_source: string; first: string; last: string; confirmed: string;
  state: typeof STATES[number]; strikes: string; oi_5m_route: string; oi_15m_route: string;
};
export type OspreyBoard = {
  date: string; source: 'osprey'; cut: string; cuts: string[]; rows: OspreyRow[]; available: boolean;
};

export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
export const validCut = (value: unknown): value is string => typeof value === 'string' &&
  /^(?:09|1[0-5]):[0-5][05]$/.test(value) && value >= '09:15' && value <= '15:30';

const routes: Record<string,string> = {
  CE_BUILD: 'CE buildup', CE_UNWIND: 'CE unwind', PE_BUILD: 'PE buildup', PE_UNWIND: 'PE unwind',
};
const text = (value: unknown, size = 80) => typeof value === 'string' ? value.slice(0,size) : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const time = (value: unknown, cut: string) => validCut(value) && value <= cut ? value : '';

// ORDS is append-only. Accept at most one additive enrichment of the same
// document, and reject changes to any existing signal/ranking field.
export function selectSnapshotRows(variants:{id:unknown;rows:unknown}[]):unknown[] {
  if (!variants.length||variants.length>2) throw Error('Invalid Osprey snapshot count');
  const fields=['ce_pct','pe_pct','oi_bias'];
  const arrays=variants.map(v=>{
    if (!Array.isArray(v.rows)||v.rows.length>MAX_ROWS||v.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))
      throw Error('Invalid Osprey snapshot rows');
    return v.rows as Record<string,unknown>[];
  });
  if (arrays.length===1) return arrays[0];
  if (typeof variants[0].id!=='string'||!variants[0].id||variants[0].id!==variants[1].id)
    throw Error('Conflicting Osprey document identity');
  const withoutOI=(rows:Record<string,unknown>[])=>JSON.stringify(rows.map(row=>Object.fromEntries(
    Object.entries(row).filter(([key])=>!fields.includes(key)).sort(([a],[b])=>a.localeCompare(b)))));
  if (withoutOI(arrays[0])!==withoutOI(arrays[1])) throw Error('Conflicting Osprey snapshots');
  return arrays[0].map((row,i)=>{
    const merged={...row};
    for (const key of fields) {
      const a=row[key],b=arrays[1][i][key];
      for (const value of [a,b]) if (value!=null&&(typeof value!=='number'||!Number.isFinite(value)))
        throw Error('Invalid Osprey OI enrichment');
      if (a!=null&&b!=null&&a!==b) throw Error('Conflicting Osprey OI values');
      merged[key]=a??b??null;
    }
    return merged;
  });
}

export function projectBoard(raw: unknown, date: string, requested: string | null, now = Date.now()): OspreyBoard {
  const board = raw as Record<string, unknown> | null;
  if (!board || board.source !== 'osprey' || board.date !== date || typeof board.available !== 'boolean')
    throw Error('Invalid Osprey session');
  if (!board.available) return {date,source:'osprey',cut:'',cuts:[],rows:[],available:false};
  const cut = board.cut;
  if (!validCut(cut) || (requested && requested !== cut) || Date.parse(date+'T'+cut+':00+05:30') > now)
    throw Error('Invalid Osprey cut');
  if (!Array.isArray(board.cuts) || board.cuts.length > 76 ||
      board.cuts.some(value => !validCut(value) || Date.parse(date+'T'+value+':00+05:30') > now) ||
      !Array.isArray(board.rows) || board.rows.length > MAX_ROWS)
    throw Error('Invalid Osprey board');
  const cuts = [...new Set([...board.cuts,cut])].sort();
  const seen = new Set<string>();
  const rows: OspreyRow[] = board.rows.map(value => {
    const row = value as Record<string,unknown> | null;
    if (!row || typeof row.symbol !== 'string' || !/^[A-Z0-9&_. -]{1,40}$/.test(row.symbol) ||
        !MODES.includes(row.mode as OspreyRow['mode']) || !['BULL','BEAR','—'].includes(String(row.side)))
      throw Error('Invalid Osprey stock');
    const key = [row.mode,row.symbol,row.side].join('|');
    if (seen.has(key)) throw Error('Duplicate Osprey stock');
    seen.add(key);
    const confirmed = time(row.confirmed,cut);
    const state = confirmed ? 'Confirmed' : STATES.includes(row.state as OspreyRow['state'])
      ? row.state as OspreyRow['state'] : 'Snapshot';
    const strength = number(row.strengthening);
    const evidence = text(row.evidence,2048).match(/\b(?:CE|PE)_(?:BUILD|UNWIND)\b/g) ?? [];
    const strikes = text(row.strikes,120) || (strength !== null
      ? strength+' strengthening'
      : [...new Set([row.oi_5m_route,row.oi_15m_route,...evidence])].map(item=>routes[String(item)]).filter(Boolean).join(' · '));
    return {
      symbol:row.symbol,mode:row.mode as OspreyRow['mode'],side:row.side as OspreyRow['side'],
      score:number(row.score),oi_5m:number(row.oi_5m),oi_15m:number(row.oi_15m),
      ce_pct:number(row.ce_pct),pe_pct:number(row.pe_pct),oi_bias:number(row.oi_bias),
      rvol:number(row.rvol),rvol_sessions:number(row.rvol_sessions),sector_strength:number(row.sector_strength),
      sector_samples:number(row.sector_samples),move_pct:number(row.move_pct),strengthening:strength,
      sector:text(row.sector),sector_source:text(row.sector_source),first:time(row.first,cut),
      last:time(row.last,cut),confirmed,state,strikes,
      oi_5m_route:routes[String(row.oi_5m_route)] ?? '',oi_15m_route:routes[String(row.oi_15m_route)] ?? '',
    };
  });
  return {date,source:'osprey',cut,cuts,rows,available:true};
}
