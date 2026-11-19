// Procyon admin: boot, auth gate, shell (sidebar + top bar), router, global search, shortcuts, publishing.
import { h, icon, clear, $, debounce, ago, store } from './core/dom.js';
import { initData, isDemo, auth, db, loadRole, site } from './core/data.js';
import { ctx, staff, myName } from './core/ctx.js';
import { toast, modal, confirmDialog, hasLayer, avatar, kbd } from './core/ui.js';
import { ROLES } from './core/constants.js';

const ALL = ['admin', 'sales', 'hr'];
const NAV = [
  { group: null, items: [{ path: '/admin', label: 'Dashboard', icon: 'dashboard', roles: ALL, key: 'd' }] },
  { group: 'CRM', items: [
    { path: '/admin/leads', label: 'Leads', icon: 'leads', roles: ['admin', 'sales'], key: 'l' },
    { path: '/admin/meeting-requests', label: 'Meeting requests', icon: 'calendar', roles: ['admin', 'sales'], key: 'm' },
    { path: '/admin/applications', label: 'Applications', icon: 'apps', roles: ['admin', 'hr'], key: 'a' }
  ] },
  { group: 'Content', items: [
    { path: '/admin/blog', label: 'Blog', icon: 'blog', roles: ['admin'], key: 'b' },
    { path: '/admin/case-studies', label: 'Case studies', icon: 'award', roles: ['admin'], key: 'c' },
    { path: '/admin/events', label: 'Events', icon: 'event', roles: ['admin'], key: 'e' },
    { path: '/admin/careers', label: 'Careers', icon: 'briefcase', roles: ['admin', 'hr'], key: 'j' },
    { path: '/admin/authors', label: 'Authors', icon: 'authors', roles: ['admin'], key: 'w' }
  ] },
  { group: 'Site', items: [
    { path: '/admin/promo-bar', label: 'Promo bar', icon: 'promo', roles: ['admin'], key: 'p' },
    { path: '/admin/users', label: 'Users & access', icon: 'users', roles: ['admin'], key: 'u' }
  ] }
];

// Route table: pattern -> lazy view module. Views export render(main, params) and may return a cleanup function.
const ROUTES = [
  ['/admin', 'dashboard', ALL],
  ['/admin/leads', 'leads', ['admin', 'sales']],
  ['/admin/leads/:id', 'leads', ['admin', 'sales']],
  ['/admin/meeting-requests', 'meetings', ['admin', 'sales']],
  ['/admin/applications', 'applications', ['admin', 'hr']],
  ['/admin/blog', 'content', ['admin'], { type: 'blog' }],
  ['/admin/blog/:id', 'blog-editor', ['admin']],
  ['/admin/case-studies', 'content', ['admin'], { type: 'case-studies' }],
  ['/admin/case-studies/:id', 'record-editor', ['admin'], { type: 'case-studies' }],
  ['/admin/events', 'content', ['admin'], { type: 'events' }],
  ['/admin/events/:id', 'record-editor', ['admin'], { type: 'events' }],
  ['/admin/careers', 'content', ['admin', 'hr'], { type: 'careers' }],
  ['/admin/careers/:id', 'record-editor', ['admin', 'hr'], { type: 'careers' }],
  ['/admin/authors', 'authors', ['admin']],
  ['/admin/promo-bar', 'promo', ['admin']],
  ['/admin/users', 'users', ['admin']]
];
const PUBLIC = ['/admin/login', '/admin/accept-invite', '/admin/reset-password'];

const app = document.getElementById('app');
let shell = null, main = null, cleanup = null, renderSeq = 0;

function match(path) {
  for (const [pattern, view, roles, extra] of ROUTES) {
    const pp = pattern.split('/'), xs = path.split('/');
    if (pp.length !== xs.length) continue;
    const params = Object.assign({}, extra);
    if (pp.every((p, i) => p.startsWith(':') ? (params[p.slice(1)] = decodeURIComponent(xs[i]), true) : p === xs[i])) return { view, roles, params };
  }
  return null;
}
const cleanPath = () => (location.pathname.replace(/\/+$/, '') || '/admin');

