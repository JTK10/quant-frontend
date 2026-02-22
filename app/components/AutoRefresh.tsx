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

  return null;
}
