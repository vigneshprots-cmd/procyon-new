// Procyon Technostructure website server.
// Zero dependencies: static files from /public, clean URLs, gzip, security headers,
// and a bot-resistant lead endpoint (POST /api/lead) that forwards to a webhook and/or Salesforce Web-to-Lead.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const dns = require('dns').promises;

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL || '';      // e.g. Zapier, Make, HubSpot or Slack webhook
const SF_WEB_TO_LEAD_OID = process.env.SF_WEB_TO_LEAD_OID || '';  // Salesforce org ID for Web-to-Lead
const APPLY_WEBHOOK_URL = process.env.APPLY_WEBHOOK_URL || '';    // where job applications go (never Web-to-Lead)
const CANONICAL_HOST = process.env.CANONICAL_HOST || '';          // e.g. procyonts.com (redirects www + others)
const FORM_SECRET = process.env.FORM_SECRET || crypto.randomBytes(32).toString('hex'); // signs form tokens
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || '';  // optional Cloudflare Turnstile
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE = !!(TURNSTILE_SITE_KEY && TURNSTILE_SECRET);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const COMPRESSIBLE = /\.(html|css|js|json|svg|txt|xml|webmanifest)$/;

const CF = TURNSTILE ? ' https://challenges.cloudflare.com' : '';
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    // sha256 = the one-line "js" class bootstrap in every page <head>
    "script-src 'self' 'sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo=' https://www.googletagmanager.com https://snap.licdn.com" + CF,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://px.ads.linkedin.com" + CF,
    "frame-src 'self'" + CF,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, SECURITY, headers));
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch (e) { return null; }
  if (p.includes('\0')) return null;
  const safe = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const base = path.join(ROOT, safe);
  if (!base.startsWith(ROOT)) return null;
  const candidates = [base, base + '.html', path.join(base, 'index.html')];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch (e) { /* next */ }
  }
  return null;
}

function serveFile(req, res, file, status) {
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const headers = {
    'Content-Type': type,
    'Cache-Control': isHtml ? 'no-cache' : (/\/assets\//.test(file.replace(/\\/g, '/')) ? 'public, max-age=604800' : 'public, max-age=86400'),
    'Vary': 'Accept-Encoding'
  };
  const accept = req.headers['accept-encoding'] || '';
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 500, 'Server error', { 'Content-Type': 'text/plain' });
    if (COMPRESSIBLE.test(ext) && /\bgzip\b/.test(accept) && buf.length > 1024) {
      zlib.gzip(buf, (e, gz) => {
        if (e) return send(res, status, req.method === 'HEAD' ? '' : buf, headers);
        headers['Content-Encoding'] = 'gzip';
        send(res, status, req.method === 'HEAD' ? '' : gz, headers);
      });
    } else {
      send(res, status, req.method === 'HEAD' ? '' : buf, headers);
    }
  });
}

/* =====================================================================
   Lead protection
   1. Signed, single-use form token (issued when a form opens).
   2. Time trap: a form submitted under 3 seconds after opening is a bot.
   3. Honeypot field.
   4. Business email only, disposable domains blocked, real MX record required.
   5. Name, phone, link and spam-phrase checks.
   6. Rate limits per IP and per email.
   7. Optional Cloudflare Turnstile.
   Bot signals get a silent 200 so bots learn nothing; humans get clear messages.
   ===================================================================== */
const MIN_FILL_MS = 3000;
const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000;
const usedNonces = new Map();
const sign = (s) => crypto.createHmac('sha256', FORM_SECRET).update(s).digest('base64url');

function makeToken() {
  const ts = Date.now();
  const nonce = crypto.randomBytes(9).toString('base64url');
  return `${ts}.${nonce}.${sign(ts + '.' + nonce)}`;
}
// Returns null when valid, otherwise a reason string.
function checkToken(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3) return 'token-missing';
  const [ts, nonce, sig] = parts;
  const want = Buffer.from(sign(ts + '.' + nonce));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return 'token-bad';
  const age = Date.now() - Number(ts);
  if (!(age >= 0)) return 'token-bad';
  if (age < MIN_FILL_MS) return 'too-fast';
  if (age > MAX_TOKEN_AGE_MS) return 'expired';
  if (usedNonces.has(nonce)) return 'token-reused';
  usedNonces.set(nonce, Date.now() + MAX_TOKEN_AGE_MS);
  return null;
}

