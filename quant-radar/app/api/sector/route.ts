import { NextRequest, NextResponse } from "next/server";
import {
  buildSectorData,
  fetchBackendRoute,
  getTodayIstDate,
  normalizeRadarSignals,
} from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("sector-heatmap", dateStr);
    const signals = normalizeRadarSignals(payload);
    return NextResponse.json(buildSectorData(signals));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sector data." },
      { status: 500 },
    );
  }
}

