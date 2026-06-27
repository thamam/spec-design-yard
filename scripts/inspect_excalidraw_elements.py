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
        
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"JS ERROR: {err.message}"))
        
        print("Navigating to http://localhost:3001...")
        await page.goto("http://localhost:3001", wait_until="domcontentloaded", timeout=15000)
        
        print("Waiting 12 seconds for Excalidraw to load and render...")
        await asyncio.sleep(12)
        
        print("Checking window.excalidrawAPI...")
        api_exists = await page.evaluate("() => !!window.excalidrawAPI")
        print(f"API exists on window: {api_exists}")
        
        if api_exists:
            elements_count = await page.evaluate("() => window.excalidrawAPI.getSceneElements().length")
            print(f"Excalidraw elements count: {elements_count}")
            
            elements = await page.evaluate("() => window.excalidrawAPI.getSceneElements().map(e => ({id: e.id, type: e.type, x: e.x, y: e.y, width: e.width, height: e.height, strokeColor: e.strokeColor, isDeleted: e.isDeleted}))")
            print("Excalidraw elements:")
            for e in elements[:10]:
                print(f"  {e}")
            if len(elements) > 10:
                print(f"  ... and {len(elements)-10} more.")
                
            # Let's get current AppState zoom and scroll
            app_state = await page.evaluate("() => { const state = window.excalidrawAPI.getAppState(); return { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY }; }")
            print(f"Excalidraw AppState: {app_state}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
