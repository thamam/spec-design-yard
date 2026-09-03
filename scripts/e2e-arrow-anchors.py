"""E2E browser test for arrow edge anchoring (port BASE_PORT + 5, 3114).

Backlog [2026-09-03]: "Arrows start and end at the shape's centre instead of
its edge." The fix pins each connection to the N/E/S/W edge midpoint facing
the other shape, via the Excalidraw binding's `fixedPoint` ratio. jsdom can
only check what the compiler emits; these beats run the real Excalidraw in a
real Chromium, where the claims have teeth:

  1. the compiled scene's arrows carry edge-port fixedPoints and their
     endpoints land exactly on the shape boundaries (not the centres);
  2. during a canvas drag the pinned port FOLLOWS the shape — Excalidraw
     itself re-derives the endpoint from `fixedPoint` (boundElements
     registry), before any of our writeback/recompile happens;
  3. after the drag's writeback and recompile, the ports are re-chosen for
     the new geometry (dominant axis) and the coordinates persist to
     main.spec.yaml.

Run it via `npm run test:e2e arrow-anchors` (which supplies an isolated
server via SPEC_YARD_PROJECT_DIR), or point SPEC_YARD_URL at a dev server
started with a throwaway SPEC_YARD_CONFIG_DIR / SPEC_YARD_PROJECT_DIR.

Safety: the drag beat autosaves new coordinates into whatever project folder
the server on BASE is serving, so this scenario refuses to run (exit 2)
unless that folder is the one named by SPEC_YARD_E2E_CLIENT and was seeded
by this harness.
"""
import os
import re
import sys
import time
from e2e_guard import (
    SEED_MARKER,
    require_project_dir,
    require_safe_to_seed,
)
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SPEC_YARD_URL", "http://localhost:3114")
CLIENT_REPO = os.environ.get("SPEC_YARD_E2E_CLIENT", "/tmp/specyard-arrow-anchors-client")
SHOTS = os.environ.get("SPEC_YARD_E2E_SHOTS", "/tmp/specyard-arrow-anchors-shots")
os.makedirs(SHOTS, exist_ok=True)

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        failures.append(name)


def shot(page, name):
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=False)


# Fail closed BEFORE anything is dragged: the drag beat autosaves coordinates
# into whatever folder the server on BASE is serving.
require_project_dir(BASE, CLIENT_REPO, scenario="arrow-anchors")

# `right` sits to the east of `left`; `below` sits under it, so the two
# compiled arrows cover both the horizontal (E->W) and vertical (S->N) port
# choices. Positions are far enough apart that no hit-test overlaps.
SPEC = (
    SEED_MARKER + "\n"
    "system:\n"
    "  name: Arrow Anchors System\n"
    "  components:\n"
    "    - id: left\n"
    "      type: Stage\n"
    "      x: 100\n"
    "      y: 100\n"
    "      connections:\n"
    "        - target: right\n"
    "        - target: below\n"
    "    - id: right\n"
    "      type: Store\n"
    "      x: 600\n"
    "      y: 100\n"
    "    - id: below\n"
    "      type: Stage\n"
    "      x: 140\n"
    "      y: 420\n"
)

os.makedirs(CLIENT_REPO, exist_ok=True)
require_safe_to_seed(CLIENT_REPO, scenario="arrow-anchors")
with open(os.path.join(CLIENT_REPO, "main.spec.yaml"), "w") as fh:
    fh.write(SPEC)

RECT_W, RECT_H = 190, 80


def arrow_endpoints(arrow):
    last = arrow["points"][-1]
    return (
        {"x": arrow["x"] + arrow["points"][0][0], "y": arrow["y"] + arrow["points"][0][1]},
        {"x": arrow["x"] + last[0], "y": arrow["y"] + last[1]},
    )


def approx(a, b, tol=1.0):
    return abs(a["x"] - b["x"]) <= tol and abs(a["y"] - b["y"]) <= tol


