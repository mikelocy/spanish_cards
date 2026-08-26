const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DECKS_DIR = path.join(__dirname, 'decks');

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

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`spanish flashcards listening on 127.0.0.1:${PORT}`);
});
