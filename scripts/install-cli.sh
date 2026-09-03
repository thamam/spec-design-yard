#!/usr/bin/env bash
# One-time setup: put the `spec-yard` launcher on your PATH by symlinking
# bin/spec-yard into ~/.local/bin. Safe to re-run.
set -euo pipefail

REPO="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$HOME/.local/bin"
TARGET="$TARGET_DIR/spec-yard"

mkdir -p "$TARGET_DIR"
ln -sf "$REPO/bin/spec-yard" "$TARGET"
echo "linked $TARGET -> $REPO/bin/spec-yard"
echo "To run it from any directory, ~/.local/bin must be on your PATH:"
echo "  export PATH=\"$TARGET_DIR:\$PATH\""

case ":$PATH:" in
  *":$TARGET_DIR:"*) echo "'spec-yard' is on PATH — run it from any client repo." ;;
  *)
    echo "WARNING: $TARGET_DIR is not on your PATH."
    echo "Add the export above to your shell rc file, then open a new shell."
    ;;
esac
