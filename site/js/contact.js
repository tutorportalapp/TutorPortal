// Contact form on the home page. Messages go to the Supabase table `contact_messages`
// (view them in Supabase: Table Editor > contact_messages).
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('contactForm');
  if (!form) return;
  const say = (t, bad) => { $('cStatus').textContent = t; $('cStatus').style.color = bad ? 'var(--accent)' : ''; };

  document.addEventListener('DOMContentLoaded', async () => {
    try { const s = await TP.session(); if (s && s.user.email) $('cEmail').value = s.user.email; } catch {}
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('cEmail').value.trim(), message = $('cMsg').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Please enter a valid email address.', true); $('cEmail').focus(); return; }
    if (message.length < 5) { say('Please write a short message.', true); $('cMsg').focus(); return; }
    if ($('cWebsite').value) { say('Thanks, your message has been sent.'); form.reset(); return; } // spam trap
    $('cSend').disabled = true;
    say('Sending...');
    try {
      if (!TP.configured) throw new Error('offline demo');
      const c = await TP.client();
      const { error } = await c.from('contact_messages').insert({ email, message });
      if (error) throw error;
      say('Thanks, your message has been sent.');
      $('cMsg').value = '';
      if (window.TPUI) TPUI.toast('Message sent');
    } catch {
      say('Sorry, that did not send. Please try again in a moment.', true);
    } finally { $('cSend').disabled = false; }
  });
})();
