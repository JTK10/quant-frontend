export type KairosEngine = "kairos" | "kairos2" | "kairos_rusty" | "kairos9" | "kairos10";
export type KairosEvent = Record<string, unknown>;
export type KairosTrade = { sid: string; entry?: KairosEvent; mtm?: KairosEvent; exit?: KairosEvent };

export function kairosNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function kairosSource(e: KairosEvent): KairosEngine | null {
  if (e.source === "kairos10" || e.cap === "KAIROS10") return "kairos10";
  if (e.source === "kairos9" || e.cap === "KAIROS9") return "kairos9";
  if (e.source === "kairos_rusty" || e.cap === "KAIROS_RUSTY") return "kairos_rusty";
  if (e.source === "kairos2" || e.cap === "KAIROS2") return "kairos2";
  if (e.source === "kairos" || e.cap === "KAIROS") return "kairos";
  return null;
}

export function resolveKairosEngine(value: unknown): KairosEngine {
  return value === "kairos" || value === "kairos2" || value === "kairos_rusty" || value === "kairos9" ? value : "kairos10";
}

// The page needs each entry/exit and latest mark, not every superseded mark or
// heartbeat. This bounds serialized browser data without changing the ledger.
export function compactKairosEvents(events: KairosEvent[], engine: KairosEngine): KairosEvent[] {
  const latest = new Map<string, KairosEvent>();
  const skips = new Map<string, KairosEvent>();
  for (const e of events) {
    if (kairosSource(e) !== engine) continue;
    const kind = String(e.kind ?? "");
    if (kind === "SKIP") {
      skips.set(String(e.Doc_ID ?? `${e.ts}|${e.name}|${e.reason}`), e);
      continue;
    }
    if (!["HEALTH", "ENTRY", "MTM", "EXIT"].includes(kind)) continue;
    const id = e.signal_id || e.name;
    if (kind !== "HEALTH" && !id) continue;
    const key = kind === "HEALTH" ? "HEALTH" : `${String(id)}|${kind}`;
    const previous = latest.get(key);
    if (!previous || (kairosNumber(e.ts) ?? 0) >= (kairosNumber(previous.ts) ?? 0)) latest.set(key, e);
  }
  return [...latest.values(), ...[...skips.values()].sort((a,b)=>(kairosNumber(b.ts)??0)-(kairosNumber(a.ts)??0)).slice(0,50)]
    .sort((a,b)=>(kairosNumber(a.ts)??0)-(kairosNumber(b.ts)??0));
}

export type KairosFeedState = { key: string; asOf: number; events: KairosEvent[]; error: string | null; lastSuccess: number | null };
export function updateKairosFeed(previous: KairosFeedState | null, incoming: { key: string; asOf: number; events: KairosEvent[]; error: string | null }, engine: KairosEngine): KairosFeedState {
  const same = previous?.key === incoming.key;
  if (incoming.error) return { ...incoming, events: same ? previous.events : [], lastSuccess: same ? previous.lastSuccess : null };
  return { ...incoming, events: compactKairosEvents([...(same ? previous.events : []), ...incoming.events], engine), lastSuccess: incoming.asOf };
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
