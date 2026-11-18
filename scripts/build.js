#!/usr/bin/env node
// Builds the inner pages from src/pages/**.html.
// Site chrome (header, pop-up form, footer), the client logo strip and the healthcare case
// are taken from public/index.html, so the home page stays the single source of truth.
//
// Page source format:
//   <!--meta { ...JSON... } -->   (title, description, slug, og, crumbs, service, ...)
//   ...body markup, with optional directives:
//   <!--@logos-->  <!--@case-->  <!--@related-->  <!--@cta {"h":"...","p":"...","interest":"...","title":"..."}-->
//
// usage: node scripts/build.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SRC = path.join(ROOT, 'src', 'pages');
const SITE = 'https://procyonts.com';
const VERSION = { css: 28, pages: 8, js: 29 };
const TODAY = new Date().toISOString().slice(0, 10);

const home = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to, incl) => {
  const a = home.indexOf(from), b = home.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('marker not found: ' + from + ' / ' + to);
  return home.slice(a, incl ? b + to.length : b);
};
const CHROME = {
  header: cut('<!-- ================= HEADER', '</header>', true),
  modal: cut('<!-- ================= MODAL', '</dialog>', true),
  footer: cut('<!-- ================= FOOTER', '<script src="/assets/js/main.js'),
  logos: cut('<!-- ================= CLIENTS', '<!-- ================= THE GAP'),
  caseBlock: cut('<article class="case rv" data-case>', '</article>', true)
};

// Short descriptions used by the "related" rail and llms.txt
const PAGES = [
  { slug: '/salesforce/', name: 'Salesforce consulting', d: 'Implement, fix, extend and run Salesforce with one accountable team.' },
  { slug: '/salesforce/implementation/', name: 'Implementation & rollout', d: 'Sales, Service, Revenue and Experience Cloud live in 6 to 8 weeks.' },
  { slug: '/salesforce/agentforce/', name: 'Agentforce', d: 'First AI agents in production in under 4 weeks, on your own data.' },
  { slug: '/salesforce/data-cloud/', name: 'Data Cloud & integration', d: 'One real-time customer record across ERP, web, apps and service.' },
  { slug: '/salesforce/org-audit/', name: 'Org audit & rescue', d: 'Find the debt, fix the org and win back user trust.' },
  { slug: '/salesforce/managed-services/', name: 'Managed services', d: 'Admin, releases and continuous improvement on retainer.' },
  { slug: '/ranger-fusion/', name: 'Ranger Fusion ERP', d: 'Finance, inventory, projects and HR native to Salesforce.' },
  { slug: '/about/', section: 'company', name: 'About Procyon', d: 'Enterprise platform delivery since 2004, from Novato, Toronto and Chennai.' },
  { slug: '/about/certifications/', section: 'company', name: 'Partners & certifications', d: 'Salesforce and ServiceNow partner, ISO 27001, ISO 9001, WBE, NMSDC, SBE.' },
  { slug: '/careers/', section: 'company', name: 'Careers', d: 'Salesforce, ServiceNow, AI and data roles across three hubs.' },
  { slug: '/contact/', section: 'company', name: 'Contact', d: 'Reach a senior architect within one business day.' },
  { slug: '/talent/staff-augmentation/', section: 'talent', name: 'Staff augmentation', d: 'Vetted Salesforce, ServiceNow, data and AI people. Shortlist in 72 hours.' },
  { slug: '/talent/delivery-pods/', section: 'talent', name: 'Delivery pods', d: 'A cross-functional team with shared accountability for the roadmap.' },
  { slug: '/talent/engagement-models/', section: 'talent', name: 'Engagement models', d: 'Fixed scope, time and materials, milestone, outcome-based or managed capacity.' }
];
const RAIL = {
  salesforce: { h: 'More from the Salesforce practice', pick: p => !p.section },
  company: { h: 'More about Procyon', pick: p => p.section === 'company' || p.slug === '/salesforce/' || p.slug === '/ranger-fusion/' },
  talent: { h: 'More ways to add capacity', pick: p => p.section === 'talent' || ['/salesforce/managed-services/', '/about/certifications/', '/contact/'].includes(p.slug) }
};
const NAV = { salesforce: ['dd-sf', 'Salesforce'], company: ['dd-co', 'Company'], talent: ['dd-tl', 'Talent'] };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function related(current, section) {
  const rail = RAIL[section] || RAIL.salesforce;
  const items = PAGES.filter(p => p.slug !== current && rail.pick(p)).map(p =>
    `      <li><a href="${p.slug}"><b>${esc(p.name)}</b><span>${esc(p.d)}</span><i aria-hidden="true">&rarr;</i></a></li>`).join('\n');
  return `<section class="rel" aria-labelledby="rel-h">
  <div class="wrap">
    <h2 id="rel-h" class="rel__h">${rail.h}</h2>
    <ul class="rel__list">
${items}
    </ul>
  </div>
</section>`;
}

