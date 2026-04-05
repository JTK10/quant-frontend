import PageHeader from "@/components/PageHeader";
import { AutoRefresh, DatePicker } from "@/components/Controls";
import SectorSentiment from "@/components/SectorSentiment";
import { resolveDate, type DateSearchParams } from "@/utils/date";

export const dynamic = "force-dynamic";

export default async function SectorPage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader
        title="Sector Rotation"
        subtitle="BULL · BEAR STRENGTH BY SECTOR"
        badge="LIVE SCAN"
        dateStr={dateStr}
        accentColor="var(--color-gold)"
      >
        <DatePicker />
        <AutoRefresh interval={60000} />
      </PageHeader>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-5">
        <SectorSentiment />
      </div>
    </div>
  );
}
