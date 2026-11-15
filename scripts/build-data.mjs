// Converts data/Master_Question_Database.xlsx into site/data/questions.json and site/data/diagrams.json.
// Usage: npm run build:data   (or: node scripts/build-data.mjs path/to/workbook.xlsx)
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const args = process.argv.slice(2);
const privateMode = args.includes('--private'); // writes to build/ (never published); used before syncing to Supabase
const src = args.find((a) => !a.startsWith('--')) || 'data/Master_Question_Database.xlsx';
const outDir = privateMode ? 'build' : 'site/data';

if (!fs.existsSync(src)) {
  console.log(`No workbook at ${src}. Keeping the existing files in ${outDir}.`);
  process.exit(0);
}

const wb = XLSX.readFile(src);
const sheet = (name) => {
  if (!wb.Sheets[name]) throw new Error(`Workbook has no "${name}" sheet`);
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
};
const str = (v) => String(v ?? '').trim();
const list = (v) => str(v).split(';').map((s) => s.trim()).filter(Boolean);

const rows = sheet('Questions');
const seen = new Set();
const questions = rows.map((r, i) => {
  const id = str(r['Question ID']);
  if (!id) throw new Error(`Questions row ${i + 2} has no Question ID`);
  if (seen.has(id)) throw new Error(`Duplicate Question ID: ${id}`);
  seen.add(id);
  if (!str(r['Question text'])) console.warn(`Warning: ${id} has no question text`);
  return {
    id,
    y: Number(r['Year']),
    s: str(r['School']),
    sec: str(r['Section']),
    q: Number(r['Question']),
    p: str(r['Part']),
    ls: str(r['Set']),   // lettered parts that belong together, e.g. "a+b"; blank = no letters / Section I
    m: Number(r['Marks']),
    d: str(r['Question description']),
    g: list(r['Topic Group']),
    t: list(r['Topic(s)']),
    st: list(r['Sub-topic(s)']),
    mt: str(r['Multi-topic']) === 'Yes',
    cr: str(r['Creative thinking']) === 'Yes',
    df: Number(r['Difficulty']),
    oc: list(r['Outcome codes']),
    a: str(r['Final answer / solution']),
    n: str(r['Data note']),
    x: str(r['Question text']),
  };
});

// Diagrams: map each Question ID to its figures.
const diagrams = {};
if (wb.Sheets['Diagrams']) {
  for (const r of sheet('Diagrams')) {
    const svg = str(r['Diagram SVG']);
    if (!svg) continue;
    const fig = { label: str(r['Figure label']), svg };
    for (const id of str(r['Question IDs covered']).split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!seen.has(id)) console.warn(`Warning: diagram references unknown Question ID ${id}`);
      (diagrams[id] ||= []).push(fig);
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(questions));
fs.writeFileSync(path.join(outDir, 'diagrams.json'), JSON.stringify(diagrams));
console.log(`Wrote ${questions.length} question parts and ${Object.keys(diagrams).length} diagram links to ${outDir}`);
