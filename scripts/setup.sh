#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────
# Pet-Co workspace setup
# Called automatically by OpenHands via AGENTS.md instructions.
#
# Installs dependencies and creates .env.local from environment
# variables. Does NOT start the dev server — that is a separate
# step documented in AGENTS.md.
# ──────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo "=== Pet-Co Setup ==="

# 1. Install dependencies
if [ ! -d "node_modules" ]; then
  echo "→ Installing npm dependencies..."
  npm install
fi

# 2. Create .env.local from environment variables
#    Each var falls back to the value in .env.local.example if not set.
ENV_FILE=".env.local"
EXAMPLE_FILE=".env.local.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "→ Creating $ENV_FILE from example + environment variables..."
  cp "$EXAMPLE_FILE" "$ENV_FILE"

  # Overwrite with env-provided values (if set)
  # Firebase
  [ -n "${NEXT_PUBLIC_FIREBASE_API_KEY:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_API_KEY=.*|NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}|" "$ENV_FILE"
  [ -n "${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=.*|NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}|" "$ENV_FILE"
  [ -n "${NEXT_PUBLIC_FIREBASE_PROJECT_ID:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_PROJECT_ID=.*|NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}|" "$ENV_FILE"
  [ -n "${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=.*|NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}|" "$ENV_FILE"
  [ -n "${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=.*|NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}|" "$ENV_FILE"
  [ -n "${NEXT_PUBLIC_FIREBASE_APP_ID:-}" ] && sed -i "s|^NEXT_PUBLIC_FIREBASE_APP_ID=.*|NEXT_PUBLIC_FIREBASE_APP_ID=${NEXT_PUBLIC_FIREBASE_APP_ID}|" "$ENV_FILE"

  # Google OAuth
  [ -n "${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" ] && sed -i "s|^NEXT_PUBLIC_GOOGLE_CLIENT_ID=.*|NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}|" "$ENV_FILE"
  # GOOGLE_CLIENT_SECRET is intentionally NOT prefixed with NEXT_PUBLIC_ to avoid
  # embedding it in the client-side JavaScript bundle (C1 security fix).
  [ -n "${NEXT_PUBLIC_GOOGLE_CLIENT_SECRET:-}" ] && sed -i "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=${NEXT_PUBLIC_GOOGLE_CLIENT_SECRET}|" "$ENV_FILE"

  # Firebase Admin SDK (server-side only)
  [ -n "${FIREBASE_PROJECT_ID:-}" ] && sed -i "s|^FIREBASE_PROJECT_ID=.*|FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}|" "$ENV_FILE"
  [ -n "${FIREBASE_CLIENT_EMAIL:-}" ] && sed -i "s|^FIREBASE_CLIENT_EMAIL=.*|FIREBASE_CLIENT_EMAIL=${FIREBASE_CLIENT_EMAIL}|" "$ENV_FILE"
  [ -n "${FIREBASE_PRIVATE_KEY:-}" ] && sed -i "s|^FIREBASE_PRIVATE_KEY=.*|FIREBASE_PRIVATE_KEY=${FIREBASE_PRIVATE_KEY}|" "$ENV_FILE"

  # Allowed dev origins
  [ -n "${ALLOWED_DEV_ORIGINS:-}" ] && sed -i "s|^ALLOWED_DEV_ORIGINS=.*|ALLOWED_DEV_ORIGINS=${ALLOWED_DEV_ORIGINS}|" "$ENV_FILE"

  echo "→ $ENV_FILE created."
fi

echo "→ Setup complete. Run 'npm run dev' (or 'bash scripts/dev.sh') to start the server."
