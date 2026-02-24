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

export async function resolveDate(searchParams: DateSearchParams): Promise<string> {
  const params = await searchParams;
  const date = params?.date;
  if (typeof date === "string" && DATE_RE.test(date)) return date;
  return getTodayInIST();
}
