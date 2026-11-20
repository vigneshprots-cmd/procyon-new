#!/usr/bin/env node
// Builds the two product pages in the CURRENT procyonts.com (live site) theme, as unlisted previews:
//   /procyon-fusion  and  /procyon-wfm   (public/<slug>/index.html)
// They reuse the live site's compiled stylesheet (public/live-theme/live.css, fonts self-hosted) and the
// header, dropdowns, mobile menu and footer captured from procyonts.com (src/live-theme/procyonts-snapshot.json).
// They are noindex, not in the sitemap and not linked from this site's menus. To ship them on procyonts.com,
// port the markup into the React app and drop the noindex line.
//
// usage: node scripts/build-live-theme.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src', 'live-theme');
const LIVE = 'https://procyonts.com';
const PREVIEW = 'https://procyon.up.railway.app';
const DEMO = LIVE + '/contact';
const V = 2;
const snap = JSON.parse(fs.readFileSync(path.join(SRC, 'procyonts-snapshot.json'), 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Lucide icons (stroke 2, 24 grid) ----------
const ICONS = {
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
  'badge-check': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'calendar-x': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/>',
  'calendar-days': '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  'user-x': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>',
  'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
  'bar-chart': '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  'refresh-cw': '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  languages: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
  scale: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  'file-check': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m9 15 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'
};
const icon = (name, size, cls) => {
  if (!ICONS[name]) throw new Error('unknown icon ' + name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name} ${cls || ''}" aria-hidden="true">${ICONS[name]}</svg>`;
};

// ---------- Shared transforms ----------
const rename = (s) => s.replace(/Ranger ?Fusion/g, 'Procyon Fusion').replace(/RANGER FUSION/g, 'PROCYON FUSION');
const unanimate = (s) => s.replace(/ style="opacity: 1; transform: none;"/g, '').replace(/ style="opacity: 1;"/g, '');
function relink(s) {
  return s
    .replace(/href="\/products\/ranger-fusion"/g, 'href="/procyon-fusion"')
    .replace(/src="\/assets\/procyon-logo-[^"]+\.svg"/g, 'src="/live-theme/procyon-logo.svg"')
    .replace(/src="\/assets\/ranger-fusion-hero-[^"]+\.jpg"/g, 'src="/live-theme/fusion-hero.jpg"')
    .replace(/href="\/(?!\/|live-theme\/|procyon-fusion|procyon-wfm)([^"]*)"/g, (_, p) => `href="${LIVE}/${p}"`);
}
const clean = (s) => relink(rename(unanimate(s)));

// ---------- Header: desktop dropdowns, mobile menu ----------
const PRODUCTS = [
  { href: '/procyon-fusion', name: 'Procyon Fusion', d: 'AI-powered ERP built natively on Salesforce: sales, finance, inventory, projects and HR in one' },
  { href: '/procyon-wfm', name: 'Procyon WFM', d: 'Shift scheduling that enforces rest, hours and certification rules, through to payroll' }
];
const panelOf = (html) => html.slice(html.indexOf('<div class="absolute'), html.lastIndexOf('</div>'));
function productsPanel() {
  const base = panelOf(snap.dropdowns.Products);
  const item = (p) => `<a class="group block px-4 py-3 rounded-lg hover:bg-muted/70 transition-colors" href="${p.href}"><div class="font-display font-semibold text-sm text-foreground group-hover:text-primary transition-colors">${p.name}</div><div class="text-xs text-muted-foreground mt-0.5 leading-snug">${esc(p.d)}</div></a>`;
  return base.replace(/<div class="p-2">[\s\S]*<\/div><\/div><\/div>$/, `<div class="p-2">${PRODUCTS.map(item).join('')}</div></div></div>`);
}
const PANELS = Object.fromEntries(Object.entries(snap.dropdowns).map(([k, v]) => [k, k === 'Products' ? productsPanel() : panelOf(v)]));
const linksIn = (panel) => [...panel.matchAll(/<a class="group block[^"]*" href="([^"]+)"><div[^>]*>([^<]+)<\/div>/g)].map(m => ({ href: m[1], t: m[2] }));

function header() {
  let nav = snap.nav;
  nav = nav.replace(/<div class="relative">(<button )([^>]*>)([^<]+)(<svg[\s\S]*?<\/svg><\/button>)<\/div>/g, (m, b, attrs, label, rest) => {
    const panel = PANELS[label.trim()];
    if (!panel) return m;
    const id = 'lt-dd-' + label.trim().toLowerCase();
    return `<div class="relative" data-dd-wrap>${b}type="button" data-dd aria-expanded="false" aria-controls="${id}" ${attrs}${label}${rest}<div id="${id}" data-dd-panel hidden>${panel}</div></div>`;
  });
  nav = nav.replace(/<button type="button" (class="ml-2[^"]*")>Contact Us<\/button>/, `<a href="${DEMO}" $1>Contact Us</a>`);
  nav = nav.replace('aria-label="Toggle menu"', 'aria-label="Toggle menu" aria-expanded="false" aria-controls="lt-mnav" data-mnav-toggle');
  let mob = snap.mobilePanel.replace(/^<div class="lg:hidden/, '<div id="lt-mnav" hidden class="lg:hidden');
  mob = mob.replace(/<div>(<button )(class="w-full flex[^"]*">)([^<]+)(<svg[\s\S]*?<\/svg><\/button>)<\/div>/g, (m, b, cls, label, rest) => {
    const panel = PANELS[label.trim()]; if (!panel) return m;
    const links = linksIn(panel).map(l => `<a class="block py-2 text-sm text-muted-foreground hover:text-primary transition-colors" href="${l.href}">${l.t}</a>`).join('');
    return `<div>${b}type="button" data-msub aria-expanded="false" ${cls}${label}${rest}<div class="pl-4 pb-2" hidden>${links}</div></div>`;
  });
  mob = mob.replace(/<button type="button" (class="[^"]*")>Contact Us<\/button>/, `<a href="${DEMO}" $1>Contact Us</a>`);
  mob = mob.replace(/<button class="(w-full mt-4[^"]*)">Submit Inquiry<\/button>/, `<a href="${DEMO}" class="block text-center $1">Submit Inquiry</a>`);
  nav = nav.replace(/<\/nav>$/, mob + '</nav>');
  return clean(nav);
}
function footer() {
  let f = clean(snap.footer);
  // List both products wherever the live footer links its product
  f = f.replace(/(<li[^>]*>)(<a [^>]*href="\/procyon-fusion"[^>]*>)Procyon Fusion<\/a><\/li>/, (m, li, a) => `${m}${li}${a.replace('/procyon-fusion', '/procyon-wfm')}Procyon WFM</a></li>`);
  return f;
}

// ---------- FAQ (all answers present, first open) ----------
function faq(items) {
  return '<div class="space-y-3.5">' + items.map((q, i) => `<div class="rounded-xl border border-border bg-card overflow-hidden"><button type="button" data-faq aria-expanded="${i === 0}" class="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"><span class="font-display font-semibold text-foreground text-sm md:text-base">${esc(q.q)}</span>${icon('chevron-down', 18, 'text-primary transition-transform flex-shrink-0' + (i === 0 ? ' rotate-180' : ''))}</button><p class="px-5 pb-5 text-sm md:text-[15px] text-muted-foreground leading-relaxed"${i === 0 ? '' : ' hidden'}>${esc(q.a)}</p></div>`).join('') + '</div>';
}
const faqLd = (items) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) });

