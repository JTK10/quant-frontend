"""Frozen numeric-tree inference. Standard library only; no broker requests.

Score confirmed causal events once. This is an experimental ranking score,
not a calibrated probability or a rule for entering/exiting a trade.
"""
import json
import math
from functools import lru_cache
from pathlib import Path

MODEL_PATH = Path(__file__).with_name('pallas_ai_model.json')
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
    def __init__(self, path=MODEL_PATH):
        self.model = json.loads(Path(path).read_text(encoding='utf-8'))
        self.model_id = self.model['model_id']
        assert self.model['schema'] == 1 and len(self.model['trees']) == 180
        assert len(self.model['features']) == 33
        for t in self.model['trees']:
            assert set(t['decision_type']) == {2}

    def features(self, event):
        numeric = {}
        for name, field in FIELD_MAP.items():
            value = event[field]
            if value is None or value == '':
                if name not in WALL_FIELDS:
                    raise ValueError('Required feature unavailable')
                value = 0.0  # Original training imputation, not observed zero OI.
            value = float(value)
            if not math.isfinite(value):
                raise ValueError('Non-finite feature')
            numeric[name] = value
        if event['Side'] not in ('BULL', 'BEAR'):
            raise ValueError('Invalid side')
        flow = event['Flow_Type']
        if flow not in self.model['flow_categories']:
            raise ValueError('Unknown flow category')
        respect = event['Line_Respect']
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

    def score(self, event):
        vector = self.features(event)
        raw = 0.0
        for t in self.model['trees']:
            node = 0
            while node >= 0:
                left = vector[t['split_feature'][node]] <= t['threshold'][node]
                node = t['left_child' if left else 'right_child'][node]
            raw += t['leaf_value'][-node - 1]
        return 1.0 / (1.0 + math.exp(-raw))

    def annotation(self, event, event_type, issued_at):
        if event_type != 'CONFIRMED_CLOSE':
            return dict(AI_Score=None, AI_Model_ID=None, AI_Status='AWAITING_CONFIRMATION', AI_Scored_At=None)
        try:
            score = self.score(event)
        except (ValueError, KeyError, TypeError, AssertionError, OverflowError):
            return dict(AI_Score=None, AI_Model_ID=self.model_id, AI_Status='FEATURES_UNAVAILABLE', AI_Scored_At=None)
        return dict(AI_Score=score, AI_Model_ID=self.model_id, AI_Status='SCORED', AI_Scored_At=issued_at)


@lru_cache(maxsize=1)
def get_scorer():
    return Scorer()