const FREE_MAIL = new Set(('gmail.com googlemail.com yahoo.com yahoo.co.in yahoo.co.uk ymail.com rocketmail.com hotmail.com hotmail.co.uk outlook.com outlook.in live.com live.in msn.com ' +
  'aol.com icloud.com me.com mac.com proton.me protonmail.com pm.me gmx.com gmx.de gmx.net mail.com yandex.com yandex.ru zoho.com zohomail.com ' +
  'rediffmail.com rediff.com inbox.com hushmail.com fastmail.com tutanota.com tuta.io qq.com 163.com 126.com sina.com naver.com web.de').split(' '));
const DISPOSABLE = new Set(('mailinator.com guerrillamail.com guerrillamail.net sharklasers.com grr.la 10minutemail.com 10minutemail.net tempmail.com temp-mail.org temp-mail.io ' +
  'tempmail.net tempmailo.com tempr.email throwawaymail.com yopmail.com yopmail.net yopmail.fr getnada.com nada.email dispostable.com maildrop.cc mailnesia.com ' +
  'trashmail.com trashmail.de trash-mail.com fakeinbox.com fakemail.net mintemail.com mohmal.com emailondeck.com spamgourmet.com mailcatch.com moakt.com ' +
  'burnermail.io mailpoof.com getairmail.com inboxkitten.com mail.tm mailsac.com discard.email spambox.us emailfake.com email-fake.com crazymailing.com ' +
  'harakirimail.com mytemp.email tmpmail.org tmpmail.net linshiyouxiang.net 33mail.com anonaddy.me simplelogin.com duck.com firemail.cc wegwerfmail.de ' +
  'mvrht.com spam4.me byom.de').split(' '));
const SPAM_RE = /\b(viagra|cialis|casino|gambling|betting|crypto ?currency|bitcoin|forex|binary options|payday loan|seo (services|agency|expert)|backlinks?|guest post|rank (your|ur) (site|website)|first page of google|web design (services|company)|essay writing|porn|escort|adult dating|cbd oil)\b/i;
const LINK_RE = /(https?:\/\/|www\.)/gi;

const mxCache = new Map();
async function hasMailServer(domain) {
  const hit = mxCache.get(domain);
  if (hit && hit.exp > Date.now()) return hit.ok;
  let ok;
  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), 2500))
    ]);
    ok = Array.isArray(mx) && mx.some(r => r.exchange && r.exchange !== '.');
  } catch (e) {
    // Only a definite "does not exist / no MX" counts as invalid; DNS hiccups fail open.
    ok = !(e.code === 'ENOTFOUND' || e.code === 'ENODATA' || e.code === 'NXDOMAIN');
  }
  mxCache.set(domain, { ok, exp: Date.now() + 6 * 60 * 60 * 1000 });
  return ok;
}

async function turnstileOk(token, ip) {
  if (!TURNSTILE) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip })
    });
    const j = await r.json();
    return !!j.success;
  } catch (e) { return true; } // Cloudflare unreachable: do not block real buyers
}

// Rate limits
const ipHits = new Map(), mailHits = new Map(), tokenHits = new Map();
function over(map, key, max, windowMs) {
  const now = Date.now();
  const list = (map.get(key) || []).filter(t => now - t < windowMs);
  list.push(now);
  map.set(key, list);
  return list.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of usedNonces) if (exp < now) usedNonces.delete(k);
  for (const m of [ipHits, mailHits, tokenHits]) for (const [k, list] of m) if (!list.some(t => now - t < 24 * 3600e3)) m.delete(k);
}, 15 * 60 * 1000).unref();

// Railway's proxy appends the real client address as the last X-Forwarded-For hop.
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || '');
}
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

async function forwardLead(lead) {
  const jobs = [];
  if (LEAD_WEBHOOK_URL) {
    jobs.push(fetch(LEAD_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }));
  }
  if (SF_WEB_TO_LEAD_OID) {
    const body = new URLSearchParams({
      oid: SF_WEB_TO_LEAD_OID, first_name: lead.firstName, last_name: lead.lastName || '(not given)',
      email: lead.email, company: lead.company || '(not given)', phone: lead.phone, lead_source: 'Website',
      description: `Interest: ${lead.interest}\n\n${lead.message}\n\nPage: ${lead.page}\nUTM: ${lead.utm}`
    });
    jobs.push(fetch('https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8', { method: 'POST', body }));
  }
  if (!jobs.length) {
    // No destination configured yet: keep the lead in the platform logs so it is not lost.
    console.log('[lead]', JSON.stringify(lead));
    return;
  }
  const results = await Promise.allSettled(jobs);
  results.forEach(r => { if (r.status === 'rejected') console.error('[lead] forward failed:', r.reason && r.reason.message); });
  console.log('[lead] received', lead.interest, new Date().toISOString());
}

