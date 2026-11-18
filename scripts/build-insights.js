#!/usr/bin/env node
// Turns content/insights/*.json (synced from the live site) into page sources for the
// standard build: /blog, /blog/<slug>, /case-studies, /case-studies/<slug>,
// /insights/events, /insights/events/<slug>, /careers/<slug>, plus Careers page partials.
// Output: src/pages/_gen/**.html and src/pages/_partials/*.html (both regenerated every run).
// usage: node scripts/build-insights.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'content', 'insights');
const GEN = path.join(ROOT, 'src', 'pages', '_gen');
const PARTS = path.join(ROOT, 'src', 'pages', '_partials');
const TODAY = new Date().toISOString().slice(0, 10);
const load = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
fs.rmSync(GEN, { recursive: true, force: true });
const blog = load('blog.json'), cases = load('case-studies.json').map(c => Object.assign(c, { title: String(c.title).replace(/\s+\d{1,3}$/, '') })), events = load('events.json'), jobs = load('jobs.json');

// Editorial overrides on top of the CMS: author renames and event series order/dates.
const OVR = fs.existsSync(path.join(DATA, 'overrides.json')) ? load('overrides.json') : { authors: {}, series: [] };
const SERIES = new Map();
for (const p of blog) if (OVR.authors[p.author]) p.author = OVR.authors[p.author];
for (const s of OVR.series) s.posts.forEach(([slug, date], i) => {
  const p = blog.find(x => x.slug === slug);
  if (!p) return;
  p.published_at = date; p.updated_at = date;
  SERIES.set(slug, { s, i });
});
blog.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
const seriesOf = (slug) => SERIES.get(slug);
const seriesBox = (p) => {
  const m = seriesOf(p.slug); if (!m) return '';
  const { s, i } = m, list = s.posts.map(([slug]) => blog.find(x => x.slug === slug)).filter(Boolean);
  return `<nav class="series" aria-label="${esc(s.name)}">
        <p class="series__k"><b>${esc(s.name)}</b><span>Part ${i + 1} of ${list.length}</span></p>
        <ol>${list.map((x, j) => j === i ? `<li aria-current="page"><span>${esc(x.title)}</span></li>` : `<li><a href="/blog/${x.slug}">${esc(x.title)}</a></li>`).join('')}</ol>
        <p class="series__ev"><a href="${s.event}">${esc(s.eventLabel)} <i aria-hidden="true">&rarr;</i></a></p>
      </nav>`;
};
const evSeries = (e) => {
  const s = OVR.series.find(x => x.event === '/insights/events/' + e.slug); if (!s) return '';
  const list = s.posts.map(([slug]) => blog.find(x => x.slug === slug)).filter(Boolean);
  return `<section class="sx sx--paper" aria-labelledby="ser-h"><div class="wrap">
  <div class="sx__head"><div><h2 id="ser-h" class="rv">The ${esc(s.name.replace(/ series$/, ''))} series, <em>in reading order.</em></h2><p class="rv" data-d="1">From preparation to the takeaways, ${list.length} articles in the order they were published.</p></div><a class="sx__go rv" href="/blog/${list[0].slug}">Start with part 1 <i aria-hidden="true">&rarr;</i></a></div>
  <ol class="ev-series">${list.map((p, i) => `<li class="rv"><a href="/blog/${p.slug}"><small>Part ${i + 1} &middot; <time datetime="${day(p.published_at)}">${fmt(p.published_at)}</time></small><b>${esc(p.title)}</b><span>${esc(clip(p.excerpt, 130))}</span></a></li>`).join('')}</ol>
</div></section>`;
};
const seriesNext = (p) => {
  const m = seriesOf(p.slug); if (!m) return '';
  const { s, i } = m, list = s.posts.map(([slug]) => blog.find(x => x.slug === slug)).filter(Boolean);
  const prev = list[i - 1], next = list[i + 1];
  return `<div class="series-nav">${prev ? `<a class="series-nav__prev" href="/blog/${prev.slug}"><small>&larr; Part ${i}</small><b>${esc(prev.title)}</b></a>` : '<span></span>'}${next ? `<a class="series-nav__next" href="/blog/${next.slug}"><small>Part ${i + 2} &rarr;</small><b>${esc(next.title)}</b></a>` : ''}</div>`;
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const day = (d) => String(d).slice(0, 10);
const words = (html) => String(html).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,;:.]$/, '') + '.'; };
// Meta titles never carry the brand; these live titles do, so they get a keyword-led rewrite.
const TITLE_FIX = {
  'meet-procyon-at-dreamforce-2026': 'Dreamforce 2026: Private 1:1 Salesforce Strategy Sessions',
  'procyon-salesforce-accelerators-time-to-value': 'How Salesforce Accelerators Halve Time-to-Value',
  'dreamforce-2026': 'Dreamforce 2026 | Book a 1:1 Salesforce Strategy Session',
  'nmsdc-annual-conference-exchange-2026': 'NMSDC 2026 | Certified MBE Partner 1:1 Meetings'
};
const title60 = (t) => { t = String(t).replace(/\s*\|\s*Procyon.*$/i, '').trim(); return t.length <= 60 ? t : clip(t, 60).replace(/\.$/, ''); };
const desc = (d, fallback) => clip(d || fallback, 158);
const PRONOUN = /\b(my|your|you|us|our|we|me)\b/i;
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split(/\n+/)).map(x => String(x).replace(/^[\s\-•*]+/, '').trim()).filter(Boolean);
const lis = (arr) => arr.map(x => `<li>${esc(x)}</li>`).join('');
const write = (rel, meta, body) => {
  const f = path.join(GEN, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `<!--meta\n${JSON.stringify(meta, null, 1)}\n-->\n${body.trim()}\n`);
};
const faqHtml = (faqs, heading) => {
  const list = (faqs || []).filter(f => f && (f.q || f.question) && (f.a || f.answer));
  if (!list.length) return '';
  return `<section class="faq" id="faq" aria-labelledby="faq-h">
  <div class="wrap faq__in">
    <h2 id="faq-h" class="rv">${heading}</h2>
    <div class="faq__list">
${list.map((f, i) => `      <details class="rv"${i === 0 ? ' open' : ''}><summary>${esc(f.q || f.question)}</summary><p class="faq-a">${esc(f.a || f.answer)}</p></details>`).join('\n')}
    </div>
  </div>
</section>`;
};

