import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeInstitutionalWatchlist } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("institutional-watchlist", dateStr, {
      pk: `PCR_WATCHLIST#${dateStr}`
    });
    return NextResponse.json(normalizeInstitutionalWatchlist(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load pulse data." },
      { status: 500 },
    );
  }
}

