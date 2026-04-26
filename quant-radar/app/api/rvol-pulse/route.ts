import { NextResponse } from "next/server";
import { fetchBackendRoute, getTodayIstDate, normalizeRvolPulseData } from "@/utils/backend";

export const revalidate = 0; // Disable static optimization

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || getTodayIstDate();

    const rawData = await fetchBackendRoute("rvol-pulse", date);
    const data = normalizeRvolPulseData(rawData);

    return NextResponse.json(data);
  } catch (error) {
    console.error("API error in /api/rvol-pulse:", error);
    return NextResponse.json(
      { error: "Failed to fetch RVOL Pulse data." },
      { status: 500 }
    );
  }
}
