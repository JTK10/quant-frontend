'use client';

import { useEffect, useMemo, useState } from 'react';

function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function getTicker(item) {
  return item?.ticker || item?.symbol || item?.sector || item?.name || '-';
}

function getScore(item) {
  const value = Number(item?.sentiment ?? item?.score ?? item?.strength ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export default function SectorSentiment() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError('');

      const baseUrl = process.env.NEXT_PUBLIC_API_URL;
      const secret = process.env.NEXT_PUBLIC_RADAR_SECRET;

      if (!baseUrl || !secret) {
        setError('Missing NEXT_PUBLIC_API_URL or NEXT_PUBLIC_RADAR_SECRET.');
        setLoading(false);
        return;
      }

      try {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const response = await fetch(`${cleanBase}/sector-sentiment`, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-radar-secret': secret,
          },
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = await response.json();
        setRows(toArray(payload));
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Unable to load sector sentiment.');
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, []);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => getScore(b) - getScore(a));
  }, [rows]);

  return (
    <section className="rounded-2xl border p-4" style={{ borderColor: 'var(--color-brand-border)', background: 'var(--color-brand-surface)' }}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-brand-text)' }}>Sector Sentiment</h2>
        <span className="font-mono text-[11px]" style={{ color: 'var(--color-brand-muted)' }}>
          {loading ? 'Loading…' : `${sorted.length} sectors`}
        </span>
      </div>

      {error ? (
        <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'rgba(230,85,115,0.4)', color: 'var(--color-brand-bear)' }}>
          {error}
        </div>
      ) : null}

      {!error && !loading && sorted.length === 0 ? (
        <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--color-brand-border)', color: 'var(--color-brand-muted)' }}>
          No sector sentiment data returned.
        </div>
      ) : null}

      <div className="space-y-2">
        {sorted.map((item, index) => {
          const score = getScore(item);
          const positive = score >= 0;
          return (
            <div
              key={`${getTicker(item)}-${index}`}
              className="flex items-center justify-between rounded-xl border px-3 py-2"
              style={{
                borderColor: positive ? 'rgba(5,217,143,0.25)' : 'rgba(230,85,115,0.25)',
                background: positive ? 'rgba(5,217,143,0.08)' : 'rgba(230,85,115,0.08)',
              }}
            >
              <span className="font-medium" style={{ color: 'var(--color-brand-text)' }}>{getTicker(item)}</span>
              <span className="font-mono text-sm" style={{ color: positive ? 'var(--color-brand-bull)' : 'var(--color-brand-bear)' }}>
                {score > 0 ? '+' : ''}{score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
