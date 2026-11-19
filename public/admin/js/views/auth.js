// Sign in, password reset request, and set-password (invite acceptance and reset links).
import { h, icon, clear } from '../core/dom.js';
import { auth, db, isDemo } from '../core/data.js';
import { toast } from '../core/ui.js';

const card = (...children) => h('div.authpage', h('div.authcard',
  h('img.authcard__logo', { src: '/assets/img/procyon-logo.svg', alt: 'Procyon Technostructure', width: 168, height: 42 }), ...children,
  h('p.authcard__foot', h('a', { href: '/' }, '← Back to the website'))));

export async function render(root, { mode }, { onSignedIn }) {
  document.title = 'Sign in | Procyon Admin';
  if (mode === 'accept-invite' || mode === 'reset-password') return setPassword(root);
  const existing = await auth.session().catch(() => null);
  if (existing && !isDemo()) { await onSignedIn(existing); return; }
  return signIn(root, onSignedIn);
}

function signIn(root, onSignedIn, resetMode = false) {
  clear(root);
  const email = h('input.input', { type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'name@procyonts.com', id: 'li-email' });
  const pass = h('input.input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, minlength: 6, placeholder: 'Password', id: 'li-pass' });
  const show = h('button.input__btn', { type: 'button', 'aria-label': 'Show password', onclick: () => { pass.type = pass.type === 'password' ? 'text' : 'password'; } }, icon('eye', 16));
  const err = h('p.form-err', { role: 'alert', hidden: true });
  const btn = h('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, resetMode ? 'Send reset link' : 'Sign in');
  const form = h('form.authform', { novalidate: true },
    h('label.field', h('span.field__l', 'Work email'), email),
    resetMode ? null : h('label.field', h('span.field__l', 'Password'), h('span.input__wrap', pass, show)),
    err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const em = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { err.textContent = 'Enter a valid email address.'; err.hidden = false; email.focus(); return; }
    if (!resetMode && !pass.value) { err.textContent = 'Enter your password.'; err.hidden = false; pass.focus(); return; }
    btn.disabled = true; btn.classList.add('is-busy');
    try {
      if (resetMode) {
        await auth.resetPassword(em);
        clear(form).append(h('div.authdone', icon('mail', 28), h('h2', 'Check your inbox'), h('p', `If ${em} has admin access, a link to set a new password is on its way. The link opens this console.`)));
      } else {
        const session = await auth.signIn(em, pass.value);
        await onSignedIn(session);
      }
    } catch (ex) {
      err.textContent = /invalid login/i.test(ex.message) ? 'That email and password do not match an admin account.' : ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; btn.classList.remove('is-busy'); }
  });
  root.append(card(
    h('h1', resetMode ? 'Reset your password' : 'Sign in to the admin'),
    h('p.muted', resetMode ? 'Enter the email you use for the admin. A secure link to set a new password will be emailed.' : 'Leads, meetings, applications and website content in one place.'),
    form,
    h('button.linkbtn', { type: 'button', onclick: () => signIn(root, onSignedIn, !resetMode) }, resetMode ? '← Back to sign in' : 'Forgot password?'),
    h('p.authcard__note', icon('lock', 13), 'Access is by invitation only. Your existing admin account works here.'),
    isDemo() || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? null : h('p.authcard__note', h('a', { href: '/admin?demo=admin' }, 'Explore with sample data instead'))));
  setTimeout(() => email.focus(), 30);
}

async function setPassword(root) {
  document.title = 'Set your password | Procyon Admin';
  clear(root);
  const hash = location.hash || '';
  if (/error=|otp_expired/.test(hash)) {
    root.append(card(h('h1', 'This link has expired'), h('p.muted', 'Invite and reset links work once and expire. Ask an administrator to resend the invite, or request a new reset link.'),
      h('a.btn.btn--primary.btn--block', { href: '/admin/login' }, 'Go to sign in')));
    return;
  }
  const wait = h('p.muted', 'Checking your link…');
  root.append(card(h('h1', 'Set your password'), wait));
  // supabase-js reads the token from the URL fragment; give it a moment.
  let session = null;
  for (let i = 0; i < 20 && !session; i++) { session = await auth.session().catch(() => null); if (!session) await new Promise(r => setTimeout(r, 250)); }
  clear(root);
  if (!session) {
    root.append(card(h('h1', 'Link not recognised'), h('p.muted', 'Open the most recent invite or reset email and use its link, or request a new one.'), h('a.btn.btn--primary.btn--block', { href: '/admin/login' }, 'Go to sign in')));
    return;
  }
  const email = (session.user && session.user.email) || '';
  const p1 = h('input.input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, id: 'np1' });
  const p2 = h('input.input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true, id: 'np2' });
  const meter = h('div.meter', h('i'));
  const err = h('p.form-err', { role: 'alert', hidden: true });
  const btn = h('button.btn.btn--primary.btn--block.btn--lg', { type: 'submit' }, 'Save password and continue');
  p1.addEventListener('input', () => {
    const v = p1.value; let s = 0;
    if (v.length >= 8) s++; if (v.length >= 12) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
    meter.dataset.s = String(Math.min(4, s));
  });
  const form = h('form.authform', { novalidate: true },
    h('input', { type: 'email', value: email, autocomplete: 'username', hidden: true, readonly: true }),
    h('label.field', h('span.field__l', 'New password'), p1, meter, h('span.field__h', 'At least 8 characters. A passphrase is best.')),
    h('label.field', h('span.field__l', 'Confirm password'), p2), err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (p1.value.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
    if (p1.value !== p2.value) { err.textContent = 'The passwords do not match.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      await auth.setPassword(p1.value);
      // Same bookkeeping as the existing CMS: mark the invite as accepted.
      try { await db.update('admin_allowlist', email.toLowerCase(), { accepted_at: new Date().toISOString() }, 'email'); } catch (ex) { /* not every account came from an invite */ }
      toast.success('Password saved');
      history.replaceState(null, '', '/admin');
      dispatchEvent(new PopStateEvent('popstate'));
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  root.append(card(h('h1', 'Set your password'), h('p.muted', `Signed in as ${email}. Choose a password for the admin console.`), form));
  setTimeout(() => p1.focus(), 30);
}
