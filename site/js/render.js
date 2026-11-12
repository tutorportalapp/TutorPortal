// Shared question rendering (builder paper + library cards). Exposes window.TPR.
// Maths in the database is plain text, e.g. "3x^4(4 - x)^3". Anything after a caret is shown as a real superscript.
(() => {
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

  // "x^2" -> x<sup>2</sup>, "4^(3x+1)" -> 4<sup>3x+1</sup>, "e^-x" -> e<sup>-x</sup>
  function rich(text) {
    const frag = document.createDocumentFragment();
    let buf = '';
    const flush = () => { if (buf) { frag.append(document.createTextNode(buf)); buf = ''; } };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c !== '^') { buf += c; continue; }
      let sup = null, end = i + 1;
      if (text[i + 1] === '(') {
        let depth = 0;
        for (let j = i + 1; j < text.length; j++) {
          if (text[j] === '(') depth++;
          else if (text[j] === ')' && --depth === 0) { sup = text.slice(i + 2, j); end = j + 1; break; }
        }
      } else {
        const m = text.slice(i + 1).match(/^-?(\d+|[A-Za-z])/);
        if (m) { sup = m[0]; end = i + 1 + m[0].length; }
      }
      if (sup === null) { buf += c; continue; }
      flush();
      const s = document.createElement('sup');
      s.append(rich(sup));
      frag.append(s);
      i = end - 1;
    }
    flush();
    return frag;
  }
  const richEl = (tag, cls, text) => { const n = el(tag, cls ? { class: cls } : {}); n.append(rich(text)); return n; };

  // ---- text helpers ----
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
    return [words[0].slice(0, i).join(' '), words.map((w) => w.slice(i).join(' '))];
  }

  // ---- questions as units (all parts of one question) ----
  const unitKey = (r) => `${r.s}|${r.y}|${r.sec}|${r.q}`;
  function buildUnits(rows) {
    const map = new Map();
    for (const r of rows) {
      const k = unitKey(r);
      if (!map.has(k)) map.set(k, { key: k, school: r.s, year: r.y, sec: r.sec, q: r.q, parts: [] });
      map.get(k).parts.push(r);
    }
    return [...map.values()];
  }
  const totalMarks = (u) => u.parts.reduce((s, p) => s + (p.m || 0), 0);
  const avgDiff = (u) => u.parts.reduce((s, p) => s + (p.df || 0), 0) / u.parts.length;
  const level = (u) => Math.min(5, Math.max(1, Math.round(avgDiff(u)) || 1)); // difficulty 1 (easiest) to 5 (hardest)
  const LEVELS = { 1: 'Level 1 (easiest)', 2: 'Level 2', 3: 'Level 3', 4: 'Level 4', 5: 'Level 5 (hardest)' };
  const topicsOf = (u) => [...new Set(u.parts.flatMap((p) => p.t || []))];
  const subtopicsOf = (u) => [...new Set(u.parts.flatMap((p) => p.st || []))];

  function figureEls(parts, diag) {
    const seen = new Set();
    const out = [];
    for (const p of parts) for (const f of (diag || {})[p.id] || []) {
      if (seen.has(f.svg)) continue;
      seen.add(f.svg);
      const d = el('div', { class: 'fig' });
      d.innerHTML = f.svg; // our own stored SVGs
      out.push(d);
    }
    return out;
  }

  // n = question number to show, or null for no number (library cards).
  function renderMC(u, n, diag) {
    const [body] = splitMarks(stripNumber(u.parts[0].x));
    const pieces = body.split(/\s(?=[A-D]\.\s)/);
    const stem = pieces.shift();
    const opts = el('div', { class: 'opts' });
    pieces.forEach((o) => { const t = el('span'); t.append(rich(o)); opts.append(el('div', { class: 'opt' }, el('span', { class: 'oval', 'aria-hidden': 'true' }), t)); });
    const qb = el('div', { class: 'qb' }, richEl('div', 'stem', stem), ...figureEls(u.parts, diag), opts);
    return el('div', { class: 'q' }, el('div', { class: 'qh' }, ...(n != null ? [el('div', { class: 'qn', text: `${n}.` })] : []), qb));
  }

  function renderWR(u, n, diag) {
    const split = u.parts.map((p) => splitMarks(stripNumber(p.x)));
    const [stem, rests] = commonStem(split.map((s) => s[0]));
    const body = el('div', { class: 'qb' });
    if (stem) body.append(richEl('div', 'stem', stem));
    body.append(...figureEls(u.parts, diag));
    u.parts.forEach((p, i) => {
      body.append(el('div', { class: 'part' }, richEl('div', '', rests[i]),
        el('div', { class: 'marks', text: `[${p.m} mark${p.m === 1 ? '' : 's'}]` })));
    });
    return el('div', { class: 'q' }, el('div', { class: 'qh' }, ...(n != null ? [el('div', { class: 'qn', text: `${n}.` })] : []), body));
  }
  const renderUnit = (u, n, diag) => (u.sec === 'I' ? renderMC(u, n, diag) : renderWR(u, n, diag));

  // e.g. "Q7", "Q14 (a)-(c)"
  function partLabel(u) {
    const ps = u.parts.map((p) => p.p).filter(Boolean);
    if (!ps.length) return `Q${u.q}`;
    return ps.length === 1 ? `Q${u.q} ${ps[0]}` : `Q${u.q} ${ps[0]}–${ps[ps.length - 1]}`;
  }

  // "1 hour 45 minutes", "15 minutes"
  function duration(min) {
    const h = Math.floor(min / 60), m = min % 60;
    const hs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
    const ms = m ? `${m} minute${m === 1 ? '' : 's'}` : '';
    return [hs, ms].filter(Boolean).join(' ') || '0 minutes';
  }
  const roundUp5 = (n) => Math.max(5, Math.ceil(n / 5) * 5);

  window.TPR = { el, rich, stripNumber, splitMarks, commonStem, unitKey, buildUnits, totalMarks, avgDiff, level, LEVELS,
    topicsOf, subtopicsOf, figureEls, renderMC, renderWR, renderUnit, partLabel, duration, roundUp5 };
})();
