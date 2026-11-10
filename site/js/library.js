// Library: browse every paper in the database, filter, and jump to the builder.
(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v);
    }
    kids.forEach((c) => n.append(c));
    return n;
  };
  const topicModule = {};
  for (const [m, ts] of Object.entries(TP.MODULES)) ts.forEach((t) => (topicModule[t] = m));

  let PAPERS = [];
  const f = { year: null, school: null, module: null, text: '', sort: 'school' };
  let openKey = null;

  function build(rows) {
    const map = new Map();
    for (const r of rows) {
      const k = `${r.s}|${r.y}`;
      if (!map.has(k)) map.set(k, { key: k, school: r.s, year: r.y, units: new Set(), mc: new Set(), wr: new Set(), marks: 0, modules: new Set() });
      const p = map.get(k);
      const u = `${r.sec}|${r.q}`;
      p.units.add(u);
      (r.sec === 'I' ? p.mc : p.wr).add(u);
      p.marks += r.m || 0;
      (r.t || []).forEach((t) => topicModule[t] && p.modules.add(topicModule[t]));
    }
    PAPERS = [...map.values()];
  }

  const text = () => f.text.trim().toLowerCase();
  const matches = (p, skip = '') =>
    (skip === 'year' || f.year == null || p.year === f.year) &&
    (skip === 'school' || !f.school || p.school === f.school) &&
    (skip === 'module' || !f.module || p.modules.has(f.module)) &&
    (!text() || `${p.school} ${p.year}`.toLowerCase().includes(text()));

  function facet(box, items, key, label = (x) => x) {
    box.innerHTML = '';
    const all = el('button', { class: 'fitem' + (f[key] == null || f[key] === '' ? ' on' : '') }, el('span', { text: 'All' }));
    all.addEventListener('click', () => { f[key] = null; draw(); });
    box.append(all);
    items.forEach(([v, n]) => {
      const b = el('button', { class: 'fitem' + (f[key] === v ? ' on' : '') }, el('span', { text: label(v) }), el('span', { class: 'n', text: String(n) }));
      b.addEventListener('click', () => { f[key] = f[key] === v ? null : v; draw(); });
      box.append(b);
    });
  }
  const tally = (list, fn) => { const m = new Map(); list.forEach((p) => [].concat(fn(p)).forEach((v) => m.set(v, (m.get(v) || 0) + 1))); return m; };

  function draw() {
    // facets count papers that match every OTHER filter
    facet($('fYear'), [...tally(PAPERS.filter((p) => matches(p, 'year')), (p) => p.year)].sort((a, b) => b[0] - a[0]), 'year');
    facet($('fSchool'), [...tally(PAPERS.filter((p) => matches(p, 'school')), (p) => p.school)].sort(), 'school');
    facet($('fTopic'), [...tally(PAPERS.filter((p) => matches(p, 'module')), (p) => [...p.modules])].sort(), 'module');

    const list = PAPERS.filter((p) => matches(p));
    const qs = list.reduce((s, p) => s + p.units.size, 0);
    const schools = new Set(list.map((p) => p.school)).size;
    const years = list.map((p) => p.year);
    const range = years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`) : '–';
    $('strip').innerHTML = [['Papers', list.length], ['Questions', qs], ['Schools', schools], ['Years covered', range]]
      .map(([l, v]) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`).join('');
    $('shown').textContent = `Showing ${list.length} of ${PAPERS.length} papers`;
    $('sub').textContent = `Past trial papers in the database. Click a paper for details, or use the filters to narrow the list.`;
    $('sort').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.s === f.sort));

    const L = $('list');
    L.innerHTML = '';
    if (!list.length) { L.append(el('p', { class: 'empty', text: 'No papers match those filters.' })); return; }
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
      const row = el('button', { class: 'irow' + (openKey === p.key ? ' open' : ''), 'aria-expanded': String(openKey === p.key) },
        el('span', { class: 'yr', text: bySchool ? String(p.year) : String(n).padStart(2, '0') }),
        el('span', { class: 'nm' }, document.createTextNode(bySchool ? `${p.school} ${p.year}` : `${p.school} ${p.year}`)),
        el('span', { class: 'c', text: `${p.units.size} questions` }),
        el('span', { class: 'c', text: `${p.marks} marks` }),
        el('span', { class: 'b' }, el('span', { class: 'badge', text: 'Trial' })));
      row.addEventListener('click', () => { openKey = openKey === p.key ? null : p.key; draw(); });
      L.append(row);
      if (openKey === p.key) {
        const tags = el('div', { class: 'tags' });
        [...p.modules].sort().forEach((m) => tags.append(el('span', { class: 'badge', text: m })));
        L.append(el('div', { class: 'detail' },
          el('div', {},
            el('div', { class: 't', text: `${p.school} ${p.year} · Maths Advanced` }),
            el('p', { text: `${p.mc.size} multiple choice · ${p.wr.size} written response · ${p.marks} marks` }),
            tags),
          el('a', { class: 'btn primary', href: `builder.html?school=${encodeURIComponent(p.school)}`, text: `Build from ${p.school}` })));
      }
    });
  }

  $('q').addEventListener('input', () => { f.text = $('q').value; draw(); });
  $('sort').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { f.sort = b.dataset.s; draw(); } });

  TP.requireLogin()
    .then(() => { $('gate-main').hidden = false; return TP.loadData(); })
    .then(([rows]) => {
      build(rows);
      TP.stats(rows);
      draw();
      if (new URLSearchParams(location.search).get('focus')) $('q').focus();
    })
    .catch(() => { $('gate-main').hidden = false; $('sub').textContent = 'Could not load the papers. Please refresh or log in again.'; });
})();
