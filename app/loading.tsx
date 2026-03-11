export default function AppLoading() {
  return (
    <div className="max-w-7xl mx-auto w-full animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div className="space-y-3">
          <div className="h-7 w-48 rounded" style={{ background: "rgba(79,142,247,0.2)" }} />
          <div className="h-4 w-72 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-40 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="h-10 w-28 rounded-lg" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border h-24"
            style={{ background: "rgba(255,255,255,0.05)", borderColor: "var(--color-brand-border)" }}
          />
        ))}
      </div>

      <div
        className="rounded-xl border h-[420px]"
        style={{ background: "rgba(255,255,255,0.04)", borderColor: "var(--color-brand-border)" }}
      />
    </div>
  );
}
