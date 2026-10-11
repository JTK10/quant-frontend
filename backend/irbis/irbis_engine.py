"""Irbis morning scanner. No orders; no Ounce entry/exit policies."""
import json, math, statistics
from pathlib import Path
from irbis_features import cash_features, chain_features, finite

def clean(x):
    if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
    if isinstance(x,(list,tuple)):return [clean(v) for v in x]
    if isinstance(x,float) and not math.isfinite(x):return None
    return x

def tree_value(node,values):
    while 'leaf_value' not in node:
        value=values[node['split_feature']]
        missing=value is None or not finite(value)
        if not missing and node.get('missing_type')=='Zero' and value==0:missing=True
        left=node['default_left'] if missing else value<=float(node['threshold'])
        node=node['left_child'] if left else node['right_child']
    return node['leaf_value']

class Model:
    def __init__(self,path):
        self.bundle=json.loads(Path(path).read_text())
        self.manifest=self.bundle['manifest'];self.id=self.bundle['model_id']
    def predict(self,name,features):
        model=self.bundle['models'][name]
        values=[features.get(k) for k in model['feature_names']]
        value=sum(tree_value(t['tree_structure'],values) for t in model['tree_info'])
        return 1/(1+math.exp(-max(-700,min(700,value)))) if name.endswith(('_hit','_clean')) else max(0,value)
    def score(self,f,side):
        bull=side=='BULL'
        gates=dict(
          ITC=bull and f['oi_itc']==1 and f['from_open_pct']>0 and f['vwap_distance_pct']>0 and f['coil_before_release_ratio']<=1/3 and f['cash_volume_acceleration']>=2,
          ADANI=not bull and f['oi_adani']==1 and f['from_open_pct']<=-2 and f['vwap_distance_pct']<0 and f['relative_morning_volume']>=2 and f['breaks_prior3_low']==1,
          TIINDIA=bull and f['oi_tiindia']==1 and f['previous_wall_reclaimed']==1 and f['from_open_pct']>0 and f['vwap_distance_pct']>0 and f['above_opening_high']==1 and f['cash_volume_acceleration']>=2,
          HDFC=not bull and f['oi_hdfc']==1 and f['opening_range_pct']>=.8 and f['opening_body_fraction']<=-.4 and .2<=f['opening_rebound_fraction']<=.75 and f['below_opening_low']==1 and f['vwap_distance_pct']<0)
        options=[]
        for family,valid in gates.items():
            if not valid or family+'_hit' not in self.bundle['models']:continue
            hit=self.predict(family+'_hit',f);mfe=self.predict(family+'_mfe',f);mae=self.predict(family+'_mae',f)
            options.append(dict(setup=family,score=hit+.2*mfe-.4*mae,quality_qualified=hit>=.55 and mfe>=1))
        return max(options,key=lambda r:r['score']) if options else None

def percentile(value,all_values):
    return (sum(v<value for v in all_values)+(sum(v==value for v in all_values)+1)/2)/len(all_values)

def chain(payload,symbol):
    return {(r[0],r[1]):dict(ltp=r[2] or 0,oi=r[3] or 0,base=r[4] or 0,volume=r[5] or 0) for r in payload.get('chains',{}).get(symbol,[])}