// ---------- Post body clean-up: safe, on-brand, TOC-ready ----------
function cleanBody(html) {
  let h = String(html || '')
    .replace(/<title[\s\S]*?<\/title>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '')
    .replace(/href="https?:\/\/(www\.)?procyonts\.com(\/[^"]*)?"/gi, (m, w, p) => `href="${p || '/'}"`)
    .replace(/href="(\/[^"#?]+?)\/(#[^"]*)?"/g, (m, p, hash) => `href="${p}${hash || ''}"`);
  h = h.replace(/<a ([^>]*href="https?:\/\/[^"]+"[^>]*)>/gi, (m, attrs) => /target=/.test(attrs) ? `<a ${attrs} rel="noopener">` : `<a ${attrs} target="_blank" rel="noopener">`);
  const toc = [];
  const used = new Set();
  h = h.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (m, attrs, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    let id = (attrs.match(/id="([^"]+)"/) || [])[1];
    if (!id) { id = slugify(text).slice(0, 60) || 'section'; while (used.has(id)) id += '-x'; attrs += ` id="${id}"`; }
    used.add(id);
    toc.push({ id, text });
    return `<h2${attrs}>${inner}</h2>`;
  });
  return { html: h, toc };
}

const cta = (o) => `<!--@cta ${JSON.stringify(o)}-->`;
const ctaBlog = cta({ h: 'Turn the idea into <em>a written plan.</em>', p: 'A senior architect reviews the platform and the goal, then sends scope, timeline and a cost range. Free, and it stays with the client.', interest: '', kicker: 'From the blog', title: 'Brief a senior architect', pathTitle: 'Talk to an architect', pathCta: 'Book the architect call', platform: 'Salesforce or ServiceNow' });

// ---------- Blog ----------
const cats = [...new Set(blog.map(p => p.category.trim()))];
const catCount = (c) => blog.filter(p => p.category.trim() === c).length;
const postRow = (p, i) => `      <a class="ins-row rv" data-team="${slugify(p.category)}" href="/blog/${p.slug}">
        ${p.image ? `<img class="ins-row__img" src="${p.image.src}" alt="" width="1200" height="675" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async">` : '<span class="ins-row__img"></span>'}
        <span class="ins-row__meta"><b>${esc(p.category.trim())}</b><time datetime="${day(p.published_at)}">${fmt(p.published_at)}</time><span>${esc(p.read_time || (p.reading_minutes ? p.reading_minutes + ' min read' : ''))}</span></span>
        <span class="ins-row__t">${esc(p.title)}</span>
        <span class="ins-row__d">${esc(clip(p.excerpt, 170))}</span>
        <i aria-hidden="true">&rarr;</i>
      </a>`;

const featured = blog[0];
write('blog/index.html', {
  slug: '/blog', section: 'insights', insights: true, pageType: 'CollectionPage',
  title: 'Salesforce, ServiceNow & Enterprise AI Insights | Blog',
  description: 'Field notes and frameworks from Procyon practice leaders on Agentforce, Salesforce, ServiceNow, cloud, data, supplier diversity and enterprise AI.',
  ogTitle: 'Field notes from the people who do the work',
  ogDescription: 'Implementation guides, rescue playbooks and AI frameworks from the Salesforce, ServiceNow and data practices at Procyon.',
  og: 'blog', bodyClass: 'ins-blog', crumbs: [['Blog', '/blog']]
}, `
<section class="ph ph--ins" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__grid">
      <div class="ph__copy">
        <p class="pill"><span class="pill__dot"></span>Blog</p>
        <h1 id="ph-h" class="ph__h">Field notes from the people <em>who do the work.</em></h1>
        <p class="ph__lede"><b>Frameworks, playbooks and lessons from Procyon's Salesforce, ServiceNow, data and AI practices.</b> Written by the architects who run the audits, rollouts and rescues, for the leaders who have to make the call.</p>
      </div>
      <div class="ph__w">
        <a class="feat" href="/blog/${featured.slug}">
          ${featured.image ? `<img src="${featured.image.src}" alt="" width="1200" height="675" decoding="async">` : ''}
          <span class="feat__k">Latest &middot; ${esc(featured.category.trim())}</span>
          <b>${esc(featured.title)}</b>
          <span>${esc(clip(featured.excerpt, 140))}</span>
          <em>Read the article &rarr;</em>
        </a>
      </div>
    </div>
  </div>
