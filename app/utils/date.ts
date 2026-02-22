export type DateSearchParams = {
  date?: string;
};

export function resolveDate(searchParams: DateSearchParams): string {
  return searchParams?.date ?? new Date().toISOString().split("T")[0];
}