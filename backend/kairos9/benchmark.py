"""Read-only resource benchmark over bounded archived inputs; no broker/publication."""
import resource,time,json
from pathlib import Path
from kairos9_features import Model,candidates
model=Model(Path(__file__).with_name('kairos9_model.json'))
model.bundle['trained_through']='2026-10-12' # Historical workload only; no production eligibility change.
start=time.process_time();counts=[]
for cut in ['10:10','10:15','10:20','10:25','10:30','10:35','10:40','10:45','10:50','10:55','11:00']:
    counts.append(len(candidates(model,Path('/home/ubuntu/pallas/input'),Path('/home/ubuntu/irbis'),'2026-10-13',cut)))
print(json.dumps(dict(cuts=11,candidates=counts,cpu_seconds=time.process_time()-start,max_rss_kib=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,network=False,publication=False)))
