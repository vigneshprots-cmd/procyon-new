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
const VERSION = { css: 40, pages: 22, js: 32, ed: 2, au: 6 };
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
  logos: cut('<!-- ================= CLIENTS', '<!-- ================= POV'),
  caseBlock: cut('<article class="cs rv">', '</article>', true)
};


// ---------- Promo bar (admin > Promo bar, synced to content/insights/promo.json) ----------
const REDIRECT_MAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'redirects.json'), 'utf8')); } catch (e) { return {}; } })();
function promoBar() {
  let p;
  try { p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'insights', 'promo.json'), 'utf8')); } catch (e) { return ''; }
  if (!p || !p.enabled || !p.message) return '';
  const hex = (v, d) => /^#[0-9a-f]{3,8}$/i.test(String(v || '')) ? v : d;
  let href = String(p.cta_url || '').trim();
  if (href.startsWith('/')) href = REDIRECT_MAP[href.replace(/\/+$/, '')] || href;
  else if (!/^https:\/\//i.test(href)) href = '';
  const e = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const id = e(String(p.updated_at || p.message).slice(0, 40));
  return `<div class="promo${p.animation === 'marquee' ? ' promo--marquee' : ''}" data-promo="${id}" style="--pf:${hex(p.bg_from, '#0B0D10')};--pt:${hex(p.bg_to, '#13161A')};--pc:${hex(p.text_color, '#FFFFFF')}" role="region" aria-label="Announcement">
  <div class="wrap promo__in"><p class="promo__msg"><span>${e(p.message)}</span></p>${href && p.cta_label ? `<a class="promo__cta" href="${e(href)}" data-track="promo_bar">${e(p.cta_label)} <i aria-hidden="true">&rarr;</i></a>` : ''}<button class="promo__x" type="button" aria-label="Dismiss announcement">&times;</button></div>
</div>`;
}
const PROMO = promoBar();

