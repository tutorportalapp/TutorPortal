// TutorPortal paper builder.
// Data rows (one per question part): id, y(ear), s(chool), sec, q, p(art), m(arks), d(escription),
// g(roups), t(opics), st, mt, cr, df (difficulty), oc, a(nswer), n(ote), x (question text).
(() => {
  const MODULES = {
    'Functions & Algebra': ['Functions & Algebra', 'Exponentials & Logarithms'],
    'Trigonometry': ['Trigonometry', 'Trigonometric Functions & Identities'],
    'Calculus': ['Differentiation', 'Applications of Differentiation', 'Integration', 'Applications of Integration'],
    'Sequences and Series': ['Sequences & Series', 'Financial Mathematics'],
    'Probability and Statistics': ['Probability', 'Random Variables & Normal Distribution', 'Statistical Analysis'],
  };

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

  let ROWS = [];
  let DIAG = {};
  let UNITS = [];
  let current = null; // { mc: [], wr: [] }
  let currentId = null; // history record for the paper on screen

  // ---- data ----
  const unitKey = (r) => `${r.s}|${r.y}|${r.sec}|${r.q}`;
  function buildUnits() {
    const map = new Map();
    for (const r of ROWS) {
      const k = unitKey(r);
      if (!map.has(k)) map.set(k, { key: k, school: r.s, year: r.y, sec: r.sec, q: r.q, parts: [] });
      map.get(k).parts.push(r);
    }
    UNITS = [...map.values()];
  }

  // ---- selection state ----
  const selectedSchools = () => [...document.querySelectorAll('#schools input:checked')].map((i) => i.value);
  const selectedTopics = () => [...document.querySelectorAll('#topics input.t:checked')].map((i) => i.value);

  function eligible() {
    const schools = new Set(selectedSchools());
    const topics = new Set(selectedTopics());
    const ok = (u) =>
      schools.has(u.school) && (topics.size === 0 || u.parts.some((p) => p.t.some((t) => topics.has(t))));
    const pool = UNITS.filter(ok);
    return { mc: pool.filter((u) => u.sec === 'I'), wr: pool.filter((u) => u.sec === 'II') };
  }

  function refreshLimits() {
    const { mc, wr } = eligible();
    for (const [id, avail, n] of [['nMC', 'availMC', mc.length], ['nWR', 'availWR', wr.length]]) {
      $(id).max = n;
      if (Number($(id).value) > n) $(id).value = n;
      $(avail).textContent = `${n} available`;
    }
    $('build').disabled = mc.length + wr.length === 0;
    if ($('availSummary')) $('availSummary').textContent = `${mc.length + wr.length} questions match your choices: ${mc.length} multiple choice and ${wr.length} written response.`;
  }

  // ---- sidebar UI ----
  function renderChoose() {
    const schools = [...new Set(ROWS.map((r) => r.s))].sort();
    const wanted = new URLSearchParams(location.search).get('school');
    const box = $('schools');
    box.innerHTML = '';
    schools.forEach((s) => {
      const n = UNITS.filter((u) => u.school === s).length;
      const inp = el('input', { type: 'checkbox', value: s });
      inp.checked = !wanted || wanted === s;
      inp.addEventListener('change', refreshLimits);
      box.append(el('label', { class: 'fitem' }, el('span', { class: 'l' }, inp, s), el('span', { class: 'n', text: String(n) })));
    });

    const topicsBox = $('topics');
    topicsBox.innerHTML = '';
    const unitsWith = (t) => UNITS.filter((u) => u.parts.some((p) => p.t.includes(t))).length;
    for (const [mod, topics] of Object.entries(MODULES)) {
      const count = el('small', { text: 'All' });
      const all = el('input', { type: 'checkbox' });
      const inner = el('div', { class: 'inner' }, el('label', { class: 'fitem all' }, el('span', { class: 'l' }, all, 'Select all')));
      const boxes = topics.map((t) => {
        const cb = el('input', { type: 'checkbox', class: 't', value: t });
        inner.append(el('label', { class: 'fitem' }, el('span', { class: 'l' }, cb, t), el('span', { class: 'n', text: String(unitsWith(t)) })));
        return cb;
      });
      const update = () => {
        const n = boxes.filter((b) => b.checked).length;
        count.textContent = n === 0 ? 'All' : `${n} chosen`;
        all.checked = n === boxes.length;
        refreshLimits();
      };
      all.addEventListener('change', () => { boxes.forEach((b) => (b.checked = all.checked)); update(); });
      boxes.forEach((b) => b.addEventListener('change', update));
      topicsBox.append(el('details', { class: 'group' }, el('summary', {}, el('span', { class: 't', text: mod }), count), inner));
    }
    refreshLimits();
  }

  // ---- generation ----
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const avgDiff = (u) => u.parts.reduce((s, p) => s + p.df, 0) / u.parts.length;
  const totalMarks = (u) => u.parts.reduce((s, p) => s + p.m, 0);

  function generate() {
    const { mc, wr } = eligible();
    const nMC = Math.min(Number($('nMC').value) || 0, mc.length);
    const nWR = Math.min(Number($('nWR').value) || 0, wr.length);
    const pick = (pool, n) => shuffle(pool).slice(0, n);
    current = {
      mc: pick(mc, nMC),
      // Section II is always ordered easy to hard
      wr: pick(wr, nWR).sort((a, b) => avgDiff(a) - avgDiff(b) || totalMarks(a) - totalMarks(b)),
    };
    renderPaper();
    saveHistory();
  }

  // ---- history ----
  const keysOf = (c) => ({ mc: c.mc.map((u) => u.key), wr: c.wr.map((u) => u.key), answers: $('showAns').checked });
  async function saveHistory() {
    const rec = { title: $('title').value, settings: keysOf(current), question_ids: [...current.mc, ...current.wr].flatMap((u) => u.parts.map((p) => p.id)) };
    try {
      if (currentId) await TP.papers.update(currentId, rec);
      else currentId = (await TP.papers.add(rec)).id;
      $('histMsg').textContent = 'Saved to your history.';
    } catch { $('histMsg').textContent = 'Could not save to history.'; }
  }
  async function openSaved(id) {
    const rec = await TP.papers.get(id);
    if (!rec) return;
    const byKey = new Map(UNITS.map((u) => [u.key, u]));
    const pick = (ks) => ks.map((k) => byKey.get(k)).filter(Boolean);
    current = { mc: pick(rec.settings.mc || []), wr: pick(rec.settings.wr || []) };
    currentId = rec.id;
    $('title').value = rec.title || $('title').value;
    $('showAns').checked = !!rec.settings.answers;
    renderPaper();
    TP.papers.update(rec.id, {}).catch(() => {}); // bumps it to the top of recently built
    $('complete').textContent = rec.completed ? 'Completed' : 'Mark completed';
  }

  // ---- text handling ----
  const stripNumber = (x) => x.replace(/^Q\d+\.\s*/, '');
  function splitMarks(x) {
    const m = x.match(/\s*\[(\d+) marks?\]\s*$/);
    return m ? [x.slice(0, m.index), Number(m[1])] : [x, null];
  }
  // Longest shared run of words across all parts of a question (the common stem).
  function commonStem(texts) {
    if (texts.length < 2) return ['', texts];
    const words = texts.map((t) => t.split(/\s+/));
    let i = 0;
    while (words.every((w) => w[i] !== undefined && w[i] === words[0][i])) i++;
    if (i < 6) return ['', texts];
    const stem = words[0].slice(0, i).join(' ');
    return [stem, words.map((w) => w.slice(i).join(' '))];
  }
  function figures(parts) {
    const seen = new Set();
    const out = [];
    for (const p of parts) for (const f of DIAG[p.id] || []) if (!seen.has(f.svg)) { seen.add(f.svg); out.push(f); }
    return out;
  }
  function figureEls(parts) {
    return figures(parts).map((f) => {
      const d = el('div');
      d.innerHTML = f.svg; // our own stored SVGs
      return d;
    });
  }

  // ---- step 2 UI ----
  function renderMC(u, n) {
    const [body] = splitMarks(stripNumber(u.parts[0].x));
    const pieces = body.split(/\s(?=[A-D]\.\s)/);
    const stem = pieces.shift();
    const opts = el('div', { class: 'opts' });
    pieces.forEach((o) => opts.append(el('div', { text: o })));
    return el('div', { class: 'q' }, el('div', { class: 'qh' },
      el('div', { class: 'qn', text: `${n}.` }),
      el('div', { class: 'qb' }, el('div', { class: 'stem', text: stem }), ...figureEls(u.parts), opts)));
  }

  function renderWR(u, n) {
    const split = u.parts.map((p) => splitMarks(stripNumber(p.x)));
    const [stem, rests] = commonStem(split.map((s) => s[0]));
    const body = el('div', { class: 'qb' });
    if (stem) body.append(el('div', { class: 'stem', text: stem }));
    body.append(...figureEls(u.parts));
    u.parts.forEach((p, i) => {
      body.append(el('div', { class: 'part' },
        el('div', { text: rests[i] }),
        el('div', { class: 'marks', text: `[${p.m} mark${p.m === 1 ? '' : 's'}]` })));
    });
    return el('div', { class: 'q' }, el('div', { class: 'qh' }, el('div', { class: 'qn', text: `${n}.` }), body));
  }

  function renderPaper() {
    const paper = $('paper');
    paper.innerHTML = '';
    const mcMarks = current.mc.length;
    const wrMarks = current.wr.reduce((s, u) => s + totalMarks(u), 0);
    paper.append(el('h1', { id: 'paperTitle', text: $('title').value }));
    paper.append(el('div', { class: 'meta', text: `${current.mc.length + current.wr.length} questions, ${mcMarks + wrMarks} marks` }));

    let n = 1;
    const answers = [];
    if (current.mc.length) {
      paper.append(el('h2', { text: `Section I: Multiple choice (${mcMarks} mark${mcMarks === 1 ? '' : 's'})` }));
      current.mc.forEach((u) => { paper.append(renderMC(u, n)); answers.push([n, u.parts]); n++; });
    }
    if (current.wr.length) {
      paper.append(el('h2', { text: `Section II: Written response (${wrMarks} marks)` }));
      current.wr.forEach((u) => { paper.append(renderWR(u, n)); answers.push([n, u.parts]); n++; });
    }
    if ($('showAns').checked) {
      const ol = el('ul', { style: 'list-style:none;padding:0' });
      answers.forEach(([num, parts]) =>
        parts.forEach((p) => ol.append(el('li', { text: `Q${num}${p.p ? ' ' + p.p : ''}: ${p.a}` }))));
      paper.append(el('div', { class: 'answers' }, el('h2', { text: 'Answers' }), ol));
    }
    $('choose').hidden = true;
    $('preview').hidden = false;
        window.scrollTo(0, 0);
  }

  // ---- wiring ----
  function wire() {
    $('nMC').addEventListener('input', refreshLimits);
    $('nWR').addEventListener('input', refreshLimits);
    $('build').addEventListener('click', () => { currentId = null; generate(); });
    $('reshuffle').addEventListener('click', generate);
    $('back').addEventListener('click', () => {
      $('preview').hidden = true;
      $('choose').hidden = false;
    });
    $('showAns').addEventListener('change', () => { if (current) { renderPaper(); saveHistory(); } });
    let tt;
    $('title').addEventListener('input', () => {
      const t = $('paperTitle'); if (t) t.textContent = $('title').value;
      clearTimeout(tt); tt = setTimeout(() => currentId && TP.papers.update(currentId, { title: $('title').value }).catch(() => {}), 600);
    });
    $('complete').addEventListener('click', async () => {
      if (!currentId) return;
      const done = $('complete').textContent === 'Mark completed';
      await TP.papers.update(currentId, { completed: done, completed_at: done ? new Date().toISOString() : null }).catch(() => {});
      $('complete').textContent = done ? 'Completed' : 'Mark completed';
    });
    $('print').addEventListener('click', () => window.print());
  }

  TP.requireLogin()
    .then(() => { $('gate-main').hidden = false; return TP.loadData(); })
    .then(([rows, diag]) => {
      ROWS = rows;
      DIAG = diag;
      buildUnits();
      TP.stats(ROWS);
      renderChoose();
      wire();
      const open = new URLSearchParams(location.search).get('paper');
      if (open) openSaved(open);
      $('loadMsg').textContent = `${UNITS.length} questions from ${new Set(ROWS.map((r) => r.s + r.y)).size} papers`;
    })
    .catch(() => { $('gate-main').hidden = false; $('loadMsg').textContent = 'Could not load the question data. Please refresh or log in again.'; });
})();
