// Shared app context: signed-in user, role, staff directory and navigation hooks set by app.js.
import { db } from './data.js';

export const ctx = {
  user: null,
  role: null,
  get isAdmin() { return this.role === 'admin'; },
  get isSales() { return this.role === 'sales'; },
  get isHR() { return this.role === 'hr'; },
  can(roles) { return !roles || roles.includes(this.role); },
  go: (path) => { history.pushState(null, '', path); dispatchEvent(new PopStateEvent('popstate')); },
  // A view can register: onNew (the "n" shortcut), keys ({ key: fn }), dirty() for unsaved-change prompts.
  view: { onNew: null, keys: null, dirty: null },
  publishHint: null
};

let staffCache = null, staffAt = 0;
export async function staff(force) {
  if (!force && staffCache && Date.now() - staffAt < 120e3) return staffCache;
  try {
    staffCache = await db.list('profiles', { select: 'id, email, display_name, created_at', order: [['display_name', true]] });
  } catch (e) { staffCache = staffCache || []; }
  staffAt = Date.now();
  return staffCache;
}
export function staffName(id, list) {
  if (!id) return '';
  const p = (list || staffCache || []).find(x => x.id === id);
  return p ? (p.display_name || (p.email || '').split('@')[0]) : 'Unknown user';
}
export function myName() {
  const u = ctx.user || {};
  const md = u.user_metadata || {};
  const p = (staffCache || []).find(x => x.id === u.id);
  return (p && p.display_name) || md.display_name || md.full_name || (u.email || '').split('@')[0] || 'Staff member';
}
