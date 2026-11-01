export type AurumSignal = {
  id: string;
  symbol: string;
  side: 'BULL' | 'BEAR';
  signal_time: string;
  entry_time?: string | null;
  entry: number | null;
  reference_price: number | null;
  ce_pct: number | null;
  pe_pct: number | null;
  oi_bias: number | null;
  view: string | null;
  bar_rvol: number | null;
  cum_rvol: number | null;
  pullback_confirmed: boolean | null;
  rusty_status?: string;
  rusty_cut?: string | null;
  recovered?: boolean;
  issued_at?: string | null;
};

export type AurumResponse = {
  source?: 'aurum';
  date: string;
  asof: string | null;
  state?: string;
  status: string;
  message?: string;
  mode?: 'historical' | 'live';
  stale?: boolean;
  engine?: string;
  signals: AurumSignal[];
  available_dates?: string[];
};
