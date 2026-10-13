"""Research feature formulas exported unchanged; no pandas/numpy on VM."""
import math, statistics
class _Numeric:
    nan = float('nan')
    @staticmethod
    def std(values): return statistics.pstdev(values)
np = _Numeric()

def pc(a,b):return 100*(a/b-1) if b else float('nan')

def finite(x):return x is not None and math.isfinite(float(x))

def ratio(a,b):return a/b if b else float('nan')

def cash_features(bars,prior):
    """Bars passed here must end at 10:00 or earlier, never later."""
    assert len(bars)==9 and [b['hm'] for b in bars]==[f'{(555+5*i)//60:02}:{(555+5*i)%60:02}' for i in range(9)]
    price=bars[-1]['c'];opening=bars[0]['o'];high=max(b['h'] for b in bars);low=min(b['l'] for b in bars)
    vol=sum(b['v'] for b in bars)
    if min(price,opening,vol)<=0:return None
    vwaps=[]
    for i in range(len(bars)):
        part=bars[:i+1];v=sum(b['v'] for b in part)
        vwaps.append(sum((b['h']+b['l']+b['c'])/3*b['v'] for b in part)/v if v else price)
    previous=[b for b in prior if b['hm']<='09:55']
    previous_close=prior[-1]['c'] if prior else None
    opening_range=bars[0]['h']-bars[0]['l']
    body=lambda b:ratio(b['c']-b['o'],b['h']-b['l'])
    rets=[pc(b['c'],b['o']) for b in bars]
    f=dict(price=price,opening=opening,from_open_pct=pc(price,opening),gap_pct=pc(opening,previous_close),
       previous_day_return_pct=pc(prior[-1]['c'],prior[0]['o']) if prior else np.nan,
       from_prior_close_pct=pc(price,previous_close),vwap_distance_pct=pc(price,vwaps[-1]),
       vwap_slope_last15_pct=pc(vwaps[-1],vwaps[-4]),morning_range_pct=pc(high,low),
       location_in_morning_range=ratio(price-low,high-low),distance_to_high_pct=pc(price,high),
       distance_to_low_pct=pc(price,low),opening_range_pct=ratio(opening_range,opening)*100,
       opening_body_fraction=body(bars[0]),last_body_fraction=body(bars[-1]),
       last_upper_wick_fraction=ratio(bars[-1]['h']-max(bars[-1]['o'],price),bars[-1]['h']-bars[-1]['l']),
       last_lower_wick_fraction=ratio(min(bars[-1]['o'],price)-bars[-1]['l'],bars[-1]['h']-bars[-1]['l']),
       momentum_last5_pct=pc(price,bars[-2]['c']),momentum_last10_pct=pc(price,bars[-3]['c']),
       momentum_last15_pct=pc(price,bars[-4]['c']),positive_candles=sum(b['c']>b['o'] for b in bars)/9,
       closes_above_vwap=sum(b['c']>v for b,v in zip(bars,vwaps))/9,
       cash_volume_acceleration=ratio(bars[-1]['v'],bars[-2]['v']),
       last5_volume_share=ratio(bars[-1]['v'],vol),morning_volume_log=math.log1p(vol),
       cash_turnover_log=math.log1p(vol*vwaps[-1]/1e7),
       relative_morning_volume=ratio(vol,sum(b['v'] for b in previous)) if len(previous)==9 else np.nan,
       coil_before_release_ratio=ratio(max(b['h'] for b in bars[-4:-1])-min(b['l'] for b in bars[-4:-1]),opening_range),
       last15_range_ratio=ratio(max(b['h'] for b in bars[-3:])-min(b['l'] for b in bars[-3:]),opening_range),
       return_volatility_pct=float(np.std(rets)),
       above_opening_high=float(price>bars[0]['h']),below_opening_low=float(price<bars[0]['l']),
       breaks_prior3_high=float(price>max(b['h'] for b in bars[-4:-1])),
       breaks_prior3_low=float(price<min(b['l'] for b in bars[-4:-1])),
       above_prior_high=float(price>max(b['h'] for b in prior)) if prior else np.nan,
       below_prior_low=float(price<min(b['l'] for b in prior)) if prior else np.nan,
       opening_rebound_fraction=ratio(max(b['h'] for b in bars[1:-1])-bars[0]['l'],opening_range),
       prior_cash_available=float(bool(prior)))
    return f

