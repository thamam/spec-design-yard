"""E2E user-chair test for the editor-and-canvas-ergonomics change (port 3112).

Foundation-lane extension point: none of the five backlog features exist yet
at the time this scenario was written, so it asserts only what is genuinely
true today — the harness, the mount, and the textarea's basic write path —
and leaves the ergonomics-specific beats (keyboard nav, overlay, diagnostics
resize, zoom-to-fit) for the lanes that build them. See the marked section at
the end.

Run it via `npm run test:e2e editor-ergonomics` (which supplies an isolated
server via SPEC_YARD_PROJECT_DIR), or point SPEC_YARD_URL at a dev server
started with a throwaway SPEC_YARD_CONFIG_DIR / SPEC_YARD_PROJECT_DIR.
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3112")
CLIENT_REPO = os.environ.get("SPEC_YARD_E2E_CLIENT", "/tmp/specyard-editor-ergonomics-client")
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-editor-ergonomics-shots")
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
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ---------- The workspace mounts ----------
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)  # hydration + canvas settle

    ta = page.locator('[data-testid="spec-textarea"]')
    check("spec textarea is present after hydration", ta.count() > 0)
    check("spec textarea is enabled after hydration", ta.is_enabled())

    canvas_count = page.locator("canvas").count()
    check("excalidraw canvas mounts alongside the editor", canvas_count > 0)
    shot(page, "01-editor-ergonomics-mounted")

    # ---------- Typing YAML lands on disk ----------
    spec_text = """system:
  name: Editor Ergonomics System
  components:
    - id: gate
      type: Gateway
      name: gate
"""
    ta.click()
    ta.fill(spec_text)
    time.sleep(2.5)  # autosave debounce is 1s

    spec_file = os.path.join(CLIENT_REPO, "main.spec.yaml")
    check("the edit autosaves main.spec.yaml to the project", os.path.exists(spec_file))
    if os.path.exists(spec_file):
        content = open(spec_file).read()
        check("main.spec.yaml holds the typed spec", "Editor Ergonomics System" in content and "gate" in content)
    shot(page, "02-editor-ergonomics-typed")

    check("no console/page errors in the editor-ergonomics session",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    # --- Lanes A and B append their beats below this line ---
    # Lane A (editor ergonomics): Tab / Shift+Tab indent and outdent in the
    #   spec textarea (including multi-line selections), Enter auto-indenting
    #   to the YAML block's level, and a syntax-highlight overlay.
    # Lane B (canvas ergonomics): the diagnostics panel resize handle, and
    #   zoom-to-fit reachable three ways — a button in Excalidraw's own
    #   footer beside its zoom widget, the top-right toolbar button, and
    #   Shift+1.

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
