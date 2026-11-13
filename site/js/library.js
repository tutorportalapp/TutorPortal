// Library: browse past papers and individual questions, star favourites, filter, shuffle, build.
(() => {
  const { el } = TPR;
  const $ = (id) => document.getElementById(id);
  const PAGE = 10;
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

  const moduleOf = {};
  for (const [m, ts] of Object.entries(TP.MODULES)) ts.forEach((t) => (moduleOf[t] = m));

  let DIAG = {}, UNITS = [], PAPERS = [];
  const f = { school: new Set(), year: new Set(), topic: new Set(), level: new Set(), type: new Set(), star: false, text: '', view: 'papers', sort: 'school', page: 0 };
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
  const none = (set) => set.size === 0;
  const topicOk = (topics) => none(f.topic) || [...topics].some((t) => f.topic.has(t));
  const text = () => f.text.trim().toLowerCase();
  const unitOk = (u) =>
    (none(f.school) || f.school.has(u.school)) &&
    (none(f.year) || f.year.has(String(u.year))) &&
    topicOk(u.topics) &&
    (none(f.level) || f.level.has(String(u.level))) &&
    (none(f.type) || f.type.has(u.sec)) &&
    (!f.star || TP.favs.has('question', u.key)) &&
    (!text() || text().split(/\s+/).every((w) => u.search.includes(w)));
  const paperOk = (p) =>
    (none(f.school) || f.school.has(p.school)) &&
    (none(f.year) || f.year.has(String(p.year))) &&
    topicOk(p.topics) &&
    (none(f.level) || [...p.levels].some((l) => f.level.has(String(l)))) &&
    (!f.star || TP.favs.has('paper', p.key)) &&
    (!text() || `${p.school} ${p.year}`.toLowerCase().includes(text()));

  // Expanding checkbox filters, the same system as the builder's topic groups. Nothing ticked means all.
  const boxes = []; // { key, value, input }
  const counters = []; // functions that refresh each group's "All / n chosen" label
  function group(key, title, items, opts = {}) {
    const count = el('small', { text: 'All' });
    const inner = el('div', { class: 'inner' });
    const inputs = items.map(([value, label, n]) => {
      const cb = el('input', { type: 'checkbox', value: String(value) });
      cb.addEventListener('change', () => { cb.checked ? f[key].add(String(value)) : f[key].delete(String(value)); f.page = 0; refresh(); draw(); });
      boxes.push({ key, value: String(value), input: cb });
      inner.append(el('label', { class: 'fitem' }, el('span', { class: 'l' }, cb, label), el('span', { class: 'n', text: String(n) })));
      return cb;
    });
    const all = el('input', { type: 'checkbox' });
    if (opts.selectAll) {
      inner.prepend(el('label', { class: 'fitem all' }, el('span', { class: 'l' }, all, 'Select all')));
      all.addEventListener('change', () => { inputs.forEach((cb) => { cb.checked = all.checked; all.checked ? f[key].add(cb.value) : f[key].delete(cb.value); }); f.page = 0; refresh(); draw(); });
    }
    counters.push(() => { const n = inputs.filter((c) => c.checked).length; count.textContent = n === 0 ? 'All' : `${n} chosen`; all.checked = n === inputs.length; });
    const d = el('details', { class: 'group' + (opts.top ? ' top' : '') }, el('summary', {}, el('span', { class: 't', text: title }), count), inner);
    if (opts.id) d.id = opts.id;
    return d;
  }
  const refresh = () => counters.forEach((c) => c());
  const countBy = (fn) => (v) => UNITS.filter((u) => fn(u, v)).length;

  function fillFilters() {
    const F = $('filters');
    F.innerHTML = '';
    const schools = [...new Set(PAPERS.map((p) => p.school))].sort();
    const years = [...new Set(PAPERS.map((p) => p.year))].sort((a, b) => b - a);
    F.append(
      group('school', 'School', schools.map((s) => [s, s, countBy((u, v) => u.school === v)(s)]), { top: true }),
      group('year', 'Year', years.map((y) => [y, y, countBy((u, v) => u.year === v)(y)]), { top: true }),
      group('level', 'Difficulty', [1, 2, 3, 4, 5].map((d) => [d, TPR.LEVELS[d], countBy((u, v) => u.level === v)(d)]), { top: true }),
      group('type', 'Question type', [['I', 'Multiple choice', countBy((u) => u.sec === 'I')()], ['II', 'Written response', countBy((u) => u.sec === 'II')()]], { top: true, id: 'typeBox' }));
    const T = $('topics');
    T.innerHTML = '';
    for (const [mod, topics] of Object.entries(TP.MODULES)) {
      T.append(group('topic', mod, topics.map((t) => [t, t, countBy((u, v) => u.topics.includes(v))(t)]), { selectAll: true }));
    }
  }

  // ---- star button ----
  function starBtn(kind, key, what) {
    const b = el('button', { class: 'star' + (TP.favs.has(kind, key) ? ' on' : ''), type: 'button', 'aria-label': `Star ${what}`, title: 'Star', 'aria-pressed': String(TP.favs.has(kind, key)) });
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

  function emptyFor(what) {
    const reset = () => { for (const k of ['school', 'year', 'topic', 'level', 'type']) f[k].clear(); Object.assign(f, { star: false, text: '', page: 0 }); sync(); draw(); };
    const noFilters = !f.text && ['school', 'year', 'topic', 'level', 'type'].every((k) => f[k].size === 0);
    if (f.star && noFilters) {
      return TPUI.empty(`No starred ${what} yet`, `Click the star beside a ${what === 'papers' ? 'paper' : 'question'} to save it here for next time.`, [{ label: `Show all ${what}`, onClick: reset, primary: true }]);
    }
    return TPUI.empty(`No ${what} match those filters`, 'Try removing a filter or searching for something broader.', [{ label: 'Clear filters', onClick: reset, primary: true }]);
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
    $('sort').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.s === f.sort); b.setAttribute('aria-pressed', String(b.dataset.s === f.sort)); });

    const L = $('list');
    L.innerHTML = '';
    if (!list.length) { L.append(emptyFor('papers')); return; }
    const bySchool = f.sort === 'school';
    const sorted = list.slice().sort((a, b) =>
      f.sort === 'year' ? a.year - b.year || a.school.localeCompare(b.school)
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
        starBtn('paper', p.key, `${p.school} ${p.year}`),
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
        view.addEventListener('click', () => { f.school = new Set([p.school]); f.year = new Set([String(p.year)]); f.view = 'questions'; f.page = 0; sync(); draw(); window.scrollTo(0, 0); });
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
    tags.append(dots);
    return el('article', { class: 'qcard' },
      el('div', { class: 'qc-head' }, meta, starBtn('question', u.key, `${u.school} ${u.year} ${TPR.partLabel(u)}`)),
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
    if (!list.length) L.append(emptyFor('questions'));
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
    $('view').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === f.view); b.setAttribute('aria-pressed', String(b.dataset.v === f.view)); });
    $('sub').textContent = q
      ? 'Every question in the database. Star the ones you like and filter to your starred list.'
      : 'Past trial papers in the database. Click a paper for details, or use the filters to narrow the list.';
    q ? drawQuestions() : drawPapers();
  }

  const setStarBox = () => { $('starBox').classList.toggle('on', f.star); $('starBox').setAttribute('aria-pressed', String(f.star)); };

  // keep the filter boxes showing the state (e.g. after "View its questions")
  const sync = () => {
    boxes.forEach((b) => (b.input.checked = f[b.key].has(b.value)));
    $('q').value = f.text;
    setStarBox();
    refresh();
  };

  function wire() {
    $('starBox').addEventListener('click', () => { f.star = !f.star; setStarBox(); f.page = 0; draw(); });
    $('q').addEventListener('input', () => { f.text = $('q').value; f.page = 0; draw(); });
    $('sort').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.sort = b.dataset.s; draw(); } });
    $('view').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.view = b.dataset.v; f.page = 0; draw(); } });
    $('shuffle').addEventListener('click', () => { rank = new Map(UNITS.map((u) => [u.key, Math.random()])); f.page = 0; draw(); });
    $('unshuffle').addEventListener('click', () => { rank = null; f.page = 0; draw(); });
    $('reset').addEventListener('click', () => { for (const k of ['school', 'year', 'topic', 'level', 'type']) f[k].clear(); Object.assign(f, { star: false, text: '', page: 0 }); sync(); draw(); });
  }

  TP.requireLogin()
    .then(() => { $('gate-main').hidden = false; return Promise.all([TP.loadData(), TP.favs.load()]); })
    .then(([[rows, diag]]) => {
      DIAG = diag;
      prepare(rows);
      TP.stats(rows);
      fillFilters();
      wire();
      const qs = new URLSearchParams(location.search);
      if (qs.get('view') === 'questions') f.view = 'questions';
      draw();
      if (qs.get('focus')) $('q').focus();
    })
    .catch(() => { $('gate-main').hidden = false; $('sub').textContent = 'Could not load the library. Please refresh or log in again.'; });
})();
