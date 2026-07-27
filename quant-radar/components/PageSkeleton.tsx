// Instant navigation skeleton. Next.js App Router renders the route's
// loading.tsx immediately on navigation (via an automatic Suspense boundary)
// while the async server component blocks on the ORDS fetch -- so the page
// never freezes on a blank screen during a cold-instance 5-15s fetch. Pure
// presentational, no data, so it paints in one frame.
export default function PageSkeleton({ accent = "#f59e0b", title = "" }: { accent?: string; title?: string }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0A0A0B] text-white">
      {/* header bar */}
      <div className="flex items-center gap-4 border-b border-[#ffffff10] px-4 py-4 md:px-6 shrink-0">
        <div className="h-5 w-28 rounded animate-pulse" style={{ background: `${accent}33` }} />
        <div className="h-3 w-40 rounded bg-[#ffffff12] animate-pulse" />
        <div className="ml-auto h-6 w-24 rounded bg-[#ffffff0c] animate-pulse" />
      </div>
      {/* info strip */}
      <div className="flex items-center gap-3 border-b border-[#ffffff10] px-4 py-3 md:px-6 shrink-0">
        <div className="h-4 w-32 rounded animate-pulse" style={{ background: `${accent}22` }} />
        <div className="h-4 w-20 rounded bg-[#ffffff0c] animate-pulse" />
        <div className="ml-auto h-4 w-16 rounded bg-[#ffffff0c] animate-pulse" />
      </div>
      {/* shimmer rows */}
      <div className="flex-1 overflow-hidden p-4 md:px-6">
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-md bg-[#ffffff08] animate-pulse"
              style={{ animationDelay: `${i * 60}ms`, opacity: 1 - i * 0.05 }}
            />
          ))}
        </div>
      </div>
      {title && <span className="sr-only">Loading {title}</span>}
    </div>
  );
}
