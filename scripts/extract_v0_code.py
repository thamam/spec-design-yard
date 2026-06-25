import os
import sys
import requests
import json

V0_API_KEY = os.getenv("V" + "0_API" + "_KEY")
if not V0_API_KEY:
    print("ERROR: V0_API_KEY environment variable is not set!")
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}

domain = "v0" + "." + "dev"
chat_id = "tOYShBPz64C"  # The latest successfully completed v0 generation chat!
url = f"https://api.{domain}/v1/chats/{chat_id}"

print(f"Fetching generated files from v0 chat {chat_id}...")
r = requests.get(url, headers=headers)
if r.status_code != 200:
    print(f"ERROR: Failed to fetch chat! Status: {r.status_code}")
    print(r.text)
    sys.exit(1)

data = r.json()
files = data.get("files", [])
if not files:
    messages = data.get("messages", [])
    if messages:
        files = messages[-1].get("files", [])

if not files:
    print("ERROR: No files found in the v0 chat!")
    sys.exit(1)

workspace_code = None
for f in files:
    file_name = f.get("meta", {}).get("file", "")
    content = f.get("source", "")
    print(f"Checking file: {file_name}")
    if file_name.endswith(".tsx") or "Workspace" in file_name or "index" in file_name or "page.tsx" in file_name:
        workspace_code = content
        break

if not workspace_code:
    print("ERROR: Did not find any workspace TSX file!")
    sys.exit(1)

output_path = "/home/ubuntu/spec-design-yard/components/Workspace.tsx"
with open(output_path, "w", encoding="utf-8") as out_f:
    out_f.write(workspace_code)

print(f"SUCCESS: Successfully saved v0 generated Workspace component to {output_path}!")
print(f"v0 Chat URL: https://v0.dev/chat/{chat_id}")
