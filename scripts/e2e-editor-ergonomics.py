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
    if os.path.exists(spec_file):
        content = open(spec_file).read()
        check(
            "Lane A's edited YAML lands in main.spec.yaml on disk",
            "Ergonomics Final" in content and "alpha" in content and "beta" in content,
        )
    shot(page, "09-editor-ergonomics-final-save")

    # --- end of appended beats: this assertion must stay last, so that a
    # console error raised by any beat above still fails the scenario ---
    check("no console/page errors in the editor-ergonomics session",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
