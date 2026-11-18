// Chooses the questions that logged-out visitors can use in the Builder preview: 10 multiple choice and 10 written response.
// Multiple choice is spread across the topic groups and difficulty levels; written response covers every difficulty level (two each).
// The choice is deterministic, so it only changes when the question bank does. Called by scripts/sync-supabase.mjs.
import crypto from 'node:crypto';

const hash = (s) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
const unitKey = (r) => [r.s, r.y, r.sec, r.q, r.ls || ''].join('|');

export function pickPreview(rows, diagrams = {}, { mc = 10, wr = 10 } = {}) {
  const units = new Map();
  for (const r of rows) {
    const k = unitKey(r);
    if (!units.has(k)) units.set(k, { key: k, sec: r.sec, parts: [] });
    units.get(k).parts.push(r);
  }
  const level = (u) => Math.min(5, Math.max(1, Math.round(u.parts.reduce((s, p) => s + (p.df || 0), 0) / u.parts.length) || 1));
  const marks = (u) => u.parts.reduce((s, p) => s + (p.m || 0), 0);
  const group = (u) => (u.parts[0].g && u.parts[0].g[0]) || '';
  const hasFig = (u) => u.parts.some((p) => diagrams[p.id]);
  const clean = (u) => !u.parts.some((p) => /garbled|not readable|unreadable|\[text/i.test(p.x || ''));

  const choose = (pool, n, want) => {
    const out = [], cnt = { g: {}, l: {}, fig: 0 };
    pool = pool.slice().sort((a, b) => hash(a.key) - hash(b.key));
    while (out.length < n && pool.length) {
      let best = -1, bestScore = Infinity;
      pool.forEach((u, i) => {
        const l = level(u), g = group(u);
        const score = (want ? Math.max(0, (cnt.l[l] || 0) - want[l] + 1) * 100 : (cnt.l[l] || 0) * 2) + (cnt.g[g] || 0) * 3 + (hasFig(u) && cnt.fig >= 3 ? 50 : 0) + i / pool.length;
        if (score < bestScore) { bestScore = score; best = i; }
      });
      const u = pool.splice(best, 1)[0];
      out.push(u);
      cnt.l[level(u)] = (cnt.l[level(u)] || 0) + 1;
      cnt.g[group(u)] = (cnt.g[group(u)] || 0) + 1;
      if (hasFig(u)) cnt.fig++;
    }
    return out;
  };
  const all = [...units.values()].filter(clean);
  const mcPool = all.filter((u) => u.sec === 'I');
  const wrPool = all.filter((u) => u.sec === 'II' && marks(u) >= 2 && marks(u) <= 8 && u.parts.length <= 4);
  const picked = [...choose(mcPool, mc, null), ...choose(wrPool, wr, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 })];
  return picked.flatMap((u) => u.parts.map((p) => p.id));
}
