"""Kairos10 paper lifecycle; frozen native sizing/marks, genuine Aurum model."""
import hashlib
import math
from pathlib import Path

import native_kairos2_engine as native

native.VERSION='kairos10-aurum-v1'
native.MODEL='kairos10-aurum-31e54fd760e9'
native.ENTRY_POLICY='kairos10-aurum-nextcut-native60'
MODEL=native.MODEL
VERSION=native.VERSION
THRESHOLD=.30
epoch,stamp,day,hm=native.epoch,native.stamp,native.day,native.hm


class Trader(native.Trader):
    def __init__(self,root,boot_at):
        super().__init__(root,boot_at)
        # A recovered paper position is managed; recovered unfilled intent is
        # never purchased after a restart. Daily taken/seen/outbox are preserved.
        self.state['intents']=[]
        self.state.setdefault('last_cut',None)
        self.state.setdefault('last_decision',None)
        self.save()

    def roll(self,now):
        old=self.state.get('date')
        super().roll(now)
        if old!=self.state['date']:
            self.state.update(intents=[],last_cut=None,last_decision=None)

    def emit(self,kind,now,payload=None,trade_day=None):
        doc=super().emit(kind,now,payload,trade_day)
        doc.update(source='kairos10',cap='KAIROS10',model_id=MODEL,powered_by='Aurum',
            score_threshold=THRESHOLD,score_note='Uncalibrated model ranking; not win probability')
        if kind=='HEALTH':
            doc.update(ai_threshold=THRESHOLD,accepted_model_ids=[MODEL],engine3_oi_cross_required=False,
                confirmation_window='09:40-10:55',entry_window='09:45-11:00',
                trained_through='2026-10-16',last_cut=self.state.get('last_cut'),last_decision=self.state.get('last_decision'))
        return doc

    def eligible(self,event,now,opening,closing):
        try:
            confirmation=epoch(event['Date']+'T'+event['Signal_Time']+':00+05:30')
            issued=epoch(event['Issued_At']);scored=epoch(event['AI_Scored_At']);armed=epoch(event['Armed_At'])
            due=confirmation+300
            score=event['AI_Score']
            active=next((x for x in self.state.get('intents',[]) if x.get('Event_ID')==event['Event_ID']),None)
            # Compare the frozen event identity and clocks, not merely its ID.
            same=active is not None and all(active.get(k)==event.get(k) for k in (
                'Date','Symbol','Side','Strike','Leg','Expiry','Signal_Time','Issued_At',
                'AI_Scored_At','Armed_At','AI_Score','Feature_SHA256','AI_Model_ID'))
            return bool(same and event.get('Recovered') is False and event.get('ConfirmedPullback') is True
                and event.get('entry_hold_passed') is True and event.get('AI_Model_ID')==MODEL
                and isinstance(score,(int,float)) and not isinstance(score,bool) and math.isfinite(score) and THRESHOLD<=score<=1
                and event['Date']==day(now) and event['Side'] in ('BULL','BEAR')
                and event['Leg']==('CE' if event['Side']=='BULL' else 'PE')
                and native.positive(event['Strike']) and event['Expiry']>=day(now)
                and '09:40'<=event['Signal_Time']<='10:55' and '09:45:00'<=hm(due)<='11:00:00'
                and opening<=confirmation and due<=now<=min(due+90,closing-1)
                and self.boot_at<=issued and confirmation<=issued<=scored<=armed<=due
                and event.get('Entry_Due_At',stamp(due))==stamp(due)
                and isinstance(event.get('Feature_SHA256'),str) and len(event['Feature_SHA256'])==64)
        except (KeyError,TypeError,ValueError,OverflowError):return False

    def candidates(self,events,now,opening,closing):
        self.roll(now)
        if self.state['position'] or self.state['taken']:return []
        good=[e for e in events if e.get('Event_ID') not in self.state['seen'] and self.eligible(e,now,opening,closing)]
        return sorted(good,key=lambda e:(e['Signal_Time'],-e['AI_Score'],e['Symbol']))

    def enter(self,event,contract,q,now,opening,closing):
        doc=super().enter(event,contract,q,now,opening,closing)
        if doc:
            metadata=dict(confirmation_time=event['Signal_Time'],entry_due_at=event['Entry_Due_At'],
                signal_issued_at=event['Issued_At'],feature_sha256=event['Feature_SHA256'],
                ai_scored_at=event['AI_Scored_At'],entry_policy=native.ENTRY_POLICY)
            self.state['position'].update(metadata);doc.update(metadata);self.state['intents']=[];self.save()
        return doc

    def health(self,now,status=None,extra=None):
        # Correct metadata in both local health and emitted HEALTH. Native risk
        # constants and position persistence are deliberately unchanged.
        values=dict(score_threshold=THRESHOLD,powered_by='Aurum',
            source='kairos10',trained_through='2026-10-16',confirmation_window='09:40-10:55',
            entry_window='09:45-11:00',last_cut=self.state.get('last_cut'),last_decision=self.state.get('last_decision'),
            score_note='Uncalibrated ranking score; no probability or profit guarantee',**(extra or {}))
        # Native dict() binds these keys explicitly; correct the returned local
        # record after its call. emit() already corrects the durable HEALTH doc.
        h=super().health(now,status,values)
        h.update(ai_threshold=THRESHOLD,accepted_model_ids=[MODEL],engine3_oi_cross_required=False)
        from kairos10_features import save
        save(self.root/'health.json',h)
        return h