// ---------- Boot ----------
async function boot() {
  try { await initData(); }
  catch (e) { return fatal(e.message); }
  if (isDemo()) document.documentElement.classList.add('is-demo');
  auth.onChange((event, session) => {
    if (event === 'SIGNED_OUT') { ctx.user = null; ctx.role = null; shell = null; if (!PUBLIC.includes(cleanPath())) go('/admin/login', true); }
    if (event === 'PASSWORD_RECOVERY' && cleanPath() !== '/admin/accept-invite') go('/admin/accept-invite' + location.hash, true);
    if (event === 'TOKEN_REFRESHED' && session) ctx.user = session.user;
  });
  addEventListener('popstate', () => route());
  document.addEventListener('click', onLinkClick);
  document.addEventListener('keydown', onKey);
  addEventListener('beforeunload', (e) => { if (ctx.view.dirty && ctx.view.dirty()) { e.preventDefault(); e.returnValue = ''; } });
  route();
}

function fatal(msg) {
  clear(app).append(h('div.authpage', h('div.authcard', h('img.authcard__logo', { src: '/assets/img/procyon-logo.svg', alt: 'Procyon Technostructure', width: 160, height: 40 }),
    h('h1', 'The admin could not start'), h('p.muted', msg), h('button.btn.btn--primary', { type: 'button', onclick: () => location.reload() }, 'Reload'))));
}

export function go(path, replace) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  route();
}
ctx.go = (p) => go(p);

function onLinkClick(e) {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/admin')) return;
  e.preventDefault();
  if (url.pathname + url.search === location.pathname + location.search) return;
  if (ctx.view.dirty && ctx.view.dirty()) {
    confirmDialog({ title: 'Leave without saving?', message: 'There are unsaved changes on this page. A local draft is kept, but the database has not been updated.', confirm: 'Leave page', danger: true })
      .then(ok => { if (ok) { ctx.view.dirty = null; go(url.pathname + url.search); } });
    return;
  }
  go(url.pathname + url.search);
}

async function route() {
  const seq = ++renderSeq;
  const path = cleanPath();
  if (PUBLIC.includes(path)) {
    teardown(); shell = null;
    const mod = await import('./views/auth.js');
    if (seq !== renderSeq) return;
    clear(app);
    cleanup = await mod.render(app, { mode: path.split('/').pop() }, { onSignedIn: afterSignIn });
    return;
  }
  if (!ctx.user) {
    let session = null;
    try { session = await auth.session(); } catch (e) { /* treat as signed out */ }
    if (seq !== renderSeq) return;
    if (!session) { store.set('after-login', location.pathname + location.search); return go('/admin/login', true); }
    const ok = await afterSignIn(session, true);
    if (!ok || seq !== renderSeq) return;
  }
  const m = match(path);
  ensureShell();
  markNav(path);
  teardown();
  clear(main);
  if (!m) { main.append(notFound()); document.title = 'Not found | Procyon Admin'; return; }
  if (!ctx.can(m.roles)) { main.append(noAccessHere()); return; }
  main.append(h('div.loading-line'));
  try {
    const mod = await import(`./views/${m.view}.js`);
    if (seq !== renderSeq) return;
    clear(main);
    main.scrollTop = 0;
    cleanup = (await mod.render(main, m.params)) || null;
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return;
    clear(main).append(h('div.empty.empty--error', h('h3', 'This page failed to load'), h('p', e.message)));
  }
}
function teardown() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { /* ignore */ } }
  cleanup = null;
  ctx.view = { onNew: null, keys: null, dirty: null };
}

