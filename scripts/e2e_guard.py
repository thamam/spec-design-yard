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
