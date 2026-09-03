"""Fail-closed preflight for the browser e2e scenarios.

Every scenario types into the editor and waits for autosave, which writes
`main.spec.yaml` in whatever project folder the server on BASE is serving. Run
by hand against the wrong server — a real project, or the maintainer's dev
server — that write lands on real work, and the scenario's own checks only
record failures without stopping.

`npm run test:e2e` supplies a throwaway server and folder, but nothing
enforced it. These guards do, before any page action: they exit 2 rather than
let a scenario touch a folder it does not own.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def _get_project(base):
    """GET {base}/api/project, or exit 2 if it cannot be read."""
    url = base.rstrip("/") + "/api/project"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(
            f"e2e preflight: could not read {url} ({exc}).\n"
            "Refusing to run: the scenario writes to whatever project the "
            "server is serving, so it must be identified first.",
            file=sys.stderr,
        )
        sys.exit(2)


def require_project_dir(base, expected_dir, scenario=""):
    """Require that BASE serves `expected_dir` in project mode. Else exit 2."""
    info = _get_project(base)
    mode = info.get("mode")
    served = info.get("dir")
    ok = (
        mode == "project"
        and isinstance(served, str)
        and os.path.realpath(served) == os.path.realpath(expected_dir)
    )
    if not ok:
        print(
            f"e2e preflight FAILED{' for ' + scenario if scenario else ''}: "
            f"{base} is not serving this scenario's project folder.\n"
            f"  expected mode=project dir={os.path.realpath(expected_dir)}\n"
            f"  server reports mode={mode!r} dir={served!r}\n"
            "Refusing to run: this scenario types into the editor and waits "
            "for autosave, which would overwrite main.spec.yaml in the folder "
            "above. Run it via `npm run test:e2e`, which supplies a throwaway "
            "server and folder.",
            file=sys.stderr,
        )
        sys.exit(2)
    return info


SEED_MARKER = "# spec-yard e2e throwaway fixture — safe to overwrite"


def require_config_writes_allowed(scenario=""):
    """Refuse unless the harness has declared this server's config throwaway.

    `first-run` and `standalone` mutate server-side config: they write
    config.json, recentProjects, and (first-run) autosave into folders they
    create. /api/project cannot tell a throwaway SPEC_YARD_CONFIG_DIR from a
    real install — an unconfigured real install answers "unconfigured" too —
    so the only honest signal is an explicit opt-in from the harness.
    run-e2e.sh sets SPEC_YARD_E2E_CONFIG_WRITES_OK=1 for exactly the scenarios
    it starts on a throwaway config dir.
    """
    if os.environ.get("SPEC_YARD_E2E_CONFIG_WRITES_OK") != "1":
        print(
            f"e2e preflight FAILED{' for ' + scenario if scenario else ''}: "
            "this scenario writes server-side configuration (config.json, "
            "recent projects, and project folders it creates), and "
            "SPEC_YARD_E2E_CONFIG_WRITES_OK is not set to 1.\n"
            "Refusing to run: /api/project cannot distinguish a throwaway "
            "config dir from a real install that has simply never been "
            "configured. Run via `npm run test:e2e`, which starts these "
            "scenarios on a throwaway SPEC_YARD_CONFIG_DIR and sets the "
            "variable.",
            file=sys.stderr,
        )
        sys.exit(2)


def require_safe_to_seed(folder, scenario=""):
    """Refuse to overwrite a main.spec.yaml this scenario did not write.

    The project-B beat seeds a spec into a folder named by an env var. Pointed
    at a real project, that write lands on real work — and it happens before
    any server-side guard can see it, because the folder is not yet the one
    the server is serving.
    """
    spec = os.path.join(folder, "main.spec.yaml")
    if not os.path.exists(spec):
        return
    try:
        with open(spec, encoding="utf-8") as fh:
            existing = fh.read()
    except OSError as exc:
        existing = ""
        print(f"e2e preflight: could not read {spec} ({exc})", file=sys.stderr)
    if SEED_MARKER not in existing:
        print(
            f"e2e preflight FAILED{' for ' + scenario if scenario else ''}: "
            f"{spec} exists and was not written by this scenario "
            f"(no {SEED_MARKER!r} marker).\n"
            "Refusing to overwrite it.",
            file=sys.stderr,
        )
        sys.exit(2)


def require_fresh_dir(path, scenario=""):
    """Refuse to run against a folder that already holds somebody's spec.

    Identity is not disposability: require_project_dir proves the server is
    serving THIS scenario's folder, and require_safe_to_seed guards a folder
    the scenario writes directly — but a scenario that expects to CREATE a
    project, or to start from a blank slate, will happily autosave over a
    folder that already has a main.spec.yaml. The existing checks recorded
    that as a failed assertion and carried on to the fill.
    """
    spec = os.path.join(path, "main.spec.yaml")
    if not os.path.exists(spec):
        return
    try:
        with open(spec, encoding="utf-8") as fh:
            existing = fh.read()
    except OSError as exc:
        existing = ""
        print(f"e2e preflight: could not read {spec} ({exc})", file=sys.stderr)
    if SEED_MARKER in existing:
        return
    print(
        f"e2e preflight FAILED{' for ' + scenario if scenario else ''}: "
        f"{path} already holds a main.spec.yaml this harness did not write "
        f"(no {SEED_MARKER!r} marker).\n"
        "Refusing to run: this scenario expects a fresh folder and would "
        "autosave over that file.",
        file=sys.stderr,
    )
    sys.exit(2)


def require_mode(base, expected_mode, scenario=""):
    """Require that BASE reports `expected_mode`. Else exit 2.

    For the scenarios that own no project folder: there is nothing to compare
    a path against, but a server in the wrong mode is still the wrong server.
    """
    info = _get_project(base)
    mode = info.get("mode")
    if mode != expected_mode:
        print(
            f"e2e preflight FAILED{' for ' + scenario if scenario else ''}: "
            f"{base} reports mode={mode!r}, expected {expected_mode!r} "
            f"(dir={info.get('dir')!r}).\n"
            "Refusing to run against a server this scenario does not own. "
            "Run it via `npm run test:e2e`.",
            file=sys.stderr,
        )
        sys.exit(2)
    return info
