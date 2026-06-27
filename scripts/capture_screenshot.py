import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        print("Launching Chromium (/usr/bin/chromium-browser)...")
        browser = await p.chromium.launch(
            executable_path="/usr/bin/chromium-browser",
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page()
        await page.set_viewport_size({"width": 1280, "height": 800})
        
        print("Navigating to http://localhost:3001...")
        try:
            await page.goto("http://localhost:3001", wait_until="domcontentloaded", timeout=15000)
        except Exception as e:
            print(f"Warning during goto: {e}")
            
        print("Waiting 12 seconds for client-side mounting...")
        await asyncio.sleep(12)
        
        output_path = "/home/ubuntu/spec-design-yard/v0-workspace-screenshot.png"
        print(f"Capturing screenshot to {output_path}...")
        await page.screenshot(path=output_path)
        print("SUCCESS: Screenshot captured and saved!")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
