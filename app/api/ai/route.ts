import { NextRequest, NextResponse } from "next/server";
import {
  asSignalRecord,
  isScannerSignalRow,
  normalizeRadarSignal,
  sortSignalRows,
  toNumber,
  toText,
} from "../../utils/scanner";

export const dynamic = "force-dynamic";

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
    awsUrl.searchParams.set("route", "ai-signals");
    const date =
      request.nextUrl.searchParams.get("date") ??
      new Date().toISOString().split("T")[0];
    awsUrl.searchParams.set("date", date);
    awsUrl.searchParams.set("secret", secret);

    const res = await fetch(awsUrl.toString(), { cache: "no-store" });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }

    const rows = Array.isArray(data)
      ? data.filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      : [];

    if (!rows.some((row) => isScannerSignalRow(asSignalRecord(row)))) {
      return NextResponse.json(rows);
    }

    const normalized = sortSignalRows(
      rows.map((row) => {
        const record = asSignalRecord(row);
        const base = normalizeRadarSignal(record);
        const callWall = toText(base.CallWall, "-");
        const putWall = toText(base.PutWall, "-");

        return {
          ...base,
          Decision: toText(record.Decision ?? record.Alert_Type ?? record.AI_Decision, "AI_SELECTED").replace(/_/g, " "),
          Reason: toText(record.Reason ?? record.AI_Reason ?? record.Notes) || "-",
          Time: toText(record.Time ?? record.Signal_Time ?? record.Fired_At),
          Entry: toNumber(record.Entry ?? base.Entry),
          Target: toNumber(record.Target ?? record.Target1 ?? base.Target1),
          StopLoss: toNumber(record.StopLoss ?? record.SL ?? base.SL),
          RiskReward: toText(record.RiskReward ?? base.RiskReward),
          Confidence: toNumber(record.Confidence ?? record.AI_Confidence ?? base.Confidence),
          LiveMove: toNumber(record.LiveMove ?? record.Day_Move_Pct ?? base.Day_Move_Pct),
          PCR: toNumber(record.PCR ?? record.Option_PCR ?? base.PCR),
          PCR_At_Open: toNumber(record.PCR_At_Open ?? base.PCR_At_Open),
          Module: toText(record.Module ?? base.Module),
          ModuleLabel: base.ModuleLabel,
          Side: base.Side,
          StrikeRec: toText(record.StrikeRec ?? record.Strike_Rec ?? base.Strike_Rec),
          OptionsPlay: toText(record.OptionsPlay ?? record.Options_Play ?? record.AI_Options_Play ?? base.OptionsPlay),
          CallWall: callWall,
          PutWall: putWall,
          Walls: toText(record.Walls) || `${callWall} / ${putWall}`,
        };
      })
    );

    return NextResponse.json(normalized);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
