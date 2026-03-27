import { NextResponse } from "next/server";
import { getTodayInIST } from "../../utils/date";

export const dynamic = "force-dynamic";

type RawWatchlistItem = {
  PK?: string;
  SK?: string;
  Direction?: string;
  StoredAt?: string;
};

type WatchlistItem = {
  SK: string;
  Direction: "LONG" | "SHORT";
  StoredAt: string;
};

function normalizeWatchlistItem(raw: RawWatchlistItem): WatchlistItem | null {
  const symbol = typeof raw.SK === "string" ? raw.SK.trim() : "";
  const directionRaw = typeof raw.Direction === "string" ? raw.Direction.toUpperCase() : "";
  const storedAt = typeof raw.StoredAt === "string" ? raw.StoredAt : "";

  if (!symbol || (directionRaw !== "LONG" && directionRaw !== "SHORT") || !storedAt) {
    return null;
  }

  return {
    SK: symbol,
    Direction: directionRaw,
    StoredAt: storedAt,
  };
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const baseUrl = process.env.AWS_API_URL;
    const secret = process.env.RADAR_SECRET;

    if (!baseUrl || !secret) {
      return NextResponse.json([]);
    }

    const todayInIST = getTodayInIST();
    const partitionKey = `PCR_WATCHLIST#${todayInIST}`;
    const awsUrl = new URL(baseUrl);
    awsUrl.searchParams.set("route", "institutional-watchlist");
    awsUrl.searchParams.set("pk", partitionKey);
    awsUrl.searchParams.set("KeyConditionExpression", "PK = :pk");
    awsUrl.searchParams.set(
      "ExpressionAttributeValues",
      JSON.stringify({
        ":pk": partitionKey,
      })
    );
    awsUrl.searchParams.set("secret", secret);

    const response = await fetch(awsUrl.toString(), { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json([]);
    }

    const payload: unknown = await parseJsonSafe(response);
    const payloadRecord =
      payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
    const rawItems: unknown[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payloadRecord?.Items)
        ? payloadRecord.Items
        : [];

    const normalized = rawItems
      .map((item: unknown) => normalizeWatchlistItem(item as RawWatchlistItem))
      .filter((item): item is WatchlistItem => item !== null)
      .sort((a, b) => b.StoredAt.localeCompare(a.StoredAt));

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json([]);
  }
}
