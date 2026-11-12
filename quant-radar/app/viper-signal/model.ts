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

export {validDate, validCut, VIPER_MAX_CUTS, VIPER_MAX_ORIGIN_BYTES, VIPER_MAX_ROWS_PER_CUT, VIPER_POLL_MS} from '../viper/model';
export type ViperRow = SignalRow;
export type ViperCut = {cut: string; recovered: boolean; limited: boolean; bull: SignalRow[]; bear: SignalRow[]};
export type ViperBoard = {source: 'viper-signal'; date: string; baseline: string | null; cuts: ViperCut[]; lastCut: string | null};
export function mergeViperCuts(previous: ViperBoard | null, update: ViperBoard): ViperBoard {
  if (previous?.date !== update.date) return update;
  if (previous.baseline && update.baseline && previous.baseline !== update.baseline) throw Error('Signal baseline changed');
  const cuts = new Map(previous.cuts.map(c => [c.cut, c]));
  for (const cut of update.cuts) cuts.set(cut.cut, cut);
  return {...update, baseline: update.baseline ?? previous.baseline,
    lastCut: update.lastCut ?? previous.lastCut, cuts: [...cuts.values()].sort((a,b) => a.cut.localeCompare(b.cut))};
}
