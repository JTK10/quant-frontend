import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/utils/auth";
import history from "@/data/nifty-chart.json";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const matches = request.nextUrl.searchParams.get("symbol") === "NIFTY 50" && request.nextUrl.searchParams.get("date") === history.date;
  return NextResponse.json({ bars: matches ? history.bars : [] }, { headers: { "Cache-Control": "private, no-store" } });
}
