// Admin console support for the Procyon site server.
//   GET  /admin, /admin/*            single-page admin shell (public/admin), never indexed or cached
//   POST /api/admin/rebuild          admin only: sync CMS content from Supabase and rebuild the static site
//   GET  /api/admin/rebuild/status   admin only: state of the current or last rebuild
// The same sync + build also runs ~30 s after start and every 30 minutes (ADMIN_AUTO_SYNC=0 disables it).
// Auth: the browser sends its Supabase access token; it is verified against Supabase Auth and the
// user_roles table (read with the user's own token, so Row Level Security applies). No service key.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'public', 'admin');
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ozuqrpwhywdmcjohkxll.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_EC_AFs10_QT8zoh0z_jepA_xrSmVBeo';
const AUTO_SYNC = process.env.ADMIN_AUTO_SYNC !== '0';
const FIRST_RUN_MS = Number(process.env.ADMIN_SYNC_DELAY_MS) || 30 * 1000;
const EVERY_MS = Number(process.env.ADMIN_SYNC_EVERY_MS) || 30 * 60 * 1000;
const STEP_TIMEOUT_MS = 10 * 60 * 1000;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg'
};
const SB_HOST = SUPABASE_URL.replace(/^https?:\/\//, '');
const HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    `connect-src 'self' https://${SB_HOST} wss://${SB_HOST}`,
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ')
};

function send(res, status, body, extra) {
  res.writeHead(status, Object.assign({}, HEADERS, extra));
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

// ---------- Static admin shell ----------
function serveAdmin(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });
  let rel;
  try { rel = decodeURIComponent(url.slice('/admin'.length)); } catch (e) { return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' }); }
  if (rel.includes('\0')) return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' });
  const file = path.normalize(path.join(ADMIN_DIR, rel));
  let target = null;
  if (file.startsWith(ADMIN_DIR + path.sep) && path.extname(file)) {
    try { if (fs.statSync(file).isFile()) target = file; } catch (e) { /* not found */ }
    if (!target) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  // Every extension-less path (/admin, /admin/leads, /admin/blog/123) is a client-side route.
  if (!target) target = path.join(ADMIN_DIR, 'index.html');
  const ext = path.extname(target).toLowerCase();
  fs.readFile(target, (err, buf) => {
    if (err) return send(res, 500, 'Admin console is not built', { 'Content-Type': 'text/plain' });
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', Vary: 'Accept-Encoding' };
    const body = req.method === 'HEAD' ? '' : buf;
    if (/\.(html|css|js|json|svg)$/.test(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && buf.length > 1024 && body) {
      return zlib.gzip(buf, (e, gz) => {
        if (e) return send(res, 200, body, headers);
        send(res, 200, gz, Object.assign(headers, { 'Content-Encoding': 'gzip' }));
      });
    }
    send(res, 200, body, headers);
  });
}

// ---------- Rate limits ----------
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some(t => now - t < 3600e3)) hits.delete(k);
  for (const [k, v] of tokenCache) if (v.exp < now) tokenCache.delete(k);
}, 10 * 60 * 1000).unref();

function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || '');
}
function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === String(req.headers.host || ''); } catch (e) { return false; }
}

