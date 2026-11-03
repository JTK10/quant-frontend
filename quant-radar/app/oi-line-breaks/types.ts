export type LineRow = {
  rank: number;
  direction_rank: number;
  symbol: string;
  direction: 'BULL' | 'BEAR';
  strike: number;
  leg: 'CE' | 'PE';
  break_cut: string;
  respected_days: number;
  trapped_buildup_days: number;
  fresh_oi_share_pct: number;
  move_pct: number | null;
  qualified: boolean;
  pdh_broken: boolean|null;
  pdl_broken: boolean|null;
};

export type LineEvidence = {
  respected_dates: string;
  trapped_dates: string;
  fresh_oi_added: number;
  net_oi_change: number;
  prior_day_evidence: string;
  first_oi: number;
  last_oi: number;
};

export type LineSession = {date:string; cuts:number; coverage:string; last_cut:string; bytes:number};
export type LineBoard = {
  source: 'oi-line-breaks';
  mode?: 'live'|'historical';
  status?: string;
  stale?: boolean;
  recovered?: boolean;
  asof?: string|null;
  coverage_counts?: {eligible:number;cash:number;ranked:number;wicks_complete:boolean;status:string};
  date: string;
  cut: string;
  cuts: string[];
  prior_day: string;
  coverage: string;
  sessions: LineSession[];
  setup: LineRow[];
  move: LineRow[];
  evidence: Record<string,LineEvidence>;
};

export const lineKey = (row: Pick<LineRow,'symbol'|'leg'|'strike'>) => `${row.symbol}|${row.leg}|${row.strike}`;
