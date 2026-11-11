export const VIPER_MAX_CUTS = 76;
export const VIPER_MAX_ORIGIN_BYTES = 2 * 1024 * 1024;
export const VIPER_MAX_ROWS_PER_CUT = 150;
export const VIPER_POLL_MS = 300000;

export const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export const validCut = (value: string) => /^(09|1[0-5]):[0-5][05]$/.test(value) && value >= '09:15' && value <= '15:30';

export type Side = 'bull' | 'bear';
export type ViperRow = {
  symbol: string;
  state: string;
  cut: string;
  strike: number;
  expiry: string;
  spot: number | null;
  premium: number | null;
  breakeven: number | null;
  distance: number | null;
  unwind: number | null;
  baseline_build: number | null;
};

export type ViperCut = {cut: string; recovered: boolean; limited: boolean; bull: ViperRow[]; bear: ViperRow[]};
export type ViperBoard = {
  source: 'viper';
  date: string;
  baseline: string | null;
  cuts: ViperCut[];
  lastCut: string | null;
};

export const WATCH_STATES = ['RECLAIM COVERING', 'BREAKDOWN COVERING'];
export const IGNITION_STATES = ['STRICT IGNITION', 'PAIN IGNITION'];
export const EVENT_STATES = [...WATCH_STATES, ...IGNITION_STATES, 'BRIDGE IGNITION', 'EXHAUSTED'];
export const ACTIVE_STATES = [...EVENT_STATES.filter(state => state !== 'EXHAUSTED'), 'STALKING', 'SQUEEZING', 'ACTIVE DATA GAP', 'TRACKING'];

export function mergeViperCuts(previous: ViperBoard | null, update: ViperBoard): ViperBoard {
  if (previous?.date !== update.date) return update;
  if (previous.baseline && update.baseline && previous.baseline !== update.baseline) throw new Error('Viper baseline changed for this session');
  const cuts = new Map(previous.cuts.map(item => [item.cut, item]));
  for (const item of update.cuts) cuts.set(item.cut, item);
  return {
    ...update,
    baseline: update.baseline ?? previous.baseline,
    cuts: [...cuts.values()].sort((a, b) => a.cut.localeCompare(b.cut)),
    lastCut: update.lastCut ?? previous.lastCut,
  };
}
