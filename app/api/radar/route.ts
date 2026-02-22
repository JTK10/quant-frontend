import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(
      "ayg0muysdf.execute-api.ap-south-1.amazonaws.com/default/daiyprecalculate?route=smart-radar&secret=EliteQuant2026!",
      { cache: "no-store" }
    );

    const data = await res.json();

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