async function afterSignIn(session, silent) {
  ctx.user = session.user;
  let role = null;
  try { role = await loadRole(session.user.id); } catch (e) { toast.error('Could not read your access level', { detail: e.message }); }
  ctx.role = role;
  if (!role) { teardown(); shell = null; clear(app).append(noAccess()); return false; }
  staff();
  if (!silent) {
    const next = store.get('after-login');
    store.del('after-login');
    go(next && next.startsWith('/admin') && !PUBLIC.some(p => next.startsWith(p)) ? next : '/admin', true);
  }
  return true;
}

function noAccess() {
  return h('div.authpage', h('div.authcard',
    h('img.authcard__logo', { src: '/assets/img/procyon-logo.svg', alt: 'Procyon Technostructure', width: 160, height: 40 }),
    h('h1', 'No admin access yet'),
    h('p.muted', `You are signed in as ${ctx.user && ctx.user.email}, but this account has no admin, sales or HR role. Ask an administrator to invite you from Users & access.`),
    h('button.btn.btn--primary', { type: 'button', onclick: () => auth.signOut().then(() => { ctx.user = null; go('/admin/login', true); }) }, icon('logout', 15), 'Sign out')));
}
const notFound = () => h('div.empty', h('div.empty__ic', icon('search', 26)), h('h3', 'Page not found'), h('p', 'That admin page does not exist.'), h('a.btn', { href: '/admin' }, 'Back to dashboard'));
const noAccessHere = () => h('div.empty', h('div.empty__ic', icon('lock', 26)), h('h3', 'Not available for your role'), h('p', `${ROLES[ctx.role].label} accounts cannot open this page.`), h('a.btn', { href: '/admin' }, 'Back to dashboard'));

