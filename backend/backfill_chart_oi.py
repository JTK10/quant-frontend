"""Publish only compact chart_oi snapshots from a verified export.

Uses the existing VM2 ORDS configuration. Never edits scanner documents.
"""
import argparse
import asyncio
import base64
import gzip
import json
import time
from pathlib import Path
import httpx


async def main(path, config, closing_only=False):
    with gzip.open(path, 'rt') as f:
        docs = json.load(f)
    if closing_only:
        latest = {}
        for doc in docs:
            if doc.get('source') != 'chart_oi' or doc['cut'] > '15:25':
                continue
            prior = latest.get(doc['date'])
            if not prior or (doc['cut'], doc.get('ts', 0)) > (prior['cut'], prior.get('ts', 0)):
                latest[doc['date']] = doc
        docs = [{**d, 'source':'chart_oi_close', 'cap':'CHART_OI_CLOSE'} for _, d in sorted(latest.items())]
    cfg = json.loads(Path(config).read_text())
    async with httpx.AsyncClient(timeout=20) as client:
        basic = base64.b64encode(f"{cfg['client_id']}:{cfg['client_secret']}".encode()).decode()
        auth = await client.post(cfg['base'] + '/oauth/token', data={'grant_type':'client_credentials'}, headers={'Authorization':'Basic ' + basic})
        auth.raise_for_status()
        token = auth.json()['access_token']
        count = 0
        for doc in docs:
            if doc.get('source') not in ('chart_oi', 'chart_oi_close'):
                raise ValueError('Refusing a non-chart document')
            doc.update(ts=time.time(), time=doc['cut'] + ':00', name='', side='NEUTRAL', cap='CHART_OI_CLOSE' if closing_only else 'CHART_OI', replay=True)
            # Bounded retry for transient transport/server failures. New docs
            # deduplicate by source/cut and latest publication timestamp.
            for attempt in range(3):
                try:
                    response = await client.post(cfg['base'] + cfg['path'], content=json.dumps(doc, allow_nan=False), headers={'Authorization':'Bearer ' + token,'Content-Type':'application/json'})
                    response.raise_for_status()
                    break
                except (httpx.TransportError, httpx.HTTPStatusError):
                    if attempt == 2: raise
                    await asyncio.sleep(1)
            count += 1
            if count % 25 == 0:
                print(f'chart_oi published {count}/{len(docs)}', flush=True)
        print(json.dumps({'published':count, 'dates':sorted({d['date'] for d in docs})}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--config', default='/home/ubuntu/ocelot/ords.json')
    parser.add_argument('--closing-only', action='store_true')
    args = parser.parse_args()
    asyncio.run(main(args.input, args.config, args.closing_only))
