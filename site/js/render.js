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

  // Words used in the database for symbols: pi, theta, mu, sigma, infinity, "8 degrees", "->", "+/-", "(a, b) U (c, d)", "sqrt 3" (-> sqrt(3)).
  const NL = '(?<![A-Za-z])', NR = '(?![A-Za-z])';
  const SYMBOLS = [
    [/\+\/-/g, '\u00b1'],
    [new RegExp(NL + 'sqrt\\s*(\\d+(?:\\.\\d+)?)(?!\\d)', 'g'), 'sqrt($1)'],
    [new RegExp(NL + 'sqrt\\s+([A-Za-z])' + NR, 'g'), 'sqrt($1)'],
    [new RegExp(NL + 'pi' + NR, 'g'), '\u03c0'],
    [new RegExp(NL + 'theta' + NR, 'g'), '\u03b8'],
    [new RegExp(NL + 'mu' + NR, 'g'), '\u03bc'],
    [new RegExp(NL + 'sigma' + NR, 'g'), '\u03c3'],
    [new RegExp(NL + 'infinity' + NR, 'g'), '\u221e'],
    [new RegExp(NL + 'inf' + NR, 'g'), '\u221e'],
    [/(\d(?:\.\d+)?)\s*degrees?(?![A-Za-z])/g, '$1\u00b0'],
    [/->/g, '\u2192'],
    [/([)\]])\s+U\s+([(\[])/g, '$1 \u222a $2'],
  ];
  const symbols = (t) => SYMBOLS.reduce((s, [re, to]) => s.replace(re, to), t);

  // "integral from 0 to 5 of (25 - x^2) dx" -> integral sign with limits. Only where a full integral is written out (it ends in dx, dt, ...);
  // "the integral exceeds the estimate" or "which integral represents the area" stay as words. "the", "a", "definite" before it are dropped.
  const INT_WORD = new RegExp(NL + 'integral' + NR, 'gi');
  const INT_HEAD = /^\s+(?:(?:from\s+)?(\S+(?:\s+\S+)?)\s+to\s+(\S+(?:\s+\S+)?)\s+)?of\s+/;
  const INT_DIFF = /^[^.?;]{1,110}?\sd[a-z\u03b8]\b/;
  function findIntegrals(text) {
    const out = [];
    let m;
    INT_WORD.lastIndex = 0;
    while ((m = INT_WORD.exec(text))) {
      const rest = text.slice(m.index + m[0].length);
      const h = INT_HEAD.exec(rest);
      if (!h) continue;
      if (h[1] && (/[\[\]]/.test(h[1] + h[2]) || /\bof\b/.test(h[1] + ' ' + h[2]))) continue; // garbled or run-on limits
      if (!INT_DIFF.test(rest.slice(h[0].length))) continue;
      const pre = /(?:(?<![A-Za-z])(?:the|an?)\s+)?(?:(?:in)?definite\s+)?$/i.exec(text.slice(0, m.index));
      out.push({ start: pre ? pre.index : m.index, end: m.index + m[0].length + h[0].length - (h[0].length - h[0].trimEnd().length) , lo: h[1], hi: h[2], skip: m.index + m[0].length + h[0].length });
    }
    return out;
  }
  const intNode = (lo, hi) => {
    const n = el('span', { class: 'int' }, el('span', { class: 'isym', text: '\u222b' }));
    if (lo !== undefined) {
      const l = el('span', { class: 'ilim' }, el('span', { class: 'hi' }), el('span', { class: 'lo' }));
      l.children[0].append(supRich(hi)); l.children[1].append(supRich(lo));
      n.append(l);
    }
    return n;
  };

  // "x^2" -> x<sup>2</sup>, "4^(3x+1)" -> 4<sup>3x+1</sup>, "e^-x" -> e<sup>-x</sup>
  function supRich(text) {
    const frag = document.createDocumentFragment();
    let buf = '';
    const flush = () => { if (buf) { frag.append(document.createTextNode(buf)); buf = ''; } };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === 's' && text.startsWith('sqrt(', i) && !/[A-Za-z]/.test(text[i - 1] || '')) { // sqrt(x + 2): radical sign with a bar over the radicand
        let depth = 0, close = -1;
        for (let j = i + 4; j < text.length; j++) {
          if (text[j] === '(') depth++;
          else if (text[j] === ')' && --depth === 0) { close = j; break; }
        }
        if (close > 0) {
          flush();
          const rad = el('span', { class: 'rad' });
          rad.append(supRich(text.slice(i + 5, close)));
          frag.append(el('span', { class: 'sqrt' }, el('span', { class: 'rt', text: '\u221a' }), rad));
          i = close; continue;
        }
      }
      if (c === '_' && /[A-Za-z]/.test(text[i - 1] || '') && text[i + 1] === '(') { // log_(2e)
        let depth = 0, close = -1;
        for (let j = i + 1; j < text.length; j++) {
          if (text[j] === '(') depth++;
          else if (text[j] === ')' && --depth === 0) { close = j; break; }
        }
        if (close > 0) { flush(); const sb = document.createElement('sub'); sb.append(supRich(text.slice(i + 2, close))); frag.append(sb); i = close; continue; }
      }
      if (c === '_' && /[A-Za-z]/.test(text[i - 1] || '') && /[A-Za-z0-9\u221e]/.test(text[i + 1] || '')) {
        flush(); frag.append(el('sub', { text: text[i + 1] })); i++; continue; // log_a, T_n, S_∞
      }
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
      s.append(supRich(sup));
      frag.append(s);
      i = end - 1;
    }
    flush();
    return frag;
  }

  // "a/b" is a fraction: stacked with a bar. Operands are runs of numbers/letters/brackets/powers, e.g. sqrt(3)/2, d^2y/dx^2, 8/(1 - 2x).
  const GRP = '\\((?:[^()]|\\([^()]*\\))*\\)';
  const SUP = '(?:\\^(?:-?[A-Za-z0-9\\u0370-\\u03ff]+|' + GRP + '))?';
  const UNIT = '(?:(?:\\d+\\.)?[A-Za-z0-9_\\u0370-\\u03ff]+(?![A-Za-z0-9_\\u0370-\\u03ff])|' + GRP + ')' + SUP; // words are maximal, so the pattern cannot backtrack badly
  const FRAC_SRC = ('(-?(?:' + UNIT + ')+)/(-?(?:' + UNIT + ')+)');
  const NOT_FRAC = new Set(['and/or', 'his/her', 'he/she', 'true/false', 'yes/no']);
  const unwrap = (t) => {
    if (t[0] !== '(' || t[t.length - 1] !== ')') return t;
    let d = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') d++;
      else if (t[i] === ')' && --d === 0 && i < t.length - 1) return t;
    }
    return t.slice(1, -1);
  };
  function rich(text) {
    text = symbols(text.replace(/<=/g, '\u2264').replace(/>=/g, '\u2265'));
    const ints = findIntegrals(text);
    if (ints.length) {
      const f = document.createDocumentFragment();
      let at = 0;
      ints.forEach((it) => {
        f.append(rich(text.slice(at, it.start)), intNode(it.lo, it.hi), ' ');
        at = it.skip;
      });
      f.append(rich(text.slice(at)));
      return f;
    }
    const frag = document.createDocumentFragment();
    let last = 0, m;
    const FRAC = new RegExp(FRAC_SRC, 'g'); // per call: rich() recurses
    while ((m = FRAC.exec(text))) {
      const [all, a, b] = m;
      if (NOT_FRAC.has(all.toLowerCase()) || /^[A-Za-z]{4,}$/.test(a) || /^[A-Za-z]{4,}$/.test(b)) { FRAC.lastIndex = m.index + a.length; continue; }
      frag.append(supRich(text.slice(last, m.index)));
      const num = el('span', { class: 'num' }), den = el('span', { class: 'den' });
      num.append(rich(unwrap(a)));
      den.append(rich(unwrap(b)));
      frag.append(el('span', { class: 'frac' }, num, den));
      last = m.index + all.length;
    }
    frag.append(supRich(text.slice(last)));
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
  // A unit is one question, or, for lettered Section II questions, one Set of related lettered parts (column "Set": a, a+b, ...).
  const unitKey = (r) => `${r.s}|${r.y}|${r.sec}|${r.q}` + (r.ls ? `|${r.ls}` : '');
  function buildUnits(rows) {
    const map = new Map();
    for (const r of rows) {
      const k = unitKey(r);
      if (!map.has(k)) map.set(k, { key: k, school: r.s, year: r.y, sec: r.sec, q: r.q, set: r.ls || '', parts: [] });
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
      d.setAttribute('role', 'img');
      d.setAttribute('aria-label', f.label ? `Diagram: ${f.label}` : 'Diagram for this question');
      out.push(d);
    }
    return out;
  }

  // n = question number to show, or null for no number (library cards).
  function legacyMC(u, n, diag) {
    const [body] = splitMarks(stripNumber(u.parts[0].x));
    const pieces = body.split(/\s(?=[A-D]\.\s)/);
    const stem = pieces.shift();
    const opts = el('div', { class: 'opts' });
    pieces.forEach((o) => { const t = el('span'); t.append(rich(o)); opts.append(el('div', { class: 'opt' }, el('span', { class: 'oval', 'aria-hidden': 'true' }), t)); });
    const qb = el('div', { class: 'qb' }, richEl('div', 'stem', stem), ...figureEls(u.parts, diag), opts);
    return el('div', { class: 'q' }, el('div', { class: 'qh' }, ...(n != null ? [el('div', { class: 'qn', text: `${n}.` })] : []), qb));
  }

  // Working lines after a written part: more marks and harder questions get more room.
  const linesFor = (p) => Math.min(14, Math.max(2, Math.round((p.m || 1) * (1 + 0.2 * ((p.df || 1) - 1))) + 1));

  function legacyWR(u, n, diag, opts = {}) {
    const split = u.parts.map((p) => splitMarks(stripNumber(p.x)));
    const [stem, rests] = commonStem(split.map((s) => s[0]));
    const body = el('div', { class: 'qb' });
    if (stem) body.append(richEl('div', 'stem', stem));
    body.append(...figureEls(u.parts, diag));
    u.parts.forEach((p, i) => {
      body.append(el('div', { class: 'part' }, richEl('div', '', rests[i]),
        el('div', { class: 'marks', text: `[${p.m} mark${p.m === 1 ? '' : 's'}]` })));
      if (opts.lines) body.append(el('div', { class: 'lines', 'aria-hidden': 'true' }, ...Array.from({ length: linesFor(p) }, () => el('i'))));
    });
    return el('div', { class: 'q' }, el('div', { class: 'qh' }, ...(n != null ? [el('div', { class: 'qn', text: `${n}.` })] : []), body));
  }
  if (window.PaperRender) PaperRender.injectStyles();

  // ---- structured rendering via paper-render.js: grouped parts (a)/(i), shared stems, diagrams placed with the right part ----
  const diagCache = new WeakMap();
  function diagIndex(diag) {
    if (!diagCache.has(diag)) {
      const figs = new Map(); // one figure covering several parts becomes one entry listing all their ids
      for (const [id, list] of Object.entries(diag || {})) for (const f of list) {
        const k = `${f.label}\u0000${f.svg}`;
        if (!figs.has(k)) figs.set(k, { label: f.label, svg: f.svg, ids: [] });
        figs.get(k).ids.push(id);
      }
      diagCache.set(diag, window.PaperRender.indexDiagrams([...figs.values()]));
    }
    return diagCache.get(diag);
  }
  // paper-render hands us escaped text and wants HTML back: decode, then apply fractions, superscripts and symbols.
  const decode = (s) => new DOMParser().parseFromString(s, 'text/html').body.textContent;
  const formatMath = (escaped) => { const d = document.createElement('div'); d.append(rich(decode(escaped))); return d.innerHTML; };

  function renderStructured(u, n, diag, opts = {}) {
    const rows = u.parts.map((p) => ({ id: p.id, section: p.sec, marks: p.m, text: p.x }));
    const byId = Object.fromEntries(u.parts.map((p) => [p.id, p]));
    const html = window.PaperRender.renderQuestion(window.PaperRender.groupQuestions(rows)[0], diagIndex(diag), n, {
      formatMath, ovals: true, dropLetter: true,   // a lone lettered part is shown as its own question, without its letter
      afterPart: opts.lines ? (id) => `<div class="lines" aria-hidden="true">${'<i></i>'.repeat(linesFor(byId[id] || {}))}</div>` : null,
    });
    const d = el('div', { class: 'q' });
    d.innerHTML = html;
    return d;
  }
  const withFallback = (fn, legacy) => (u, n, diag, opts) => {
    try { if (window.PaperRender) return fn(u, n, diag, opts); } catch (e) { console.warn('Structured render failed, using simple layout:', u.key, e.message); }
    return legacy(u, n, diag, opts);
  };
  const renderMC = withFallback(renderStructured, legacyMC);
  const renderWR = withFallback(renderStructured, legacyWR);
  const renderUnit = (u, n, diag, opts) => (u.sec === 'I' ? renderMC(u, n, diag) : renderWR(u, n, diag, opts));

  // Label of each part as printed on a built paper. A question made of one lettered part is shown on its own:
  // its roman sub-parts become (a), (b), (c) and a single undivided part has no label. Returns Map(part id -> label).
  function shownLabels(u) {
    const out = new Map();
    const letters = new Set(u.parts.map((p) => (p.p.match(/^\([a-z]\)/) || [''])[0]).filter(Boolean));
    const solo = u.sec === 'II' && letters.size === 1;
    u.parts.forEach((p, i) => {
      if (!solo) return out.set(p.id, p.p);
      const rom = /^\([a-z]\)(\([ivx]+\))/.exec(p.p);
      out.set(p.id, rom ? `(${String.fromCharCode(97 + i)})` : '');
    });
    return out;
  }

  // e.g. "Q7", "Q14 (a)-(c)"
  function partLabel(u) {
    const ps = u.parts.map((p) => p.p).filter(Boolean);
    if (!ps.length) return `Q${u.q}`;
    const letters = [...new Set(ps.map((p) => (p.match(/^\([a-z]\)/) || [''])[0]).filter(Boolean))];
    if (letters.length === 1) return `Q${u.q} ${letters[0]}`;               // Q13 (c)
    if (letters.length > 1) return `Q${u.q} ${letters[0]}–${letters[letters.length - 1]}`;   // Q16 (a)–(b)
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
    topicsOf, subtopicsOf, figureEls, renderMC, renderWR, renderUnit, linesFor, partLabel, shownLabels, duration, roundUp5 };
})();