</section>

<section class="sx sx--paper ins" aria-labelledby="list-h">
  <div class="wrap">
    <h2 id="list-h" class="visually-hidden">All articles</h2>
    <div class="uc__bar ins__bar" data-filter="ins-list">
      <span>Topic</span>
      <button class="chipf" type="button" data-f="all" aria-pressed="true">All <small>${blog.length}</small></button>
${cats.map(c => `      <button class="chipf" type="button" data-f="${slugify(c)}" aria-pressed="false">${esc(c)} <small>${catCount(c)}</small></button>`).join('\n')}
    </div>
    <div class="ins-list" id="ins-list">
${blog.map(postRow).join('\n')}
    </div>
  </div>
</section>

${cta({ h: 'Read enough? <em>Talk to the author.</em>', p: 'Every article comes from a live practice. A senior architect can apply it to the actual platform, then send a written plan with scope, timeline and a cost range.', interest: '', kicker: 'From the blog', title: 'Brief a senior architect', pathTitle: 'Talk to an architect', pathCta: 'Book the architect call', platform: 'Salesforce or ServiceNow' })}
`);

for (const p of blog) {
  const { html, toc } = cleanBody(p.body_html);
  const sm = seriesOf(p.slug);
  const inSeries = sm ? sm.s.posts.map(([slug]) => slug) : [];
  const seriesRel = sm ? inSeries.slice(sm.i + 1).concat(inSeries.slice(0, sm.i).reverse()).map(slug => blog.find(x => x.slug === slug)).filter(Boolean) : [];
  const related = [...new Set(seriesRel.concat(blog.filter(x => x.slug !== p.slug && x.category.trim() === p.category.trim()), blog.filter(x => x.slug !== p.slug && x.category.trim() !== p.category.trim())))].slice(0, 3);
  const ctaLabel = p.cta_label && !PRONOUN.test(p.cta_label) ? p.cta_label : 'Talk to a senior architect';
  const ctaHref = p.cta_url && !/^\/contact/.test(p.cta_url) ? p.cta_url : '#audit';
  const ctaAttrs = ctaHref === '#audit' ? ` data-open="audit" data-interest="" data-kicker="${esc(p.category.trim())}" data-title="Brief a senior architect" data-message="Read: ${esc(p.title)}.&#10;Current situation: "` : '';
  const tocHtml = toc.length > 2 ? `<nav class="toc" aria-label="On this page" data-toc><b>On this page</b><ol>${toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol></nav>` : '';
  const share = encodeURIComponent('https://procyonts.com/blog/' + p.slug);
  write(`blog/${p.slug}.html`, {
    slug: '/blog/' + p.slug, section: 'insights', insights: true,
    title: TITLE_FIX[p.slug] || title60(p.seo_title || p.title), description: desc(p.seo_description, p.excerpt),
    ogTitle: clip(p.title, 95).replace(/\.$/, ''), ogDescription: desc(p.excerpt, p.seo_description),
    ogImage: p.image ? p.image.og : '/assets/img/og/blog.jpg', bodyClass: 'ins-post',
    published: day(p.published_at), modified: day(p.updated_at || p.published_at),
    crumbs: [['Blog', '/blog'], [clip(p.title, 48).replace(/\.$/, ''), '/blog/' + p.slug]],
    article: { headline: clip(p.title, 110), section: p.category.trim(), keywords: (p.tags || []).join(', '), author: p.author || 'Procyon Technostructure', words: words(html) }
  }, `
<section class="ph ph--post" aria-labelledby="ph-h">
  <div class="wrap">
    <!--@crumbs-->
    <div class="post__head">
      <p class="pill"><span class="pill__dot"></span>${esc(p.category.trim())}</p>
      <h1 id="ph-h" class="ph__h">${esc(p.title)}</h1>
      <p class="ph__lede">${esc(p.excerpt)}</p>
      <p class="post__by"><b>${esc(p.author || 'Procyon Technostructure')}</b>${p.author_role ? `<span>${esc(p.author_role)}</span>` : ''}<time datetime="${day(p.published_at)}">${fmt(p.published_at)}</time><span>${esc(p.read_time || '')}</span></p>
    </div>
  </div>
</section>
${p.image ? `<div class="post__cover"><div class="wrap"><img src="${p.image.src}" alt="${esc(p.title)}" width="1200" height="675" decoding="async" fetchpriority="high"></div></div>` : ''}
<div class="readbar" aria-hidden="true"><i></i></div>
<section class="post" aria-label="Article">
  <div class="wrap post__grid">
    <article class="post__body" data-readbody>
      ${tocHtml ? `<details class="toc-m"><summary>On this page</summary>${tocHtml.replace(' data-toc', '')}</details>` : ''}
      ${seriesBox(p)}
${html}
      ${(p.tags || []).length ? `<p class="post__tags">${p.tags.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
      ${seriesNext(p)}
    </article>
    <aside class="post__side">
      <div class="post__sticky">
        ${tocHtml}
        <div class="post__cta">
          <small>${esc(p.category.trim())}</small>
          <b>Apply this to the actual platform.</b>
          <span>A senior architect replies within one business day.</span>
          <a class="btn btn--red btn--block" href="${ctaHref}"${ctaAttrs} data-track="post_side_cta">${esc(ctaLabel)} <i aria-hidden="true">&rarr;</i></a>
        </div>
        <p class="post__share"><span>Share</span><a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a><a href="https://x.com/intent/post?url=${share}" target="_blank" rel="noopener">X</a><a href="mailto:?subject=${encodeURIComponent(p.title)}&amp;body=${share}">Email</a></p>
      </div>
    </aside>
  </div>
</section>

${faqHtml(p.faqs, 'Questions this article <em>answers.</em>')}

<section class="sx sx--paper" aria-labelledby="more-h">
  <div class="wrap">
    <div class="sx__head"><div><h2 id="more-h" class="rv">Read next.</h2></div><a class="sx__go rv" href="/blog">All articles <i aria-hidden="true">&rarr;</i></a></div>
    <div class="ins-cards">
${related.map(r => `      <a class="ins-card rv" href="/blog/${r.slug}">${r.image ? `<img src="${r.image.src}" alt="" width="1200" height="675" loading="lazy" decoding="async">` : ''}<span>${esc(r.category.trim())} &middot; ${esc(r.read_time || '')}</span><b>${esc(r.title)}</b></a>`).join('\n')}
    </div>
  </div>
</section>

${ctaBlog}
`);
}

