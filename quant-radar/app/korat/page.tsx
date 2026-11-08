import {redirect} from 'next/navigation';
export default async function RetiredKoratPage({searchParams}:{searchParams:Promise<{date?:string}>}) {
  const {date}=await searchParams;
  redirect('/sol'+(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?'?date='+encodeURIComponent(date):''));
}
