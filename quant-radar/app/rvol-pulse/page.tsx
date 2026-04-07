import PageHeader from "@/components/PageHeader";
import RvolPulseClient from "@/components/RvolPulseClient";

export const metadata = {
  title: "RVOL Pulse | JT Radar",
};

export default function RvolPulsePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      <div className="flex-none px-4 pt-6 md:px-6">
        <PageHeader 
          title="RVOL PULSE" 
          subtitle="Momentum Movers" 
          badge="LIVE"
          dateStr={new Date().toLocaleDateString("en-IN")}
          accentColor="#14b8a6"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 min-h-0">
        <div className="mx-auto max-w-7xl h-full pb-8">
          <RvolPulseClient />
        </div>
      </div>
    </div>
  );
}
