import type {Metadata} from 'next';
import OspreyClient from './OspreyClient';
import {istSessionDate} from '@/utils/sessionPolling';
import {validDate} from './model';
import './osprey.css';

export const metadata: Metadata = {title:'Osprey | Quant Radar'};
export const dynamic = 'force-dynamic';

export default async function OspreyPage({searchParams}: {searchParams:Promise<{date?:string|string[]}>}) {
  const {date} = await searchParams;
  const initialDate = typeof date === 'string' && validDate(date) && date <= istSessionDate() ? date : undefined;
  return <OspreyClient initialDate={initialDate} />;
}