// ---------- Page shell ----------
function page(o) {
  const ld = o.ld.map(x => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<!-- Preview of the procyonts.com product page in the live theme. Unlisted on this site: noindex until it ships on procyonts.com. -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${LIVE}/products/${o.slug}">
<meta name="theme-color" content="#0B1626">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Procyon Technostructure">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(o.ogTitle)}">
<meta property="og:description" content="${esc(o.ogDescription)}">
<meta property="og:url" content="${LIVE}/products/${o.slug}">
<meta property="og:image" content="${PREVIEW}${o.ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(o.ogTitle)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.ogTitle)}">
<meta name="twitter:description" content="${esc(o.ogDescription)}">
<meta name="twitter:image" content="${PREVIEW}${o.ogImage}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/live-theme/live.css?v=${V}">
<link rel="stylesheet" href="/live-theme/preview.css?v=${V}">
${ld}
<script src="/live-theme/live.js?v=${V}" defer></script>
</head>
<body>
<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>
${header()}
<main id="main">
${o.body}
</main>
${footer()}
</body>
</html>
`;
}
const crumbs = (name, slug) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
  { '@type': 'ListItem', position: 1, name: 'Home', item: LIVE + '/' },
  { '@type': 'ListItem', position: 2, name: 'Products', item: LIVE + '/products' },
  { '@type': 'ListItem', position: 3, name, item: `${LIVE}/products/${slug}` }] });
const write = (slug, html) => {
  if (/[–—]/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) console.warn('note: en/em dash present on', slug, '(from the live copy)');
  const f = path.join(PUB, slug, 'index.html'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); console.log('built /' + slug);
};

// ---------- Procyon Fusion: the live product page, renamed ----------
{
  const sw = JSON.parse(rename(JSON.stringify(snap.ld.find(x => x['@type'] === 'SoftwareApplication'))));
  sw.url = LIVE + '/products/procyon-fusion';
  const items = snap.ld.find(x => x['@type'] === 'FAQPage').mainEntity.map(q => ({ q: rename(q.name), a: rename(q.acceptedAnswer.text) }));
  let body = clean(snap.fusionBody);
  body = body.replace(/<button id="(rf-[^"]+)" type="button" class="([^"]+)">([^<]+)<\/button>/g, (_, id, cls, label) => `<a id="${id}" href="${DEMO}" class="${cls}">${label}</a>`);
  const fq = body.indexOf('aria-labelledby="rf-faq"');
  const a = body.indexOf('<div class="space-y-3.5">', fq), b = body.indexOf('</div></div></section>', a);
  if (fq < 0 || a < 0 || b < 0) throw new Error('fusion FAQ block not found');
  body = body.slice(0, a) + faq(items) + body.slice(b + '</div>'.length);
  write('procyon-fusion', page({
    slug: 'procyon-fusion',
    title: 'AI-Powered ERP Built on Salesforce® Force.com Platform',
    description: 'Procyon Fusion unifies sales, accounting, inventory, procurement, projects and HR into one AI-powered ERP on Salesforce®. Go live in 2 to 4 weeks.',
    ogTitle: 'ERP, reimagined on Salesforce®. AI in every module.',
    ogDescription: 'Sales, accounting, inventory, procurement, projects, HR and portals on one Salesforce data model, with AI agents across every module. Live in 2 to 4 weeks.',
    ogImage: '/assets/img/og/products-procyon-fusion.jpg',
    ld: [sw, faqLd(items), crumbs('Procyon Fusion', 'procyon-fusion')],
    body
  }));
}

// ---------- Procyon WFM: same theme, same components ----------
{
  // FAQ answers come from the main site's WFM page, so both versions say the same thing
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'products', 'procyon-wfm.html'), 'utf8');
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").trim();
  const items = [...src.matchAll(/<summary>([\s\S]*?)<\/summary><p class="faq-a">([\s\S]*?)<\/p>/g)].map(m => ({ q: strip(m[1]), a: strip(m[2]) }));
  const meta = JSON.parse(src.match(/^<!--meta\s*([\s\S]*?)-->/)[1]);
  const T = fs.readFileSync(path.join(SRC, 'procyon-wfm.body.html'), 'utf8').replace(/^<!--[\s\S]*?-->\s*/, '');
  const orbit = (() => {
    const nodes = ['Planning', 'Attendance', 'Replacements', 'Overtime', 'Reports', 'Audit trail'];
    const lines = nodes.map((_, k) => `<div class="absolute left-1/2 top-1/2 w-[38%] h-px origin-left bg-gradient-to-r from-teal/40 to-transparent" style="transform: rotate(${-90 + k * 60}deg);"></div>`).join('');
    const pills = nodes.map((n, k) => { const ang = (-90 + k * 60) * Math.PI / 180; return `<div class="absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-card border border-border shadow-elevated text-[10px] sm:text-xs font-bold font-display text-foreground whitespace-nowrap" style="left: ${(50 + 44 * Math.cos(ang)).toFixed(3)}%; top: ${(50 + 44 * Math.sin(ang)).toFixed(3)}%;">${n}</div>`; }).join('');
    return `<div class="relative aspect-square w-full max-w-[420px] mx-auto" aria-hidden="true"><div class="absolute inset-[6%] rounded-full border border-teal/25"></div><div class="absolute inset-[18%] rounded-full border border-dashed border-primary/25"></div><div class="absolute inset-[30%] rounded-full border border-teal/15"></div>${lines}<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[38%] aspect-square rounded-full bg-navy-gradient border border-teal/30 shadow-glow-teal flex flex-col items-center justify-center text-center p-3"><span class="font-display font-extrabold text-hero-foreground text-sm sm:text-base leading-tight">Procyon WFM</span><span class="text-[10px] sm:text-[11px] text-teal-glow font-semibold mt-1">Workforce Management</span></div>${pills}</div>`;
  })();
  const li = (t) => `<li class="flex items-start gap-2 text-[13px] text-muted-foreground leading-snug">${icon('check', 14, 'text-brand-green mt-0.5 flex-shrink-0')} ${esc(t)}</li>`;
  const body = T.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (m, k, arg) => {
    const p = arg ? arg.split(':') : [];
    switch (k) {
      case 'icon': return icon(p[0], +p[1], p.slice(2).join(':'));
      case 'demo': return DEMO;
      case 'faq': return faq(items);
      case 'orbit': return orbit;
      case 'cap': return `<div class="group relative p-6 rounded-2xl bg-card border border-border hover:border-teal/50 hover:shadow-glow-teal transition-all overflow-hidden"><div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal to-brand-green opacity-0 group-hover:opacity-100 transition-opacity"></div><div class="w-11 h-11 rounded-xl bg-teal/10 flex items-center justify-center mb-4">${icon(p[0], 21, 'text-teal')}</div><h3 class="font-display font-bold text-foreground">${p[1]}</h3><p class="mt-1 text-xs font-semibold text-primary">${p[2]}</p><ul class="mt-4 space-y-2">${p[3].split('|').map(li).join('')}</ul></div>`;
      case 'step': return `<div class="relative p-6 rounded-2xl bg-card border border-border"><div class="font-display font-extrabold text-2xl text-gradient-primary">${p[0]}</div><h3 class="mt-3 font-display font-bold text-foreground">${p[1]}</h3><p class="mt-2 text-sm text-muted-foreground leading-relaxed">${p[2]}</p></div>`;
      case 'def': return `<div class="p-4 rounded-xl bg-card-glass"><dt class="text-xs text-hero-muted">${p[0]}</dt><dd class="mt-1.5 font-display font-bold text-hero-foreground">${p[1]}</dd></div>`;
      case 'floor': return `<div class="p-6 rounded-2xl bg-card border border-border hover:shadow-elevated transition-shadow"><div class="w-11 h-11 rounded-xl bg-brand-green/10 flex items-center justify-center mb-4">${icon(p[0], 21, 'text-brand-green')}</div><h3 class="font-display font-semibold text-foreground">${p[1]}</h3><ul class="mt-4 space-y-2">${p[2].split('|').map(li).join('')}</ul></div>`;
      case 'why': return `<div class="p-7 rounded-2xl bg-card border border-border border-t-4 border-t-primary hover:shadow-elevated transition-shadow"><div class="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">${icon(p[0], 21, 'text-primary')}</div><h3 class="mt-4 font-display font-bold text-foreground leading-snug">${p[1]}</h3><p class="mt-2.5 text-sm text-muted-foreground leading-relaxed">${p[2]}</p></div>`;
      default: throw new Error('unknown token ' + m);
    }
  });
  const s = meta.service;
  const sw = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: s.name, description: s.description, applicationCategory: 'BusinessApplication', applicationSubCategory: s.subCategory,
    operatingSystem: s.os, inLanguage: s.languages, featureList: s.features, url: LIVE + '/products/procyon-wfm', image: PREVIEW + meta.ogImage,
    audience: { '@type': 'BusinessAudience', audienceType: s.audience }, publisher: { '@type': 'Organization', name: 'Procyon Technostructure', url: LIVE + '/' } };
  const howto = { '@context': 'https://schema.org', '@type': 'HowTo', name: meta.howto.name, description: meta.howto.description, step: meta.howto.steps.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st[0], text: st[1] })) };
  write('procyon-wfm', page({
    slug: 'procyon-wfm', title: meta.title, description: meta.description, ogTitle: meta.ogTitle, ogDescription: meta.ogDescription, ogImage: meta.ogImage,
    ld: [sw, howto, faqLd(items), crumbs('Procyon WFM', 'procyon-wfm')], body: relink(body)
  }));
}
