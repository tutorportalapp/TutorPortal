/*! paper-render.js — TutorPortal: grouped parts, placed diagrams, curve hydration. No dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PaperRender = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];

  /* ---------- 1. rows ---------- */
  function parseId(id) {
    var m = /^(.+?)-(\d{4})-Q(\d+)((?:\([a-z]+\))*)$/.exec(String(id || '').trim());
    if (!m) return null;
    var t = (m[4].match(/\(([a-z]+)\)/g) || []).map(function (x) { return x.slice(1, -1); });
    return { school: m[1], year: +m[2], q: +m[3], letter: t[0] || '', roman: t[1] || '',
             qKey: m[1] + '-' + m[2] + '-Q' + m[3] };
  }
  function normaliseRow(r, i) {            // accepts sheet headers or camelCase JSON
    var id = r.id || r.questionId || r['Question ID'], p = parseId(id);
    if (!p) throw new Error('Unrecognised Question ID: ' + id);
    var marks = r.marks != null ? r.marks : r.Marks;
    return Object.assign({
      id: id, section: String(r.section || r.Section || ''), marks: Number(marks),
      text: String(r.text || r.questionText || r['Question text'] || ''), _i: i || 0
    }, p);
  }
  function rowOrder(a, b) {
    if (a.letter !== b.letter) return a.letter < b.letter ? -1 : 1;
    var d = ROMAN.indexOf(a.roman) - ROMAN.indexOf(b.roman);
    return d || a._i - b._i;
  }
  function groupQuestions(rawRows) {       // one array of rows per ORIGINAL question
    var map = new Map();
    rawRows.map(normaliseRow).forEach(function (r) {
      if (!map.has(r.qKey)) map.set(r.qKey, []);
      map.get(r.qKey).push(r);
    });
    return Array.from(map.values()).map(function (rows) { return rows.sort(rowOrder); });
  }

  /* ---------- 2. split "Question text" ---------- */
  function stripMarks(t) { return t.replace(/\s*\[\s*\d+\s*marks?\s*\]\s*$/i, ''); }
  function stripNotes(t) { return t.replace(/\s*\[Parts?\b[^\]]*\]/g, ''); }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function findMarker(t, src) {
    var m = new RegExp('(^|\\s)(' + src + ')').exec(t);
    return m ? { index: m.index + m[1].length, len: m[2].length } : null;
  }
  // -> { pre: text before the letter, lStem: text between (a) and (i), sub: the sub-part wording }
  function splitRow(row) {
    var t = stripNotes(stripMarks(row.text)).replace(/^Q\d+\.\s*/, '').trim();
    if (!row.letter) return { pre: '', lStem: '', sub: t };
    var L = reEsc(row.letter), m, lm;
    if (row.roman) {
      var R = reEsc(row.roman);
      m = findMarker(t, '\\(' + L + '\\)\\(' + R + '\\)');                       // "(b)(ii) ..."
      if (m) return { pre: t.slice(0, m.index).trim(), lStem: '', sub: t.slice(m.index + m.len).trim() };
      m = findMarker(t, '\\(' + R + '\\)');                                      // "(a) stem (ii) ..."
      if (m) {
        var before = t.slice(0, m.index).trim(), sub = t.slice(m.index + m.len).trim();
        lm = findMarker(before, '\\(' + L + '\\)');
        if (lm) return { pre: before.slice(0, lm.index).trim(), lStem: before.slice(lm.index + lm.len).trim(), sub: sub };
        return { pre: '', lStem: before, sub: sub };
      }
      return { pre: '', lStem: '', sub: t };
    }
    lm = findMarker(t, '\\(' + L + '\\)');
    if (lm) return { pre: t.slice(0, lm.index).trim(), lStem: '', sub: t.slice(lm.index + lm.len).trim() };
    return { pre: '', lStem: '', sub: t };
  }
  function splitOptions(t) {               // "stem A. .. B. .. C. .. D. .." -> {stem, options}
    var re = /(^|\s)([A-D])\.\s/g, hits = [], m;
    while ((m = re.exec(t))) hits.push({ k: m[2], start: m.index + m[1].length, end: m.index + m[0].length });
    for (var a = hits.length - 1; a >= 0; a--) {
      if (hits[a].k !== 'A') continue;
      var seq = [hits[a]], want = ['B', 'C', 'D'], from = a + 1, ok = true;
      for (var w = 0; w < 3 && ok; w++) {
        var f = null;
        for (var j = from; j < hits.length; j++) if (hits[j].k === want[w]) { f = j; break; }
        if (f == null) ok = false; else { seq.push(hits[f]); from = f + 1; }
      }
      if (!ok) continue;
      return { stem: t.slice(0, seq[0].start).trim(),
               options: seq.map(function (h, i) { return { k: h.k, text: t.slice(h.end, i < 3 ? seq[i + 1].start : t.length).trim() }; }) };
    }
    return null;
  }

  /* ---------- 3. diagrams ---------- */
  function splitIds(v) { return Array.isArray(v) ? v : String(v || '').split(/\s*,\s*/).filter(Boolean); }
  function indexDiagrams(rows) {           // Map: Question ID -> [diagram]
    var byId = new Map();
    rows.forEach(function (r, i) {
      var d = { n: i, unit: r.unit || r.unitKey || r['Unit key'] || '',
        label: r.label != null ? r.label : (r.figureLabel != null ? r.figureLabel : (r['Figure label'] || '')),
        svg: r.svg || r.diagramSvg || r['Diagram SVG'] || '',
        ids: splitIds(r.ids || r.questionIds || r['Question IDs covered']) };
      d.ids.forEach(function (id) { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(d); });
    });
    return byId;
  }

  var FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, sqrt: Math.sqrt,
                abs: Math.abs, ln: Math.log, log: Math.log10 };
  var CONSTS = { pi: Math.PI, e: Math.E };
  function compile(expr, varName) {        // safe recursive-descent parser, no eval
    var tokens = expr.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z_]+|[-+*\/^(),]/gi);
    if (!tokens || tokens.join('').length !== expr.replace(/\s+/g, '').length) throw new Error('bad formula: ' + expr);
    var pos = 0, peek = function () { return tokens[pos]; }, next = function () { return tokens[pos++]; };
    function parseExpr() {
      var left = parseTerm();
      while (peek() === '+' || peek() === '-') {
        var op = next(), right = parseTerm(), l = left;
        left = op === '+' ? function (x) { return l(x) + right(x); } : function (x) { return l(x) - right(x); };
      }
      return left;
    }
    function parseTerm() {
      var left = parseUnary();
      while (peek() === '*' || peek() === '/') {
        var op = next(), right = parseUnary(), l = left;
        left = op === '*' ? function (x) { return l(x) * right(x); } : function (x) { return l(x) / right(x); };
      }
      return left;
    }
    function parseUnary() {
      if (peek() === '-') { next(); var u = parseUnary(); return function (x) { return -u(x); }; }
      if (peek() === '+') { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {                // right-assoc; -x^2 = -(x^2)
      var base = parseAtom();
      if (peek() === '^') { next(); var ex = parseUnary(); return function (x) { return Math.pow(base(x), ex(x)); }; }
      return base;
    }
    function parseAtom() {
      var t = next();
      if (t === undefined) throw new Error('unexpected end: ' + expr);
      if (t === '(') { var inner = parseExpr(); if (next() !== ')') throw new Error('missing )'); return inner; }
      if (/^[\d.]/.test(t)) { var num = parseFloat(t); return function () { return num; }; }
      var name = t.toLowerCase();
      if (name === varName.toLowerCase()) return function (x) { return x; };
      if (name in CONSTS) { var c = CONSTS[name]; return function () { return c; }; }
      if (name in FUNCS) {
        if (next() !== '(') throw new Error('expected ( after ' + name);
        var arg = parseExpr(); if (next() !== ')') throw new Error('missing )');
        var fn = FUNCS[name]; return function (x) { return fn(arg(x)); };
      }
      throw new Error('unknown name "' + t + '"');
    }
    var f = parseExpr();
    if (pos < tokens.length) throw new Error('unexpected "' + tokens[pos] + '"');
    return f;
  }
  function attr(tag, name) { var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; }

  // Adds the missing d="" to every <path data-curve=".." data-map="xmin,xmax,ymin,ymax,left,top,w,h">
  function hydrateSvg(svg, samples) {
    samples = samples || 400;
    return svg.replace(/<path\b[^>]*\sdata-curve="[^"]*"[^>]*>/g, function (tag) {
      try {
        var map = (attr(tag, 'data-map') || '').split(',').map(Number);
        if (map.length !== 8 || map.some(isNaN)) return tag;
        var f = compile(attr(tag, 'data-curve'), attr(tag, 'data-var') || 'x');
        var xmin = map[0], xmax = map[1], ymin = map[2], ymax = map[3], L = map[4], T = map[5], W = map[6], H = map[7];
        var yr = ymax - ymin, pad = yr * 0.25, d = '', pen = false, prev = null;
        for (var i = 0; i <= samples; i++) {
          var x = xmin + (xmax - xmin) * i / samples, y = f(x);
          if (!isFinite(y) || y > ymax + pad || y < ymin - pad) { pen = false; prev = null; continue; }
          var px = L + W * (x - xmin) / (xmax - xmin), py = T + H * (ymax - y) / yr;
          if (prev !== null && Math.abs(py - prev) > H * 0.6) pen = false;      // asymptote jump
          d += (pen ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1) + ' ';
          pen = true; prev = py;
        }
        if (!d) return tag;
        return tag.replace(/\sd="[^"]*"/, '').replace(/\s*\/?>$/, function (end) { return ' d="' + d.trim() + '"' + end; });
      } catch (e) { console.warn('[paper-render] curve skipped:', e.message); return tag; }
    });
  }
  var uid = 0;
  function prepareSvg(svg, label) {        // hydrate, unique ids, sensible on-page size
    var s = hydrateSvg(svg), n = ++uid, ids = {};
    s.replace(/\sid="([^"]+)"/g, function (m, id) { ids[id] = 1; return m; });
    Object.keys(ids).forEach(function (id) {
      var nid = 'f' + n + '-' + id;
      s = s.split('id="' + id + '"').join('id="' + nid + '"').split('url(#' + id + ')').join('url(#' + nid + ')');
    });
    return s.replace(/<svg\b([^>]*)>/, function (all, a) {
      if (!/\srole=/.test(a)) a += ' role="img"';
      if (label && String(label).length > 1 && !/\saria-label=/.test(a)) a += ' aria-label="Diagram: ' + esc(label).replace(/"/g, '&quot;') + '"';
      if (!/\swidth=/.test(a)) {
        var vb = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(a);
        if (vb) a += ' style="width:min(100%,' + Math.round(+vb[1]) + 'px);height:auto"';
      }
      return '<svg' + a + '>';
    });
  }

  /* ---------- 4. build + render ---------- */
  function buildQuestion(rows, dIndex) {
    rows = rows.slice().sort(rowOrder);
    var groups = [], by = {};
    rows.forEach(function (r) {
      if (!by.hasOwnProperty(r.letter)) { by[r.letter] = { letter: r.letter, rows: [], pre: '', stem: '', subs: [], figures: [] }; groups.push(by[r.letter]); }
      by[r.letter].rows.push(r);
    });
    groups.forEach(function (g) {
      var first = splitRow(g.rows[0]); g.pre = first.pre; g.stem = first.lStem;
      var shown = first.lStem;
      g.rows.forEach(function (r, idx) {
        var s = splitRow(r), interlude = '';
        if (idx > 0 && s.lStem && s.lStem !== shown && s.lStem.indexOf(shown) === 0) {   // narrative between sub-parts
          var extra = s.lStem.slice(shown.length).trim(), cut = extra.search(/\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)/);
          if (cut >= 0) extra = extra.slice(0, cut).trim();
          if (extra) { interlude = extra; shown += ' ' + extra; }
        }
        g.subs.push({ id: r.id, roman: r.roman, marks: r.marks, text: s.sub, interlude: interlude });
      });
    });
    var pres = groups.map(function (g) { return g.pre; });
    var shared = pres[0] && pres.every(function (p) { return p === pres[0]; }) ? pres[0] : '';   // stem used by (a),(b),(c)
    if (shared) groups.forEach(function (g) { g.pre = ''; });

    var idToGroup = {}, seen = {}, top = [];
    groups.forEach(function (g) { g.rows.forEach(function (r) { idToGroup[r.id] = g; }); });
    rows.forEach(function (r) {
      (dIndex.get(r.id) || []).forEach(function (d) {
        if (seen[d.n]) return; seen[d.n] = true;
        var hit = [];
        d.ids.forEach(function (id) { var g = idToGroup[id]; if (g && hit.indexOf(g) < 0) hit.push(g); });
        if (hit.length === 1) hit[0].figures.push(d); else top.push(d);   // one part -> that part; several -> top of question
      });
    });
    return { key: rows[0].qKey, isMC: /^I$/i.test(rows[0].section.trim()), shared: shared, figures: top, groups: groups };
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function marksLabel(n) { return isNaN(n) ? '' : '[' + n + ' mark' + (n === 1 ? '' : 's') + ']'; }
  var isOptFig = function (d) { return /^[A-D]$/.test(String(d.label)); };

  // rows = ONE original question's rows (from groupQuestions). opts.formatMath: your existing
  // superscript/maths formatter (receives HTML-escaped text, returns HTML).
  function renderQuestion(rows, dIndex, number, opts) {
    opts = opts || {};
    var f = function (s) { return (opts.formatMath || function (x) { return x; })(esc(s)); };
    var q = buildQuestion(rows, dIndex);
    var fig = function (d) { return '<figure class="pq-fig">' + prepareSvg(d.svg, d.label) + '</figure>'; };
    var figs = function (l) { return l.filter(function (d) { return !isOptFig(d); }).map(fig).join(''); };
    function body(sub, list) {
      if (!q.isMC) return '<div class="pq-text">' + f(sub.text) + '</div>' + figs(list);
      var p = splitOptions(sub.text);
      if (!p) return '<div class="pq-text">' + f(sub.text) + '</div>' + figs(list);
      var byL = {}; list.forEach(function (d) { if (isOptFig(d)) byL[d.label] = d; });
      return '<div class="pq-text">' + f(p.stem) + '</div>' + figs(list) +
        '<ol class="pq-opts' + (Object.keys(byL).length ? ' pq-opts-fig' : '') + (opts.ovals ? ' pq-opts-oval' : '') + '">' +
        p.options.map(function (o) {
          var inner = (byL[o.k] && /^\[graph\]$/i.test(o.text)) ? fig(byL[o.k]) : f(o.text);
          return '<li>' + (opts.ovals ? '<span class="pq-oval" aria-hidden="true"></span>' : '') + '<span class="pq-label">' + o.k + '.</span><span>' + inner + '</span></li>';
        }).join('') + '</ol>';
    }
    var mk = function (n) { return q.isMC && !opts.showMCMarks ? '' : marksLabel(n); };   // multiple-choice questions show no marks
    var after = function (sub) { return opts.afterPart ? opts.afterPart(sub.id, sub.marks) : ''; };   // e.g. working lines
    function line(label, html, marks, cls) {
      return '<div class="pq-line' + (cls ? ' ' + cls : '') + (label ? '' : ' pq-nolabel') + '"><span class="pq-label">' + esc(label || '') +
        '</span><div class="pq-body">' + html + '</div><span class="pq-marks">' + esc(marks || '') + '</span></div>';
    }
    var out = ['<section class="pq' + (number == null ? ' pq-nonum' : '') + (q.isMC ? ' pq-mc' : '') + '" data-qkey="' + esc(q.key) + '"><div class="pq-num">' +
      (number != null ? esc(number) + '.' : '') + '</div><div class="pq-main">'];
    if (q.shared) out.push('<p class="pq-stem">' + f(q.shared) + '</p>');
    out.push(figs(q.figures));
    q.groups.forEach(function (g) {
      out.push('<div class="pq-group">');
      if (g.pre) out.push('<p class="pq-stem">' + f(g.pre) + '</p>');
      var lab = g.letter ? '(' + g.letter + ')' : '';
      if (g.subs.length === 1 && !g.subs[0].roman) {
        out.push(line(lab, body(g.subs[0], g.figures), mk(g.subs[0].marks)) + after(g.subs[0]));        // (a) text ...... [2 marks]
      } else {
        out.push(line(lab, (g.stem ? '<div class="pq-text">' + f(g.stem) + '</div>' : '') + figs(g.figures), ''));  // (a) stem + figure
        g.subs.forEach(function (s) {
          if (s.interlude) out.push(line('', '<div class="pq-text">' + f(s.interlude) + '</div>', '', 'pq-interlude'));
          out.push(line(s.roman ? '(' + s.roman + ')' : '', '<div class="pq-text">' + f(s.text) + '</div>', mk(s.marks), 'pq-sub') + after(s));
        });
      }
      out.push('</div>');
    });
    out.push('</div></section>');
    return out.join('');
  }

  function renderPaper(questionRows, diagramRows, opts) {
    var idx = indexDiagrams(diagramRows);
    return groupQuestions(questionRows).map(function (rows, i) {
      return renderQuestion(rows, idx, ((opts && opts.startAt) || 1) + i, opts);
    }).join('\n');
  }

  var CSS = [
    '.pq{display:grid;grid-template-columns:2.2em 1fr;column-gap:.4em;margin:0 0 1.4em;line-height:1.5}',
    '.pq-num{font-weight:700}.pq-main{min-width:0}.pq-stem{margin:0 0 .5em}.pq-group{margin:0 0 .6em}',
    '.pq-line{display:grid;grid-template-columns:2.4em 1fr auto;column-gap:.5em;align-items:start;margin:0 0 .45em;break-inside:avoid}',
    '.pq-label{white-space:nowrap}.pq-body{min-width:0}.pq-text{margin:0}',
    '.pq-marks{white-space:nowrap;text-align:right;font-size:.85em;opacity:.8;padding-top:.1em}',
    '.pq-fig{margin:.5em 0 .8em;break-inside:avoid}.pq-fig svg{display:block;max-width:100%;height:auto}',
    '.pq-opts{list-style:none;margin:.4em 0 0;padding:0}',
    '.pq-opts li{display:grid;grid-template-columns:1.8em 1fr;margin:.15em 0;break-inside:avoid}',
    '.pq-opts-fig{display:grid;grid-template-columns:1fr 1fr;gap:.6em 1em}.pq-opts-fig .pq-fig{margin:0}',
    '.pq-nonum{grid-template-columns:1fr}.pq-nonum .pq-num{display:none}',
    '.pq-nolabel:not(.pq-interlude){grid-template-columns:0 1fr auto}',
    '.pq-oval{display:inline-block;width:1.4em;height:.85em;border:1.4px solid currentColor;border-radius:50%;align-self:center}',
    '.pq-opts-oval li{grid-template-columns:2em 1.8em 1fr}'
  ].join('\n');
  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('paper-render-css')) return;
    var el = document.createElement('style'); el.id = 'paper-render-css'; el.textContent = CSS; document.head.appendChild(el);
  }

  return { parseId: parseId, groupQuestions: groupQuestions, splitRow: splitRow, splitOptions: splitOptions,
           indexDiagrams: indexDiagrams, hydrateSvg: hydrateSvg, compile: compile,
           buildQuestion: buildQuestion, renderQuestion: renderQuestion, renderPaper: renderPaper,
           injectStyles: injectStyles, CSS: CSS };
});