def chain_features(chain,old,previous,price,opening):
    near={k:r for k,r in chain.items() if abs(k[0]/price-1)<=.025}
    if not any(k[1]=='CE' for k in near) or not any(k[1]=='PE' for k in near):return None
    f={};walls=[]
    for leg in ['CE','PE']:
        keys=[k for k in near if k[1]==leg and near[k]['base']>0]
        base=sum(near[k]['base'] for k in keys);cur=sum(near[k]['oi'] for k in keys)
        recent=[k for k in keys if k in old and old[k]['oi']>0]
        f[leg+'_baseline_change_pct']=pc(cur,base)
        f[leg+'_recent10_change_pct']=pc(sum(near[k]['oi'] for k in recent),sum(old[k]['oi'] for k in recent)) if recent else np.nan
        f[leg+'_oi_log']=math.log1p(cur)
        f[leg+'_contracts']=len(keys)
        f[leg+'_recent_matched_oi_fraction']=ratio(sum(near[k]['oi'] for k in recent),cur)
        f[leg+'_premium_recent10_pct']=ratio(sum(pc(near[k]['ltp'],old[k]['ltp'])*near[k]['oi'] for k in recent if old[k]['ltp']>0),sum(near[k]['oi'] for k in recent if old[k]['ltp']>0))
        f[leg+'_recent_volume_log']=math.log1p(sum(max(0,near[k]['volume']-old[k]['volume']) for k in recent))
        f[leg+'_volume_reset_count']=sum(near[k]['volume']<old[k]['volume'] for k in recent)
    f['put_call_oi_ratio']=ratio(sum(r['oi'] for k,r in near.items() if k[1]=='PE'),sum(r['oi'] for k,r in near.items() if k[1]=='CE'))
    f['oi_direction_balance']=f['PE_baseline_change_pct']-f['CE_baseline_change_pct']
    for (strike,leg),r in near.items():
        if leg!='CE' or (strike,'PE') not in near or not r['base'] or not near[strike,'PE']['base']:continue
        p=near[strike,'PE'];dc=pc(r['oi'],r['base']);dp=pc(p['oi'],p['base'])
        rank=1+sum(x['base']>r['base'] for k,x in chain.items() if k[1]=='CE')
        walls.append((strike,dc,dp,rank,r['base'],r['oi'],p['oi']))
    itc=any(dc<=-5 and dp>=2 and rank<=3 for strike,dc,dp,rank,*_ in walls)
    adani=any(dc>=5 for strike,dc,dp,rank,*_ in walls)
    hdfc=any(dc>=5 and strike>=price and (strike,'CE') in old and chain[strike,'CE']['oi']>old[strike,'CE']['oi'] for strike,dc,dp,rank,*_ in walls)
    recent_bull=finite(f['CE_recent10_change_pct']) and finite(f['PE_recent10_change_pct']) and f['CE_recent10_change_pct']<0<f['PE_recent10_change_pct'] and min(f['CE_recent_matched_oi_fraction'],f['PE_recent_matched_oi_fraction'])>=.9
    additions=[(r['oi']-r['base'],k[0]) for k,r in previous.items() if k[1]=='CE' and r['base']>0 and r['oi']>r['base'] and opening<=k[0]<=opening*1.06]
    wall=max(additions)[1] if additions else None
    f.update(oi_itc=float(itc),oi_adani=float(adani),oi_tiindia=float(recent_bull),oi_hdfc=float(hdfc),
        previous_wall_available=float(wall is not None),previous_wall_distance_pct=pc(price,wall),
        previous_wall_reclaimed=float(price>wall) if wall else np.nan,
        max_near_call_add_pct=max((w[1] for w in walls),default=np.nan),
        max_near_call_unwind_pct=min((w[1] for w in walls),default=np.nan),
        strongest_near_call_distance_pct=pc(max(walls,key=lambda w:w[4])[0],price) if walls else np.nan)
    return f