function cta(o) {
  const interest = esc(o.interest == null ? 'Salesforce' : o.interest);
  const title = o.title ? ` data-title="${esc(o.title)}"` : '';
  const kicker = o.kicker ? ` data-kicker="${esc(o.kicker)}"` : '';
  return `<section class="cta" id="audit" aria-labelledby="cta-h">
  <img class="cta__mark" src="/favicon.svg" alt="" width="760" height="760" loading="lazy" aria-hidden="true">
  <div class="wrap cta__in">
    <div class="cta__copy">
      <h2 id="cta-h" class="rv">${o.h}</h2>
      <p class="rv" data-d="1">${o.p}</p>
      <p class="cta__direct rv" data-d="2">Rather call? <a href="tel:+14153828040" data-track="phone_click">+1 415 382 8040</a> <a href="mailto:sales@procyonts.com" data-track="email_click">sales@procyonts.com</a></p>
    </div>
    <div class="paths">
      <a class="path path--audit rv" data-d="1" href="#audit" data-open="audit" data-interest="${interest}"${title}${kicker} data-track="cta_close_audit">
        <span class="path__k">30-minute call</span>
        <b>${o.pathTitle || 'Talk to an architect'}</b>
        <span>${o.pathText || 'A senior architect, not a sales rep. The call ends in a written plan with scope, timeline and a cost range.'}</span>
        <ol class="when">
          <li><b>Today</b> the brief is sent</li>
          <li><b>1 business day</b> an architect replies</li>
          <li><b>Within a week</b> the written plan</li>
        </ol>
        <em>${o.pathCta || 'Book the architect call'} &rarr;</em>
      </a>
      <a class="path path--score rv" data-d="2" href="#audit" data-open="score" data-track="cta_close_readiness">
        <span class="path__k">2 minutes, self-serve</span>
        <b>AI readiness check</b>
        <span>Six questions about the ${o.platform || 'Salesforce'} platform. An instant readiness level and the three fixes that unlock AI agents.</span>
        <svg class="path__gauge" viewBox="0 0 120 70" aria-hidden="true"><path d="M10 64a50 50 0 0 1 100 0" class="g-track"/><path d="M10 64a50 50 0 0 1 100 0" class="g-val"/></svg>
        <em>Run the readiness check &rarr;</em>
      </a>
    </div>
  </div>
</section>`;
}

function header(slug, section) {
  const [id, label] = NAV[section] || NAV.salesforce;
  let h = CHROME.header.replace(`aria-controls="${id}">${label}</button>`, `aria-controls="${id}" data-current>${label}</button>`);
  h = h.split(`href="${slug}"`).join(`href="${slug}" aria-current="page"`);
  return h;
}

function faqFrom(body) {
  const out = [];
  const re = /<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<p class="faq-a">([\s\S]*?)<\/p>\s*<\/details>/g;
  let m;
  while ((m = re.exec(body))) out.push({ q: strip(m[1]), a: strip(m[2]) });
  return out;
}

