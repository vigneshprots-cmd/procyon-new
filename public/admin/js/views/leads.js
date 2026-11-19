// Leads CRM: filterable table and Kanban pipeline, saved views, bulk actions, CSV export,
// and a detail drawer with owner, status, follow-up and the lead_activities timeline.
import { h, icon, clear, ago, fmtDate, fmtDateTime, toLocalInput, fromLocalInput, debounce, store, downloadCsv, plural, fmtNum } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx, staff, staffName } from '../core/ctx.js';
import { toast, drawer, menu, confirmDialog, promptDialog, badge, avatar, skeletonRows, empty, errorState, segmented, pageHead, selectEl } from '../core/ui.js';
import { LEAD_STATUSES, OPEN_LEAD, statusOf, ACTIVITY_TYPES, LEAD_CATEGORIES } from '../core/constants.js';
import { prettySource } from './dashboard.js';

const PAGE = 150;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'li_fat_id'];
const BLANK = { q: '', status: '', owner: '', interest: '', category: '', source: '', from: '', to: '', quick: '' };

export async function render(main, params) {
  document.title = 'Leads | Procyon Admin';
  const qs = new URLSearchParams(location.search);
  const S = {
    leads: [], people: [], reps: {}, sel: new Set(), shown: PAGE, cursor: -1,
    view: qs.get('view') === 'board' ? 'board' : (store.get('leads:view') || 'table'),
    sort: store.get('leads:sort') || { col: 'created_at', asc: false },
    f: Object.assign({}, BLANK)
  };
  if (qs.get('status')) S.f.status = qs.get('status');
  if (qs.get('owner')) S.f.owner = qs.get('owner');
  if (qs.get('view') === 'overdue') S.f.quick = 'overdue';
  if (qs.get('created')) S.f.from = new Date(Date.now() - Number(qs.get('created')) * 864e5).toISOString().slice(0, 10);
  if (qs.get('q')) S.f.q = qs.get('q');

  const me = ctx.user.id;
  const canEdit = (l) => ctx.isAdmin || l.owner_id === me;
  const name = (l) => `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.email || 'Unnamed lead';

  // ---------- Layout ----------
  const countEl = h('span.muted');
  const viewSeg = segmented([{ id: 'table', icon: 'list', title: 'Table (V)' }, { id: 'board', icon: 'kanban', title: 'Board (V)' }], S.view, (v) => { S.view = v; store.set('leads:view', v); paint(); }, 'Layout');
  const head = pageHead('Leads', ctx.isAdmin ? 'Every website enquiry, routed to the rep who owns its service category.' : 'Leads you own can be updated. Others are read-only.', [
    h('button.btn', { type: 'button', onclick: exportCsv, title: 'Export the filtered leads as CSV' }, icon('download', 15), h('span.hide-sm', 'Export CSV')),
    viewSeg
  ]);
  const quick = h('div.chips', { role: 'toolbar', 'aria-label': 'Quick filters' });
  const search = h('input.input.input--search', { type: 'search', placeholder: 'Search name, email, company, message', value: S.f.q, 'aria-label': 'Search leads' });
  search.addEventListener('input', debounce(() => { S.f.q = search.value; S.shown = PAGE; paint(); }, 150));
  const filters = h('div.filters');
  const bulk = h('div.bulk', { hidden: true });
  const content = h('div.leads__content');
  main.append(head, quick, h('div.toolbar', h('div.toolbar__search', icon('search', 15), search), filters, countEl), bulk, content);
  content.append(skeletonRows(8, 6));

  async function load() {
    try {
      const [leads, people, cats] = await Promise.all([
        db.list('leads', { order: [['created_at', false]] }),
        staff(),
        db.list('sales_categories', { select: 'category, user_id' }).catch(() => [])
      ]);
      S.leads = leads; S.people = people;
      S.reps = {};
      cats.forEach(c => { (S.reps[c.category] = S.reps[c.category] || []).push(c.user_id); });
      paint();
      if (params.id) { const l = S.leads.find(x => x.id === params.id); if (l) openLead(l); else toast.error('That lead was not found or is not visible to you.'); }
    } catch (e) { clear(content).append(errorState(e, load)); }
  }

  // ---------- Filtering ----------
  function filtered() {
    const f = S.f, now = Date.now();
    const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const from = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
    const to = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
    let out = S.leads.filter(l => {
      if (f.quick === 'mine' && l.owner_id !== me) return false;
      if (f.quick === 'overdue' && !(OPEN_LEAD(l.status) && l.follow_up_at && new Date(l.follow_up_at).getTime() < now)) return false;
      if (f.status === 'open' ? !OPEN_LEAD(l.status) : f.status && l.status !== f.status) return false;
      if (f.owner === 'me' ? l.owner_id !== me : f.owner === 'none' ? !!l.owner_id : f.owner && l.owner_id !== f.owner) return false;
      if (f.interest && (l.requirement || '') !== f.interest) return false;
      if (f.category && (l.category || '') !== f.category) return false;
      if (f.source && (l.source || '') !== f.source) return false;
      const c = new Date(l.created_at).getTime();
      if (from && c < from) return false;
      if (to && c > to) return false;
      if (words.length) {
        const hay = [l.first_name, l.last_name, l.email, l.company, l.phone, l.requirement, l.message, l.category].join(' ').toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
    const { col, asc } = S.sort;
    const val = (l) => col === 'name' ? name(l).toLowerCase() : col === 'owner' ? staffName(l.owner_id, S.people).toLowerCase() : col === 'status' ? LEAD_STATUSES.findIndex(s => s.id === l.status) : (l[col] || '');
    out = out.slice().sort((a, b) => { const x = val(a), y = val(b); return (x === '' ? 1 : 0) - (y === '' ? 1 : 0) || (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1); });
    return out;
  }
  const uniq = (k) => [...new Set(S.leads.map(l => l[k]).filter(Boolean))].sort();

  function paintQuick() {
    const now = Date.now();
    const c = {
      all: S.leads.length, mine: S.leads.filter(l => l.owner_id === me).length,
      overdue: S.leads.filter(l => OPEN_LEAD(l.status) && l.follow_up_at && new Date(l.follow_up_at).getTime() < now).length,
      open: S.leads.filter(l => OPEN_LEAD(l.status)).length,
      none: S.leads.filter(l => !l.owner_id && OPEN_LEAD(l.status)).length
    };
    const chip = (label, n, on, set, tone) => h('button.chip' + (on ? '.is-on' : '') + (tone ? '.chip--' + tone : ''), { type: 'button', 'aria-pressed': String(on), onclick: () => { Object.assign(S.f, BLANK, { q: S.f.q }, set); S.shown = PAGE; syncUrl(); paint(); } }, label, h('small', fmtNum(n)));
    const f = S.f;
    const plain = !f.status && !f.owner && !f.quick && !f.interest && !f.category && !f.source && !f.from && !f.to;
    clear(quick).append(
      chip('All', c.all, plain, {}),
      chip('Open', c.open, f.status === 'open' && !f.quick && !f.owner, { status: 'open' }),
      chip(ctx.isAdmin ? 'Assigned to me' : 'My leads', c.mine, f.quick === 'mine', { quick: 'mine' }),
      chip('Unassigned', c.none, f.owner === 'none' && f.status === 'open', { owner: 'none', status: 'open' }, c.none ? 'warn' : ''),
      chip('Overdue', c.overdue, f.quick === 'overdue', { quick: 'overdue' }, c.overdue ? 'bad' : ''),
      h('span.chips__sep'),
      LEAD_STATUSES.map(s => chip(s.label, S.leads.filter(l => l.status === s.id).length, f.status === s.id && !f.quick && !f.owner, { status: s.id })),
      h('span.chips__sep'),
      savedViews());
  }

  function paintFilters() {
    const f = S.f;
    const sel = (label, key, opts) => {
      const s = selectEl([{ id: '', label }].concat(opts), f[key], (v) => { f[key] = v; S.shown = PAGE; syncUrl(); paint(); }, { 'aria-label': label, class: f[key] ? 'is-set' : '' });
      return s;
    };
    const ownerOpts = [{ id: 'me', label: 'Me' }, { id: 'none', label: 'Unassigned' }].concat(S.people.map(p => ({ id: p.id, label: p.display_name || p.email })));
    const date = (key, label) => { const i = h('input.input.input--sm', { type: 'date', value: f[key], 'aria-label': label, title: label, class: f[key] ? 'is-set' : '' }); i.addEventListener('change', () => { f[key] = i.value; S.shown = PAGE; syncUrl(); paint(); }); return i; };
    const any = Object.keys(BLANK).some(k => k !== 'q' && f[k]);
    clear(filters).append(
      sel('Any status', 'status', [{ id: 'open', label: 'Open (not won, lost or ignored)' }].concat(LEAD_STATUSES.map(s => ({ id: s.id, label: s.label })))),
      sel('Any owner', 'owner', ownerOpts),
      sel('Any interest', 'interest', uniq('requirement').map(x => ({ id: x, label: x }))),
      sel('Any category', 'category', [...new Set(uniq('category').concat(LEAD_CATEGORIES))].map(x => ({ id: x, label: x }))),
      sel('Any source', 'source', uniq('source').map(x => ({ id: x, label: prettySource(x) }))),
      h('span.daterange', date('from', 'Received from'), h('span.muted', 'to'), date('to', 'Received to')),
      any ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { Object.assign(S.f, BLANK, { q: S.f.q }); syncUrl(); paint(); } }, icon('x', 14), 'Clear') : null);
  }

  function savedViews() {
    const views = store.get('leads:saved', []);
    const btn = h('button.chip.chip--menu', { type: 'button', 'aria-haspopup': 'menu' }, icon('bookmark', 14), 'Views', icon('chevronDown', 13));
    btn.addEventListener('click', () => menu(btn, [
      ...views.map((v, i) => ({ label: v.name, icon: 'bookmark', run: () => { S.f = Object.assign({}, BLANK, v.f); S.view = v.view || S.view; search.value = S.f.q; syncUrl(); paint(); } })),
      views.length ? '-' : null,
      { label: 'Save current filters as a view…', icon: 'plus', run: async () => {
        const n = await promptDialog({ title: 'Save view', label: 'View name', placeholder: 'e.g. My open Salesforce leads' });
        if (!n) return;
        store.set('leads:saved', views.filter(v => v.name !== n).concat([{ name: n, f: S.f, view: S.view }]));
        toast.success(`Saved view "${n}"`, { detail: 'Views are stored in this browser.' });
        paint();
      } },
      ...views.map(v => ({ label: `Delete "${v.name}"`, icon: 'trash', danger: true, run: () => { store.set('leads:saved', views.filter(x => x !== v)); paint(); } }))
    ]));
    return btn;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if (S.f.status) p.set('status', S.f.status);
    if (S.f.owner) p.set('owner', S.f.owner);
    if (S.f.quick === 'overdue') p.set('view', 'overdue');
    const path = location.pathname.startsWith('/admin/leads/') ? location.pathname : '/admin/leads';
    history.replaceState(null, '', path + (p.toString() ? '?' + p : ''));
  }

  // ---------- Painting ----------
  function paint() {
    paintQuick(); paintFilters(); paintBulk();
    const rows = filtered();
    countEl.textContent = rows.length === S.leads.length ? plural(rows.length, 'lead') : `${fmtNum(rows.length)} of ${plural(S.leads.length, 'lead')}`;
    viewSeg.querySelectorAll('.seg__b').forEach((b, i) => { const on = (i === 0 ? 'table' : 'board') === S.view; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
    clear(content);
    if (!S.leads.length) { content.append(empty({ icon: 'leads', title: 'No leads yet', text: 'Website enquiries appear here as soon as someone submits a form.' })); return; }
    if (!rows.length) { content.append(empty({ icon: 'filter', title: 'No leads match these filters', text: 'Clear a filter or search for something else.', action: { label: 'Clear filters', run: () => { S.f = Object.assign({}, BLANK); search.value = ''; syncUrl(); paint(); } } })); return; }
    content.append(S.view === 'board' ? board(rows) : table(rows));
  }

  function table(rows) {
    const th = (label, col, cls) => {
      const on = S.sort.col === col;
      return h('th' + (cls ? '.' + cls : ''), { 'aria-sort': on ? (S.sort.asc ? 'ascending' : 'descending') : 'none' },
        col ? h('button.th', { type: 'button', onclick: () => { S.sort = { col, asc: on ? !S.sort.asc : col === 'name' || col === 'owner' }; store.set('leads:sort', S.sort); paint(); } }, label, on ? icon(S.sort.asc ? 'up' : 'down', 12) : null) : label);
    };
    const visible = rows.slice(0, S.shown);
    const all = h('input', { type: 'checkbox', 'aria-label': 'Select all shown leads', checked: visible.length && visible.every(l => S.sel.has(l.id)), indeterminate: visible.some(l => S.sel.has(l.id)) && !visible.every(l => S.sel.has(l.id)) });
    all.addEventListener('change', () => { visible.forEach(l => all.checked ? S.sel.add(l.id) : S.sel.delete(l.id)); paint(); });
    const now = Date.now();
    const tbody = h('tbody', visible.map((l, i) => {
      const st = statusOf(LEAD_STATUSES, l.status);
      const late = OPEN_LEAD(l.status) && l.follow_up_at && new Date(l.follow_up_at).getTime() < now;
      const cb = h('input', { type: 'checkbox', checked: S.sel.has(l.id), 'aria-label': 'Select ' + name(l), onclick: (e) => e.stopPropagation() });
      cb.addEventListener('change', () => { cb.checked ? S.sel.add(l.id) : S.sel.delete(l.id); paintBulk(); tr.classList.toggle('is-sel', cb.checked); });
      const statusCell = h('button.pillbtn', { type: 'button', disabled: !canEdit(l), title: canEdit(l) ? 'Change status' : 'Only the owner or an admin can change this', onclick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, l); } }, badge(st.label, st.tone), canEdit(l) ? icon('chevronDown', 12) : null);
      const ownerCell = l.owner_id ? h('span.who', avatar(staffName(l.owner_id, S.people), 22), h('span', l.owner_id === me ? 'You' : staffName(l.owner_id, S.people))) : h('span.muted.italic', 'Unassigned');
      const tr = h('tr' + (S.sel.has(l.id) ? '.is-sel' : '') + (i === S.cursor ? '.is-cursor' : ''), { tabindex: '-1', onclick: () => { S.cursor = i; openLead(l); } },
        h('td.cb', cb),
        h('td', h('div.cell2', h('b', name(l)), h('small', l.company || l.email))),
        h('td.hide-md', h('div.cell2', h('span', l.requirement || '—'), h('small', l.category || 'Uncategorised'))),
        h('td', ctx.isAdmin ? h('button.pillbtn', { type: 'button', onclick: (e) => { e.stopPropagation(); ownerMenu(e.currentTarget, l); }, title: 'Assign owner' }, ownerCell, icon('chevronDown', 12)) : ownerCell),
        h('td', statusCell),
        h('td.hide-sm', l.follow_up_at ? h('span' + (late ? '.late' : ''), { title: fmtDateTime(l.follow_up_at) }, late ? 'Overdue ' + ago(l.follow_up_at).replace(' ago', '') : fmtDate(l.follow_up_at)) : h('span.muted', '—')),
        h('td.hide-md', h('span.muted', prettySource(l.source))),
        h('td.hide-sm', h('span', { title: fmtDateTime(l.created_at) }, ago(l.created_at))));
      return tr;
    }));
    const wrap = h('div.tablewrap', h('table.tbl', { 'aria-label': 'Leads' },
      h('thead', h('tr', h('th.cb', all), th('Lead', 'name'), th('Interest', 'requirement', 'hide-md'), th('Owner', 'owner'), th('Status', 'status'), th('Follow-up', 'follow_up_at', 'hide-sm'), th('Source', 'source', 'hide-md'), th('Received', 'created_at', 'hide-sm'))),
      tbody));
    const more = rows.length > S.shown ? h('div.more', h('button.btn', { type: 'button', onclick: () => { S.shown += PAGE; paint(); } }, `Show ${Math.min(PAGE, rows.length - S.shown)} more`), h('span.muted', `${fmtNum(S.shown)} of ${fmtNum(rows.length)} shown`)) : null;
    return h('div', wrap, more);
  }

  function board(rows) {
    const cols = LEAD_STATUSES.map(s => {
      const list = rows.filter(l => l.status === s.id);
      const body = h('div.col__body', { dataset: { status: s.id } }, list.slice(0, 80).map(card), list.length > 80 ? h('p.muted.pad', `${list.length - 80} more. Narrow the filters to see them.`) : null, !list.length ? h('div.col__empty', 'Drop a lead here') : null);
      body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('is-over'); });
      body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) body.classList.remove('is-over'); });
      body.addEventListener('drop', async (e) => {
        e.preventDefault(); body.classList.remove('is-over');
        const id = e.dataTransfer.getData('text/lead');
        const l = S.leads.find(x => x.id === id);
        if (!l || l.status === s.id) return;
        if (!canEdit(l)) { toast.error('Only the owner or an admin can move this lead.'); return; }
        await setLead(l, { status: s.id });
      });
      return h('section.col', { 'aria-label': s.label },
        h('header.col__head', h('span.dot.dot--' + s.tone), h('b', s.label), h('small', fmtNum(list.length))), body);
    });
    return h('div.board', cols);
  }
  function card(l) {
    const now = Date.now();
    const late = OPEN_LEAD(l.status) && l.follow_up_at && new Date(l.follow_up_at).getTime() < now;
    const el = h('article.kcard' + (canEdit(l) ? '' : '.is-locked'), { draggable: canEdit(l) ? 'true' : 'false', tabindex: '0', 'aria-label': name(l), onclick: () => openLead(l), onkeydown: (e) => { if (e.key === 'Enter') openLead(l); } },
      h('div.kcard__top', h('b', name(l)), l.owner_id ? avatar(staffName(l.owner_id, S.people), 22) : h('span.kcard__un', { title: 'Unassigned' }, '?')),
      h('div.kcard__co', l.company || l.email),
      h('div.kcard__meta', l.requirement ? h('span.tag', l.requirement) : null, l.follow_up_at ? h('span.kcard__due' + (late ? '.late' : ''), icon('clock', 12), late ? 'Overdue' : fmtDate(l.follow_up_at)) : null, h('span.muted', ago(l.created_at))));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/lead', l.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('is-drag'); });
    el.addEventListener('dragend', () => el.classList.remove('is-drag'));
    return el;
  }

  // ---------- Mutations ----------
  async function setLead(l, patch, { quiet } = {}) {
    const before = Object.assign({}, l);
    Object.assign(l, patch);
    paint();
    try {
      const saved = await db.update('leads', l.id, patch);
      Object.assign(l, saved);
      if ('status' in patch && patch.status !== before.status) await logActivity(l, { type: 'status_change', subject: `Status → ${patch.status}` });
      if ('owner_id' in patch && patch.owner_id !== before.owner_id) await logActivity(l, { type: 'assignment', subject: `Reassigned to ${staffName(patch.owner_id, S.people) || 'no one'}` });
      if (!quiet) toast.success('Lead updated', { detail: `${name(l)}${'status' in patch ? ' is now ' + statusOf(LEAD_STATUSES, patch.status).label : ''}${'owner_id' in patch ? ' → ' + (staffName(patch.owner_id, S.people) || 'unassigned') : ''}` });
      paint();
      return true;
    } catch (e) {
      Object.assign(l, before);
      paint();
      if (!quiet) toast.error('Not saved', { detail: e.message });
      return false;
    }
  }
  async function logActivity(l, a) {
    try {
      const row = await db.insert('lead_activities', Object.assign({ lead_id: l.id, user_id: me }, a));
      l.last_activity_at = row.occurred_at || new Date().toISOString();
      if (activeDrawer && activeDrawer.lead.id === l.id) activeDrawer.refreshTimeline();
    } catch (e) { /* timeline entry is best-effort, like the existing CMS */ }
  }
  function statusMenu(anchor, l) {
    menu(anchor, LEAD_STATUSES.map(s => ({ label: s.label, active: s.id === l.status, icon: s.id === l.status ? 'check' : null, run: () => setLead(l, { status: s.id }) })));
  }
  function ownerOptions(l) {
    const reps = (S.reps[l.category] || []);
    const handles = S.people.filter(p => reps.includes(p.id));
    const others = S.people.filter(p => !reps.includes(p.id));
    return { handles, others };
  }
  function ownerMenu(anchor, l) {
    const { handles, others } = ownerOptions(l);
    const item = (p) => ({ label: (p.display_name || p.email) + (p.id === me ? ' (you)' : ''), active: p.id === l.owner_id, icon: p.id === l.owner_id ? 'check' : null, run: () => setLead(l, { owner_id: p.id }) });
    menu(anchor, [{ label: 'Unassigned', icon: !l.owner_id ? 'check' : null, run: () => setLead(l, { owner_id: null }) }, '-',
      ...handles.map(item), handles.length && others.length ? '-' : null, ...others.map(item)]);
  }

  // ---------- Bulk ----------
  function paintBulk() {
    const n = S.sel.size;
    bulk.hidden = !n;
    if (!n) return;
    const picked = () => S.leads.filter(l => S.sel.has(l.id));
    const run = async (patch, label) => {
      const list = picked();
      const allowed = list.filter(canEdit);
      const t = toast(`Updating ${plural(allowed.length, 'lead')}…`, { duration: 60000 });
      let ok = 0;
      for (const l of allowed) if (await setLead(l, patch, { quiet: true })) ok++;
      t.close();
      const skipped = list.length - allowed.length, failed = allowed.length - ok;
      (failed || skipped ? toast : toast.success)(`${label}: ${plural(ok, 'lead')} updated`, { detail: [skipped ? `${skipped} skipped (not yours)` : '', failed ? `${failed} refused by the database` : ''].filter(Boolean).join(', ') || undefined });
      S.sel.clear(); paint();
    };
    const statusBtn = h('button.btn.btn--sm', { type: 'button' }, icon('status', 14), 'Set status');
    statusBtn.addEventListener('click', () => menu(statusBtn, LEAD_STATUSES.map(s => ({ label: s.label, run: () => run({ status: s.id }, s.label) }))));
    const ownerBtn = ctx.isAdmin ? h('button.btn.btn--sm', { type: 'button' }, icon('assign', 14), 'Assign') : null;
    if (ownerBtn) ownerBtn.addEventListener('click', () => menu(ownerBtn, [{ label: 'Unassigned', run: () => run({ owner_id: null }, 'Unassigned') }, '-'].concat(S.people.map(p => ({ label: p.display_name || p.email, run: () => run({ owner_id: p.id }, 'Assigned to ' + (p.display_name || p.email)) })))));
    clear(bulk).append(h('b', plural(n, 'lead') + ' selected'), statusBtn, ownerBtn,
      h('button.btn.btn--sm', { type: 'button', onclick: () => exportCsv(picked()) }, icon('download', 14), 'Export'),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { S.sel.clear(); paint(); } }, 'Clear selection'));
  }

  function exportCsv(list) {
    const rows = Array.isArray(list) ? list : filtered();
    const utm = (l, k) => { try { return new URL(l.page_url).searchParams.get(k) || ''; } catch (e) { return ''; } };
    downloadCsv(`procyon-leads-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: 'First name', value: l => l.first_name }, { label: 'Last name', value: l => l.last_name }, { label: 'Email', value: l => l.email },
      { label: 'Phone', value: l => l.phone }, { label: 'Company', value: l => l.company }, { label: 'Interest', value: l => l.requirement },
      { label: 'Category', value: l => l.category }, { label: 'Status', value: l => l.status }, { label: 'Owner', value: l => staffName(l.owner_id, S.people) },
      { label: 'Follow-up', value: l => l.follow_up_at }, { label: 'Source', value: l => l.source }, { label: 'Page', value: l => l.page_url },
      { label: 'UTM source', value: l => utm(l, 'utm_source') }, { label: 'UTM medium', value: l => utm(l, 'utm_medium') }, { label: 'UTM campaign', value: l => utm(l, 'utm_campaign') },
      { label: 'Received', value: l => l.created_at }, { label: 'Last activity', value: l => l.last_activity_at }, { label: 'Message', value: l => l.message }
    ], rows);
    toast.success(`Exported ${plural(rows.length, 'lead')}`);
  }

  // ---------- Detail drawer ----------
  let activeDrawer = null, leaving = false;
  function openLead(l) {
    if (activeDrawer) activeDrawer.layer.close();
    const base = location.pathname.startsWith('/admin/leads') ? '/admin/leads' : location.pathname;
    history.replaceState(null, '', `/admin/leads/${l.id}${location.search}`);
    const editable = canEdit(l);
    const tl = h('div.timeline');
    const refreshTimeline = async () => {
      clear(tl).append(skeletonRows(3, 2));
      try {
        const acts = await db.list('lead_activities', { filters: [['eq', 'lead_id', l.id]], order: [['occurred_at', false]] });
        clear(tl);
        const items = acts.map(a => ({ at: a.occurred_at, type: a.type, who: staffName(a.user_id, S.people) || 'System', subject: a.subject, body: a.body }))
          .concat([{ at: l.created_at, type: 'created', who: prettySource(l.source), subject: 'Lead received from the website' }]);
        tl.append(h('ol.tl', items.map(a => {
          const t = ACTIVITY_TYPES[a.type] || { label: 'Created', icon: 'leads' };
          return h('li.tl__i.tl__i--' + a.type, h('span.tl__ic', icon(t.icon, 13)),
            h('div.tl__b', h('div.tl__meta', h('b', t.label), ' · ', a.who, ' · ', h('time', { datetime: a.at, title: fmtDateTime(a.at) }, ago(a.at))),
              a.subject ? h('div.tl__s', a.subject) : null, a.body ? h('div.tl__body', a.body) : null));
        })));
      } catch (e) { clear(tl).append(h('p.form-err', e.message)); }
    };
    const body = h('div.detail');
    const fill = () => {
      clear(body);
      const st = statusOf(LEAD_STATUSES, l.status);
      // Controls
      const statusSel = selectEl(LEAD_STATUSES.map(s => ({ id: s.id, label: s.label })), l.status, (v) => setLead(l, { status: v }).then(fill), { disabled: !editable, 'aria-label': 'Status', class: 'input--tone-' + st.tone });
      const { handles, others } = ownerOptions(l);
      const ownerSel = h('select.input.input--sm', { disabled: !ctx.isAdmin, 'aria-label': 'Owner' },
        h('option', { value: '' }, 'Unassigned'),
        handles.length ? h('optgroup', { label: `Handles ${l.category}` }, handles.map(p => h('option', { value: p.id, selected: p.id === l.owner_id }, p.display_name || p.email))) : null,
        h('optgroup', { label: handles.length ? 'Everyone else' : 'Team' }, others.map(p => h('option', { value: p.id, selected: p.id === l.owner_id }, p.display_name || p.email))));
      ownerSel.addEventListener('change', () => setLead(l, { owner_id: ownerSel.value || null }).then(fill));
      const fu = h('input.input.input--sm', { type: 'datetime-local', value: toLocalInput(l.follow_up_at), disabled: !editable, 'aria-label': 'Follow-up date' });
      fu.addEventListener('change', () => setLead(l, { follow_up_at: fromLocalInput(fu.value) }).then(fill));
      const quickFu = (label, days) => h('button.chip.chip--xs', { type: 'button', disabled: !editable, onclick: () => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(10, 0, 0, 0); setLead(l, { follow_up_at: d.toISOString() }).then(fill); } }, label);
      const late = OPEN_LEAD(l.status) && l.follow_up_at && new Date(l.follow_up_at) < new Date();
      body.append(h('div.ctlgrid',
        h('label.field', h('span.field__l', 'Status'), statusSel),
        h('label.field', h('span.field__l', 'Owner'), ownerSel),
        h('div.field.ctlgrid__full', h('span.field__l', 'Follow-up', late ? h('span.late', ' · overdue') : null),
          h('div.fu', fu, quickFu('Tomorrow', 1), quickFu('In 3 days', 3), quickFu('Next week', 7), l.follow_up_at ? h('button.chip.chip--xs', { type: 'button', disabled: !editable, onclick: () => setLead(l, { follow_up_at: null }).then(fill) }, 'Clear') : null))),
      !editable ? h('p.note', icon('lock', 13), 'Read-only: only the owner or an administrator can change this lead.') : null);

      // Contact facts
      let utm = [], page = null;
      try { const u = new URL(l.page_url); page = u; utm = UTM_KEYS.filter(k => u.searchParams.get(k)).map(k => [k, u.searchParams.get(k)]); } catch (e) { /* no page */ }
      const reps = (S.reps[l.category] || []).map(id => staffName(id, S.people));
      body.append(h('dl.facts',
        fact('Email', h('a', { href: 'mailto:' + l.email }, l.email)),
        l.phone ? fact('Phone', h('a', { href: 'tel:' + l.phone.replace(/[^\d+]/g, '') }, l.phone)) : null,
        fact('Company', l.company || '—'),
        fact('Interest', l.requirement || '—'),
        fact('Category', l.category || 'Uncategorised'),
        fact('Source', prettySource(l.source)),
        fact('Received', fmtDateTime(l.created_at)),
        fact('Last activity', l.last_activity_at ? ago(l.last_activity_at) : 'None yet'),
        fact('Handles this category', reps.length ? reps.join(', ') : h('span.warn', 'No rep owns this category'))));
      body.append(h('section.dsec', h('h3', 'Message'), h('div.msg', l.message ? l.message : h('span.muted.italic', 'No message provided.'))));
      body.append(h('section.dsec', h('h3', 'Page and campaign'),
        page ? h('a.pageurl', { href: l.page_url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 13), page.host + page.pathname) : h('p.muted', 'No page recorded.'),
        utm.length ? h('div.utm', utm.map(([k, v]) => h('span.utm__i', h('small', k.replace('utm_', '')), v))) : page ? h('p.muted.small', 'No UTM parameters on this visit.') : null));

      // Timeline + quick add
      body.append(h('section.dsec', h('h3', 'Activity'), editable ? quickAdd(l, refreshTimeline) : null, tl));
    };
    fill();
    refreshTimeline();
    const del = editable ? h('button.iconbtn', { type: 'button', title: 'Delete lead', 'aria-label': 'Delete lead', onclick: async () => {
      if (!(await confirmDialog({ title: 'Delete this lead?', message: `${name(l)} and its activity timeline will be permanently deleted. This cannot be undone.`, confirm: 'Delete permanently', danger: true }))) return;
      try {
        await db.remove('lead_activities', [['eq', 'lead_id', l.id]]).catch(() => {});
        const gone = await db.remove('leads', [['eq', 'id', l.id]]);
        if (!gone.length) throw new Error('The database did not allow this delete.');
        S.leads = S.leads.filter(x => x.id !== l.id); S.sel.delete(l.id);
        layer.close(); paint(); toast.success('Lead deleted');
      } catch (e) { toast.error('Delete failed', { detail: e.message }); }
    } }, icon('trash', 17)) : null;
    const mail = h('a.iconbtn', { href: 'mailto:' + l.email, title: 'Email ' + l.email, 'aria-label': 'Email' }, icon('mail', 17));
    const layer = drawer({ title: name(l), subtitle: [l.company, l.requirement].filter(Boolean).join(' · '), body, actions: [mail, del], width: 620, onClose: () => { activeDrawer = null; if (!leaving) history.replaceState(null, '', base + location.search); } });
    activeDrawer = { layer, lead: l, refreshTimeline };
  }

  function quickAdd(l, refresh) {
    let type = 'note';
    const subject = h('input.input.input--sm', { placeholder: 'Subject (optional), e.g. Discovery call', 'aria-label': 'Subject' });
    const text = h('textarea.input', { rows: 2, placeholder: 'What happened? Outcome and next step…', 'aria-label': 'Details' });
    const types = segmented(['note', 'call', 'email', 'meeting'].map(t => ({ id: t, label: ACTIVITY_TYPES[t].label, icon: ACTIVITY_TYPES[t].icon })), type, (v) => { type = v; }, 'Activity type');
    const btn = h('button.btn.btn--primary.btn--sm', { type: 'submit' }, 'Log activity');
    const form = h('form.qa', types, subject, text, h('div.qa__foot', h('span.muted.small', 'Ctrl+Enter to log'), btn));
    const submit = async (e) => {
      if (e) e.preventDefault();
      if (!subject.value.trim() && !text.value.trim()) { toast.error('Add a subject or a note first.'); text.focus(); return; }
      btn.disabled = true;
      try {
        await db.insert('lead_activities', { lead_id: l.id, user_id: me, type, subject: subject.value.trim() || null, body: text.value.trim() || null });
        l.last_activity_at = new Date().toISOString();
        subject.value = ''; text.value = '';
        toast.success(`${ACTIVITY_TYPES[type].label} logged`);
        refresh(); paint();
      } catch (ex) { toast.error('Could not log the activity', { detail: ex.message }); }
      finally { btn.disabled = false; }
    };
    form.addEventListener('submit', submit);
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); });
    return form;
  }
  const fact = (k, v) => h('div', h('dt', k), h('dd', v));

  // ---------- Keyboard ----------
  ctx.view.keys = {
    j: () => moveCursor(1), k: () => moveCursor(-1),
    Enter: () => { const l = filtered()[S.cursor]; if (l) openLead(l); },
    x: () => { const l = filtered()[S.cursor]; if (l) { S.sel.has(l.id) ? S.sel.delete(l.id) : S.sel.add(l.id); paint(); } },
    v: () => { S.view = S.view === 'table' ? 'board' : 'table'; store.set('leads:view', S.view); paint(); }
  };
  function moveCursor(d) {
    if (S.view !== 'table') return;
    const n = Math.min(filtered().length, S.shown);
    S.cursor = Math.max(0, Math.min(n - 1, S.cursor + d));
    content.querySelectorAll('tbody tr').forEach((tr, i) => { tr.classList.toggle('is-cursor', i === S.cursor); if (i === S.cursor) tr.scrollIntoView({ block: 'nearest' }); });
  }

  load();
  return () => { leaving = true; if (activeDrawer) activeDrawer.layer.close(); };
}
