import urllib.request
import json

url = "http://localhost:3000/api/panther-signals?date=2026-09-22&sources=jaguar"
try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        for snap in data:
            if snap.get('cut') == '09:35':
                print(f"Snap 09:35:")
                print(f"  bull len: {len(snap.get('bull', []))}")
                print(f"  bear len: {len(snap.get('bear', []))}")
                for b in snap.get('bull', []):
                    if b.get('sym') == 'CONCOR': print("Found in bull!")
                for b in snap.get('bear', []):
                    if b.get('sym') == 'CONCOR': print("Found in bear!")
except Exception as e:
    print(f"Error: {e}")
