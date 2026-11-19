// Job applications: table or board by status, filters, CSV export, and a candidate drawer
// with recruiter notes (job_application_notes) and "move to another role".
import { h, icon, clear, ago, fmtDateTime, debounce, downloadCsv, plural, fmtNum, store } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx, myName } from '../core/ctx.js';
import { toast, drawer, menu, modal, confirmDialog, badge, avatar, skeletonRows, empty, errorState, segmented, pageHead, selectEl } from '../core/ui.js';
import { APPLICATION_STATUSES, APPLICATION_NOTE_TYPES, statusOf } from '../core/constants.js';

export async function render(main) {
  document.title = 'Applications | Procyon Admin';
  const qs = new URLSearchParams(location.search);
  const S = { apps: [], jobs: [], noteCounts: {}, f: { q: '', status: qs.get('status') || '', job: qs.get('job') || '' }, view: store.get('apps:view') || 'table', cursor: -1 };
  const search = h('input.input.input--search', { type: 'search', placeholder: 'Search name, email, company, title', 'aria-label': 'Search applications' });
  search.addEventListener('input', debounce(() => { S.f.q = search.value; paint(); }, 150));
  const chips = h('div.chips'), filters = h('div.filters'), countEl = h('span.muted'), content = h('div');
  const seg = segmented([{ id: 'table', icon: 'list', title: 'Table (V)' }, { id: 'board', icon: 'kanban', title: 'Board (V)' }], S.view, (v) => { S.view = v; store.set('apps:view', v); paint(); }, 'Layout');
  main.append(pageHead('Applications', 'Candidates for open roles and open applications. Notes are shared with the whole hiring team.', [
    h('button.btn', { type: 'button', onclick: () => exportCsv() }, icon('download', 15), h('span.hide-sm', 'Export CSV')), seg
  ]), chips, h('div.toolbar', h('div.toolbar__search', icon('search', 15), search), filters, countEl), content);
  content.append(skeletonRows(8, 5));

  const jobTitle = (id) => (S.jobs.find(j => j.id === id) || {}).title || 'Unknown role';
  async function load() {
    try {
      const [apps, jobs, notes] = await Promise.all([
        db.list('job_applications', { order: [['created_at', false]] }),
        db.list('jobs', { select: 'id, title, slug, is_open, is_published', order: [['title', true]] }),
        db.list('job_application_notes', { select: 'application_id' }).catch(() => [])
      ]);
      S.apps = apps; S.jobs = jobs;
      S.noteCounts = {}; notes.forEach(n => { S.noteCounts[n.application_id] = (S.noteCounts[n.application_id] || 0) + 1; });
      paint();
      const open = qs.get('open'); if (open) { const a = S.apps.find(x => x.id === open); if (a) openApp(a); }
    } catch (e) { clear(content).append(errorState(e, load)); }
  }
  const filtered = () => {
    const w = S.f.q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.apps.filter(a => (!S.f.status || (a.status || 'new') === S.f.status) && (!S.f.job || a.job_id === S.f.job) &&
      (!w.length || w.every(x => [a.full_name, a.email, a.current_company, a.current_title, a.location, jobTitle(a.job_id)].join(' ').toLowerCase().includes(x))));
  };
  function paint() {
    clear(chips).append(h('button.chip' + (!S.f.status ? '.is-on' : ''), { type: 'button', onclick: () => { S.f.status = ''; paint(); } }, 'All', h('small', fmtNum(S.apps.length))),
      APPLICATION_STATUSES.map(s => h('button.chip' + (S.f.status === s.id ? '.is-on' : ''), { type: 'button', onclick: () => { S.f.status = s.id; paint(); } }, s.label, h('small', fmtNum(S.apps.filter(a => (a.status || 'new') === s.id).length)))));
    const counts = {}; S.apps.forEach(a => { counts[a.job_id] = (counts[a.job_id] || 0) + 1; });
    clear(filters).append(selectEl([{ id: '', label: 'All roles' }].concat(S.jobs.filter(j => counts[j.id]).map(j => ({ id: j.id, label: `${j.title} (${counts[j.id]})` }))), S.f.job, (v) => { S.f.job = v; paint(); }, { 'aria-label': 'Role' }));
    seg.querySelectorAll('.seg__b').forEach((b, i) => b.classList.toggle('is-on', (i ? 'board' : 'table') === S.view));
    const rows = filtered();
    countEl.textContent = plural(rows.length, 'application');
    clear(content);
    if (!S.apps.length) return content.append(empty({ icon: 'apps', title: 'No applications yet', text: 'Applications from the careers pages will appear here.' }));
    if (!rows.length) return content.append(empty({ icon: 'filter', title: 'Nothing matches', text: 'Try another status, role or search.' }));
    content.append(S.view === 'board' ? board(rows) : table(rows));
  }
  function table(rows) {
    return h('div.tablewrap', h('table.tbl', { 'aria-label': 'Applications' },
      h('thead', h('tr', h('th', 'Candidate'), h('th', 'Role'), h('th.hide-md', 'Experience'), h('th', 'Status'), h('th.hide-sm', 'Notes'), h('th.hide-sm', 'Applied'))),
      h('tbody', rows.map((a, i) => {
        const st = statusOf(APPLICATION_STATUSES, a.status || 'new');
        return h('tr' + (i === S.cursor ? '.is-cursor' : ''), { onclick: () => { S.cursor = i; openApp(a); } },
          h('td', h('div.who', avatar(a.full_name, 30), h('div.cell2', h('b', a.full_name), h('small', [a.current_title, a.current_company].filter(Boolean).join(' at ') || a.email)))),
          h('td', h('div.cell2', h('span', jobTitle(a.job_id)), a.transferred_from_job_id ? h('small', 'Moved from ' + jobTitle(a.transferred_from_job_id)) : null)),
          h('td.hide-md', a.years_experience ? a.years_experience + ' yrs' : '—'),
          h('td', h('button.pillbtn', { type: 'button', onclick: (e) => { e.stopPropagation(); statusMenu(e.currentTarget, a); } }, badge(st.label, st.tone), icon('chevronDown', 12))),
          h('td.hide-sm', S.noteCounts[a.id] ? h('span.count', icon('note', 13), S.noteCounts[a.id]) : h('span.muted', '—')),
          h('td.hide-sm', h('span', { title: fmtDateTime(a.created_at) }, ago(a.created_at))));
      }))));
  }
  function board(rows) {
    return h('div.board.board--4', APPLICATION_STATUSES.map(s => {
      const list = rows.filter(a => (a.status || 'new') === s.id);
      const body = h('div.col__body', list.map(a => {
        const el = h('article.kcard', { draggable: 'true', tabindex: '0', onclick: () => openApp(a), onkeydown: (e) => { if (e.key === 'Enter') openApp(a); } },
          h('div.kcard__top', h('b', a.full_name), avatar(a.full_name, 22)), h('div.kcard__co', jobTitle(a.job_id)),
          h('div.kcard__meta', a.years_experience ? h('span.tag', a.years_experience + ' yrs') : null, S.noteCounts[a.id] ? h('span.count', icon('note', 12), S.noteCounts[a.id]) : null, h('span.muted', ago(a.created_at))));
        el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/app', a.id); el.classList.add('is-drag'); });
        el.addEventListener('dragend', () => el.classList.remove('is-drag'));
        return el;
      }), !list.length ? h('div.col__empty', 'Drop a candidate here') : null);
      body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('is-over'); });
      body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) body.classList.remove('is-over'); });
      body.addEventListener('drop', (e) => { e.preventDefault(); body.classList.remove('is-over'); const a = S.apps.find(x => x.id === e.dataTransfer.getData('text/app')); if (a && (a.status || 'new') !== s.id) setStatus(a, s.id); });
      return h('section.col', h('header.col__head', h('span.dot.dot--' + s.tone), h('b', s.label), h('small', fmtNum(list.length))), body);
    }));
  }
  function statusMenu(anchor, a) { menu(anchor, APPLICATION_STATUSES.map(s => ({ label: s.label, icon: s.id === (a.status || 'new') ? 'check' : null, run: () => setStatus(a, s.id) }))); }
  async function setStatus(a, status) {
    const prev = a.status; a.status = status; paint();
    try { Object.assign(a, await db.update('job_applications', a.id, { status })); toast.success(`${a.full_name}: ${statusOf(APPLICATION_STATUSES, status).label}`); if (open && open.app.id === a.id) open.refill(); }
    catch (e) { a.status = prev; paint(); toast.error('Not saved', { detail: e.message }); }
  }

  let open = null;
  function openApp(a) {
    if (open) open.layer.close();
    const body = h('div.detail');
    const notesEl = h('div.timeline');
    const loadNotes = async () => {
      clear(notesEl).append(skeletonRows(2, 2));
      try {
        const notes = await db.list('job_application_notes', { filters: [['eq', 'application_id', a.id]], order: [['created_at', false]] });
        S.noteCounts[a.id] = notes.length;
        clear(notesEl).append(notes.length ? h('ol.tl', notes.map(n => {
          const t = APPLICATION_NOTE_TYPES[n.type] || APPLICATION_NOTE_TYPES.note;
          const mine = n.author_id === ctx.user.id;
          return h('li.tl__i.tl__i--' + n.type, h('span.tl__ic', icon(t.icon, 13)),
            h('div.tl__b', h('div.tl__meta', h('b', t.label), ' · ', n.author_name || 'Staff', ' · ', h('time', { title: fmtDateTime(n.created_at) }, ago(n.created_at)),
              mine || ctx.isAdmin ? h('button.linkbtn.linkbtn--danger', { type: 'button', onclick: async () => {
                if (!(await confirmDialog({ title: 'Delete this note?', message: 'The note is removed from the candidate timeline for everyone.', confirm: 'Delete', danger: true }))) return;
                try { await db.remove('job_application_notes', [['eq', 'id', n.id]]); loadNotes(); } catch (e) { toast.error('Delete failed', { detail: e.message }); }
              } }, 'Delete') : null),
              n.type === 'role_transfer' && n.metadata ? h('div.tl__s', `${n.metadata.old_job_title || 'Previous role'} → ${n.metadata.new_job_title || 'New role'}`) : null,
              n.content ? h('div.tl__body', n.content) : null));
        })) : h('p.muted.small', 'No notes yet. Add the first one above.'));
      } catch (e) { clear(notesEl).append(h('p.form-err', e.message)); }
    };
    const refill = () => {
      clear(body);
      const links = [
        a.linkedin_url ? h('a.btn.btn--sm', { href: a.linkedin_url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 13), 'LinkedIn') : null,
        a.portfolio_url ? h('a.btn.btn--sm', { href: a.portfolio_url, target: '_blank', rel: 'noopener noreferrer' }, icon('external', 13), 'Portfolio') : null,
        a.resume_path && /^https:\/\//.test(a.resume_path) ? h('a.btn.btn--sm', { href: a.resume_path, target: '_blank', rel: 'noopener noreferrer', title: 'Resume links from the old site are signed and may have expired' }, icon('file', 13), 'Resume') : null,
        h('a.btn.btn--sm', { href: 'mailto:' + a.email }, icon('mail', 13), 'Email')
      ];
      body.append(
        h('div.ctlgrid', h('label.field', h('span.field__l', 'Status'), selectEl(APPLICATION_STATUSES.map(s => ({ id: s.id, label: s.label })), a.status || 'new', (v) => setStatus(a, v), { 'aria-label': 'Status' })),
          h('div.field', h('span.field__l', 'Role'), h('div.fu', h('span.strong', jobTitle(a.job_id)), h('button.chip.chip--xs', { type: 'button', onclick: () => moveRole(a) }, icon('move', 12), 'Move to another role')))),
        h('div.linkrow', links),
        h('dl.facts', f('Email', a.email), a.phone ? f('Phone', a.phone) : null, f('Location', a.location || '—'), f('Current role', [a.current_title, a.current_company].filter(Boolean).join(' at ') || '—'),
          f('Experience', a.years_experience ? a.years_experience + ' years' : '—'), f('Applied', fmtDateTime(a.created_at)),
          a.transferred_at ? f('Moved', `${ago(a.transferred_at)} from ${jobTitle(a.transferred_from_job_id)}`) : null),
        h('section.dsec', h('h3', 'Cover letter'), h('div.msg', a.cover_letter || h('span.muted.italic', 'No cover letter.'))),
        h('section.dsec', h('h3', 'Recruiter notes'), noteForm(a, loadNotes), notesEl));
    };
    refill(); loadNotes();
    const layer = drawer({ title: a.full_name, subtitle: jobTitle(a.job_id), body, width: 600, onClose: () => { open = null; paint(); } });
    open = { layer, app: a, refill };
  }
  function noteForm(a, after) {
    let type = 'note';
    const text = h('textarea.input', { rows: 2, placeholder: 'Screening outcome, interview feedback, next step…', 'aria-label': 'Note' });
    const btn = h('button.btn.btn--primary.btn--sm', { type: 'submit' }, 'Add note');
    const form = h('form.qa', segmented(['note', 'call', 'interview'].map(t => ({ id: t, label: APPLICATION_NOTE_TYPES[t].label, icon: APPLICATION_NOTE_TYPES[t].icon })), type, (v) => { type = v; }, 'Note type'), text, h('div.qa__foot', h('span.muted.small', 'Ctrl+Enter to add'), btn));
    const submit = async (e) => {
      if (e) e.preventDefault();
      if (!text.value.trim()) { text.focus(); return; }
      btn.disabled = true;
      try { await db.insert('job_application_notes', { application_id: a.id, author_id: ctx.user.id, author_name: myName(), type, content: text.value.trim() }); text.value = ''; toast.success('Note added'); after(); }
      catch (ex) { toast.error('Could not add the note', { detail: ex.message }); }
      finally { btn.disabled = false; }
    };
    form.addEventListener('submit', submit);
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); });
    return form;
  }
  function moveRole(a) {
    const target = selectEl(S.jobs.filter(j => j.id !== a.job_id).map(j => ({ id: j.id, label: j.title + (j.is_open ? '' : ' (closed)') })), '', null, { 'aria-label': 'New role' });
    const status = selectEl(APPLICATION_STATUSES.filter(s => s.id !== 'rejected').map(s => ({ id: s.id, label: s.label })), 'new', null, { 'aria-label': 'Status in the new role' });
    const reason = h('textarea.input', { rows: 3, placeholder: 'Why this candidate fits the new role better', 'aria-label': 'Reason' });
    modal({
      title: `Move ${a.full_name} to another role`, body: h('div.form', h('label.field', h('span.field__l', 'New role'), target), h('label.field', h('span.field__l', 'Status in the new role'), status), h('label.field', h('span.field__l', 'Reason (saved as a note)'), reason)),
      actions: [{ label: 'Cancel' }, { label: 'Move candidate', primary: true, run: async () => {
        if (!target.value || !reason.value.trim()) { toast.error('Choose a role and add a reason.'); return false; }
        const at = new Date().toISOString(), from = a.job_id, old = a.status || 'new';
        try {
          Object.assign(a, await db.update('job_applications', a.id, { job_id: target.value, transferred_from_job_id: from, transferred_at: at, transferred_by: ctx.user.id, status: status.value }));
          await db.insert('job_application_notes', { application_id: a.id, author_id: ctx.user.id, author_name: myName(), type: 'role_transfer', content: reason.value.trim(),
            metadata: { old_job_id: from, old_job_title: jobTitle(from), new_job_id: target.value, new_job_title: jobTitle(target.value), old_status: old, new_status: status.value, transferred_at: at } }).catch(() => {});
          toast.success(`Moved to ${jobTitle(target.value)}`);
          if (open) open.layer.close();
          paint(); openApp(a);
        } catch (e) { toast.error('Move failed', { detail: e.message }); return false; }
      } }]
    });
  }
  const f = (k, v) => h('div', h('dt', k), h('dd', v));
  function exportCsv() {
    const rows = filtered();
    downloadCsv(`procyon-applications-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: 'Name', value: a => a.full_name }, { label: 'Email', value: a => a.email }, { label: 'Phone', value: a => a.phone }, { label: 'Role', value: a => jobTitle(a.job_id) },
      { label: 'Status', value: a => a.status || 'new' }, { label: 'Location', value: a => a.location }, { label: 'Current title', value: a => a.current_title }, { label: 'Current company', value: a => a.current_company },
      { label: 'Years', value: a => a.years_experience }, { label: 'LinkedIn', value: a => a.linkedin_url }, { label: 'Portfolio', value: a => a.portfolio_url }, { label: 'Applied', value: a => a.created_at }], rows);
    toast.success(`Exported ${plural(rows.length, 'application')}`);
  }
  ctx.view.keys = {
    j: () => move(1), k: () => move(-1), Enter: () => { const a = filtered()[S.cursor]; if (a) openApp(a); },
    v: () => { S.view = S.view === 'table' ? 'board' : 'table'; store.set('apps:view', S.view); paint(); }
  };
  function move(d) { if (S.view !== 'table') return; S.cursor = Math.max(0, Math.min(filtered().length - 1, S.cursor + d)); content.querySelectorAll('tbody tr').forEach((tr, i) => { tr.classList.toggle('is-cursor', i === S.cursor); if (i === S.cursor) tr.scrollIntoView({ block: 'nearest' }); }); }
  load();
  return () => { if (open) open.layer.close(); };
}
