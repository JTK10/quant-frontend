import {NextRequest,NextResponse} from 'next/server';
import {requireApiSession} from '@/utils/auth';

export const dynamic='force-dynamic';

// Korat is retired. Existing tabs must not read its old ORDS feed or archives.
export async function GET(request:NextRequest){
  const denied=await requireApiSession(request);if(denied)return denied;
  return NextResponse.json({error:'Korat has been retired. Open Sol.',replacement:'/sol'},
    {status:410,headers:{'Cache-Control':'private, no-store'}});
}
