"""Dual-Engine AI Inference for Pallas.
Standard library only; no broker requests or heavy ML dependencies.

Routes:
1. Standard Bull/Bear Pole-Flags -> pallas_ai_model.json (180 trees)
2. Reverse Pole Flags & Cascades -> reverse_pole_ai_model.json (130 trees)
"""
import json
import math
from functools import lru_cache
from pathlib import Path

MODEL_PATH = Path(__file__).with_name('pallas_ai_model.json')
REV_MODEL_PATH = Path(__file__).with_name('reverse_pole_ai_model.json')

FIELD_MAP = {
    'Pole_Move_%': 'Pole_Move_Pct', 'Pole_Body_%': 'Pole_Body_Pct',
    'Flag_%': 'Flag_Retrace_Pct', 'Flag_PB_%': 'Flag_Pullback_Pct',
    'PF_Ratio': 'PF_Ratio', 'Stk_Dist_%': 'Strike_Distance_Pct',
    'Vol_Share_%': 'Volume_Share_Pct', 'Prem_Flow_Cr': 'Premium_Flow_Cr',
    'Notional_Cr': 'Notional_Cr',
    'Line_Wall_Spike_%': 'Intraday_Wall_Buildup_Pct',
    'Line_OI_Added': 'Intraday_Wall_OI_Added',
}
WALL_FIELDS = {'Line_Wall_Spike_%', 'Line_OI_Added'}


def minutes(value):
    h, m = map(int, str(value).split(':')[:2])
    if not 0 <= h < 24 or not 0 <= m < 60:
        raise ValueError('Invalid event time')
    return (h - 9) * 60 + m - 15


