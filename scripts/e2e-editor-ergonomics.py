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
# The second project the canvas beats switch INTO. realpath because the project
# API reports the resolved path back to the picker badge (macOS /tmp symlink).
CLIENT_REPO_B = os.path.realpath(
    os.environ.get("SPEC_YARD_E2E_CLIENT_B", "/tmp/specyard-editor-ergonomics-client-b")
)
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

    # ---------- Seed a CRLF project file, before any session exists ----------
    # The one claim jsdom cannot make honestly: real CRLF bytes, the real
    # server, a real browser. It must be in place BEFORE the first load —
    # writing it behind a live session's back trips the app's
    # external-change guard (a 409 and a refusal to overwrite, which is
    # correct behaviour and not what this beat is testing).
    os.makedirs(CLIENT_REPO, exist_ok=True)
    crlf_spec_file = os.path.join(CLIENT_REPO, "main.spec.yaml")
    with open(crlf_spec_file, "w", newline="") as fh:
        fh.write(
            "system:\r\n"
            "  name: CRLF Project\r\n"
            "  components:\r\n"
            "    - id: crlf_node\r\n"
            "      type: Stage\r\n"
        )
    check("the CRLF fixture really is CRLF on disk",
          b"\r\n" in open(crlf_spec_file, "rb").read())

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

    # ---------- The CRLF file normalises to LF on load ----------
    for _ in range(40):
        if "CRLF Project" in ta.input_value():
            break
        time.sleep(0.5)
    check("the CRLF project file loaded", "CRLF Project" in ta.input_value(),
          ta.input_value()[:120])

    # Caret at the end of the last line, then Tab — the round-1 blocker's
    # exact gesture. Under the old mixed coordinates the indent landed inside
    # the line and the file kept its CRLF.
    ta.click()
    page.keyboard.press("Control+End")
    page.keyboard.press("ArrowUp")  # the file ends in a newline; step back onto
    page.keyboard.press("End")      # the last CONTENT line, not the empty one
    page.keyboard.press("Tab")
    time.sleep(2.5)  # autosave debounce is 1s

    on_disk = open(crlf_spec_file, "rb").read()
    check("a CRLF spec is rewritten LF-only once the app saves it",
          b"\r" not in on_disk, repr(on_disk[:120]))
    check("Tab indented at the end of the line, not inside it",
          b"      type: Stage  \n" in on_disk, repr(on_disk[-60:]))
    shot(page, "01b-editor-ergonomics-crlf-normalized")

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
    #   footer strip, the top-right toolbar button, and
    #   Shift+1.

    # ---------- Lane A: Tab inserts, focus stays in the textarea ----------
    ta.fill("system:\n  name: X")
    ta.press("End")
    page.keyboard.press("Tab")
    val = ta.input_value()
    check("Tab inserts a 2-space indent at the caret", val == "system:\n  name: X  ")
    active_after_tab = page.evaluate("document.activeElement && document.activeElement.getAttribute('data-testid')")
    check("focus stays in the spec textarea after Tab", active_after_tab == "spec-textarea")
    shot(page, "03-editor-ergonomics-tab-indent")

    # ---------- Lane A: Shift+Tab outdents ----------
    ta.fill("system:\n  name: X")
    ta.press("End")
    page.keyboard.press("Shift+Tab")
    val = ta.input_value()
    check("Shift+Tab outdents the current line", val == "system:\nname: X")
    shot(page, "04-editor-ergonomics-shift-tab-outdent")

    # ---------- Lane A: a multi-line selection indents every selected line ----------
    ta.fill("aaa\nbbb\nccc")
    page.evaluate(
        """() => {
          const el = document.querySelector('[data-testid="spec-textarea"]');
          el.focus();
          el.setSelectionRange(0, el.value.length);
        }"""
    )
    page.keyboard.press("Tab")
    val = ta.input_value()
    check("Tab over a multi-line selection indents every selected line", val == "  aaa\n  bbb\n  ccc")
    shot(page, "05-editor-ergonomics-multiline-indent")

    # ---------- Lane A: Enter lands at the block's indent ----------
    ta.fill("system:\n  metadata:")
    ta.press("End")
    page.keyboard.press("Enter")
    val = ta.input_value()
    check("Enter after a block-opening line indents one level deeper", val == "system:\n  metadata:\n    ")
    shot(page, "06-editor-ergonomics-enter-indent")

    # ---------- Lane A: Esc then Tab still escapes the textarea ----------
    ta.fill("system:\n  name: X")
    ta.press("End")
    page.keyboard.press("Escape")
    page.keyboard.press("Tab")
    active_after_escape_tab = page.evaluate("document.activeElement && document.activeElement.getAttribute('data-testid')")
    check("Esc then Tab moves focus out of the textarea", active_after_escape_tab != "spec-textarea")
    shot(page, "07-editor-ergonomics-esc-tab-escape")

    # ---------- Lane A: the overlay's scrollTop tracks the textarea's ----------
    long_spec = "system:\n  components:\n" + "".join(
        f"    - id: c{i}\n      type: Stage\n" for i in range(80)
    )
    ta.fill(long_spec)
    page.evaluate(
        """() => {
          const el = document.querySelector('[data-testid="spec-textarea"]');
          el.scrollTop = 200;
          el.dispatchEvent(new Event('scroll'));
        }"""
    )
    time.sleep(0.2)
    textarea_scroll_top = page.evaluate("document.querySelector('[data-testid=\"spec-textarea\"]').scrollTop")
    overlay_scroll_top = page.evaluate("document.querySelector('[data-testid=\"yaml-highlight-overlay\"]').scrollTop")
    check(
        "the overlay's scrollTop tracks the textarea's after scrolling a long spec",
        textarea_scroll_top > 0 and overlay_scroll_top == textarea_scroll_top,
        f"textarea={textarea_scroll_top} overlay={overlay_scroll_top}",
    )
    shot(page, "08-editor-ergonomics-overlay-scroll-sync")

    # ---------- Lane A: typing while scrolled keeps the overlay aligned and colours the new text ----------
    page.evaluate(
        """() => {
          const el = document.querySelector('[data-testid="spec-textarea"]');
          el.focus();
          const pos = el.value.length;
          el.setSelectionRange(pos, pos);
        }"""
    )
    page.keyboard.type("\n    - id: scrolledtype\n      type: Stage\n")
    time.sleep(0.2)
    scroll_after_type = page.evaluate(
        """() => {
          const ta = document.querySelector('[data-testid="spec-textarea"]');
          const overlay = document.querySelector('[data-testid="yaml-highlight-overlay"]');
          return { textarea: ta.scrollTop, overlay: overlay.scrollTop };
        }"""
    )
    check(
        "the overlay stays scroll-aligned with the textarea after typing while scrolled",
        scroll_after_type["textarea"] == scroll_after_type["overlay"],
        str(scroll_after_type),
    )
    typed_span_color = page.evaluate(
        """() => {
          const overlay = document.querySelector('[data-testid="yaml-highlight-overlay"]');
          const spans = Array.from(overlay.querySelectorAll('span'));
          const span = spans.find((s) => s.textContent === 'scrolledtype');
          return span ? getComputedStyle(span).color : null;
        }"""
    )
    body_color_after_type = page.evaluate(
        "getComputedStyle(document.querySelector('[data-testid=\"yaml-highlight-overlay\"]')).color"
    )
    check(
        "the newly typed id is coloured while the view is scrolled, not left plain",
        typed_span_color is not None and typed_span_color != body_color_after_type,
        f"typed={typed_span_color} body={body_color_after_type}",
    )
    shot(page, "08a-editor-ergonomics-scroll-then-type")

    # ---------- Lane A: the overlay actually colours tokens, and stays pixel-aligned ----------
    # Scroll-sync (above) would still pass if every token rendered the same
    # colour, or if the overlay's padding drifted a few pixels off the
    # textarea's. These beats assert the things a human eye would catch first.
    color_spec = """system:
  components:
    - id: alpha
      connections:
        - target: beta
      metadata:
        status: active
"""
    ta.fill(color_spec)
    time.sleep(0.2)

    def span_color(text):
        return page.evaluate(
            """(text) => {
              const overlay = document.querySelector('[data-testid="yaml-highlight-overlay"]');
              const spans = Array.from(overlay.querySelectorAll('span'));
              const span = spans.find((s) => s.textContent === text);
              return span ? getComputedStyle(span).color : null;
            }""",
            text,
        )

    id_color = span_color("alpha")
    target_color = span_color("beta")
    key_color = span_color("status")
    body_color = page.evaluate(
        "getComputedStyle(document.querySelector('[data-testid=\"yaml-highlight-overlay\"]')).color"
    )
    colors = [id_color, target_color, key_color]
    check(
        "component-id, connection-target, and metadata-key spans each render a distinct colour, none matching plain body text",
        None not in colors and len(set(colors)) == 3 and body_color not in colors,
        f"id={id_color} target={target_color} key={key_color} body={body_color}",
    )

    alignment = page.evaluate(
        """() => {
          const textarea = document.querySelector('[data-testid="spec-textarea"]');
          const overlay = document.querySelector('[data-testid="yaml-highlight-overlay"]');
          const tRect = textarea.getBoundingClientRect();
          const oRect = overlay.getBoundingClientRect();
          const tStyle = getComputedStyle(textarea);
          const oStyle = getComputedStyle(overlay);
          return {
            left: [tRect.left, oRect.left],
            top: [tRect.top, oRect.top],
            width: [tRect.width, oRect.width],
            font: [tStyle.font, oStyle.font],
            lineHeight: [tStyle.lineHeight, oStyle.lineHeight],
            paddingLeft: [tStyle.paddingLeft, oStyle.paddingLeft],
            paddingTop: [tStyle.paddingTop, oStyle.paddingTop],
          };
        }"""
    )
    check(
        "the overlay's box geometry (left/top/width) matches the textarea's",
        alignment["left"][0] == alignment["left"][1]
        and alignment["top"][0] == alignment["top"][1]
        and alignment["width"][0] == alignment["width"][1],
        str(alignment),
    )
    check(
        "the overlay's font, line-height, and padding match the textarea's exactly",
        alignment["font"][0] == alignment["font"][1]
        and alignment["lineHeight"][0] == alignment["lineHeight"][1]
        and alignment["paddingLeft"][0] == alignment["paddingLeft"][1]
        and alignment["paddingTop"][0] == alignment["paddingTop"][1],
        str(alignment),
    )
    shot(page, "08b-editor-ergonomics-overlay-color-alignment")

    # ---------- Lane A: the edited YAML lands in main.spec.yaml on disk ----------
    final_spec = """system:
  name: Ergonomics Final
  components:
    - id: alpha
      type: Store
      connections:
        - target: beta
      metadata:
        status: active
    - id: beta
      type: Stage
"""
    ta.fill(final_spec)
    time.sleep(2.5)  # autosave debounce
    # Existence is asserted unconditionally: guarding the whole check on
    # os.path.exists meant a vanished file failed nothing at all.
    spec_file_exists = os.path.exists(spec_file)
    check("main.spec.yaml still exists after the edit", spec_file_exists, spec_file)
    content = open(spec_file).read() if spec_file_exists else ""
    check(
        "Lane A's edited YAML lands in main.spec.yaml on disk",
        "Ergonomics Final" in content and "alpha" in content and "beta" in content,
        repr(content[:200]),
    )
    shot(page, "09-editor-ergonomics-final-save")
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

    # Each ADD DESCRIPTION button is named by its own diagnostic row's text —
    # the message plus the `system.components[n]` path badge. That name is what
    # lets the post-resize assertion point at the SAME button that was clipped
    # before the drag, instead of whichever one happens to be visible.
    ROW_NAME_JS = """el => {
        let n = el
        while (n && n.parentElement) {
            if (n.parentElement.getAttribute('data-testid') === 'diagnostics-body') {
                return n.innerText.replace(/\\s+/g, ' ').trim()
            }
            n = n.parentElement
        }
        return ''
    }"""

    def add_description_rows():
        """[(row name, is fully visible)] for every ADD DESCRIPTION button."""
        outer = body.bounding_box()
        buttons = page.get_by_role("button", name="Add Description")
        return [
            (buttons.nth(i).evaluate(ROW_NAME_JS),
             fully_inside(buttons.nth(i).bounding_box(), outer))
            for i in range(buttons.count())
        ]

    height_before = body.bounding_box()["height"]
    rows_before = add_description_rows()
    # THE recorded set: the buttons a user genuinely cannot reach right now.
    # Without it, "click the first visible button" passes on a button that was
    # never clipped, and a regression where the revealed rows stay unclickable
    # goes unnoticed.
    clipped_names = {name for name, visible in rows_before if not visible}
    visible_before = sum(1 for _, visible in rows_before if visible)
    check("the default panel height clips some ADD DESCRIPTION buttons out of view",
          len(rows_before) > 0 and len(clipped_names) > 0,
          "clipped=%s total=%s" % (len(clipped_names), len(rows_before)))
    print("       recorded %d of %d ADD DESCRIPTION buttons as clipped at the default height"
          % (len(clipped_names), len(rows_before)))
    shot(page, "10-diagnostics-default-height")

    hb = handle.bounding_box()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
    page.mouse.down()
    page.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] - 320, steps=12)
    page.mouse.up()
    time.sleep(0.4)

    height_after = body.bounding_box()["height"]
    rows_after = add_description_rows()
    visible_after = sum(1 for _, visible in rows_after if visible)
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

    # The newly reachable action row is genuinely clickable — and it has to be
    # one of the rows recorded as clipped BEFORE the drag, named here so the
    # assertion cannot quietly fall back to a button that was visible all along.
    revealed = [name for name, visible in rows_after if visible and name in clipped_names]
    check("a button recorded as clipped before the drag is now inside the panel body",
          len(revealed) > 0,
          "clipped_before=%d revealed=%d" % (len(clipped_names), len(revealed)))
    print("       %d of the %d recorded-clipped buttons are inside the panel after the drag"
          % (len(revealed), len(clipped_names)))
    if revealed:
        target_name = revealed[0]
        target_index = next(i for i, (name, _) in enumerate(rows_after) if name == target_name)
        target = page.get_by_role("button", name="Add Description").nth(target_index)
        yaml_before_fix = ta.input_value()
        target.click()
        time.sleep(1.5)
        check("clicking the previously clipped ADD DESCRIPTION button writes into the YAML "
              "(row: %s)" % target_name[:60],
              ta.input_value() != yaml_before_fix and "description:" in ta.input_value(),
              "row=%s" % target_name)
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

    # Route 1 — the fit icon in Excalidraw's own footer strip (.footer-center,
    # the public Footer export's region — see design Decision 7).
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

    # ---------- B3: switching projects re-frames the canvas ----------
    # SCOPE, stated plainly: this beat covers the RELOADED path only. Switching
    # projects calls window.location.reload() (project-picker.tsx), so the
    # canvas remounts and does its ordinary initial fit. That fit does not
    # depend on the `spec-${loadedSpecId}` wiring — delete the wiring and this
    # beat still passes. It is kept because the reloaded path is the one real
    # users take, and because no unit test drives the picker, the reload, and
    # the re-hydration end to end.
    #
    # The same-mount case — an identity changing under an already-mounted
    # canvas, which IS what the wiring buys — is covered at unit level in
    # tests/canvas-zoom-to-fit.test.tsx ("a newly loaded spec re-fits; an edit
    # to the same spec does not", "a fit scheduled for the previous identity
    # does not resurrect it").
    #
    # Project B's content sits far from project A's, so a viewport left on A's
    # framing cannot accidentally be framing B's.
    SPEC_B = """system:
  name: Project B System
  components:
    - id: far_gateway
      type: Gateway
      name: far-gateway
      x: 4200
      y: 3100
      connections:
        - target: far_store
    - id: far_store
      type: Store
      name: far-store
      x: 4600
      y: 3400
"""
    os.makedirs(CLIENT_REPO_B, exist_ok=True)
    with open(os.path.join(CLIENT_REPO_B, "main.spec.yaml"), "w") as fh:
        fh.write(SPEC_B)

    # Pan project A's canvas somewhere a fit must visibly correct, and remember
    # where — the switch must not leave the user looking at this.
    push_view_away()
    parked_in_a = read_view()

    page.locator('[data-testid="project-picker-badge"]').click()
    time.sleep(0.5)
    page.locator('[data-testid="project-dir-input"]').fill(CLIENT_REPO_B)
    switch_btn = page.locator('[data-testid="project-switch-button"]')
    check("the picker offers a switch to the second project",
          switch_btn.count() == 1 and "switch" in switch_btn.inner_text().lower(),
          switch_btn.inner_text() if switch_btn.count() else "no switch button")
    switch_btn.click()

    # A successful switch reloads the page; poll the badge until it settles.
    switched = False
    for _ in range(40):
        try:
            if os.path.basename(CLIENT_REPO_B).lower() in page.locator(
                    '[data-testid="project-picker-badge"]').inner_text().lower():
                switched = True
                break
        except Exception:
            pass  # mid-reload the node is detached
        time.sleep(0.5)
    check("the badge follows the switch into project B", switched)

    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    ta = page.locator('[data-testid="spec-textarea"]')
    for _ in range(40):
        if "Project B System" in ta.input_value():
            break
        time.sleep(0.5)
    check("project B's spec is what loaded", "Project B System" in ta.input_value(),
          ta.input_value()[:120])
    time.sleep(2.0)  # canvas mount + the 300ms automatic fit

    after_switch = read_view()
    check("the canvas API is reachable again after the switch", after_switch is not None)
    check("the switch did not leave the viewport parked where project A was",
          after_switch != parked_in_a,
          "parked=%s after=%s" % (parked_in_a, after_switch))
    check_finite_view("the project switch", after_switch)

    # The teeth: an explicit fit of project B's content must be a no-op,
    # because the load already framed it. If the identity never advanced on
    # load, the automatic fit framed project A's spec (or never ran) and this
    # click moves the viewport.
    page.locator('[data-testid="canvas-zoom-to-fit"]').click()
    time.sleep(1.0)
    after_explicit_fit = read_view()

    def same_view(a, b):
        if a is None or b is None:
            return False
        return (abs(a["zoom"] - b["zoom"]) < 1e-6
                and abs(a["scrollX"] - b["scrollX"]) < 0.5
                and abs(a["scrollY"] - b["scrollY"]) < 0.5)

    check("loading project B already framed it — an explicit fit changes nothing",
          same_view(after_switch, after_explicit_fit),
          "on-load=%s explicit-fit=%s" % (after_switch, after_explicit_fit))
    shot(page, "18-project-switch-refit")

    # --- end of appended beats: this assertion must stay last, so that a
    # console error raised by any beat above still fails the scenario ---
    check("no console/page errors in the editor-ergonomics session",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
