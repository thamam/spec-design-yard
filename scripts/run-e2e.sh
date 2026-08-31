#!/usr/bin/env bash
#
# Runs every browser e2e scenario against throwaway dev servers.
#
#   npm run test:e2e              # all scenarios
#   npm run test:e2e first-run    # one scenario by name
#
# Each scenario gets its own dev server, its own project folders, and its own
# SPEC_YARD_CONFIG_DIR, all under one temp root that is deleted on exit. That
# isolation is the point: the registry lives in ~/.specyard by default, so a
# run without it would retarget whatever project you actually work in.
#
# The server runs from a copy of the repo with node_modules symlinked, because
# `next dev` owns .next — running one here would fight the dev server you
# already have open.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_PORT="${SPEC_YARD_E2E_PORT:-3109}"

if [ "$BASE_PORT" = "3000" ]; then
  echo "refusing to run on port 3000 — that is the conventional dev-server port" >&2
  exit 2
fi

command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 2; }
python3 -c "import playwright" 2>/dev/null || {
  echo "playwright is required: pip install playwright && playwright install chromium" >&2
  exit 2
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/specyard-e2e-XXXXXX")"
APP="$TMP/app"
SERVER_PID=""

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

echo "==> staging an isolated app copy in $APP"
mkdir -p "$APP"
tar -cf - -C "$REPO" --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude=.codegraph --exclude=.e2e-failures . 2>/dev/null | tar -xf - -C "$APP"
ln -s "$REPO/node_modules" "$APP/node_modules"

start_server() {
  # $1 = port, rest = KEY=VALUE env assignments
  local port="$1"; shift
  ( cd "$APP" && env "$@" npx next dev -p "$port" >"$TMP/server-$port.log" 2>&1 ) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "http://localhost:$port/api/project" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "server on $port never became ready; last log lines:" >&2
  tail -20 "$TMP/server-$port.log" >&2
  return 1
}

stop_server() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  # next dev spawns a child that owns the port; wait for the port to free up.
  for _ in $(seq 1 20); do
    lsof -ti:"$1" >/dev/null 2>&1 || break
    kill $(lsof -ti:"$1") 2>/dev/null
    sleep 0.5
  done
  SERVER_PID=""
}

FAILED=()
PASSED=()

run_scenario() {
  local name="$1" port="$2" script="$3"; shift 3
  if [ -n "${ONLY:-}" ] && [ "$ONLY" != "$name" ]; then
    return 0
  fi
  echo
  echo "==> $name (port $port)"
  # Never adopt (and never later kill) a server this script did not start.
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo "    port $port is already in use — skipping rather than taking it over" >&2
    FAILED+=("$name (port $port busy)")
    return 0
  fi
  if ! start_server "$port" "SPEC_YARD_CONFIG_DIR=$TMP/config-$name" "$@"; then
    FAILED+=("$name (server failed to start)")
    stop_server "$port"
    return 0
  fi
  if env SPEC_YARD_URL="http://localhost:$port" \
         SPEC_YARD_E2E_SHOTS="$TMP/shots-$name" \
         ${SCENARIO_ENV[@]+"${SCENARIO_ENV[@]}"} python3 "$REPO/$script"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
    # Screenshots are the whole point when a browser check fails; keep them.
    mkdir -p "$REPO/.e2e-failures"
    cp -R "$TMP/shots-$name" "$REPO/.e2e-failures/$name" 2>/dev/null
    echo "    screenshots kept in .e2e-failures/$name"
  fi
  stop_server "$port"
}

ONLY="${1:-}"

# --- 1. file mode: launched straight into a project via the env var ---
CLIENT="$TMP/client-repo"
mkdir -p "$CLIENT"
SCENARIO_ENV=("SPEC_YARD_E2E_CLIENT=$(cd "$CLIENT" && pwd -P)")
run_scenario "file-mode" "$BASE_PORT" "scripts/e2e-file-mode.py" \
  "SPEC_YARD_PROJECT_DIR=$CLIENT"

# --- 2. first run: nothing configured; the whole GUI story ---
SCENARIO_ENV=("SPEC_YARD_E2E_A=$TMP/project-a" "SPEC_YARD_E2E_B=$TMP/project-b")
run_scenario "first-run" "$((BASE_PORT + 1))" "scripts/e2e-first-run.py"

# --- 3. standalone: the browser-storage opt-out ---
SCENARIO_ENV=()
run_scenario "standalone" "$((BASE_PORT + 2))" "scripts/e2e-standalone-mode.py"

# --- 4. editor ergonomics: extension point for Lanes A and B ---
EDITOR_CLIENT="$TMP/editor-ergonomics-repo"
# A second project folder, for the beat that switches into one for real.
EDITOR_CLIENT_B="$TMP/editor-ergonomics-repo-b"
mkdir -p "$EDITOR_CLIENT" "$EDITOR_CLIENT_B"
SCENARIO_ENV=("SPEC_YARD_E2E_CLIENT=$(cd "$EDITOR_CLIENT" && pwd -P)"
              "SPEC_YARD_E2E_CLIENT_B=$(cd "$EDITOR_CLIENT_B" && pwd -P)")
run_scenario "editor-ergonomics" "$((BASE_PORT + 3))" "scripts/e2e-editor-ergonomics.py" \
  "SPEC_YARD_PROJECT_DIR=$EDITOR_CLIENT"

echo
for name in ${PASSED[@]+"${PASSED[@]}"}; do echo "PASS  $name"; done
for name in ${FAILED[@]+"${FAILED[@]}"}; do echo "FAIL  $name"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo
  echo "=== ${#FAILED[@]} scenario(s) failed ==="
  exit 1
fi
echo
echo "=== all e2e scenarios passed ==="
