#!/usr/bin/env node
// Social share images: one unique 1200x630 JPG per page in public/assets/img/og/<slug-with-dashes>.jpg
// (home page = home.jpg). Reads every page meta in src/pages/** (run build-insights first so
// src/pages/_gen exists) plus content/insights/*.json, draws an SVG per page and renders it with sharp.
// Unchanged images are skipped through a content hash cache (public/assets/img/og/.hash.json).
//
// usage: node scripts/og-images.js <path-to-sharp> [--force] [--only <text>] [--keep]
//   --force  re-render everything     --only  render pages whose slug contains <text>
//   --keep   do not delete JPGs in the og folder that no page uses
// sharp is not a project dependency: the JPGs are committed, so production never needs it.
// Text is set in Montserrat; the installed TTFs are also read for line-breaking metrics
// (set OG_FONT_DIR when they live somewhere unusual).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src', 'pages');
const DATA = path.join(ROOT, 'content', 'insights');
const OUT = path.join(PUB, 'assets', 'img', 'og');
const CACHE = path.join(OUT, '.hash.json');
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const KEEP = args.includes('--keep');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const sharpPath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--only');
let sharp;
try { sharp = require(sharpPath || 'sharp'); } catch (e) {
  console.error('sharp not found. usage: node scripts/og-images.js <path-to-sharp>');
  process.exit(1);
}

// ---------- Brand ----------
const W = 1200, H = 630, M = 64, BAND = 110, BAND_Y = H - BAND;
const C = {
  blue: '#28A8DE', green: '#39B34A', red: '#BC1E2D', grey: '#808285',
  night: '#0B0D10', night2: '#13161A', night3: '#1B1F24', line: '#262B31', text: '#A7AEB6', white: '#FFFFFF'
};
// Per-section look. motif: the abstract shape on the right; dots: its colours; em: the second headline
// colour; value: the proof number colour; mark: kicker dot and proof bar.
const THEMES = {
  salesforce: { motif: 'sphere', dots: [C.blue, '#5EC0E8', C.green], glow: C.blue, em: C.blue, value: C.blue, mark: C.blue },
  servicenow: { motif: 'ripple', dots: [C.green, '#6CC77A', C.blue], glow: C.green, em: C.green, value: C.green, mark: C.green },
  ai: { motif: 'network', dots: [C.blue, C.green], glow: C.blue, em: C.green, value: C.blue, mark: C.green },
  security: { motif: 'rings', dots: [C.red, C.grey], glow: C.red, em: C.text, value: C.white, mark: C.red },
  company: { motif: 'wave', dots: [C.grey], spark: [C.blue, C.green, C.red], glow: C.grey, em: C.text, value: C.blue, mark: C.red },
  talent: { motif: 'wave', dots: [C.grey], spark: [C.green, C.blue], glow: C.green, em: C.green, value: C.green, mark: C.green },
  careers: { motif: 'wave', dots: [C.grey], spark: [C.blue, C.green], glow: C.blue, em: C.text, value: C.blue, mark: C.green },
  insights: { motif: 'sphere', dots: [C.red, C.green, C.blue], glow: C.green, em: C.green, value: C.green, mark: C.red },
  events: { motif: 'rings', dots: [C.blue, C.green, C.red], glow: C.blue, em: C.blue, value: C.white, mark: C.blue },
  home: { motif: 'sphere', dots: [C.red, C.green, C.blue], glow: C.blue, em: C.green, value: C.green, mark: C.red }
};

