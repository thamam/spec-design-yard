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

    # --- Lanes A and B append their beats below this line ---
    # Lane A (editor ergonomics): Tab / Shift+Tab indent and outdent in the
    #   spec textarea (including multi-line selections), Enter auto-indenting
    #   to the YAML block's level, and a syntax-highlight overlay.
    # Lane B (canvas ergonomics): the diagnostics panel resize handle, and
    #   zoom-to-fit reachable three ways — a button in Excalidraw's own
    #   footer beside its zoom widget, the top-right toolbar button, and
    #   Shift+1.

    # ================= Lane B — canvas ergonomics =================
    # Beats for the resizable diagnostics panel and the three routes to
    # zoom-to-fit. jsdom cannot verify either one for real: it reports every
    # bounding rect as zero and never paints a canvas, so panel geometry and
    # viewport framing are only truly checkable here.

    NOISY_SPEC = """system:
  name: Canvas Ergonomics System
  components:
    - id: edge_gateway
      type: Gateway
      x: 80
      y: 80
      connections:
        - target: digest_stage
    - id: digest_stage
      type: Stage
      x: 380
      y: 80
      connections:
        - target: main_store
    - id: main_store
      type: Store
      x: 680
      y: 80
    - id: audit_stage
      type: Stage
      x: 380
      y: 300
    - id: cold_store
      type: Store
      x: 680
      y: 300
"""

    ta = page.locator('[data-testid="spec-textarea"]')
    ta.click()
    ta.fill(NOISY_SPEC)
    time.sleep(2.0)  # parse + lint + canvas sync

    issue_badge = page.locator(r'text=/\d+ issues/').first
    check("the seeded spec really does raise 5+ diagnostics",
          issue_badge.count() > 0 and int(issue_badge.inner_text().split()[0]) >= 5,
          issue_badge.inner_text() if issue_badge.count() > 0 else "no issue badge")

    # ---------- B1: dragging the diagnostics top border grows the panel ----------
    body = page.locator('[data-testid="diagnostics-body"]')
    handle = page.locator('[data-testid="diagnostics-resize-handle"]')
    check("the diagnostics panel exposes a resize handle", handle.count() == 1)
    check("the resize handle is a horizontal separator",
          handle.get_attribute("role") == "separator"
          and handle.get_attribute("aria-orientation") == "horizontal")

    def fully_inside(inner, outer):
        """True when `inner`'s box sits entirely within `outer`'s box."""
        if inner is None or outer is None:
            return False
        return (inner["y"] >= outer["y"] - 1
                and inner["y"] + inner["height"] <= outer["y"] + outer["height"] + 1)

    def visible_add_description_count():
        outer = body.bounding_box()
        buttons = page.get_by_role("button", name="Add Description")
        return sum(1 for i in range(buttons.count())
                   if fully_inside(buttons.nth(i).bounding_box(), outer))

    height_before = body.bounding_box()["height"]
    visible_before = visible_add_description_count()
    total_add_description = page.get_by_role("button", name="Add Description").count()
    check("the default panel height clips some ADD DESCRIPTION buttons out of view",
          total_add_description > 0 and visible_before < total_add_description,
          "visible=%s total=%s" % (visible_before, total_add_description))
    shot(page, "10-diagnostics-default-height")

    hb = handle.bounding_box()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
    page.mouse.down()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] - 320, steps=12)
    page.mouse.up()
    time.sleep(0.4)

    height_after = body.bounding_box()["height"]
    visible_after = visible_add_description_count()
    check("dragging the diagnostics top border upward grows the panel",
          height_after > height_before + 50,
          "before=%s after=%s" % (height_before, height_after))
    check("growing the panel brings clipped ADD DESCRIPTION buttons into view",
          visible_after > visible_before,
          "before=%s after=%s" % (visible_before, visible_after))
    shot(page, "11-diagnostics-resized")

    # A drag is not a click: the collapse toggle owns the whole header, so a
    # handle that lived inside it would collapse the panel on mouseup.
    check("a resize drag does not collapse the panel", body.count() == 1)
    check("the panel still reads as expanded after a drag",
          page.locator("text=Collapse").count() > 0)

    # The newly reachable action row is genuinely clickable.
    outer = body.bounding_box()
    buttons = page.get_by_role("button", name="Add Description")
    clickable = next((buttons.nth(i) for i in range(buttons.count())
                      if fully_inside(buttons.nth(i).bounding_box(), outer)), None)
    check("a previously clipped ADD DESCRIPTION button is now reachable", clickable is not None)
    if clickable is not None:
        clickable.click()
        time.sleep(1.5)
        check("clicking the revealed ADD DESCRIPTION button writes into the YAML",
              "description:" in ta.input_value())
    shot(page, "12-diagnostics-quick-fix-reachable")

    # ---------- B1: the collapse toggle still works ----------
    header = page.locator('[data-testid="diagnostics-header"]')
    header.click()
    time.sleep(0.3)
    check("clicking the header still collapses the panel",
          page.locator('[data-testid="diagnostics-body"]').count() == 0)
    header.click()
    time.sleep(0.3)
    reopened = page.locator('[data-testid="diagnostics-body"]').bounding_box()["height"]
    check("clicking the header again re-expands it at the dragged height",
          abs(reopened - height_after) < 2,
          "reopened=%s dragged=%s" % (reopened, height_after))
    shot(page, "13-diagnostics-collapse-roundtrip")

    # ---------- B2: three routes to one zoom-to-fit ----------
    def read_view():
        return page.evaluate("""() => {
            const api = window.excalidrawAPI
            if (!api) return null
            const s = api.getAppState()
            return { zoom: s.zoom.value, scrollX: s.scrollX, scrollY: s.scrollY }
        }""")

    def push_view_away():
        """Park the viewport somewhere a fit must visibly correct."""
        page.evaluate("""() => {
            window.excalidrawAPI.updateScene({
                appState: { zoom: { value: 0.22 }, scrollX: -2400, scrollY: -1800 },
            })
        }""")
        time.sleep(0.4)

    def finite(v):
        return isinstance(v, (int, float)) and v == v and v not in (float("inf"), float("-inf"))

    def check_finite_view(route, view):
        # The NaN-bounds bug presents as a silently blank canvas, never an
        # error: a missing `angle` makes Math.cos(undefined) NaN, poisons
        # getCommonBounds, and scrollToContent writes NaN into scroll/zoom.
        check("%s leaves zoom and scroll finite, not NaN" % route,
              view is not None and finite(view["zoom"]) and finite(view["scrollX"]) and finite(view["scrollY"]),
              str(view))

    check("the canvas API is reachable for the fit assertions", read_view() is not None)

    # Route 1 — the fit icon in Excalidraw's own footer, beside its zoom widget.
    footer_button = page.locator('[data-testid="canvas-footer-zoom-to-fit"]')
    check("a fit control sits in Excalidraw's own footer", footer_button.count() == 1)
    check("the footer fit control is reachable by its accessible name",
          page.get_by_role("button", name="Zoom to fit").count() >= 2)
    push_view_away()
    parked = read_view()
    footer_button.click()
    time.sleep(1.0)
    after_footer = read_view()
    check("the footer fit control changes the zoom",
          after_footer["zoom"] != parked["zoom"],
          "parked=%s after=%s" % (parked, after_footer))
    check_finite_view("the footer fit control", after_footer)
    shot(page, "14-zoom-to-fit-footer")

    # Route 2 — the top-right toolbar control, renamed from "Reset view".
    toolbar_button = page.locator('[data-testid="canvas-zoom-to-fit"]')
    check("the toolbar control is named Zoom to fit",
          toolbar_button.count() == 1 and toolbar_button.get_attribute("aria-label") == "Zoom to fit")
    check("the old Reset view label is gone",
          page.get_by_role("button", name="Reset view").count() == 0)
    push_view_away()
    parked = read_view()
    toolbar_button.click()
    time.sleep(1.0)
    after_toolbar = read_view()
    check("the toolbar fit control changes the zoom",
          after_toolbar["zoom"] != parked["zoom"],
          "parked=%s after=%s" % (parked, after_toolbar))
    check_finite_view("the toolbar fit control", after_toolbar)
    shot(page, "15-zoom-to-fit-toolbar")

    # Route 3 — Shift+1, WITH FOCUS ON THE CANVAS. Excalidraw binds Shift+1 to
    # its own zoomToFit and handles it after the target, so this is the one
    # arrangement that can catch it winning the race and fitting with its own
    # options. Blurring first — which this beat used to do — is precisely the
    # condition under which the bug cannot appear.
    push_view_away()
    # Left edge, vertically centred: clear of the top toolbar and the footer
    # widgets, and — with the view parked far off the content — clear of every
    # element too, so the click only moves focus.
    canvas_box = page.locator("canvas").first.bounding_box()
    page.mouse.click(canvas_box["x"] + 40, canvas_box["y"] + canvas_box["height"] / 2)
    time.sleep(0.3)
    # Excalidraw's own Shift+1 binding only fires for events targeted inside
    # its container, so this precondition IS the test.
    check("the click put focus inside the Excalidraw container",
          page.evaluate("() => !!(document.activeElement && document.activeElement.closest('.excalidraw'))"),
          page.evaluate("() => document.activeElement && document.activeElement.className"))
    parked = read_view()
    page.keyboard.press("Shift+Digit1")
    time.sleep(1.0)
    after_shortcut = read_view()
    check("Shift+1 changes the zoom with focus on the canvas",
          after_shortcut["zoom"] != parked["zoom"],
          "parked=%s after=%s" % (parked, after_shortcut))
    check_finite_view("the Shift+1 shortcut", after_shortcut)
    shot(page, "16-zoom-to-fit-shortcut")

    # All three routes must land on the same framing — one implementation.
    # Zoom alone is not enough: Excalidraw's own zoomToFit lands on a similar
    # scale but a different scroll, so the scroll has to match too.
    check("all three routes produce the same zoom",
          after_footer["zoom"] == after_toolbar["zoom"] == after_shortcut["zoom"],
          "footer=%s toolbar=%s shortcut=%s"
          % (after_footer["zoom"], after_toolbar["zoom"], after_shortcut["zoom"]))
    check("all three routes produce the same scroll position",
          after_footer == after_toolbar == after_shortcut,
          "footer=%s toolbar=%s shortcut=%s"
          % (after_footer, after_toolbar, after_shortcut))

    # Shift+1 must NOT inherit the spec-textarea pass-through that undo/redo
    # uses: `!` is a legal YAML character and typing it must not yank the view.
    # Park the view first: without this the beat runs straight after a fit, so
    # a leaked shortcut would re-fit to identical numbers and read as "did not
    # move" — a vacuous pass.
    push_view_away()
    before_typing = read_view()
    yaml_before = ta.input_value()
    ta.click()
    page.keyboard.press("End")
    page.keyboard.press("Shift+Digit1")
    time.sleep(1.0)
    after_typing = read_view()
    check("typing ! in the YAML pane inserts the character",
          ta.input_value() != yaml_before and "!" in ta.input_value())
    check("typing ! in the YAML pane does not move the canvas",
          after_typing == before_typing,
          "before=%s after=%s" % (before_typing, after_typing))
    check_finite_view("typing ! in the YAML pane", after_typing)
    shot(page, "17-shortcut-suppressed-in-yaml")

    # --- end of appended beats: this assertion must stay last, so that a
    # console error raised by any beat above still fails the scenario ---
    check("no console/page errors in the editor-ergonomics session",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
