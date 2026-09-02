"""E2E user-chair test for the project-first first-run flow (port 3110).

Covers what e2e-file-mode.py cannot: a server launched with NO
SPEC_YARD_PROJECT_DIR and an empty registry. Drives a real browser through
the whole GUI story — first-run prompt, create-a-project, edit, switch to a
second project, and the browser-storage opt-out — asserting on both the UI
and the files that land on disk.

Run the server it talks to like this (config dir MUST be a throwaway, or the
run overwrites your real ~/.specyard registry):

    SPEC_YARD_CONFIG_DIR=/tmp/specyard-firstrun-config npx next dev -p 3110

Screenshots land in /tmp/specyard-firstrun-shots/.

Safety: this scenario mutates server-side configuration, so it refuses to run
(exit 2) unless SPEC_YARD_E2E_CONFIG_WRITES_OK=1 is set. `npm run test:e2e`
sets it, having started the server on a throwaway SPEC_YARD_CONFIG_DIR;
nothing else should.
"""
import os
import sys
import time
from e2e_guard import require_config_writes_allowed, require_mode
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3110")
# realpath: macOS /tmp is a symlink to /private/tmp, and the project API
# reports the resolved path back to the picker.
PROJECT_A = os.path.realpath(os.environ.get("SPEC_YARD_E2E_A", "/tmp/specyard-firstrun-a"))
PROJECT_B = os.path.realpath(os.environ.get("SPEC_YARD_E2E_B", "/tmp/specyard-firstrun-b"))
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-firstrun-shots")
os.makedirs(SHOTS, exist_ok=True)

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=False)


def badge_text(page):
    return page.locator('[data-testid="project-picker-badge"]').inner_text()


def wait_for_badge(page, expected, timeout=20):
    """A successful switch reloads the page; poll the badge until it settles."""
    for _ in range(timeout * 2):
        try:
            if expected.lower() in badge_text(page).lower():
                return True
        except Exception:
            pass  # mid-reload the node is detached
        time.sleep(0.5)
    return False


def spec_text(page):
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    return page.locator('[data-testid="spec-textarea"]').input_value()


# Two guards. Mode alone is not enough: this scenario writes config.json,
# recentProjects and autosaves into folders it creates, and a real install that
# has simply never been configured also answers "unconfigured". The harness
# opt-in is the only honest signal that the config dir is throwaway.
require_config_writes_allowed(scenario="first-run")
require_mode(BASE, "unconfigured", scenario="first-run")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    # ---------- First run: nothing configured anywhere ----------
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)

    check("first run badge invites choosing a project", "choose project" in badge_text(page).lower(),
          badge_text(page))
    panel = page.locator('[data-testid="project-picker-panel"]')
    check("first run opens the picker without being asked", panel.count() > 0)

    dir_input = page.locator('[data-testid="project-dir-input"]')
    prefill = dir_input.input_value() if dir_input.count() > 0 else ""
    check("a suggested folder is prefilled", "spec-yard-projects" in prefill, prefill)

    # The whole point of project-first: an untouched install must not open the
    # built-in demo (and its wall of diagnostics) behind the picker.
    first_view = spec_text(page)
    check("first run does not open the demo spec", "External Brain" not in first_view, first_view[:120])
    check("first run opens a calm blank slate", "New System" in first_view, first_view[:120])
    status = page.locator('[data-testid="sync-status"]').inner_text()
    check("status bar says no project is chosen yet", "no project" in status.lower(), status)
    # The suggestion points into the user's home; nothing may be created on
    # disk until they actually click.
    check("the suggested folder is not created before the user acts",
          not os.path.exists(prefill))
    shot(page, "01-first-run-prompt")

    # ---------- Create a project from the GUI ----------
    check("project A does not exist before the GUI creates it", not os.path.exists(PROJECT_A))
    dir_input.fill(PROJECT_A)
    create_btn = page.locator('[data-testid="project-switch-button"]')
    check("the first-run action reads as creating a project", "create" in create_btn.inner_text().lower(),
          create_btn.inner_text())
    create_btn.click()

    check("badge switches to the created project folder",
          wait_for_badge(page, os.path.basename(PROJECT_A)), badge_text(page))
    check("the GUI created the project directory on disk", os.path.isdir(PROJECT_A))
    shot(page, "02-project-created")

    opened = spec_text(page)
    check("a newly created project opens the labeled blank spec",
          "New System" in opened and "# New project" in opened, opened[:120])
    check("no demo spec in a newly created project", "External Brain" not in opened)
    check("nothing is written before the first edit",
          not os.path.exists(os.path.join(PROJECT_A, "main.spec.yaml")))

    # ---------- Edit: the file lands in the chosen folder ----------
    spec_a = """system:
  name: Project A System
  components:
    - id: a_store
      type: Store
      name: a-store
"""
    ta = page.locator('[data-testid="spec-textarea"]')
    ta.click()
    ta.fill(spec_a)
    time.sleep(2.5)  # autosave debounce is 1s
    a_file = os.path.join(PROJECT_A, "main.spec.yaml")
    check("the edit autosaves into the chosen project", os.path.exists(a_file))
    if os.path.exists(a_file):
        check("project A file holds the user's spec", "Project A System" in open(a_file).read())
    shot(page, "03-project-a-edited")

    # ---------- Switch to a second project ----------
    os.makedirs(PROJECT_B, exist_ok=True)
    page.locator('[data-testid="project-picker-badge"]').click()
    time.sleep(0.5)
    page.locator('[data-testid="project-dir-input"]').fill(PROJECT_B)
    switch_btn = page.locator('[data-testid="project-switch-button"]')
    check("switching an existing project reads as a switch", "switch" in switch_btn.inner_text().lower(),
          switch_btn.inner_text())
    switch_btn.click()

    check("badge follows the switch to project B",
          wait_for_badge(page, os.path.basename(PROJECT_B)), badge_text(page))
    switched = spec_text(page)
    # The bleed guard: project A's cached spec must never surface in — or be
    # written into — project B.
    check("project B opens blank, not project A's spec", "Project A System" not in switched, switched[:120])
    check("project B opens the labeled blank spec", "New System" in switched, switched[:120])
    time.sleep(2.5)
    check("switching alone writes nothing into project B",
          not os.path.exists(os.path.join(PROJECT_B, "main.spec.yaml")))
    check("project A's file is left untouched by the switch",
          os.path.exists(a_file) and "Project A System" in open(a_file).read())
    shot(page, "04-switched-to-b")

    # ---------- The de-emphasized opt-out still works ----------
    page.locator('[data-testid="project-picker-badge"]').click()
    time.sleep(0.5)
    standalone_btn = page.locator('[data-testid="project-standalone-button"]')
    check("browser-storage opt-out is offered", standalone_btn.count() > 0)
    standalone_btn.click()
    check("badge reports browser storage after opting out",
          wait_for_badge(page, "browser storage"), badge_text(page))
    shot(page, "05-standalone-opt-out")

    check("no console/page errors across the whole first-run flow",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
