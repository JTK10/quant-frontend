import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.AWS_API_URL;
  const secret = process.env.RADAR_SECRET;

  const res = await fetch(
    `${baseUrl}?route=smart-radar&secret=${secret}`
  );

  const data = await res.json();

  return NextResponse.json(data);
}
