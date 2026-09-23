export const CHART_WATCHLIST_STORAGE_KEY = "quant-radar:charts-watchlist:v1";
export const CHART_WATCHLIST_UPDATED_EVENT = "quant-radar:charts-watchlist-updated";

function normalizeSymbols(symbols: unknown): string[] {
  if (!Array.isArray(symbols)) return [];
  return Array.from(new Set(
    symbols
      .filter((symbol): symbol is string => typeof symbol === "string")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  ));
}

export function getStoredChartWatchlist(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHART_WATCHLIST_STORAGE_KEY);
    if (raw === null) return null;
    return normalizeSymbols(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function readChartWatchlist(fallback: string[] = []): string[] {
  return getStoredChartWatchlist() ?? normalizeSymbols(fallback);
}

export function writeChartWatchlist(symbols: string[]): string[] {
  const normalized = normalizeSymbols(symbols);
  if (typeof window === "undefined") return normalized;
  try {
    window.localStorage.setItem(CHART_WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new Event(CHART_WATCHLIST_UPDATED_EVENT));
  } catch {
    // Keep the in-memory UI usable if browser storage is unavailable.
  }
  return normalized;
}

export function addChartWatchlistSymbol(symbol: string): string[] {
  const normalized = symbol.trim().toUpperCase();
  const current = readChartWatchlist();
  if (!normalized || current.includes(normalized)) return current;
  return writeChartWatchlist([...current, normalized]);
}