def freeze(model,day,bars,prior_cash,previous_chain,snap45,snap55,baselines):
    if day<=model.manifest['trained_through']:raise ValueError('Final model cannot score its training dates')
    features={}
    expected=[f'09:{m:02}' for m in range(15,60,5)]
    for sym,values in bars.items():
        if sym not in snap55.get('chains',{}):continue
        morning=[b for b in values if b['hm']<='09:55']
        if [b['hm'] for b in morning]!=expected:continue
        prior=prior_cash.get(sym,[])
        if not prior:continue
        base=baselines.get(sym,{})
        if base.get('pdc'):
            # Daily OHLC from existing source supplies complete previous close;
            # previous morning bars preserve volume comparison and prior open.
            prior=[dict(b) for b in prior if b['hm']<='09:55']
            prior.append(dict(hm='15:25',o=base['pdc'],h=base['pdh'],l=base['pdl'],c=base['pdc'],v=0))
        f=cash_features(morning,prior)
        if f:features[sym]=f
    if not features:return [],dict(cash_ready=0,reason='Previous-session cash or complete morning bars unavailable')
    breadth=sum(f['from_open_pct']>0 for f in features.values())/len(features)
    market=statistics.median(f['from_open_pct'] for f in features.values())
    candidates=[]
    for sym,f0 in features.items():
        current=chain(snap55,sym);old=chain(snap45,sym)
        prev=chain(previous_chain,sym) if previous_chain.get('expiry')==snap55['expiry'] else {}
        cf=chain_features(current,old,prev,f0['price'],f0['opening'])
        if cf is None:continue
        for side,sign in [('BULL',1),('BEAR',-1)]:
            f=dict(f0,**cf,signed_from_open_pct=sign*f0['from_open_pct'],signed_vwap_distance_pct=sign*f0['vwap_distance_pct'],
                   signed_recent10_price_pct=sign*f0['momentum_last10_pct'],signed_market_return=sign*market,signed_market_breadth=sign*(breadth-.5))
            result=model.score(f,side)
            if result:candidates.append(dict(symbol=sym,side=side,**result,price=f0['price'],vwap=f0['price']/(1+f0['vwap_distance_pct']/100),
                ce_change_pct=None,pe_change_pct=None,confirmed=False,coverage=None))
    ordered=[];seen=set()
    for r in sorted(candidates,key=lambda r:(-r['score'],r['symbol'])):
        if r['symbol'] in seen:continue
        seen.add(r['symbol']);ordered.append(dict(r,base_rank=len(ordered)+1,rank=len(ordered)+1))
    return ordered,dict(cash_ready=len(features),structural_candidates=len(ordered))

def rerank(frozen,bars,base,current,old,close):
    rows=[]
    for r in frozen:
        sym=r['symbol'];near=chain(base,sym);cur=chain(current,sym);prev=chain(old,sym)
        changes={};coverage=[]
        for leg in ['CE','PE']:
            keys=[k for k in near if k[1]==leg and near[k]['oi']>0 and abs(k[0]/r['price']-1)<=.025]
            matched=[k for k in keys if k in cur and k in prev and prev[k]['oi']>0]
            total=sum(near[k]['oi'] for k in keys);den=sum(prev[k]['oi'] for k in matched)
            coverage.append(sum(near[k]['oi'] for k in matched)/total if total else 0)
            changes[leg]=100*(sum(cur[k]['oi'] for k in matched)/den-1) if den else None
        values=[b for b in bars.get(sym,[]) if b['hm']<close]
        expected=9+int(close[3:5])//5
        if len(values)!=expected or min(coverage)<.9 or any(v is None for v in changes.values()):continue
        volume=sum(b['v'] for b in values)
        if volume<=0:continue
        vwap=sum((b['h']+b['l']+b['c'])/3*b['v'] for b in values)/volume
        sign=1 if r['side']=='BULL' else -1
        flow=sign*(changes['PE']-changes['CE'])
        aligned=changes['CE']<0<changes['PE'] if sign==1 else changes['PE']<0<changes['CE']
        rows.append(dict(r,price=values[-1]['c'],vwap=vwap,ce_change_pct=changes['CE'],pe_change_pct=changes['PE'],
                         confirmed=aligned and sign*(values[-1]['c']-vwap)>0,coverage=min(coverage),directional_flow=flow))
    for r in rows:r['rerank_score']=.5*percentile(r['score'],[x['score'] for x in frozen])+.5*percentile(r['directional_flow'],[x['directional_flow'] for x in rows])
    rows.sort(key=lambda r:(-r['rerank_score'],r['symbol']))
    for i,r in enumerate(rows):r['rank']=i+1
    return rows
