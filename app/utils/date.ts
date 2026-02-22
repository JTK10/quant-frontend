export type DateSearchParams = { date?: string } | Promise<{ date?: string }>;

export async function resolveDate(searchParams: DateSearchParams): Promise<string> {
  const params = await searchParams;
  return params.date || new Date().toISOString().split("T")[0];
}
