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
        
        # Capture console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))
        
        print("Navigating to http://localhost:3001...")
        await page.goto("http://localhost:3001", wait_until="domcontentloaded", timeout=15000)
        
        print("Waiting 12 seconds...")
        await asyncio.sleep(12)
        
        print("Evaluating Excalidraw DOM state...")
        # Check if the canvas element exists
        canvas_exists = await page.evaluate("() => !!document.querySelector('canvas')")
        print(f"Canvas element exists in DOM: {canvas_exists}")
        
        # Let's count how many SVG or container elements are present
        div_count = await page.evaluate("() => document.querySelectorAll('div').length")
        print(f"Total div elements: {div_count}")
        
        # Let's see if there is any visible text inside the excalidraw-container
        container_text = await page.evaluate("() => document.getElementById('excalidraw-container')?.innerText")
        print(f"Container innerText: {container_text}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
