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
      levels.has(TPR.level(u));
    const pool = UNITS.filter(ok);
    return { mc: pool.filter((u) => u.sec === 'I'), wr: pool.filter((u) => u.sec === 'II') };
  }

  const MIN_MC = 1.5, MIN_WR = 1.8; // minutes per mark (HSC pacing)
  function refreshLimits() {
    const { mc, wr } = eligible();
    const wrMarks = wr.reduce((t, u) => t + TPR.totalMarks(u), 0);
    for (const [id, avail, n] of [['nMC', 'availMC', mc.length], ['nWR', 'availWR', wr.length]]) {
      $(id).max = n;
      if (Number($(id).value) > n) $(id).value = n;
      $(avail).textContent = `${n} available`;
    }
    const lim = (id, max, note, text) => { $(id).max = max; if (Number($(id).value) > max) $(id).value = max; $(note).textContent = text; };
    lim('tMC', mc.length, 'availMCm', `${mc.length} marks available`);
    lim('tWR', wrMarks, 'availWRm', `${wrMarks} marks available`);
    const tMC = Math.floor((mc.length * MIN_MC) / 5) * 5, tWR = Math.floor((wrMarks * MIN_WR) / 5) * 5;
    lim('tTMC', tMC, 'availTMC', `up to ${TPR.duration(tMC)} available`);
    lim('tTWR', tWR, 'availTWR', `up to ${TPR.duration(tWR)} available`);
    const m = (Number($('tMC').value) || 0) + (Number($('tWR').value) || 0);
    $('marksTotal').textContent = `Total: ${m} marks`;
    const t = (Number($('tTMC').value) || 0) + (Number($('tTWR').value) || 0);
    $('timeTotal').textContent = `Total working time: ${TPR.duration(t)}`;
    $('build').disabled = mc.length + wr.length === 0;
    $('availSummary').textContent = `${mc.length + wr.length} questions match your choices: ${mc.length} multiple choice and ${wr.length} written response.`;
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
      inp.checked = true;
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

  let mode = 'count';
  function generate() {
    const { mc, wr } = eligible();
    const pick = (pool, n) => shuffle(pool).slice(0, n);
    let nMC, chosenWR;
    if (mode === 'count') {
      nMC = Math.min(Number($('nMC').value) || 0, mc.length);
      chosenWR = pick(wr, Math.min(Number($('nWR').value) || 0, wr.length));
    } else {
      // aim for the marks asked for in each section (time converts to marks at HSC pacing)
      const wantMC = mode === 'marks' ? Number($('tMC').value) || 0 : Math.floor((Number($('tTMC').value) || 0) / MIN_MC);
      const budget = mode === 'marks' ? Number($('tWR').value) || 0 : Math.floor((Number($('tTWR').value) || 0) / MIN_WR);
      nMC = Math.min(mc.length, wantMC); // each multiple-choice question is 1 mark
      let sum = 0;
      chosenWR = [];
      for (const u of shuffle(wr)) {
        const m = TPR.totalMarks(u);
        if (sum + m <= budget) { chosenWR.push(u); sum += m; }
      }
    }
    current = {
      mc: pick(mc, nMC),
      // Section II is always ordered easy to hard
      wr: chosenWR.sort((a, b) => TPR.avgDiff(a) - TPR.avgDiff(b) || TPR.totalMarks(a) - TPR.totalMarks(b)),
    };
    renderPaper();
    saveHistory();
  }

  // ---- history ----
  const keysOf = (c) => ({ mc: c.mc.map((u) => u.key), wr: c.wr.map((u) => u.key), tutor: $('tutor').value, cover: $('optCover').checked, lines: $('optLines').checked, formulas: $('optFormulas').checked });
  async function saveHistory(silent) {
    const rec = { title: $('title').value, settings: keysOf(current), question_ids: [...current.mc, ...current.wr].flatMap((u) => u.parts.map((p) => p.id)) };
    try {
      if (currentId) await TP.papers.update(currentId, rec);
      else currentId = (await TP.papers.add(rec)).id;
      $('histMsg').textContent = 'Saved to your history.';
      if (!silent) TPUI.toast('Paper saved to History');
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
    $('optCover').checked = rec.settings.cover !== false;
    $('optLines').checked = !!rec.settings.lines;
    $('optFormulas').checked = !!rec.settings.formulas;
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
            ...($('optFormulas').checked ? ['A NESA reference sheet is provided at the back of this paper'] : []),
          ].map((x) => el('li', { text: x })))),
      el('div', { class: 'cv-total' }, el('b', { text: `Total marks: ${S.total}` })),
      ...secs);
    return page;
  }

  // NESA's own reference sheet: the PDF you save as site/assets/reference-sheet.pdf is drawn onto A4 pages at the back.
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  let refImages = null, refToken = 0, refDone = Promise.resolve();
  function loadRef() {
    return (refImages ||= (async () => {
      if (!window.pdfjsLib) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = PDFJS; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const pdf = await pdfjsLib.getDocument('assets/reference-sheet.pdf').promise;
      const out = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.4 });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        out.push({ src: cv.toDataURL('image/jpeg', 0.92), ratio: vp.width / vp.height });
      }
      return out;
    })().catch((e) => { refImages = null; throw e; }));
  }
  function attachRef(wrap) {
    const token = ++refToken;
    $('refMsg').textContent = '';
    if (!$('optFormulas').checked) { refDone = Promise.resolve(); return; }
    $('refMsg').textContent = 'Loading the NESA reference sheet\u2026';
    refDone = loadRef().then((imgs) => {
      if (token !== refToken) return;
      imgs.forEach((im) => wrap.append(el('section', { class: 'page ref' }, el('img', { src: im.src, alt: 'NESA reference sheet' }))));
      $('refMsg').textContent = '';
      fit();
    }).catch(() => {
      if (token === refToken) $('refMsg').textContent = 'The NESA reference sheet could not be loaded. Download it from nsw.gov.au and save it in the website as assets/reference-sheet.pdf (see the README note).';
    });
  }

  // Lays blocks out onto A4 pages inside `wrap`; a block that does not fit moves to a fresh page.
  function paginator(wrap, tutor, rightText) {
    const pages = [];
    let body = null;
    const newPage = () => {
      const p = el('section', { class: 'page' },
        el('div', { class: 'ph' }, el('span', { text: tutor ? `Tutor: ${tutor}` : '' }), el('span', { text: rightText })),
        el('div', { class: 'pbody' }),
        el('div', { class: 'pf' }));
      wrap.append(p);
      pages.push(p);
      body = p.querySelector('.pbody');
    };
    const held = (n) => n && (n.classList.contains('sec-h') || n.classList.contains('sec-note'));
    const fits = () => body.scrollHeight <= body.clientHeight + 1;

    // A question taller than the room left is cut between its parts, never through a diagram:
    // a figure always travels with the line of text before it (and working lines with their part).
    function atomsOf(main) {
      let atoms = [];
      [...main.children].forEach((c) => {
        if (c.classList.contains('pq-group')) [...c.children].forEach((k) => atoms.push({ nodes: [k], group: c }));
        else atoms.push({ nodes: [c], group: null });
      });
      const isFig = (a) => a.nodes[0].classList.contains('pq-fig');
      const isLines = (a) => a.nodes[0].classList.contains('lines');
      const isStem = (a) => a.nodes[0].classList.contains('pq-stem');
      const out = [];
      for (let i = 0; i < atoms.length; i++) {
        const cur = { nodes: [...atoms[i].nodes], group: atoms[i].group };
        while (i + 1 < atoms.length && atoms[i + 1].group === cur.group && (isFig(atoms[i + 1]) || isLines(atoms[i + 1]) || isStem(cur))) {
          cur.nodes.push(...atoms[++i].nodes);
        }
        out.push(cur);
      }
      return out;
    }
    function splitQuestion(q) {
      const section = q.querySelector('.pq'), main = q.querySelector('.pq-main');
      if (!section || !main) return;
      const atoms = atomsOf(main);
      main.replaceChildren();
      let cur = { q, main, groupSrc: null, groupEl: null, count: 0 };
      const add = (a) => {
        let parent = cur.main;
        if (a.group) {
          if (cur.groupSrc !== a.group) { cur.groupEl = a.group.cloneNode(false); cur.main.append(cur.groupEl); cur.groupSrc = a.group; }
          parent = cur.groupEl;
        } else cur.groupSrc = null;
        a.nodes.forEach((n) => parent.append(n));
      };
      const next = () => {
        newPage();
        const q2 = q.cloneNode(false), sec2 = section.cloneNode(false), main2 = main.cloneNode(false);
        sec2.classList.add('pq-cont');
        sec2.append(section.querySelector('.pq-num').cloneNode(false), main2);
        q2.append(sec2);
        body.append(q2);
        cur = { q: q2, main: main2, groupSrc: null, groupEl: null, count: 0 };
      };
      atoms.forEach((a) => {
        add(a);
        if (!fits() && cur.count > 0) {
          a.nodes.forEach((n) => n.remove());
          if (cur.groupEl && !cur.groupEl.children.length) { cur.groupEl.remove(); cur.groupSrc = null; }
          next();
          add(a);
        }
        cur.count++;
      });
    }

    const place = (b) => {
      body.append(b.el);
      if (fits()) return;
      const tall = b.el.offsetHeight > body.clientHeight; // would not fit even on an empty page
      if (!tall && body.children.length > 1) {
        body.removeChild(b.el);
        const moved = [b.el];
        while (held(body.lastElementChild)) { moved.unshift(body.lastElementChild); body.removeChild(body.lastElementChild); }
        newPage();
        moved.forEach((m) => body.append(m));
      } else if (tall && b.el.querySelector('.pq')) splitQuestion(b.el);
    };
    newPage();
    return { pages, place, breakPage: newPage };
  }

  function renderPaper() {
    $('choose').hidden = true;
    $('preview').hidden = false; // must be visible so the page heights can be measured
    const wrap = $('pages'), keyWrap = $('keyPages');
    wrap.hidden = false; keyWrap.hidden = false;
    wrap.style.zoom = '1'; keyWrap.style.zoom = '1';
    wrap.innerHTML = ''; keyWrap.innerHTML = '';
    const S = stats();
    const tutor = $('tutor').value.trim();
    const title = $('title').value.trim() || 'Mathematics Advanced';
    const useCover = $('optCover').checked;
    const lines = $('optLines').checked;

    // Content blocks in order; headings stay with the question that follows them.
    const blocks = [];
    let n = 1;
    const answers = [];
    if (current.mc.length) {
      blocks.push({ el: el('h2', { class: 'sec-h', text: `Section I – ${plural(S.mcMarks, 'mark')}` }) });
      blocks.push({ el: el('p', { class: 'sec-note', text: `Questions 1–${S.nMC}. Fill in the oval for the correct answer.` }) });
      current.mc.forEach((u) => { const e = TPR.renderMC(u, n, DIAG); e.dataset.sec = 'I'; blocks.push({ el: e }); answers.push([n, u.parts]); n++; });
    }
    if (current.wr.length) {
      blocks.push({ el: el('h2', { class: 'sec-h', text: `Section II – ${plural(S.wrMarks, 'mark')}` }) });
      blocks.push({ el: el('p', { class: 'sec-note', text: 'Show relevant mathematical reasoning and/or calculations.' }) });
      current.wr.forEach((u) => { const e = TPR.renderWR(u, n, DIAG, { lines }); e.dataset.sec = 'II'; blocks.push({ el: e }); answers.push([n, u.parts]); n++; });
    }

    if (useCover) wrap.append(el('div')); // placeholder for the cover, filled once page numbers are known
    const coverSlot = useCover ? wrap.firstChild : null;
    const P = paginator(wrap, tutor, title);
    blocks.forEach(P.place);

    // page ranges for the cover
    const offset = useCover ? 2 : 1;
    const pageRange = {};
    for (const s of ['I', 'II']) {
      const idx = P.pages.map((p, i) => [p, i + offset]).filter(([p]) => p.querySelector(`[data-sec="${s}"]`)).map(([, i]) => i);
      if (idx.length) pageRange[s] = range(idx[0], idx[idx.length - 1]);
    }
    if (useCover) coverSlot.replaceWith(coverPage(S, pageRange));
    const total = P.pages.length + (useCover ? 1 : 0);
    P.pages.forEach((p, i) => { p.querySelector('.pf').textContent = `Page ${i + offset} of ${total}`; });

    // answer key (a separate printout, so students never see it by accident)
    const K = paginator(keyWrap, tutor, `${title} – Answer key`);
    K.place({ el: el('h2', { class: 'sec-h', text: 'Answer key' }) });
    answers.forEach(([num, parts]) => {
      const row = el('div', { class: 'ans' }, el('b', { text: `Question ${num}` }));
      parts.forEach((p) => {
        const line = el('div', { class: 'ans-line' });
        line.append(`${p.p ? p.p + ' ' : ''}`, rich(String(p.a || '–')));
        row.append(line);
      });
      K.place({ el: row });
    });
    K.pages.forEach((p, i) => { p.querySelector('.pf').textContent = `Page ${i + 1} of ${K.pages.length}`; });

    $('paperMeta').textContent = `${S.nMC + S.nWR} questions · ${S.total} marks · working time ${TPR.duration(S.work)} · ${total} A4 pages`;
    attachRef(wrap);
    setView(view);
    const host = $('preview');
    host.classList.remove('enter'); void host.offsetWidth; host.classList.add('enter');
  }

  let view = 'paper';
  function setView(v) {
    view = v;
    $('pages').hidden = v !== 'paper';
    $('keyPages').hidden = v !== 'key';
    $('viewSeg').querySelectorAll('button').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('print').textContent = v === 'key' ? 'Print answer key' : 'Print paper / save as PDF';
    fit();
  }

  // shrink the A4 pages to fit narrow screens (printing always uses full size)
  function fit() {
    for (const wrap of [$('pages'), $('keyPages')]) {
      if (wrap.hidden || !wrap.firstElementChild) continue;
      wrap.style.zoom = '1';
      const full = wrap.firstElementChild.offsetWidth;
      const avail = wrap.parentElement.clientWidth;
      wrap.style.zoom = String(Math.min(1, avail / full));
    }
  }

  // ---- wiring ----
  function wire() {
    $('nMC').addEventListener('input', refreshLimits);
    $('nWR').addEventListener('input', refreshLimits);
    for (const id of ['tMC', 'tWR', 'tTMC', 'tTWR']) $(id).addEventListener('input', refreshLimits);
    $('mode').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      mode = btn.dataset.m;
      $('mode').querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === btn); x.setAttribute('aria-pressed', String(x === btn)); });
      $('modeCount').hidden = mode !== 'count';
      $('modeMarks').hidden = mode !== 'marks';
      $('modeTime').hidden = mode !== 'time';
    });
    // show a short "building" state so the click clearly registers
    const run = (btn, label, fn) => {
      const old = btn.textContent;
      btn.disabled = true; btn.classList.add('busy'); btn.textContent = label;
      requestAnimationFrame(() => setTimeout(() => {
        try { fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); btn.textContent = old; }
      }, 120));
    };
    $('build').addEventListener('click', () => run($('build'), 'Building your paper\u2026', () => { currentId = null; generate(); window.scrollTo(0, 0); }));
    $('reshuffle').addEventListener('click', () => run($('reshuffle'), 'Shuffling\u2026', generate));
    $('back').addEventListener('click', () => {
      $('preview').hidden = true;
      $('choose').hidden = false;
    });
    for (const id of ['optCover', 'optLines', 'optFormulas']) $(id).addEventListener('change', () => { if (current) { renderPaper(); saveHistory(true); } });
    $('viewSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.v); });
    let rt;
    const redraw = () => { clearTimeout(rt); rt = setTimeout(() => current && renderPaper(), 250); };
    $('tutor').addEventListener('input', () => {
      try { localStorage.setItem('tp.tutor', $('tutor').value.trim()); } catch {}
      redraw();
      if (current) saveHistory(true);
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
      TPUI.toast(done ? 'Marked as completed' : 'Marked as not completed');
    });
    $('print').addEventListener('click', () => { for (const w of [$('pages'), $('keyPages')]) w.style.zoom = '1'; (view === 'paper' ? refDone : Promise.resolve()).then(() => { window.print(); setTimeout(fit, 300); }); });
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
