// Small shared UI pieces: light/dark theme, toasts, skip link, animated expanding filter groups, empty states.
(() => {
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  // ---- theme (set before first paint) ----
  const getTheme = () => { try { return localStorage.getItem('tp.theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } };
  root.dataset.theme = getTheme();

  const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function themeButton() {
    const bar = document.querySelector('.toolbar');
    if (!bar || document.getElementById('themeBtn')) return;
    const b = document.createElement('button');
    b.id = 'themeBtn';
    b.type = 'button';
    b.className = 'btn icon-btn';
    const paint = () => {
      const light = root.dataset.theme === 'light';
      b.innerHTML = light ? MOON : SUN;
      b.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      b.title = light ? 'Dark mode' : 'Light mode';
    };
    b.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('tp.theme', root.dataset.theme); } catch {}
      paint();
    });
    paint();
    bar.prepend(b);
  }

  // ---- toast ----
  function toast(msg) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.append(box);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---- empty state ----  actions: [{ label, href?, onClick?, primary? }]
  function empty(title, text, actions = []) {
    const d = document.createElement('div');
    d.className = 'empty-state';
    d.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M24 12c-4-3-10-4-17-4v28c7 0 13 1 17 4 4-3 10-4 17-4V8c-7 0-13 1-17 4z"/><path d="M24 12v28"/></svg>';
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('p'); p.textContent = text;
    d.append(h, p);
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'actions';
      actions.forEach((a) => {
        const el = document.createElement(a.href ? 'a' : 'button');
        el.className = 'btn' + (a.primary ? ' primary' : '');
        el.textContent = a.label;
        if (a.href) el.href = a.href; else el.addEventListener('click', a.onClick);
        row.append(el);
      });
      d.append(row);
    }
    return d;
  }

  // ---- expanding filter groups: arrow rotates, list slides down from the summary ----
  document.addEventListener('click', (e) => {
    const s = e.target.closest && e.target.closest('details.group > summary');
    if (!s) return;
    e.preventDefault();
    const d = s.parentElement;
    const inner = d.querySelector('.inner');
    if (d._anim) { d._anim.cancel(); d._anim = null; }
    const opening = !d.classList.contains('is-open');
    d.classList.toggle('is-open', opening);
    if (opening) d.open = true;
    s.setAttribute('aria-expanded', String(opening));
    if (reduced() || !inner) { if (!opening) d.open = false; return; }
    const cs = getComputedStyle(inner);
    const pad = { paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom };
    const full = inner.scrollHeight;
    const closed = { height: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: 0, transform: 'translateY(-8px)' };
    const open = { height: full + 'px', ...pad, opacity: 1, transform: 'translateY(0)' };
    const a = inner.animate(opening ? [closed, open] : [open, closed], { duration: opening ? 240 : 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
    d._anim = a;
    a.onfinish = () => { d._anim = null; if (!opening) d.open = false; };
    a.oncancel = () => { d._anim = null; };
  });

  document.addEventListener('DOMContentLoaded', () => {
    themeButton();
    const main = document.querySelector('main');
    if (main && !document.querySelector('.skip')) {
      main.id = main.id || 'main-content';
      main.tabIndex = -1;
      const a = document.createElement('a');
      a.className = 'skip';
      a.href = '#' + main.id;
      a.textContent = 'Skip to content';
      document.body.prepend(a);
    }
  });

  window.TPUI = { toast, empty, reduced };
})();
