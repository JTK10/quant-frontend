import { getTodayIstDate } from "@/utils/backend";

type SearchParamValue = string | string[] | undefined;
type SearchParamShape = Record<string, SearchParamValue>;

export type DateSearchParams = Promise<SearchParamShape> | SearchParamShape | undefined;

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function resolveDate(searchParams: DateSearchParams): Promise<string> {
  const params = searchParams ? await searchParams : {};
  const dateValue = params?.date;
  const candidate = Array.isArray(dateValue) ? dateValue[0] : dateValue;

  return candidate && isIsoDate(candidate) ? candidate : getTodayIstDate();
}

