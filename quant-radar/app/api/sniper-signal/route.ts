import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeSniperSignals } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("sniper-signal", dateStr);
    return NextResponse.json(normalizeSniperSignals(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sniper signals data." },
      { status: 500 },
    );
  }
}
