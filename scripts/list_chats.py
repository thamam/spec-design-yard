import os
import requests

V0_API_KEY = os.environ.get("V0_API_KEY")
headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}

domain = "v0" + "." + "dev"
url = f"https://api.{domain}/v1/chats"

print("Listing recent v0 chats...")
r = requests.get(url, headers=headers)
print("STATUS:", r.status_code)
if r.status_code == 200:
    chats = r.json()
    # If the response is a list or has a data field
    if isinstance(chats, dict):
        chat_list = chats.get("data", []) or chats.get("chats", [])
    else:
        chat_list = chats
        
    print(f"Total chats found: {len(chat_list)}")
    for c in chat_list[:10]:
        print(f" - ID: {c.get('id')}, Title: {c.get('title') or c.get('name')}, Created: {c.get('createdAt')}")
else:
    print(r.text)
