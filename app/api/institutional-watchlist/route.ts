import { NextRequest, NextResponse } from "next/server";
import { getTodayInIST } from "../../utils/date";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

type DynamoString = { S?: string };
type DynamoLikeItem = {
  PK?: DynamoString;
  SK?: DynamoString;
  Direction?: DynamoString;
  StoredAt?: DynamoString;
};

function normalizeWatchlistItem(raw: RawWatchlistItem): WatchlistItem | null {
  const symbol = typeof raw.SK === "string" ? raw.SK.trim() : "";
  const directionRaw = typeof raw.Direction === "string" ? raw.Direction.toUpperCase() : "";
  const storedAt = typeof raw.StoredAt === "string" ? raw.StoredAt : "";

  if (!symbol || !storedAt || (directionRaw !== "LONG" && directionRaw !== "SHORT")) {
    return null;
  }

  return {
    SK: symbol,
    Direction: directionRaw as "LONG" | "SHORT",
    StoredAt: storedAt,
  };
}

function normalizeUnknownItem(item: unknown): WatchlistItem | null {
  if (!item || typeof item !== "object") return null;

  const row = item as Record<string, unknown>;
  const isDynamoShape =
    row.SK && typeof row.SK === "object" && "S" in (row.SK as Record<string, unknown>);

  if (isDynamoShape) {
    const dynamoItem = row as unknown as DynamoLikeItem;
    return normalizeWatchlistItem({
      PK: dynamoItem.PK?.S,
      SK: dynamoItem.SK?.S,
      Direction: dynamoItem.Direction?.S,
      StoredAt: dynamoItem.StoredAt?.S,
    });
  }

  return normalizeWatchlistItem(row as RawWatchlistItem);
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

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.Items)) return record.Items;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;

  return [];
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.AWS_API_URL;
    const secret = process.env.RADAR_SECRET;

    if (!baseUrl || !secret) {
      return NextResponse.json([]);
    }

    const requestedDate = request.nextUrl.searchParams.get("date");
    const date = requestedDate && DATE_RE.test(requestedDate) ? requestedDate : getTodayInIST();
    const partitionKey = `PCR_WATCHLIST#${date}`;

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

    const payload = await parseJsonSafe(response);
    const normalized = extractItems(payload)
      .map((item: unknown) => normalizeUnknownItem(item))
      .filter((item): item is WatchlistItem => item !== null)
      .sort((a, b) => b.StoredAt.localeCompare(a.StoredAt));

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json([]);
  }
}