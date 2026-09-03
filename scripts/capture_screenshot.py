import asyncio
import json
import os
import tempfile
import urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:3001"

# Minimal architecture with real components. Standalone opt-in used to load
# the built-in demo; first-run work made that a blank slate, so the pixel
# job now points at a throwaway project folder that already has a spec.
SCREENSHOT_SPEC = """system:
  name: External Brain v0.2
  components:
    - id: inbox
      type: Store
      name: inbox/
      connections:
        - target: digest_stage
    - id: digest_stage
      type: Stage
      name: digest
      connections:
        - target: review_stage
    - id: review_stage
      type: Stage
      name: review
"""


def open_fixture_project():
    """Switch the running server onto a temp project that has components.

    The screenshot job waits for [data-component-id]. An unconfigured or
    empty-standalone session has none, so the wait timed out after the
    blank-slate first-run change.
    """
    root = tempfile.mkdtemp(prefix="specyard-screenshot-")
    with open(os.path.join(root, "main.spec.yaml"), "w", encoding="utf-8") as fh:
        fh.write(SCREENSHOT_SPEC)
    req = urllib.request.Request(
        BASE + "/api/project",
        data=json.dumps({"dir": root}).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"Pointed screenshot job at fixture project {root} (HTTP {resp.status}).")


async def main():
    open_fixture_project()

    async with async_playwright() as p:
        print("Launching Chromium (/usr/bin/chromium-browser)...")
        browser = await p.chromium.launch(
            executable_path="/usr/bin/chromium-browser",
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page()
        await page.set_viewport_size({"width": 1280, "height": 800})
        
        print(f"Navigating to {BASE}...")
        try:
            await page.goto(BASE, wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            print(f"Warning during goto: {e}")
            
        # The component tree lives in the Tree tab, and the workspace opens on
        # Code — so these nodes are in the DOM at zero size. "attached" is the
        # honest gate: it proves the spec parsed into components.
        print("Waiting for spec hydration ([data-component-id])...")
        await page.wait_for_selector("[data-component-id]", state="attached", timeout=20000)

        # The canvas is what analyze_pixels.py actually grades.
        print("Waiting for the Excalidraw canvas to render...")
        await page.wait_for_selector("canvas.excalidraw__canvas", timeout=20000)
        await page.wait_for_timeout(3000)
        
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        output_path = os.path.join(base_dir, "v0-workspace-screenshot.png")
        print(f"Capturing screenshot to {output_path}...")
        await page.screenshot(path=output_path)
        print("SUCCESS: Screenshot captured and saved!")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
