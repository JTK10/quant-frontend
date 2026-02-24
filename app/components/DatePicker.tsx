'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays } from 'lucide-react';

export default function DatePicker() {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams= useSearchParams();
  const currentDate = searchParams.get('date') ?? new Date().toISOString().split('T')[0];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', e.target.value);
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  };

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border font-mono text-xs"
      style={{
        background: 'var(--color-brand-surface)',
        borderColor: 'var(--color-brand-border)',
        color: 'var(--color-brand-muted)',
      }}
    >
      <CalendarDays size={12} />
      <input
        type="date"
        value={currentDate}
        onChange={handleChange}
        className="bg-transparent focus:outline-none cursor-pointer tracking-wider"
        style={{ color: 'var(--color-brand-text)' }}
      />
    </div>
  );
}
