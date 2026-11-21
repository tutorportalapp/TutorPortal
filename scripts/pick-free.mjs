// Splits the question bank into the free half and the locked half, and writes teasers for the locked half.
// Deterministic (hash order) and spread across section, topic group and difficulty, so the free half is a fair sample.
// The logged-out preview questions are always in the free half. Whole questions (all lettered parts) stay together.
import crypto from 'node:crypto';

const hash = (s) => parseInt(crypto.createHash('sha1').update('free|' + s).digest('hex').slice(0, 8), 16);
const unitKey = (r) => [r.s, r.y, r.sec, r.q, r.ls || ''].join('|');

export function pickFree(rows, previewIds = []) {
  const prev = new Set(previewIds);
  const units = new Map();
  for (const r of rows) {
    const k = unitKey(r);
    if (!units.has(k)) units.set(k, { key: k, sec: r.sec, parts: [] });
    units.get(k).parts.push(r);
  }
  const level = (u) => Math.min(5, Math.max(1, Math.round(u.parts.reduce((s, p) => s + (p.df || 0), 0) / u.parts.length) || 1));
  const strata = new Map();
  for (const u of units.values()) {
    const k = [u.sec, (u.parts[0].g && u.parts[0].g[0]) || '', level(u)].join('|');
    (strata.get(k) || strata.set(k, []).get(k)).push(u);
  }
  const free = new Set();
  for (const list of strata.values()) {
    list.sort((a, b) => (prev.has(b.parts[0].id) - prev.has(a.parts[0].id)) || hash(a.key) - hash(b.key));
    const want = Math.ceil(list.length / 2);
    const inPrev = list.filter((u) => u.parts.some((p) => prev.has(p.id))).length;
    list.slice(0, Math.max(want, inPrev)).forEach((u) => free.add(u.key));
  }
  const freeIds = [], locked = [];
  for (const u of units.values()) {
    if (free.has(u.key)) { u.parts.forEach((p) => freeIds.push(p.id)); continue; }
    u.parts.forEach((p, i) => {
      // Teaser: enough to list and filter the question, plus the first ten words of its text. No answers, notes or diagrams.
      const words = String(p.x || '').replace(/^Q\d+\.?\s*/i, '').replace(/\s+/g, ' ').trim().split(' ');
      locked.push({ id: p.id, data: { id: p.id, y: p.y, s: p.s, sec: p.sec, q: p.q, p: p.p, ls: p.ls, m: p.m, g: p.g, t: p.t, mt: p.mt, df: p.df, locked: true,
        x: i === 0 ? words.slice(0, 10).join(' ') + (words.length > 10 ? ' …' : '') : '' } });
    });
  }
  return { freeIds, locked };
}
