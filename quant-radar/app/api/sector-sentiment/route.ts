import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    for (let i = 0; i < 5; i++) {
        const payload = await fetchBackendRoute("sector-sentiment", dateStr);
        if (Array.isArray(payload) && payload.length > 0) {
            return NextResponse.json(payload);
        }
        // Subtract one day and retry
        const d = new Date(dateStr);
        d.setDate(d.getDate() - 1);
        dateStr = d.toISOString().split("T")[0];
    }
    return NextResponse.json([]); // return empty if all 5 days are empty
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load sector sentiment data." },
      { status: 500 },
    );
  }
}
