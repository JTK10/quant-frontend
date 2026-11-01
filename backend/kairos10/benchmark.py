"""Bounded local-input representative inference probe. No network/publication."""
import argparse
import json
from pathlib import Path
import tempfile
import time

from kairos10_features import Features,read,save
from kairos10_engine import epoch,hm
from kairos10_live import Runner  # Include actual HTTP transport imports in RSS.


def main():
    p=argparse.ArgumentParser();p.add_argument('--history',type=Path,required=True)
    p.add_argument('--input',type=Path,required=True);p.add_argument('--nifty',type=Path,required=True)
    p.add_argument('--date',default='2026-10-30');args=p.parse_args()
    nifty=read(args.nifty,512_000);started=time.perf_counter();size=0;events=[];cuts=0
    class Calendar:
        @staticmethod
        def prior_date_valid(prior,date):return prior<date
    with tempfile.TemporaryDirectory(prefix='kairos10-probe-') as directory:
        root=Path(directory);aurum=root/'aurum';aurum.mkdir()
        (aurum/'history.json').write_bytes(args.history.read_bytes())
        feature=Features(root,aurum,Calendar(),epoch(args.date+'T09:14:00+05:30'))
        feature.start(args.date)
        cache=[]
        for path in sorted(args.input.glob(args.date.replace('-','')+'-????.json')):
            cut=path.stem[-4:-2]+':'+path.stem[-2:]
            if not '09:20'<=cut<='11:00':continue
            instant=epoch(args.date+'T'+cut+':00+05:30');aux=nifty[args.date][cut]
            cache.append(dict(date=args.date,bar_start=hm(instant-300)[:5],open=aux['open'],close=aux['close'],
                available_at=instant,recovered=False))
            save(aurum/'nifty-cache.json',dict(bars=cache))
            payload=read(path);size+=path.stat().st_size
            scored=feature.evaluate(payload,max(instant+1,payload['exported_at']));events.extend(scored);cuts+=1
        result=dict(date=args.date,cuts=cuts,bytes_read=size,universe=len(feature.state['bars']),
            scored_events=len(events),evaluated_cuts=len(feature.state['evaluated']),
            elapsed_seconds=round(time.perf_counter()-started,3),network_calls=0,published=0)
        try:
            import resource
            result['peak_rss_kib']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        except ImportError:pass
        print(json.dumps(result,indent=2))
        if cuts!=21 or len(feature.state['evaluated'])!=16:raise ValueError('Expected all21 input cuts and16 scoring cuts')


if __name__=='__main__':main()
