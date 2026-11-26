import instrumentData from "./tradingChartsInstruments.json";
import symbolMap from "./symbolMap.json";

const instruments: Readonly<Record<string, string>> = instrumentData;
const companySymbols: Readonly<Record<string, string>> = symbolMap;
const aliases: Readonly<Record<string, string>> = {
  NIFTY50: "NIFTY",
  NIFTYBANK: "BANKNIFTY",
  NIFTYFINSERVICE: "FINNIFTY",
  INDIAVIX: "INDIA VIX",
  ICICIPRULI: "ICICILIFE",
};

const terminal = "https://tradingcharts.co/terminal";

function ownValue(map: Readonly<Record<string, string>>, key: string) {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

export function buildTradingChartsUrl(symbol?: string | null, name?: string | null): string {
  for (const value of [symbol, name]) {
    if (typeof value !== "string") continue;
    const ticker = value.trim().toUpperCase().replace(/^NSE:/, "");
    const compact = ticker.replace(/\s+/g, "");
    const mapped = ownValue(companySymbols, compact) ?? compact;
    const identifier = ownValue(instruments, ticker)
      ?? ownValue(instruments, ownValue(aliases, mapped) ?? mapped);
    if (identifier) {
      return terminal + "?" + new URLSearchParams({ symbol: identifier, interval: "5" });
    }
  }
  return terminal;
}