// ---------- Case studies ----------
const caseRow = (c) => {
  const o = (c.outcomes || [])[0] || {};
  return `      <a class="case-row rv" href="/case-studies/${c.slug}">
        ${c.image ? `<img src="${c.image.src}" alt="" width="1200" height="675" loading="lazy" decoding="async">` : ''}
        <span class="case-row__fig"><b>${esc(o.value || '')}</b><span>${esc(o.label || '')}</span></span>
        <span class="case-row__body"><small>${esc(c.industry)} &middot; ${esc(c.platform)}</small><b>${esc(c.title)}</b><span>${esc(clip(c.excerpt, 190))}</span></span>
        <i aria-hidden="true">&rarr;</i>
      </a>`;
};
write('case-studies/index.html', {
  slug: '/case-studies', section: 'insights', insights: true, pageType: 'CollectionPage',
  title: 'Salesforce & Digital Transformation Case Studies',
  description: 'How Procyon modernized partner onboarding for Genesys, Service Cloud for a global 3D software leader, CRM for manufacturers and a senior care health platform.',
  ogTitle: 'Outcomes delivered for global clients',
  ogDescription: 'Five programs, the problem each one faced, the approach and the measured result: partner onboarding, Service Cloud, CRM consolidation and digital health.',
  og: 'case-studies', bodyClass: 'ins-cases', crumbs: [['Case studies', '/case-studies']]
}, `
<section class="ph ph--ins" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__copy" style="max-width:820px">
      <p class="pill"><span class="pill__dot"></span>Case studies</p>
      <h1 id="ph-h" class="ph__h">The problem, the approach, <em>the measured result.</em></h1>
      <p class="ph__lede"><b>Five programs delivered for global clients</b>, from Genesys partner onboarding on Salesforce to a senior care digital health platform. Each one shows the situation, the stack and the outcome the client measured.</p>
      <div class="ph__ctas"><a class="btn btn--red btn--lg magnetic" href="#audit" data-open="audit" data-interest="" data-kicker="Case studies" data-title="Brief a senior architect" data-track="cases_hero">Discuss a similar program <i aria-hidden="true">&rarr;</i></a></div>
    </div>
  </div>
</section>
<section class="sx sx--paper" aria-label="All case studies">
  <div class="wrap case-list">
${cases.map(caseRow).join('\n')}
  </div>
</section>
${cta({ h: 'A similar program, <em>planned in writing.</em>', p: 'Share the platform and the outcome needed. A senior architect replies with the approach, the team and a cost range.', interest: '', kicker: 'Case studies', title: 'Brief a senior architect', pathTitle: 'Talk to an architect', pathCta: 'Book the architect call', platform: 'Salesforce or ServiceNow' })}
`);

