(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const FLIP_MS = 450;

  const el = {
    study: $('study'),
    deckList: $('deck-list'), homeEmpty: $('home-empty'), selectAll: $('select-all'),
    title: $('deck-title'), source: $('deck-source'), star: $('star'),
    fill: $('progress-fill'), counter: $('counter'),
    card: $('card'), frontLang: $('front-lang'), frontText: $('front-text'),
    frontFrom: $('front-from'),
    backLang: $('back-lang'), backText: $('back-text'), backNote: $('back-note'),
    prev: $('prev'), next: $('next'), flip: $('flip'),
    dir: $('dir'), shuffle: $('shuffle'), filter: $('filter'),
    studyEmpty: $('study-empty'),
  };

  // Persistence is per device, and must survive storage being unavailable.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  const state = {
    index: [],          // deck summaries, in book order
    cache: {},          // slug -> full deck, fetched on demand
    selected: new Set(),
    stars: {},          // slug -> Set of Spanish strings
    pool: [],           // [{ slug, deckTitle, card }] across every selected set
    order: [],          // indices into pool, after filter + shuffle
    pos: 0,
    flipped: false,
    dir: store.get('sf:dir', 'es-en'),
    shuffle: store.get('sf:shuffle', false),
    filter: 'all',
  };

  const starKey = (slug) => `sf:starred:${slug}`;
  const starsFor = (slug) => {
    if (!state.stars[slug]) state.stars[slug] = new Set(store.get(starKey(slug), []));
    return state.stars[slug];
  };
  const isStarred = (entry) => starsFor(entry.slug).has(entry.card.es);

  // ---- Data ----
  async function ensureDecks(slugs) {
    const missing = slugs.filter((s) => !state.cache[s]);
    await Promise.all(missing.map(async (slug) => {
      try {
        const res = await fetch('/api/decks/' + encodeURIComponent(slug));
        if (res.ok) state.cache[slug] = await res.json();
      } catch { /* leave uncached; buildPool skips it */ }
    }));
  }

  // Pool follows the book order of the set list, not the order they were ticked.
  function buildPool() {
    state.pool = [];
    for (const summary of state.index) {
      if (!state.selected.has(summary.slug)) continue;
      const deck = state.cache[summary.slug];
      if (!deck) continue;
      for (const card of deck.cards) {
        state.pool.push({ slug: deck.slug, deckTitle: deck.title, card });
      }
    }
  }

  function rebuildOrder() {
    let idx = state.pool.map((_, i) => i);
    if (state.filter === 'starred') idx = idx.filter((i) => isStarred(state.pool[i]));
    if (state.shuffle) {
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
    }
    state.order = idx;
    state.pos = 0;
    state.flipped = false;
  }

  async function applySelection({ keepPos = false } = {}) {
    const slugs = [...state.selected];
    store.set('sf:selected', slugs);
    await ensureDecks(slugs);

    const prev = keepPos ? state.pos : 0;
    buildPool();
    rebuildOrder();
    if (keepPos) state.pos = Math.min(prev, Math.max(0, state.order.length - 1));

    el.study.hidden = state.selected.size === 0;
    el.card.classList.remove('flipped');
    syncHeader();
    syncTools();
    render();
    renderDeckList();
  }

  // ---- Set list ----
  function renderDeckList() {
    el.deckList.innerHTML = '';
    el.homeEmpty.hidden = state.index.length > 0;

    for (const deck of state.index) {
      const on = state.selected.has(deck.slug);
      const starCount = starsFor(deck.slug).size;

      const btn = document.createElement('button');
      btn.className = 'deck' + (on ? ' current' : '');
      btn.setAttribute('aria-pressed', String(on));
      btn.innerHTML =
        '<span class="check" aria-hidden="true"></span>' +
        '<span class="deck-text"><span class="deck-name"></span><span class="deck-meta"></span></span>' +
        '<span class="deck-count"></span>';
      btn.querySelector('.deck-name').textContent = deck.title;
      btn.querySelector('.deck-meta').textContent =
        [deck.source, starCount ? starCount + ' starred' : ''].filter(Boolean).join(' · ');
      btn.querySelector('.deck-count').textContent = String(deck.count);

      btn.addEventListener('click', async () => {
        if (state.selected.has(deck.slug)) state.selected.delete(deck.slug);
        else state.selected.add(deck.slug);
        await applySelection();
      });

      el.deckList.appendChild(btn);
    }

    const all = state.index.length > 0 && state.selected.size === state.index.length;
    el.selectAll.textContent = all ? 'Clear all' : 'Select all';
  }

  // ---- Card ----
  function syncHeader() {
    const n = state.selected.size;
    const cards = state.pool.length;

    if (n === 1) {
      const deck = state.cache[[...state.selected][0]];
      el.title.textContent = deck ? deck.title : '';
      el.source.textContent = deck && deck.source ? deck.source : '';
    } else if (n > 1) {
      el.title.textContent = n + ' sets together';
      el.source.textContent = cards + ' cards';
    } else {
      el.title.textContent = '';
      el.source.textContent = '';
    }
    el.source.hidden = !el.source.textContent;
    document.title = (n === 1 ? el.title.textContent + ' · ' : '') + 'Spanish Flashcards';
  }

  function currentEntry() {
    const i = state.order[state.pos];
    return i === undefined ? null : state.pool[i];
  }

  function render() {
    const entry = currentEntry();
    const empty = !entry;

    el.card.hidden = empty;
    el.studyEmpty.hidden = !empty;
    el.prev.disabled = empty || state.pos === 0;
    el.next.disabled = empty || state.pos >= state.order.length - 1;
    el.flip.disabled = empty;
    el.star.hidden = empty;

    if (empty) {
      el.studyEmpty.textContent = state.filter === 'starred'
        ? 'No starred words in the selected sets yet — tap ☆ on a card to save it here.'
        : 'Tick a set below to start.';
      el.counter.textContent = '0 / 0';
      el.fill.style.width = '0%';
      return;
    }

    const card = entry.card;
    const esFirst = state.dir === 'es-en';
    el.frontLang.textContent = esFirst ? 'Español' : 'English';
    el.backLang.textContent = esFirst ? 'English' : 'Español';
    el.frontText.textContent = esFirst ? card.es : card.en;
    el.backText.textContent = esFirst ? card.en : card.es;
    el.backNote.textContent = card.note || '';
    el.backNote.hidden = !card.note;

    // With several sets in the pile, say which one this card came from.
    const multi = state.selected.size > 1;
    el.frontFrom.textContent = multi ? entry.deckTitle : 'tap to flip';
    el.frontFrom.classList.toggle('is-deck', multi);

    el.counter.textContent = (state.pos + 1) + ' / ' + state.order.length;
    el.fill.style.width = (((state.pos + 1) / state.order.length) * 100) + '%';

    const starred = isStarred(entry);
    el.star.classList.toggle('on', starred);
    el.star.innerHTML = starred ? '&#9733;' : '&#9734;';
  }

  function flip() {
    if (!currentEntry()) return;
    state.flipped = !state.flipped;
    el.card.classList.toggle('flipped', state.flipped);
  }

  // Change cards without letting the answer swap in visibly mid-flip-back.
  function go(delta) {
    const target = state.pos + delta;
    if (target < 0 || target >= state.order.length) return;
    state.pos = target;
    if (state.flipped) {
      state.flipped = false;
      el.card.classList.remove('flipped');
      setTimeout(render, FLIP_MS / 2);
    } else {
      render();
    }
  }

  function toggleStar() {
    const entry = currentEntry();
    if (!entry) return;
    const set = starsFor(entry.slug);
    if (set.has(entry.card.es)) set.delete(entry.card.es);
    else set.add(entry.card.es);
    store.set(starKey(entry.slug), [...set]);
    render();
    renderDeckList();
  }

  function syncTools() {
    el.dir.textContent = state.dir === 'es-en' ? 'ES → EN' : 'EN → ES';
    el.shuffle.textContent = 'Shuffle: ' + (state.shuffle ? 'on' : 'off');
    el.shuffle.classList.toggle('on', state.shuffle);
    el.filter.textContent = state.filter === 'all' ? 'All words' : 'Starred only';
    el.filter.classList.toggle('on', state.filter === 'starred');
  }

  // ---- Events ----
  el.card.addEventListener('click', flip);
  el.card.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
  });
  el.flip.addEventListener('click', flip);
  el.prev.addEventListener('click', () => go(-1));
  el.next.addEventListener('click', () => go(1));
  el.star.addEventListener('click', toggleStar);

  el.selectAll.addEventListener('click', async () => {
    if (state.selected.size === state.index.length) state.selected.clear();
    else state.index.forEach((d) => state.selected.add(d.slug));
    await applySelection();
  });

  el.dir.addEventListener('click', () => {
    state.dir = state.dir === 'es-en' ? 'en-es' : 'es-en';
    store.set('sf:dir', state.dir);
    state.flipped = false;
    el.card.classList.remove('flipped');
    syncTools();
    setTimeout(render, FLIP_MS / 2);
  });

  el.shuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    store.set('sf:shuffle', state.shuffle);
    el.card.classList.remove('flipped');
    rebuildOrder();
    syncTools();
    render();
  });

  el.filter.addEventListener('click', () => {
    state.filter = state.filter === 'all' ? 'starred' : 'all';
    el.card.classList.remove('flipped');
    rebuildOrder();
    syncTools();
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (!state.pool.length) return;
    if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 's' || e.key === 'S') toggleStar();
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); flip(); }
  });

  // Swipe left/right to change cards.
  let touchX = null, touchY = null;
  el.card.addEventListener('touchstart', (e) => {
    touchX = e.changedTouches[0].clientX;
    touchY = e.changedTouches[0].clientY;
  }, { passive: true });
  el.card.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });

  // ---- Init ----
  async function init() {
    try {
      state.index = await (await fetch('/api/decks')).json();
    } catch {
      state.index = [];
    }
    if (!state.index.length) { renderDeckList(); return; }

    const known = (slug) => state.index.some((d) => d.slug === slug);
    const fromHash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const saved = store.get('sf:selected', null) || [store.get('sf:lastDeck', '')];

    let start = (fromHash && known(fromHash)) ? [fromHash] : saved.filter(known);
    if (!start.length) start = [state.index[0].slug];

    state.selected = new Set(start);
    await applySelection();
  }

  init();
})();