// ---------- Copy for the hand-written pages (no em/en dashes, no first or second person) ----------
// k: kicker, h: [headline, second part in the accent colour], p: [proof value, proof label]
const PAGE = {
  '/': { t: 'home', k: 'Salesforce · ServiceNow · AI & Data', h: ['Run the business.', 'Not the software.'], p: ['200+', 'enterprises served since 2004'] },
  '/about': { t: 'company', k: 'About Procyon', h: ['Since 2004, one job:', 'make enterprise platforms pay back.'], p: ['200+', 'professionals in Novato, Toronto and Chennai'] },
  '/about/certifications': { t: 'company', k: 'Partners & certifications', h: ['Every credential procurement asks for,', 'ready on day one.'], p: ['ISO 27001', 'ISO 9001, SOC 2 Type II, WBENC, NMSDC, SBE'] },
  '/careers': { t: 'careers', k: 'Careers', h: ['Build what enterprises', 'run on every day.'], p: ['{openJobs} open roles', 'in Chennai, plus open applications'] },
  '/contact': { t: 'company', k: 'Contact', h: ['One brief.', 'A senior architect replies.'], p: ['1 business day', 'to a reply, never a sales rep'] },
  '/accessibility': { t: 'company', k: 'Legal', h: ['Accessibility statement.', 'Built for every visitor.'], p: ['WCAG 2.1', 'Level AA as the target'] },
  '/cookies': { t: 'company', k: 'Legal', h: ['Cookie policy.', 'What runs, and how to switch it off.'] },
  '/privacy': { t: 'company', k: 'Legal', h: ['Privacy policy.', 'How personal information is handled.'] },
  '/terms': { t: 'company', k: 'Legal', h: ['Terms of service.', 'The rules for using procyonts.com.'] },
  '/products/ranger-fusion': { t: 'salesforce', k: 'Ranger Fusion ERP', h: ['The whole business on Salesforce.', 'Live in 2 to 4 weeks.'], p: ['7 modules', 'on one Salesforce data model'] },
  '/enterprise/salesforce': { t: 'salesforce', k: 'Salesforce', h: ['Salesforce consulting that ships,', 'fixes and runs the org.'], p: ['40+', 'accelerators, 30 to 50% shorter timelines'] },
  '/enterprise/salesforce/implementation': { t: 'salesforce', k: 'Salesforce · Implementation', h: ['Salesforce live in 6 to 8 weeks,', 'not 6 to 8 months.'], p: ['6 weeks', 'Sales Cloud, kickoff to live pipeline'] },
  '/enterprise/salesforce/agentforce': { t: 'salesforce', k: 'Salesforce · Agentforce', h: ['The first Agentforce agents,', 'live in under 4 weeks.'], p: ['60%', 'of tier-1 queries resolved by AI agents'] },
  '/enterprise/salesforce/data-cloud': { t: 'salesforce', k: 'Salesforce · Data Cloud', h: ['One real-time customer record', 'across every system.'], p: ['12+', 'systems integrated, SAP to Snowflake'] },
  '/enterprise/salesforce/org-audit': { t: 'salesforce', k: 'Salesforce · Org audit', h: ['A Salesforce org should speed teams up,', 'not slow them down.'], p: ['30 days', 'to stabilize, 8 areas audited'] },
  '/enterprise/salesforce/managed-services': { t: 'salesforce', k: 'Salesforce · Managed services', h: ['Go-live is day one.', 'The org keeps improving after.'], p: ['3 releases', 'a year, tested in sandbox first'] },
  '/enterprise/servicenow': { t: 'servicenow', k: 'ServiceNow', h: ['ServiceNow that sticks.', 'Audit first, then build.'], p: ['2 to 3 weeks', 'to a prioritized remediation plan'] },
  '/enterprise/servicenow/platform-audit': { t: 'servicenow', k: 'ServiceNow · Platform audit', h: ['From cluttered instance', 'to clean platform in 8 weeks.'], p: ['30 to 40%', 'of licensed capacity in use before the audit'] },
  '/enterprise/servicenow/itsm-itom': { t: 'servicenow', k: 'ServiceNow · ITSM & ITOM', h: ['Incident, change and asset', 'on data the desk trusts.'], p: ['60%', 'fewer integration failures'] },
  '/enterprise/servicenow/now-assist': { t: 'servicenow', k: 'ServiceNow · Now Assist', h: ['Now Assist', 'the business can trust.'], p: ['8 weeks', 'from build start to the first live agent'] },
  '/enterprise/servicenow/managed-services': { t: 'servicenow', k: 'ServiceNow · Managed services', h: ['A ServiceNow run team,', 'without the hiring.'], p: ['24/7', 'delivery from Novato, Toronto and Chennai'] },
  '/enterprise/servicenow/security-risk': { t: 'security', k: 'ServiceNow · Security & risk', h: ['Security alerts with context.', 'Audits ready on demand.'], p: ['60%', 'MTTR reduction with automated SecOps'] },
  '/services/cybersecurity': { t: 'security', k: 'Cybersecurity & compliance', h: ['Always monitored.', 'Always audit-ready.'], p: ['24x7', 'detection, response and continuous GRC'] },
  '/services/government': { t: 'security', k: 'Government solutions', h: ['Public-sector modernization', 'built to pass the ATO.'], p: ['20+', 'federal, state, local and judicial clients'] },
  '/ai-data': { t: 'ai', k: 'AI & Data', h: ['AI that runs in production,', 'on data that agrees.'], p: ['8 weeks', 'from idea to first production value'] },
  '/services/ai-ml': { t: 'ai', k: 'AI & Data · AI agents', h: ['AI agents that run in production,', 'not in a lab.'], p: ['90%', 'less clinical intake processing time'] },
  '/ai-data/knowledge-assistants': { t: 'ai', k: 'AI & Data · Knowledge assistants', h: ['Answers from company documents,', 'with the source attached.'], p: ['100%', 'of answers cite a source and are logged'] },
  '/services/data-analytics': { t: 'ai', k: 'AI & Data · Analytics', h: ['One set of numbers', 'every team trusts.'], p: ['80%', 'faster reporting after modernization'] },
  '/solutions/enterprise-integration': { t: 'ai', k: 'AI & Data · Integration', h: ['Every system in sync.', 'Nobody re-keys anything.'], p: ['500+', 'APIs built and run in production'] },
  '/solutions/enterprise-application-modernization': { t: 'ai', k: 'Product engineering', h: ['Build what is unique.', 'Modernize what holds it back.'], p: ['5x', 'faster releases with platform engineering'] },
  '/services/cloud': { t: 'ai', k: 'Cloud transformation', h: ['Cloud that pays back,', 'not just bills.'], p: ['40%', 'average cloud cost reduction'] },
  '/talent/delivery-pods': { t: 'talent', k: 'Talent · Delivery pods', h: ['A full delivery team,', 'accountable for the roadmap.'], p: ['2 weeks', 'to add or release capacity'] },
  '/talent/engagement-models': { t: 'talent', k: 'Talent · Engagement models', h: ['Buy delivery the way', 'procurement prefers.'], p: ['5 models', 'fixed, T&M, milestone, outcome, capacity'] },
  '/services/staff-augmentation': { t: 'talent', k: 'Talent · Staff augmentation', h: ['Certified people on the team', 'in days, not months.'], p: ['72 hours', 'to a vetted shortlist for most roles'] },
  '/blog': { t: 'insights', k: 'Insights · Blog', h: ['Field notes from the people', 'who do the work.'], p: ['{posts} articles', 'Salesforce, ServiceNow, AI and data'] },
  '/case-studies': { t: 'insights', k: 'Insights · Case studies', h: ['The problem, the approach,', 'the measured result.'], p: ['{cases} programs', 'delivered for global clients'] },
  '/insights/events': { t: 'events', k: 'Insights · Events', h: ['Skip the booth.', 'Book the 1:1.'], p: ['{events} events', 'Dreamforce, NMSDC and more'] }
};
// Live blog titles that speak to the reader get a neutral rewrite for the image.
const HEAD_FIX = {
  'nmsdc-2026-key-takeaways': 'NMSDC 2026 Key Takeaways: 6 Lessons From Los Angeles',
  'nmsdc-2026-certified-mbe-partner-shortlist': 'The NMSDC 2026 Partner Shortlist: 7 Questions to Ask Before Los Angeles',
  'supplier-diversity-salesforce-certified-mbe-partner': 'Supplier Diversity Meets Salesforce: Hitting Tier 1 and Tier 2 Goals',
  'salesforce-org-health-check': 'Salesforce Org Health Check: 10 Signs an Expert Review Is Due',
  'first-90-days-salesforce-partner': 'The First 90 Days With a Salesforce Partner: What Great Delivery Looks Like',
  'dreamforce-2026-sessions-guide': 'Dreamforce 2026: The Sessions Worth the Time, and How to Plan 3 Days',
  'choosing-a-salesforce-implementation-partner': 'How to Choose a Salesforce Implementation Partner: 15 Questions to Ask',
  'enterprise-agent-readiness-checklist': 'The Enterprise Agent-Readiness Checklist: 12 Fixes Before AI Agents Go Live',
  'agentforce-implementation-guide': 'Agentforce Implementation Guide: Realistic Timelines and the Hidden Pitfalls'
};
const CAT_THEME = (cat) => /servicenow/i.test(cat) ? 'servicenow' : /cyber|security/i.test(cat) ? 'security'
  : /diversity/i.test(cat) ? 'company' : /salesforce|agentforce|dreamforce|revenue cloud|consulting/i.test(cat) ? 'salesforce'
  : /\bai\b|machine|data|cloud|sap|architecture|agents/i.test(cat) ? 'ai' : 'salesforce';

