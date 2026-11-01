import AurumClient from './AurumClient';

export default async function AurumPage({searchParams}: {searchParams: Promise<{date?: string}>}) {
  const {date} = await searchParams;
  const initialDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : undefined;
  return <AurumClient initialDate={initialDate}/>;
}
