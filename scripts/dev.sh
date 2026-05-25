#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Pet-Co dev server launcher
#
# Auto-detects proxy/preview domains from the container hostname
# and sets ALLOWED_DEV_ORIGINS so Next.js Turbopack accepts
# cross-origin WebSocket/HMR connections from the proxy.
#
# Usage:
#   bash scripts/dev.sh          # start in foreground
#   bash scripts/dev.sh &        # start in background
# ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# ── Detect proxy domains ─────────────────────────────────────
# In OpenHands, the container hostname follows the pattern:
#   runtime-{RUNTIME_ID}-{random-suffix}
# and the proxy exposes it as:
#   work-1-{RUNTIME_ID}.prod-runtime.all-hands.dev  (port 12000)
#   work-2-{RUNTIME_ID}.prod-runtime.all-hands.dev  (port 12001)
HOST="$(hostname)"
RUNTIME_ID="$(echo "$HOST" | sed -n 's/^runtime-\([^-]*\)-.*/\1/p')"

if [ -n "$RUNTIME_ID" ]; then
  WORK_ORIGINS="work-1-${RUNTIME_ID}.prod-runtime.all-hands.dev,work-2-${RUNTIME_ID}.prod-runtime.all-hands.dev"
  # Prefer explicitly-set value, otherwise use auto-detected
  export ALLOWED_DEV_ORIGINS="${ALLOWED_DEV_ORIGINS:-$WORK_ORIGINS}"
  echo "→ ALLOWED_DEV_ORIGINS = ${ALLOWED_DEV_ORIGINS}"
else
  echo "→ Could not detect runtime ID — ALLOWED_DEV_ORIGINS unchanged (current: ${ALLOWED_DEV_ORIGINS:-<unset>})"
fi

# ── Clean cache & start ──────────────────────────────────────
rm -rf .next
PORT="${PORT:-12000}" exec npm run dev
