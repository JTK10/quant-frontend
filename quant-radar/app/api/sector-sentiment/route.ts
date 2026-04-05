import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("sector-sentiment", dateStr);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sector sentiment data." },
      { status: 500 },
    );
  }
}
