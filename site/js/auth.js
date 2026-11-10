// Shared auth helper (Supabase Auth). Exposes window.TP.
(() => {
  const cfg = window.TUTORPORTAL || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  let client = null;

  function load() {
    if (client || !configured) return Promise.resolve(client);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      s.onload = () => {
        client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        resolve(client);
      };
      s.onerror = () => reject(new Error('Could not load the sign-in library.'));
      document.head.append(s);
    });
  }


  // Paper history store: Supabase table saved_papers when connected, localStorage in local demo mode.
  // Record: { id, title, settings:{mc:[unitKey],wr:[unitKey],answers}, completed, created_at, updated_at }
  const LS = 'tutorportal.papers';
  const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
  const lsWrite = (v) => { try { localStorage.setItem(LS, JSON.stringify(v)); } catch {} };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const papers = {
    async list() {
      if (!configured) return lsRead().sort((x, y) => (y.updated_at || '').localeCompare(x.updated_at || ''));
      const c = await load();
      const { data, error } = await c.from('saved_papers').select('*').order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    async get(id) { return (await papers.list()).find((p) => p.id === id) || null; },
    async add(rec) {
      const now = new Date().toISOString();
      if (!configured) {
        const r = { id: uid(), completed: false, created_at: now, updated_at: now, ...rec };
        lsWrite([r, ...lsRead()]);
        return r;
      }
      const c = await load();
      const { data, error } = await c.from('saved_papers').insert({ ...rec, updated_at: now }).select().single();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const now = new Date().toISOString();
      if (!configured) {
        lsWrite(lsRead().map((r) => (r.id === id ? { ...r, ...patch, updated_at: now } : r)));
        return;
      }
      const c = await load();
      const { error } = await c.from('saved_papers').update({ ...patch, updated_at: now }).eq('id', id);
      if (error) throw error;
    },
    async remove(ids) {
      if (!ids.length) return;
      if (!configured) { lsWrite(lsRead().filter((r) => !ids.includes(r.id))); return; }
      const c = await load();
      const { error } = await c.from('saved_papers').delete().in('id', ids);
      if (error) throw error;
    },
  };

  const TP = {
    configured,
    // Local-only preview so you can test the builder before Supabase is connected. Never active on the live site.
    demo: !configured && local,
    client: load,
    async session() {
      const c = await load();
      if (!c) return null;
      return (await c.auth.getSession()).data.session;
    },
    // Call at the top of any protected page. Sends visitors to login.html if not signed in.
    async requireLogin() {
      if (TP.demo) return { user: { email: 'demo@localhost', user_metadata: { display_name: 'Demo' } } };
      const s = await TP.session();
      if (!s) {
        location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() || 'builder.html'));
        return new Promise(() => {});
      }
      return s;
    },
    async signOut() {
      const c = await load();
      if (c) await c.auth.signOut();
      location.href = 'index.html';
    },
    // Fills the nav "Log in" button / account menu.
    async navState() {
      const slot = document.getElementById('authSlot');
      if (!slot) return;
      const s = TP.demo ? null : await TP.session().catch(() => null);
      if (s) {
        const name = (s.user.user_metadata && s.user.user_metadata.display_name) || s.user.email;
        slot.innerHTML = '';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = name;
        const out = document.createElement('button');
        out.className = 'btn';
        out.textContent = 'Log out';
        out.onclick = TP.signOut;
        slot.append(who, out);
      }
    },
  };

  TP.MODULES = {
    'Functions & Algebra': ['Functions & Algebra', 'Exponentials & Logarithms'],
    'Trigonometry': ['Trigonometry', 'Trigonometric Functions & Identities'],
    'Calculus': ['Differentiation', 'Applications of Differentiation', 'Integration', 'Applications of Integration'],
    'Sequences and Series': ['Sequences & Series', 'Financial Mathematics'],
    'Probability and Statistics': ['Probability', 'Random Variables & Normal Distribution', 'Statistical Analysis'],
  };

  // Questions come from Supabase (logged-in users only). Local demo mode falls back to the sample JSON.
  let dataPromise = null;
  TP.loadData = () => (dataPromise ||= (async () => {
    if (configured) {
      const c = await load();
      const page = async (table, col) => {
        let out = [], from = 0;
        for (;;) {
          const { data, error } = await c.from(table).select(col).range(from, from + 999);
          if (error) throw error;
          out = out.concat(data);
          if (data.length < 1000) return out;
          from += 1000;
        }
      };
      const rows = (await page('questions', 'data')).map((r) => r.data);
      const diag = {};
      for (const r of await page('diagrams', 'question_id,figures')) diag[r.question_id] = r.figures;
      return [rows, diag];
    }
    return Promise.all([
      fetch('data/questions.json').then((r) => r.json()),
      fetch('data/diagrams.json').then((r) => r.json()).catch(() => ({})),
    ]);
  })());

  // Top-right masthead line, e.g. "10 PAPERS · 640 QUESTIONS · 2 SCHOOLS".
  TP.stats = (rows) => {
    const el = document.getElementById('mastStats');
    if (!el) return;
    const papers = new Set(rows.map((r) => r.s + '|' + r.y)).size;
    const units = new Set(rows.map((r) => [r.s, r.y, r.sec, r.q].join('|'))).size;
    const schools = new Set(rows.map((r) => r.s)).size;
    el.textContent = `${papers} papers · ${units} questions · ${schools} ${schools === 1 ? 'school' : 'schools'}`;
  };

  TP.papers = papers;
  window.TP = TP;
  document.addEventListener('DOMContentLoaded', TP.navState);
})();
