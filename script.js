/* ===========================================================
   Mum is learning English — app logic
   Vanilla JS · no build step · PWA
   =========================================================== */

(() => {
  'use strict';

  // ---- elements ----
  const screenEl = document.getElementById('screen');
  const titleEl  = document.getElementById('appbarTitle');
  const backBtn  = document.getElementById('backBtn');

  // ---- data ----
  const DATA = { vocab: null };

  // ---- persistence ----
  const KNOWN_KEY = 'mile.known.v1';
  const PREF_KEY  = 'mile.prefs.v1';
  const known = new Set(load(KNOWN_KEY, []));
  let prefs   = Object.assign({ direction: 'en-cs', shuffle: false }, load(PREF_KEY, {}));

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  const saveKnown = () => localStorage.setItem(KNOWN_KEY, JSON.stringify([...known]));
  const savePrefs = () => localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  const keyOf = (unit, w) => unit + '::' + w.word;

  // ---- icons ----
  const ICON = {
    chevL: svg('<path d="M15 5l-7 7 7 7"/>', true),
    chevR: svg('<path d="M9 5l7 7-7 7"/>', true),
    chevRSmall: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 21s-7.5-4.7-9.7-9C.9 8.6 2.6 5.5 5.8 5.5c1.8 0 3.2 1 4.2 2.4C11 6.5 12.4 5.5 14.2 5.5c3.2 0 4.9 3.1 3.5 6.5C19.5 16.3 12 21 12 21z"/></svg>'
  };
  function svg(inner, stroke) {
    return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  }

  // ---- helpers ----
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  function render(html) { screenEl.innerHTML = html; screenEl.scrollTop = 0; }
  function shuffleArr(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  let backHandler = null;
  function setBack(handler) {
    backHandler = handler || null;
    backBtn.hidden = !handler;
  }
  backBtn.addEventListener('click', () => backHandler && backHandler());

  // ---- speech ----
  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  /* =========================================================
     VOCABULARY
     ========================================================= */
  function ring(pct) {
    const r = 17, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<svg class="ring" width="46" height="46" viewBox="0 0 46 46">
      <circle class="ring__track" cx="23" cy="23" r="${r}" fill="none" stroke-width="4"/>
      <circle class="ring__fill" cx="23" cy="23" r="${r}" fill="none" stroke-width="4"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 23 23)"/>
      <text class="ring__label" x="23" y="24" text-anchor="middle" dominant-baseline="middle">${pct}%</text>
    </svg>`;
  }
  const unitShort = (name) => (name.replace(/unit/i, '').trim() || '•').slice(0, 3);

  function showUnits() {
    setBack(null);
    titleEl.textContent = 'Vocabulary';
    const units = Object.entries(DATA.vocab);
    const totalWords = units.reduce((s, [, w]) => s + w.length, 0);

    let html = `<div class="fade-in">
      <p class="intro">${units.length} units · ${totalWords} words. Tap a unit to study. Your progress is saved on this device.</p>
      <div class="list">`;
    for (const [name, words] of units) {
      const learned = words.filter(w => known.has(keyOf(name, w))).length;
      const pct = words.length ? Math.round(learned / words.length * 100) : 0;
      html += `<button class="card" data-unit="${esc(name)}">
        <span class="card__badge">${esc(unitShort(name))}</span>
        <span class="card__body">
          <span class="card__title">${esc(name)}</span>
          <span class="card__meta">${learned} / ${words.length} learned</span>
        </span>
        ${ring(pct)}
      </button>`;
    }
    html += `</div><div class="spacer-bottom"></div></div>`;
    render(html);
    screenEl.querySelectorAll('[data-unit]').forEach(c =>
      c.addEventListener('click', () => openStudy(c.dataset.unit)));
  }

  // ---- study session ----
  let study = null;

  function buildDeck(unit) {
    let deck = DATA.vocab[unit].map(w => w);
    if (prefs.shuffle) deck = shuffleArr(deck);
    return deck;
  }
  function openStudy(unit) {
    study = { unit, deck: buildDeck(unit), pos: 0 };
    renderStudy();
  }

  function renderStudy() {
    setBack(showUnits);
    titleEl.textContent = study.unit;
    const d = prefs.direction;
    render(`<div class="study fade-in">
      <div class="study__top">
        <span class="progress-pill" id="progPill"></span>
        <div class="study__tools">
          <button class="tool" id="knownBtn" aria-label="Mark as known">${ICON.heart}</button>
          <button class="tool ${prefs.shuffle ? 'is-on' : ''}" id="shuffleBtn" aria-label="Shuffle">${ICON.shuffle}</button>
        </div>
      </div>
      <div class="center-row">
        <div class="segmented" id="dirSeg">
          <button data-dir="en-cs" class="${d === 'en-cs' ? 'is-on' : ''}">EN → CZ</button>
          <button data-dir="cs-en" class="${d === 'cs-en' ? 'is-on' : ''}">CZ → EN</button>
        </div>
      </div>
      <div class="bar"><div class="bar__fill" id="barFill"></div></div>
      <div class="flash" id="flash">
        <div class="flash__inner">
          <div class="face face--front"></div>
          <div class="face face--back"></div>
        </div>
      </div>
      <div class="controls">
        <button class="nav-btn" id="prevBtn" aria-label="Previous">${ICON.chevL}</button>
        <button class="flip-btn" id="flipBtn">Flip</button>
        <button class="nav-btn" id="nextBtn" aria-label="Next">${ICON.chevR}</button>
      </div>
    </div>`);

    const flash = document.getElementById('flash');

    // flip on card tap / button
    flash.addEventListener('click', () => { if (!flash._swiped) toggleFlip(); flash._swiped = false; });
    document.getElementById('flipBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFlip(); });

    // swipe to navigate
    let sx = null, sy = null;
    flash.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; flash._swiped = false; }, { passive: true });
    flash.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { flash._swiped = true; go(dx < 0 ? 1 : -1); }
      sx = sy = null;
    }, { passive: true });

    document.getElementById('prevBtn').addEventListener('click', () => go(-1));
    document.getElementById('nextBtn').addEventListener('click', () => go(1));

    document.getElementById('knownBtn').addEventListener('click', toggleKnown);
    document.getElementById('shuffleBtn').addEventListener('click', () => {
      prefs.shuffle = !prefs.shuffle; savePrefs();
      study.deck = buildDeck(study.unit); study.pos = 0;
      renderStudy();
    });
    document.querySelectorAll('#dirSeg button').forEach(b =>
      b.addEventListener('click', () => {
        prefs.direction = b.dataset.dir; savePrefs();
        document.querySelectorAll('#dirSeg button').forEach(x => x.classList.toggle('is-on', x === b));
        updateCard();
      }));

    updateCard();
  }

  const cur = () => study.deck[study.pos];

  function updateCard() {
    const w = cur(), total = study.deck.length;
    const flash = document.getElementById('flash');
    flash.classList.remove('is-flipped');

    document.getElementById('progPill').textContent = `${study.pos + 1} / ${total}`;
    document.getElementById('barFill').style.width = ((study.pos + 1) / total * 100) + '%';

    const listen = `<button class="face__speak" data-speak="${esc(w.word)}">🔊 Listen</button>`;
    const en = `<span class="face__tag">English</span>
      <div class="face__word">${esc(w.word)}</div>
      <div class="face__ipa">${esc(w.ipa || '')}</div>${listen}`;
    const cs = `<span class="face__tag">Česky</span><div class="face__word">${esc(w.cs)}</div>`;

    const front = flash.querySelector('.face--front');
    const back  = flash.querySelector('.face--back');
    if (prefs.direction === 'en-cs') {
      front.innerHTML = en + `<span class="face__hint">tap to flip</span>`;
      back.innerHTML  = cs + `<span class="face__hint">tap to flip back</span>`;
    } else {
      front.innerHTML = cs + `<span class="face__hint">tap to flip</span>`;
      back.innerHTML  = en + `<span class="face__hint">tap to flip back</span>`;
    }

    flash.querySelectorAll('[data-speak]').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); speak(b.dataset.speak); }));

    document.getElementById('knownBtn').classList.toggle('is-on', known.has(keyOf(study.unit, w)));
    document.getElementById('prevBtn').disabled = study.pos === 0;
    document.getElementById('nextBtn').disabled = study.pos === total - 1;
  }

  function toggleFlip() {
    document.getElementById('flash').classList.toggle('is-flipped');
  }
  function go(delta) {
    const n = study.pos + delta;
    if (n < 0 || n >= study.deck.length) return;
    study.pos = n;
    updateCard();
  }
  function toggleKnown() {
    const k = keyOf(study.unit, cur());
    known.has(k) ? known.delete(k) : known.add(k);
    saveKnown();
    document.getElementById('knownBtn').classList.toggle('is-on', known.has(k));
  }

  // keyboard (desktop)
  document.addEventListener('keydown', e => {
    if (!document.getElementById('flash')) return;
    if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleFlip(); }
  });

  /* =========================================================
     INIT
     ========================================================= */
  async function init() {
    try {
      const r = await fetch('flashcards.json');
      if (!r.ok) throw 0;
      DATA.vocab = await r.json();
      showUnits();
    } catch (e) {
      render(`<div class="error">Couldn't load the lessons.<br><br>
        Please open this app through a web address (http/https), not by double-clicking the file.</div>`);
    }
  }
  init();

  // service worker (only works over https / localhost)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
