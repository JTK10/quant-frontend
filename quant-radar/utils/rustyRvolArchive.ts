import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import manifest from '@/data/sol-rvol/manifest.json';
import {resultCache} from './resultCache';
import type {RustyRvolPoints} from './rustyHistory';

const archives=resultCache<RustyRvolPoints>({maxEntries:2,maxBytes:4*1024*1024});

// Local packaged values only: no broker/database reads or RVOL calculation.
export async function readRustyRvolArchive(date:string):Promise<RustyRvolPoints|undefined>{
  if(!/^\d{8}$/.test(date))return;
  const iso=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
  if(!manifest.sessions.some(item=>item.date===iso))return;
  return archives(iso,3600000,async()=>{
    const compressed=await readFile(path.join(process.cwd(),'data','sol-rvol',`${iso}.json.gz`));
    if(compressed.byteLength>512*1024)throw Error('Historical RVOL archive exceeds bound');
    const data=JSON.parse(gunzipSync(compressed,{maxOutputLength:2*1024*1024}).toString('utf8'));
    if(data.version!==1||data.date!==iso||!data.points||Object.keys(data.points).length>75)
      throw Error('Historical RVOL archive schema mismatch');
    for(const [hm,rows]of Object.entries(data.points)){
      if(!/^\d{2}:\d{2}$/.test(hm)||hm<'09:15'||hm>'15:25'||!rows||typeof rows!=='object'||Object.keys(rows).length>512)
        throw Error('Historical RVOL slot schema mismatch');
      for(const point of Object.values(rows)){
        if(!Array.isArray(point)||point.length!==3||!Number.isFinite(point[0])||point[0]<0||
          !Number.isInteger(point[1])||point[1]<1||point[1]>20||!(point[2]===null||typeof point[2]==='boolean'))
          throw Error('Historical RVOL value schema mismatch');
      }
    }
    return data.points as RustyRvolPoints;
  });
}