// ---------- Token verification (Supabase Auth + user_roles under RLS) ----------
const tokenCache = new Map(); // sha256(token) -> { exp, result }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyAdmin(req) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(String(req.headers.authorization || '').trim());
  if (!m) return { status: 401, error: 'missing-token' };
  const token = m[1];
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = tokenCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.result;
  let result;
  try {
    const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
    const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers, signal: AbortSignal.timeout(8000) });
    if (!u.ok) result = { status: 401, error: 'invalid-token' };
    else {
      const user = await u.json();
      if (!user || !UUID.test(String(user.id))) result = { status: 401, error: 'invalid-token' };
      else {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&select=role`, { headers, signal: AbortSignal.timeout(8000) });
        const roles = r.ok ? (await r.json()).map(x => x && x.role) : [];
        result = roles.includes('admin')
          ? { ok: true, user: { id: user.id, email: user.email || '' } }
          : { status: 403, error: 'not-admin' };
      }
    }
  } catch (e) {
    return { status: 503, error: 'auth-unavailable' }; // not cached
  }
  tokenCache.set(key, { exp: Date.now() + (result.ok ? 60e3 : 15e3), result });
  return result;
}

// ---------- Sync + build pipeline (one at a time, coalescing) ----------
const STEPS = [
  { name: 'sync', label: 'Sync content from the CMS', script: 'scripts/sync-insights.js', optional: true },
  { name: 'insights', label: 'Build insights pages', script: 'scripts/build-insights.js' },
  { name: 'site', label: 'Build site pages', script: 'scripts/build.js' }
];
const state = {
  running: false, pending: null, trigger: null, by: null, startedAt: null, finishedAt: null,
  result: null, message: '', steps: [], runs: 0, log: []
};
function log(line) {
  const s = `[${new Date().toISOString()}] ${line}`;
  state.log.push(s);
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}
function runStep(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(ROOT, step.script)], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => { log(`${step.name}: timed out, stopping`); child.kill('SIGKILL'); }, STEP_TIMEOUT_MS);
    const onData = (buf) => String(buf).split(/\r?\n/).filter(Boolean).forEach(l => log(`${step.name}: ${l.slice(0, 500)}`));
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { log(`${step.name}: ${e.message}`); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ name: step.name, label: step.label, ok: code === 0, code, ms: Date.now() - started });
    });
  });
}
async function runPipeline(trigger, by) {
  if (state.running) {
    state.pending = { trigger, by };
    return false;
  }
  Object.assign(state, { running: true, trigger, by: by || null, startedAt: new Date().toISOString(), finishedAt: null, result: null, message: '', steps: [] });
  state.runs++;
  log(`rebuild started (${trigger}${by ? ', ' + by : ''})`);
  let failed = false, warn = false;
  for (const step of STEPS) {
    const r = await runStep(step);
    state.steps.push(r);
    if (!r.ok && step.optional) { warn = true; log(`${step.name}: failed (exit ${r.code}); building from the last synced content`); continue; }
    if (!r.ok) { failed = true; break; }
  }
  state.result = failed ? 'failed' : warn ? 'partial' : 'ok';
  state.message = failed ? 'The build failed. The live pages were left as they were.' : warn ? 'The CMS sync failed, so the site was rebuilt from the last synced content.' : 'The site is up to date with the CMS.';
  state.finishedAt = new Date().toISOString();
  state.running = false;
  log(`rebuild finished: ${state.result}`);
  if (state.pending) {
    const next = state.pending;
    state.pending = null;
    setImmediate(() => runPipeline(next.trigger, next.by));
  }
  return true;
}
function publicState(withLog) {
  const s = {
    running: state.running, queued: !!state.pending, trigger: state.trigger, startedAt: state.startedAt,
    finishedAt: state.finishedAt, result: state.result, message: state.message, steps: state.steps,
    totalSteps: STEPS.length, autoSync: AUTO_SYNC, intervalMinutes: Math.round(EVERY_MS / 60000)
  };
  if (withLog) s.log = state.log.slice(-60);
  return s;
}

if (AUTO_SYNC) {
  setTimeout(() => runPipeline('startup'), FIRST_RUN_MS).unref();
  setInterval(() => runPipeline('schedule'), EVERY_MS).unref();
}

// ---------- API ----------
async function handleRebuild(req, res) {
  const ip = clientIp(req);
  if (!sameSite(req)) return json(res, 403, { ok: false, error: 'bad-origin' });
  if (limited('rb:' + ip, 6, 10 * 60 * 1000)) return json(res, 429, { ok: false, error: 'rate', message: 'Too many publish requests. Try again in a few minutes.' });
  const auth = await verifyAdmin(req);
  if (!auth.ok) {
    if (limited('authfail:' + ip, 20, 10 * 60 * 1000)) return json(res, 429, { ok: false, error: 'rate' });
    return json(res, auth.status, { ok: false, error: auth.error });
  }
  req.resume();
  const started = !state.running;
  runPipeline('manual', auth.user.email || auth.user.id);
  json(res, 202, { ok: true, started, queued: !started, status: publicState(false) });
}
async function handleStatus(req, res) {
  const ip = clientIp(req);
  if (limited('st:' + ip, 240, 10 * 60 * 1000)) return json(res, 429, { ok: false, error: 'rate' });
  const auth = await verifyAdmin(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });
  json(res, 200, { ok: true, status: publicState(true) });
}

// Returns true when the request was handled here.
function handle(req, res, url) {
  if (url === '/admin' || url.startsWith('/admin/')) { serveAdmin(req, res, url); return true; }
  if (url === '/api/admin/rebuild') {
    if (req.method !== 'POST') json(res, 405, { ok: false, error: 'method' });
    else handleRebuild(req, res).catch(() => json(res, 500, { ok: false, error: 'server' }));
    return true;
  }
  if (url === '/api/admin/rebuild/status') {
    if (req.method !== 'GET') json(res, 405, { ok: false, error: 'method' });
    else handleStatus(req, res).catch(() => json(res, 500, { ok: false, error: 'server' }));
    return true;
  }
  if (url.startsWith('/api/admin/')) { json(res, 404, { ok: false, error: 'not-found' }); return true; }
  return false;
}

module.exports = { handle, runPipeline, _state: state };
