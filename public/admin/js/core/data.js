// Data layer. Views talk to `db` and `auth`; underneath is either supabase-js (live, RLS-enforced)
// or the in-memory demo engine (?demo=admin|sales|hr), which never touches the network.
// Filters are arrays of [op, column, value]; ops: eq neq gt gte lt lte in notIn is ilike.
import { SUPABASE_URL, SUPABASE_KEY, MEDIA_BUCKET } from './constants.js';

let sb = null;
let demo = null;

export function isDemo() { return !!demo; }

function demoRequested() {
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === 'off' || q === '0') { sessionStorage.removeItem('pt-admin-demo'); return null; }
    if (q) { sessionStorage.setItem('pt-admin-demo', ['admin', 'sales', 'hr'].includes(q) ? q : 'admin'); }
    return sessionStorage.getItem('pt-admin-demo');
  } catch (e) { return null; }
}

// New-style publishable keys are not JWTs: send them as `apikey` only, never as a Bearer token
// (same wrapper the existing CMS uses).
function keyFetch(input, init) {
  const headers = new Headers(typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined);
  if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (headers.get('Authorization') === `Bearer ${SUPABASE_KEY}`) headers.delete('Authorization');
  headers.set('apikey', SUPABASE_KEY);
  return fetch(input, Object.assign({}, init, { headers }));
}

export async function initData() {
  const role = demoRequested();
  if (role) {
    const mod = await import('./demo.js');
    demo = mod.createDemo(role);
    return;
  }
  if (!window.supabase || !window.supabase.createClient) throw new Error('The Supabase client could not be loaded. Check the network connection and reload.');
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: { fetch: keyFetch },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage }
  });
}

const fail = (error, fallback) => { const e = new Error((error && (error.message || error.error_description || error.msg)) || fallback || 'Request failed'); e.code = error && error.code; e.details = error; throw e; };

function applyFilters(q, filters) {
  for (const [op, col, val] of filters || []) {
    if (op === 'notIn') q = q.not(col, 'in', `(${val.map(v => `"${String(v).replace(/"/g, '')}"`).join(',')})`);
    else if (op === 'is') q = q.is(col, val);
    else q = q[op](col, val);
  }
  return q;
}
function applyOrder(q, order) {
  for (const [col, asc] of order || []) q = q.order(col, { ascending: !!asc, nullsFirst: false });
  return q;
}

export const db = {
  // All rows (pages through PostgREST's 1000-row cap). opts: { select, filters, order, limit }
  async list(table, opts = {}) {
    if (demo) return demo.list(table, opts);
    const page = 1000, max = opts.limit || 20000, out = [];
    for (let from = 0; from < max; from += page) {
      let q = sb.from(table).select(opts.select || '*');
      q = applyOrder(applyFilters(q, opts.filters), opts.order);
      const { data, error } = await q.range(from, Math.min(from + page, max) - 1);
      if (error) fail(error, `Could not load ${table}`);
      out.push(...data);
      if (data.length < page) break;
    }
    return out;
  },
  async count(table, filters) {
    if (demo) return demo.count(table, filters);
    const { count, error } = await applyFilters(sb.from(table).select('*', { count: 'exact', head: true }), filters);
    if (error) fail(error, `Could not count ${table}`);
    return count || 0;
  },
  async get(table, id, key = 'id') {
    if (demo) return demo.get(table, id, key);
    const { data, error } = await sb.from(table).select('*').eq(key, id).maybeSingle();
    if (error) fail(error, `Could not load ${table}`);
    return data;
  },
  async insert(table, row) {
    if (demo) return demo.insert(table, row);
    const { data, error } = await sb.from(table).insert(row).select().maybeSingle();
    if (error) fail(error, 'Could not create the record');
    return data || row;
  },
  // Updates by primary key and returns the saved row. Zero rows back means RLS refused it.
  async update(table, id, patch, key = 'id') {
    if (demo) return demo.update(table, id, patch, key);
    const { data, error } = await sb.from(table).update(patch).eq(key, id).select();
    if (error) fail(error, 'Could not save');
    if (!data || !data.length) fail({ message: 'Not saved: this account is not allowed to change that record.' });
    return data[0];
  },
  async upsert(table, row, onConflict) {
    if (demo) return demo.upsert(table, row, onConflict);
    const { data, error } = await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select().maybeSingle();
    if (error) fail(error, 'Could not save');
    return data || row;
  },
  async remove(table, filters) {
    if (demo) return demo.remove(table, filters);
    const { data, error } = await applyFilters(sb.from(table).delete(), filters).select();
    if (error) fail(error, 'Could not delete');
    return data || [];
  },
  // Upload to the public media bucket; returns the public URL.
  async upload(file, folder) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    if (demo) return demo.upload(file, path);
    const { error } = await sb.storage.from(MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined, cacheControl: '31536000' });
    if (error) fail(error, 'Upload failed');
    return sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  },
  async invoke(fn, body) {
    if (demo) return demo.invoke(fn, body);
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (error) {
      let msg = error.message;
      try { const j = error.context && await error.context.json(); if (j && (j.error || j.message)) msg = j.error || j.message; } catch (e) { /* keep message */ }
      fail({ message: msg });
    }
    if (data && data.error) fail({ message: data.error });
    return data;
  }
};

export const auth = {
  async session() {
    if (demo) return demo.session();
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onChange(cb) {
    if (demo) return () => {};
    const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    if (demo) return demo.session();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) fail(error, 'Could not sign in');
    return data.session;
  },
  async signOut() {
    if (demo) {
      // Leaving demo mode: reload so the real Supabase client starts fresh.
      try { sessionStorage.removeItem('pt-admin-demo'); } catch (e) { /* ignore */ }
      location.href = '/admin/login';
      return new Promise(() => {});
    }
    await sb.auth.signOut();
  },
  async resetPassword(email) {
    if (demo) return;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin/accept-invite` });
    if (error) fail(error, 'Could not send the reset email');
  },
  async setPassword(password) {
    if (demo) return;
    const { error } = await sb.auth.updateUser({ password });
    if (error) fail(error, 'Could not set the password');
  },
  async token() {
    if (demo) return 'demo';
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.access_token : null;
  }
};

// Roles come from user_roles under RLS, exactly like the existing CMS (admin > hr > sales).
export async function loadRole(userId) {
  if (demo) return demo.role;
  const rows = await db.list('user_roles', { select: 'role', filters: [['eq', 'user_id', userId], ['in', 'role', ['admin', 'hr', 'sales']]] });
  const roles = rows.map(r => r.role);
  return roles.includes('admin') ? 'admin' : roles.includes('hr') ? 'hr' : roles.includes('sales') ? 'sales' : null;
}

// Site rebuild (server endpoint). The demo simulates it.
export const site = {
  async rebuild() {
    if (demo) return demo.rebuild();
    const t = await auth.token();
    const r = await fetch('/api/admin/rebuild', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) fail({ message: j.message || (r.status === 403 ? 'Only administrators can publish the site.' : r.status === 429 ? 'Too many publish requests. Try again in a few minutes.' : 'Publishing could not start.') });
    return j;
  },
  async status() {
    if (demo) return demo.rebuildStatus();
    const t = await auth.token();
    const r = await fetch('/api/admin/rebuild/status', { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) fail({ message: 'Status unavailable' });
    return j.status;
  }
};
