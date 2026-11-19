// Content lists: blog posts, case studies, events and job posts.
import { h, icon, clear, ago, fmtDate, fmtDateTime, debounce, plural, fmtNum } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, menu, confirmDialog, badge, skeletonRows, empty, errorState, pageHead, selectEl } from '../core/ui.js';

const TYPES = {
  blog: {
    table: 'blog_posts', title: 'Blog', icon: 'blog', noun: 'post', base: '/admin/blog', live: (r) => '/blog/' + r.slug,
    sub: 'Articles for procyonts.com/blog. Gallery posts carry photo strips and a lightbox.',
    select: 'id, slug, title, status, category, author, content, published_at, updated_at',
    order: [['updated_at', false]],
    published: (r) => r.status === 'published',
    toggle: (r) => r.status === 'published' ? { status: 'draft' } : { status: 'published', published_at: r.published_at || new Date().toISOString() },
    search: (r) => [r.title, r.slug, r.category, r.author].join(' '),
    filters: (rows) => [{ key: 'category', label: 'All categories', options: [...new Set(rows.map(r => (r.category || '').trim()).filter(Boolean))].sort() }],
    columns: [
      { label: 'Title', cell: (r) => h('div.cell2', h('b', r.title || 'Untitled'), h('small', '/blog/' + (r.slug || ''))) },
      { label: 'Category', cls: 'hide-md', cell: (r) => r.category || '—' },
      { label: 'Author', cls: 'hide-md', cell: (r) => r.author || '—' },
      { label: 'Format', cls: 'hide-sm', cell: (r) => isGallery(r.content) ? badge('Gallery', 'violet') : h('span.muted', 'Standard') },
      { label: 'Status', cell: (r) => r.status === 'published' ? badge('Published', 'green') : badge('Draft', 'amber') },
      { label: 'Published', cls: 'hide-sm', cell: (r) => r.published_at ? fmtDate(r.published_at) : h('span.muted', '—') }
    ]
  },
  'case-studies': {
    table: 'case_studies', title: 'Case studies', icon: 'award', noun: 'case study', plural: 'case studies', base: '/admin/case-studies', live: (r) => '/case-studies/' + r.slug,
    sub: 'Client outcomes for procyonts.com/case-studies, shown in sort order.',
    select: 'id, slug, title, client, industry, platform, status, is_featured, sort_order, updated_at',
    order: [['sort_order', true], ['updated_at', false]],
    published: (r) => r.status === 'published',
    toggle: (r) => r.status === 'published' ? { status: 'draft' } : { status: 'published', published_at: new Date().toISOString() },
    search: (r) => [r.title, r.client, r.industry, r.platform].join(' '),
    filters: (rows) => [{ key: 'industry', label: 'All industries', options: [...new Set(rows.map(r => r.industry).filter(Boolean))].sort() }],
    columns: [
      { label: 'Case study', cell: (r) => h('div.cell2', h('b', r.title || 'Untitled'), h('small', r.client || '')) },
      { label: 'Industry', cls: 'hide-md', cell: (r) => r.industry || '—' },
      { label: 'Platform', cls: 'hide-md', cell: (r) => r.platform || '—' },
      { label: 'Status', cell: (r) => r.status === 'published' ? badge('Published', 'green') : badge('Draft', 'amber') },
      { label: 'Featured', cls: 'hide-sm', cell: (r) => r.is_featured ? h('span.star', icon('star', 15)) : h('span.muted', '—') },
      { label: 'Order', cls: 'hide-sm', cell: (r) => String(r.sort_order ?? 0) }
    ]
  },
  events: {
    table: 'events', title: 'Events', icon: 'event', noun: 'event', base: '/admin/events', live: (r) => '/insights/events/' + r.slug,
    sub: 'Conferences where the team takes 1:1 meetings. The promoted event drives the site-wide promo.',
    select: 'id, slug, title, date_text, start_date, location, event_type, is_published, is_featured, promo_enabled, display_order, updated_at',
    order: [['display_order', true], ['start_date', false]],
    published: (r) => !!r.is_published,
    toggle: (r) => ({ is_published: !r.is_published }),
    search: (r) => [r.title, r.location, r.event_type].join(' '),
    filters: () => [],
    columns: [
      { label: 'Event', cell: (r) => h('div.cell2', h('b', r.title || 'Untitled'), h('small', r.date_text || '')) },
      { label: 'Location', cls: 'hide-md', cell: (r) => r.location || '—' },
      { label: 'Status', cell: (r) => r.is_published ? badge('Published', 'green') : badge('Hidden', 'amber') },
      { label: 'Promoted', cls: 'hide-sm', cell: (r) => r.is_featured || r.promo_enabled ? badge('Promoted', 'blue') : h('span.muted', '—') },
      { label: 'When', cls: 'hide-sm', cell: (r) => r.start_date ? (new Date(r.start_date + 'T23:59:59') < new Date() ? h('span.muted', 'Took place') : 'Upcoming') : '—' }
    ],
    extra: (r, reload) => ({ label: r.is_featured ? 'Stop promoting' : 'Promote site-wide', icon: 'promo', run: async () => {
      try {
        if (!r.is_featured) { const others = await db.list('events', { select: 'id', filters: [['eq', 'is_featured', true]] }); for (const o of others) if (o.id !== r.id) await db.update('events', o.id, { is_featured: false, promo_enabled: false }); }
        await db.update('events', r.id, { is_featured: !r.is_featured, promo_enabled: !r.is_featured });
        toast.success(r.is_featured ? 'Promotion stopped' : `"${r.title}" is now promoted`); reload(); ctx.publishHint();
      } catch (e) { toast.error('Not saved', { detail: e.message }); }
    } })
  },
  careers: {
    table: 'jobs', title: 'Careers', icon: 'briefcase', noun: 'job post', base: '/admin/careers', live: (r) => '/careers/' + r.slug,
    sub: 'Roles on procyonts.com/careers. Closed roles stay visible, marked closed, and stop taking applications.',
    select: 'id, slug, title, department, location, employment_type, is_published, is_open, display_order, created_by, updated_at',
    order: [['display_order', true], ['updated_at', false]],
    published: (r) => !!r.is_published,
    toggle: (r) => ({ is_published: !r.is_published }),
    search: (r) => [r.title, r.department, r.location].join(' '),
    filters: (rows) => [{ key: 'department', label: 'All departments', options: [...new Set(rows.map(r => r.department).filter(Boolean))].sort() }],
    columns: [
      { label: 'Role', cell: (r) => h('div.cell2', h('b', r.title || 'Untitled'), h('small', [r.department, r.employment_type].filter(Boolean).join(' · '))) },
      { label: 'Location', cls: 'hide-md', cell: (r) => r.location || '—' },
      { label: 'Status', cell: (r) => r.is_published ? badge('Published', 'green') : badge('Draft', 'amber') },
      { label: 'Applications', cls: 'hide-sm', cell: (r) => h('a.count', { href: '/admin/applications?job=' + r.id, onclick: (e) => e.stopPropagation() }, icon('apps', 13), fmtNum(r._apps || 0)) },
      { label: 'Hiring', cls: 'hide-sm', cell: (r) => r.is_open ? badge('Open', 'blue') : badge('Closed', 'grey') }
    ],
    extra: (r, reload) => ({ label: r.is_open ? 'Close to applications' : 'Reopen for applications', icon: 'lock', run: async () => {
      try { await db.update('jobs', r.id, { is_open: !r.is_open }); toast.success(r.is_open ? 'Role closed' : 'Role reopened'); reload(); ctx.publishHint(); } catch (e) { toast.error('Not saved', { detail: e.message }); }
    } })
  }
};
export const isGallery = (c) => !!c && ((!Array.isArray(c) && typeof c === 'object' && c.format === 'gallery') || (Array.isArray(c) && c.some(x => x && (x.url || x.group))));

