// Causal Peak R.Fac fallback for ORDS Viper Signal sessions published before VM2 native peakRfac rollout (Nov 13-23, 2026).
const RECENT_PEAK_RFAC: Readonly<Record<string, number>> = {
  '2026-11-13|ENRIN|09:55': 1.22,
  '2026-11-16|MANKIND|09:50': 0.66,
  '2026-11-17|LICHSGFIN|13:25': 1.67,
  '2026-11-17|TATACONSUM|09:45': 0.38,
  '2026-11-19|BHARATFORG|09:40': 0.44,
  '2026-11-19|GAIL|09:45': 0.43,
  '2026-11-19|MAHABANK|10:15': 0.84,
  '2026-11-19|MOTHERSON|10:25': 1.71,
  '2026-11-19|NAVINFLUOR|09:45': 0.18,
  '2026-11-19|NTPC|10:05': 0.5,
  '2026-11-19|SBIN|09:40': 0.27,
  '2026-11-20|INFY|09:35': 0.47,
  '2026-11-20|TCS|10:15': 0.64,
};

export function recentPeakRfac(date: string, symbol: string, cut: string): number | null {
  const key = `${date}|${symbol.trim().toUpperCase()}|${cut.slice(0, 5)}`;
  return Object.hasOwn(RECENT_PEAK_RFAC, key) ? RECENT_PEAK_RFAC[key] : null;
}
