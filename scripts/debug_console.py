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
        
        # Listen for console messages
        page.on("console", lambda msg: print(f"BROWSER CONSOLE: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err.message}"))
        page.on("requestfailed", lambda req: print(f"REQUEST FAILED: {req.url}"))
        page.on("response", lambda res: print(f"RESPONSE: {res.status} {res.url}") if res.status >= 400 else None)
        
        print("Navigating to http://localhost:3001...")
        try:
            await page.goto("http://localhost:3001", wait_until="networkidle", timeout=60000)
        except Exception as e:
            print(f"Goto error: {e}")
            
        print("Waiting 10 seconds...")
        await asyncio.sleep(10)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
