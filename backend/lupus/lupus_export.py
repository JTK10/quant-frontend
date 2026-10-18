"""Optional local-only Rusty adapter; never changes the published Rusty document."""
import json,os
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
def export(doc,opp_rows,directory='/home/ubuntu/lupus/input'):
    root=Path(directory);root.mkdir(parents=True,exist_ok=True)
    payload=dict(rusty=doc,pdh={r[0]:r[13] for r in opp_rows if len(r)>13},opening_ce={r[0]:r[3] for r in opp_rows if len(r)>3} if doc['cut']=='09:15' else {})
    data=json.dumps(payload,separators=(',',':'),allow_nan=False)
    if len(data)>500_000:raise ValueError('Lupus adapter budget exceeded')
    path=root/(doc['sig_date']+'-'+doc['cut'].replace(':','')+'.json')
    tmp=path.with_suffix('.tmp');tmp.write_text(data,encoding='utf-8');os.replace(tmp,path)

def export_close(results,directory='/home/ubuntu/lupus'):
    """Reuse Ocelot's already-fetched EOD candle responses before OB truncation."""
    now=datetime.now(ZoneInfo('Asia/Kolkata'))
    if now.strftime('%H:%M')<'15:35':return
    day=now.date().isoformat();bars={}
    for symbol,candles in results:
        rows={}
        for b in candles:
            if str(b[0])[:10]==day and '09:15'<=str(b[0])[11:16]<='15:25':
                rows[str(b[0])[11:16]]=[str(b[0])[11:16]]+[float(x) for x in b[1:5]]
        if rows:bars[symbol]=sorted(rows.values())
    data=json.dumps(dict(date=day,bars=bars,exported_at=now.timestamp()),separators=(',',':'),allow_nan=False)
    if len(data)>2_000_000:raise ValueError('EOD export exceeds budget')
    path=Path(directory)/('close-'+day+'.json');tmp=path.with_suffix('.tmp')
    tmp.write_text(data,encoding='utf-8');os.replace(tmp,path)
