import { NextRequest, NextResponse } from "next/server";
import { getTodayIstDate, normalizeFlowSmartlist } from "@/utils/backend";
import { getInternalApiUrl } from "@/utils/internalApi";

export const dynamic = "force-dynamic";

// Migrated off AWS 2026-07-23: Upstox Smart List is now scanned directly by
// smartlist_deploy/smartlist_scanner.py on the Oracle VM (cap:"SMARTLIST",
// source:"smartlist"), one doc per category per cycle. Reshape into the same
// {category: {count, rows, stored_at}} dict normalizeFlowSmartlist() already
// expects, so nothing downstream (the page component) needs to change.
export async function GET(request: NextRequest) {
  const dateStr = request.nextUrl.searchParams.get("date") ?? getTodayIstDate();

  try {
    const url = await getInternalApiUrl(`/api/panther-signals?date=${encodeURIComponent(dateStr)}`);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`panther-signals failed: ${response.status}`);
    const data = (await response.json()) as any[];

    const rows = data.filter((s) => s.source === "smartlist" && s.cap === "SMARTLIST");
    const latestByCategory: Record<string, any> = {};
    for (const r of rows) {
      const cat = r.category;
      if (!cat) continue;
      if (!latestByCategory[cat] || (r.ts ?? 0) > (latestByCategory[cat].ts ?? 0)) {
        latestByCategory[cat] = r;
      }
    }
    const payload: Record<string, unknown> = {};
    for (const [cat, r] of Object.entries(latestByCategory)) {
      payload[cat] = { count: r.count, rows: r.rows, stored_at: r.time };
    }
    return NextResponse.json(normalizeFlowSmartlist(payload));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load flow smartlist data." },
      { status: 500 },
    );
  }
}
