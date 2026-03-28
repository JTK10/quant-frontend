import { NextRequest, NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeAiPayload } from "@/utils/backend";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const payload = await fetchBackendRoute("ai-signals", dateStr);
    return NextResponse.json(normalizeAiPayload(payload, dateStr));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load AI picks." },
      { status: 500 },
    );
  }
}