export async function render(main, { type }) {
  const T = TYPES[type];
  document.title = `${T.title} | Procyon Admin`;
  const S = { rows: [], q: '', status: '', f: {}, cursor: -1 };
  const search = h('input.input.input--search', { type: 'search', placeholder: `Search ${T.plural || T.noun + 's'}`, 'aria-label': 'Search' });
  search.addEventListener('input', debounce(() => { S.q = search.value; paint(); }, 120));
  const filters = h('div.filters'), countEl = h('span.muted'), content = h('div');
  const newItem = () => ctx.go(T.base + '/new');
  main.append(pageHead(T.title, T.sub, [h('button.btn.btn--primary', { type: 'button', onclick: newItem, title: 'New (N)' }, icon('plus', 15), 'New ' + T.noun)]),
    h('div.toolbar', h('div.toolbar__search', icon('search', 15), search), filters, countEl), content);
  content.append(skeletonRows(6, 5));
  ctx.view.onNew = newItem;

  async function load() {
    try {
      S.rows = await db.list(T.table, { select: T.select, order: T.order });
      if (type === 'careers') {
        const apps = await db.list('job_applications', { select: 'job_id' }).catch(() => []);
        const c = {}; apps.forEach(a => { c[a.job_id] = (c[a.job_id] || 0) + 1; });
        S.rows.forEach(r => { r._apps = c[r.id] || 0; });
      }
      paint();
    } catch (e) { clear(content).append(errorState(e, load)); }
  }
  const filtered = () => {
    const w = S.q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.rows.filter(r => (!S.status || (S.status === 'live' ? T.published(r) : !T.published(r))) &&
      Object.entries(S.f).every(([k, v]) => !v || String(r[k] || '').trim() === v) &&
      (!w.length || w.every(x => T.search(r).toLowerCase().includes(x))));
  };
  function paint() {
    const live = S.rows.filter(T.published).length;
    clear(filters).append(
      selectEl([{ id: '', label: `All (${S.rows.length})` }, { id: 'live', label: `Published (${live})` }, { id: 'draft', label: `${type === 'events' ? 'Hidden' : 'Drafts'} (${S.rows.length - live})` }], S.status, (v) => { S.status = v; paint(); }, { 'aria-label': 'Status' }),
      T.filters(S.rows).map(fl => selectEl([{ id: '', label: fl.label }].concat(fl.options.map(o => ({ id: o, label: o }))), S.f[fl.key] || '', (v) => { S.f[fl.key] = v; paint(); }, { 'aria-label': fl.label })));
    const rows = filtered();
    countEl.textContent = plural(rows.length, T.noun, T.plural);
    clear(content);
    if (!S.rows.length) return content.append(empty({ icon: T.icon, title: `No ${T.plural || T.noun + 's'} yet`, text: 'Create the first one to get started.', action: { label: 'New ' + T.noun, icon: 'plus', run: newItem } }));
    if (!rows.length) return content.append(empty({ icon: 'filter', title: 'Nothing matches', text: 'Change the filters or the search.' }));
    content.append(h('div.tablewrap', h('table.tbl', { 'aria-label': T.title },
      h('thead', h('tr', T.columns.map(c => h('th' + (c.cls ? '.' + c.cls : ''), c.label)), h('th.hide-sm', 'Updated'), h('th.act', h('span.visually-hidden', 'Actions')))),
      h('tbody', rows.map((r, i) => h('tr' + (i === S.cursor ? '.is-cursor' : ''), { onclick: () => ctx.go(`${T.base}/${r.id}`) },
        T.columns.map(c => h('td' + (c.cls ? '.' + c.cls : ''), c.cell(r))),
        h('td.hide-sm', h('span.muted', { title: fmtDateTime(r.updated_at) }, ago(r.updated_at))),
        h('td.act', h('button.iconbtn', { type: 'button', 'aria-label': 'Actions for ' + r.title, onclick: (e) => { e.stopPropagation(); rowMenu(e.currentTarget, r); } }, icon('more', 18)))))))));
  }
  function rowMenu(anchor, r) {
    const pub = T.published(r);
    menu(anchor, [
      { label: 'Edit', icon: 'authors', run: () => ctx.go(`${T.base}/${r.id}`) },
      pub && r.slug ? { label: 'View on website', icon: 'external', run: () => window.open(T.live(r), '_blank', 'noopener') } : null,
      { label: pub ? (type === 'events' ? 'Hide from site' : 'Move to draft') : 'Publish', icon: pub ? 'eye' : 'rocket', run: async () => {
        try { Object.assign(r, await db.update(T.table, r.id, T.toggle(r))); toast.success(pub ? 'Unpublished' : 'Published in the CMS'); paint(); ctx.publishHint(); }
        catch (e) { toast.error('Not saved', { detail: e.message }); }
      } },
      T.extra ? T.extra(r, load) : null,
      '-',
      { label: 'Delete', icon: 'trash', danger: true, run: async () => {
        const extra = type === 'careers' && r._apps ? ` It has ${plural(r._apps, 'application')}, which may be deleted with it.` : '';
        if (!(await confirmDialog({ title: `Delete this ${T.noun}?`, message: `"${r.title}" will be permanently deleted from the CMS.${extra} This cannot be undone.`, confirm: 'Delete permanently', danger: true }))) return;
        try { const gone = await db.remove(T.table, [['eq', 'id', r.id]]); if (!gone.length) throw new Error('The database did not allow this delete.'); S.rows = S.rows.filter(x => x !== r); paint(); toast.success('Deleted'); if (pub) ctx.publishHint(); }
        catch (e) { toast.error('Delete failed', { detail: e.message }); }
      } }
    ], { align: 'end' });
  }
  ctx.view.keys = {
    j: () => move(1), k: () => move(-1), Enter: () => { const r = filtered()[S.cursor]; if (r) ctx.go(`${T.base}/${r.id}`); }
  };
  function move(d) { S.cursor = Math.max(0, Math.min(filtered().length - 1, S.cursor + d)); content.querySelectorAll('tbody tr').forEach((tr, i) => { tr.classList.toggle('is-cursor', i === S.cursor); if (i === S.cursor) tr.scrollIntoView({ block: 'nearest' }); }); }
  load();
}
