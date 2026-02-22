'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

export default function DatePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Default to today if no date in URL
  const currentDate = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
    currentParams.set('date', newDate);
    // Push the new URL, triggering a server-side re-render
    router.push(`?${currentParams.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 bg-brand-surface border border-brand-border px-4 py-2 rounded-lg">
      <Calendar size={18} className="text-brand-muted" />
      <input 
        type="date" 
        value={currentDate}
        onChange={handleDateChange}
        className="bg-transparent text-white font-mono text-sm focus:outline-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
      />
    </div>
  );
}
