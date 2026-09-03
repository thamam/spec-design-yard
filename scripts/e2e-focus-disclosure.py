"""E2E user-chair test for Focus progressive disclosure (port BASE_PORT + 4,
3113 by default).

Opens a throwaway project with a component that has dense metadata, lands
on Focus, and checks the default view is thin: name + type visible, owner /
latency / compiled spec hidden until their disclosures are opened.

Run it via `npm run test:e2e focus-disclosure` (isolated server + folder),
or point SPEC_YARD_URL at a dev server started with a throwaway
SPEC_YARD_CONFIG_DIR / SPEC_YARD_PROJECT_DIR.

Safety: this scenario types into the editor (and the server may autosave),
so it refuses to run unless BASE is serving THIS scenario's project folder.
"""
import os
import sys
import time
from e2e_guard import (
    SEED_MARKER,
    require_fresh_dir,
    require_project_dir,
    require_safe_to_seed,
)
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3113")
CLIENT_REPO = os.environ.get("SPEC_YARD_E2E_CLIENT", "/tmp/specyard-focus-disclosure-client")
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-focus-disclosure-shots")
os.makedirs(SHOTS, exist_ok=True)

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=False)


SPEC = (
    SEED_MARKER + "\n"
    "system:\n"
    "  name: Focus Disclosure System\n"
    "  metadata:\n"
    "    owner: architecture-team\n"
    "    version: 1.0.0\n"
    "    status: draft\n"
    "    description: Seeded for the focus-disclosure e2e.\n"
    "  components:\n"
    "    - id: inbox\n"
    "      type: Store\n"
    "      name: inbox/\n"
    "      metadata:\n"
    "        owner: tom\n"
    "        status: draft\n"
    "        color: indigo\n"
    "        version: 2.0.0\n"
    "        description: Incoming mailbox\n"
    "        latency: 40\n"
    "        throughput: 300\n"
    "      connections:\n"
    "        - target: digest_stage\n"
    "          label: ingest\n"
    "    - id: digest_stage\n"
    "      type: Stage\n"
    "      name: digest\n"
)

require_project_dir(BASE, CLIENT_REPO, scenario="focus-disclosure")
require_fresh_dir(CLIENT_REPO, scenario="focus-disclosure")
os.makedirs(CLIENT_REPO, exist_ok=True)
require_safe_to_seed(CLIENT_REPO, scenario="focus-disclosure")
with open(os.path.join(CLIENT_REPO, "main.spec.yaml"), "w", encoding="utf-8") as fh:
    fh.write(SPEC)

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
    for _ in range(40):
        if "Focus Disclosure System" in ta.input_value():
            break
        time.sleep(0.5)
    check("seeded spec loaded", "Focus Disclosure System" in ta.input_value(),
          ta.input_value()[:120])
    check("spec textarea is enabled after hydration", ta.is_enabled())

    page.get_by_role("tab", name="Metrics").click()
    page.locator("button").filter(has_text="inbox").filter(has_text="Store").first.click()
    page.wait_for_selector('[data-testid="focus-name-input"]', timeout=10000)
    shot(page, "01-focus-default")

    check("display name is visible without expanding",
          page.locator('[data-testid="focus-name-input"]').is_visible())
    check("component type is visible without expanding",
          page.locator('[data-testid="focus-type-select"]').is_visible())
    check("outgoing chip shows the count",
          page.get_by_role("button", name="1 outgoing").count() == 1)
    check("incoming chip shows the count",
          page.get_by_role("button", name="0 incoming").count() == 1)

    check("owner is not on the default view",
          page.locator('[data-testid="focus-owner-input"]').count() == 0)
    check("latency is not on the default view",
          page.locator('[data-testid="focus-latency-input"]').count() == 0)
    check("throughput is not on the default view",
          page.locator('[data-testid="focus-throughput-input"]').count() == 0)
    check("version is not on the default view",
          page.locator('[data-testid="focus-version-input"]').count() == 0)
    check("description is not on the default view",
          page.locator('[data-testid="focus-description-textarea"]').count() == 0)
    check("ID rename is not a primary field",
          page.locator('[data-testid="focus-id-input"]').count() == 0)
    check("compiled spec dump is absent by default",
          page.locator('[data-testid="focus-compiled-spec"]').count() == 0)

    details = page.get_by_role("button", name="Details")
    check("Details is a real button", details.count() == 1)
    check("Details starts collapsed", details.get_attribute("aria-expanded") == "false")
    details.click()
    page.wait_for_selector('[data-testid="focus-owner-input"]', timeout=5000)
    shot(page, "02-focus-details-open")

    check("owner appears after Details is opened",
          page.locator('[data-testid="focus-owner-input"]').is_visible())
    check("latency appears after Details is opened",
          page.locator('[data-testid="focus-latency-input"]').is_visible())
    check("ID rename is one click away in Details",
          page.locator('[data-testid="focus-id-input"]').is_visible())
    check("Details reports expanded", details.get_attribute("aria-expanded") == "true")

    compiled = page.get_by_role("button", name="Show compiled spec")
    check("compiled-spec disclosure is a real button", compiled.count() == 1)
    check("compiled-spec starts collapsed", compiled.get_attribute("aria-expanded") == "false")
    compiled.click()
    page.wait_for_selector('[data-testid="focus-compiled-spec"]', timeout=5000)
    dump = page.locator('[data-testid="focus-compiled-spec"]').inner_text()
    check("compiled spec appears after the disclosure is opened", "inbox" in dump)
    shot(page, "03-focus-compiled-open")

    check("duplicate stays in the header",
          page.locator('[data-testid="focus-duplicate-btn"]').is_visible())

    check("no page or console errors", console_errors == [],
          "; ".join(console_errors[:5]))

    browser.close()

if failures:
    print(f"\n{len(failures)} check(s) failed: {failures}")
    sys.exit(1)
print("\nfocus-disclosure e2e passed")