// ---------- Shell ----------
function ensureShell() {
  if (shell && document.contains(shell)) return;
  clear(app);
  const nav = h('nav.side__nav', { 'aria-label': 'Admin sections' }, NAV.map(g => {
    const items = g.items.filter(i => ctx.can(i.roles));
    if (!items.length) return null;
    return h('div.side__group', g.group ? h('div.side__label', g.group) : null, items.map(i => h('a.side__link', { href: i.path, 'data-path': i.path, title: i.label },
      icon(i.icon, 18), h('span.side__text', i.label), h('kbd.side__kbd', 'G ' + i.key.toUpperCase()))));
  }));
  const userCard = h('div.side__user',
    avatar(myName(), 32),
    h('div.side__who', h('b', myName()), h('span', ROLES[ctx.role].label)),
    h('button.iconbtn', { type: 'button', title: 'Sign out', 'aria-label': 'Sign out', onclick: signOut }, icon('logout', 17)));
  const side = h('aside.side', { id: 'side' },
    h('a.side__brand', { href: '/admin', 'aria-label': 'Procyon admin home' }, h('img.side__logo', { src: '/assets/img/procyon-logo.svg', alt: 'Procyon Technostructure', width: 132, height: 33 }), h('img.side__mark', { src: '/favicon.svg', alt: '', width: 28, height: 28 }), h('span.side__tag', isDemo() ? 'Demo' : 'Admin')),
    nav,
    h('a.side__site', { href: '/', target: '_blank', rel: 'noopener' }, icon('globe', 16), h('span.side__text', 'View website'), icon('external', 13)),
    userCard);
  const search = buildSearch();
  const top = h('header.top',
    h('button.iconbtn.top__menu', { type: 'button', 'aria-label': 'Open menu', onclick: () => document.body.classList.toggle('nav-open') }, icon('menu', 20)),
    search,
    h('div.top__acts',
      isDemo() ? h('span.demo-pill', { title: 'Sample data in this browser only. Nothing is saved to the CMS.' }, 'Demo data') : null,
      h('button.iconbtn', { type: 'button', title: 'Keyboard shortcuts (?)', 'aria-label': 'Keyboard shortcuts', onclick: showShortcuts }, icon('keyboard', 18)),
      ctx.isAdmin ? publishButton() : null));
  main = h('main.main', { id: 'main', tabindex: '-1' });
  shell = h('div.shell', side, h('div.shell__body', top, main), h('div.scrim', { onclick: () => document.body.classList.remove('nav-open') }));
  app.append(shell);
}
function markNav(path) {
  document.body.classList.remove('nav-open');
  document.querySelectorAll('.side__link').forEach(a => {
    const p = a.dataset.path;
    const on = p === '/admin' ? path === '/admin' : path === p || path.startsWith(p + '/');
    a.classList.toggle('is-on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
async function signOut() {
  if (ctx.view.dirty && ctx.view.dirty() && !(await confirmDialog({ title: 'Sign out with unsaved changes?', message: 'Unsaved edits stay as a local draft in this browser.', confirm: 'Sign out', danger: true }))) return;
  ctx.view.dirty = null;
  await auth.signOut();
  ctx.user = null; ctx.role = null; shell = null;
  go('/admin/login', true);
}

// ---------- Publish to site ----------
let pubBtn = null, pubTimer = null;
function publishButton() {
  pubBtn = h('button.btn.btn--primary.pub', { type: 'button', onclick: publish, title: 'Sync the CMS and rebuild procyonts.com' }, h('span.pub__dot'), icon('rocket', 15), h('span.pub__t', 'Publish to site'));
  refreshPublish(false);
  return pubBtn;
}
async function refreshPublish(announce) {
  let s;
  try { s = await site.status(); } catch (e) { return; }
  if (!pubBtn) return;
  pubBtn.classList.toggle('is-running', !!s.running);
  pubBtn.dataset.state = s.running ? 'running' : (s.result || 'idle');
  pubBtn.title = s.running ? `Publishing: step ${Math.min((s.steps || []).length + 1, s.totalSteps || 3)} of ${s.totalSteps || 3}`
    : s.finishedAt ? `Last published ${ago(s.finishedAt)} (${s.result}). ${s.autoSync ? `Auto-sync runs every ${s.intervalMinutes} minutes.` : ''}` : 'Sync the CMS and rebuild procyonts.com';
  const label = pubBtn.querySelector('.pub__t');
  label.textContent = s.running ? `Publishing ${Math.min((s.steps || []).length + 1, s.totalSteps || 3)}/${s.totalSteps || 3}` : 'Publish to site';
  if (s.running || s.queued) { clearTimeout(pubTimer); pubTimer = setTimeout(() => refreshPublish(true), 2000); }
  else if (announce) {
    if (s.result === 'ok') toast.success('Published to the website', { detail: s.message });
    else if (s.result === 'partial') toast('Published with a warning', { detail: s.message, tone: 'info', duration: 9000 });
    else if (s.result === 'failed') toast.error('Publishing failed', { detail: s.message + ' Check the server logs for details.' });
  }
}
async function publish() {
  if (!(await confirmDialog({ title: 'Publish to the website?', message: 'This pulls the latest published blog posts, case studies, events and jobs from the CMS and rebuilds procyonts.com. It takes about a minute. Drafts stay private.', confirm: 'Publish now' }))) return;
  try {
    const r = await site.rebuild();
    toast(r.started ? 'Publishing started' : 'Queued after the current publish', { detail: 'The site keeps serving while it rebuilds.' });
    refreshPublish(true);
  } catch (e) { toast.error('Could not publish', { detail: e.message }); }
}
ctx.publishHint = () => { if (ctx.isAdmin) toast('Saved to the CMS', { detail: 'Publish to site to update procyonts.com now, or wait for the next auto-sync.', action: { label: 'Publish', run: publish }, duration: 8000 }); };

// ---------- Global search ----------
let index = null, indexAt = 0;
async function loadIndex() {
  if (index && Date.now() - indexAt < 60e3) return index;
  const src = [];
  const add = (roles, p) => { if (ctx.can(roles)) src.push(p); };
  add(['admin', 'sales'], db.list('leads', { select: 'id, first_name, last_name, email, company, status', order: [['created_at', false]], limit: 3000 }).then(r => r.map(x => ({ type: 'Lead', icon: 'leads', title: `${x.first_name || ''} ${x.last_name || ''}`.trim() || x.email, sub: [x.company, x.email].filter(Boolean).join(' · '), href: '/admin/leads/' + x.id, hay: [x.first_name, x.last_name, x.email, x.company].join(' ') }))));
  add(['admin', 'sales'], db.list('event_meeting_requests', { select: 'id, full_name, email, company, event_title', limit: 2000 }).then(r => r.map(x => ({ type: 'Meeting', icon: 'calendar', title: x.full_name, sub: [x.company, x.event_title].filter(Boolean).join(' · '), href: '/admin/meeting-requests?open=' + x.id, hay: [x.full_name, x.email, x.company, x.event_title].join(' ') }))));
  add(['admin', 'hr'], db.list('job_applications', { select: 'id, full_name, email, current_company', limit: 3000 }).then(r => r.map(x => ({ type: 'Applicant', icon: 'apps', title: x.full_name, sub: [x.current_company, x.email].filter(Boolean).join(' · '), href: '/admin/applications?open=' + x.id, hay: [x.full_name, x.email, x.current_company].join(' ') }))));
  add(['admin'], db.list('blog_posts', { select: 'id, title, slug, status' }).then(r => r.map(x => ({ type: 'Blog', icon: 'blog', title: x.title, sub: '/blog/' + x.slug + (x.status !== 'published' ? ' · draft' : ''), href: '/admin/blog/' + x.id, hay: x.title + ' ' + x.slug }))));
  add(['admin'], db.list('case_studies', { select: 'id, title, client' }).then(r => r.map(x => ({ type: 'Case study', icon: 'award', title: x.title, sub: x.client || '', href: '/admin/case-studies/' + x.id, hay: x.title + ' ' + x.client }))));
  add(['admin'], db.list('events', { select: 'id, title, date_text' }).then(r => r.map(x => ({ type: 'Event', icon: 'event', title: x.title, sub: x.date_text || '', href: '/admin/events/' + x.id, hay: x.title }))));
  add(['admin', 'hr'], db.list('jobs', { select: 'id, title, department' }).then(r => r.map(x => ({ type: 'Job', icon: 'briefcase', title: x.title, sub: x.department || '', href: '/admin/careers/' + x.id, hay: x.title + ' ' + x.department }))));
  const parts = await Promise.allSettled(src);
  index = parts.flatMap(p => p.status === 'fulfilled' ? p.value : []);
  indexAt = Date.now();
  return index;
}
function commands() {
  const out = [];
  NAV.forEach(g => g.items.filter(i => ctx.can(i.roles)).forEach(i => out.push({ type: 'Go to', icon: i.icon, title: i.label, sub: 'G then ' + i.key.toUpperCase(), href: i.path, hay: i.label })));
  if (ctx.isAdmin) out.push({ type: 'Create', icon: 'plus', title: 'New blog post', href: '/admin/blog/new', hay: 'new blog post write article' }, { type: 'Create', icon: 'plus', title: 'New case study', href: '/admin/case-studies/new', hay: 'new case study' }, { type: 'Create', icon: 'plus', title: 'New event', href: '/admin/events/new', hay: 'new event' });
  if (ctx.can(['admin', 'hr'])) out.push({ type: 'Create', icon: 'plus', title: 'New job post', href: '/admin/careers/new', hay: 'new job role career' });
  return out;
}
function buildSearch() {
  const input = h('input.search__in', { type: 'search', placeholder: 'Search leads, people, posts, jobs…', 'aria-label': 'Search the admin', autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': 'search-results' });
  const list = h('div.search__res', { id: 'search-results', role: 'listbox', hidden: true });
  const wrap = h('div.search', icon('search', 16, 'search__ic'), input, h('span.search__kbd', kbd('/')), list);
  let results = [], active = 0;
  const render = () => {
    clear(list);
    if (!results.length) { list.append(h('div.search__empty', input.value.trim() ? 'No matches' : 'Type to search')); return; }
    let lastType = null;
    results.forEach((r, i) => {
      if (r.type !== lastType) { list.append(h('div.search__grp', r.type)); lastType = r.type; }
      list.append(h('a.search__item' + (i === active ? '.is-on' : ''), { href: r.href, role: 'option', 'aria-selected': String(i === active), onmousedown: (e) => e.preventDefault(), onclick: () => close() },
        icon(r.icon, 15), h('span.search__t', h('b', r.title), r.sub ? h('small', r.sub) : null)));
    });
  };
  const run = debounce(async () => {
    const q = input.value.trim().toLowerCase();
    const cmds = commands();
    if (!q) { results = cmds.slice(0, 8); active = 0; render(); return; }
    const words = q.split(/\s+/);
    const hit = (x) => words.every(w => String(x.hay || '').toLowerCase().includes(w));
    const idx = await loadIndex();
    results = cmds.filter(hit).slice(0, 4).concat(idx.filter(hit).slice(0, 24));
    active = 0; render();
  }, 120);
  const open = () => { list.hidden = false; input.setAttribute('aria-expanded', 'true'); run(); };
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) { close(); input.value = ''; input.blur(); go(r.href); } }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; close(); input.blur(); }
  });
  return wrap;
}

// ---------- Keyboard shortcuts ----------
let gPending = 0;
function typing(el) { return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)); }
function onKey(e) {
  if (!ctx.user || !shell) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); const s = $('.search__in'); if (s) s.focus(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && ctx.view.keys && ctx.view.keys.save) { e.preventDefault(); ctx.view.keys.save(); return; }
  if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || hasLayer()) return;
  if (e.key === '/') { e.preventDefault(); const s = $('.search__in'); if (s) s.focus(); return; }
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
  if (e.key === 'g') { gPending = Date.now(); return; }
  if (gPending && Date.now() - gPending < 1200) {
    gPending = 0;
    const item = NAV.flatMap(g => g.items).find(i => i.key === e.key.toLowerCase() && ctx.can(i.roles));
    if (item) { e.preventDefault(); const a = $(`.side__link[data-path="${item.path}"]`); if (a) a.click(); }
    return;
  }
  if (e.key === 'Enter' && e.target.closest && e.target.closest('button, a, [role="button"], .kcard, summary')) return; // let focused controls handle Enter
  if (e.key === 'n' && ctx.view.onNew) { e.preventDefault(); ctx.view.onNew(); return; }
  if (ctx.view.keys && ctx.view.keys[e.key]) { e.preventDefault(); ctx.view.keys[e.key](e); }
}
function showShortcuts() {
  const row = (k, label) => h('div.sc__row', h('span', label), kbd(...k));
  const goRows = NAV.flatMap(g => g.items).filter(i => ctx.can(i.roles)).map(i => row(['G', i.key.toUpperCase()], i.label));
  modal({
    title: 'Keyboard shortcuts', body: h('div.sc',
      h('div.sc__col', h('h3', 'Anywhere'), row(['/'], 'Search'), row(['Ctrl', 'K'], 'Search'), row(['?'], 'This help'), row(['N'], 'New item on list pages'), row(['Esc'], 'Close panel or dialog'), row(['Ctrl', 'S'], 'Save in editors')),
      h('div.sc__col', h('h3', 'Go to'), goRows),
      h('div.sc__col', h('h3', 'Lists'), row(['J'], 'Next row'), row(['K'], 'Previous row'), row(['Enter'], 'Open row'), row(['X'], 'Select row'), row(['V'], 'Switch table / board')))
  });
}

boot();
