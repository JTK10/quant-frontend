'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

export default function DatePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(
    searchParams.get('date') || today
  );

  // Sync state when URL changes
  useEffect(() => {
    const urlDate = searchParams.get('date') || today;
    setDate(urlDate);
  }, [searchParams, today]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setDate(newDate); // update input immediately

    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);

    router.push(`${pathname}?${params.toString()}`);
    router.refresh(); // force server reload
  };

  return (
    <div className="flex items-center gap-3 bg-brand-surface border border-brand-border px-4 py-2 rounded-lg">
      <Calendar size={18} className="text-brand-muted" />
      <input
        type="date"
        value={date}
        onChange={handleDateChange}
        className="bg-transparent text-white font-mono text-sm focus:outline-none cursor-pointer"
      />
    </div>
  );
}