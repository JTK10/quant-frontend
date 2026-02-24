'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export default function AutoRefresh({ interval }: { interval: number }) {
  const router = useRouter();
  const [spinning, setSpinning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('');

  const refresh = () => {
    setSpinning(true);
    router.refresh();
    const now = new Date();
    setLastRefresh(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`);
    setTimeout(() => setSpinning(false), 600);
  };

  useEffect(() => {
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  return (
    <button
      onClick={refresh}
      title="Refresh data"
      className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs tracking-wider border transition-all duration-150"
      style={{
        background: 'var(--color-brand-surface)',
        borderColor: 'var(--color-brand-border)',
        color: spinning ? 'var(--color-brand-accent)' : 'var(--color-brand-muted)',
      }}
    >
      <RefreshCw
        size={12}
        style={{
          transition: 'transform 0.6s ease',
          transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
        }}
      />
      {lastRefresh ? lastRefresh : 'REFRESH'}
    </button>
  );
}
