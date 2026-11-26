import { NextRequest, NextResponse } from "next/server";
import { buildTradingChartsUrl } from "@/utils/tradingCharts";

// The static Lupus preview and the Sector Scope iframe share the same lookup.
export function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  return NextResponse.redirect(buildTradingChartsUrl(symbol));
}
