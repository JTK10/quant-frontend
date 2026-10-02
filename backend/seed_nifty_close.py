"""Seed only a verified historical Nifty closing fixture; no fake current date."""
import argparse
import json
from datetime import datetime
from pathlib import Path
from nifty_oi_close import IST, make_doc, publish

parser=argparse.ArgumentParser()
parser.add_argument('--input',required=True)
parser.add_argument('--config',default='/home/ubuntu/ocelot/ords.json')
args=parser.parse_args()
data=json.loads(Path(args.input).read_text())
snap=data['intraday'][-1]
assert snap['date'] < datetime.now(IST).date().isoformat()
assert snap['cut']=='15:30' and not snap['degraded']
assert snap['expiry']>snap['date']
levels=[['NIFTY 50',snap['spot'],snap['expiry'],snap['support'],snap['resistance']]]
doc=make_doc(snap['date'],snap['cut'],levels,'verified downloaded historical closing candles')
print(json.dumps({'date':snap['date'],'status':publish(doc,args.config),'expiry':snap['expiry']}))
