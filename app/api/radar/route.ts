import { NextRequest, NextResponse } from "next/server";
import { getEffectiveTradingDateInIST } from "../../utils/date";
import {
  asSignalRecord,
  isScannerSignalRow,
  normalizeRadarSignal,
  resolveSignalName,
  sortSignalRows,
  toNumber,
} from "../../utils/scanner";
import { getTradingViewUrl, resolveTickerSymbol } from "../../utils/tradingview";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RadarRow = Record<string, unknown>;

function withLegacyRanking(rows: RadarRow[]): RadarRow[] {
  const ranked = rows.map((row) => {
    const latestScore = Number(
      toNumber(row["Latest Score"] ?? row.Latest ?? row.Latest_Score).toFixed(1)
    );
    const signalGeneratedScore = Number(
      toNumber(
        row.Signal_Generated_Score ??
        row.SignalGeneratedScore ??
        row["Signal Generated Score"]
      ).toFixed(1)
    );
    const peakRaw = toNumber(
      row.Peak_Score ?? row.Peak ?? row["Peak Score"] ?? row.Best_Score
    );
    const peakScore = Math.max(peakRaw, latestScore);
    const existingSmartRank = toNumber(row.SmartRank ?? row["Smart Rank"]);
    const smartRank =
      existingSmartRank ||
      0.5 * peakScore + 0.3 * latestScore + 0.2 * signalGeneratedScore;

    return {
      ...row,
      "Latest Score": latestScore,
      Peak_Score: peakScore,
      Signal_Generated_Score: signalGeneratedScore,
      SmartRank: smartRank,
    };
  });

  return ranked.sort((a, b) => toNumber(b.SmartRank) - toNumber(a.SmartRank));
}

function normalizeLegacyRows(rows: RadarRow[]) {
  return withLegacyRanking(rows).map((row) => {
    const record = asSignalRecord(row);
    const name = resolveSignalName(record);
    const ticker = resolveTickerSymbol(name);

    return {
      ...row,
      Name: name,
      TV_Symbol: ticker ? `NSE:${ticker}` : "",
      Chart: name === "UNKNOWN" ? "" : getTradingViewUrl(name),
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.AWS_API_URL;
    const secret = process.env.RADAR_SECRET;

    if (!baseUrl || !secret) {
      return NextResponse.json(
        { error: "Missing environment variables" },
        { status: 500 }
      );
    }

    const awsUrl = new URL(baseUrl);
    awsUrl.searchParams.set("route", "smart-radar");
    const dateParam = request.nextUrl.searchParams.get("date");
    const date =
      typeof dateParam === "string" && DATE_RE.test(dateParam)
        ? dateParam
        : getEffectiveTradingDateInIST();
    awsUrl.searchParams.set("date", date);
    awsUrl.searchParams.set("secret", secret);

    const res = await fetch(awsUrl.toString(), { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const rows = Array.isArray(data)
      ? data.filter((row): row is RadarRow => !!row && typeof row === "object")
      : [];

    if (rows.some((row) => isScannerSignalRow(asSignalRecord(row)))) {
      return NextResponse.json(sortSignalRows(rows.map((row) => normalizeRadarSignal(row))));
    }

    return NextResponse.json(normalizeLegacyRows(rows));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
