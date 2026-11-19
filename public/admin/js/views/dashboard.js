// Dashboard: role-aware KPIs, lead charts (inline SVG), needs-attention list and recent activity.
import { h, icon, clear, ago, fmtNum, fmtDate, plural } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx, staff, staffName, myName } from '../core/ctx.js';
import { skeletonCards, errorState, segmented, badge, avatar, pageHead } from '../core/ui.js';
import { LEAD_STATUSES, OPEN_LEAD, statusOf, ACTIVITY_TYPES } from '../core/constants.js';

const DAY = 864e5;
const TONE = { blue: '#28A8DE', amber: '#E0A33A', violet: '#7C6BD6', green: '#39B34A', red: '#BC1E2D', grey: '#A9ADB3' };

export async function render(main) {
  document.title = 'Dashboard | Procyon Admin';
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${myName().split(' ')[0]}`;
  const body = h('div.dash');
  main.append(pageHead(hello, ctx.isHR ? 'Hiring at a glance.' : ctx.isSales ? 'Your pipeline at a glance.' : 'Pipeline, hiring and content at a glance.'), body);
  body.append(skeletonCards(4), skeletonCards(4));
  const load = async () => {
    try {
      const wantsLeads = ctx.can(['admin', 'sales']), wantsHR = ctx.can(['admin', 'hr']);
      const [people, leads, acts, meetings, apps, notes, jobs, posts] = await Promise.all([
        staff(),
        wantsLeads ? db.list('leads', { select: 'id, first_name, last_name, company, email, status, owner_id, follow_up_at, created_at, updated_at, source, requirement, category', order: [['created_at', false]] }) : [],
        wantsLeads ? db.list('lead_activities', { order: [['occurred_at', false]], limit: 40 }) : [],
        wantsLeads ? db.list('event_meeting_requests', { select: 'id, full_name, company, event_title, status, created_at', order: [['created_at', false]] }) : [],
        wantsHR ? db.list('job_applications', { select: 'id, full_name, job_id, status, created_at', order: [['created_at', false]] }) : [],
        wantsHR ? db.list('job_application_notes', { order: [['created_at', false]], limit: 20 }) : [],
        wantsHR ? db.list('jobs', { select: 'id, title, is_open, is_published' }) : [],
        ctx.isAdmin ? db.list('blog_posts', { select: 'id, title, status, updated_at', order: [['updated_at', false]], limit: 5 }) : []
      ]);
      clear(body);
      paint(body, { people, leads, acts, meetings, apps, notes, jobs, posts });
    } catch (e) { clear(body).append(errorState(e, load)); }
  };
  load();
}

function paint(body, d) {
  const now = Date.now();
  const since = (n) => now - n * DAY;
  const t = (x) => new Date(x).getTime();
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const me = ctx.user.id;
  const leads = ctx.isSales ? d.leads : d.leads;
  const open = leads.filter(l => OPEN_LEAD(l.status));
  const kpis = [];
  if (ctx.can(['admin', 'sales'])) {
    const n7 = leads.filter(l => t(l.created_at) >= since(7)).length;
    const n30 = leads.filter(l => t(l.created_at) >= since(30)).length;
    const prev30 = leads.filter(l => t(l.created_at) >= since(60) && t(l.created_at) < since(30)).length;
    const overdue = open.filter(l => l.follow_up_at && t(l.follow_up_at) < now);
    const unassigned = open.filter(l => !l.owner_id);
    const wonMonth = leads.filter(l => l.status === 'won' && t(l.updated_at) >= monthStart.getTime());
    kpis.push(
      kpi('New leads, 7 days', n7, `${fmtNum(n30)} in 30 days`, '/admin/leads?created=7', 'leads', delta(n30, prev30)),
      kpi('Open pipeline', open.length, ctx.isSales ? `${open.filter(l => l.owner_id === me).length} owned by you` : `${plural(new Set(open.map(l => l.owner_id).filter(Boolean)).size, 'owner')}`, '/admin/leads?status=open', 'kanban'),
      kpi('Unassigned', unassigned.length, unassigned.length ? 'Open leads with no owner' : 'Every open lead has an owner', '/admin/leads?owner=none', 'assign', null, unassigned.length ? 'warn' : ''),
      kpi('Overdue follow-ups', overdue.length, overdue.length ? (() => { const n = overdue.filter(l => l.owner_id === me).length; return n === 1 ? '1 is yours' : `${n} are yours`; })() : 'Nothing overdue', '/admin/leads?view=overdue', 'clock', null, overdue.length ? 'bad' : ''),
      kpi('Won this month', wonMonth.length, monthStart.toLocaleDateString('en-US', { month: 'long' }), '/admin/leads?status=won', 'award', null, wonMonth.length ? 'good' : ''),
      kpi('Meeting requests', d.meetings.filter(m => m.status === 'new').length, `${d.meetings.filter(m => t(m.created_at) >= since(30)).length} received in 30 days`, '/admin/meeting-requests?status=new', 'calendar')
    );
  }
  if (ctx.can(['admin', 'hr'])) {
    kpis.push(
      kpi('New applications', d.apps.filter(a => (a.status || 'new') === 'new').length, `${d.apps.filter(a => t(a.created_at) >= since(30)).length} in 30 days`, '/admin/applications?status=new', 'apps'),
      kpi('Open roles', d.jobs.filter(j => j.is_open && j.is_published).length, `${d.jobs.length} job posts in total`, '/admin/careers', 'briefcase')
    );
  }
  body.append(h('div.kpis', kpis));

  if (ctx.can(['admin', 'sales'])) {
    // Pipeline bar + charts
    const counts = LEAD_STATUSES.map(s => ({ s, n: leads.filter(l => l.status === s.id).length }));
    const total = counts.reduce((a, b) => a + b.n, 0) || 1;
    const pipe = h('div.card',
      h('div.card__head', h('h2', 'Pipeline by status'), h('a.card__link', { href: '/admin/leads?view=board' }, 'Open board ', icon('chevronRight', 14))),
      h('div.stackbar', { role: 'img', 'aria-label': counts.map(c => `${c.s.label} ${c.n}`).join(', ') }, counts.filter(c => c.n).map(c => h('span', { style: { width: (c.n / total * 100) + '%', background: TONE[c.s.tone] }, title: `${c.s.label}: ${c.n}` }))),
      h('ul.legend', counts.map(c => h('li', h('a', { href: '/admin/leads?status=' + c.s.id }, h('i', { style: { background: TONE[c.s.tone] } }), c.s.label, h('b', fmtNum(c.n)))))));

    const chartBox = h('div.chartbox');
    const range = leads.filter(l => t(l.created_at) >= since(90));
    const drawBars = (by) => {
      const key = by === 'source' ? (l) => prettySource(l.source) : (l) => l.requirement || l.category || 'Not stated';
      const m = new Map();
      range.forEach(l => m.set(key(l), (m.get(key(l)) || 0) + 1));
      clear(chartBox).append(range.length ? barChart([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) : h('p.muted.pad', 'No leads in the last 90 days.'));
    };
    const chart = h('div.card',
      h('div.card__head', h('h2', 'Leads, last 90 days'), segmented([{ id: 'interest', label: 'Interest' }, { id: 'source', label: 'Source' }], 'interest', drawBars, 'Group leads by')),
      chartBox);
    drawBars('interest');
    const weekly = h('div.card', h('div.card__head', h('h2', 'New leads per week'), h('span.muted', '12 weeks')), weekChart(leads));
    body.append(h('div.grid3', pipe, chart, weekly));
  }

  // Needs attention + activity
  const cols = [];
  if (ctx.can(['admin', 'sales'])) {
    const due = d.leads.filter(l => OPEN_LEAD(l.status) && l.follow_up_at && t(l.follow_up_at) < now + 2 * DAY)
      .sort((a, b) => t(a.follow_up_at) - t(b.follow_up_at))
      .filter(l => !ctx.isSales || l.owner_id === me || !l.owner_id).slice(0, 7);
    cols.push(h('div.card',
      h('div.card__head', h('h2', 'Follow-ups due'), h('a.card__link', { href: '/admin/leads?view=overdue' }, 'All overdue ', icon('chevronRight', 14))),
      due.length ? h('ul.tasks', due.map(l => {
        const late = t(l.follow_up_at) < now;
        return h('li', h('a', { href: '/admin/leads/' + l.id }, avatar(`${l.first_name} ${l.last_name || ''}`, 30),
          h('span.tasks__t', h('b', `${l.first_name} ${l.last_name || ''}`.trim()), h('small', [l.company, staffName(l.owner_id, d.people) || 'Unassigned'].filter(Boolean).join(' · '))),
          h('span.tasks__due' + (late ? '.is-late' : ''), late ? 'Overdue ' + ago(l.follow_up_at).replace(' ago', '') : 'Due ' + ago(l.follow_up_at))));
      })) : h('div.empty.empty--sm', h('div.empty__ic', icon('check', 20)), h('p', 'No follow-ups due in the next two days.'))));
  }
  cols.push(h('div.card', h('div.card__head', h('h2', 'Recent activity')), feed(d)));
  if (ctx.isAdmin && d.posts.length) {
    cols.push(h('div.card', h('div.card__head', h('h2', 'Recently edited content'), h('a.card__link', { href: '/admin/blog' }, 'Blog ', icon('chevronRight', 14))),
      h('ul.tasks', d.posts.map(p => h('li', h('a', { href: '/admin/blog/' + p.id }, h('span.tasks__ic', icon('blog', 16)), h('span.tasks__t', h('b', p.title), h('small', 'Edited ' + ago(p.updated_at))), badge(p.status === 'published' ? 'Published' : 'Draft', p.status === 'published' ? 'green' : 'amber')))))));
  }
  body.append(h('div.grid3.grid3--feed', cols));
}

function kpi(label, value, sub, href, ic, deltaEl, tone) {
  return h('a.kpi' + (tone ? '.kpi--' + tone : ''), { href },
    h('span.kpi__l', icon(ic, 15), label), h('span.kpi__v', fmtNum(value), deltaEl || null), h('span.kpi__s', sub));
}
function delta(now, before) {
  if (!before && !now) return null;
  const pct = before ? Math.round((now - before) / before * 100) : 100;
  return h('span.delta' + (pct >= 0 ? '.is-up' : '.is-down'), { title: `30 days vs the 30 days before (${before})` }, (pct >= 0 ? '+' : '') + pct + '%');
}
export function prettySource(s) {
  if (!s) return 'Unknown';
  return String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function barChart(rows) {
  const max = Math.max(...rows.map(r => r[1]), 1);
  const W = 420, rowH = 30, labelW = 150, H = rows.length * rowH + 4;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'bars'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', rows.map(r => `${r[0]}: ${r[1]}`).join(', '));
  rows.forEach(([label, n], i) => {
    const y = i * rowH + 4, w = Math.max(3, (W - labelW - 40) * n / max);
    const g = document.createElementNS(ns, 'g');
    g.innerHTML = `<title>${escapeXml(label)}: ${n}</title><text x="0" y="${y + 15}" class="bars__l">${escapeXml(label.length > 22 ? label.slice(0, 21) + '…' : label)}</text>` +
      `<rect x="${labelW}" y="${y + 3}" width="${w}" height="16" rx="4" class="bars__b" style="fill:${i === 0 ? '#28A8DE' : i === 1 ? '#39B34A' : '#9ED5EE'}"></rect>` +
      `<text x="${labelW + w + 6}" y="${y + 15}" class="bars__n">${n}</text>`;
    svg.appendChild(g);
  });
  return svg;
}
function weekChart(leads) {
  const weeks = 12, now = new Date(); now.setHours(23, 59, 59, 999);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ end: now.getTime() - (weeks - 1 - i) * 7 * DAY, n: 0, won: 0 }));
  leads.forEach(l => {
    const tt = new Date(l.created_at).getTime();
    const b = buckets.find(b => tt <= b.end && tt > b.end - 7 * DAY);
    if (b) { b.n++; if (l.status === 'won') b.won++; }
  });
  const max = Math.max(...buckets.map(b => b.n), 1);
  const W = 420, H = 150, pad = 22, bw = (W - pad) / weeks;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H + 22}`); svg.setAttribute('class', 'cols'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'New leads per week: ' + buckets.map(b => b.n).join(', '));
  let html = `<line x1="${pad}" x2="${W}" y1="${H}" y2="${H}" class="cols__axis"/>`;
  [0.5, 1].forEach(f => { html += `<line x1="${pad}" x2="${W}" y1="${H - H * f * 0.9}" y2="${H - H * f * 0.9}" class="cols__grid"/><text x="0" y="${H - H * f * 0.9 + 4}" class="cols__y">${Math.round(max * f)}</text>`; });
  buckets.forEach((b, i) => {
    const x = pad + i * bw + bw * 0.18, w = bw * 0.64, hh = H * 0.9 * b.n / max, hw = H * 0.9 * b.won / max;
    const label = new Date(b.end - 6 * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    html += `<g><title>Week of ${label}: ${b.n} new, ${b.won} won</title><rect x="${x}" y="${H - hh}" width="${w}" height="${hh}" rx="3" class="cols__b"/>` +
      (hw ? `<rect x="${x}" y="${H - hw}" width="${w}" height="${hw}" rx="3" class="cols__w"/>` : '') +
      (i % 3 === 2 || i === weeks - 1 ? `<text x="${x + w / 2}" y="${H + 16}" text-anchor="middle" class="cols__x">${label}</text>` : '') + '</g>';
  });
  svg.innerHTML = html;
  return h('div', svg, h('ul.legend.legend--sm', h('li', h('i', { style: { background: '#9ED5EE' } }), 'New'), h('li', h('i', { style: { background: '#39B34A' } }), 'Now won')));
}
const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function feed(d) {
  const items = [];
  const leadName = (id) => { const l = d.leads.find(x => x.id === id); return l ? `${l.first_name} ${l.last_name || ''}`.trim() : 'a lead'; };
  d.acts.forEach(a => items.push({ at: a.occurred_at, icon: (ACTIVITY_TYPES[a.type] || {}).icon || 'note', text: [h('b', staffName(a.user_id, d.people) || 'Someone'), ` ${verb(a)} `, h('a', { href: '/admin/leads/' + a.lead_id }, leadName(a.lead_id))], sub: a.subject || '' }));
  d.leads.slice(0, 15).forEach(l => items.push({ at: l.created_at, icon: 'leads', text: ['New lead ', h('a', { href: '/admin/leads/' + l.id }, `${l.first_name} ${l.last_name || ''}`.trim())], sub: [l.company, l.requirement].filter(Boolean).join(' · ') }));
  d.meetings.slice(0, 10).forEach(m => items.push({ at: m.created_at, icon: 'calendar', text: ['Meeting request from ', h('a', { href: '/admin/meeting-requests?open=' + m.id }, m.full_name)], sub: m.event_title || '' }));
  d.apps.slice(0, 10).forEach(a => items.push({ at: a.created_at, icon: 'apps', text: ['Application from ', h('a', { href: '/admin/applications?open=' + a.id }, a.full_name)], sub: (d.jobs.find(j => j.id === a.job_id) || {}).title || '' }));
  d.notes.forEach(n => items.push({ at: n.created_at, icon: 'note', text: [h('b', n.author_name || 'Recruiter'), ' added a ', n.type === 'role_transfer' ? 'role transfer' : n.type, ' on ', h('a', { href: '/admin/applications?open=' + n.application_id }, 'an application')], sub: String(n.content || '').slice(0, 90) }));
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  if (!items.length) return h('div.empty.empty--sm', h('p', 'Nothing has happened yet.'));
  return h('ul.feed', items.slice(0, 14).map(i => h('li', h('span.feed__ic', icon(i.icon, 14)), h('div', h('p', i.text), h('small', [ago(i.at), i.sub].filter(Boolean).join(' · '))))));
}
function verb(a) {
  return { note: 'added a note on', call: 'logged a call with', email: 'logged an email to', meeting: 'logged a meeting with', status_change: 'changed the status of', assignment: 'reassigned' }[a.type] || 'updated';
}
export { fmtDate };
