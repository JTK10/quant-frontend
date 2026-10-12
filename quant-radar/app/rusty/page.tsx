import RustyFeed from "./RustyFeed";
import { resolveDate, type DateSearchParams } from "@/utils/date";

export const dynamic = "force-dynamic";

export default async function RustyPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);
  const params=await searchParams;
  return <RustyFeed key={dateStr} dateStr={dateStr} followToday={!params?.date}/>;
}
