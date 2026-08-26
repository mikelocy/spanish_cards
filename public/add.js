(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_IMAGES = 4;
  const MAX_EDGE = 1600;   // plenty for reading print; keeps uploads small
  const JPEG_QUALITY = 0.82;

  const el = {
    gate: $('gate'), loginForm: $('login-form'), passcode: $('passcode'), gateError: $('gate-error'),
    pick: $('pick'), files: $('files'), choose: $('choose'), thumbs: $('thumbs'),
    extract: $('extract'), pickError: $('pick-error'),
    working: $('working'),
    review: $('review'), warnings: $('warnings'), title: $('deck-title'), source: $('deck-source'),
    rows: $('rows'), addRow: $('add-row'), cancel: $('cancel'), save: $('save'),
    reviewError: $('review-error'),
    done: $('done'), doneText: $('done-text'),
  };

  let images = [];   // base64 JPEG, no data: prefix
  let photos = [];   // filenames the server kept

  function show(section) {
    for (const key of ['gate', 'pick', 'working', 'review', 'done']) {
      el[key].hidden = key !== section;
    }
  }

  function fail(node, message) {
    node.textContent = message;
    node.hidden = !message;
  }

  // ---- Shrink on the phone, before upload: less data over the wire and
  // fewer image tokens to pay for, with no readable detail lost. ----
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
      img.src = url;
    });
  }

  function renderThumbs() {
    el.thumbs.innerHTML = '';
    images.forEach((data, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';
      const img = document.createElement('img');
      img.src = 'data:image/jpeg;base64,' + data;
      img.alt = 'Photo ' + (i + 1);
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'thumb-x';
      drop.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      drop.textContent = '×';
      drop.addEventListener('click', () => {
        images.splice(i, 1);
        renderThumbs();
      });
      wrap.append(img, drop);
      el.thumbs.appendChild(wrap);
    });
    el.extract.hidden = images.length === 0;
    el.choose.textContent = images.length ? 'Add another photo' : 'Take or choose photos';
  }

  el.choose.addEventListener('click', () => el.files.click());

  el.files.addEventListener('change', async () => {
    fail(el.pickError, '');
    const picked = [...el.files.files];
    el.files.value = '';
    for (const file of picked) {
      if (images.length >= MAX_IMAGES) {
        fail(el.pickError, `That's the limit of ${MAX_IMAGES} photos — save this set, then add another.`);
        break;
      }
      try {
        images.push(await shrink(file));
      } catch {
        fail(el.pickError, 'One of those files was not a readable photo.');
      }
    }
    renderThumbs();
  });

  // ---- Review rows ----
  function addRow(card = { es: '', en: '', note: '', say: '' }) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      '<input class="field es" type="text" placeholder="Español" autocapitalize="none">' +
      '<input class="field en" type="text" placeholder="English">' +
      '<button class="row-x" type="button" aria-label="Remove this row">×</button>';
    row.querySelector('.es').value = card.es || '';
    row.querySelector('.en').value = card.en || '';
    row.dataset.note = card.note || '';
    row.dataset.say = card.say || '';
    row.querySelector('.row-x').addEventListener('click', () => row.remove());
    el.rows.appendChild(row);
    return row;
  }

  function collectRows() {
    return [...el.rows.querySelectorAll('.row')].map((row) => ({
      es: row.querySelector('.es').value.trim(),
      en: row.querySelector('.en').value.trim(),
      note: row.dataset.note || '',
      // A hand-edited Spanish word invalidates a spoken form written for the old one.
      say: row.querySelector('.es').value.trim() === row.dataset.originalEs ? (row.dataset.say || '') : '',
    })).filter((c) => c.es && c.en);
  }

  el.addRow.addEventListener('click', () => addRow());

  // ---- Steps ----
  el.extract.addEventListener('click', async () => {
    fail(el.pickError, '');
    show('working');
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });
      if (res.status === 401) { show('gate'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'that did not work');

      photos = data.photos || [];
      el.title.value = data.title || '';
      el.source.value = data.source || '';
      el.rows.innerHTML = '';
      for (const card of data.cards || []) {
        const row = addRow(card);
        row.dataset.originalEs = card.es || '';
      }

      const warnings = data.warnings || [];
      el.warnings.hidden = warnings.length === 0;
      el.warnings.innerHTML = '';
      if (warnings.length) {
        const heading = document.createElement('p');
        heading.className = 'warn-title';
        heading.textContent = 'Worth a look before you save:';
        const list = document.createElement('ul');
        for (const w of warnings) {
          const li = document.createElement('li');
          li.textContent = w;
          list.appendChild(li);
        }
        el.warnings.append(heading, list);
      }

      show('review');
    } catch (err) {
      show('pick');
      fail(el.pickError, err.message);
    }
  });

  el.save.addEventListener('click', async () => {
    fail(el.reviewError, '');
    const cards = collectRows();
    if (!el.title.value.trim()) return fail(el.reviewError, 'Give the set a name.');
    if (!cards.length) return fail(el.reviewError, 'No complete rows to save.');

    el.save.disabled = true;
    try {
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: el.title.value.trim(),
          source: el.source.value.trim(),
          cards,
          photos,
        }),
      });
      if (res.status === 401) { show('gate'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'could not save');
      el.doneText.textContent =
        `"${el.title.value.trim()}" is live with ${data.count} card${data.count === 1 ? '' : 's'}.`;
      show('done');
    } catch (err) {
      fail(el.reviewError, err.message);
    } finally {
      el.save.disabled = false;
    }
  });

  el.cancel.addEventListener('click', () => {
    images = [];
    photos = [];
    renderThumbs();
    show('pick');
  });

  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    fail(el.gateError, '');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: el.passcode.value }),
      });
      if (!res.ok) throw new Error('That passcode did not work.');
      el.passcode.value = '';
      show('pick');
    } catch (err) {
      fail(el.gateError, err.message);
    }
  });

  // ---- Start ----
  (async () => {
    let session = { authed: false, canExtract: false };
    try {
      session = await (await fetch('/api/session')).json();
    } catch { /* treat as signed out */ }

    if (!session.authed) { show('gate'); return; }
    show('pick');
    if (!session.canExtract) {
      fail(el.pickError, 'The server has no Anthropic API key yet, so reading photos is switched off.');
    }
  })();
})();
