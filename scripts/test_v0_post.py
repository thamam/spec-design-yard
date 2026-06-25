import os
import requests

V0_API_KEY = os.environ.get("V0_API_KEY")
headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}
domain = "v0" + "." + "dev"
url = f"https://api.{domain}/v1/chats"

payload = {
    "message": "Create a simple TSX page."
}

print("Sending test post...")
try:
    r = requests.post(url, json=payload, headers=headers, timeout=10)
    print("STATUS:", r.status_code)
    print("RESPONSE:", r.text[:300])
except Exception as e:
    print("ERROR:", e)
