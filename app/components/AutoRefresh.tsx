'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AutoRefreshProps {
  interval: number;
}

export default function AutoRefresh({ interval }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, interval);

    return () => {
      clearInterval(timer);
    };
  }, [interval, router]);

  return (
    <button
      onClick={() => router.refresh()}
      className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded"
    >
      Refresh
    </button>
  );
}
