import urllib.request
import json

url = "http://localhost:3000/api/panther-signals?date=2026-09-22&sources=jaguar"
try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        print(f"Total snaps: {len(data)}")
        for snap in data:
            if snap.get('cut') and snap['cut'] >= '09:00':
                for bear in snap.get('bear', []):
                    if bear.get('sym') == 'CONCOR':
                        print(f"[{snap['cut']}] CONCOR -> {bear}")
except Exception as e:
    print(f"Error: {e}")
