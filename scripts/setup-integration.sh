#!/bin/sh
# Generates the integration secrets into .env (gitignored) and copies the ones
# Convex needs into its deployment environment. Re-run it after `convex dev`
# points at a new deployment. Existing values in .env are kept.
set -eu
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env

ensure_secret() {
  if ! grep -q "^$1=." .env; then
    value="$(openssl rand -hex 32)"
    if grep -q "^$1=" .env; then
      sed -i.bak "s|^$1=.*|$1=$value|" .env && rm -f .env.bak
    else
      echo "$1=$value" >> .env
    fi
  fi
}
ensure_secret N8N_ENCRYPTION_KEY
ensure_secret CONVEX_TO_N8N_SECRET
ensure_secret N8N_TO_CONVEX_SECRET

read_env() { grep "^$1=" .env | cut -d= -f2-; }

npx convex env set CONVEX_TO_N8N_SECRET "$(read_env CONVEX_TO_N8N_SECRET)" >/dev/null
npx convex env set N8N_TO_CONVEX_SECRET "$(read_env N8N_TO_CONVEX_SECRET)" >/dev/null
npx convex env set N8N_REQUEST_WEBHOOK_URL \
  "$(read_env N8N_REQUEST_WEBHOOK_URL)" >/dev/null

echo "Secrets are in .env and set on the Convex deployment."
echo "Next: docker compose up -d"
