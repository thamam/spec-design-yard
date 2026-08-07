import asyncio
import os
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        print("Launching Chromium (/usr/bin/chromium-browser)...")
        browser = await p.chromium.launch(
            executable_path="/usr/bin/chromium-browser",
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
        )
        page = await browser.new_page()
        await page.set_viewport_size({"width": 1440, "height": 900})
        
        print("Navigating to http://localhost:3005...")
        try:
            await page.goto("http://localhost:3005", wait_until="networkidle", timeout=30000)
        except Exception as e:
            print(f"Warning during goto: {e}")
            
        print("Waiting for spec hydration...")
        await page.wait_for_selector("[data-testid='spec-textarea']", timeout=20000)
        await asyncio.sleep(2) # brief sleep to ensure state is settled
        
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # 1. Capture Raw YAML view
        print("Capturing 1. Code View...")
        await page.screenshot(path=os.path.join(base_dir, "storyboard-1-code.png"))
        
        # 2. Capture Tree Explorer view
        print("Switching to Tree Tab...")
        await page.click("#tab-tree")
        await asyncio.sleep(1)
        print("Capturing 2. Tree View...")
        await page.screenshot(path=os.path.join(base_dir, "storyboard-2-tree.png"))
        
        # 3. Click 'inbox' component with force=True to select it
        print("Selecting 'inbox' component with force=True...")
        try:
            await page.click("[data-component-id='inbox']", force=True)
            await asyncio.sleep(1)
        except Exception as e:
            print(f"Click warning: {e}")
        
        # 4. Switch to Focus Tab and capture it
        print("Switching to Focus Tab...")
        await page.click("#tab-focus")
        await asyncio.sleep(1)
        print("Capturing 3. Focus View...")
        await page.screenshot(path=os.path.join(base_dir, "storyboard-3-focus.png"))
        
        # 5. Switch to Metrics Tab and capture it
        print("Switching to Metrics Tab...")
        await page.click("#tab-metrics")
        await asyncio.sleep(1)
        print("Capturing 4. Metrics View...")
        await page.screenshot(path=os.path.join(base_dir, "storyboard-4-metrics.png"))
        
        # 6. Switch to Security Tab and capture it
        print("Switching to Security Tab...")
        await page.click("#tab-security")
        await asyncio.sleep(1)
        print("Capturing 5. Security View...")
        await page.screenshot(path=os.path.join(base_dir, "storyboard-5-security.png"))
        
        print("SUCCESS: All 5 storyboard screenshots captured successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
