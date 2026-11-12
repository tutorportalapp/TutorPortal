// Library: browse past papers and individual questions, star favourites, filter, shuffle, build.
(() => {
  const { el } = TPR;
  const $ = (id) => document.getElementById(id);
  const PAGE = 10;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

  const moduleOf = {};
  for (const [m, ts] of Object.entries(TP.MODULES)) ts.forEach((t) => (moduleOf[t] = m));

  let DIAG = {}, UNITS = [], PAPERS = [];
  const f = { school: '', year: '', topic: '', level: '', type: '', star: false, text: '', view: 'papers', sort: 'school', page: 0 };
  let openKey = null;
  let rank = null; // Map unitKey -> random number while shuffled

  const paperKey = (x) => `${x.school}|${x.year}`;

  function prepare(rows) {
    UNITS = TPR.buildUnits(rows);
    UNITS.forEach((u) => {
      u.level = TPR.level(u);
      u.topics = TPR.topicsOf(u);
      u.subs = TPR.subtopicsOf(u);
      u.marks = TPR.totalMarks(u);
      u.modules = new Set(u.topics.map((t) => moduleOf[t]).filter(Boolean));
      u.search = `${u.school} ${u.year} ${u.topics.join(' ')} ${u.subs.join(' ')} ${u.parts.map((p) => p.x).join(' ')}`.toLowerCase();
    });
    const map = new Map();
    for (const u of UNITS) {
      const k = paperKey(u);
      if (!map.has(k)) map.set(k, { key: k, school: u.school, year: u.year, units: [], mc: 0, wr: 0, marks: 0, modules: new Set(), levels: new Set(), topics: new Set() });
      const p = map.get(k);
      p.units.push(u);
      u.sec === 'I' ? p.mc++ : p.wr++;
      p.marks += u.marks;
      u.modules.forEach((m) => p.modules.add(m));
      u.topics.forEach((t) => p.topics.add(t));
      p.levels.add(u.level);
    }
    PAPERS = [...map.values()];
  }

  // ---- filters ----
  const topicOk = (topics) => {
    if (!f.topic) return true;
    const [kind, name] = [f.topic[0], f.topic.slice(2)];
    const list = [...topics];
    return kind === 'm' ? list.some((t) => moduleOf[t] === name) : list.includes(name);
  };
  const text = () => f.text.trim().toLowerCase();
  const unitOk = (u) =>
    (!f.school || u.school === f.school) &&
    (!f.year || u.year === Number(f.year)) &&
    topicOk(u.topics) &&
    (!f.level || u.level === Number(f.level)) &&
    (!f.type || u.sec === f.type) &&
    (!f.star || TP.favs.has('question', u.key)) &&
    (!text() || text().split(/\s+/).every((w) => u.search.includes(w)));
  const paperOk = (p) =>
    (!f.school || p.school === f.school) &&
    (!f.year || p.year === Number(f.year)) &&
    topicOk(p.topics) &&
    (!f.level || p.levels.has(Number(f.level))) &&
    (!f.star || TP.favs.has('paper', p.key)) &&
    (!text() || `${p.school} ${p.year}`.toLowerCase().includes(text()));

  function fillDropdowns() {
    const opt = (v, t) => el('option', { value: String(v), text: t });
    const sel = (id, first, items) => { const s = $(id); s.innerHTML = ''; s.append(opt('', first), ...items); };
    sel('fSchool', 'All schools', [...new Set(PAPERS.map((p) => p.school))].sort().map((s) => opt(s, s)));
    sel('fYear', 'All years', [...new Set(PAPERS.map((p) => p.year))].sort((a, b) => b - a).map((y) => opt(y, y)));
    sel('fLevel', 'All difficulties', [1, 2, 3, 4, 5].map((d) => opt(d, TPR.LEVELS[d])));
    const t = $('fTopic');
    t.innerHTML = '';
    t.append(opt('', 'All topics'));
    for (const [mod, topics] of Object.entries(TP.MODULES)) {
      const g = el('optgroup', { label: mod });
      g.append(opt(`m:${mod}`, `All ${mod}`), ...topics.map((x) => opt(`t:${x}`, x)));
      t.append(g);
    }
  }

  // ---- star button ----
  function starBtn(kind, key) {
    const b = el('button', { class: 'star' + (TP.favs.has(kind, key) ? ' on' : ''), type: 'button', 'aria-label': 'Star', 'aria-pressed': String(TP.favs.has(kind, key)) });
    b.innerHTML = STAR;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const on = await TP.favs.toggle(kind, key);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      if (f.star) draw();
    });
    return b;
  }

  // ---- papers view ----
  function drawPapers() {
    const list = PAPERS.filter(paperOk);
    const qs = list.reduce((s, p) => s + p.units.length, 0);
    const years = list.map((p) => p.year);
    const range = years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`) : '–';
    $('strip').innerHTML = [['Papers', list.length], ['Questions', qs], ['Schools', new Set(list.map((p) => p.school)).size], ['Years covered', range]]
      .map(([l, v]) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`).join('');
    $('shown').textContent = `Showing ${list.length} of ${PAPERS.length} papers`;
    $('sort').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === f.sort));

    const L = $('list');
    L.innerHTML = '';
    if (!list.length) { L.append(el('p', { class: 'empty', text: f.star ? 'No starred papers match those filters.' : 'No papers match those filters.' })); return; }
    const bySchool = f.sort === 'school';
    const sorted = list.slice().sort((a, b) =>
      f.sort === 'newest' ? b.year - a.year || a.school.localeCompare(b.school)
      : f.sort === 'year' ? a.year - b.year || a.school.localeCompare(b.school)
      : a.school.localeCompare(b.school) || b.year - a.year);
    let lastSchool = null, n = 0;
    sorted.forEach((p) => {
      if (bySchool && p.school !== lastSchool) {
        lastSchool = p.school;
        const g = sorted.filter((x) => x.school === p.school);
        L.append(el('div', { class: 'grp' }, el('h3', { text: p.school }), el('span', { text: `${g.length} paper${g.length === 1 ? '' : 's'}` })));
      }
      n++;
      const isOpen = openKey === p.key;
      const row = el('div', { class: 'irow' + (isOpen ? ' open' : ''), role: 'button', tabindex: '0', 'aria-expanded': String(isOpen) },
        starBtn('paper', p.key),
        el('span', { class: 'yr', text: bySchool ? String(p.year) : String(n).padStart(2, '0') }),
        el('span', { class: 'nm', text: `${p.school} ${p.year}` }),
        el('span', { class: 'c', text: `${p.units.length} questions` }),
        el('span', { class: 'c', text: `${p.marks} marks` }),
        el('span', { class: 'b' }, el('span', { class: 'badge', text: 'Trial' })));
      const toggle = () => { openKey = isOpen ? null : p.key; draw(); };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => { if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } });
      L.append(row);
      if (isOpen) {
        const tags = el('div', { class: 'tags' });
        [...p.modules].sort().forEach((m) => tags.append(el('span', { class: 'badge', text: m })));
        const view = el('button', { class: 'btn', text: 'View its questions' });
        view.addEventListener('click', () => { f.school = p.school; f.year = String(p.year); f.view = 'questions'; f.page = 0; sync(); draw(); window.scrollTo(0, 0); });
        L.append(el('div', { class: 'detail' },
          el('div', {},
            el('div', { class: 't', text: `${p.school} ${p.year} · Maths Advanced` }),
            el('p', { text: `${p.mc} multiple choice · ${p.wr} written response · ${p.marks} marks` }),
            tags),
          el('div', { class: 'h-acts' }, view,
            el('a', { class: 'btn primary', href: `builder.html?school=${encodeURIComponent(p.school)}`, text: `Build from ${p.school}` }))));
      }
    });
  }

  // ---- questions view ----
  function card(u) {
    const kind = u.sec === 'I' ? 'Multiple choice' : 'Written response';
    const meta = el('div', { class: 'qc-meta' }, document.createTextNode(`${u.school} ${u.year}`),
      el('span', { text: ` · ${TPR.partLabel(u)} · ` }), document.createTextNode(kind),
      el('span', { text: ` · ${u.marks} mark${u.marks === 1 ? '' : 's'}` }));
    const dots = el('span', { class: 'dots', title: TPR.LEVELS[u.level] });
    for (let i = 1; i <= 5; i++) dots.append(el('i', { class: i <= u.level ? 'on' : '' }));
    const tags = el('div', { class: 'qc-tags' });
    u.topics.forEach((t) => tags.append(el('span', { class: 'badge topic', text: t })));
    u.subs.forEach((t) => tags.append(el('span', { class: 'badge sub', text: t })));
    tags.append(dots);
    return el('article', { class: 'qcard' },
      el('div', { class: 'qc-head' }, meta, starBtn('question', u.key)),
      tags,
      el('div', { class: 'qpaper' }, TPR.renderUnit(u, null, DIAG)));
  }

  function drawQuestions() {
    let list = UNITS.filter(unitOk);
    list.sort((a, b) => (rank
      ? (rank.get(a.key) || 0) - (rank.get(b.key) || 0)
      : a.school.localeCompare(b.school) || b.year - a.year || (a.sec === b.sec ? 0 : a.sec === 'I' ? -1 : 1) || Number(a.q) - Number(b.q)));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    f.page = Math.min(f.page, pages - 1);
    $('shown').textContent = `${list.length} of ${UNITS.length} questions${rank ? ' · shuffled' : ''}`;
    $('unshuffle').hidden = !rank;
    const L = $('qlist');
    L.innerHTML = '';
    if (!list.length) L.append(el('p', { class: 'empty', text: f.star ? 'No starred questions match those filters.' : 'No questions match those filters.' }));
    list.slice(f.page * PAGE, f.page * PAGE + PAGE).forEach((u) => L.append(card(u)));

    const P = $('pager');
    P.innerHTML = '';
    if (list.length > PAGE) {
      const go = (d) => () => { f.page += d; draw(); $('questionsView').scrollIntoView(); };
      const prev = el('button', { class: 'btn', text: '← Previous' });
      const next = el('button', { class: 'btn', text: 'Next →' });
      prev.disabled = f.page === 0;
      next.disabled = f.page >= pages - 1;
      prev.addEventListener('click', go(-1));
      next.addEventListener('click', go(1));
      P.append(prev, el('span', { text: `Page ${f.page + 1} of ${pages}` }), next);
    }
  }

  function draw() {
    const q = f.view === 'questions';
    $('papersView').hidden = q;
    $('questionsView').hidden = !q;
    $('typeBox').hidden = !q;
    $('view').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === f.view));
    $('sub').textContent = q
      ? 'Every question in the database. Star the ones you like and filter to your starred list.'
      : 'Past trial papers in the database. Click a paper for details, or use the filters to narrow the list.';
    q ? drawQuestions() : drawPapers();
  }

  // keep the dropdowns showing the state (e.g. after "View its questions")
  const sync = () => {
    $('fSchool').value = f.school; $('fYear').value = f.year; $('fTopic').value = f.topic;
    $('fLevel').value = f.level; $('fType').value = f.type; $('fStar').checked = f.star; $('q').value = f.text;
  };

  function wire() {
    const on = (id, key, conv = (v) => v) => $(id).addEventListener('change', () => { f[key] = conv($(id).value); f.page = 0; draw(); });
    on('fSchool', 'school'); on('fYear', 'year'); on('fTopic', 'topic'); on('fLevel', 'level'); on('fType', 'type');
    $('fStar').addEventListener('change', () => { f.star = $('fStar').checked; f.page = 0; draw(); });
    $('q').addEventListener('input', () => { f.text = $('q').value; f.page = 0; draw(); });
    $('sort').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.sort = b.dataset.s; draw(); } });
    $('view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.view = b.dataset.v; f.page = 0; draw(); } });
    $('shuffle').addEventListener('click', () => { rank = new Map(UNITS.map((u) => [u.key, Math.random()])); f.page = 0; draw(); });
    $('unshuffle').addEventListener('click', () => { rank = null; f.page = 0; draw(); });
    $('reset').addEventListener('click', () => { Object.assign(f, { school: '', year: '', topic: '', level: '', type: '', star: false, text: '', page: 0 }); sync(); draw(); });
  }

  TP.requireLogin()
    .then(() => { $('gate-main').hidden = false; return Promise.all([TP.loadData(), TP.favs.load()]); })
    .then(([[rows, diag]]) => {
      DIAG = diag;
      prepare(rows);
      TP.stats(rows);
      fillDropdowns();
      wire();
      const qs = new URLSearchParams(location.search);
      if (qs.get('view') === 'questions') f.view = 'questions';
      draw();
      if (qs.get('focus')) $('q').focus();
    })
    .catch(() => { $('gate-main').hidden = false; $('sub').textContent = 'Could not load the library. Please refresh or log in again.'; });
})();
