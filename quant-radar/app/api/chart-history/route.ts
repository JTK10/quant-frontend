import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/utils/auth";
import history from "@/data/nifty-chart.json";
import september30 from "@/data/nifty-chart-sept30.json";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const selected = [history,september30].find(h=>h.date === request.nextUrl.searchParams.get("date"));
  return NextResponse.json({ bars: request.nextUrl.searchParams.get("symbol") === "NIFTY 50" ? selected?.bars ?? [] : [] }, { headers: { "Cache-Control": "private, no-store" } });
}
