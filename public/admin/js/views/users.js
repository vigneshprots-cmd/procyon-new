// Users and access (admin only): invite by email with a role, pending invites, team list,
// revoke access, and the service categories each sales rep owns (sales_categories).
// Invites and revokes use the existing Supabase Edge Functions (invite-admin, delete-admin).
import { h, icon, clear, fmtDate, ago, plural } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx, staff } from '../core/ctx.js';
import { toast, modal, confirmDialog, badge, avatar, skeletonRows, errorState, pageHead, selectEl } from '../core/ui.js';
import { ROLES, LEAD_CATEGORIES } from '../core/constants.js';

const TONE = { admin: 'blue', sales: 'green', hr: 'violet' };

export async function render(main) {
  document.title = 'Users & access | Procyon Admin';
  const inviteBox = h('section.card.ecard');
  const pendingBox = h('section.card.ecard');
  const teamBox = h('section.card.ecard');
  main.append(pageHead('Users & access', 'Invite people by email. They set their own password from the invite link; nobody else ever sees it.'),
    h('div.roles', Object.entries(ROLES).map(([k, r]) => h('div.roles__i', badge(r.short, TONE[k]), h('span', r.desc)))),
    inviteBox, pendingBox, teamBox);
  let allow = [], profiles = [], cats = [], roles = [];

  async function load() {
    clear(pendingBox).append(skeletonRows(2, 3)); clear(teamBox).append(skeletonRows(4, 4));
    try {
      [allow, profiles, cats, roles] = await Promise.all([
        db.list('admin_allowlist', { order: [['added_at', false]] }),
        db.list('profiles', { order: [['created_at', false]] }),
        db.list('sales_categories'),
        db.list('user_roles', { select: 'user_id, role' }).catch(() => [])
      ]);
      paint();
    } catch (e) { clear(teamBox).append(errorState(e, load)); clear(pendingBox); }
  }
  const roleOf = (p) => {
    const r = roles.filter(x => x.user_id === p.id).map(x => x.role);
    if (r.length) return r.includes('admin') ? 'admin' : r.includes('hr') ? 'hr' : r.includes('sales') ? 'sales' : null;
    const a = allow.find(x => (x.email || '').toLowerCase() === (p.email || '').toLowerCase());
    return a ? a.role : null;
  };

  function paintInvite() {
    const email = h('input.input', { type: 'email', placeholder: 'name@procyonts.com', 'aria-label': 'Email to invite', required: true });
    const role = selectEl(Object.entries(ROLES).map(([k, r]) => ({ id: k, label: r.label })), 'sales', null, { 'aria-label': 'Role' });
    const btn = h('button.btn.btn--primary', { type: 'submit' }, icon('send', 15), 'Send invite');
    const form = h('form.invite', email, role, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const em = email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { toast.error('Enter a valid email address.'); email.focus(); return; }
      btn.disabled = true;
      try { const r = await invite(em, role.value); email.value = ''; if (!(r && r.actionLink)) toast.success(`Invite sent to ${em}`, { detail: `Role: ${ROLES[role.value].label}. The link opens ${location.host}/admin.` }); load(); }
      catch (ex) { toast.error('Invite failed', { detail: ex.message }); }
      finally { btn.disabled = false; }
    });
    clear(inviteBox).append(h('h2.ecard__t', 'Invite someone'), form,
      h('p.muted.small', 'Invite links expire. If the email does not arrive (Supabase limits invite emails per hour), the invite link is shown here to copy and send directly.'));
  }
  async function invite(email, role) {
    const r = await db.invoke('invite-admin', { email, role, redirectTo: `${location.origin}/admin/accept-invite` });
    if (r && r.actionLink) {
      const link = h('input.input.input--mono', { value: r.actionLink, readonly: true, onfocus: (e) => e.target.select() });
      modal({ title: 'Email limit reached: send this link yourself', body: h('div.form', h('p', `The invite for ${email} was created, but the email could not be sent. Copy this one-time link and send it to them directly.`), link),
        actions: [{ label: 'Copy link', primary: true, run: async () => { try { await navigator.clipboard.writeText(r.actionLink); toast.success('Link copied'); } catch (e) { link.select(); } } }] });
    }
    return r;
  }

  function paint() {
    paintInvite();
    const pending = allow.filter(a => a.invited_at && !a.accepted_at && !profiles.some(p => (p.email || '').toLowerCase() === (a.email || '').toLowerCase() && roleOf(p)));
    clear(pendingBox).append(h('h2.ecard__t', `Pending invites (${pending.length})`),
      pending.length ? h('div.tablewrap', h('table.tbl.tbl--flat', h('tbody', pending.map(a => h('tr',
        h('td', h('div.who', avatar(a.email, 28), h('div.cell2', h('b', a.email), h('small', 'Invited ' + ago(a.invited_at))))),
        h('td', badge(ROLES[a.role] ? ROLES[a.role].short : a.role, TONE[a.role] || 'grey')),
        h('td.act', h('div.rowacts',
          h('button.btn.btn--sm', { type: 'button', onclick: async (e) => { e.currentTarget.disabled = true; try { await invite(a.email, a.role); toast.success('Invite resent'); load(); } catch (ex) { toast.error('Resend failed', { detail: ex.message }); } } }, icon('refresh', 13), 'Resend'),
          h('button.btn.btn--sm.btn--ghost.danger', { type: 'button', onclick: () => revoke(a.email) }, 'Revoke')))))))) : h('p.muted.small', 'No pending invites.'));

    const team = profiles.map(p => ({ p, role: roleOf(p) })).filter(x => x.role);
    const others = profiles.filter(p => !roleOf(p));
    clear(teamBox).append(h('h2.ecard__t', `Team (${team.length})`),
      h('div.tablewrap', h('table.tbl.tbl--flat', h('thead', h('tr', h('th', 'Person'), h('th', 'Role'), h('th.hide-sm', 'Joined'), h('th', 'Lead categories'), h('th.act', ''))),
        h('tbody', team.map(({ p, role }) => h('tr',
          h('td', h('div.who', avatar(p.display_name || p.email, 30), h('div.cell2', h('b', p.display_name || p.email.split('@')[0], p.id === ctx.user.id ? h('span.muted', ' (you)') : null), h('small', p.email)))),
          h('td', badge(ROLES[role].short, TONE[role])),
          h('td.hide-sm', h('span.muted', fmtDate(p.created_at))),
          h('td', role === 'sales' || cats.some(c => c.user_id === p.id) ? catChips(p) : h('span.muted.small', role === 'admin' ? 'Sees every lead' : '—')),
          h('td.act', p.id !== ctx.user.id ? h('button.btn.btn--sm.btn--ghost.danger', { type: 'button', onclick: () => revoke(p.email) }, 'Revoke') : null)))))),
      others.length ? h('details.adv', h('summary', `${plural(others.length, 'account')} without an admin role`), h('ul.plain', others.map(p => h('li', p.email, ' · joined ', fmtDate(p.created_at))))) : null);
  }
  function catChips(p) {
    const mine = cats.filter(c => c.user_id === p.id);
    const wrap = h('div.catchips', LEAD_CATEGORIES.filter(c => c !== 'Ignored').map(c => {
      const on = mine.find(x => x.category === c);
      return h('button.chip.chip--xs' + (on ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(!!on), title: on ? `Stop routing ${c} leads to this rep` : `Route new ${c} leads to this rep`, onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try {
          if (on) await db.remove('sales_categories', [['eq', 'id', on.id]]);
          else await db.insert('sales_categories', { user_id: p.id, category: c });
          cats = await db.list('sales_categories'); paint();
        } catch (ex) { toast.error('Not saved', { detail: ex.message }); b.disabled = false; }
      } }, on ? icon('check', 11) : null, c);
    }));
    return h('div', wrap, !mine.length ? h('small.warn', 'No categories: this rep gets no auto-routed leads.') : null);
  }
  async function revoke(email) {
    if (!(await confirmDialog({ title: `Revoke access for ${email}?`, message: 'This deletes their admin account, role and invite. Their leads keep the owner id until reassigned. This cannot be undone.', confirm: 'Revoke access', danger: true }))) return;
    try { await db.invoke('delete-admin', { email }); toast.success(`${email} removed`); staff(true); load(); }
    catch (e) { toast.error('Revoke failed', { detail: e.message }); }
  }
  load();
}
