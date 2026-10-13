"""Shared deterministic snapshot engine. No intrabar OHLC or active exit ML claims."""
import math

def minute(t):
    return int(t[:2])*60+int(t[3:5])

class OptionContractSelector:
    @staticmethod
    def valid(q):
        try:
            return all(math.isfinite(float(q[k])) for k in ['strike','ltp','bid','ask','oi','volume']) and q['ltp']>0 and q['bid']>0 and q['ask']>=q['bid'] and q['oi']>=0 and q['volume']>=0
        except (KeyError,TypeError,ValueError): return False

    @classmethod
    def select_best_contract(cls,records,spot,side):
        if not math.isfinite(float(spot)) or spot<=0 or side not in ['BULL','BEAR']: return None
        leg='CE' if side=='BULL' else 'PE'
        good=[q for q in records if cls.valid(q) and q['leg']==leg and q['oi']>=5000 and q['volume']>0 and abs(q['strike']/spot-1)<=.025 and 200*(q['ask']-q['bid'])/(q['ask']+q['bid'])<=5]
        return sorted(good,key=lambda q:(-q['oi'],-q['volume'],abs(q['strike']-spot),q['strike']))[0] if good else None

class KairosOptionTrailingEngine:
    def __init__(self,entry_price,entry_time):
        if not math.isfinite(entry_price) or entry_price<=0: raise ValueError('Invalid entry')
        self.entry_price=entry_price; self.entry_time=entry_time
        self.peak_gain_pct=0.; self.stop=-10.; self.pending=None; self.last=None
        self.is_closed=False; self.exit_price=None; self.exit_time=None; self.exit_reason=None
    def update_quote(self,time,ltp,bid):
        if self.is_closed: return
        now=minute(time)
        if now<minute(self.entry_time) or (self.last is not None and now<=self.last): raise ValueError('Non-increasing quote timestamp')
        if not all(math.isfinite(v) and v>0 for v in [ltp,bid]): raise ValueError('Invalid price')
        self.last=now
        # Preserve prior research peak definition: observed LTP, never fabricated candle high.
        self.peak_gain_pct=max(self.peak_gain_pct,100*(ltp/self.entry_price-1))
        reason=None
        if min(ltp,bid)<=self.entry_price*.9: reason='HARD_STOP'
        else:
            for peak,stop in [(8,-4),(12,2),(25,15),(40,28),(60,45)]:
                if self.peak_gain_pct>=peak: self.stop=max(self.stop,stop)
            if bid<=self.entry_price*(1+self.stop/100):
                if self.stop>0:
                    # Consecutive five-minute observations, not duplicate or widely separated snapshots.
                    if self.pending is not None and now-self.pending==5: reason=f'TRAILING_STOP threshold={self.stop:g}%'
                    self.pending=now
                else: reason=f'PROTECTIVE_STOP threshold={self.stop:g}%'
            else: self.pending=None
            if reason is None and now-minute(self.entry_time)>=45 and self.peak_gain_pct<2: reason='STAGNANCY_CUT'
            if reason is None and now>=minute('15:20'): reason='EOD_SQUAREOFF'
        if reason:
            self.is_closed=True; self.exit_price=bid; self.exit_time=time; self.exit_reason=reason

def fees(entry,exit,qty):
    """Model rates for Oct2026, Rs20/order assumed. Contract-note rounding excluded."""
    buy=entry*qty; sell=exit*qty; turnover=buy+sell
    brokerage=40.; stt=.0015*sell
    exchange=.000355299*turnover; ipft=.000000001*turnover
    sebi=.000001*turnover; stamp=.00003*buy
    gst=.18*(brokerage+exchange+ipft+sebi)
    parts=dict(Brokerage=brokerage,STT=stt,Exchange=exchange,IPFT=ipft,SEBI=sebi,Stamp=stamp,GST=gst)
    return dict(**parts,Total=sum(parts.values()))

def size_lots(entry,lot,budget):
    if entry<=0 or lot<=0 or budget<0: raise ValueError('Invalid sizing')
    return int(budget//(entry*lot))

def drawdown(values,initial=50000):
    peak=initial; worst=0.; pct=0.
    for v in values:
        peak=max(peak,v); worst=max(worst,peak-v); pct=max(pct,100*(peak-v)/peak)
    return dict(INR=worst,Pct=pct)

def portfolio(results,marks):
    summary={'Classification':'Research snapshot simulation; ML exit disabled','Initial_Equity':50000,'Lot_Sizes':'User-supplied historical assumptions; not independently verified','Fee_Model':'Oct2026 published rates; flat Rs20/order; unrounded estimate'}
    for col in ['1Lot','Budget']:
        pnl=[r['Net_'+col] for r in results]; gains=sum(max(0,p) for p in pnl); losses=-sum(min(0,p) for p in pnl)
        running=50000; closed=[]
        for p in pnl: running+=p; closed.append(running)
        summary[col]=dict(Trades=len(pnl),Net_PnL=sum(pnl),Fees=sum(r['Fees_'+col] for r in results),Win_Rate=100*sum(p>0 for p in pnl)/len(pnl) if pnl else 0,Profit_Factor=gains/losses if losses else None,Closed_Trade_Drawdown=drawdown(closed))
    prior=0.; equity=[]
    for r in results:
        equity.extend(50000+prior+m['Unrealized_Net'] for m in marks if m['Date']==r['Date'])
        prior+=r['Net_Budget']; equity.append(50000+prior)
    summary['Budget']['Sampled_Liquidation_Equity_Drawdown']=drawdown(equity)
    summary['Drawdown_Limit']='Five-minute observed/modelled bid marks; unobserved intrabar drawdowns unknown'
    return summary
