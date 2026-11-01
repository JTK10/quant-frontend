"""Standard-library inference for the locally trained Aurum/Kairos tree bundle.

No training, quote fetching, orders, publication or production state. Model
scores are ranking values; they are not calibrated win probabilities.
"""
import json
import math
from pathlib import Path


class Scorer:
    def __init__(self,root=None):
        root=Path(root) if root else Path(__file__).resolve().parent/'models'
        self.manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
        self.name=self.manifest['choice']['model']
        self.threshold=self.manifest['choice']['threshold']
        self.features=self.manifest['models'][self.name]['features']
        self.model=json.loads((root/(self.name+'.json')).read_text(encoding='utf-8'))
        if self.model['objective'].split()[0]!='binary':raise ValueError('Unexpected model objective')

    def score(self,features):
        values=[]
        for name in self.features:
            value=features.get(name)
            try:value=float(value)
            except (TypeError,ValueError):value=float('nan')
            values.append(value)
        total=0.
        for tree in self.model['tree_info']:
            node=tree['tree_structure']
            while 'leaf_value' not in node:
                if node['decision_type']!='<=':raise ValueError('Unexpected categorical model split')
                value=values[node['split_feature']]
                left=node['default_left'] if math.isnan(value) else value<=float(node['threshold'])
                node=node['left_child' if left else 'right_child']
            total+=float(node['leaf_value'])
        return 1/(1+math.exp(-max(-700,min(700,total))))

    def eligible(self,features,confirmation_time):
        if not '09:40'<=confirmation_time<='10:55' or features.get('pullback_confirmed') is not True:
            return False
        # These are core known quantities in the selected small structure pack.
        if any(not isinstance(features.get(k),(int,float)) or not math.isfinite(features[k]) for k in self.features):return False
        return self.score(features)>=self.threshold
