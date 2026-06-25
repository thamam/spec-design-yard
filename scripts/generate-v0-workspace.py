import os
import sys
import time
import requests

V0_API_KEY = os.environ.get("V0_API_KEY")
if not V0_API_KEY:
    print("ERROR: V0_API_KEY environment variable is not set!")
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {V0_API_KEY}",
    "Content-Type": "application/json"
}

PROMPT = "Create a premium interactive Next.js TSX Workspace component for a split-pane Spec-Diagram design system. The layout should be a high-fidelity Dark-Mode HUD matching a sleek development IDE (stealthy charcoal background, neon accents). It must have two main panes: Left Pane (data-testid='editor-panel') with Code, Tree, and Focus tabs, and Right Pane (data-testid='canvas-panel') with dynamic client-side loading of Excalidraw."

print("Kicking off v0.dev generation...", flush=True)
url = "https://api.v0.dev/v1/chats"
payload = {
    "message": PROMPT
}

t0 = time.time()
try:
    response = requests.post(url, json=payload, headers=headers, timeout=60)
except Exception as e:
    print(f"ERROR: Failed to connect to v0: {e}", flush=True)
    sys.exit(1)

if response.status_code != 200:
    print(f"ERROR: Failed to create v0 chat! Status: {response.status_code}", flush=True)
    print(response.text, flush=True)
    sys.exit(1)

chat_data = response.json()
chat_id = chat_data.get("id")
print(f"Created v0 Chat successfully in {time.time() - t0:.2f}s. ID: {chat_id}", flush=True)
print(f"v0 Chat URL: https://v0.dev/chat/{chat_id}", flush=True)

print("Polling v0 for generated files (max 120 seconds)...", flush=True)
start_time = time.time()
workspace_code = None
poll_count = 0

while time.time() - start_time < 120:
    poll_count += 1
    print(f"Poll #{poll_count} at {time.time() - start_time:.1f}s...", end="", flush=True)
    
    poll_url = f"https://api.v0.dev/v1/chats/{chat_id}"
    try:
        poll_resp = requests.get(poll_url, headers=headers, timeout=10)
    except Exception as e:
        print(f" (Request error: {e})", flush=True)
        time.sleep(5)
        continue
        
    if poll_resp.status_code == 200:
        poll_data = poll_resp.json()
        
        # Correctly look for files at top level
        files = poll_data.get("files", [])
        
        # Correctly look for files in messages if top level is empty
        if not files:
            messages = poll_data.get("messages", [])
            if messages:
                files = messages[-1].get("files", [])
        
        if files:
            print(f" Found {len(files)} files!", flush=True)
            for f in files:
                # Use correct keys based on the API response structure
                file_name = f.get("meta", {}).get("file", "")
                content = f.get("source", "")
                print(f"  - Analyzing file: {file_name}", flush=True)
                if file_name.endswith(".tsx") or "Workspace" in file_name or "index" in file_name or "page.tsx" in file_name:
                    workspace_code = content
                    break
            if workspace_code:
                break
        else:
            print(" No files generated yet.", flush=True)
    else:
        print(f" (API error: {poll_resp.status_code})", flush=True)
        
    time.sleep(6)

if not workspace_code:
    print("ERROR: Did not receive the compiled component code from v0 in time!", flush=True)
    sys.exit(1)

# Save the generated code to the component path
output_path = "/home/ubuntu/spec-design-yard/components/Workspace.tsx"
with open(output_path, "w", encoding="utf-8") as out_f:
    out_f.write(workspace_code)

print(f"SUCCESS: Successfully saved v0 generated Workspace component to {output_path}", flush=True)
