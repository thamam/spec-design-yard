"""E2E user-chair test for spec-yard standalone mode (the browser-storage opt-out).

Standalone is a deliberate choice, not a default: the run starts by opting out
through the project API exactly as the picker does, then checks localStorage
persistence across reload, that the store API stays quiet, that the demo spec
is available to play with, and that nothing errors.

Run it via `npm run test:e2e` (which supplies an isolated server), or point
SPEC_YARD_URL at a dev server started with a throwaway SPEC_YARD_CONFIG_DIR.

Safety: this scenario mutates server-side configuration, so it refuses to run
(exit 2) unless SPEC_YARD_E2E_CONFIG_WRITES_OK=1 is set. `npm run test:e2e`
sets it, having started the server on a throwaway SPEC_YARD_CONFIG_DIR;
nothing else should.
"""
import json
import os
import sys
import time
import urllib.request

from e2e_guard import require_config_writes_allowed, require_mode
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

# Guard BEFORE the PUT below, not after it. The old order validated the state
# this scenario had just created: pointed at a real project-mode server the PUT
# flipped the live session and persisted standalone into config.json before any
# guard ran. A fresh throwaway server is unconfigured.
require_config_writes_allowed(scenario="standalone")
require_mode(BASE, "unconfigured", scenario="standalone")

# Opt out the way the picker does — standalone is a choice the user makes.
opt_out = urllib.request.Request(
    BASE + "/api/project",
    data=json.dumps({"mode": "standalone"}).encode(),
    headers={"Content-Type": "application/json"},
    method="PUT",
)
with urllib.request.urlopen(opt_out) as resp:
    check("project API accepts the browser-storage opt-out", resp.status == 200)

# API contract: with no project the store answers 200 {enabled:false} (quiet by
# design — an error status would log to the browser console on every load), and
# says which no-project state it is so the workspace can pick a starting spec.
with urllib.request.urlopen(BASE + "/api/store/spec/main") as resp:
    body = resp.read().decode()
compact = body.replace(" ", "")
check("store API answers enabled:false with no project", '"enabled":false' in compact, body)
check("store API reports the opt-out as standalone", '"mode":"standalone"' in compact, body)

# The contract check, not a safety guard: the opt-out above must have taken.
require_mode(BASE, "standalone", scenario="standalone")

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
    check("the opt-out keeps the built-in demo to play with", "External Brain" in ta.input_value(),
          ta.input_value()[:120])

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
