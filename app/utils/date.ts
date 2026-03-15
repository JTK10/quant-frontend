export type DateSearchParams = { date?: string } | Promise<{ date?: string }>;

const IST_TIME_ZONE = "Asia/Kolkata";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayInIST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function getEffectiveTradingDateInIST(): string {
  const today = getTodayInIST();
  const [year, month, day] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 6) return shiftDate(today, -1); // Saturday -> Friday
  if (dow === 0) return shiftDate(today, -2); // Sunday -> Friday
  return today;
}

export async function resolveDate(searchParams: DateSearchParams): Promise<string> {
  const params = await searchParams;
  const date = params?.date;
  if (typeof date === "string" && DATE_RE.test(date)) return date;
  return getEffectiveTradingDateInIST();
}
