"""Export recorded research cuts for an isolated, network-free Rusty UI."""
from pathlib import Path
import json, math
import pandas as pd
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(__file__).resolve().parent/'data';OUT.mkdir(exist_ok=True)
b=pd.read_csv(ROOT/'analysis/corrected_bulls_pdh/with_pdh_all_cuts.csv')
b['trap_excursion_pct']=100*(b.trap_high/b.oi_line-1)
assert b.trap_excursion_pct.ge(0).all() and b.trap_drawdown_pct.ge(0).all()
s=pd.read_csv(ROOT/'analysis/bear_v2_ranking/V1_price_all_cuts.csv')
outcomes={}
for side,path in [('bull',ROOT/'analysis/signal_count_filters_20261018/first_alerts.csv'),('bear',ROOT/'locked/bear_oi_rejection_price_v1_20261017/results/price_ranked_bear_candidates.csv')]:
 frame=pd.read_csv(path)
 if side=='bull':
  frame=frame[frame.side.eq('BULL')&frame.variant.eq('CE_magnitude_3pct')&frame.outcome_status.eq('SIMULATED_GROSS_STOCK')]
 for r in frame.to_dict('records'):
  outcomes[(r['date'],r['time_ist'],r['symbol'],side)]={k:r.get(k) for k in ['entry_time_ist','entry','exit_time_ist','exit_price','exit_reason','gross_stock_return_pct','remaining_session_mfe_pct']}
def clean(v):
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
 if isinstance(v,list):return [clean(x) for x in v]
 if isinstance(v,float) and not math.isfinite(v):return None
 return v
days=sorted(set(b.date)|set(s.date));manifest=[]
for day in days:
 cuts={}
 for side,frame in [('bull',b),('bear',s)]:
  for r in frame[frame.date.eq(day)].to_dict('records'):
   cut=r['time_ist'];cuts.setdefault(cut,{'bull':[],'bear':[]})
   item={'symbol':r['symbol'],'rank':r['rank'],'ce':r['ce_pct'],'pe':r['pe_pct'],
    'ce5':r.get('ce_change_5m_pp') if side=='bull' else r.get('ce_delta_5'),
    'price':r['completed_close'] if side=='bull' else r['bar_close'],
    'line':r['oi_line'] if side=='bull' else r['line'],
    'move':r['move_pct'] if side=='bull' else -r['price_weakness_pct'],
    'pdh':r.get('pdh') if side=='bull' else None,
    'trapExcursion':r.get('trap_excursion_pct') if side=='bull' else None,
    'trapDrawdown':r.get('trap_drawdown_pct') if side=='bull' else None,
    'trapHigh':r.get('trap_high') if side=='bull' else None,
    'failure':r.get('trap_date') if side=='bull' else r.get('support_date'),
    'wallDate':None if side=='bull' else r.get('wall_date'),
    'coverage':min(r['ce_coverage'],r['pe_coverage']) if side=='bull' else r.get('coverage'),
    'source':r.get('ce_source','RECONSTRUCTED_MATCHED_OPENING_BASKET'),
    'reclaim':r.get('initial_reclaim_at') if side=='bull' else None,
    'outcome':outcomes.get((day,cut,r['symbol'],side))}
   cuts[cut][side].append(item)
 for cut in cuts:
  for side in ['bull','bear']:cuts[cut][side].sort(key=lambda r:(r['rank'],r['symbol']))
 payload={'date':day,'cuts':cuts}
 (OUT/(day+'.json')).write_text(json.dumps(clean(payload),separators=(',',':')),encoding='utf-8')
 manifest.append({'date':day,'cuts':sorted(cuts)})
 assert all(r['ce']<0 and r['price']>r['pdh'] for v in cuts.values() for r in v['bull'])
 assert all(r['ce']>0 and r['ce5']>0 and r['move']<0 for v in cuts.values() for r in v['bear'])
(OUT/'manifest.json').write_text(json.dumps({'sessions':manifest,'bull':'Corrected OI line reclaim + PDH','bear':'Locked Bear V1','rowMeaning':'Qualified candidates at each recorded cut; ranks compare candidates on the same side.','limitations':'Historical research replay. No live feed or trading. Returns and MFE, when shown, are future research outcomes in a separate section.'}),encoding='utf-8')
print('Exported',len(days),'sessions;',sum((OUT/(d+'.json')).stat().st_size for d in days),'bytes')
