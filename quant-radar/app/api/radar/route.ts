import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeRadarSignals } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("smart-radar", dateStr);
    return NextResponse.json(normalizeRadarSignals(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load radar data." },
      { status: 500 },
    );
  }
}

