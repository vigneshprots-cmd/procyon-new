// SEO score for blog posts: the checks the site's house style and the build rely on.
import { h, icon, textOf } from '../core/dom.js';

const DASH = /[–—]/;
export function tidyDashes(s) {
  return typeof s === 'string' ? s.replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-') : s;
}

export function analyse(m, bodyHtml, galleryItems) {
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml || ''}</body>`, 'text/html');
  const kw = String(m.focus_keyword || '').trim().toLowerCase();
  const title = (m.seo_title || m.title || '').trim();
  const desc = (m.seo_description || m.excerpt || '').trim();
  const h2s = Array.from(doc.querySelectorAll('h2')).map(x => x.textContent.trim());
  const firstP = (Array.from(doc.body.querySelectorAll('p')).find(p => p.textContent.trim().length > 40) || {}).textContent || '';
  const imgs = Array.from(doc.querySelectorAll('img'));
  const media = imgs.map(i => i.getAttribute('alt') || '').concat((galleryItems || []).map(x => x.alt || ''));
  const missingAlt = media.filter(a => !a.trim()).length;
  const words = textOf(bodyHtml).split(' ').filter(Boolean).length;
  const dashFields = [['Title', m.title], ['Excerpt', m.excerpt], ['SEO title', m.seo_title], ['Meta description', m.seo_description], ['Body', textOf(bodyHtml)], ['Gallery captions', (galleryItems || []).map(x => `${x.caption || ''} ${x.alt || ''}`).join(' ')], ['FAQs', (m.faqs || []).map(f => `${f.q || ''} ${f.a || ''}`).join(' ')]].filter(([, v]) => DASH.test(v || ''));
  const has = (s) => kw && String(s || '').toLowerCase().includes(kw);
  const checks = [
    { id: 'title', weight: 2, ok: title.length > 0 && title.length <= 60, label: `SEO title is ${title.length} characters`, fix: title.length > 60 ? 'Shorten it to 60 or fewer so Google does not cut it off.' : title.length ? 'Good length.' : 'Add a title.' },
    { id: 'desc', weight: 2, ok: desc.length >= 110 && desc.length <= 160, label: `Meta description is ${desc.length} characters`, fix: desc.length < 110 ? 'Aim for 110 to 160 characters.' : desc.length > 160 ? 'Trim it to 160 or fewer.' : 'Good length.' },
    { id: 'kw', weight: 1, ok: !!kw, label: kw ? `Focus keyword: "${m.focus_keyword.trim()}"` : 'No focus keyword', fix: kw ? '' : 'Pick the phrase this post should rank for.' },
    { id: 'kw-title', weight: 2, ok: has(title), label: 'Keyword in the SEO title', fix: kw ? 'Work the keyword into the title, ideally near the start.' : 'Set a focus keyword first.' },
    { id: 'kw-h2', weight: 1, ok: h2s.some(has), label: 'Keyword in at least one H2', fix: kw ? 'Use the keyword in a section heading.' : 'Set a focus keyword first.' },
    { id: 'kw-intro', weight: 1, ok: has(firstP), label: 'Keyword in the first paragraph', fix: kw ? 'Mention the keyword early in the opening paragraph.' : 'Set a focus keyword first.' },
    { id: 'alt', weight: 2, ok: missingAlt === 0, label: media.length ? (missingAlt ? `${missingAlt} of ${media.length} images missing alt text` : `All ${media.length} images have alt text`) : 'No images in the body', fix: missingAlt ? 'Add alt text to every image and gallery item.' : '' },
    { id: 'dash', weight: 2, ok: !dashFields.length, label: dashFields.length ? `Em or en dashes in: ${dashFields.map(d => d[0]).join(', ')}` : 'No em or en dashes', fix: dashFields.length ? 'House style: use commas, "to" for ranges, or a hyphen.' : '', autofix: dashFields.length ? 'dash' : null },
    { id: 'h2', weight: 1, ok: h2s.length >= 3, label: `${h2s.length} section heading${h2s.length === 1 ? '' : 's'} (H2)`, fix: h2s.length < 3 ? 'Three or more H2s give readers a table of contents.' : '' },
    { id: 'len', weight: 1, ok: words >= 600, label: `${words.toLocaleString()} words`, fix: words < 600 ? 'Posts under 600 words rarely rank. Add depth or examples.' : '' },
    { id: 'excerpt', weight: 1, ok: (m.excerpt || '').trim().length >= 60, label: 'Excerpt written', fix: (m.excerpt || '').trim().length < 60 ? 'Write a 1 to 2 sentence summary. It also feeds the meta description.' : '' },
    { id: 'cover', weight: 1, ok: !!m.cover_image, label: m.cover_image ? 'Cover image set' : 'No cover image', fix: m.cover_image ? '' : 'Posts with a cover image get better social shares.' },
    { id: 'slug', weight: 1, ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.slug || '') && (m.slug || '').length <= 75, label: `URL: /blog/${m.slug || '…'}`, fix: (m.slug || '').length > 75 ? 'Shorten the slug.' : !m.slug ? 'Add a slug.' : '' }
  ];
  const total = checks.reduce((a, c) => a + c.weight, 0);
  const score = Math.round(checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0) / total * 100);
  return { score, checks, words, kw };
}

export function scoreTone(score) { return score >= 80 ? 'good' : score >= 55 ? 'ok' : 'bad'; }

export function seoPanel(result, { onAutofix } = {}) {
  const tone = scoreTone(result.score);
  const R = 26, C = 2 * Math.PI * R;
  const ring = h('div.seo__ring.seo__ring--' + tone, { html: `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="${R}" class="seo__track"/><circle cx="32" cy="32" r="${R}" class="seo__val" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - result.score / 100)}" transform="rotate(-90 32 32)"/></svg><b>${result.score}</b>` });
  return h('div.seo',
    h('div.seo__top', ring, h('div', h('b', tone === 'good' ? 'Ready to rank' : tone === 'ok' ? 'Nearly there' : 'Needs work'), h('p.muted.small', `${result.checks.filter(c => c.ok).length} of ${result.checks.length} checks pass`))),
    h('ul.seo__list', result.checks.map(c => h('li.seo__i' + (c.ok ? '.is-ok' : '.is-bad'),
      h('span.seo__ic', icon(c.ok ? 'check' : 'alert', 13)),
      h('div', h('span', c.label), !c.ok && c.fix ? h('small', c.fix) : null,
        !c.ok && c.autofix && onAutofix ? h('button.linkbtn', { type: 'button', onclick: () => onAutofix(c.autofix) }, 'Fix automatically') : null)))));
}

export function snippet(m) {
  const t = (m.seo_title || m.title || 'Post title').replace(/\s*\|\s*Procyon.*$/i, '');
  const d = m.seo_description || m.excerpt || 'Meta description appears here.';
  return h('div.snip', h('small', 'procyonts.com › blog › ' + (m.slug || 'post')), h('b', t.length > 60 ? t.slice(0, 59) + '…' : t), h('p', d.length > 160 ? d.slice(0, 159) + '…' : d));
}
