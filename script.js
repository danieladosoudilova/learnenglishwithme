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
  const tabEls   = Array.from(document.querySelectorAll('.tab'));

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

  // ---- tabs ----
  let activeTab = 'vocab';
  tabEls.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
  function switchTab(name) {
    activeTab = name;
    tabEls.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (name === 'vocab') showUnits();
    else if (name === 'quiz') showQuizUnits();
    else showGrammarHome();
  }

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
     QUIZ
     ========================================================= */
  let quiz = null;

  function showQuizUnits() {
    setBack(null);
    titleEl.textContent = 'Quiz';
    const units = Object.entries(DATA.vocab);
    const total = units.reduce((s, [, w]) => s + w.length, 0);

    let html = `<div class="fade-in">
      <p class="intro">${total} words across ${units.length} units. Pick a unit to test yourself — 4 choices per question.</p>
      <div class="list">`;
    for (const [name, words] of units) {
      html += `<button class="card" data-quiz-unit="${esc(name)}">
        <span class="card__badge">${esc(unitShort(name))}</span>
        <span class="card__body">
          <span class="card__title">${esc(name)}</span>
          <span class="card__meta">${words.length} words</span>
        </span>
        <span class="card__chevron">${ICON.chevRSmall}</span>
      </button>`;
    }
    html += `</div><div class="spacer-bottom"></div></div>`;
    render(html);
    screenEl.querySelectorAll('[data-quiz-unit]').forEach(c =>
      c.addEventListener('click', () => openQuiz(c.dataset.quizUnit)));
  }

  function openQuiz(unit) {
    const words = DATA.vocab[unit];
    const allWords = Object.values(DATA.vocab).flat();
    const deck = shuffleArr(words);
    const questions = deck.map(w => {
      const pool = allWords.filter(x => x.cs !== w.cs);
      const wrong = shuffleArr(pool).slice(0, 3).map(x => x.cs);
      const options = shuffleArr([w.cs, ...wrong]);
      return { word: w.word, ipa: w.ipa || '', correct: w.cs, options };
    });
    quiz = { unit, questions, pos: 0, score: 0, answered: false };
    renderQuizQ();
  }

  function renderQuizQ() {
    setBack(showQuizUnits);
    const q = quiz.questions[quiz.pos];
    const total = quiz.questions.length;
    const isLast = quiz.pos + 1 === total;
    titleEl.textContent = quiz.unit;

    render(`<div class="quiz-session fade-in">
      <div class="study__top">
        <span class="progress-pill">${quiz.pos + 1} / ${total}</span>
      </div>
      <div class="bar"><div class="bar__fill" id="barFill"></div></div>
      <div class="qz-card">
        <span class="face__tag">English</span>
        <div class="qz-word">${esc(q.word)}</div>
        ${q.ipa ? `<div class="face__ipa">${esc(q.ipa)}</div>` : ''}
      </div>
      <p class="qz-prompt">Choose the Czech translation:</p>
      <div class="quiz__opts" id="qzOpts">
        ${q.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}
      </div>
      <p class="quiz__fb" id="qzFb" hidden></p>
      <button class="flip-btn qz-next" id="qzNext" hidden>${isLast ? 'See results' : 'Next →'}</button>
    </div><div class="spacer-bottom"></div>`);

    document.getElementById('barFill').style.width = ((quiz.pos + 1) / total * 100) + '%';

    const opts = screenEl.querySelectorAll('.opt');
    const fb   = document.getElementById('qzFb');
    const next = document.getElementById('qzNext');
    const correctIdx = q.options.indexOf(q.correct);

    opts.forEach(btn => btn.addEventListener('click', () => {
      if (quiz.answered) return;
      quiz.answered = true;
      const chosen = +btn.dataset.i;
      opts[correctIdx].classList.add('is-correct');
      if (chosen === correctIdx) {
        quiz.score++;
        fb.textContent = 'Správně! ✓';
        fb.className = 'quiz__fb good';
      } else {
        btn.classList.add('is-wrong');
        fb.textContent = 'Špatně — správně: „' + q.correct + '“';
        fb.className = 'quiz__fb bad';
      }
      fb.hidden = false;
      next.hidden = false;
    }));

    next.addEventListener('click', () => {
      quiz.pos++;
      quiz.answered = false;
      if (quiz.pos < quiz.questions.length) renderQuizQ();
      else showQuizResults();
    });
  }

  function showQuizResults() {
    setBack(showQuizUnits);
    titleEl.textContent = quiz.unit;
    const total = quiz.questions.length;
    const pct = Math.round(quiz.score / total * 100);
    const msg = pct === 100 ? 'Perfektní! 🎉' : pct >= 70 ? 'Výborně! 👏' : 'Zkus to znovu! 💪';

    render(`<div class="qz-results fade-in">
      <div class="qz-ring">${ring(pct)}</div>
      <p class="qz-score">${quiz.score} / ${total} správně</p>
      <p class="qz-msg">${esc(msg)}</p>
      <button class="flip-btn qz-retry" id="retryBtn">Try Again</button>
    </div><div class="spacer-bottom"></div>`);

    document.getElementById('retryBtn').addEventListener('click', () => openQuiz(quiz.unit));
  }

  /* =========================================================
     GRAMMAR — fill in the blank (verb to be)
     ========================================================= */
  const FILL_IN_SENTENCES = [
    { sentence: "I ___ happy.",                   answer: "am",  cs: "Jsem šťastná.",              why: "S 'I' (já) používáme vždy 'am'." },
    { sentence: "She ___ a teacher.",             answer: "is",  cs: "Ona je učitelka.",            why: "S 'she' (ona) používáme 'is'." },
    { sentence: "They ___ from London.",          answer: "are", cs: "Jsou z Londýna.",             why: "S 'they' (oni/ony) používáme 'are'." },
    { sentence: "He ___ my brother.",             answer: "is",  cs: "On je můj bratr.",            why: "S 'he' (on) používáme 'is'." },
    { sentence: "We ___ students.",               answer: "are", cs: "Jsme studenti.",              why: "S 'we' (my) používáme 'are'." },
    { sentence: "It ___ cold today.",             answer: "is",  cs: "Dnes je zima.",               why: "S 'it' (ono/to) používáme 'is'." },
    { sentence: "You ___ very kind.",             answer: "are", cs: "Jsi velmi laskavá.",          why: "S 'you' (ty/vy) používáme 'are'." },
    { sentence: "I ___ at home.",                 answer: "am",  cs: "Jsem doma.",                  why: "S 'I' (já) používáme vždy 'am'." },
    { sentence: "The dog ___ small.",             answer: "is",  cs: "Pes je malý.",                why: "Pes (the dog) je jedna věc/zvíře → 'is'." },
    { sentence: "My parents ___ in Prague.",      answer: "are", cs: "Moji rodiče jsou v Praze.",   why: "Rodiče (parents) je množné číslo → 'are'." },
    { sentence: "Tom and Jana ___ friends.",      answer: "are", cs: "Tom a Jana jsou přátelé.",    why: "Dvě osoby dohromady jsou množné číslo → 'are'." },
    { sentence: "The book ___ on the table.",     answer: "is",  cs: "Kniha je na stole.",          why: "Kniha (the book) je jedna věc → 'is'." },
    { sentence: "I ___ from the Czech Republic.", answer: "am",  cs: "Jsem z České republiky.",     why: "S 'I' (já) používáme vždy 'am'." },
    { sentence: "You ___ right.",                 answer: "are", cs: "Máš pravdu.",                 why: "S 'you' (ty/vy) používáme 'are'." },
    { sentence: "My cat ___ very lazy.",          answer: "is",  cs: "Moje kočka je velmi líná.",   why: "Kočka (my cat) je jedna věc/zvíře → 'is'." },
    { sentence: "We ___ in the garden.",          answer: "are", cs: "Jsme na zahradě.",            why: "S 'we' (my) používáme 'are'." },
    { sentence: "The children ___ tired.",        answer: "are", cs: "Děti jsou unavené.",          why: "Děti (children) je množné číslo → 'are'." },
    { sentence: "He ___ a doctor.",               answer: "is",  cs: "On je doktor.",               why: "S 'he' (on) používáme 'is'." },
    { sentence: "I ___ thirty years old.",        answer: "am",  cs: "Je mi třicet let.",           why: "S 'I' (já) používáme vždy 'am'." },
    { sentence: "The windows ___ open.",          answer: "are", cs: "Okna jsou otevřená.",         why: "Okna (windows) je množné číslo → 'are'." },
  ];

  let fillIn = null;

  function showGrammarHome() {
    setBack(null);
    titleEl.textContent = 'Grammar';
    render(`<div class="fade-in">
      <p class="intro">Doplňuj správný tvar slovesa <em>to be</em> do vět.</p>
      <div class="list">
        <button class="card" id="startFillIn">
          <span class="card__badge">BE</span>
          <span class="card__body">
            <span class="card__title">Sloveso „to be"</span>
            <span class="card__meta">am / is / are · ${FILL_IN_SENTENCES.length} vět</span>
          </span>
          <span class="card__chevron">${ICON.chevRSmall}</span>
        </button>
      </div>
      <div class="spacer-bottom"></div>
    </div>`);
    document.getElementById('startFillIn').addEventListener('click', openFillIn);
  }

  function openFillIn() {
    fillIn = { sentences: shuffleArr(FILL_IN_SENTENCES), pos: 0, score: 0, answered: false };
    renderFillIn();
  }

  function renderFillIn() {
    setBack(showGrammarHome);
    titleEl.textContent = 'Sloveso „to be"';
    const q = fillIn.sentences[fillIn.pos];
    const total = fillIn.sentences.length;
    const isLast = fillIn.pos + 1 === total;
    const sentenceHtml = esc(q.sentence).replace('___', '<span class="fill-blank" id="fillBlank">___</span>');

    render(`<div class="fill-session fade-in">
      <div class="study__top">
        <span class="progress-pill">${fillIn.pos + 1} / ${total}</span>
      </div>
      <div class="bar"><div class="bar__fill" id="barFill"></div></div>
      <div class="fill-card">
        <p class="fill-sentence">${sentenceHtml}</p>
        <p class="fill-cs">${esc(q.cs)}</p>
      </div>
      <div class="fill-opts" id="fillOpts">
        <button class="fill-btn" data-val="am">am</button>
        <button class="fill-btn" data-val="is">is</button>
        <button class="fill-btn" data-val="are">are</button>
      </div>
      <p class="quiz__fb" id="fillFb" hidden></p>
      <button class="flip-btn qz-next" id="fillNext" hidden>${isLast ? 'See results' : 'Next →'}</button>
    </div><div class="spacer-bottom"></div>`);

    document.getElementById('barFill').style.width = ((fillIn.pos + 1) / total * 100) + '%';

    const opts = screenEl.querySelectorAll('.fill-btn');
    const fb   = document.getElementById('fillFb');
    const next = document.getElementById('fillNext');
    const blank = document.getElementById('fillBlank');

    opts.forEach(btn => btn.addEventListener('click', () => {
      if (fillIn.answered) return;
      fillIn.answered = true;
      const chosen = btn.dataset.val;
      blank.textContent = chosen;
      if (chosen === q.answer) {
        fillIn.score++;
        blank.className = 'fill-blank is-correct';
        fb.textContent = 'Správně! ✓';
        fb.className = 'quiz__fb good';
        btn.classList.add('is-correct');
      } else {
        blank.className = 'fill-blank is-wrong';
        btn.classList.add('is-wrong');
        opts.forEach(b => { if (b.dataset.val === q.answer) b.classList.add('is-correct'); });
        fb.innerHTML = 'Špatně — správně je <strong>' + q.answer + '</strong>.<br><span class="fill-why">' + esc(q.why) + '</span>';
        fb.className = 'quiz__fb bad';
      }
      fb.hidden = false;
      next.hidden = false;
    }));

    next.addEventListener('click', () => {
      fillIn.pos++;
      fillIn.answered = false;
      if (fillIn.pos < fillIn.sentences.length) renderFillIn();
      else showFillInResults();
    });
  }

  function showFillInResults() {
    setBack(showGrammarHome);
    titleEl.textContent = 'Sloveso „to be"';
    const total = fillIn.sentences.length;
    const pct = Math.round(fillIn.score / total * 100);
    const msg = pct === 100 ? 'Perfektní! 🎉' : pct >= 70 ? 'Výborně! 👏' : 'Zkus to znovu! 💪';

    render(`<div class="qz-results fade-in">
      <div class="qz-ring">${ring(pct)}</div>
      <p class="qz-score">${fillIn.score} / ${total} správně</p>
      <p class="qz-msg">${esc(msg)}</p>
      <button class="flip-btn qz-retry" id="retryBtn">Try Again</button>
    </div><div class="spacer-bottom"></div>`);

    document.getElementById('retryBtn').addEventListener('click', openFillIn);
  }

  /* =========================================================
     INIT
     ========================================================= */
  async function init() {
    try {
      const r = await fetch('flashcards.json');
      if (!r.ok) throw 0;
      DATA.vocab = await r.json();
      switchTab('vocab');
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
