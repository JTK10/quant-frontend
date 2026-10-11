export type IrbisCandidate = {
  symbol: string; side: 'BULL' | 'BEAR'; setup: string; score: number | null;
  rerank_score?: number | null;
  base_rank: number; rank: number; price: number | null; vwap: number | null;
  ce_change_pct: number | null; pe_change_pct: number | null;
  confirmed: boolean; coverage: number | null;
};

export type IrbisDocument = {
  source: string; sig_date: string; Doc_ID: string; kind?: string;
  Date?: string; Time?: string; Issued_At: string; Available_At: string;
  Recovered?: boolean; Model_ID?: string; State: string; Cut?: string;
  Decision_Time?: string; OI_Cut?: string; Frozen_At?: string; Reason?: string;
  Total_Candidates?: number; Baseline_Ready?: boolean; Coverage?: unknown;
  Health_At?: string; Last_Cut?: string;
  Candidates?: IrbisCandidate[];
};

export type IrbisResponse = {
  date: string; asof: string; state: string; status: string; stale: boolean;
  cut: string | null; decision_time: string | null; oi_cut: string | null;
  issued_at: string | null; available_at: string | null; model_id: string | null;
  recovered: boolean; candidates: IrbisCandidate[]; total_candidates: number | null;
};

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function foldIrbis(docs: IrbisDocument[], date: string, limit: number): IrbisResponse {
  const selected = docs.filter(d => d.source === 'irbis' && String(d.sig_date) === date.replaceAll('-', '') &&
    (!d.kind || ['SNAPSHOT', 'HEALTH'].includes(d.kind)) &&
    Number.isFinite(Date.parse(d.Available_At)) && Date.parse(d.Available_At) <= limit &&
    Number.isFinite(Date.parse(d.Issued_At)) && Date.parse(d.Issued_At) <= limit)
    .sort((a, b) => Date.parse(a.Available_At) - Date.parse(b.Available_At));
  const unique = new Map<string, IrbisDocument>();
  for (const d of selected) if (d.Doc_ID) unique.set(d.Doc_ID, d);
  const ordered = [...unique.values()];
  const latest = [...ordered].reverse().find(d => d.kind !== 'HEALTH');
  const health = [...ordered].reverse().find(d => d.kind === 'HEALTH');
  const raw = latest?.Candidates ?? [];
  const candidates: IrbisCandidate[] = raw.filter(c => c && typeof c.symbol === 'string' && /^[A-Z0-9&-]{1,25}$/.test(c.symbol) &&
    (c.side === 'BULL' || c.side === 'BEAR') && Number.isFinite(c.rank))
    .map(c => ({symbol: c.symbol, side: c.side, setup: String(c.setup ?? ''), score: numberOrNull(c.score),
      rerank_score: numberOrNull(c.rerank_score),
      base_rank: Number.isFinite(c.base_rank) ? c.base_rank : c.rank, rank: c.rank,
      price: numberOrNull(c.price), vwap: numberOrNull(c.vwap),
      ce_change_pct: numberOrNull(c.ce_change_pct), pe_change_pct: numberOrNull(c.pe_change_pct),
      confirmed: c.confirmed === true, coverage: numberOrNull(c.coverage)}))
    .sort((a,b) => a.rank - b.rank || a.symbol.localeCompare(b.symbol));
  const state = health?.State === 'ERROR' && latest ? 'ERROR' :
    health?.State === 'CLOSED' && latest ? 'CLOSED' :
    latest?.State ?? health?.State ?? 'PENDING';
  const available = latest?.Available_At ?? null;
  const nowDate = new Date(limit).toLocaleDateString('en-CA', {timeZone: 'Asia/Kolkata'});
  const stale = Boolean(available && latest?.Cut !== '10:15' && date === nowDate && limit - Date.parse(available) > 7 * 60_000 &&
    limit >= Date.parse(`${date}T10:00:00+05:30`) && limit <= Date.parse(`${date}T10:30:00+05:30`));
  const status = state === 'CLOSED' && latest ? 'Morning scanner closed · showing final captured ranking' :
    state === 'CLOSED' ? 'Scanner closed for this session' :
    state === 'HOLIDAY' ? 'Market holiday · no scanner session' :
    state === 'EMPTY' ? 'No qualifying candidates in this session' :
    state === 'ERROR' ? (health?.State === 'ERROR' ? health.Reason : latest?.Reason) ?? 'Scanner unavailable' :
    !latest ? 'Waiting for the 10:00 scanner shortlist' :
    stale ? 'Latest scanner capture is delayed' :
    latest.Cut === '10:15' ? 'Final morning rank · scanner frozen after 10:15' :
    'Morning scanner active · rankings can change through 10:15';
  return {date, asof: new Date(limit).toISOString(), state, status, stale,
    cut: latest?.Cut ?? null, decision_time: latest?.Decision_Time ?? latest?.Time ?? null,
    oi_cut: latest?.OI_Cut ?? null, issued_at: latest?.Issued_At ?? null,
    available_at: available, model_id: latest?.Model_ID ?? null,
    recovered: Boolean(latest?.Recovered), candidates,
    total_candidates: numberOrNull(latest?.Total_Candidates)};
}
