import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync("utils/tradingCharts.ts", "utf8");
const exports = {};
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
vm.runInNewContext(compiled, {
  exports,
  URLSearchParams,
  require: (name) => JSON.parse(fs.readFileSync(new URL("../utils/" + name, import.meta.url))),
});

const { buildTradingChartsUrl } = exports;
const samples = [
  ["RELIANCE", undefined, "NSEE2885:RELIANCE"],
  ["NSE:M&M", undefined, "NSEE2031:M&M"],
  ["BAJAJ-AUTO", undefined, "NSEE16669:BAJAJ-AUTO"],
  ["", "Reliance Industries Ltd", "NSEE2885:RELIANCE"],
  ["Nifty 50", undefined, "NSEI13:NIFTY"],
  ["India VIX", undefined, "NSEI21:INDIA VIX"],
  ["ICICIPRULI", undefined, "NSEE18652:ICICILIFE"],
];
for (const [symbol, name, expected] of samples) {
  const url = new URL(buildTradingChartsUrl(symbol, name));
  assert.equal(url.origin, "https://tradingcharts.co");
  assert.equal(url.pathname, "/terminal");
  assert.equal(url.searchParams.get("interval"), "5");
  assert.equal(url.searchParams.get("symbol"), expected);
}
assert.equal(buildTradingChartsUrl("https://untrusted.example"), "https://tradingcharts.co/terminal");
assert.equal(buildTradingChartsUrl("__proto__"), "https://tradingcharts.co/terminal");

const catalog = fs.readFileSync("app/charts/chartSymbols.ts", "utf8");
const symbols = [...catalog.matchAll(/"symbol":"([^"]+)"/g)].map((match) => match[1]);
assert.ok(symbols.length >= 200);
for (const symbol of symbols) {
  const url = new URL(buildTradingChartsUrl(symbol));
  assert.match(url.searchParams.get("symbol") ?? "", /^NSE[EI][1-9]\d*:/, symbol);
  assert.equal(url.searchParams.get("interval"), "5");
}
console.log(`TradingCharts link checks passed for ${symbols.length} chart symbols.`);
