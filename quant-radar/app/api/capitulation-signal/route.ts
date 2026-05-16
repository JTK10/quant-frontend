import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeCapitulationSignals } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("capitulation-signal", dateStr);
    return NextResponse.json(normalizeCapitulationSignals(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load capitulation signals data." },
      { status: 500 },
    );
  }
}
