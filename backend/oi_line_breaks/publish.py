"""Durable source/date-isolated ORDS publication through the existing VM2 client."""
from __future__ import annotations

import base64
import json
import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

IST = timezone(timedelta(hours=5, minutes=30))
MAX_RESPONSE = 600_000
MAX_POST = 350_000
INDEX_SOURCE = 'oi_line_breaks_index'


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    os.replace(temp, path)


def source_for_cut(cut):
    if not isinstance(cut, str) or len(cut) != 5 or cut[2] != ':' or cut[:2].isdigit() is False or cut[3:].isdigit() is False:
        raise ValueError('Invalid completed cut')
    return 'oi_line_breaks_' + cut.replace(':', '')


class Publisher:
    def __init__(self, config_path, root, request=None):
        cfg = json.loads(Path(config_path).read_text(encoding='utf-8'))
        for name in ('base', 'path', 'client_id', 'client_secret'):
            if not isinstance(cfg.get(name), str) or not cfg[name]:
                raise ValueError('Existing ORDS client configuration unavailable')
        parsed = urlsplit(cfg['base'])
        if parsed.scheme != 'https' or parsed.username or parsed.password or not parsed.hostname:
            raise ValueError('ORDS HTTPS origin unavailable')
        self.base = cfg['base'].rstrip('/')
        self.url = self.base + cfg['path']
        self.cfg = cfg
        self.root = Path(root)
        self.outbox = self.root / 'outbox'
        self.sent = self.root / 'sent'
        self.outbox.mkdir(parents=True, exist_ok=True)
        self.sent.mkdir(parents=True, exist_ok=True)
        self.request = request or self._request
        self.token = None
        self.expires = 0

    @staticmethod
    def _request(method, url, headers, body):
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=10) as response:
                status, blob = response.status, response.read(MAX_RESPONSE + 1)
        except HTTPError as error:
            status, blob = error.code, error.read(MAX_RESPONSE + 1)
        if len(blob) > MAX_RESPONSE:
            raise ValueError('ORDS response byte budget exceeded')
        return status, blob

    def _token(self, now):
        if self.token and now < self.expires:
            return self.token
        basic = base64.b64encode((self.cfg['client_id'] + ':' + self.cfg['client_secret']).encode()).decode()
        status, blob = self.request('POST', self.base + '/oauth/token',
                                    {'Authorization': 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded'},
                                    b'grant_type=client_credentials')
        if status != 200:
            raise RuntimeError('ORDS authorization HTTP ' + str(status))
        response = json.loads(blob)
        self.token = response['access_token']
        duration = float(response.get('expires_in', 300))
        self.expires = now + max(1, duration - 60)
        return self.token

    def _headers(self, now):
        return {'Authorization': 'Bearer ' + self._token(now), 'Content-Type': 'application/json'}

    def read_back(self, source, day, now):
        url = self.url + '?' + urlencode({'src': source, 'sig_date': day.replace('-', '')})
        status, blob = self.request('GET', url, self._headers(now), None)
        if status == 401:
            self.token = None
        if status != 200:
            raise RuntimeError('ORDS read-back HTTP ' + str(status))
        payload = json.loads(blob)
        if payload.get('hasMore') or not isinstance(payload.get('items'), list) or len(payload['items']) > 80:
            raise ValueError('ORDS source/date read-back incomplete')
        docs = {}
        for item in payload['items']:
            doc = item.get('doc', item)
            if isinstance(doc, str):
                doc = json.loads(doc)
            if doc.get('source') != source or str(doc.get('sig_date')) != day.replace('-', ''):
                raise ValueError('ORDS source/date isolation failed')
            docs[doc['Doc_ID']] = doc
        return docs

    def enqueue(self, day, cut, kind, body, now):
        if kind not in ('SNAPSHOT', 'INDEX'):
            raise ValueError('Invalid document kind')
        source = source_for_cut(cut) if kind == 'SNAPSHOT' else INDEX_SOURCE
        identifier = 'oi-line-breaks|v1|' + day.replace('-', '') + '|' + kind + '|' + cut.replace(':', '')
        document = dict(body, source=source, sig_date=day.replace('-', ''), date=day,
                        Doc_ID=identifier, cap='OI_LINE_BREAKS', name='', side='NEUTRAL',
                        kind=kind, decision_cut=cut, ts=now,
                        available_at=datetime.fromtimestamp(now, IST).isoformat())
        encoded = json.dumps(document, separators=(',', ':'), allow_nan=False).encode()
        if len(encoded) > MAX_POST:
            raise ValueError('Live board publication exceeds byte budget')
        filename = f'{day}-{cut.replace(":", "")}-{0 if kind == "SNAPSHOT" else 1}-{kind}.json'
        path = self.outbox / filename
        if not path.exists() and not (self.sent / filename).exists():
            save(path, {'document': document, 'attempts': 0, 'next_try': 0})
        return identifier

    def flush_one(self, now=None):
        now = time.time() if now is None else now
        for path in sorted(self.outbox.glob('*.json'))[:180]:
            record = json.loads(path.read_text(encoding='utf-8'))
            if int(record.get('attempts', 0)) >= 8 or record.get('next_try', 0) > now:
                continue
            doc = record['document']
            day, cut, kind = doc['date'], doc['decision_cut'], doc['kind']
            if kind == 'INDEX':
                snapshot = self.sent / f'{day}-{cut.replace(":", "")}-0-SNAPSHOT.json'
                if not snapshot.exists():
                    continue
            record['attempts'] = int(record['attempts']) + 1
            record['next_try'] = now + min(900, 15 * 2 ** (record['attempts'] - 1))
            save(path, record)
            try:
                existing = self.read_back(doc['source'], day, now)
                if doc['Doc_ID'] not in existing:
                    status, _ = self.request('POST', self.url, self._headers(now),
                                             json.dumps(doc, separators=(',', ':')).encode())
                    if status == 401:
                        self.token = None
                    if not 200 <= status < 300:
                        raise RuntimeError('ORDS publication HTTP ' + str(status))
                    existing = self.read_back(doc['source'], day, now)
                if doc['Doc_ID'] not in existing:
                    raise ValueError('ORDS publication not visible in read-back')
                os.replace(path, self.sent / path.name)
                return {'status': 'SENT', 'cut': cut, 'kind': kind}
            except Exception as error:
                return {'status': 'RETRY', 'cut': cut, 'kind': kind, 'error': type(error).__name__}
        return {'status': 'IDLE'}
