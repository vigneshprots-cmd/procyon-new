// Event meeting requests: list, filters, status pipeline, detail drawer, CSV export.
import { h, icon, clear, ago, fmtDate, fmtDateTime, debounce, downloadCsv, plural, fmtNum } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, drawer, menu, badge, skeletonRows, empty, errorState, pageHead, selectEl } from '../core/ui.js';
import { MEETING_STATUSES, statusOf } from '../core/constants.js';

export async function render(main) {
  document.title = 'Meeting requests | Procyon Admin';
  const qs = new URLSearchParams(location.search);
  const S = { rows: [], f: { q: '', status: qs.get('status') || '', event: '' }, cursor: -1 };
  const search = h('input.input.input--search', { type: 'search', placeholder: 'Search name, email, company, note', 'aria-label': 'Search meeting requests' });
  search.addEventListener('input', debounce(() => { S.f.q = search.value; paint(); }, 150));
  const chips = h('div.chips'), filters = h('div.filters'), countEl = h('span.muted'), content = h('div');
  main.append(pageHead('Meeting requests', '1:1 sessions requested from event pages. Confirm the slot by email, then move the request along.', [
    h('button.btn', { type: 'button', onclick: () => exportCsv() }, icon('download', 15), h('span.hide-sm', 'Export CSV'))
  ]), chips, h('div.toolbar', h('div.toolbar__search', icon('search', 15), search), filters, countEl), content);
  content.append(skeletonRows(6, 5));

  async function load() {
    try {
      S.rows = await db.list('event_meeting_requests', { order: [['created_at', false]] });
      paint();
      const open = qs.get('open'); if (open) { const r = S.rows.find(x => x.id === open); if (r) openRow(r); }
    } catch (e) { clear(content).append(errorState(e, load)); }
  }
  const filtered = () => {
    const w = S.f.q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.rows.filter(r => (!S.f.status || r.status === S.f.status) && (!S.f.event || r.event_title === S.f.event) &&
      (!w.length || w.every(x => [r.full_name, r.email, r.company, r.note, r.event_title, r.phone].join(' ').toLowerCase().includes(x))));
  };
  function paint() {
    const c = (id) => S.rows.filter(r => r.status === id).length;
    clear(chips).append(
      h('button.chip' + (!S.f.status ? '.is-on' : ''), { type: 'button', onclick: () => { S.f.status = ''; paint(); } }, 'All', h('small', fmtNum(S.rows.length))),
      MEETING_STATUSES.map(s => h('button.chip' + (S.f.status === s.id ? '.is-on' : ''), { type: 'button', onclick: () => { S.f.status = s.id; paint(); } }, s.label, h('small', fmtNum(c(s.id))))));
    const events = [...new Set(S.rows.map(r => r.event_title).filter(Boolean))];
    clear(filters).append(selectEl([{ id: '', label: 'All events' }].concat(events.map(e => ({ id: e, label: e }))), S.f.event, (v) => { S.f.event = v; paint(); }, { 'aria-label': 'Event' }));
    const rows = filtered();
    countEl.textContent = plural(rows.length, 'request');
    clear(content);
    if (!S.rows.length) return content.append(empty({ icon: 'calendar', title: 'No meeting requests yet', text: 'Requests from event booking forms will appear here.' }));
    if (!rows.length) return content.append(empty({ icon: 'filter', title: 'Nothing matches', text: 'Try another status, event or search.' }));
    content.append(h('div.tablewrap', h('table.tbl', { 'aria-label': 'Meeting requests' },
      h('thead', h('tr', h('th', 'Who'), h('th.hide-md', 'Event'), h('th', 'Requested slot'), h('th', 'Status'), h('th.hide-sm', 'Received'))),
      h('tbody', rows.map((r, i) => {
        const st = statusOf(MEETING_STATUSES, r.status);
        return h('tr' + (i === S.cursor ? '.is-cursor' : ''), { onclick: () => { S.cursor = i; openRow(r); } },
          h('td', h('div.cell2', h('b', r.full_name), h('small', r.company || r.email))),
          h('td.hide-md', r.event_title || '—'),
          h('td', r.requested_date ? h('span', fmtDate(r.requested_date + 'T12:00:00'), r.requested_time ? h('small.muted', ' ' + r.requested_time) : null, r.timezone ? h('small.muted', ' ' + r.timezone.split('/').pop().replace(/_/g, ' ')) : null) : h('span.muted', 'Any time')),
          h('td', h('button.pillbtn', { type: 'button', onclick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, r); } }, badge(st.label, st.tone), icon('chevronDown', 12))),
          h('td.hide-sm', h('span', { title: fmtDateTime(r.created_at) }, ago(r.created_at))));
      })))));
  }
  function statusMenu(anchor, r) { menu(anchor, MEETING_STATUSES.map(s => ({ label: s.label, icon: s.id === r.status ? 'check' : null, run: () => setStatus(r, s.id) }))); }
  async function setStatus(r, status) {
    const prev = r.status; r.status = status; paint();
    try { Object.assign(r, await db.update('event_meeting_requests', r.id, { status })); toast.success(`${r.full_name}: ${statusOf(MEETING_STATUSES, status).label}`); if (open) open.refill(); }
    catch (e) { r.status = prev; paint(); toast.error('Not saved', { detail: e.message }); }
  }
  let open = null;
  function openRow(r) {
    const body = h('div.detail');
    const refill = () => {
      clear(body);
      body.append(h('div.ctlgrid', h('label.field', h('span.field__l', 'Status'), selectEl(MEETING_STATUSES.map(s => ({ id: s.id, label: s.label })), r.status, (v) => setStatus(r, v), { 'aria-label': 'Status' }))),
        h('dl.facts',
          f('Email', h('a', { href: 'mailto:' + r.email }, r.email)), r.phone ? f('Phone', h('a', { href: 'tel:' + String(r.phone).replace(/[^\d+]/g, '') }, r.phone)) : null,
          f('Company', r.company || '—'), f('Event', r.event_title || r.event_slug || '—'),
          f('Requested date', r.requested_date ? fmtDate(r.requested_date + 'T12:00:00') : 'Any'), f('Requested time', [r.requested_time, r.timezone].filter(Boolean).join(' ') || 'Any'),
          f('Source', r.source || '—'), f('Received', fmtDateTime(r.created_at))),
        h('section.dsec', h('h3', 'Note from the requester'), h('div.msg', r.note || h('span.muted.italic', 'No note.'))),
        h('section.dsec', h('h3', 'Next step'), h('div.nextstep',
          h('a.btn.btn--primary', { href: `mailto:${r.email}?subject=${encodeURIComponent('Your 1:1 with Procyon' + (r.event_title ? ' at ' + r.event_title : ''))}` }, icon('mail', 15), 'Reply by email'),
          r.status === 'new' ? h('button.btn', { type: 'button', onclick: () => setStatus(r, 'contacted') }, 'Mark contacted') : null,
          r.status !== 'confirmed' && r.status !== 'completed' ? h('button.btn', { type: 'button', onclick: () => setStatus(r, 'confirmed') }, 'Mark confirmed') : null)),
        h('p.note', icon('info', 13), 'Meeting requests have no notes table yet. Log follow-up detail on the matching lead, or see ADMIN.md for the suggested schema change.'));
    };
    refill();
    const layer = drawer({ title: r.full_name, subtitle: [r.company, r.event_title].filter(Boolean).join(' · '), body, width: 560, onClose: () => { open = null; } });
    open = { layer, refill };
  }
  const f = (k, v) => h('div', h('dt', k), h('dd', v));
  function exportCsv() {
    const rows = filtered();
    downloadCsv(`procyon-meeting-requests-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: 'Name', value: r => r.full_name }, { label: 'Email', value: r => r.email }, { label: 'Phone', value: r => r.phone }, { label: 'Company', value: r => r.company },
      { label: 'Event', value: r => r.event_title }, { label: 'Date', value: r => r.requested_date }, { label: 'Time', value: r => r.requested_time }, { label: 'Timezone', value: r => r.timezone },
      { label: 'Status', value: r => r.status }, { label: 'Note', value: r => r.note }, { label: 'Received', value: r => r.created_at }], rows);
    toast.success(`Exported ${plural(rows.length, 'request')}`);
  }
  ctx.view.keys = {
    j: () => move(1), k: () => move(-1), Enter: () => { const r = filtered()[S.cursor]; if (r) openRow(r); }
  };
  function move(d) { S.cursor = Math.max(0, Math.min(filtered().length - 1, S.cursor + d)); content.querySelectorAll('tbody tr').forEach((tr, i) => { tr.classList.toggle('is-cursor', i === S.cursor); if (i === S.cursor) tr.scrollIntoView({ block: 'nearest' }); }); }
  load();
  return () => { if (open) open.layer.close(); };
}
