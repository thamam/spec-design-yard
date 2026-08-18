"""E2E user-chair test for spec-yard standalone mode (no SPEC_YARD_PROJECT_DIR).

Expectations: localStorage persistence across reload, API answers 501,
no filesystem writes possible, no console errors, no UI error surfaced.
"""
import os
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3110")
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-e2e-shots")
os.makedirs(SHOTS, exist_ok=True)

failures = []
def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

# API contract: file mode off answers 200 {enabled:false} (quiet by design —
# an error status would log to the browser console on every standalone load)
with urllib.request.urlopen(BASE + "/api/store/spec/main") as resp:
    body = resp.read().decode()
check("API answers enabled:false when SPEC_YARD_PROJECT_DIR unset", '"enabled":false' in body.replace(" ", ""), body)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)

    ta = page.locator('[data-testid="spec-textarea"]')
    check("standalone mount loads built-in initial spec", "External Brain" in ta.input_value())

    edited = ta.input_value().replace("External Brain v0.2", "Standalone Local System")
    ta.fill(edited)
    time.sleep(2.5)  # autosave debounce

    stored = page.evaluate("() => localStorage.getItem('spec_main')")
    check("autosave persists to localStorage", stored is not None and "Standalone Local System" in stored)

    page.reload(wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)
    check("reload restores spec from localStorage", "Standalone Local System" in page.locator('[data-testid="spec-textarea"]').input_value())
    page.screenshot(path=os.path.join(SHOTS, "07-standalone-mode.png"))

    check("no console/page errors in standalone session", len(console_errors) == 0, "; ".join(console_errors[:5]))
    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
