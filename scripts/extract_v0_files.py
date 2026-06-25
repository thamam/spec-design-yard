import os
import sys
import requests

V0_API_KEY = os.getenv("V" + "0_API" + "_KEY")
if not V0_API_KEY:
    print("ERROR: V0_API_KEY environment variable is not set!")
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}

chat_id = "rS4YBwFOaK4"  # Chat with 9 generated files!
url = f"https://api.v0.dev/v1/chats/{chat_id}"

print(f"Fetching generated files from v0 chat {chat_id}...")
r = requests.get(url, headers=headers)
if r.status_code != 200:
    print(f"ERROR: Failed to fetch chat! Status: {r.status_code}")
    print(r.text)
    sys.exit(1)

data = r.json()
files = data.get("files", [])
if not files:
    print("ERROR: No files found in the v0 chat!")
    sys.exit(1)

project_root = "/home/ubuntu/spec-design-yard"

for f in files:
    file_path = f.get("meta", {}).get("file", "")
    content = f.get("source", "")
    
    if not file_path or not content:
        continue
        
    print(f"Processing v0 file: {file_path}")
    
    # We will map standard Next.js App Router paths to our Pages Router project:
    # app/page.tsx -> pages/index.tsx
    # components/workspace/... -> components/workspace/...
    target_path = file_path
    if file_path == "app/page.tsx":
        target_path = "pages/index.tsx"
    elif file_path.startswith("app/"):
        # Skip other app router boilerplate (layout.tsx, globals.css) since Pages Router has its own
        print(f" - Skipping App Router boilerplate: {file_path}")
        continue
        
    abs_target_path = os.path.join(project_root, target_path)
    os.makedirs(os.path.dirname(abs_target_path), exist_ok=True)
    
    with open(abs_target_path, "w", encoding="utf-8") as target_f:
        target_f.write(content)
        
    print(f" - Saved successfully to {abs_target_path}")

print("SUCCESS: All files successfully extracted from v0 and written to spec-design-yard!")