function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // older browsers; the signed token still gates the request
  try { return new URL(origin).host === String(req.headers.host || ''); } catch (e) { return false; }
}

function handleToken(req, res) {
  const ip = clientIp(req);
  if (over(tokenHits, ip, 60, 10 * 60 * 1000)) return json(res, 429, { ok: false });
  json(res, 200, { t: makeToken(), site: TURNSTILE ? TURNSTILE_SITE_KEY : '' });
}

function handleLead(req, res) {
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '');
  const drop = (reason, extra) => {
    console.log('[spam]', reason, JSON.stringify(Object.assign({ ip }, extra || {})));
    json(res, 200, { ok: true });
  };
  const reject = (status, error, message) => json(res, status, { ok: false, error, message });

  if (!ua || ua.length < 10) return reject(400, 'bad-request', '');
  if (!sameSite(req)) return reject(403, 'bad-origin', '');
  if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return reject(415, 'bad-type', '');
  if (over(ipHits, ip, 5, 10 * 60 * 1000)) return reject(429, 'rate', 'Too many requests. Please email sales@procyonts.com.');

  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 20000) req.destroy(); });
  req.on('end', async () => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return reject(400, 'bad-request', ''); }

    if (d.website) return drop('honeypot');
    const tokenProblem = checkToken(d.ft);
    if (tokenProblem === 'expired') return reject(409, 'expired', 'Your session timed out. Please submit again.');
    if (tokenProblem) return drop(tokenProblem);

    const lead = {
      firstName: clean(d.firstName, 80), lastName: clean(d.lastName, 80), email: clean(d.email, 160).toLowerCase(),
      company: clean(d.company, 160), phone: clean(d.phone, 40), interest: clean(d.interest, 80),
      message: clean(d.message, 4000), page: clean(d.page, 160), utm: clean(d.utm, 1000), receivedAt: new Date().toISOString()
    };

    // Shapes humans never produce: silent drop.
    const fullName = (lead.firstName + ' ' + lead.lastName).trim();
    if (/https?:|www\.|[<>{}]/i.test(fullName + lead.company) || /\d{3,}/.test(fullName)) return drop('name-shape', { email: lead.email });
    if ((lead.message.match(LINK_RE) || []).length > 2 || SPAM_RE.test(lead.message + ' ' + lead.company)) return drop('spam-content', { email: lead.email });

    // Fixable by a human: clear message.
    if (!lead.firstName || !lead.company || !lead.interest) return reject(422, 'missing', 'Please complete the required fields.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) return reject(422, 'email', 'Please enter a valid business email.');
    const domain = lead.email.split('@')[1];
    if (FREE_MAIL.has(domain)) return reject(422, 'free-email', 'Please use your business email address.');
    if (DISPOSABLE.has(domain)) return reject(422, 'disposable', 'Please use your company email address.');
    if (lead.phone) {
      const digits = lead.phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return reject(422, 'phone', 'Please enter a valid phone number.');
    }
    if (!(await hasMailServer(domain))) return reject(422, 'no-mx', 'That email domain cannot receive mail. Please check it.');
    if (!(await turnstileOk(d.cf, ip))) return reject(422, 'captcha', 'Please complete the verification and submit again.');
    if (over(mailHits, lead.email, 3, 24 * 3600e3)) return drop('email-rate', { email: lead.email });

    try { await forwardLead(lead); } catch (e) { console.error('[lead] error', e.message); }
    json(res, 200, { ok: true });
  });
}

// Job applications: same bot defences as leads, but personal email is allowed
// and nothing is sent to Salesforce Web-to-Lead (candidates are not sales leads).
const TRACKS = new Set(['Salesforce', 'ServiceNow', 'AI and data', 'Product engineering', 'Delivery and project management', 'Other',
  'AI Architect (Java Background with AI Fundamentals)', 'Full Stack Developer (Backend-Focused)', 'QA Engineer (Manual + API Testing)', 'Content & Copy Writer']);
