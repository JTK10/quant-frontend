import archive from "./signalArchive.json";
import type { SignalRow } from "./model";

const byDate: Readonly<Record<string, readonly SignalRow[]>> = archive as Record<string, SignalRow[]>;

export const sessionDates = Object.keys(byDate).sort().reverse();

export function sessionRows(date: string): readonly SignalRow[] {
  return Object.hasOwn(byDate, date) ? byDate[date] : [];
}
