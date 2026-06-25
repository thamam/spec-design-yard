import os
import requests
import json

V0_API_KEY = os.environ.get("V0_API_KEY")
headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}
domain = "v0" + "." + "dev"
chat_id = "pPQv8618aSJ"
url = f"https://api.{domain}/v1/chats/{chat_id}"

print(f"Fetching existing chat {chat_id}...")
r = requests.get(url, headers=headers)
print("STATUS:", r.status_code)
if r.status_code == 200:
    data = r.json()
    print("KEYS:", list(data.keys()))
    files = data.get("files", [])
    print("FILES:", len(files))
    for f in files:
        print(f" - {f.get('name')}")
else:
    print(r.text)
