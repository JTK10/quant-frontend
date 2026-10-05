export type KairosEngine = "kairos" | "kairos2";
export type KairosEvent = Record<string, unknown>;
export type KairosTrade = { sid: string; entry?: KairosEvent; mtm?: KairosEvent; exit?: KairosEvent };

export function kairosNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function kairosSource(e: KairosEvent): KairosEngine | null {
  if (e.source === "kairos2" || e.cap === "KAIROS2") return "kairos2";
  if (e.source === "kairos" || e.cap === "KAIROS") return "kairos";
  return null;
}

export function kairosSummary(events: KairosEvent[], engine: KairosEngine) {
  const groups = new Map<string, KairosTrade>();
  let health: KairosEvent | undefined;
  const skips: KairosEvent[] = [];
  for (const e of events) {
    if (kairosSource(e) !== engine) continue;
    if (e.kind === "HEALTH") {
      if (!health || (kairosNumber(e.ts) ?? 0) > (kairosNumber(health.ts) ?? 0)) health = e;
      continue;
    }
    if (e.kind === "SKIP") { skips.push(e); continue; }
    const id = e.signal_id || e.name;
    if (!id) continue;
    const sid = `${engine}|${String(id)}`;
    const group = groups.get(sid) ?? { sid };
    const field = e.kind === "ENTRY" ? "entry" : e.kind === "MTM" ? "mtm" : e.kind === "EXIT" ? "exit" : null;
    if (!field) continue;
    if (!group[field] || (kairosNumber(e.ts) ?? 0) > (kairosNumber(group[field]?.ts) ?? 0)) group[field] = e;
    groups.set(sid, group);
  }
  const open: KairosTrade[] = [], closed: KairosTrade[] = [];
  let realized = 0, unrealized = 0;
  for (const group of groups.values()) {
    if (group.exit) {
      closed.push(group); realized += kairosNumber(group.exit.pnl) ?? 0;
    } else if (group.entry) {
      open.push(group); unrealized += kairosNumber(group.mtm?.pnl) ?? 0;
    }
  }
  open.sort((a,b) => String(a.entry?.time ?? "").localeCompare(String(b.entry?.time ?? "")));
  closed.sort((a,b) => String(b.exit?.time ?? "").localeCompare(String(a.exit?.time ?? "")));
  return { open, closed, realized, unrealized, health, skips };
}
