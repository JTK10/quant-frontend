"""Bounded representative replay in a temporary directory; never publishes."""
import argparse
import json
import shutil
import tempfile
import time
from pathlib import Path
from aurum_live import Worker, read, epoch


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--history',type=Path,required=True)
    p.add_argument('--input',type=Path,required=True)
    p.add_argument('--nifty',type=Path,required=True)
    p.add_argument('--date',default='2026-10-30')
    args=p.parse_args()
    nifty=read(args.nifty,512_000)
    started=time.perf_counter()
    cuts=0;bytes_read=0
    with tempfile.TemporaryDirectory(prefix='aurum-probe-') as directory:
        target=Path(directory)
        shutil.copyfile(args.history,target/'history.json')
        worker=Worker(target,startup=epoch(args.date,'09:15'))
        worker.start(args.date)
        for path in sorted(args.input.glob(args.date.replace('-','')+'-????.json')):
            hm=path.stem[-4:-2]+':'+path.stem[-2:]
            if not '09:20'<=hm<='11:30':continue
            payload=read(path)
            bytes_read+=path.stat().st_size
            aux=dict(date=args.date,cut=hm,nifty=nifty.get(args.date,{}).get(hm),rusty={})
            try:worker.ingest(payload,aux,max(payload['exported_at'],epoch(args.date,hm)+1))
            except ValueError as exc:worker.error=str(exc)
            cuts+=1
        worker.output(epoch(args.date,'11:31'))
        result=dict(date=args.date,cuts=cuts,bytes_read=bytes_read,signals=len(worker.state['signals']),
                    evaluated_cuts=len(worker.state['evaluated']),coverage=worker.state['coverage'],
                    snapshot_bytes=(target/'snapshots'/f'{args.date}.json').stat().st_size,
                    elapsed_seconds=round(time.perf_counter()-started,3),error=worker.error)
        try:
            import resource
            result['peak_rss_kib']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        except ImportError:pass
    print(json.dumps(result,indent=2))
    if cuts!=27 or worker.error:raise SystemExit('Probe did not cover all27 expected morning cuts')


if __name__=='__main__':main()
