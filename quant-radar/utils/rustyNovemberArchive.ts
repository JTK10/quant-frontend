import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import manifest from '@/data/rusty-november/manifest.json';
import {resultCache} from './resultCache';

const archives=resultCache<Record<string,unknown>[]>({maxEntries:2,maxBytes:12*1024*1024});

// Local packaged November Rusty snapshots: no broker/database reads or ORDS queries.
export async function readRustyNovemberArchive(date:string):Promise<Record<string,unknown>[]|undefined>{
  if(!/^\d{8}$/.test(date))return;
  const iso=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  if(!manifest.sessions.some(item=>item.date===iso))return;
  return archives(iso,3600000,async()=>{
    const compressed=await readFile(path.join(process.cwd(),'data','rusty-november',`${iso}.json.gz`));
    if(compressed.byteLength>3*1024*1024)throw Error('Historical November Rusty archive exceeds bound');
    const data=JSON.parse(gunzipSync(compressed,{maxOutputLength:16*1024*1024}).toString('utf8'));
    if(data.version!==1||data.date!==iso||!Array.isArray(data.snapshots)||data.snapshots.length>80)
      throw Error('Historical November Rusty archive schema mismatch');
    return data.snapshots as Record<string,unknown>[];
  });
}
