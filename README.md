# Spanish Flashcards

Vocabulary practice from a school Spanish book. Shows the Spanish word; tap to reveal the English.

Live at **https://spanish.locyfish.com** (personal Lightsail box `locyfish`).

## How it runs

| Piece | Value |
|---|---|
| Host | `locyfish` (44.251.48.128) |
| App dir | `/home/ubuntu/spanish-app` |
| Process | PM2 app `spanish`, `127.0.0.1:3001` |
| nginx | `/etc/nginx/sites-available/spanish` |
| TLS | Let's Encrypt via certbot |

No database. Decks are JSON files in `decks/`, read fresh on every request — dropping in a
new file publishes it without a restart. Per-device state (starred words, shuffle and
direction preferences) lives in the browser's localStorage.

## Deck format

One file per set, `decks/<slug>.json`:

```json
{
  "slug": "unidad-2-la-familia",
  "title": "Unidad 2 — La familia",
  "source": "pp. 34–35",
  "order": 2,
  "cards": [
    { "es": "el hermano", "en": "brother" },
    { "es": "la abuela", "en": "grandmother", "note": "note is optional" }
  ]
}
```

- `slug` — URL path (`/#/unidad-2-la-familia`). Defaults to the filename if omitted.
- `order` — sort position on the home screen. Missing sorts last, then alphabetical.
- `note` — optional hint shown under the answer (gender, formal/informal, irregular forms).

Starred words are keyed on the `es` string, so editing a Spanish word's spelling drops its
star. Adding, reordering, or removing cards is safe.

## Deploy

```bash
./deploy.sh          # ships code + decks, restarts PM2
```

Or by hand:

```bash
tar czf - --exclude=node_modules --exclude=package-lock.json public decks server.js package.json \
  | ssh locyfish 'tar xzf - -C ~/spanish-app && cd ~/spanish-app && npm install --omit=dev'
ssh locyfish 'pm2 restart spanish'
```

Deck-only changes don't need a restart — the server re-reads `decks/` per request.

## Local development

```bash
npm install
npm start            # http://127.0.0.1:3001
```

## Keyboard / touch

Space or Enter flips · ← → change cards · `s` stars · Esc back to the set list ·
swipe left/right on a phone.
