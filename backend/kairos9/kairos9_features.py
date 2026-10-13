"""KAIROS9 paper selection from existing Irbis/Pallas captures. Stdlib inference."""
import json,math,statistics
from pathlib import Path
from cash_features import compute_cash_features
from irbis_features import chain_features

def read(path,limit=4_000_000):
    if path.stat().st_size>limit: raise ValueError('Input exceeds bound')
    return json.loads(path.read_text())

def minute(hm): return int(hm[:2])*60+int(hm[3:5])
def hm(n): return f'{n//60:02d}:{n%60:02d}'
def rows(raw): return {(r[0],r[1]):dict(ltp=r[2] or 0,oi=r[3] or 0,base=r[4] or 0,volume=r[5] or 0) for r in raw}

def tree(node,values):
    while 'leaf_value' not in node:
        v=values[node['split_feature']]
        missing=v is None or not math.isfinite(v) or (node.get('missing_type')=='Zero' and v==0)
        left=node['default_left'] if missing else v<=float(node['threshold'])
        node=node['left_child'] if left else node['right_child']
    return node['leaf_value']
class Model:
    def __init__(self,path): self.bundle=read(Path(path),2_000_000)
    def predict(self,name,f):
        values=[float(f.get(k,0)) if f.get(k) is not None and math.isfinite(float(f[k])) else 0. for k in self.bundle['features']]
        value=sum(tree(t['tree_structure'],values) for t in self.bundle['models'][name]['tree_info'])
        return 1/(1+math.exp(-max(-700,min(700,value)))) if name=='win' else value

def capture(input_dir,day,cut): return read(input_dir/(day.replace('-','')+'-'+cut.replace(':','')+'.json'))

def candidates(model,input_dir,irbis,day,cut):
    if day<=model.bundle['trained_through']: raise ValueError('Training date cannot be a live decision')
    state=read(irbis/'state'/f'{day}.json',2_000_000)
    docs=[d for d in state['documents'] if d.get('Cut')==cut and not d.get('Recovered') and d.get('State')=='READY']
    if len(docs)!=1:return []
    p=capture(input_dir,day,cut);old=capture(input_dir,day,hm(minute(cut)-10))
    if p['degraded'] or old['degraded'] or p['expiry']!=old['expiry']: raise ValueError('Degraded or mixed-expiry capture')
    previous=state.get('prior_day')
    prior=read(irbis/'prior'/f'{previous}-cash.json').get('bars',{})
    prior_chain=read(irbis/'prior'/f'{previous}-chain.json')
    bars={}
    for n in range(560,minute(cut)+1,5):
        snap=capture(input_dir,day,hm(n))
        if snap['date']!=day or snap['cut'][:5]!=hm(n):raise ValueError('Cash capture identity mismatch')
        for sym,b in snap['candles'].items():
            if b['time'][:5]!=hm(n-5):raise ValueError('Cash boundary mismatch')
            bars.setdefault(sym,[]).append(dict(hm=b['time'][:5],o=b['open'],h=b['high'],l=b['low'],c=b['close'],v=b['volume']))
    all_features={s:compute_cash_features(b,prior.get(s,[])) for s,b in bars.items() if len(b)==(minute(cut)-555)//5}
    all_features={s:f for s,f in all_features.items() if f}
    if len(all_features)<100:raise ValueError('Insufficient cash breadth coverage')
    breadth=sum(f['from_open_pct']>0 for f in all_features.values())/len(all_features)
    median=statistics.median(f['from_open_pct'] for f in all_features.values())
    result=[]
    for c in docs[0]['Candidates']:
        s=c['symbol'];side=c['side'];sign=1 if side=='BULL' else -1
        if not c.get('confirmed') or s=='IEX' or s not in all_features:continue
        f=all_features[s]
        if f['price']<150:continue
        cf=chain_features(rows(p['chains'].get(s,[])),rows(old['chains'].get(s,[])),rows(prior_chain.get(s,[])),f['price'],f['opening'])
        if not cf:continue
        # Preserve audited room formula and documented 1.8% training fallback.
        ps=prior.get(s,[{}])[-1].get('c',f['price'])
        chain=prior_chain.get(s,[])
        supports=sorted([(r[3],r[0]) for r in chain if r[1]=='PE' and .94*ps<=r[0]<=ps],reverse=True)[:2]
        resistances=sorted([(r[3],r[0]) for r in chain if r[1]=='CE' and ps<=r[0]<=1.06*ps],reverse=True)[:2]
        levels=sorted(set(r[1] for r in (supports if sign==1 else resistances)),reverse=sign<0)
        ahead=[x for x in levels if sign*(x-f['price'])>0];behind=[x for x in levels if sign*(f['price']-x)>0]
        room=100*sign*(ahead[0]/f['price']-1) if ahead else 5.
        flow=sign*(cf['PE_recent10_change_pct']-cf['CE_recent10_change_pct'])
        feat=dict(signed_open=sign*f['from_open_pct'],signed_vwap=sign*f['vwap_distance_pct'],signed_momentum5=sign*f['momentum_last5_pct'],signed_momentum10=sign*f['momentum_last10_pct'],volume_acceleration=f['cash_volume_acceleration'],rvol=f['relative_morning_volume'],range_pct=f['morning_range_pct'],signed_body=sign*f['last_body_fraction'],efficiency=f['efficiency'],signed_breadth=sign*(breadth-.5),signed_market=sign*median,relative_strength=sign*(f['from_open_pct']-median),oi_flow10=flow,oi_balance=sign*cf['oi_direction_balance'],coverage=min(cf['CE_recent_matched_oi_fraction'],cf['PE_recent_matched_oi_fraction']),spread_pct=1.8,room_pct=room,no_line_ahead=int(not ahead),broken_lines=len(behind),is_confirmed=1,is_high_flow=int(abs(flow)>=2))
        prob=model.predict('win',feat);mfe=model.predict('mfe',feat)
        if feat['signed_vwap']>0 and room>=.25 and flow>0 and prob>=.30:
            result.append(dict(Symbol=s,Side=side,Cut=cut,Spot=f['price'],Expiry=p['expiry'],Score=prob+.25*mfe,Win_Prob=prob,Pred_MFE=mfe,Feature_Spread_Imputed=True))
    return sorted(result,key=lambda r:(-r['Score'],r['Symbol']))