def fixed_point_close(fp, expected, tol=1e-3):
    return abs(fp[0] - expected[0]) <= tol and abs(fp[1] - expected[1]) <= tol


def on_boundary(p, rect):
    within_x = rect["x"] - 1 <= p["x"] <= rect["x"] + rect["width"] + 1
    within_y = rect["y"] - 1 <= p["y"] <= rect["y"] + rect["height"] + 1
    on_vertical = within_y and (
        abs(p["x"] - rect["x"]) <= 1 or abs(p["x"] - (rect["x"] + rect["width"])) <= 1
    )
    on_horizontal = within_x and (
        abs(p["y"] - rect["y"]) <= 1 or abs(p["y"] - (rect["y"] + rect["height"])) <= 1
    )
    return on_vertical or on_horizontal


def centre_dist(p, rect):
    return (
        (p["x"] - (rect["x"] + rect["width"] / 2)) ** 2
        + (p["y"] - (rect["y"] + rect["height"] / 2)) ** 2
    ) ** 0.5


def expected_ports(rect_a, rect_b):
    """Mirror of the compiler's facingPorts: dominant-axis edge midpoints."""
    dx = (rect_b["x"] + rect_b["width"] / 2) - (rect_a["x"] + rect_a["width"] / 2)
    dy = (rect_b["y"] + rect_b["height"] / 2) - (rect_a["y"] + rect_a["height"] / 2)
    if abs(dx) >= abs(dy):
        if dx >= 0:
            return ([1, 0.5], [0, 0.5])
        return ([0, 0.5], [1, 0.5])
    if dy >= 0:
        return ([0.5, 1], [0.5, 0])
    return ([0.5, 0], [0.5, 1])


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))

    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_selector('[data-testid="spec-textarea"]', timeout=20000)
    time.sleep(2)  # hydration + canvas settle

    def scene_element(eid):
        return page.evaluate(
            """(id) => window.excalidrawAPI.getSceneElements().find(
                   (e) => e.id === id && !e.isDeleted)""",
            eid,
        )

    def scene_rect(eid):
        el = scene_element(eid)
        return None if el is None else {
            "x": el["x"], "y": el["y"], "width": el["width"], "height": el["height"],
        }

    # ---------- Beat 1: the compiled scene anchors to edge ports ----------
    arrow_lr = scene_element("arrow-left-right")
    check("the horizontal arrow exists in the scene", arrow_lr is not None)
    arrow_lb = scene_element("arrow-left-below")
    check("the vertical arrow exists in the scene", arrow_lb is not None)

    if arrow_lr:
        check("left->right starts at the source's E port [1, 0.5]",
              fixed_point_close(arrow_lr["startBinding"]["fixedPoint"], [1, 0.5]),
              str(arrow_lr["startBinding"]))
        check("left->right ends at the target's W port [0, 0.5]",
              fixed_point_close(arrow_lr["endBinding"]["fixedPoint"], [0, 0.5]),
              str(arrow_lr["endBinding"]))
        start, end = arrow_endpoints(arrow_lr)
        check("left->right's start point is exactly left's right-edge midpoint",
              approx(start, {"x": 290, "y": 140}, 0.5), str(start))
        check("left->right's end point is exactly right's left-edge midpoint",
              approx(end, {"x": 600, "y": 140}, 0.5), str(end))

    if arrow_lb:
        check("left->below starts at the source's S port [0.5, 1]",
              fixed_point_close(arrow_lb["startBinding"]["fixedPoint"], [0.5, 1]),
              str(arrow_lb["startBinding"]))
        check("left->below ends at the target's N port [0.5, 0]",
              fixed_point_close(arrow_lb["endBinding"]["fixedPoint"], [0.5, 0]),
              str(arrow_lb["endBinding"]))
        start, end = arrow_endpoints(arrow_lb)
        check("left->below's start point is exactly left's bottom-edge midpoint",
              approx(start, {"x": 195, "y": 180}, 0.5), str(start))
        check("left->below's end point is exactly below's top-edge midpoint",
              approx(end, {"x": 235, "y": 420}, 0.5), str(end))

    # The boundary invariant — what the backlog item actually asks for —
    # checked against the live rects, not the seeded constants.
    for arrow_id, src_id, tgt_id in (
        ("arrow-left-right", "left", "right"),
        ("arrow-left-below", "left", "below"),
    ):
        arrow = scene_element(arrow_id)
        rect_src = scene_rect(src_id)
        rect_tgt = scene_rect(tgt_id)
        if not (arrow and rect_src and rect_tgt):
            continue
        start, end = arrow_endpoints(arrow)
        check("%s's start lands on the source boundary, not its centre" % arrow_id,
              on_boundary(start, rect_src) and centre_dist(start, rect_src) > 20,
              "start=%s rect=%s" % (start, rect_src))
        check("%s's end lands on the target boundary, not its centre" % arrow_id,
              on_boundary(end, rect_tgt) and centre_dist(end, rect_tgt) > 20,
              "end=%s rect=%s" % (end, rect_tgt))

    shot(page, "01-arrow-anchors-compiled")

    # ---------- Deterministic view + validated scene->screen transform ----------
    page.evaluate(
        """() => {
            const api = window.excalidrawAPI
            api.scrollToContent(api.getSceneElements(),
                                { fitToViewport: true, viewportZoomFactor: 0.85 })
        }"""
    )

    def read_view():
        return page.evaluate(
            """() => {
                const s = window.excalidrawAPI.getAppState()
                return [s.zoom.value, s.scrollX, s.scrollY]
            }"""
        )

    # An in-flight animated fit changes the transform BETWEEN two to_screen
    # calls, producing nonsense probe rects (observed: a box whose width
    # implied zoom 1.0 and height 0.625). Poll until the view holds still.
    settled = False
    for _ in range(40):
        first = read_view()
        time.sleep(0.3)
        second = read_view()
        if first == second:
            settled = True
            break
    check("the view settles after the explicit fit (no animation in flight)",
          settled, "last=%s" % str(second))

    def to_screen(scene_x, scene_y):
        # Excalidraw's own sceneCoordsToViewportCoords: viewport =
        # (scene + scroll) * zoom + appState.offsetLeft/Top. The canvas
        # element's bounding rect is NOT the offset source — using it
        # misplaces probes whenever the two disagree.
        return page.evaluate(
            """([x, y]) => {
                const s = window.excalidrawAPI.getAppState()
                return { x: (x + s.scrollX) * s.zoom.value + s.offsetLeft,
                         y: (y + s.scrollY) * s.zoom.value + s.offsetTop }
            }""",
            [scene_x, scene_y],
        )

    # The transform is the drag beat's foundation, so it is proven, not
    # assumed: clicking inside `right` (away from its label text) must select
    # exactly that rect.
    click_pt = to_screen(700, 115)
    page.mouse.click(click_pt["x"], click_pt["y"])
    time.sleep(0.4)
    selection = page.evaluate(
        "() => Object.keys(window.excalidrawAPI.getAppState().selectedElementIds)"
    )
    check("the scene->screen transform is validated by selecting `right` by click",
          selection == ["right"], str(selection))

    # ---------- Beat 2: dragging `right`; the port pin survives the gesture ----------
    # Drag to (345, 470): `right`'s new centre. That is below-left of `left`,
    # so the recompile must flip the ports from E/W to S/N afterwards.
    # Straight (non-elbow) arrows do not follow the shape live mid-gesture —
    # Excalidraw only re-derives those endpoints from focus/gap, which we do
    # not use. What must hold mid-gesture: the rect moved, the bindings keep
    # their pinned ports, and nothing is corrupted; the re-anchoring itself
    # is beat 3, after the writeback + recompile.
    grab = to_screen(740, 165)   # inside `right`, clear of the label text
    drop = to_screen(345, 470)
    page.mouse.move(grab["x"], grab["y"])
    page.mouse.down()
    page.mouse.move(drop["x"], drop["y"], steps=25)
    page.mouse.up()
    time.sleep(0.25)  # < the 450ms writeback debounce

    right_rect = scene_rect("right")
    arrow_lr = scene_element("arrow-left-right")
    if right_rect and arrow_lr:
        # The rect follows the mouse with the grab offset preserved: grabbed
        # at (740, 165) = rect + (140, 65), so dropping at (345, 470) lands
        # the rect at (345-140, 470-65) = (205, 405).
        moved = abs(right_rect["x"] - 205) <= 15 and abs(right_rect["y"] - 405) <= 15
        check("the drag really moved `right` to (205, 405) +/- grid snap",
              moved, str(right_rect))
        # The port pin itself is untouched by the gesture.
        check("mid-gesture, the arrow's end binding still pins the W port",
              fixed_point_close(arrow_lr["endBinding"]["fixedPoint"], [0, 0.5]),
              str(arrow_lr["endBinding"]))
        last = arrow_lr["points"][-1]
        check("mid-gesture, the arrow's geometry stays finite (no corruption)",
              all(map(lambda v: v == v and abs(v) != float("inf"),
                      [arrow_lr["x"], arrow_lr["y"], last[0], last[1]])))
    shot(page, "02-arrow-pinned-mid-drag")

    # ---------- Beat 3: after writeback + recompile, ports re-route ----------
    time.sleep(3.0)  # 450ms writeback + 1s autosave + recompile

    left_rect = scene_rect("left")
    right_rect = scene_rect("right")
    arrow_lr = scene_element("arrow-left-right")
    if left_rect and right_rect and arrow_lr:
        exp_start_fp, exp_end_fp = expected_ports(left_rect, right_rect)
        check("after the drag, left->right's ports are re-chosen for the new geometry",
              fixed_point_close(arrow_lr["startBinding"]["fixedPoint"], exp_start_fp)
              and fixed_point_close(arrow_lr["endBinding"]["fixedPoint"], exp_end_fp),
              "start=%s end=%s expected %s / %s" % (
                  arrow_lr["startBinding"]["fixedPoint"],
                  arrow_lr["endBinding"]["fixedPoint"], exp_start_fp, exp_end_fp))
        start, end = arrow_endpoints(arrow_lr)
        check("the re-routed arrow still lands on both shape boundaries",
              on_boundary(start, left_rect) and on_boundary(end, right_rect),
              "start=%s left=%s end=%s right=%s" % (start, left_rect, end, right_rect))
    arrow_lb = scene_element("arrow-left-below")
    if left_rect and arrow_lb:
        # `left` never moved; its arrow to `below` must be untouched.
        check("the untouched arrow kept its S->N ports",
              fixed_point_close(arrow_lb["startBinding"]["fixedPoint"], [0.5, 1])
              and fixed_point_close(arrow_lb["endBinding"]["fixedPoint"], [0.5, 0]),
              "%s / %s" % (arrow_lb["startBinding"]["fixedPoint"],
                           arrow_lb["endBinding"]["fixedPoint"]))

    spec_on_disk = open(os.path.join(CLIENT_REPO, "main.spec.yaml")).read()
    right_block = re.search(r"- id: right[\s\S]{0,400}", spec_on_disk)
    persisted = bool(
        right_block
        and re.search(r"x:\s*2[0-9]{2}", right_block.group(0))
        and re.search(r"y:\s*4[0-9]{2}", right_block.group(0))
    )
    check("the drag's coordinates persisted into main.spec.yaml", persisted,
          (right_block.group(0) if right_block else "no `right` block")[:200])
    shot(page, "03-arrow-rerouted-after-writeback")

    # --- must stay last: a console error from any beat fails the scenario ---
    check("no console/page errors in the arrow-anchors session",
          len(console_errors) == 0, "; ".join(console_errors[:5]))

    ctx.close()
    browser.close()

print("\n=== %d check(s) failed ===" % len(failures) if failures else "\n=== ALL CHECKS PASSED ===")
sys.exit(1 if failures else 0)
