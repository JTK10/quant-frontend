import {NextRequest, NextResponse} from 'next/server';
import {Readable} from 'node:stream';
import chain from 'stream-chain';
import {parser} from 'stream-json/parser.js';
import {pick} from 'stream-json/filters/pick.js';
import {streamValues} from 'stream-json/streamers/stream-values.js';
import {requireApiSession} from '@/utils/auth';
import {getTodayIstDate} from '@/utils/backend';
import {foldIrbis, type IrbisDocument} from '@/utils/irbis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

let authCache: {token: string; until: number} | undefined;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {'Cache-Control': 'private, no-store'}});

async function token(id: string, secret: string, url: string) {
  if (authCache && authCache.until > Date.now()) return authCache.token;
  const response = await fetch(url, {method: 'POST', headers: {
    Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded'}, body: 'grant_type=client_credentials',
    cache: 'no-store', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Irbis authorization unavailable');
  const data = await response.json();
  if (typeof data.access_token !== 'string') throw new Error('Invalid Irbis authorization');
  authCache = {token: data.access_token, until: Date.now() + Math.max(30, Number(data.expires_in ?? 300) - 60) * 1000};
  return authCache.token;
}

async function readPage(response: Response, date: string, budget: {bytes: number; docs: number}) {
  if (!response.body) throw new Error('Empty Irbis feed');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  async function* chunks() {
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        budget.bytes += value.byteLength;
        if (budget.bytes > 64 * 1024 * 1024) throw new Error('Irbis feed size exceeded');
        yield decoder.decode(value, {stream: true});
      }
      yield decoder.decode();
    } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
  }
  const documents: IrbisDocument[] = [];
  let next: string | undefined, hasMore = false, sawItems = false;
  const pipeline = chain([Readable.from(chunks()), parser({streamValues: false}),
    pick({filter: /^items\.\d+$|^(hasMore|links)$/}), streamValues()]);
  try {
    for await (const item of pipeline) {
      const value: unknown = item.value;
      if (typeof value === 'boolean') {hasMore = value; continue;}
      if (Array.isArray(value)) {
        const link = value.find(v => v?.rel === 'next');
        if (link?.href) next = String(link.href);
        continue;
      }
      sawItems = true;
      if (!value || typeof value !== 'object') continue;
      if (++budget.docs > 10000) throw new Error('Irbis feed document limit exceeded');
      const row = value as {doc?: unknown};
      let doc: IrbisDocument;
      try {doc = (typeof row.doc === 'string' ? JSON.parse(row.doc) : row.doc ?? row) as IrbisDocument;}
      catch {continue;}
      if (doc?.source === 'irbis' && String(doc.sig_date) === date.replaceAll('-', '')) documents.push(doc);
    }
    if (!sawItems && !hasMore) return {documents, next};
    if (hasMore && !next) throw new Error('Incomplete Irbis feed');
    return {documents, next};
  } finally {pipeline.destroy(); await reader.cancel().catch(() => {});}
}

export async function GET(request: NextRequest) {
  const denied = await requireApiSession(request); if (denied) return denied;
  const date = request.nextUrl.searchParams.get('date') ?? getTodayIstDate();
  const asof = request.nextUrl.searchParams.get('asof');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date ||
    (asof && !/^([01]\d|2[0-3]):[0-5]\d$/.test(asof))) return json({error: 'Invalid session or time'}, 400);
  const limit = Math.min(asof ? Date.parse(`${date}T${asof}:00+05:30`) : Date.now(), Date.now());
  try {
    const {PANTHER_CLIENT_ID: id, PANTHER_CLIENT_SECRET: secret,
      PANTHER_TOKEN_URL: authUrl, PANTHER_SIGNALS_URL: feedUrl} = process.env;
    if (!id || !secret || !authUrl || !feedUrl) throw new Error('Irbis feed configuration unavailable');
    const accessToken = await token(id, secret, authUrl);
    const docs: IrbisDocument[] = [], budget = {bytes: 0, docs: 0}, deadline = AbortSignal.timeout(40000);
    let url: URL | undefined = new URL(feedUrl);
    const base = new URL(feedUrl), seen = new Set<string>();
    url.searchParams.set('src', 'irbis');
    url.searchParams.set('sig_date', date.replaceAll('-', ''));
    for (let page = 0; url && page < 6; page++) {
      if (seen.has(url.href)) throw new Error('Repeated Irbis feed page');
      seen.add(url.href);
      const response = await fetch(url, {headers: {Authorization: `Bearer ${accessToken}`},
        cache: 'no-store', signal: deadline});
      if (response.status === 401) authCache = undefined;
      if (!response.ok) throw new Error('Irbis feed unavailable');
      const result = await readPage(response, date, budget);
      docs.push(...result.documents);
      if (!result.next) {url = undefined; break;}
      const candidate = new URL(result.next, base);
      if (candidate.origin !== base.origin || candidate.pathname !== base.pathname) throw new Error('Invalid Irbis feed page');
      url = candidate;
    }
    if (url) throw new Error('Incomplete Irbis feed pages');
    return json(foldIrbis(docs, date, limit));
  } catch {return json({error: 'Irbis data unavailable; current rankings cannot be confirmed'}, 503);}
}