// Short descriptions used by the "related" rail and llms.txt
const PAGES = [
  { slug: '/enterprise/salesforce', name: 'Salesforce consulting', d: 'Implement, fix, extend and run Salesforce with one accountable team.' },
  { slug: '/enterprise/salesforce/implementation', name: 'Implementation & rollout', d: 'Sales, Service, Revenue and Experience Cloud live in 6 to 8 weeks.' },
  { slug: '/enterprise/salesforce/agentforce', name: 'Agentforce', d: 'First AI agents in production in under 4 weeks, on your own data.' },
  { slug: '/enterprise/salesforce/data-cloud', name: 'Data Cloud & integration', d: 'One real-time customer record across ERP, web, apps and service.' },
  { slug: '/enterprise/salesforce/org-audit', name: 'Org audit & rescue', d: 'Find the debt, fix the org and win back user trust.' },
  { slug: '/enterprise/salesforce/managed-services', name: 'Managed services', d: 'Admin, releases and continuous improvement on retainer.' },
  { slug: '/products/ranger-fusion', name: 'Ranger Fusion ERP', d: 'Finance, inventory, projects and HR native to Salesforce.' },
  { slug: '/products', section: 'products', name: 'All products', d: 'Ranger Fusion and Procyon WFM, built, deployed and supported by Procyon.' },
  { slug: '/products/procyon-wfm', section: 'products', name: 'Procyon WFM', d: 'Shift scheduling that enforces rest, hours and certification rules.' },
  { slug: '/about', section: 'company', name: 'About Procyon', d: 'Enterprise platform delivery since 2004, from Novato, Toronto and Chennai.' },
  { slug: '/about/certifications', section: 'company', name: 'Partners & certifications', d: 'Salesforce and ServiceNow partner, ISO 27001, ISO 9001, WBE, NMSDC, SBE.' },
  { slug: '/careers', section: 'company', name: 'Careers', d: 'Salesforce, ServiceNow, AI and data roles across three hubs.' },
  { slug: '/contact', section: 'company', name: 'Contact', d: 'Reach a senior architect within one business day.' },
  { slug: '/services/staff-augmentation', section: 'talent', name: 'Staff augmentation', d: 'Vetted Salesforce, ServiceNow, data and AI people. Shortlist in 72 hours.' },
  { slug: '/talent/delivery-pods', section: 'talent', name: 'Delivery pods', d: 'A cross-functional team with shared accountability for the roadmap.' },
  { slug: '/talent/engagement-models', section: 'talent', name: 'Engagement models', d: 'Fixed scope, time and materials, milestone, outcome-based or managed capacity.' },
  { slug: '/enterprise/servicenow', section: 'servicenow', name: 'ServiceNow practice', d: 'Health check first, then ITSM, SecOps, GRC and Now Assist on a fixed SOW.' },
  { slug: '/enterprise/servicenow/platform-audit', section: 'servicenow', name: 'Platform audit & tech-debt removal', d: 'From cluttered instance to clean platform in 8 weeks.' },
  { slug: '/enterprise/servicenow/itsm-itom', section: 'servicenow', name: 'ITSM, ITOM & CMDB', d: 'Incident, change and asset on data the team trusts.' },
  { slug: '/enterprise/servicenow/security-risk', section: 'servicenow', name: 'Security & risk', d: 'SecOps and GRC for HIPAA, NIST and FedRAMP.' },
  { slug: '/enterprise/servicenow/now-assist', section: 'servicenow', name: 'Now Assist & AI agents', d: 'Generative AI and agents, governed from day one.' },
  { slug: '/enterprise/servicenow/managed-services', section: 'servicenow', name: 'ServiceNow managed services', d: 'A run team for the instance, without the hiring.' },
  { slug: '/services/cloud', section: 'ai', name: 'Cloud transformation', d: 'AWS, Azure and Google Cloud migration, platform and FinOps.' },
  { slug: '/services/cybersecurity', section: 'ai', name: 'Cybersecurity & compliance', d: 'SOC in a Box, continuous GRC and security assessments.' },
  { slug: '/services/government', section: 'ai', name: 'Government solutions', d: 'FedRAMP-aligned modernization and cleared talent for agencies.' },
  { slug: '/blog', section: 'insights', name: 'Blog', d: 'Field notes and frameworks from Procyon practice leaders.' },
  { slug: '/case-studies', section: 'insights', name: 'Case studies', d: 'Outcomes delivered for global clients, with the stack behind them.' },
  { slug: '/insights/events', section: 'insights', name: 'Events', d: 'Meet Procyon at conferences and summits.' },
  { slug: '/ai-data', section: 'ai', name: 'AI & data services', d: 'Agentic AI, knowledge, data and integration for regulated enterprises.' },
  { slug: '/services/ai-ml', section: 'ai', name: 'AI agents & automation', d: 'Multi-agent AI and workflow automation, live in production.' },
  { slug: '/ai-data/knowledge-assistants', section: 'ai', name: 'Knowledge assistants', d: 'Answers from company documents, with the source attached.' },
  { slug: '/services/data-analytics', section: 'ai', name: 'Data platforms & analytics', d: 'Snowflake, Databricks and governed BI. One set of numbers.' },
  { slug: '/solutions/enterprise-integration', section: 'ai', name: 'Integration & APIs', d: 'MuleSoft, events and APIs that keep every system in sync.' },
  { slug: '/solutions/enterprise-application-modernization', section: 'ai', name: 'Product engineering', d: 'Custom products, modernization, cloud and application support.' }
];
const RAIL = {
  salesforce: { h: 'More from the Salesforce practice', pick: p => !p.section },
  company: { h: 'More about Procyon', pick: p => p.section === 'company' || p.slug === '/enterprise/salesforce' || p.slug === '/products/ranger-fusion' },
  servicenow: { h: 'More from the ServiceNow practice', pick: p => p.section === 'servicenow' || ['/services/cybersecurity', '/about/certifications'].includes(p.slug) },
  insights: { h: 'More from Procyon', pick: p => p.section === 'insights' || ['/enterprise/salesforce', '/services/ai-ml', '/contact'].includes(p.slug) },
  ai: { h: 'More from AI, data and engineering', pick: p => p.section === 'ai' || ['/enterprise/salesforce/agentforce', '/enterprise/salesforce/data-cloud'].includes(p.slug) },
  products: { h: 'More from Procyon', pick: p => p.section === 'products' || ['/products/ranger-fusion', '/case-studies', '/contact'].includes(p.slug) },
  talent: { h: 'More ways to add capacity', pick: p => p.section === 'talent' || ['/enterprise/salesforce/managed-services', '/about/certifications', '/contact'].includes(p.slug) }
};
const NAV = { servicenow: ['dd-sn', 'ServiceNow'], ai: ['dd-ai', 'AI &amp; Data'], salesforce: ['dd-sf', 'Salesforce'], company: ['dd-co', 'Company'], insights: ['dd-in', 'Insights'], talent: ['dd-tl', 'Talent'], products: ['dd-pr', 'Products'] };