function schema(meta, body) {
  const url = SITE + meta.slug;
  const crumbs = [['Home', '/']].concat(meta.crumbs || []);
  const graph = [
    {
      '@type': meta.pageType || 'WebPage', '@id': url + '#webpage', url, name: meta.title, description: meta.description,
      isPartOf: { '@id': SITE + '/#website' }, about: { '@id': meta.service ? url + '#service' : SITE + '/#organization' }, inLanguage: 'en',
      datePublished: meta.published || TODAY, dateModified: TODAY,
      breadcrumb: { '@id': url + '#breadcrumb' },
      primaryImageOfPage: SITE + '/assets/img/og/' + meta.og + '.jpg',
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.ph__lede', '.faq-a'] }
    },
    {
      '@type': 'BreadcrumbList', '@id': url + '#breadcrumb',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] }))
    }
  ];
  const s = meta.service;
  if (s && s.software) {
    graph.push({
      '@type': 'SoftwareApplication', '@id': url + '#service', name: s.name, description: s.description,
      applicationCategory: 'BusinessApplication', applicationSubCategory: 'Enterprise Resource Planning',
      operatingSystem: 'Salesforce Platform', url, featureList: s.features,
      publisher: { '@id': SITE + '/#organization' }, provider: { '@id': SITE + '/#organization' }
    });
  } else if (s) {
    const svc = {
      '@type': 'Service', '@id': url + '#service', name: s.name, serviceType: s.serviceType, description: s.description, url,
      provider: { '@id': SITE + '/#organization' },
      areaServed: [{ '@type': 'Country', name: 'United States' }, { '@type': 'Country', name: 'Canada' }, { '@type': 'Country', name: 'India' }],
      audience: { '@type': 'BusinessAudience', audienceType: s.audience || 'Mid-market and enterprise companies running Salesforce' }
    };
    if (s.offers && s.offers.length) {
      svc.hasOfferCatalog = {
        '@type': 'OfferCatalog', name: s.catalogName || s.name,
        itemListElement: s.offers.map(o => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: o[0], description: o[1] } }))
      };
    }
    graph.push(svc);
  }
  graph.push(Object.assign({ '@type': 'Organization', '@id': SITE + '/#organization', name: 'Procyon Technostructure', url: SITE + '/', logo: SITE + '/assets/img/procyon-logo.svg' }, meta.org || {}));
  const faq = faqFrom(body);
  if (faq.length) {
    graph.push({
      '@type': 'FAQPage', '@id': url + '#faq',
      mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

function crumbsHtml(meta) {
  const list = [['Home', '/']].concat(meta.crumbs || []);
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>` + list.map((c, i) =>
    i === list.length - 1 ? `<li aria-current="page">${esc(c[0])}</li>` : `<li><a href="${c[1]}">${esc(c[0])}</a></li>`).join('') + `</ol></nav>`;
}

function render(meta, body) {
  body = body
    .replace(/<!--@crumbs-->/g, crumbsHtml(meta))
    .replace(/\s*<!--@updated-->/g, '')
    .replace(/<!--@logos-->/g, CHROME.logos.trim())
    .replace(/<!--@case-->/g, CHROME.caseBlock)
    .replace(/<!--@related-->/g, related(meta.slug, meta.section))
    .replace(/<!--@cta (\{[\s\S]*?\})-->/g, (_, j) => cta(JSON.parse(j)));
  const url = SITE + meta.slug;
  const ogImg = SITE + '/assets/img/og/' + meta.og + '.jpg';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0B0D10">

<meta property="og:type" content="website">
<meta property="og:site_name" content="Procyon Technostructure">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">
<meta property="og:description" content="${esc(meta.ogDescription || meta.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(meta.ogTitle || meta.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@procyon_ts">
<meta name="twitter:title" content="${esc(meta.twitterTitle || meta.ogTitle || meta.title)}">
<meta name="twitter:description" content="${esc(meta.twitterDescription || meta.ogDescription || meta.description)}">
<meta name="twitter:image" content="${ogImg}">

<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

<script>document.documentElement.classList.add('js')</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css?v=${VERSION.css}">
<link rel="stylesheet" href="/assets/css/pages.css?v=${VERSION.pages}">

<script type="application/ld+json">
${schema(meta, body)}
</script>
</head>
<body class="pg pg--${meta.bodyClass || 'svc'}">
<a class="skip" href="#main">Skip to content</a>

${header(meta.slug, meta.section)}

<main id="main">
${body.trim()}
</main>

${CHROME.modal}


${CHROME.footer.trim()}

<script src="/assets/js/main.js?v=${VERSION.js}" defer></script>
<script src="/assets/js/pages.js?v=${VERSION.pages}" defer></script>
</body>
</html>
`;
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

let built = 0;
for (const file of walk(SRC).filter(f => f.endsWith('.html'))) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\n?/);
  if (!m) throw new Error('missing meta block: ' + file);
  const meta = JSON.parse(m[1]);
  const body = src.slice(m[0].length);
  const out = path.join(PUB, meta.slug, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(meta, body));
  built++;
  console.log('built', meta.slug);
}
console.log(built + ' pages');
module.exports = { PAGES };