for (const c of cases) {
  const others = cases.filter(x => x.slug !== c.slug).slice(0, 3);
  const approach = (c.approach || []).map(a => typeof a === 'string' ? { title: a, detail: '' } : a);
  write(`case-studies/${c.slug}.html`, {
    slug: '/case-studies/' + c.slug, section: 'insights', insights: true,
    title: title60(c.seo_title || c.title), description: desc(c.seo_description, c.excerpt),
    ogTitle: clip(c.title, 95).replace(/\.$/, ''), ogDescription: desc(c.excerpt, c.seo_description),
    ogImage: c.image ? c.image.og : '/assets/img/og/case-studies.jpg', bodyClass: 'ins-case',
    published: day(c.published_at || c.updated_at || TODAY), modified: day(c.updated_at || c.published_at || TODAY),
    crumbs: [['Case studies', '/case-studies'], [clip(c.client, 48).replace(/\.$/, ''), '/case-studies/' + c.slug]],
    caseStudy: { headline: clip(c.title, 110), client: c.client, stack: c.stack || [] }
  }, `
<section class="ph" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__grid">
      <div class="ph__copy">
        <p class="pill"><span class="pill__dot"></span>Case study &middot; ${esc(c.industry)}</p>
        <h1 id="ph-h" class="ph__h">${esc(c.title)}</h1>
        <p class="ph__lede">${esc(c.excerpt)}</p>
        <div class="ph__ctas"><a class="btn btn--red btn--lg magnetic" href="#audit" data-open="audit" data-interest="" data-kicker="Case study" data-title="Discuss a similar program" data-message="Case study read: ${esc(c.title)}.&#10;Current situation: " data-track="case_hero">Discuss a similar program <i aria-hidden="true">&rarr;</i></a></div>
      </div>
      <div class="ph__w">
        <div class="wcard">
          <span class="wcard__k">Program at a glance</span>
          <dl class="dossier">
            <div><dt>Client</dt><dd>${esc(c.client)}</dd></div>
            <div><dt>Industry</dt><dd>${esc(c.industry)}</dd></div>
            <div><dt>Platform</dt><dd>${esc(c.platform)}</dd></div>
            ${c.region ? `<div><dt>Region</dt><dd>${esc(c.region)}</dd></div>` : ''}
            ${c.duration ? `<div><dt>Duration</dt><dd>${esc(c.duration)}</dd></div>` : ''}
            ${(c.stack || []).length ? `<div><dt>Stack</dt><dd>${c.stack.map(esc).join(' &middot; ')}</dd></div>` : ''}
          </dl>
        </div>
      </div>
    </div>
  </div>
</section>

${(c.outcomes || []).length ? `<section class="outc" aria-label="Outcomes"><div class="wrap"><ul class="outc__list">${c.outcomes.map(o => `<li class="rv"><b>${esc(o.value)}</b><span>${esc(o.label)}</span></li>`).join('')}</ul></div></section>` : ''}

<section class="sx" aria-labelledby="sit-h">
  <div class="wrap story">
    <div class="story__k"><span class="sx__k rv">The situation</span><h2 id="sit-h" class="rv">What was <em>holding the business back.</em></h2></div>
    <ul class="story__list rv">${lis(c.challenge || [])}</ul>
  </div>
</section>

${approach.length ? `<section class="sx sx--paper" aria-labelledby="app-h">
  <div class="wrap">
    <div class="sx__head"><div><h2 id="app-h" class="rv">How the program <em>was run.</em></h2></div></div>
    <div class="days days--${Math.min(approach.length, 4)}">
${approach.map((a, i) => `      <div class="rv"${i ? ` data-d="${Math.min(i, 3)}"` : ''}><small>Workstream</small><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div>`).join('\n')}
    </div>
  </div>
</section>` : ''}

<section class="sx" aria-labelledby="res-h">
  <div class="wrap story">
    <div class="story__k"><span class="sx__k rv">The result</span><h2 id="res-h" class="rv">What changed <em>after go-live.</em></h2>${c.quote ? `<blockquote class="story__q rv">${esc(typeof c.quote === 'string' ? c.quote : c.quote.text || '')}</blockquote>` : ''}</div>
    <ul class="ticks story__ticks rv">${lis(c.results || [])}</ul>
  </div>
</section>

<section class="sx sx--paper" aria-labelledby="more-h">
  <div class="wrap">
    <div class="sx__head"><div><h2 id="more-h" class="rv">More client outcomes.</h2></div><a class="sx__go rv" href="/case-studies">All case studies <i aria-hidden="true">&rarr;</i></a></div>
    <div class="case-list">
${others.map(caseRow).join('\n')}
    </div>
  </div>
</section>

${cta({ h: `A program like ${esc(c.client).replace(/^(Global|Leading|US)\s/, 'this ').slice(0, 60)}? <em>Plan it in writing.</em>`, p: 'Share the platform and the outcome needed. A senior architect replies with the approach, the team and a cost range.', interest: '', kicker: 'Case study', title: 'Brief a senior architect', pathTitle: 'Talk to an architect', pathCta: 'Book the architect call', platform: 'Salesforce or ServiceNow' })}
`);
}