// ---------- Hero light effects: aurora orbs and a brand-colour light ribbon, shaped per page ----------
function fx(seed) {
  let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const f = (n) => n.toFixed(1);
  const x0 = 380 + rnd() * 320, y0 = 860, x3 = 1520, y3 = -60 + rnd() * 120;
  const c1 = [x0 + 120 + rnd() * 200, 520 + rnd() * 140], c2 = [1020 + rnd() * 220, 300 + rnd() * 260];
  const lines = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25, o = (t - .5) * 150, tw = Math.sin(t * Math.PI) * 70;
    const d = `M${f(x0 + o * .6)} ${y0}C${f(c1[0] + o + tw)} ${f(c1[1] - o * .4)} ${f(c2[0] - o * .5)} ${f(c2[1] + o + tw * .6)} ${x3} ${f(y3 + o * .8)}`;
    const op = (.1 + .55 * Math.pow(Math.sin(t * Math.PI), 2)).toFixed(2);
    lines.push(`<path d="${d}" stroke-width="${i % 6 === 0 ? 1.4 : .8}" opacity="${op}"/>`);
  }
  const mid = `M${f(x0)} ${y0}C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${x3} ${f(y3)}`;
  return `<div class="fx" aria-hidden="true"><i class="fx__orb fx__orb--b"></i><i class="fx__orb fx__orb--g"></i><i class="fx__orb fx__orb--r"></i><i class="fx__grid"></i>`
    + `<svg class="fx__ribbon" viewBox="0 0 1440 820" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="fxg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#BC1E2D"/><stop offset=".45" stop-color="#39B34A"/><stop offset="1" stop-color="#28A8DE"/></linearGradient>`
    + `<filter id="fxb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>`
    + `<g fill="none" stroke="url(#fxg)"><path d="${mid}" stroke-width="90" opacity=".22" filter="url(#fxb)"/>${lines.join('')}<path class="fx__shine" d="${mid}" stroke="#fff" stroke-width="2" opacity=".85"/></g></svg></div>`;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// Social image: an explicit meta.ogImage, else the page's own image from scripts/og-images.js
