"""E2E user-chair test for spec-yard file-backed mode (port 3109).

Drives a real browser through: load, edit YAML, autosave to client repo,
linter diagnostics, simulation run, fresh-browser reload from repo file.
Captures screenshots to /tmp/specyard-e2e-shots/ for review.
"""
import json
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3109")
CLIENT_REPO = os.environ.get("SPEC_YARD_E2E_CLIENT", "/tmp/specyard-e2e-client")
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-e2e-shots")
os.makedirs(SHOTS, exist_ok=True)

failures = []
def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)

def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=False)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ---------- Session 1: fresh browser, no spec file yet ----------
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)  # hydration + canvas settle

    ta = page.locator('[data-testid="spec-textarea"]')
    initial = ta.input_value()
    check("fresh mount loads built-in initial spec (no repo file yet)", "External Brain" in initial)
    check("no repo spec file before first edit", not os.path.exists(os.path.join(CLIENT_REPO, "main.spec.yaml")))
    shot(page, "01-fresh-mount")

    # Canvas rendered with nodes?
    canvas_content = page.locator("canvas").count()
    check("excalidraw canvas present", canvas_content > 0)

    # ---------- Edit YAML like a user ----------
    new_spec = """system:
  name: E2E Browser System
  components:
    - id: web_client
      type: Client
      name: Web Client
      connections:
        - target: api_gw
    - id: api_gw
      type: Gateway
      name: API Gateway
      connections:
        - target: orders_db
    - id: orders_db
      type: Store
      name: orders-db
"""
    ta.click()
    ta.fill(new_spec)
    time.sleep(2.5)  # autosave debounce is 1s

    spec_file = os.path.join(CLIENT_REPO, "main.spec.yaml")
    check("autosave wrote main.spec.yaml to client repo", os.path.exists(spec_file))
    if os.path.exists(spec_file):
        content = open(spec_file).read()
        check("repo file contains the user's edit", "E2E Browser System" in content and "orders_db" in content)
    idx_file = os.path.join(CLIENT_REPO, ".specyard", "spec-index.json")
    check("spec-index.json written with title", os.path.exists(idx_file) and json.load(open(idx_file))["main"]["title"] == "E2E Browser System")
    shot(page, "02-after-edit")

    # ---------- Linter: introduce an unknown connection target ----------
    ta.fill(new_spec.replace("- target: orders_db", "- target: nonexistent_db"))
    time.sleep(2)
    # diagnostics should surface somewhere in the editor panel
    body_text = page.locator("body").inner_text()
    check("linter flags unknown connection target", "nonexistent_db" in body_text)
    shot(page, "03-linter-diagnostic")
    # restore good spec
    ta.fill(new_spec)
    time.sleep(2.5)

    # ---------- Simulation via metrics tab ----------
    page.locator('#tab-metrics').click()
    time.sleep(1)
    try:
        # smallest preset (50 packets) so the run completes quickly
        page.locator('[data-testid="sim-preset-select"]').select_option("sanity")
        page.locator('select[aria-label="Trace Path Start"]').select_option("web_client")
        page.locator('select[aria-label="Trace Path End"]').select_option("orders_db")
        time.sleep(1)
        page.locator('button:has-text("Run Performance Simulation")').first.click()
        time.sleep(1)
        # max speed, then wait for the run to complete
        speed_btn = page.locator('[data-testid="sim-speed-btn-5x"]')
        if speed_btn.count() > 0:
            speed_btn.click()
        hist_file = os.path.join(CLIENT_REPO, ".specyard", "simulation_history.json")
        for _ in range(60):
            if os.path.exists(hist_file):
                break
            time.sleep(1)
        shot(page, "04-simulation")
        check("simulation history written to .specyard sidecar", os.path.exists(hist_file),
              "files in .specyard: " + str(os.listdir(os.path.join(CLIENT_REPO, ".specyard"))))
        if os.path.exists(hist_file):
            hist = json.load(open(hist_file))
            check("history contains the traced path run",
                  len(hist) > 0 and "web_client" in hist[0]["path"] and "orders_db" in hist[0]["path"])
    except Exception as e:
        check("simulation driven via UI", False, str(e))
    shot(page, "05-metrics-tab")

    check("no console/page errors in file-mode session", len(console_errors) == 0, "; ".join(console_errors[:5]))
    ctx.close()

    # ---------- Session 2: brand-new browser profile, must load from repo file ----------
    ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
    page2 = ctx2.new_page()
    page2.goto(BASE, wait_until="domcontentloaded")
    page2.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)
    loaded = page2.locator('[data-testid="spec-textarea"]').input_value()
    check("fresh browser loads spec FROM the client repo file", "E2E Browser System" in loaded and "orders_db" in loaded,
          loaded[:120])
    check("fresh browser does NOT fall back to built-in initial spec", "External Brain" not in loaded)
    shot(page2, "06-fresh-browser-loads-from-file")
    ctx2.close()

    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
