// TutorPortal paper builder.
// Data rows (one per question part): id, y(ear), s(chool), sec, q, p(art), m(arks), d(escription),
// g(roups), t(opics), st, mt, cr, df (difficulty), oc, a(nswer), n(ote), x (question text).
(() => {
  const { el, rich } = TPR;
  const MODULES = TP.MODULES;
  const $ = (id) => document.getElementById(id);

  let ROWS = [];
  let DIAG = {};
  let UNITS = [];
  let current = null; // { mc: [], wr: [] }
  let currentId = null; // history record for the paper on screen

  // ---- selection state ----
  const checked = (sel) => [...document.querySelectorAll(sel)].map((i) => i.value);
  const selectedSchools = () => checked('#schools input:checked');
  const selectedTopics = () => checked('#topics input.t:checked');
  const selectedLevels = () => checked('#levels input:checked').map(Number);

  function eligible() {
    const schools = new Set(selectedSchools());
    const topics = new Set(selectedTopics());
    const levels = new Set(selectedLevels());
    const ok = (u) =>
      schools.has(u.school) &&
      (topics.size === 0 || u.parts.some((p) => (p.t || []).some((t) => topics.has(t)))) &&
      (levels.size === 0 || levels.has(TPR.level(u)));
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

    const lv = $('levels');
    lv.innerHTML = '';
    for (let d = 1; d <= 5; d++) {
      const n = UNITS.filter((u) => TPR.level(u) === d).length;
      const inp = el('input', { type: 'checkbox', value: String(d) });
      inp.addEventListener('change', refreshLimits);
      lv.append(el('label', { class: 'fitem' }, el('span', { class: 'l' }, inp, TPR.LEVELS[d]), el('span', { class: 'n', text: String(n) })));
    }

    const topicsBox = $('topics');
    topicsBox.innerHTML = '';
    const unitsWith = (t) => UNITS.filter((u) => u.parts.some((p) => (p.t || []).includes(t))).length;
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

  function generate() {
    const { mc, wr } = eligible();
    const nMC = Math.min(Number($('nMC').value) || 0, mc.length);
    const nWR = Math.min(Number($('nWR').value) || 0, wr.length);
    const pick = (pool, n) => shuffle(pool).slice(0, n);
    current = {
      mc: pick(mc, nMC),
      // Section II is always ordered easy to hard
      wr: pick(wr, nWR).sort((a, b) => TPR.avgDiff(a) - TPR.avgDiff(b) || TPR.totalMarks(a) - TPR.totalMarks(b)),
    };
    renderPaper();
    saveHistory();
  }

  // ---- history ----
  const keysOf = (c) => ({ mc: c.mc.map((u) => u.key), wr: c.wr.map((u) => u.key), answers: $('showAns').checked, tutor: $('tutor').value });
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
    if (rec.settings.tutor) $('tutor').value = rec.settings.tutor;
    renderPaper();
    TP.papers.update(rec.id, {}).catch(() => {}); // bumps it to the top of recently built
    $('complete').textContent = rec.completed ? 'Completed' : 'Mark completed';
  }

  // ---- A4 paper ----
  const BOOK = '<svg viewBox="0 0 48 48" width="46" height="46" fill="none" stroke="#111" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M24 12c-4-3-10-4-17-4v28c7 0 13 1 17 4 4-3 10-4 17-4V8c-7 0-13 1-17 4z"/><path d="M24 12v28"/></svg>';

  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

  // Time and marks follow from the questions chosen: 1 mark per multiple-choice question,
  // about 1.5 min per Section I mark and 1.8 min per Section II mark (the HSC 180 min / 100 mark ratio).
  function stats() {
    const nMC = current.mc.length;
    const wrMarks = current.wr.reduce((s, u) => s + TPR.totalMarks(u), 0);
    const total = nMC + wrMarks;
    const mcTime = nMC ? TPR.roundUp5(nMC * 1.5) : 0;
    const wrTime = wrMarks ? TPR.roundUp5(wrMarks * 1.8) : 0;
    return { nMC, nWR: current.wr.length, mcMarks: nMC, wrMarks, total, mcTime, wrTime, work: mcTime + wrTime, reading: Math.max(2, Math.round(total / 20)) };
  }

  function coverPage(S, pageRange) {
    const t = $('tutor').value.trim();
    const title = $('title').value.trim() || 'Mathematics Advanced';
    const sec = (name, marks, qs, time, pages, instr) => el('div', { class: 'cv-sec' },
      el('div', { class: 'cv-sh' }, el('b', { text: name }), el('b', { text: `${plural(marks, 'mark')}` })),
      el('ul', {}, ...instr.map((i) => el('li', { text: i }))),
      el('div', { class: 'cv-pg', text: pages }));
    const secs = [];
    let first = 1;
    if (S.nMC) {
      secs.push(sec('Section I', S.mcMarks, '', '', `Pages ${pageRange.I}`, [
        `Attempt ${S.nMC === 1 ? 'Question 1' : `Questions ${range(1, S.nMC)}`}`,
        `Allow about ${TPR.duration(S.mcTime)} for this section`,
        'Fill in the oval for the correct answer',
      ]));
      first = S.nMC + 1;
    }
    if (S.nWR) {
      const last = S.nMC + S.nWR;
      secs.push(sec('Section II', S.wrMarks, '', '', `Pages ${pageRange.II}`, [
        `Attempt ${first === last ? `Question ${first}` : `Questions ${range(first, last)}`}`,
        `Allow about ${TPR.duration(S.wrTime)} for this section`,
        'Show relevant mathematical reasoning and/or calculations',
      ]));
    }
    const page = el('section', { class: 'page cover' });
    page.append(
      el('div', { class: 'cv-top' },
        (() => { const d = el('div', { class: 'cv-logo' }); d.innerHTML = BOOK; d.append(el('span', { text: t || 'Tutor' })); return d; })(),
        el('div', { class: 'name-box' }, el('span', { text: 'Student Name:' }), el('span', { class: 'line' }))),
      el('div', { class: 'cv-year', text: String(new Date().getFullYear()) }),
      el('div', { class: 'cv-kicker', text: 'PRACTICE HIGHER SCHOOL CERTIFICATE EXAMINATION' }),
      el('div', { class: 'cv-title', text: title }),
      el('div', { class: 'cv-gen' },
        el('h3', { text: 'General Instructions' }),
        el('ul', {},
          ...[
            `Reading time – ${plural(S.reading, 'minute')}`,
            `Working time – ${TPR.duration(S.work)}`,
            'Write using black pen',
            'Calculators approved by NESA may be used',
          ].map((x) => el('li', { text: x })))),
      el('div', { class: 'cv-total' }, el('b', { text: `Total marks: ${S.total}` })),
      ...secs);
    return page;
  }

  function renderPaper() {
    $('choose').hidden = true;
    $('preview').hidden = false; // must be visible so the page heights can be measured
    const wrap = $('pages');
    wrap.style.zoom = '1';
    wrap.innerHTML = '';
    const S = stats();
    const tutor = $('tutor').value.trim();
    const title = $('title').value.trim() || 'Mathematics Advanced';

    // Content blocks in order; headings stay with the question that follows them.
    const blocks = [];
    let n = 1;
    const answers = [];
    if (current.mc.length) {
      blocks.push({ el: el('h2', { class: 'sec-h', text: `Section I – ${plural(S.mcMarks, 'mark')}` }) });
      blocks.push({ el: el('p', { class: 'sec-note', text: `Questions 1–${S.nMC}. Fill in the oval for the correct answer.` }), glue: true });
      current.mc.forEach((u) => { const e = TPR.renderMC(u, n, DIAG); e.dataset.sec = 'I'; blocks.push({ el: e }); answers.push([n, u.parts]); n++; });
    }
    if (current.wr.length) {
      blocks.push({ el: el('h2', { class: 'sec-h', text: `Section II – ${plural(S.wrMarks, 'mark')}` }) });
      blocks.push({ el: el('p', { class: 'sec-note', text: 'Show relevant mathematical reasoning and/or calculations.' }), glue: true });
      current.wr.forEach((u) => { const e = TPR.renderWR(u, n, DIAG); e.dataset.sec = 'II'; blocks.push({ el: e }); answers.push([n, u.parts]); n++; });
    }

    const pages = [];
    let body = null;
    const newPage = () => {
      const p = el('section', { class: 'page' },
        el('div', { class: 'ph' }, el('span', { text: tutor ? `Tutor: ${tutor}` : '' }), el('span', { text: title })),
        el('div', { class: 'pbody' }),
        el('div', { class: 'pf' }));
      wrap.append(p);
      pages.push(p);
      body = p.querySelector('.pbody');
    };
    const place = (b) => {
      body.append(b.el);
      if (body.scrollHeight > body.clientHeight + 1 && body.children.length > 1) {
        body.removeChild(b.el);
        const moved = [b.el];
        // a heading (and its note) never sits alone at the foot of a page
        while (body.lastElementChild && (body.lastElementChild.classList.contains('sec-h') || body.lastElementChild.classList.contains('sec-note'))) {
          moved.unshift(body.lastElementChild);
          body.removeChild(body.lastElementChild);
        }
        newPage();
        moved.forEach((m) => body.append(m));
      }
    };

    wrap.append(el('div')); // placeholder for the cover, filled once page numbers are known
    const coverSlot = wrap.firstChild;
    newPage();
    blocks.forEach(place);
    if ($('showAns').checked) {
      newPage();
      place({ el: el('h2', { class: 'sec-h', text: 'Answers' }) });
      answers.forEach(([num, parts]) => parts.forEach((p) => place({ el: el('div', { class: 'ans', text: `Q${num}${p.p ? ' ' + p.p : ''}: ${p.a}` }) })));
    }

    // page ranges for the cover (the cover is page 1)
    const pageRange = {};
    for (const s of ['I', 'II']) {
      const idx = pages.map((p, i) => [p, i + 2]).filter(([p]) => p.querySelector(`[data-sec="${s}"]`)).map(([, i]) => i);
      if (idx.length) pageRange[s] = range(idx[0], idx[idx.length - 1]);
    }
    coverSlot.replaceWith(coverPage(S, pageRange));
    const total = pages.length + 1;
    wrap.querySelectorAll('.pf').forEach((f, i) => { f.textContent = `Page ${i + 2} of ${total}`; });

    $('paperMeta').textContent = `${S.nMC + S.nWR} questions · ${S.total} marks · working time ${TPR.duration(S.work)} · ${total} A4 pages`;
    fit();
  }

  // shrink the A4 pages to fit narrow screens (printing always uses full size)
  function fit() {
    const wrap = $('pages');
    if (!wrap.firstElementChild) return;
    wrap.style.zoom = '1';
    const full = wrap.firstElementChild.offsetWidth;
    const avail = wrap.parentElement.clientWidth;
    wrap.style.zoom = String(Math.min(1, avail / full));
  }

  // ---- wiring ----
  function wire() {
    $('nMC').addEventListener('input', refreshLimits);
    $('nWR').addEventListener('input', refreshLimits);
    $('build').addEventListener('click', () => { currentId = null; generate(); window.scrollTo(0, 0); });
    $('reshuffle').addEventListener('click', generate);
    $('back').addEventListener('click', () => {
      $('preview').hidden = true;
      $('choose').hidden = false;
    });
    $('showAns').addEventListener('change', () => { if (current) { renderPaper(); saveHistory(); } });
    let rt;
    const redraw = () => { clearTimeout(rt); rt = setTimeout(() => current && renderPaper(), 250); };
    $('tutor').addEventListener('input', () => {
      try { localStorage.setItem('tp.tutor', $('tutor').value.trim()); } catch {}
      redraw();
      if (current) saveHistory();
    });
    let tt;
    $('title').addEventListener('input', () => {
      redraw();
      clearTimeout(tt); tt = setTimeout(() => currentId && TP.papers.update(currentId, { title: $('title').value }).catch(() => {}), 600);
    });
    $('complete').addEventListener('click', async () => {
      if (!currentId) return;
      const done = $('complete').textContent === 'Mark completed';
      await TP.papers.update(currentId, { completed: done, completed_at: done ? new Date().toISOString() : null }).catch(() => {});
      $('complete').textContent = done ? 'Completed' : 'Mark completed';
    });
    $('print').addEventListener('click', () => { $('pages').style.zoom = '1'; window.print(); setTimeout(fit, 300); });
    window.addEventListener('resize', fit);
  }

  TP.requireLogin()
    .then(() => { $('gate-main').hidden = false; return TP.loadData(); })
    .then(([rows, diag]) => {
      ROWS = rows;
      DIAG = diag;
      UNITS = TPR.buildUnits(ROWS);
      TP.stats(ROWS);
      renderChoose();
      wire();
      TP.tutorName().then((n) => { $('tutor').value = n; });
      const open = new URLSearchParams(location.search).get('paper');
      if (open) openSaved(open);
      $('loadMsg').textContent = `${UNITS.length} questions from ${new Set(ROWS.map((r) => r.s + r.y)).size} papers`;
    })
    .catch(() => { $('gate-main').hidden = false; $('loadMsg').textContent = 'Could not load the question data. Please refresh or log in again.'; });
})();
