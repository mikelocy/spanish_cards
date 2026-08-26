const express = require('express');
const fs = require('fs');
const path = require('path');

const { loadEnv } = require('./lib/env');
loadEnv();

const { requireAuth, isAuthed, setAuthCookie, passcodeMatches } = require('./lib/auth');

const app = express();
const PORT = process.env.PORT || 3001;
const DECKS_DIR = path.join(__dirname, 'decks');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_IMAGES = 4;

app.use(express.json({ limit: '14mb' }));

// Decks are plain JSON files on disk. Read them fresh on each request so that
// dropping a new file into decks/ publishes it without a restart.
function readDecks() {
  let files;
  try {
    files = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const decks = [];
  for (const file of files) {
    try {
      const deck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, file), 'utf8'));
      if (!deck.slug) deck.slug = file.replace(/\.json$/, '');
      if (!Array.isArray(deck.cards)) continue;
      decks.push(deck);
    } catch (err) {
      console.error(`skipping ${file}: ${err.message}`);
    }
  }
  decks.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title));
  return decks;
}

// ---- Public: study ----
app.get('/api/decks', (req, res) => {
  res.json(
    readDecks().map((d) => ({
      slug: d.slug,
      title: d.title,
      source: d.source || '',
      count: d.cards.length,
    }))
  );
});

app.get('/api/decks/:slug', (req, res) => {
  const deck = readDecks().find((d) => d.slug === req.params.slug);
  if (!deck) return res.status(404).json({ error: 'deck not found' });
  res.json(deck);
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));

// ---- Adding sets from photos (passcode-gated) ----
app.get('/api/session', (req, res) => {
  res.json({ authed: isAuthed(req), canExtract: Boolean(process.env.ANTHROPIC_API_KEY) });
});

app.post('/api/login', (req, res) => {
  if (!passcodeMatches(req.body && req.body.passcode)) {
    return res.status(401).json({ error: 'wrong passcode' });
  }
  setAuthCookie(res);
  res.json({ ok: true });
});

function slugify(title) {
  return String(title)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents for the URL
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'set';
}

function uniqueSlug(base, existing) {
  if (!existing.has(base)) return base;
  for (let n = 2; n < 200; n++) {
    if (!existing.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

app.post('/api/extract', requireAuth, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'No ANTHROPIC_API_KEY on the server yet.' });
  }
  const images = (req.body && req.body.images) || [];
  if (!Array.isArray(images) || !images.length) {
    return res.status(400).json({ error: 'no photos received' });
  }
  if (images.length > MAX_IMAGES) {
    return res.status(400).json({ error: `at most ${MAX_IMAGES} photos at a time` });
  }

  // Keep the originals so a bad extraction can be redone without rephotographing.
  const saved = [];
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    images.forEach((data, i) => {
      const name = `${stamp}-${i + 1}.jpg`;
      fs.writeFileSync(path.join(UPLOADS_DIR, name), Buffer.from(data, 'base64'));
      saved.push(name);
    });
  } catch (err) {
    console.error('could not save upload:', err.message);
  }

  try {
    const { extractDeck } = require('./lib/extract');
    const deck = await extractDeck(images);
    deck.photos = saved;
    console.log(`extracted "${deck.title}" — ${deck.cards.length} cards, ` +
                `${deck.warnings.length} warning(s) [${saved.join(', ')}]`);
    res.json(deck);
  } catch (err) {
    console.error('extract failed:', err.message);
    res.status(502).json({ error: 'Could not read that page. Try a straighter, brighter photo.' });
  }
});

app.post('/api/decks', requireAuth, (req, res) => {
  const body = req.body || {};
  const title = String(body.title || '').trim();
  const cards = Array.isArray(body.cards) ? body.cards : [];

  if (!title) return res.status(400).json({ error: 'the set needs a name' });
  const clean = cards
    .map((c) => ({
      es: String(c.es || '').trim(),
      en: String(c.en || '').trim(),
      ...(String(c.note || '').trim() ? { note: String(c.note).trim() } : {}),
      ...(String(c.say || '').trim() ? { say: String(c.say).trim() } : {}),
    }))
    .filter((c) => c.es && c.en);
  if (!clean.length) return res.status(400).json({ error: 'no complete cards to save' });

  const existing = readDecks();
  const slug = uniqueSlug(slugify(title), new Set(existing.map((d) => d.slug)));
  const order = existing.reduce((max, d) => Math.max(max, d.order ?? 0), 0) + 1;

  const deck = {
    slug,
    title,
    source: String(body.source || '').trim(),
    order,
    ...(Array.isArray(body.photos) && body.photos.length ? { photos: body.photos } : {}),
    cards: clean,
  };

  try {
    fs.writeFileSync(path.join(DECKS_DIR, `${slug}.json`), JSON.stringify(deck, null, 2) + '\n');
  } catch (err) {
    console.error('could not write deck:', err.message);
    return res.status(500).json({ error: 'could not save the set' });
  }
  console.log(`saved deck "${title}" (${slug}) — ${clean.length} cards`);
  res.json({ ok: true, slug, count: clean.length });
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`spanish flashcards listening on 127.0.0.1:${PORT}`);
  if (!process.env.SPANISH_PASSCODE) console.warn('! SPANISH_PASSCODE unset — /add is locked out');
  if (!process.env.ANTHROPIC_API_KEY) console.warn('! ANTHROPIC_API_KEY unset — photo extraction is off');
});
