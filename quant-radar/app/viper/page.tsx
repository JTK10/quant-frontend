import ViperClient from './ViperClient';
import {validDate} from './model';

export default async function ViperPage({searchParams}: {searchParams: Promise<{date?: string}>}) {
  const {date} = await searchParams;
  return <ViperClient initialDate={typeof date === 'string' && validDate(date) ? date : undefined} />;
}
