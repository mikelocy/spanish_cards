#!/usr/bin/env bash
# Ship the app to the locyfish box and restart it.
set -euo pipefail

cd "$(dirname "$0")"

echo "→ uploading…"
tar czf - --exclude=node_modules --exclude=package-lock.json \
    public decks server.js package.json \
  | ssh locyfish 'mkdir -p ~/spanish-app && tar xzf - -C ~/spanish-app \
      && cd ~/spanish-app && npm install --omit=dev --no-audit --no-fund >/dev/null'

echo "→ restarting…"
ssh locyfish 'pm2 restart spanish >/dev/null && sleep 1 && curl -sf http://127.0.0.1:3001/healthz'

echo
echo "✓ live at https://spanish.locyfish.com"
