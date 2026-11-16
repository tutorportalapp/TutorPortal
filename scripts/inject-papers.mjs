// Writes a plain-HTML list of the papers (school and year) into site/library.html so search engines can read it.
// Runs after build-data (needs site/data/questions.json). Only paper names are published, never question text.
import fs from 'node:fs';
const qf = 'site/data/questions.json', page = 'site/library.html';
if (!fs.existsSync(qf)) { console.log('inject-papers: no site/data/questions.json, skipped'); process.exit(0); }
const rows = JSON.parse(fs.readFileSync(qf, 'utf8'));
const papers = new Map();
for (const r of rows) {
  const k = `${r.s}|${r.y}`;
  const p = papers.get(k) || { s: r.s, y: r.y, units: new Set() };
  p.units.add([r.sec, r.q, r.ls || ''].join('|'));
  papers.set(k, p);
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const list = [...papers.values()].sort((a, b) => a.s.localeCompare(b.s) || a.y - b.y)
  .map((p) => `<li>${esc(p.s)} ${esc(p.y)} trial paper</li>`).join('');
let html = fs.readFileSync(page, 'utf8');
const re = /<!--PAPER-LIST-->[\s\S]*?<!--\/PAPER-LIST-->/;
if (!re.test(html)) { console.log('inject-papers: marker not found in library.html'); process.exit(0); }
fs.writeFileSync(page, html.replace(re, `<!--PAPER-LIST--><ul>${list}</ul><!--/PAPER-LIST-->`));
console.log(`inject-papers: listed ${papers.size} papers`);
