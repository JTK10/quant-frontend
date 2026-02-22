'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';

export default function DatePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentDate =
    searchParams.get('date') ||
    new Date().toISOString().split('T')[0];

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;

    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);

    const newUrl = `${pathname}?${params.toString()}`;

    router.push(newUrl);
    
    // 🔥 THIS IS THE IMPORTANT PART
    router.refresh(); 
  };

  return (
    <div className="flex items-center gap-3 bg-brand-surface border border-brand-border px-4 py-2 rounded-lg">
      <Calendar size={18} className="text-brand-muted" />
      <input
        type="date"
        value={currentDate}
        onChange={handleDateChange}
        className="bg-transparent text-white font-mono text-sm focus:outline-none focus:ring-0 cursor-pointer"
      />
    </div>
  );
}