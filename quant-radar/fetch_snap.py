import urllib.request
import json

url = "http://localhost:3000/api/panther-signals?date=2026-09-22&sources=jaguar"
try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        for snap in data:
            if snap.get('cut') == '09:35':
                print(f"Snap 09:35 bear:")
                for bear in snap.get('bear', []):
                    print(bear)
except Exception as e:
    print(f"Error: {e}")