const HUBS = new Set(['Novato, California', 'Toronto, Canada', 'Chennai, India', 'Open to any hub']);
function handleApply(req, res) {
  const ip = clientIp(req);
  const ua = String(req.headers['user-agent'] || '');
  const drop = (reason, extra) => { console.log('[spam] apply', reason, JSON.stringify(Object.assign({ ip }, extra || {}))); json(res, 200, { ok: true }); };
  const reject = (status, error, message) => json(res, status, { ok: false, error, message });
  if (!ua || ua.length < 10) return reject(400, 'bad-request', '');
  if (!sameSite(req)) return reject(403, 'bad-origin', '');
  if (!/application\/json/i.test(String(req.headers['content-type'] || ''))) return reject(415, 'bad-type', '');
  if (over(ipHits, ip, 5, 10 * 60 * 1000)) return reject(429, 'rate', 'Too many requests. Please try again later.');
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 20000) req.destroy(); });
  req.on('end', async () => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return reject(400, 'bad-request', ''); }
    if (d.website) return drop('honeypot');
    const tokenProblem = checkToken(d.ft);
    if (tokenProblem === 'expired') return reject(409, 'expired', 'Your session timed out. Please submit again.');
    if (tokenProblem) return drop(tokenProblem);
    const app = {
      type: 'application', name: clean(d.name, 120), email: clean(d.email, 160).toLowerCase(), phone: clean(d.phone, 40),
      track: clean(d.track, 60), hub: clean(d.hub, 60), profile: clean(d.profile, 200), message: clean(d.message, 3000),
      page: clean(d.page, 160), receivedAt: new Date().toISOString()
    };
    if (/https?:|www\.|[<>{}]/i.test(app.name) || /\d{3,}/.test(app.name)) return drop('name-shape', { email: app.email });
    if ((app.message.match(LINK_RE) || []).length > 2 || SPAM_RE.test(app.message)) return drop('spam-content', { email: app.email });
    if (!app.name || !TRACKS.has(app.track)) return reject(422, 'missing', 'Please complete the required fields.');
    if (app.hub && !HUBS.has(app.hub)) return reject(422, 'missing', 'Please choose a hub from the list.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(app.email)) return reject(422, 'email', 'Please enter a valid email address.');
    const domain = app.email.split('@')[1];
    if (DISPOSABLE.has(domain)) return reject(422, 'disposable', 'Please use a permanent email address.');
    if (app.phone) {
      const digits = app.phone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15 || /^(\d)\1+$/.test(digits)) return reject(422, 'phone', 'Please enter a valid phone number.');
    }
    if (app.profile && !/^https:\/\/\S+\.\S{2,}/i.test(app.profile)) return reject(422, 'profile', 'Please paste a full https:// link to a LinkedIn profile or portfolio.');
    if (!(await hasMailServer(domain))) return reject(422, 'no-mx', 'That email domain cannot receive mail. Please check it.');
    if (!(await turnstileOk(d.cf, ip))) return reject(422, 'captcha', 'Please complete the verification and submit again.');
    if (over(mailHits, 'apply:' + app.email, 2, 24 * 3600e3)) return drop('email-rate', { email: app.email });
    try {
      if (APPLY_WEBHOOK_URL) {
        const r = await fetch(APPLY_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(app) });
        console.log('[apply] received', app.track, r.status);
      } else console.log('[apply]', JSON.stringify(app));
    } catch (e) { console.error('[apply] forward failed', e.message); console.log('[apply]', JSON.stringify(app)); }
    json(res, 200, { ok: true });
  });
}

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && !host.endsWith('.railway.app') && !host.startsWith('localhost')) {
    return send(res, 301, '', { Location: `https://${CANONICAL_HOST}${req.url}` });
  }
  const url = req.url.split('?')[0];
  if (url === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (req.method === 'GET' && url === '/api/form-token') return handleToken(req, res);
  if (req.method === 'POST' && url === '/api/lead') return handleLead(req, res);
  if (req.method === 'POST' && url === '/api/apply') return handleApply(req, res);
  if (url.startsWith('/api/')) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });

  const file = resolveFile(req.url);
  if (file) return serveFile(req, res, file, 200);
  serveFile(req, res, path.join(ROOT, '404.html'), 404);
});

server.listen(PORT, () => console.log(`Procyon site listening on :${PORT}${TURNSTILE ? ' (Turnstile on)' : ''}`));
