"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function getTodayIstDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function DatePicker() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDate = searchParams.get("date") ?? getTodayIstDate();

  return (
    <label
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm"
      style={{ borderColor: "var(--color-border)", background: "rgba(30,30,30,0.94)" }}
    >
      <span className="font-mono text-[9px] tracking-[0.15em]" style={{ color: "var(--color-muted)" }}>
        DATE
      </span>
      <input
        type="date"
        value={currentDate}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) {
            params.set("date", event.target.value);
          } else {
            params.delete("date");
          }

          const target = params.toString() ? `${pathname}?${params.toString()}` : pathname;
          router.push(target);
        }}
        className="rounded-md border px-2 py-1 font-mono text-xs outline-none"
        style={{
          color: "var(--color-text2)",
          borderColor: "var(--color-border2)",
          background: "var(--color-surface2)",
        }}
      />
    </label>
  );
}

export function AutoRefresh({ interval = 30000 }: { interval?: number }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);

  const refreshPage = useEffectEvent(() => {
    if (enabled) {
      router.refresh();
    }
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timerId = window.setInterval(() => {
      refreshPage();
    }, interval);

    return () => window.clearInterval(timerId);
  }, [enabled, interval, refreshPage]);

  return (
    <button
      type="button"
      onClick={() => setEnabled((current) => !current)}
      className="rounded-xl border px-3 py-2 font-mono text-[10px] tracking-[0.15em] transition-all hover:-translate-y-px"
      style={{
        color: enabled ? "var(--color-accent)" : "var(--color-muted)",
        borderColor: enabled ? "var(--color-bullborder)" : "var(--color-border)",
        background: enabled
          ? "linear-gradient(180deg, rgba(255,159,28,0.2) 0%, rgba(217,119,6,0.16) 100%)"
          : "rgba(30,30,30,0.9)",
        boxShadow: enabled ? "0 10px 20px -16px rgba(255,159,28,0.6)" : "0 8px 16px -16px rgba(0,0,0,0.8)",
      }}
    >
      {enabled ? `AUTO ${Math.round(interval / 1000)}S` : "AUTO OFF"}
    </button>
  );
}