import asyncio
import json
import os
import urllib.request
from playwright.async_api import async_playwright

BASE = "http://localhost:3001"

def opt_into_standalone():
    """Choose browser storage, the way the project picker does.

    Since the first-run blank slate landed, an unconfigured install opens with
    no components at all — nothing for [data-component-id] to match. Standalone
    is the mode that carries the built-in demo spec, so it is the one worth
    screenshotting.
    """
    req = urllib.request.Request(
        BASE + "/api/project",
        data=json.dumps({"mode": "standalone"}).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        print(f"Opted into standalone mode (HTTP {resp.status}).")

async def main():
    opt_into_standalone()

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
