/**
 * Strictly causal Fix A Sniper badge evaluator for Viper Signal (/viper-signal).
 *
 * Verified across 3 monthly expiry cycles (Sep 10 – Nov 23, 2026, n=43):
 *   - Normal weeks (weekdaysUntil(date, expiry) > 5):
 *       BULL + first + cut <= 11:30 + Above VWAP + Peak R.Fac < 1.5
 *   - Expiry week (weekdaysUntil(date, expiry) <= 5):
 *       Same + institutional cash volume confirmation (RVOL >= 1.5 AND Active RVOL >= 2.0)
 *       to reject mechanical front-month rollover OI runoff.
 */

export type SniperMode = 'normal' | 'expiry';

export interface FixAInput {
  side: 'BULL' | 'BEAR';
  cut: string;
  date: string;
  expiry: string;
  aboveVwap: boolean | null;
  peakRfac: number | null;
  rvol: number | null;
  activeRvol: number | null;
  first: boolean;
}

export interface FixAResult {
  sniper: boolean;
  sniperMode: SniperMode | null;
}

export function weekdaysUntil(dateIso: string, expiryIso: string): number {
  const start = Date.parse(dateIso + 'T00:00:00Z');
  const end = Date.parse(expiryIso + 'T00:00:00Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur.getTime() < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function evaluateFixASniper(input: FixAInput): FixAResult {
  if (input.side !== 'BULL' || !input.first || input.cut > '11:30') {
    return {sniper: false, sniperMode: null};
  }
  if (input.aboveVwap !== true) {
    return {sniper: false, sniperMode: null};
  }
  if (input.peakRfac === null || !Number.isFinite(input.peakRfac) || input.peakRfac >= 1.5) {
    return {sniper: false, sniperMode: null};
  }
  const dte = weekdaysUntil(input.date, input.expiry);
  if (dte > 5) {
    return {sniper: true, sniperMode: 'normal'};
  }
  const volConfirmed =
    input.rvol !== null && Number.isFinite(input.rvol) && input.rvol >= 1.5 &&
    input.activeRvol !== null && Number.isFinite(input.activeRvol) && input.activeRvol >= 2.0;
  return volConfirmed
    ? {sniper: true, sniperMode: 'expiry'}
    : {sniper: false, sniperMode: null};
}
