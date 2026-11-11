import {NextRequest, NextResponse} from 'next/server';
import {requireApiSession} from '@/utils/auth';
import {getSharedOrdsToken, invalidateSharedOrdsToken} from '@/utils/aurumFeed';
import {resultCache} from '@/utils/resultCache';
import {istSessionDate} from '@/utils/sessionPolling';
import {
  ACTIVE_STATES, EVENT_STATES, validCut, validDate, VIPER_MAX_CUTS,
  VIPER_MAX_ORIGIN_BYTES, VIPER_MAX_ROWS_PER_CUT, type ViperBoard, type ViperRow,
} from '@/app/viper/model';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const readCache = resultCache<ViperBoard>({maxEntries: 8, maxBytes: 4 * 1024 * 1024});
const allowedStates = new Set([...ACTIVE_STATES, ...EVENT_STATES]);
const headers = (cache = 'private, no-store') => ({'Cache-Control': cache});
const error = (message: string, status: number) => NextResponse.json({error: message}, {status, headers: headers()});

function finiteOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid Viper numeric field');
  return value;
}

function projectRows(raw: unknown, date: string, cut: string): ViperRow[] {
  if (!Array.isArray(raw) || raw.length > VIPER_MAX_ROWS_PER_CUT) throw Error('Invalid Viper rows');
  const contracts = new Set<string>();
  return raw.map(row => {
    if (!row || typeof row.symbol !== 'string' || !/^[A-Z0-9 &_.-]{1,40}$/.test(row.symbol) ||
        !allowedStates.has(row.state) || row.cut !== cut || typeof row.strike !== 'number' ||
        !Number.isFinite(row.strike) || row.strike <= 0 || typeof row.expiry !== 'string' ||
        !validDate(row.expiry) || row.expiry < date) throw Error('Invalid Viper contract');
    const key = JSON.stringify([row.symbol, row.strike, row.expiry]);
    if (contracts.has(key)) throw Error('Duplicate Viper contract');
    contracts.add(key);
    return {
      symbol: row.symbol, state: row.state, cut, strike: row.strike, expiry: row.expiry,
      spot: finiteOrNull(row.spot), premium: finiteOrNull(row.premium), breakeven: finiteOrNull(row.breakeven),
      distance: finiteOrNull(row.distance), unwind: finiteOrNull(row.unwind), baseline_build: finiteOrNull(row.baseline_build),
    };
  });
}

async function loadBoard(date: string): Promise<ViperBoard> {
  const endpoint = process.env.PANTHER_SIGNALS_URL;
  if (!endpoint) throw Error('Viper feed configuration unavailable');
  const day = date.replaceAll('-', '');
  const url = new URL(endpoint);
  url.searchParams.set('src', 'viper');
  url.searchParams.set('sig_date', day);
  url.searchParams.set('limit', '100');
  const token = await getSharedOrdsToken();
  const response = await fetch(url, {
    headers: {Authorization: 'Bearer ' + token}, cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (response.status === 401) invalidateSharedOrdsToken();
  if (!response.ok || !response.body) throw Error('Viper feed unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 3 * 1024 * 1024) throw Error('Viper feed exceeded size budget');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(body.items) || body.items.length > VIPER_MAX_CUTS || body.hasMore ||
      body.links?.some((link: {rel?: string}) => link.rel === 'next')) throw Error('Incomplete or oversized Viper feed');
  let baseline: string | null = null;
  const cuts: ViperBoard['cuts'] = [];
  const seen = new Set<string>();
  const now = Date.now();
  for (const row of body.items) {
    const doc = typeof row?.doc === 'string' ? JSON.parse(row.doc) : row?.doc ?? row;
    if (!doc || doc.source !== 'viper' || String(doc.sig_date) !== day || doc.date !== date) continue;
    if (doc.kind !== 'SNAPSHOT' || typeof doc.cut !== 'string' || !validCut(doc.cut) ||
        typeof doc.baseline !== 'string' || !validDate(doc.baseline) || doc.baseline >= date) throw Error('Invalid Viper snapshot');
    if (doc.engine !== 'viper-v1' || doc.Doc_ID !== 'viper|viper-v1|' + day + '|' + doc.cut.replace(':', '') ||
        typeof doc.ts !== 'number' || !Number.isFinite(doc.ts) || doc.ts * 1000 > now + 2000 ||
        Date.parse(date + 'T' + doc.cut + ':00+05:30') > Math.min(now, doc.ts * 1000)) throw Error('Invalid Viper publication boundary');
    if ((baseline && baseline !== doc.baseline) || seen.has(doc.cut)) throw Error('Conflicting Viper snapshot');
    baseline = doc.baseline;
    seen.add(doc.cut);
    cuts.push({cut: doc.cut, recovered: doc.recovered === true, limited: doc.limited === true, bull: projectRows(doc.bull, date, doc.cut), bear: projectRows(doc.bear, date, doc.cut)});
  }
  cuts.sort((a, b) => a.cut.localeCompare(b.cut));
  return {source: 'viper', date, baseline, cuts, lastCut: cuts.at(-1)?.cut ?? null};
}

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request);
  if (denied) return denied;
  const today = istSessionDate();
  const date = request.nextUrl.searchParams.get('date') ?? today;
  const known = request.nextUrl.searchParams.get('known')?.split(',') ?? [];
  if (!validDate(date) || date > today || known.length > VIPER_MAX_CUTS || known.some(cut => !validCut(cut))) {
    return error('Invalid Viper session or cuts', 400);
  }
  try {
    const history = date !== today;
    const board = await readCache(date, history ? 300000 : 60000, () => loadBoard(date));
    const existing = new Set(known);
    const response = JSON.stringify({...board, cuts: board.cuts.filter(item => !existing.has(item.cut))});
    if (Buffer.byteLength(response) > VIPER_MAX_ORIGIN_BYTES) throw Error('Viper response exceeded size budget');
    return new NextResponse(response, {headers: {
      ...headers(board.lastCut
        ? history ? 'private, max-age=3600, stale-while-revalidate=86400' : 'private, max-age=60'
        : 'private, no-store'),
      'Content-Type': 'application/json',
    }});
  } catch {
    return error('Viper feed unavailable', 503);
  }
}
