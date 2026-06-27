import os
import sys
import time
import requests

def main():
    api_key = os.environ.get("V0_API_KEY")
    if not api_key:
        print("ERROR: V0_API_KEY environment variable is missing!")
        sys.exit(1)

    print("📡 Connecting to v0.dev API...")
    url_chats = "https://api.v0.dev/v1/chats"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Our custom instructions to v0 to build the exact workspace Tomer expects
    prompt = """
Create a professional Next.js (TypeScript) component for a split-pane "Spec-Design Yard" workspace. 

The design must use a gorgeous dark-mode HUD theme (charcoal zinc-950, deep zinc-900, dark grid lines, neon borders, and Virgil-like fonts).

Layout Requirements:
1. Split-pane layout: Left is the Spec Editor (w-[42%]); Right is the Visual Canvas (flex-1).
2. The left pane must have three selector tabs:
   - Raw YAML: Textarea editor that displays and parses a multi-layered YAML specification representing the "External Brain - v0.2" core loop (inbox -> digest -> review -> commit -> kb) and attachable Bricks (SCHEMA.md, index/log).
   - Collapsible Tree: An interactive directory tree of the parsed YAML spec, allowing the user to fold/expand nodes (system, components) using Chevron icons.
   - Selected Focus: A view that dynamically filters and isolates only the YAML block corresponding to the currently selected component/node on the canvas.
3. The right pane must dynamically load Excalidraw on the client side (using next/dynamic with ssr: false).
4. Integrate a helper function 'compileSpecToExcalidrawElements' that takes the parsed YAML AST and generates an array of hand-drawn Excalidraw elements (boxes for components colored by type: Store=Indigo, Stage=Purple, Brick=Emerald; and sketchy connecting arrows pointing from sources to targets).
5. Pass this generated elements array into the Excalidraw component via 'initialData.elements', and use a dynamic key (e.g. hash of the spec text) on the Excalidraw container to force automatic updates on YAML edits.
6. Ensure that the component renders a fallback placeholder during SSR hydration to avoid React hydration mismatches (use an isMounted state check).

Output only a single self-contained TSX component. Do not include separate CSS or markdown files. Make sure to use Lucide React icons (Folder, FileText, Layers, Code, Minimize2, Sparkles, HelpCircle, ChevronDown, ChevronRight) for tree indicators and tooltips.
"""

    payload = {
        "message": prompt
    }

    # 1. Create v0 Chat
    print("🚀 Sending generation prompt to v0...")
    response = requests.post(url_chats, json=payload, headers=headers)
    if response.status_code not in (200, 201):
        print(f"ERROR: Failed to create chat. Status: {response.status_code}, Body: {response.text}")
        sys.exit(1)

    chat_data = response.json()
    chat_id = chat_data.get("id")
    print(f"✓ Chat successfully created! ID: {chat_id}")

    # 2. Poll for files
    print("⏳ Polling v0 for the compiled TSX component...")
    url_get_chat = f"https://api.v0.dev/v1/chats/{chat_id}"
    
    max_attempts = 15
    attempt = 0
    generated_code = None

    while attempt < max_attempts:
        attempt += 1
        print(f"   [Attempt {attempt}/{max_attempts}] Checking status...")
        res_poll = requests.get(url_get_chat, headers=headers)
        if res_poll.status_code == 200:
            poll_data = res_poll.json()
            # In the v0 API, files can be under files array, or in the last message content
            messages = poll_data.get("messages", [])
            if messages:
                # Find message with files
                for msg in reversed(messages):
                    files = msg.get("files", [])
                    if files:
                        # Find the first TSX file or any file with content
                        for f in files:
                            if f.get("name", "").endswith(".tsx") or f.get("content"):
                                generated_code = f.get("content")
                                print(f"✓ Found generated file: {f.get('name')}")
                                break
                    if generated_code:
                        break
            if generated_code:
                break
        else:
            print(f"   [Warning] Status check failed: {res_poll.status_code}")
        
        time.sleep(6)

    if not generated_code:
        print("ERROR: Timeout or failed to retrieve generated file from v0.dev.")
        sys.exit(1)

    # 3. Write file
    target_path = "/home/ubuntu/spec-design-yard/components/Workspace.tsx"
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as out_f:
        out_f.write(generated_code)
    
    print(f"🎉 SUCCESS! Workspace component successfully generated via v0 and written to: {target_path}")

if __name__ == "__main__":
    main()
