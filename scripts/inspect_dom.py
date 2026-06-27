import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        print("Launching Chromium...")
        browser = await p.chromium.launch(
            executable_path="/usr/bin/chromium-browser",
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page()
        
        print("Navigating to http://localhost:3001...")
        await page.goto("http://localhost:3001", wait_until="networkidle", timeout=60000)
        
        print("Waiting 5 seconds for client mounting...")
        await asyncio.sleep(5)
        
        print("Inspecting DOM...")
        
        # Check if the Excalidraw component is in the DOM
        has_excalidraw = await page.evaluate("() => !!document.querySelector('.excalidraw')")
        print(f"Has .excalidraw class: {has_excalidraw}")
        
        # Get outer HTML of the canvas-panel
        canvas_panel_html = await page.evaluate("() => document.querySelector('[data-testid=\"canvas-panel\"]').outerHTML")
        print(f"Canvas panel HTML snippet: {canvas_panel_html[:500]}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
