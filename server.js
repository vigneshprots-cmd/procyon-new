// Procyon Technostructure website server.
// Zero dependencies: static files from /public, clean URLs, gzip, security headers,
// and a lead endpoint (POST /api/lead) that forwards to a webhook and/or Salesforce Web-to-Lead.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL || '';      // e.g. Zapier, Make, HubSpot or Slack webhook
const SF_WEB_TO_LEAD_OID = process.env.SF_WEB_TO_LEAD_OID || '';  // Salesforce org ID for Web-to-Lead
const CANONICAL_HOST = process.env.CANONICAL_HOST || '';          // e.g. procyonts.com (redirects www + others)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const COMPRESSIBLE = /\.(html|css|js|json|svg|txt|xml|webmanifest)$/;

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': [
    "default-src 'self'",
    // sha256 = the one-line "js" class bootstrap in index.html <head>
    "script-src 'self' 'sha256-Du+OJKJSbdUgz5nrHeWWINvez6XKDDU/tyj/5c2uvwo=' https://www.googletagmanager.com https://snap.licdn.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://www.google-analytics.com https://*.analytics.google.com https://px.ads.linkedin.com",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({}, SECURITY, headers));
  res.end(body);
}

function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
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

// ---- Lead handling ----
const hits = new Map(); // naive per-IP rate limit
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 8;
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
      email: lead.email, company: lead.company, phone: lead.phone, lead_source: 'Website',
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

function handleLead(req, res) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, JSON.stringify({ ok: false }), { 'Content-Type': 'application/json' });
  let raw = '';
  req.on('data', chunk => { raw += chunk; if (raw.length > 20000) req.destroy(); });
  req.on('end', async () => {
    let d;
    try { d = JSON.parse(raw); } catch (e) { return send(res, 400, JSON.stringify({ ok: false }), { 'Content-Type': 'application/json' }); }
    if (d.website) return send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' }); // honeypot
    const lead = {
      firstName: clean(d.firstName, 80), lastName: clean(d.lastName, 80), email: clean(d.email, 160),
      company: clean(d.company, 160), phone: clean(d.phone, 40), interest: clean(d.interest, 60),
      message: clean(d.message, 4000), page: clean(d.page, 120), utm: clean(d.utm, 1000), receivedAt: new Date().toISOString()
    };
    if (!lead.firstName || !lead.company || !lead.interest || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) {
      return send(res, 422, JSON.stringify({ ok: false }), { 'Content-Type': 'application/json' });
    }
    try { await forwardLead(lead); } catch (e) { console.error('[lead] error', e.message); }
    send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' });
  });
}

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  if (CANONICAL_HOST && host && host !== CANONICAL_HOST && !host.endsWith('.railway.app') && !host.startsWith('localhost')) {
    return send(res, 301, '', { Location: `https://${CANONICAL_HOST}${req.url}` });
  }
  if (req.url === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (req.method === 'POST' && req.url === '/api/lead') return handleLead(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });

  // Trailing-slash normalisation: /about -> /about/ is not needed; serve both.
  const file = resolveFile(req.url);
  if (file) return serveFile(req, res, file, 200);
  serveFile(req, res, path.join(ROOT, '404.html'), 404);
});

server.listen(PORT, () => console.log(`Procyon site listening on :${PORT}`));
