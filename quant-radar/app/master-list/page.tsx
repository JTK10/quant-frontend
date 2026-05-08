import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import MasterListClient from "@/components/MasterListClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";

export const dynamic = "force-dynamic";

export default async function MasterListPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Master List"
        subtitle="TOP 2 SECTOR PICKS COMBINED"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="#eab308"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
        <MasterListClient dateStr={dateStr} />
      </div>
    </div>
  );
}
