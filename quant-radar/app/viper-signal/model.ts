export interface SignalRow {
  side: 'BULL' | 'BEAR';
  symbol: string;
  cut: string;
  route: string;
  strike: number;
  level: number;
  rvol: number | null;
  activeRvol: number | null;
  unwind: number | null;
  opposite: number | null;
  oppositeConfirmed: boolean | null;
  first: boolean;
}