// ---------- Events ----------
const isPast = (e) => new Date((e.end_date || e.start_date) + 'T23:59:59Z') < new Date();
write('insights/events/index.html', {
  slug: '/insights/events', section: 'insights', insights: true, pageType: 'CollectionPage',
  title: 'Salesforce & Enterprise Tech Events: 1:1 Sessions',
  description: 'Meet Procyon practice leaders at Dreamforce, the NMSDC Annual Conference and other enterprise technology and supplier diversity events. Book a 1:1 session.',
  ogTitle: 'Meet Procyon at conferences and summits',
  ogDescription: 'Private 1:1 strategy sessions with Procyon practice leaders at Dreamforce, NMSDC and other enterprise events.',
  og: 'events', bodyClass: 'ins-events', crumbs: [['Events', '/insights/events']]
}, `
<section class="ph ph--ins" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__copy" style="max-width:820px">
      <p class="pill"><span class="pill__dot"></span>Events</p>
      <h1 id="ph-h" class="ph__h">Skip the booth. <em>Book the 1:1.</em></h1>
      <p class="ph__lede"><b>Procyon practice leaders meet enterprise teams privately at the industry's major events.</b> Each session is 1:1, built around the attendee's own platform, and ends with a working plan rather than a pitch.</p>
      <div class="ph__ctas"><a class="btn btn--red btn--lg magnetic" href="#audit" data-open="audit" data-interest="Other" data-kicker="Events" data-title="1:1 session request" data-message="Event or city: &#10;Topic for the session: " data-track="events_hero">Request a 1:1 session <i aria-hidden="true">&rarr;</i></a></div>
    </div>
  </div>
</section>
<section class="sx sx--paper" aria-label="All events">
  <div class="wrap ev-list">
${events.map(e => `    <a class="ev-row rv" href="/insights/events/${e.slug}">
      <span class="ev-row__date"><b>${esc(e.date_text)}</b><span class="ev-row__state ${isPast(e) ? 'is-past' : ''}">${isPast(e) ? 'Took place' : 'Upcoming'}</span></span>
      <span class="ev-row__body"><small>${esc(e.event_type || 'Event')} &middot; ${esc(e.location)}${e.venue ? ' &middot; ' + esc(e.venue) : ''}</small><b>${esc(e.title)}</b><span>${esc(e.subtitle || clip(e.excerpt, 150))}</span></span>
      <i aria-hidden="true">&rarr;</i>
    </a>`).join('\n')}
  </div>
</section>
${cta({ h: 'Not at the event? <em>Book the session anyway.</em>', p: 'The same 1:1 strategy session runs online. Bring the platform question, leave with a working plan.', interest: 'Other', kicker: 'Events', title: '1:1 session request', pathTitle: 'Request a 1:1 session', pathCta: 'Request the session', platform: 'Salesforce or ServiceNow' })}
`);

for (const e of events) {
  const past = isPast(e);
  const ctaText = past ? 'Book a follow-up session' : 'Book a 1:1 meeting';
  const msg = `Event: ${e.title}.&#10;${past ? 'Topic to follow up on' : 'Preferred day and time'}: `;
  const agenda = (e.agenda || []).filter(a => a && (a.items || []).length);
  write(`insights/events/${e.slug}.html`, {
    slug: '/insights/events/' + e.slug, section: 'insights', insights: true,
    title: TITLE_FIX[e.slug] || title60(e.seo_title || e.title), description: desc(e.seo_description, e.excerpt),
    ogTitle: clip(e.title + ': ' + (e.subtitle || ''), 95).replace(/\.$/, ''), ogDescription: desc(e.excerpt, e.seo_description),
    og: 'events', bodyClass: 'ins-event', published: day(e.updated_at || TODAY), modified: day(e.updated_at || TODAY),
    crumbs: [['Events', '/insights/events'], [e.title, '/insights/events/' + e.slug]],
    event: { name: e.title, start: e.start_date, end: e.end_date || e.start_date, venue: e.venue, location: e.location, organizer: /dreamforce/i.test(e.title) ? 'Salesforce' : /nmsdc/i.test(e.title) ? 'National Minority Supplier Development Council' : e.title, organizerUrl: e.event_url }
  }, `
<section class="ph" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__grid">
      <div class="ph__copy">
        <p class="pill"><span class="pill__dot"></span>${esc(e.event_type || 'Event')} &middot; ${past ? 'Took place' : 'Upcoming'}</p>
        <h1 id="ph-h" class="ph__h">${esc(e.title)}</h1>
        <p class="ph__lede"><b>${esc(e.subtitle || '')}</b> ${esc(e.excerpt || '')}</p>
        <div class="ph__ctas">
          <a class="btn btn--red btn--lg magnetic" href="#audit" data-open="audit" data-interest="Other" data-kicker="${esc(e.title)}" data-title="${ctaText}" data-message="${msg}" data-track="event_hero">${ctaText} <i aria-hidden="true">&rarr;</i></a>
          ${e.event_url ? `<a class="btn btn--line btn--lg" href="${esc(e.event_url)}" target="_blank" rel="noopener">Official event site</a>` : ''}
        </div>
      </div>
      <div class="ph__w">
        <div class="wcard">
          <span class="wcard__k">Event details</span>
          <dl class="dossier">
            <div><dt>Dates</dt><dd>${esc(e.date_text)}</dd></div>
            <div><dt>Location</dt><dd>${esc(e.location)}</dd></div>
            ${e.venue ? `<div><dt>Venue</dt><dd>${esc(e.venue)}</dd></div>` : ''}
            ${e.audience ? `<div><dt>Who meets</dt><dd>${esc(e.audience)}</dd></div>` : ''}
          </dl>
          <a class="btn btn--red btn--block" href="#audit" data-open="audit" data-interest="Other" data-kicker="${esc(e.title)}" data-title="${ctaText}" data-message="${msg}" data-track="event_card">${ctaText} <i aria-hidden="true">&rarr;</i></a>
          <p class="wcard__foot">${past ? 'The event has passed. Sessions continue online.' : 'Private 1:1 sessions, limited slots.'}</p>
        </div>
      </div>
    </div>
  </div>
</section>

${(e.stats || []).length ? `<section class="outc" aria-label="Event in numbers"><div class="wrap"><ul class="outc__list">${e.stats.map(s => `<li class="rv"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></li>`).join('')}</ul></div></section>` : ''}

<section class="sx" aria-labelledby="why-h">
  <div class="wrap two-lists">
    ${(e.highlights || []).length ? `<div><span class="sx__k rv">In the session</span><h2 id="why-h" class="rv">What a 1:1 <em>covers.</em></h2><ul class="ticks rv">${lis(e.highlights)}</ul></div>` : ''}
    ${(e.why_meet || []).length ? `<div><span class="sx__k rv">Worth a meeting if</span><h2 class="rv">The team is <em>at one of these points.</em></h2><ul class="ticks rv">${lis(e.why_meet)}</ul></div>` : ''}
  </div>
</section>

${(e.services || []).length ? `<section class="sx sx--paper" aria-labelledby="svc-h"><div class="wrap">
  <div class="sx__head"><div><h2 id="svc-h" class="rv">Practices <em>in the room.</em></h2></div></div>
  <ul class="rel__list">${e.services.map(s => `<li><a href="${esc(s.href || '/contact')}"><b>${esc(s.name)}</b><span>${esc(s.description || '')}</span><i aria-hidden="true">&rarr;</i></a></li>`).join('')}</ul>
</div></section>` : ''}

${agenda.length ? `<section class="sx" aria-labelledby="ag-h"><div class="wrap">
  <div class="sx__head"><div><h2 id="ag-h" class="rv">The plan <em>for the week.</em></h2></div></div>
  <div class="days days--${Math.min(agenda.length, 4)}">${agenda.map((a, i) => `<div class="rv"${i ? ` data-d="${Math.min(i, 3)}"` : ''}><small>${esc(a.day)}</small><span>${a.items.map(esc).join('<br>')}</span></div>`).join('')}</div>
</div></section>` : ''}

${evSeries(e)}

${faqHtml(e.faqs, 'Before <em>booking a session.</em>')}

${cta({ h: `${past ? 'Missed' : 'Meet at'} ${esc(e.title)}? <em>${past ? 'The session still runs online.' : 'Lock in the 1:1.'}</em>`, p: 'A private session with a practice lead, built around the platform and the decision ahead.', interest: 'Other', kicker: e.title, title: ctaText, pathTitle: ctaText, pathCta: past ? 'Book the follow-up' : 'Book the meeting', platform: 'Salesforce or ServiceNow' })}
`);
}

