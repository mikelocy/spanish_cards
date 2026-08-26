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

## Adding sets from photos

`/add` turns photos of a textbook page into a set: the phone shrinks each shot to
1600px, the server sends them to Claude (vision) for extraction, and the result is
shown for review and correction **before** anything is saved. Extraction reports a
`warnings` array — a cut-off list, glare, an unreadable word, a second box it left
alone — shown in red above the rows.

Originals are kept in `uploads/` (gitignored) and referenced by the deck's `photos`
field, so a bad extraction can be redone without rephotographing the book.

Server config lives in `.env` on the box (gitignored, `chmod 600`):

| Variable | Purpose |
|---|---|
| `SPANISH_PASSCODE` | Gate for `/add` and both write endpoints. Unset = adding is off. |
| `SESSION_SECRET` | Signs the 30-day auth cookie. |
| `ANTHROPIC_API_KEY` | Enables photo reading. Unset = the page says so and the button is inert. |

Studying stays public — only adding is behind the passcode, so practice has no
friction. nginx needs `client_max_body_size 15m` for multi-photo uploads.

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
- `say` — optional spoken form for the 🔊 button, when `es` shouldn't be read aloud
  literally. Only needed where stripping notation would lose a real word or garble
  it — e.g. `(Yo) tengo [número] años.` → `"Yo tengo años."`, `Encantado/a.` →
  `"Encantado. Encantada."` Everything else is sanitized automatically (parentheses,
  square brackets, `___` blanks, and `/` are handled without a `say` field).

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

## Pronunciation

The 🔊 button speaks the Spanish through the browser's own speech synthesis
(Web Speech API) — no audio files, no TTS service, nothing leaves the device.
Voice selection prefers Latin American Spanish (`es-MX`, `es-US`, …) and falls
back to any `es-*` voice; the button hides itself entirely if the browser has no
speech support. Rate is set slightly under natural pace.

If a device's stock Spanish voice turns out to be poor, the upgrade path is
pre-generating audio files per card at build time and serving them statically —
that needs a third-party TTS vendor, which this app currently avoids.

## Installing it / offline

It is a PWA, so it installs to the home screen and runs without browser chrome:

- **Android/Chrome** offers a real "Install app" (banner or ⋮ menu).
- **iOS** never prompts — Share → Add to Home Screen. iOS gives an installed app
  its own storage partition, so stars and skips made in Safari do **not** carry
  over. Install first, then mark words.

Four pieces make that work, and all four are required — the manifest's
`display: standalone` is what drops the address bar, and without
`apple-touch-icon` iOS uses a screenshot of the page as the icon:

| File | Role |
|---|---|
| `public/manifest.webmanifest` | name, `display: standalone`, icons |
| `public/icon-192.png`, `icon-512.png` | generated — see below |
| `public/sw.js` | offline cache |
| head tags in `index.html` | manifest link, apple-touch-icon, apple-mobile-web-app-* |

**Offline.** The service worker is **network-first everywhere**, deliberately: a
stale deck is a worse failure than a slow load, since decks change whenever a page
is photographed. The cache is the no-signal fallback, not the fast path. Install
pulls down *every* set rather than only visited ones, so a trip with no signal has
the whole book. `/add`, `/api/login`, `/api/session` and `/api/extract` are never
cached — a dead page that looks alive is worse than an honest failure.

Practice, flipping, stars/skips and pronunciation all work offline (speech uses
the device's own voice; a device that picked a *network* Spanish voice would go
quiet offline, but on-device voices are the norm). Adding words does not — it
needs the server. Verified working in airplane mode on a real phone.

The app must be loaded online **once** first; that visit registers the worker and
precaches. Bump `CACHE` in `sw.js` to force every client to discard its cache.

**Icons** are generated with no image dependencies — raw pixels through a
hand-rolled PNG encoder — so they're reproducible from source:

```bash
node tools/make-icon.js
```

## Keyboard / touch

Space or Enter flips · ← → change cards · `s` stars · `k` marks known ·
`p` pronounces · swipe left/right on a phone.

## Practice state

Three per-device lists, all in localStorage, all keyed on the Spanish text:

- **starred** (`sf:starred:<slug>`) — words to drill more
- **skipped** (`sf:skipped:<slug>`) — words he's got; dropped from practice
- **selected** (`sf:selected`) — which sets are ticked

Starring and skipping are mutually exclusive. The filter button cycles
**Practicing** (everything minus skipped) → **Starred only** → **Skipped**, the last
of which exists so a word can be brought back.