// (/assets/img/og/<slug-with-dashes>.jpg), else the section image, else the home image.
const OG_DIR = '/assets/img/og/';
const onDisk = (p) => fs.existsSync(path.join(PUB, p));
function ogUrl(meta) {
  if (meta.ogImage) return SITE + meta.ogImage;
  const own = OG_DIR + (meta.slug === '/' ? 'home' : meta.slug.replace(/^\/+|\/+$/g, '').replace(/\//g, '-')) + '.jpg';
  return SITE + ([own, OG_DIR + meta.og + '.jpg'].find(onDisk) || OG_DIR + 'home.jpg');
}

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
      datePublished: meta.published || TODAY, dateModified: meta.modified || TODAY,
      breadcrumb: { '@id': url + '#breadcrumb' },
      primaryImageOfPage: ogUrl(meta),
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
      applicationCategory: 'BusinessApplication', applicationSubCategory: s.subCategory || 'Enterprise Resource Planning',
      operatingSystem: s.os || 'Salesforce Platform', url, featureList: s.features, image: ogUrl(meta),
      ...(s.languages ? { inLanguage: s.languages } : {}),
      ...(s.audience ? { audience: { '@type': 'BusinessAudience', audienceType: s.audience } } : {}),
      brand: { '@type': 'Brand', name: s.name },
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
  const ORG = { '@id': SITE + '/#organization' };
  if (meta.article) {
    const a = meta.article;
    graph.push({ '@type': 'BlogPosting', '@id': url + '#article', headline: a.headline, description: meta.description, image: ogUrl(meta),
      datePublished: meta.published, dateModified: meta.modified || meta.published, articleSection: a.section, keywords: a.keywords,
      wordCount: a.words, author: { '@type': 'Person', name: a.author }, publisher: ORG, mainEntityOfPage: { '@id': url + '#webpage' }, inLanguage: 'en' });
  }
  if (meta.caseStudy) {
    const c = meta.caseStudy;
    graph.push({ '@type': 'Article', '@id': url + '#article', headline: c.headline, description: meta.description, image: ogUrl(meta),
      articleSection: 'Case study', about: [{ '@type': 'Organization', name: c.client }].concat((c.stack || []).map(x => ({ '@type': 'Thing', name: x }))),
      datePublished: meta.published, dateModified: meta.modified || meta.published, author: ORG, publisher: ORG, mainEntityOfPage: { '@id': url + '#webpage' } });
  }
  if (meta.event) {
    const e = meta.event;
    graph.push({ '@type': 'Event', '@id': url + '#event', name: e.name, description: meta.description, startDate: e.start, endDate: e.end,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: e.venue || e.location, address: e.location }, image: ogUrl(meta),
      organizer: { '@type': 'Organization', name: e.organizer, url: e.organizerUrl }, performer: ORG, url });
  }
  if (meta.job) {
    const j = meta.job;
    graph.push({ '@type': 'JobPosting', '@id': url + '#job', title: j.title, description: j.html, datePosted: j.posted, employmentType: j.type,
      hiringOrganization: { '@type': 'Organization', name: 'Procyon Technostructure', sameAs: SITE + '/', logo: SITE + '/assets/img/procyon-logo.svg' },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: 'RNG Tower, 824/1, Anna Salai, CIT Nagar West', addressLocality: 'Chennai', addressRegion: 'Tamil Nadu', postalCode: '600035', addressCountry: 'IN' } },
      experienceRequirements: j.experience, occupationalCategory: j.department, directApply: true, url });
  }
  if (meta.howto) {
    const h = meta.howto;
    graph.push({ '@type': 'HowTo', '@id': url + '#howto', name: h.name, description: h.description, inLanguage: 'en',
      step: h.steps.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st[0], text: st[1], url: url + '#cycle' })) });
  }
  if (meta.itemList) {
    graph.push({ '@type': 'ItemList', '@id': url + '#products', name: meta.title, numberOfItems: meta.itemList.length,
      itemListElement: meta.itemList.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + it[1],
        item: { '@type': 'SoftwareApplication', '@id': SITE + it[1] + '#service', name: it[0], description: it[2], url: SITE + it[1], applicationCategory: 'BusinessApplication' } })) });
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
    .replace(/<!--@include ([\w/.-]+)-->/g, (_, f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'))
    .replace(/<!--@crumbs-->/g, crumbsHtml(meta))
    .replace(/\s*<!--@updated-->/g, '')
    .replace(/<!--@logos-->/g, CHROME.logos.trim())
    .replace(/<!--@case-->/g, CHROME.caseBlock)
    .replace(/<!--@related-->/g, related(meta.slug, meta.section))
    .replace(/<!--@cta (\{[\s\S]*?\})-->/g, (_, j) => cta(JSON.parse(j)))
    .replace(/(<section class="hx[^"]*"[^>]*>)(?!\s*<div class="fx")/, (m) => m + '\n  ' + fx(meta.slug));
  const url = SITE + meta.slug;
  const ogImg = ogUrl(meta);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<meta name="description" content="${esc(meta.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#05060A">

<meta property="og:type" content="${meta.article ? 'article' : 'website'}">${meta.article ? `
<meta property="article:published_time" content="${meta.published}">
<meta property="article:section" content="${esc(meta.article.section || '')}">` : ''}
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
<link rel="preload" href="/assets/fonts/montserrat-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/styles.css?v=${VERSION.css}">
<link rel="stylesheet" href="/assets/css/pages.css?v=${VERSION.pages}">
<link rel="stylesheet" href="/assets/css/editorial.css?v=${VERSION.ed}">${meta.insights ? `
<link rel="stylesheet" href="/assets/css/insights.css?v=${VERSION.pages}">` : ''}
<link rel="stylesheet" href="/assets/css/aurora.css?v=${VERSION.au}">

<script type="application/ld+json">
${schema(meta, body)}
</script>
</head>
<body class="pg pg--${meta.bodyClass || 'svc'}">
<a class="skip" href="#main">Skip to content</a>
${PROMO}
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

// OneDrive and antivirus can briefly lock a file; retry instead of failing the whole build.
function writeRetry(file, data) {
  for (let i = 0; ; i++) {
    try { return fs.writeFileSync(file, data); } catch (e) {
      if (i >= 8) throw e;
      const t = Date.now(); while (Date.now() - t < 400 * (i + 1)) { /* wait */ }
    }
  }
}
let built = 0;
const urls = [{ loc: SITE + '/', lastmod: TODAY, pr: '1.0' }];
for (const file of walk(SRC).filter(f => f.endsWith('.html') && !f.includes(path.sep + '_partials' + path.sep))) {
  const src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\n?/);
  if (!m) throw new Error('missing meta block: ' + file);
  const meta = JSON.parse(m[1]);
  const body = src.slice(m[0].length);
  const out = path.join(PUB, meta.slug, 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  writeRetry(out, render(meta, body));
  built++;
  const depth = meta.slug.split('/').length - 1;
  urls.push({ loc: SITE + meta.slug, lastmod: meta.modified || TODAY, pr: meta.section === 'insights' && depth > 1 ? '0.6' : depth <= 1 ? '0.9' : depth === 2 ? '0.8' : '0.7' });
  console.log('built', meta.slug);
}
{
  const hp = path.join(PUB, 'index.html');
  let h = fs.readFileSync(hp, 'utf8');
  const block = '<!--promo-->' + (PROMO ? '\n' + PROMO + '\n' : '') + '<!--/promo-->';
  h = /<!--promo-->[\s\S]*?<!--\/promo-->/.test(h) ? h.replace(/<!--promo-->[\s\S]*?<!--\/promo-->/, block)
    : h.replace('<a class="skip" href="#main">Skip to content</a>', '<a class="skip" href="#main">Skip to content</a>\n' + block);
  h = h.replace(/<!--@fx-->|<!--fx-->[\s\S]*?<!--\/fx-->/, () => '<!--fx-->' + fx('home') + '<!--/fx-->');
  writeRetry(hp, h);
}
urls.sort((a, b) => a.loc.localeCompare(b.loc));
const urlXml = urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <priority>${u.pr}</priority>\n  </url>`).join('\n');
fs.writeFileSync(path.join(PUB, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlXml}\n</urlset>\n`);
console.log(built + ' pages, sitemap with ' + urls.length + ' URLs');
module.exports = { PAGES };