// ---------- Jobs ----------
const openJobs = jobs.filter(j => j.is_open);
for (const j of jobs) {
  const loc = j.location || 'Chennai';
  let jd = `${j.title}, a ${(j.employment_type || 'full-time').toLowerCase()} ${(j.department || 'business').toLowerCase()} role at Procyon Technostructure in ${loc.replace(/\s*\(.*\)/, '')}. ${j.short_description || ''}`.trim();
  if (jd.length < 110) jd += ' Apply in about two minutes with a LinkedIn link.';
  const dept = j.department || 'Business';
  const resp = lines(j.responsibilities), reqs = lines(j.requirements), nice = lines(j.nice_to_have);
  const full = String(j.full_description || '').split(/\n{2,}|\n/).map(x => x.trim()).filter(Boolean);
  const html = `<p>${esc(j.full_description || j.short_description || '')}</p>${resp.length ? `<h3>Responsibilities</h3><ul>${lis(resp)}</ul>` : ''}${reqs.length ? `<h3>Requirements</h3><ul>${lis(reqs)}</ul>` : ''}`;
  write(`careers/${j.slug}.html`, {
    slug: '/careers/' + j.slug, section: 'company', insights: true,
    title: title60(`${j.title} Job in ${loc.replace(/\s*\(.*\)/, '')}`), description: desc(jd),
    ogTitle: `${j.title}: ${j.is_open ? 'open role' : 'role closed'} at Procyon`, ogDescription: desc(j.short_description, j.full_description),
    og: 'careers', bodyClass: 'co-job', published: day(j.created_at), modified: day(j.updated_at || j.created_at),
    crumbs: [['Careers', '/careers'], [clip(j.title, 48).replace(/\.$/, ''), '/careers/' + j.slug]],
    job: j.is_open ? { title: j.title, html, posted: day(j.created_at), type: /part/i.test(j.employment_type || '') ? 'PART_TIME' : 'FULL_TIME', experience: j.experience_level, department: dept } : undefined
  }, `
<section class="ph" aria-labelledby="ph-h">
  <img class="ph__mark" src="/favicon.svg" alt="" width="720" height="720" aria-hidden="true">
  <div class="wrap">
    <!--@crumbs-->
    <div class="ph__copy" style="max-width:860px">
      <p class="pill"><span class="pill__dot"></span>${esc(dept)} &middot; ${j.is_open ? 'Open role' : 'Role closed'}</p>
      <h1 id="ph-h" class="ph__h">${esc(j.title)}</h1>
      <p class="ph__lede">${esc(j.short_description || '')}</p>
      <p class="job__facts"><span>${esc(loc)}</span><span>${esc(j.employment_type || 'Full-time')}</span>${j.experience_level ? `<span>${esc(j.experience_level)} experience</span>` : ''}</p>
      <div class="ph__ctas">${j.is_open ? `<a class="btn btn--red btn--lg magnetic" href="#apply" data-apply-cta data-interest="${esc(j.title)}" data-track="job_hero">Apply for this role <i aria-hidden="true">&rarr;</i></a>` : `<a class="btn btn--red btn--lg magnetic" href="/careers#roles">See the open roles <i aria-hidden="true">&rarr;</i></a>`}</div>
    </div>
  </div>
</section>

${j.is_open ? '' : `<section class="sx sx--paper" style="padding:40px 0"><div class="wrap"><div class="band"><div><b>This role is no longer open.</b><span>Open applications are still read by the talent team and matched to new roles as they open.</span></div><a class="btn btn--red" href="#apply" data-apply-cta data-interest="Other">Send an open application <i aria-hidden="true">&rarr;</i></a></div></div></section>`}

<section class="sx" aria-labelledby="role-h">
  <div class="wrap post__grid">
    <article class="post__body job__body">
      <h2 id="role-h">About the role</h2>
${full.map(x => `      <p>${esc(x)}</p>`).join('\n')}
      ${resp.length ? `<h2>What the work involves</h2><ul>${lis(resp)}</ul>` : ''}
      ${reqs.length ? `<h2>What the role needs</h2><ul>${lis(reqs)}</ul>` : ''}
      ${nice.length ? `<h2>Good to have</h2><ul>${lis(nice)}</ul>` : ''}
    </article>
    <aside class="post__side">
      <div class="post__sticky">
        <div class="post__cta">
          <small>${j.is_open ? 'Open role' : 'Closed role'}</small>
          <b>${esc(j.title)}</b>
          <span>${esc(loc)} &middot; ${esc(j.employment_type || 'Full-time')}</span>
          <a class="btn btn--red btn--block" href="#apply" data-apply-cta data-interest="${j.is_open ? esc(j.title) : 'Other'}">${j.is_open ? 'Apply for this role' : 'Send an open application'} <i aria-hidden="true">&rarr;</i></a>
        </div>
      </div>
    </aside>
  </div>
</section>

<section class="sx sx--paper" id="apply" aria-labelledby="apply-h">
  <div class="wrap apply">
    <div>
      <h2 id="apply-h" class="rv">Apply in <em>about two minutes.</em></h2>
      <p class="rv" data-d="1">Personal email is fine, and a LinkedIn or portfolio link replaces a CV. Every application is read by the talent team.</p>
    </div>
    <div class="apply__card rv" data-d="1">
<!--@include pages/_partials/apply-form.html-->
    </div>
  </div>
</section>

<!--@related-->
`);
}

