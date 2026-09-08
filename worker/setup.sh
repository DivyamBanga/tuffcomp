#!/usr/bin/env bash
# One-shot Worker setup, run from worker/ AFTER `npx wrangler login`:
#   bash setup.sh
# Deploys the judge proxy, installs the Anthropic key from .dev.vars, creates
# a Cloudflare TURN key through the API and installs its id + token, points
# the site at the Worker (repo variable JUDGE_PROXY_URL) and rebuilds it.
# Safe to re-run: every step is idempotent except TURN key creation, which
# is skipped when TURN_KEY_ID is already set.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n== %s\n' "$*"; }

say "who am I"
npx wrangler whoami | grep -vi "npm warn" || { echo "not logged in: run  npx wrangler login  first"; exit 1; }

say "deploy"
DEPLOY_OUT=$(npx wrangler deploy 2>&1 | grep -vi "npm warn")
echo "$DEPLOY_OUT"
WORKER_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$WORKER_URL" ] || { echo "could not read the Worker URL from the deploy output"; exit 1; }
echo "worker url: $WORKER_URL"

say "anthropic key secret"
ANTHROPIC_KEY=$(grep -oE 'ANTHROPIC_API_KEY=\S+' .dev.vars | cut -d= -f2)
[ -n "$ANTHROPIC_KEY" ] || { echo "no ANTHROPIC_API_KEY in .dev.vars"; exit 1; }
printf '%s' "$ANTHROPIC_KEY" | npx wrangler secret put ANTHROPIC_API_KEY 2>&1 | grep -vi "npm warn" | tail -1

say "TURN key"
if [ -n "${TURN_KEY_ID:-}" ] && [ -n "${TURN_API_TOKEN:-}" ]; then
  echo "using TURN_KEY_ID / TURN_API_TOKEN from the environment"
else
  # The wrangler login token can create a TURN key when it carries the
  # Realtime scope; otherwise create one in the dashboard (Realtime -> TURN)
  # and re-run with TURN_KEY_ID=... TURN_API_TOKEN=... bash setup.sh
  ACCOUNT_ID=$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
  CFG=$(ls "${XDG_CONFIG_HOME:-$HOME/.config}/.wrangler/config/default.toml" "$APPDATA/xdg.config/.wrangler/config/default.toml" 2>/dev/null | head -1)
  OAUTH=$(grep -oE 'oauth_token = "[^"]+"' "$CFG" | cut -d'"' -f2)
  RESP=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/calls/turn_keys" \
    -H "Authorization: Bearer $OAUTH" -H "Content-Type: application/json" -d '{"name":"ringchasers"}')
  TURN_KEY_ID=$(echo "$RESP" | grep -oE '"uid":"[^"]+"' | head -1 | cut -d'"' -f4)
  TURN_API_TOKEN=$(echo "$RESP" | grep -oE '"key":"[^"]+"' | head -1 | cut -d'"' -f4)
  if [ -z "$TURN_KEY_ID" ] || [ -z "$TURN_API_TOKEN" ]; then
    echo "could not create a TURN key with the login token:"
    echo "$RESP" | head -c 400; echo
    echo "create one in the Cloudflare dashboard (Realtime -> TURN -> Create) and re-run:"
    echo "  TURN_KEY_ID=... TURN_API_TOKEN=... bash setup.sh"
    exit 1
  fi
  echo "created TURN key $TURN_KEY_ID"
fi
printf '%s' "$TURN_KEY_ID" | npx wrangler secret put TURN_KEY_ID 2>&1 | grep -vi "npm warn" | tail -1
printf '%s' "$TURN_API_TOKEN" | npx wrangler secret put TURN_API_TOKEN 2>&1 | grep -vi "npm warn" | tail -1

say "verify /turn mints relay credentials"
sleep 3
TURN_JSON=$(curl -s "$WORKER_URL/turn")
echo "$TURN_JSON" | grep -q 'turn:' && echo "relay credentials OK" || { echo "no relay in response: $TURN_JSON"; exit 1; }

say "point the site at the Worker and rebuild"
gh variable set JUDGE_PROXY_URL --body "$WORKER_URL"
gh workflow run "Deploy to GitHub Pages"
echo "site rebuild triggered; live in ~2 minutes at https://divyambanga.github.io/tuffcomp/"
