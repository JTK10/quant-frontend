import PageHeader from "@/components/PageHeader";
import { DatePicker } from "@/components/Controls";
import RvolPulseClient from "@/components/RvolPulseClient";
import { resolveDate, type DateSearchParams } from "@/utils/date";

export const dynamic = "force-dynamic";

export default async function RvolPulsePage({ searchParams }: { searchParams: DateSearchParams }) {
  const dateStr = await resolveDate(searchParams);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <div className="flex-none">
        <PageHeader 
          title="RVOL PULSE" 
          subtitle="Cumulative RMS Leaderboard" 
          badge="LIVE"
          dateStr={dateStr}
          accentColor="#14b8a6"
        >
          <DatePicker />
        </PageHeader>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
        <div className="mx-auto max-w-7xl h-full pb-8">
          <RvolPulseClient dateStr={dateStr} />
        </div>
      </div>
    </div>
  );
}