class Scorer:
    def __init__(self, path=MODEL_PATH, rev_path=REV_MODEL_PATH):
        # 1. Standard Pole Flag Model
        self.model = json.loads(Path(path).read_text(encoding='utf-8'))
        self.model_id = self.model['model_id']
        assert self.model['schema'] == 1 and len(self.model['trees']) == 180
        assert len(self.model['features']) == 33
        for t in self.model['trees']:
            assert set(t['decision_type']) == {2}

        # 2. Reverse Pole & Cascade Model
        self.rev_model = None
        rev_file = Path(rev_path)
        if rev_file.exists():
            try:
                self.rev_model = json.loads(rev_file.read_text(encoding='utf-8'))
                assert self.rev_model['schema'] == 1 and len(self.rev_model['trees']) == 130
                assert len(self.rev_model['features']) == 23
            except Exception:
                self.rev_model = None

    def is_reverse_pole(self, event):
        return event.get('Pattern_Type') in ('REVERSE_POLE', 'CASCADE')

    def features_standard(self, event):
        numeric = {}
        for name, field in FIELD_MAP.items():
            value = event[field]
            if value is None or value == '':
                if name not in WALL_FIELDS:
                    raise ValueError('Required feature unavailable')
                value = 0.0
            value = float(value)
            if not math.isfinite(value):
                raise ValueError('Non-finite feature')
            numeric[name] = value
        if event['Side'] not in ('BULL', 'BEAR'):
            raise ValueError('Invalid side')
        flow = event['Flow_Type']
        if flow not in self.model['flow_categories']:
            raise ValueError('Unknown flow category')
        respect = event.get('Line_Respect')
        if isinstance(respect, str):
            if respect.lower() not in ('true', 'false', ''):
                raise ValueError('Invalid wall respect')
            respect = respect.lower() == 'true'
        elif respect is not None and not isinstance(respect, bool):
            raise ValueError('Invalid wall respect')
        numeric.update(
            TM_Score=round(numeric['Vol_Share_%'] / 20 * math.sqrt(numeric['Pole_Move_%']) * 1.25, 2),
            Breakout_Min=minutes(event['Signal_Time']),
            Flag_Duration_Min=minutes(event['Signal_Time']) - minutes(event['Pole_Time']),
            Side_Num=float(event['Side'] == 'BULL'), Line_Respect_Num=float(bool(respect)))
        sector = self.model['sectors'].get(event['Symbol'], 'OTHER')
        vector = []
        for f in self.model['features']:
            if f in numeric:
                vector.append(numeric[f])
            elif f.startswith('Flow_'):
                vector.append(float(f == 'Flow_' + flow))
            elif f.startswith('Sec_'):
                vector.append(float(f == 'Sec_' + sector))
            else:
                raise ValueError('Unknown model feature')
        assert all(math.isfinite(v) for v in vector)
        return vector

    def features_reverse_pole(self, event):
        drop = float(event['Pole_Move_Pct'])
        retrace = float(event['Flag_Retrace_Pct'])
        pb = float(event['Flag_Pullback_Pct'])
        ratio = float(event['PF_Ratio'])
        vol_share = float(event['Volume_Share_Pct'])
        notional = float(event['Notional_Cr'])
        prem_flow = float(event['Premium_Flow_Cr'])
        ce_oi = float(event.get('Opposing_OI_Change', 0))
        pe_oi = float(event.get('Leg_OI_Change', 0))
        net_oi = ce_oi - pe_oi
        trap = (retrace / 100.0) * (max(0.0, pe_oi) / 10000.0)
        b_min = float(minutes(event['Signal_Time']))
        is_casc = 1.0 if event.get('Pattern_Type') == 'CASCADE' else 0.0
        r_drop = retrace / max(0.5, drop)
        sector = self.model['sectors'].get(event['Symbol'], 'OTHER')

        vals = {
            'Drop_%': drop, 'Retrace_%': retrace, 'PB_Spot_%': pb, 'PF_Ratio': ratio,
            'Vol_Share_%': vol_share, 'Notional_Cr': notional, 'Prem_Flow_Cr': prem_flow,
            'CE_OI_Change': ce_oi, 'PE_OI_Change': pe_oi, 'Net_OI_Change': net_oi,
            'Trap_Risk_Metric': trap, 'Breakout_Min': b_min, 'Is_Cascade': is_casc,
            'Retrace_Drop_Ratio': r_drop
        }
        for f in self.rev_model['features']:
            if f.startswith('Sec_'):
                vals[f] = 1.0 if f == 'Sec_' + sector else 0.0

        vector = [vals[f] for f in self.rev_model['features']]
        assert all(math.isfinite(v) for v in vector)
        return vector

    def score(self, event):
        if self.is_reverse_pole(event) and self.rev_model is not None:
            vector = self.features_reverse_pole(event)
            trees = self.rev_model['trees']
        else:
            vector = self.features_standard(event)
            trees = self.model['trees']

        raw = 0.0
        for t in trees:
            node = 0
            while node >= 0:
                left = vector[t['split_feature'][node]] <= t['threshold'][node]
                node = t['left_child' if left else 'right_child'][node]
            raw += t['leaf_value'][-node - 1]
        return 1.0 / (1.0 + math.exp(-raw))

    def annotation(self, event, event_type, issued_at):
        if event_type != 'CONFIRMED_CLOSE':
            return dict(AI_Score=None, AI_Model_ID=None, AI_Status='AWAITING_CONFIRMATION', AI_Scored_At=None)
        is_rev = self.is_reverse_pole(event)
        submodel = self.rev_model['model_name'] if (is_rev and self.rev_model) else 'pallas_standard_poleflag'
        try:
            score = self.score(event)
        except (ValueError, KeyError, TypeError, AssertionError, OverflowError):
            return dict(AI_Score=None, AI_Model_ID=self.model_id, AI_Submodel=submodel,
                        AI_Status='FEATURES_UNAVAILABLE', AI_Scored_At=None)
        return dict(AI_Score=score, AI_Model_ID=self.model_id, AI_Submodel=submodel,
                    AI_Status='SCORED', AI_Scored_At=issued_at)


@lru_cache(maxsize=1)
def get_scorer():
    return Scorer()
