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
      /* Resolved: Kept the shadow-sm and translucent white background for the glassmorphism look */
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 shadow-sm"
      style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.9)" }}
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
          /* Resolved: Kept the light blue tinted background for the input field */
          background: "#f8fbff",
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
      /* Resolved: Kept the hover translate animation and 10px font size */
      className="rounded-xl border px-3 py-2 font-mono text-[10px] tracking-[0.15em] transition-all hover:-translate-y-px"
      style={{
        color: enabled ? "var(--color-accent)" : "var(--color-muted)",
        borderColor: enabled ? "rgba(37, 99, 235, 0.35)" : "var(--color-border)",
        /* Resolved: Kept the advanced gradients and dynamic shadows based on state */
        background: enabled
          ? "linear-gradient(180deg, rgba(54,91,216,0.16) 0%, rgba(54,91,216,0.1) 100%)"
          : "rgba(255,255,255,0.88)",
        boxShadow: enabled 
          ? "0 10px 20px -16px rgba(54, 91, 216, 0.7)" 
          : "0 8px 16px -16px rgba(21,37,72,0.5)",
      }}
    >
      {enabled ? `AUTO ${Math.round(interval / 1000)}S` : "AUTO OFF"}
    </button>
  );
}