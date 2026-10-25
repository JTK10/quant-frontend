import {resolveDate,type DateSearchParams} from '@/utils/date';
import SectorWorkspace from './SectorWorkspace';
export const dynamic='force-dynamic';
export default async function SectorPage({searchParams}:{searchParams:DateSearchParams}){
 return <SectorWorkspace date={await resolveDate(searchParams)}/>;
}
