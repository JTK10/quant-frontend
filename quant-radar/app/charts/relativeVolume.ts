/** Volume relative to the same IST candle slot in previous trading sessions. */
export type RelativeVolumeBar = { time: number; volume: number };
export type RelativeVolumePoint = { value: number | null; samples: number };

const DAY_SECONDS = 86_400;
const IST_OFFSET_SECONDS = 19_800;

/**
 * Source contains one symbol and one already-aggregated timeframe.
 * Sessions are IST dates present in source. Missing slots do not extend the
 * window beyond the previous `lookback` sessions. Current-day volume never
 * enters that day's denominator. Partial history is reported through samples.
 * Still-forming bars are provisional against the historical full-slot average.
 */
export function computeRelativeVolume(
  source: readonly RelativeVolumeBar[],
  lookback = 20,
): Map<number, RelativeVolumePoint> {
  if (!Number.isInteger(lookback) || lookback < 1) {
    throw new RangeError("Relative-volume lookback must be a positive integer");
  }
  // Latest snapshot/live revision wins, even when its volume is invalid.
  const latest = new Map<number, RelativeVolumeBar>();
  for (const bar of source) if (Number.isFinite(bar.time)) latest.set(bar.time, bar);
  const sessions = new Map<number, RelativeVolumeBar[]>();
  for (const bar of [...latest.values()].sort((a, b) => a.time - b.time)) {
    const day = Math.floor((bar.time + IST_OFFSET_SECONDS) / DAY_SECONDS);
    const session = sessions.get(day);
    if (session) session.push(bar);
    else sessions.set(day, [bar]);
  }
  const result = new Map<number, RelativeVolumePoint>();
  const totals = new Map<number, { sum: number; count: number }>();
  const history: Map<number, number>[] = [];
  for (const [day, bars] of sessions) {
    const today = new Map<number, number>();
    for (const bar of bars) {
      const slot = bar.time + IST_OFFSET_SECONDS - day * DAY_SECONDS;
      const reference = totals.get(slot);
      const samples = reference?.count ?? 0;
      const mean = samples && reference ? reference.sum / samples : 0;
      const valid = Number.isFinite(bar.volume) && bar.volume >= 0;
      const ratio = valid && mean > 0 ? bar.volume / mean : null;
      result.set(bar.time, {
        value: ratio !== null && Number.isFinite(ratio) ? ratio : null,
        samples,
      });
      if (valid) today.set(slot, bar.volume);
    }
    // Add this day only after computing every result for it.
    history.push(today);
    for (const [slot, volume] of today) {
      const reference = totals.get(slot) ?? { sum: 0, count: 0 };
      reference.sum += volume;
      reference.count++;
      totals.set(slot, reference);
    }
    if (history.length > lookback) {
      const expired = history.shift()!;
      for (const [slot, volume] of expired) {
        const reference = totals.get(slot)!;
        reference.sum -= volume;
        reference.count--;
        if (reference.count === 0) totals.delete(slot);
      }
    }
  }
  return result;
}