// ---------- Helpers ----------
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PRONOUN = /\b(my|My|you|You|your|Your|yours|we|We|our|Our|ours|us|Us|me)\b/;
const tidy = (s) => String(s == null ? '' : s).replace(/(\d)\s*[–—-]\s*(\d)/g, '$1 to $2').replace(/\s+[–—-]\s+/g, ': ')
  .replace(/[–—]/g, ', ').replace(/\s+/g, ' ').trim();
const ogName = (slug) => slug === '/' ? 'home' : slug.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seedText) {
  let a = crypto.createHash('md5').update(seedText).digest().readUInt32LE(0);
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hex = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const x = hex(a), y = hex(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const ramp = (list, t) => { if (list.length === 1) return list[0]; t = clamp(t, 0, 1) * (list.length - 1); const i = Math.min(Math.floor(t), list.length - 2); return mix(list[i], list[i + 1], t - i); };
const f2 = (n) => Math.round(n * 10) / 10;

// ---------- Font metrics (TrueType hmtx + cmap 4), for line breaking ----------
const FONT_DIRS = [process.env.OG_FONT_DIR, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'),
  process.env.WINDIR && path.join(process.env.WINDIR, 'Fonts'), path.join(os.homedir(), 'Library', 'Fonts'), '/Library/Fonts',
  path.join(os.homedir(), '.local', 'share', 'fonts'), '/usr/share/fonts/truetype/montserrat', '/usr/share/fonts/TTF'].filter(Boolean);
function loadFont(file) {
  const b = fs.readFileSync(file), t = {};
  for (let i = 0, n = b.readUInt16BE(4); i < n; i++) { const o = 12 + 16 * i; t[b.toString('ascii', o, o + 4)] = b.readUInt32BE(o + 8); }
  const upm = b.readUInt16BE(t.head + 18), nh = b.readUInt16BE(t.hhea + 34);
  let sub = -1;
  for (let i = 0, n = b.readUInt16BE(t.cmap + 2); i < n; i++) {
    const pid = b.readUInt16BE(t.cmap + 4 + 8 * i), eid = b.readUInt16BE(t.cmap + 6 + 8 * i), off = t.cmap + b.readUInt32BE(t.cmap + 8 + 8 * i);
    if (b.readUInt16BE(off) === 4 && (pid === 0 || (pid === 3 && eid === 1))) sub = off;
  }
  const seg2 = b.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + seg2 + 2, deltas = starts + seg2, ranges = deltas + seg2;
  const gid = (cp) => {
    for (let s = 0; s < seg2; s += 2) {
      if (cp > b.readUInt16BE(ends + s)) continue;
      const start = b.readUInt16BE(starts + s); if (cp < start) return 0;
      const d = b.readInt16BE(deltas + s), ro = b.readUInt16BE(ranges + s);
      if (!ro) return (cp + d) & 0xFFFF;
      const g = b.readUInt16BE(ranges + s + ro + 2 * (cp - start)); return g ? (g + d) & 0xFFFF : 0;
    }
    return 0;
  };
  const memo = new Map();
  return (str) => { let w = 0; for (const ch of str) { const cp = ch.codePointAt(0); let a = memo.get(cp); if (a == null) { a = b.readUInt16BE(t.hmtx + 4 * Math.min(gid(cp), nh - 1)) / upm; memo.set(cp, a); } w += a; } return w; };
}
const FONTS = {};
let fontWarn = false;
for (const [wt, name] of [[400, 'Regular'], [500, 'Medium'], [600, 'SemiBold']]) {
  const dir = FONT_DIRS.find(d => fs.existsSync(path.join(d, `Montserrat-${name}.ttf`)));
  if (dir) FONTS[wt] = loadFont(path.join(dir, `Montserrat-${name}.ttf`));
  else { FONTS[wt] = (s) => [...s].length * 0.64; fontWarn = true; }
}
if (fontWarn) console.warn('Montserrat TTFs not found (set OG_FONT_DIR): line breaks use estimates and rendering may fall back to another font.');
const measure = (s, size, wt, track = 0) => FONTS[wt](s) * size + track * Math.max(0, [...s].length - 1);

// Breaks [{w, em}] words into lines no wider than maxW. Returns null when it needs more than maxLines.
function wrap(words, size, maxW, maxLines, track) {
  const lines = [[]];
  let cur = 0;
  for (const wd of words) {
    if (wd.br && lines[lines.length - 1].length) { lines.push([]); cur = 0; }
    const ww = measure(wd.w, size, 600, track), sp = measure(' ', size, 600, track);
    const line = lines[lines.length - 1];
    if (line.length && cur + sp + ww > maxW) { lines.push([wd]); cur = ww; } else { cur += (line.length ? sp : 0) + ww; line.push(wd); }
    if (ww > maxW) return null;
  }
  return lines.length <= maxLines ? lines : null;
}
// Same line count, narrowest measure: evens out ragged lines and avoids one-word orphans.
// A forced break (the accent part) starts a new paragraph; each paragraph is balanced on its own.
function balance(words, size, maxW, n, track) {
  const paras = [];
  words.forEach((w, i) => { if (!i || w.br) paras.push([]); paras[paras.length - 1].push(Object.assign({}, w, { br: false })); });
  const out = [];
  paras.forEach((p, pi) => {
    let best = wrap(p, size, maxW, n, track), lo = maxW * 0.35, hi = maxW;
    while (hi - lo > 4) { const mid = (lo + hi) / 2, l = wrap(p, size, mid, n, track); if (l && l.length <= best.length) { best = l; hi = mid; } else lo = mid; }
    if (pi) best[0][0].br = true;
    out.push(...best);
  });
  return out;
}
// Keeps number ranges and number + unit pairs on one line ("6 to 8", "8 weeks").
const glue = (s) => s.replace(/ \+ /g, ' + ').replace(/(^| )(\d{1,3}) (?=[A-Za-z])/g, '$1$2 ').replace(/(\d[\d%+]*) to (\d)/g, '$1 to $2').replace(/(\d[\d%+]*) (weeks?|days?|months?|hours?|years?|R's)\b/g, '$1 $2');
// Tries each headline variant in order (largest size first) and keeps the first that fits.
function fitHeadline(variants, o) {
  for (const [vi, v] of variants.entries()) {
    const words = [];
    v.forEach((part, pi) => part && glue(part).split(' ').forEach((w, wi) => words.push({ w, em: pi === 1, br: pi === 1 && wi === 0 })));
    // Two big lines read best as a thumbnail; three smaller lines only when two will not hold it.
    // The accent part starts on its own line whenever that fits at any size.
    const lo = vi < variants.length - 1 ? o.min + 2 : o.min, two = Math.min(o.max, 60);
    for (const [maxLines, min, br] of [[2, two, true], [o.maxLines, Math.max(lo, 48), true], [2, two, false], [o.maxLines, lo, false], [o.maxLines, lo, true]]) {
      const ws = br ? words : words.map(w => Object.assign({}, w, { br: false }));
      for (let size = o.max; size >= min; size -= 2) {
        const track = -0.022 * size;
        const lines = wrap(ws, size, o.maxW, maxLines, track);
        if (lines && lines.length * size * 1.1 <= o.maxH) return { size, lines: balance(ws, size, o.maxW, lines.length, track), track };
      }
    }
  }
  return null;
}

// ---------- Motifs ----------
// Each returns SVG markup confined to the right side. alpha(x) fades marks out towards the headline.
const fade = (x, from = 430, to = 980) => Math.pow(clamp((x - from) / (to - from), 0, 1), 1.25);
function motifSphere(th, r, big) {
  const R = big ? 330 : 290 + r() * 40, cx = 1010 + r() * 70, cy = 230 + r() * 60;
  const ay = -0.9 + r() * 0.5, ax = 0.35 + r() * 0.35, light = [-0.55, 0.65, 0.5];
  const out = [];
  for (let la = -84; la <= 84; la += 7) {
    const lat = la * Math.PI / 180, n = Math.max(6, Math.round(52 * Math.cos(lat)));
    for (let k = 0; k < n; k++) {
      const lon = (k / n) * Math.PI * 2;
      let x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
      [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
      if (z <= 0.02) continue;
      const lit = clamp(x * light[0] + y * light[1] + z * light[2], 0, 1);
      if (lit < 0.08) continue;
      const sx = cx + R * x, sy = cy - R * y;
      const a = Math.min(1, fade(sx, 400, 940) * (0.3 + 0.8 * lit));
      if (a < 0.03 || sy > BAND_Y - 6) continue;
      out.push(`<circle cx="${f2(sx)}" cy="${f2(sy)}" r="${f2(1.2 + 5.6 * lit * z)}" fill="${ramp(th.dots, (1 - y) / 2)}" fill-opacity="${f2(a * 100) / 100}"/>`);
    }
  }
  return out.join('');
}
function motifRipple(th, r) {
  const cx = 960 + r() * 160, cy = 180 + r() * 200, lam = 26 + r() * 10, ph = r() * 6, out = [];
  for (let gy = 22; gy < BAND_Y - 8; gy += 22) for (let gx = 470; gx < W + 10; gx += 22) {
    const d = Math.hypot(gx - cx, gy - cy), wave = 0.5 + 0.5 * Math.cos(d / lam - ph), fall = clamp(1.15 - d / 560, 0, 1);
    const a = fade(gx) * (0.18 + 0.82 * wave) * fall;
    if (a < 0.04) continue;
    const accent = wave > 0.93 && r() < 0.2;
    out.push(`<circle cx="${gx}" cy="${gy}" r="${f2(1.2 + 4.2 * wave * fall)}" fill="${accent ? th.dots[2] : ramp(th.dots.slice(0, 2), d / 520)}" fill-opacity="${f2(a * 100) / 100}"/>`);
  }
  return out.join('');
}
function motifNetwork(th, r) {
  const pts = [], out = [];
  for (let tries = 0; pts.length < 30 && tries < 4000; tries++) {
    const p = { x: 600 + r() * 580, y: 34 + r() * (BAND_Y - 80) };
    if (pts.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 62)) pts.push(p);
  }
  for (let gy = 26; gy < BAND_Y - 8; gy += 26) for (let gx = 520; gx < W; gx += 26) {
    const a = fade(gx) * 0.22; if (a > 0.03) out.push(`<circle cx="${gx}" cy="${gy}" r="1.3" fill="${C.text}" fill-opacity="${f2(a * 100) / 100}"/>`);
  }
  pts.forEach((p, i) => pts.slice(i + 1).forEach(q => {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < 150) out.push(`<line x1="${f2(p.x)}" y1="${f2(p.y)}" x2="${f2(q.x)}" y2="${f2(q.y)}" stroke="${ramp(th.dots, (p.x - 600) / 580)}" stroke-width="1.6" stroke-opacity="${f2(fade(Math.min(p.x, q.x)) * (1 - d / 150) * 70) / 100}"/>`);
  }));
  pts.forEach((p, i) => {
    const a = fade(p.x), c = th.dots[i % th.dots.length], rad = 3 + r() * 5;
    if (rad > 6.4) out.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(rad + 9)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-opacity="${f2(a * 50) / 100}"/>`);
    out.push(`<circle cx="${f2(p.x)}" cy="${f2(p.y)}" r="${f2(rad)}" fill="${c}" fill-opacity="${f2(a * 95) / 100}"/>`);
  });
  return out.join('');
}
function motifRings(th, r) {
  const cx = 1130 + r() * 90, cy = 150 + r() * 220, out = [];
  for (let k = 0, rad = 54; rad < 700; k++, rad += 34) {
    const color = th.dots[k % th.dots.length], strong = k % th.dots.length === 0;
    const gapAt = r() * Math.PI * 2, gap = 0.4 + r() * 1.1, step = 15 / rad;
    for (let t = 0; t < Math.PI * 2; t += step) {
      const da = Math.abs(((t - gapAt + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da < gap / 2) continue;
      const x = cx + rad * Math.cos(t), y = cy + rad * Math.sin(t);
      if (x < 400 || x > W + 6 || y < -6 || y > BAND_Y - 8) continue;
      const a = fade(x, 420, 1000) * (strong ? 0.85 : 0.4) * clamp(1.25 - rad / 640, 0, 1);
      if (a < 0.04) continue;
      out.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="${strong ? 2.6 : 1.8}" fill="${color}" fill-opacity="${f2(a * 100) / 100}"/>`);
    }
  }
  return out.join('');
}
function motifWave(th, r) {
  const f1 = 0.008 + r() * 0.006, f2b = 0.012 + r() * 0.008, ph = r() * 6, tilt = 0.4 + r() * 0.8, out = [];
  for (let gy = 20; gy < BAND_Y - 8; gy += 20) for (let gx = 470; gx < W + 10; gx += 20) {
    const v = 0.5 + 0.5 * Math.sin(gx * f1 + gy * f1 * tilt + ph) * Math.cos(gy * f2b - gx * f1 * 0.4 + ph * 0.7);
    const a = fade(gx) * (0.15 + 0.85 * v);
    if (a < 0.05) continue;
    const spark = v > 0.9 && r() < 0.28;
    out.push(`<circle cx="${gx}" cy="${gy}" r="${f2(spark ? 3.8 : 0.8 + 3.2 * v)}" fill="${spark ? th.spark[Math.floor(r() * th.spark.length)] : th.dots[0]}" fill-opacity="${f2((spark ? Math.min(1, a * 1.4) : a * 0.75) * 100) / 100}"/>`);
  }
  return out.join('');
}
const MOTIFS = { sphere: motifSphere, ripple: motifRipple, network: motifNetwork, rings: motifRings, wave: motifWave };

// ---------- Layout ----------
function textLine(x, y, segs, size, wt, track, colors) {
  return `<text xml:space="preserve" x="${x}" y="${f2(y)}" font-family="Montserrat, Arial, sans-serif" font-weight="${wt}" font-size="${size}" letter-spacing="${f2(track)}">` +
    segs.map(s => `<tspan fill="${s.em ? colors.em : colors.base}">${xml(s.t)}</tspan>`).join('') + '</text>';
}
function joinLine(words) { // merges same-colour neighbours so spaces stay inside one tspan
  const segs = [];
  words.forEach((w, i) => { const t = (i ? ' ' : '') + w.w; const last = segs[segs.length - 1]; if (last && last.em === w.em) last.t += t; else segs.push({ t, em: w.em }); });
  return segs;
}

function svgFor(spec, logoW) {
  const th = THEMES[spec.theme], r = rng(spec.slug), photo = !!spec.photo, parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>
<linearGradient id="brand" x1="0" x2="1"><stop offset="0" stop-color="${C.blue}"/><stop offset=".5" stop-color="${C.green}"/><stop offset="1" stop-color="${C.red}"/></linearGradient>
<radialGradient id="glow" cx="${photo ? 0.1 : 0.82}" cy="${photo ? 1 : 0.38}" r="${photo ? 0.7 : 0.55}"><stop offset="0" stop-color="${th.glow}" stop-opacity="${photo ? 0.16 : 0.2}"/><stop offset="1" stop-color="${th.glow}" stop-opacity="0"/></radialGradient>
<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="${C.night}" stop-opacity=".98"/><stop offset=".5" stop-color="${C.night}" stop-opacity=".94"/><stop offset=".78" stop-color="${C.night}" stop-opacity=".74"/><stop offset="1" stop-color="${C.night}" stop-opacity=".5"/></linearGradient>
<linearGradient id="head" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.night}" stop-opacity=".88"/><stop offset="1" stop-color="${C.night}" stop-opacity="0"/></linearGradient>
<linearGradient id="sink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.night}" stop-opacity="0"/><stop offset=".45" stop-color="${C.night}" stop-opacity=".8"/><stop offset="1" stop-color="${C.night}" stop-opacity=".9"/></linearGradient>
<linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="${C.night}" stop-opacity="0"/><stop offset="1" stop-color="${C.night}" stop-opacity=".85"/></linearGradient>
</defs>`);
  if (photo) {
    parts.push(`<rect width="${W}" height="${BAND_Y}" fill="url(#shade)"/><rect width="${W}" height="${BAND_Y}" fill="url(#foot)"/><rect width="${W}" height="240" fill="url(#head)"/>`);
    parts.push(`<rect width="${W}" height="${BAND_Y}" fill="url(#glow)"/>`);
  } else {
    parts.push(`<rect width="${W}" height="${H}" fill="${C.night}"/><rect width="${W}" height="${BAND_Y}" fill="url(#glow)"/>`);
    parts.push(MOTIFS[th.motif](th, r, spec.theme === 'home'));
  }
  const motifAt = parts.length - 1;

  const kSize = 26, kTrack = 0.16 * kSize, kicker = spec.kicker.toUpperCase();
  const kY = M + 22;

  // Proof row (fixed above the band)
  let proofTop = BAND_Y - 36;
  if (spec.proof) {
    const [v, l] = spec.proof;
    let vs = 64; while (vs > 44 && measure(v, vs, 600, -0.02 * vs) > 600) vs -= 2;
    const vw = measure(v, vs, 600, -0.02 * vs), base = BAND_Y - 58;
    const lx = M + vw + 56, lmax = W - M - lx;
    const lw = glue(l).split(' ').map(w => ({ w }));
    let ls = 28, lines;
    // A "a · b · c" label that needs two lines breaks at a dot, not mid-phrase.
    const dots = l.split(' · ');
    if (dots.length > 1 && measure(l, 28, 500) > lmax) {
      const cuts = dots.slice(1).map((_, i) => [dots.slice(0, i + 1).join(' · '), dots.slice(i + 1).join(' · ')])
        .filter(c => c.every(t => measure(t, 28, 500) <= lmax)).sort((a, b) => Math.max(...a.map(t => measure(t, 28, 500))) - Math.max(...b.map(t => measure(t, 28, 500))));
      if (cuts.length) lines = cuts[0].map(t => [{ w: t }]);
    }
    if (!lines) for (; ls >= 26; ls -= 1) { lines = wrap(lw, ls, lmax, 2, 0); if (lines) { lines = balance(lw, ls, lmax, lines.length, 0); break; } }
    if (!lines) { ls = 26; lines = wrap(lw, 26, lmax, 9, 0) || [[{ w: l }]]; console.warn('  proof label too long:', spec.slug, l); }
    parts.push(textLine(M, base, [{ t: v }], vs, 600, -0.02 * vs, { base: th.value, em: th.value }));
    const vTop = base - vs * 0.72, mid = base - vs * 0.36;
    parts.push(`<rect x="${f2(M + vw + 26)}" y="${f2(vTop)}" width="4" height="${f2(vs * 0.72)}" rx="2" fill="${th.mark}"/>`);
    const lh = ls * 1.22, first = mid - (lines.length - 1) * lh / 2 + ls * 0.36;
    lines.forEach((ln, i) => parts.push(textLine(f2(lx), first + i * lh, [{ t: ln.map(w => w.w).join(' ') }], ls, 500, 0, { base: '#C9CED4', em: '#C9CED4' })));
    proofTop = vTop;
    // Let the motif sink behind the proof row so the label never sits on bright dots.
    if (!photo) parts.splice(motifAt + 1, 0, `<rect y="${f2(vTop - 70)}" width="${W}" height="${f2(BAND_Y - vTop + 70)}" fill="url(#sink)"/>`);
  }

  // Headline
  const top = kY + 30, maxH = proofTop - 40 - top;
  const fit = fitHeadline(spec.heads, { max: photo ? 58 : 72, min: 44, maxW: photo ? 900 : 830, maxLines: 3, maxH });
  if (!fit) throw new Error('headline does not fit: ' + spec.slug);
  const lh = fit.size * 1.1, block = fit.lines.length * lh;
  // Kicker and headline travel together, centred in the space above the proof row.
  const shift = Math.max(0, (maxH - block) / 2);
  parts.push(`<circle cx="${M + 7}" cy="${f2(kY + shift - 9)}" r="7" fill="${th.mark}"/>`);
  parts.push(textLine(M + 28, kY + shift, [{ t: kicker }], kSize, 600, kTrack, { base: spec.theme === 'security' || spec.theme === 'company' || photo ? '#D5D9DE' : th.em, em: th.em }));
  let y = top + shift + fit.size * 0.92;
  for (const ln of fit.lines) { parts.push(textLine(M - 2, y, joinLine(ln), fit.size, 600, fit.track, { base: C.white, em: th.em })); y += lh; }

  // Brand band: gradient rule, clean white field for the logo, address
  parts.push(`<rect y="${BAND_Y}" width="${W}" height="${BAND}" fill="#FFFFFF"/><rect y="${BAND_Y}" width="${W}" height="5" fill="url(#brand)"/>`);
  parts.push(`<text x="${W - M}" y="${BAND_Y + 5 + (BAND - 5) / 2 + 10}" text-anchor="end" font-family="Montserrat, Arial, sans-serif" font-weight="500" font-size="28" letter-spacing="0.5" fill="${C.grey}">procyonts.com</text>`);
  parts.push('</svg>');
  return { svg: parts.join('\n'), fit };
}

// ---------- Page specs ----------
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const blog = load('blog.json'), cases = load('case-studies.json'), events = load('events.json'), jobs = load('jobs.json');
const bySlug = (list) => new Map(list.map(x => [x.slug, x]));
const BLOG = bySlug(blog), CASES = bySlug(cases), EVENTS = bySlug(events), JOBS = bySlug(jobs);
const COUNTS = { openJobs: jobs.filter(j => j.is_open).length, posts: blog.length, cases: cases.length, events: events.length };
const fill = (s) => String(s).replace(/\{(\w+)\}/g, (m, k) => COUNTS[k]);
const splitColon = (t) => { const m = t.match(/^(.{4,}?[:?]) (.{8,})$/); return m ? [m[1], m[2]] : [t, '']; };
const photoFile = (img) => img && img.src ? path.join(PUB, img.src.replace(/^\//, '')) : null;

function specFor(meta) {
  const slug = meta.slug, tail = slug.split('/').pop();
  const fixed = PAGE[slug];
  if (fixed) return { slug, theme: fixed.t, kicker: fixed.k, heads: [fixed.h], proof: fixed.p ? fixed.p.map(fill) : null };
  if (slug.startsWith('/blog/') && BLOG.has(tail)) {
    const p = BLOG.get(tail), cat = String(p.category || 'Insights').trim();
    const title = tidy(HEAD_FIX[tail] || String(p.title).replace(/\s+\d{1,3}$/, ''));
    const [a, b] = splitColon(title);
    return { slug, theme: CAT_THEME(cat), kicker: 'Blog · ' + cat, heads: [[a, b], [a.replace(/:$/, ''), '']], photo: photoFile(p.image),
      proof: [String(p.read_time || (p.reading_minutes ? p.reading_minutes + ' min read' : '')).trim() || 'Field notes', 'Published ' + fmtDate(meta.published || p.published_at)] };
  }
  if (slug.startsWith('/case-studies/') && CASES.has(tail)) {
    const c = CASES.get(tail), title = tidy(String(c.title).replace(/\s+\d{1,3}$/, ''));
    const outs = (c.outcomes || []).filter(o => /^[$\d]/.test(String(o.value)));
    const o = outs.find(x => !title.includes(x.value)) || outs[0] || (c.outcomes || [])[0];
    const [a, b] = splitColon(title);
    return { slug, theme: CAT_THEME(c.platform), kicker: 'Case study · ' + tidy(c.industry).replace(/\s*\(.*\)/, '').split(/,| \/ /)[0],
      heads: [[a, b], [a.replace(/:$/, ''), '']], photo: photoFile(c.image), proof: o ? [tidy(o.value), tidy(o.label).toLowerCase()] : null };
  }
  if (slug.startsWith('/insights/events/') && EVENTS.has(tail)) {
    const e = EVENTS.get(tail), sub = tidy(String(e.subtitle || '').split(/\s+[-–—]\s+/)[0]);
    return { slug, theme: 'events', kicker: 'Event · ' + tidy(e.event_type || 'Conference'), heads: [[tidy(e.title), sub], [tidy(e.title), '']],
      proof: [tidy(e.date_text), [e.location, e.venue].filter(Boolean).map(tidy).join(' · ')] };
  }
  if (slug.startsWith('/careers/') && JOBS.has(tail)) {
    const j = JOBS.get(tail), loc = String(j.location || 'Chennai'), city = loc.replace(/\s*\(.*\)/, '').trim() || 'Chennai';
    const mode = (loc.match(/\(([^)]+)\)/) || [])[1];
    const exp = j.experience_level ? tidy(j.experience_level).replace(/\s*\(.*\)/, '').replace(/\byears?\b/i, 'years').replace(/^(\d[\d+ to]*)$/, '$1 years') + ' experience' : '';
    const label = [mode && tidy(mode).replace(/\s*\/\s*/g, ' or '), j.employment_type, exp].filter(Boolean).join(' · ');
    return { slug, theme: 'careers', kicker: j.is_open ? 'Careers · Now hiring' : 'Careers · Role closed', heads: [[tidy(j.title), '']],
      proof: [city, label] };
  }
  // A page without hand-written copy still gets a unique image from its own meta.
  const head = [meta.ogTitle, meta.title].map(t => tidy(String(t || '').replace(/\s*\|.*$/, ''))).find(t => t && !PRONOUN.test(t)) || tidy(meta.title);
  console.warn('  no hand-written copy for', slug, '(using meta title)');
  const theme = { servicenow: 'servicenow', ai: 'ai', company: 'company', talent: 'talent', insights: 'insights' }[meta.section] || 'salesforce';
  return { slug, theme, kicker: (meta.crumbs && meta.crumbs[0] && meta.crumbs[0][0]) || 'Procyon', heads: [splitColon(head), [head, '']], proof: null };
}

function checkCopy(spec) {
  const text = [spec.kicker, ...spec.heads[0], ...(spec.proof || [])].join(' ');
  if (/[–—]/.test(text)) console.warn('  dash in copy:', spec.slug, text);
  if (PRONOUN.test(text)) console.warn('  pronoun in copy:', spec.slug, text);
}

// ---------- Render ----------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const metas = [{ slug: '/' }];
  for (const f of walk(SRC).filter(f => f.endsWith('.html') && !f.includes(path.sep + '_partials' + path.sep))) {
    const m = fs.readFileSync(f, 'utf8').match(/^<!--meta\s*([\s\S]*?)-->/);
    if (m) metas.push(JSON.parse(m[1]));
  }
  if (!fs.existsSync(path.join(SRC, '_gen'))) console.warn('src/pages/_gen is missing: run node scripts/build-insights.js first');

  const logoSvg = fs.readFileSync(path.join(PUB, 'assets', 'img', 'procyon-logo.svg'));
  // The logo artwork as supplied: only its transparent margin is trimmed so the clear space is exact.
  const LOGO_H = 62;
  const logo = await sharp(await sharp(logoSvg, { density: 1200 }).png().toBuffer()).trim().resize({ height: LOGO_H }).png().toBuffer();
  const logoW = (await sharp(logo).metadata()).width;
  const self = crypto.createHash('sha1').update(fs.readFileSync(__filename)).update(logoSvg).digest('hex');
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const next = {}, used = new Set();
  let rendered = 0, skipped = 0;

  for (const meta of metas.sort((a, b) => a.slug.localeCompare(b.slug))) {
    const spec = specFor(meta), name = ogName(meta.slug) + '.jpg', file = path.join(OUT, name);
    used.add(name);
    checkCopy(spec);
    const photoHash = spec.photo && fs.existsSync(spec.photo) ? crypto.createHash('sha1').update(fs.readFileSync(spec.photo)).digest('hex') : '';
    if (spec.photo && !photoHash) { console.warn('  cover image missing, using the motif:', spec.photo); spec.photo = null; }
    const hash = crypto.createHash('sha1').update(self).update(JSON.stringify(spec)).update(photoHash).digest('hex').slice(0, 16);
    next[name] = hash;
    if (ONLY && !meta.slug.includes(ONLY)) { if (cache[name]) next[name] = cache[name]; continue; }
    if (!FORCE && cache[name] === hash && fs.existsSync(file)) { skipped++; continue; }

    const { svg } = svgFor(spec, logoW);
    const layers = [];
    if (spec.photo) layers.push({ input: await sharp(spec.photo).resize(W, BAND_Y, { fit: 'cover', position: 'attention' }).blur(4).modulate({ saturation: 0.85 }).toBuffer(), left: 0, top: 0 });
    layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
    layers.push({ input: logo, left: M, top: BAND_Y + 5 + Math.round((BAND - 5 - LOGO_H) / 2) });
    await sharp({ create: { width: W, height: H, channels: 3, background: C.night } }).composite(layers)
      .jpeg({ quality: 84, progressive: true, mozjpeg: true }).toFile(file);
    rendered++;
    console.log('og', name, Math.round(fs.statSync(file).size / 1024) + ' KB');
  }

  // Drop images no page uses any more (old section images, raw cover copies).
  if (!KEEP && !ONLY) {
    for (const f of fs.readdirSync(OUT)) {
      const p = path.join(OUT, f);
      if (f.endsWith('.jpg') && !used.has(f)) { fs.rmSync(p); console.log('removed', f); }
      else if (fs.statSync(p).isDirectory()) { fs.rmSync(p, { recursive: true, force: true }); console.log('removed', f + '/'); }
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + '\n');
  console.log(`${rendered} rendered, ${skipped} unchanged, ${used.size} pages`);
})().catch(e => { console.error(e); process.exit(1); });