// ---------- Partials used by the hand-written Careers page ----------
fs.rmSync(PARTS, { recursive: true, force: true });
fs.mkdirSync(PARTS, { recursive: true });
fs.writeFileSync(path.join(PARTS, 'open-roles.html'), openJobs.map(j => `      <a class="role rv" href="/careers/${j.slug}">
        <span class="role__dept">${esc(j.department || 'Business')}</span>
        <b>${esc(j.title)}</b>
        <span class="role__d">${esc(clip(j.short_description || '', 150))}</span>
        <span class="role__facts"><span>${esc(j.location || 'Chennai')}</span><span>${esc(j.employment_type || 'Full-time')}</span>${j.experience_level ? `<span>${esc(j.experience_level)}</span>` : ''}</span>
        <em>See the role &rarr;</em>
      </a>`).join('\n') + '\n');
fs.writeFileSync(path.join(PARTS, 'apply-form.html'), `      <form class="lf" data-apply novalidate>
        <div class="lf__grid">
          <label><span>Full name <em>*</em></span><input name="name" type="text" autocomplete="name" required maxlength="120"></label>
          <label><span>Email <em>*</em></span><input name="email" type="email" autocomplete="email" required maxlength="160"></label>
          <label><span>Phone</span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          <label><span>Role or track <em>*</em></span>
            <select name="track" required>
              <option value="">Select a role or track</option>
              <optgroup label="Open roles">
${openJobs.map(j => `                <option>${esc(j.title)}</option>`).join('\n')}
              </optgroup>
              <optgroup label="Open application by track">
                <option>Salesforce</option>
                <option>ServiceNow</option>
                <option>AI and data</option>
                <option>Product engineering</option>
                <option>Delivery and project management</option>
                <option>Other</option>
              </optgroup>
            </select>
          </label>
          <label><span>Preferred hub</span>
            <select name="hub">
              <option value="">Select a hub</option>
              <option>Novato, California</option>
              <option>Toronto, Canada</option>
              <option>Chennai, India</option>
              <option>Open to any hub</option>
            </select>
          </label>
          <label><span>LinkedIn or portfolio link</span><input name="profile" type="url" inputmode="url" placeholder="https://" maxlength="200"></label>
          <label class="lf__full"><span>Experience and next move</span><textarea name="message" rows="4" maxlength="3000" placeholder="Years of experience, certifications, and the work wanted next."></textarea></label>
          <label class="hp" aria-hidden="true">Website<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="cf-slot"></div>
        <button class="btn btn--red btn--block btn--lg" type="submit" data-track="application_submit_click">Send application <i aria-hidden="true">&rarr;</i></button>
        <p class="qf__status" role="status" aria-live="polite"></p>
        <p class="apply__note">Used only for recruiting at Procyon. <a href="/privacy">Privacy Policy</a></p>
      </form>
`);
fs.writeFileSync(path.join(ROOT, 'content', 'insights', 'job-titles.json'), JSON.stringify(openJobs.map(j => j.title)));
console.log(`generated ${blog.length} posts, ${cases.length} case studies, ${events.length} events, ${jobs.length} jobs (+3 index pages)`);
