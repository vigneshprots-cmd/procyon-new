// Blog post editor: block builder or raw HTML body, gallery format, SEO score, live preview
// with the site's own CSS, local autosave, and column-level saves compatible with the existing CMS.
import { h, icon, clear, clone, same, debounce, store, slugify, esc, ago, fmtDateTime, toLocalInput, fromLocalInput, wordCount, fmtDate } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, confirmDialog, badge, errorState, skeletonRows, segmented } from '../core/ui.js';
import { buildForm, imageEl } from '../core/form.js';
import { parseBody, serialize, blockBuilder, safePreview, galleryHtml } from './blocks.js';
import { galleryManager, withGalleryHtml } from './gallery-editor.js';
import { analyse, seoPanel, snippet, tidyDashes, scoreTone } from './seo.js';
import { isGallery } from './content.js';

const BLANK = {
  slug: '', title: '', excerpt: '', category: '', author: '', author_role: '', read_time: '', tags: [], cover_image: '', status: 'draft', published_at: null,
  seo_title: '', seo_description: '', focus_keyword: '', canonical_url: '', og_image: '', noindex: false, cta_label: 'Consult us now', cta_url: '/contact', faqs: [],
  format: 'standard', gallery: [], galleryAnchors: {}
};

// Same as the existing CMS: H2s without an id get one, so the table of contents can link to them.
const withIds = (html) => html.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/gi, (m, attrs, inner) => {
  if (attrs && /\bid=/.test(attrs)) return m;
  const id = inner.replace(/<[^>]+>/g, '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60);
  return `<h2${attrs || ''} id="${id}">${inner}</h2>`;
});
const minutes = (html) => Math.max(1, Math.round(wordCount(html) / 225));
function readContent(c) {
  if (c && typeof c === 'object' && !Array.isArray(c)) return { format: c.format === 'gallery' ? 'gallery' : 'standard', gallery: Array.isArray(c.gallery) ? c.gallery : [], galleryAnchors: c.galleryAnchors || {} };
  if (Array.isArray(c) && c.some(x => x && (x.url || x.group))) return { format: 'gallery', gallery: c.map((x, i) => ({ id: x.id || `g-${Date.now()}-${i}`, url: x.url || '', fullUrl: x.fullUrl || x.url || '', alt: x.alt || '', caption: x.caption || '', group: x.group || 'Day 1', sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : i, isVideo: !!x.isVideo || undefined, poster: x.poster })), galleryAnchors: {} };
  return { format: 'standard', gallery: [], galleryAnchors: {} };
}

export async function render(main, { id }) {
  const isNew = id === 'new';
  document.title = `${isNew ? 'New post' : 'Edit post'} | Procyon Admin`;
  main.append(skeletonRows(8, 2));
  let original = null, authors = [], cats = [], tagsAll = [];
  const model = clone(BLANK);
  let body = '';
  try {
    const [row, a, others] = await Promise.all([
      isNew ? null : db.get('blog_posts', id),
      db.list('authors', { order: [['name', true]] }).catch(() => []),
      db.list('blog_posts', { select: 'category, tags' }).catch(() => [])
    ]);
    authors = a;
    cats = [...new Set(others.map(p => (p.category || '').trim()).filter(Boolean))].sort();
    tagsAll = [...new Set(others.flatMap(p => p.tags || []))].sort();
    if (!isNew) {
      if (!row) { clear(main).append(errorState(new Error('This post was not found, or this account cannot see it.'))); return; }
      original = row;
      for (const k of Object.keys(BLANK)) if (k in row && row[k] != null && !['format', 'gallery', 'galleryAnchors'].includes(k)) model[k] = clone(row[k]);
      if ('author_id' in row) model.author_id = row.author_id;
      Object.assign(model, clone(readContent(row.content)));
      body = row.body_html || '';
    }
  } catch (e) { clear(main).append(errorState(e, () => ctx.go(location.pathname))); return; }

  const baseline = clone({ model, body });
  const draftKey = `draft:blog:${id}`;
  let dirty = false, mode = store.get('blog:mode') || 'blocks';
  let blocks = parseBody(body);
  let bodyTouched = false;

  // ---------- Header ----------
  const statusBadge = h('span');
  const savedAt = h('span.muted.small', !isNew && original.updated_at ? 'Saved ' + ago(original.updated_at) : 'Not saved yet');
  const seoChip = h('button.seochip', { type: 'button', title: 'SEO score', onclick: () => showTab('seo') });
  const saveBtn = h('button.btn.btn--primary', { type: 'button', onclick: () => save() }, icon('save', 15), h('span', 'Save'));
  const pubBtn = h('button.btn', { type: 'button', onclick: () => save(model.status !== 'published') });
  const prevBtn = h('button.btn.btn--ghost', { type: 'button', onclick: () => togglePreview(), title: 'Live preview with the site styles' }, icon('split', 15), h('span.hide-sm', 'Preview'));
  const liveBtn = !isNew && original.status === 'published' ? h('a.btn.btn--ghost', { href: '/blog/' + original.slug, target: '_blank', rel: 'noopener', title: 'Open the published page' }, icon('external', 15)) : null;
  const header = h('div.ebar',
    h('a.ebar__back', { href: '/admin/blog', 'aria-label': 'Back to posts' }, icon('chevronLeft', 18)),
    h('div.ebar__t', h('h1', isNew ? 'New post' : 'Edit post'), h('div.ebar__meta', statusBadge, savedAt)),
    h('div.ebar__acts', seoChip, prevBtn, liveBtn, pubBtn, saveBtn));

  // ---------- Main column ----------
  const titleIn = h('textarea.etitle', { rows: 1, placeholder: 'Post title', value: model.title, 'aria-label': 'Title' });
  const excerptIn = h('textarea.eexcerpt', { rows: 2, placeholder: 'Excerpt: one or two sentences that sum up the post', value: model.excerpt, 'aria-label': 'Excerpt' });
  const grow = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  titleIn.addEventListener('input', () => { model.title = titleIn.value.replace(/\n/g, ' '); if (!slugTouched) { model.slug = slugify(model.title); const s = document.getElementById('f-slug'); if (s) s.value = model.slug; } grow(titleIn); changed(); });
  excerptIn.addEventListener('input', () => { model.excerpt = excerptIn.value; grow(excerptIn); changed(); });
  let slugTouched = !isNew || !!model.slug;

  const formatSeg = segmented([{ id: 'standard', label: 'Standard article', icon: 'blog' }, { id: 'gallery', label: 'Article with photo strips', icon: 'gallery' }], model.format, async (v) => {
    if (v === 'standard' && model.gallery.length && !(await confirmDialog({ title: 'Switch to a standard article?', message: `The ${model.gallery.length} gallery items are kept in this editor until you save. Saving as standard removes them from the post.`, confirm: 'Switch' }))) { formatSeg.querySelectorAll('.seg__b')[1].click(); return; }
    model.format = v; paintGallery(); changed();
  }, 'Format');

  const bodyBox = h('div.ebody');
  const wordsEl = h('span.muted.small');
  const modeSeg = segmented([{ id: 'blocks', label: 'Blocks', icon: 'list' }, { id: 'html', label: 'HTML', icon: 'code' }], mode, (v) => switchMode(v), 'Body editor');
  const galleryBox = h('div');
  const mainCol = h('div.editor__main',
    h('section.card.ecard.ecard--title', titleIn, excerptIn, h('div.ecard__foot', h('span.muted.small', 'Format'), formatSeg)),
    h('section.card.ecard', h('div.ecard__head', h('h2.ecard__t', 'Body'), h('div.ecard__tools', wordsEl, modeSeg)), bodyBox),
    galleryBox);

  function currentBody() { return mode === 'html' ? body : (bodyTouched ? serialize(blocks) : body); }
  function paintBody() {
    clear(bodyBox);
    if (mode === 'html') {
      const ta = h('textarea.input.input--code.ebody__html', { spellcheck: 'false', value: body, 'aria-label': 'Body HTML' });
      ta.addEventListener('input', () => { body = ta.value; bodyTouched = true; changed(); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); body = ta.value; changed(); } });
      bodyBox.append(h('p.muted.small', 'Raw HTML for the whole article. Scripts are removed when the site is built.'), ta);
    } else {
      const bb = blockBuilder(blocks, () => { bodyTouched = true; body = serialize(blocks); changed(); });
      bodyBox.append(bb.el);
    }
  }
  function switchMode(v) {
    if (v === mode) return;
    if (v === 'html') { body = currentBody(); }
    else { blocks = parseBody(body); }
    mode = v; store.set('blog:mode', v); paintBody();
  }
  const headings = () => Array.from(new DOMParser().parseFromString(`<body>${currentBody()}</body>`, 'text/html').body.children).filter(e => e.tagName === 'H2').map(e => e.textContent.trim());
  function paintGallery() {
    clear(galleryBox);
    if (model.format !== 'gallery') return;
    const gm = galleryManager(model, () => changed(), headings);
    galleryBox.append(h('section.card.ecard', h('div.ecard__head', h('h2.ecard__t', 'Gallery'), h('span.muted.small', 'Strips appear under the matching H2, with a lightbox on the site')), gm.el));
  }

  // ---------- Sidebar ----------
  const tabsBar = h('div.stabs', { role: 'tablist' });
  const tabBody = h('div.stabs__body');
  let tab = 'post';
  const authorSel = () => {
    const sel = h('select.input', { 'aria-label': 'Author' }, h('option', { value: '' }, 'Choose an author…'),
      authors.map(a => h('option', { value: a.id, selected: (model.author_id && model.author_id === a.id) || (!model.author_id && a.name === model.author) }, a.name + (a.role ? ` · ${a.role}` : ''))),
      h('option', { value: '__custom', selected: !!model.author && !authors.some(a => a.name === model.author) }, model.author && !authors.some(a => a.name === model.author) ? `${model.author} (custom)` : 'Other name…'));
    const custom = h('input.input.input--sm', { value: model.author, placeholder: 'Byline name', hidden: !(model.author && !authors.some(a => a.name === model.author)), 'aria-label': 'Custom author name' });
    sel.addEventListener('change', () => {
      if (sel.value === '__custom') { custom.hidden = false; custom.focus(); return; }
      custom.hidden = true;
      const a = authors.find(x => x.id === sel.value);
      model.author = a ? a.name : '';
      if (a && a.role) { model.author_role = a.role; const r = document.getElementById('f-role'); if (r) r.value = a.role; }
      if ('author_id' in model || a) model.author_id = a ? a.id : null;
      changed();
    });
    custom.addEventListener('input', () => { model.author = custom.value; if ('author_id' in model) model.author_id = null; changed(); });
    return h('div.field', h('label.field__l', 'Author'), sel, custom);
  };
  function postTab() {
    const slug = h('input.input.input--mono', { id: 'f-slug', value: model.slug, spellcheck: 'false', placeholder: 'auto-from-title' });
    slug.addEventListener('input', () => { slugTouched = true; model.slug = slug.value; changed(); });
    slug.addEventListener('blur', () => { model.slug = slugify(slug.value); slug.value = model.slug; changed(); });
    const status = h('select.input', h('option', { value: 'draft', selected: model.status !== 'published' }, 'Draft'), h('option', { value: 'published', selected: model.status === 'published' }, 'Published'));
    status.addEventListener('change', () => { model.status = status.value; if (model.status === 'published' && !model.published_at) { model.published_at = new Date().toISOString(); pub.value = toLocalInput(model.published_at); } changed(); });
    const pub = h('input.input', { type: 'datetime-local', value: toLocalInput(model.published_at) });
    pub.addEventListener('change', () => { model.published_at = fromLocalInput(pub.value); changed(); });
    const role = h('input.input', { id: 'f-role', value: model.author_role, placeholder: 'Practice Lead, Salesforce' });
    role.addEventListener('input', () => { model.author_role = role.value; changed(); });
    const cat = h('input.input', { value: model.category, list: 'dl-cats', placeholder: 'Salesforce' });
    cat.addEventListener('input', () => { model.category = cat.value; changed(); });
    const read = h('input.input', { value: model.read_time, placeholder: `${minutes(currentBody())} min read (automatic)` });
    read.addEventListener('input', () => { model.read_time = read.value; changed(); });
    const tagsForm = buildForm([{ path: 'tags', label: 'Tags', type: 'tags', datalist: tagsAll, placeholder: 'Type a tag, press Enter' }], model, changed);
    const ctaForm = buildForm([{ path: 'cta_label', label: 'Sidebar button label', placeholder: 'Talk to a senior architect', hint: 'Avoid "my/your/we" wording; the site falls back to a neutral label if it finds it.' }, { path: 'cta_url', label: 'Sidebar button link', type: 'url', placeholder: '/contact' }], model, changed);
    return h('div.form',
      h('div.fgrid.cols-2', h('label.field', h('span.field__l', 'Status'), status), h('label.field', h('span.field__l', 'Publish date'), pub)),
      h('label.field', h('span.field__l', 'URL slug'), slug, h('span.field__h', 'procyonts.com/blog/' + (model.slug || '…'))),
      h('label.field', h('span.field__l', 'Category'), cat, h('datalist', { id: 'dl-cats' }, cats.map(c => h('option', { value: c })))),
      tagsForm.el,
      authorSel(),
      h('label.field', h('span.field__l', 'Author role'), role),
      h('div.field', h('span.field__l', 'Cover image'), imageEl(model.cover_image, (v) => { model.cover_image = v; changed(); }, { label: 'Cover image', folder: 'covers' }), h('span.field__h', '1200 × 675 or larger. Converted to WebP and a share image at build time.')),
      h('label.field', h('span.field__l', 'Read time'), read),
      h('fieldset.fgroup', h('legend', 'Call to action'), ctaForm.el));
  }
  function seoTab() {
    const res = analyse(model, currentBody(), model.format === 'gallery' ? model.gallery : []);
    const form = buildForm([
      { path: 'focus_keyword', label: 'Focus keyword', placeholder: 'e.g. Agentforce implementation' },
      { path: 'seo_title', label: 'SEO title', counter: [0, 60], placeholder: model.title || 'Defaults to the post title' },
      { path: 'seo_description', label: 'Meta description', type: 'textarea', rows: 3, counter: [110, 160], placeholder: model.excerpt || 'Defaults to the excerpt' },
      { path: 'canonical_url', label: 'Canonical URL', type: 'url', placeholder: 'Only if this post first ran elsewhere' },
      { path: 'og_image', label: 'Social share image URL', type: 'url', placeholder: 'Defaults to the cover image' },
      { path: 'noindex', label: 'Hide from search engines', type: 'checkbox', hint: 'Adds noindex on the old site' }
    ], model, () => { changed(); refreshSeo(); });
    const panel = h('div', seoPanel(res, { onAutofix }));
    const snip = h('div', snippet(model));
    const refreshSeo = debounce(() => { clear(panel).append(seoPanel(analyse(model, currentBody(), model.format === 'gallery' ? model.gallery : []), { onAutofix })); clear(snip).append(snippet(model)); }, 250);
    return h('div', panel, h('h3.side__h', 'Search result preview'), snip, form.el);
  }
  function faqTab() {
    const form = buildForm([{ path: 'faqs', label: 'Questions and answers', type: 'repeater', itemLabel: 'Question', cols: 1, fields: [{ path: 'q', label: 'Question' }, { path: 'a', label: 'Answer', type: 'textarea', rows: 3 }] }], model, changed);
    return h('div', h('p.muted.small', 'Shown under the article and published as FAQ structured data.'), form.el);
  }
  function showTab(t) {
    tab = t;
    clear(tabsBar).append(...[['post', 'Post'], ['seo', 'SEO'], ['faqs', `FAQs${model.faqs.length ? ' (' + model.faqs.length + ')' : ''}`]].map(([k, l]) =>
      h('button.stab' + (k === tab ? '.is-on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(k === tab), onclick: () => showTab(k) }, l)));
    clear(tabBody).append(t === 'seo' ? seoTab() : t === 'faqs' ? faqTab() : postTab());
  }
  const sideCol = h('div.editor__side', h('section.card.ecard.ecard--side', tabsBar, tabBody));

  // ---------- Preview ----------
  const frame = h('iframe.pv__frame', { title: 'Post preview', sandbox: 'allow-same-origin' });
  let device = 'desktop';
  const pvBar = h('div.pv__bar', h('b', 'Preview'), h('span.muted.small', 'Site styles, not yet published'),
    segmented([{ id: 'desktop', icon: 'globe', title: 'Desktop' }, { id: 'mobile', icon: 'phone', title: 'Mobile' }], device, (v) => { device = v; frame.classList.toggle('is-mobile', v === 'mobile'); }, 'Preview width'),
    h('button.iconbtn', { type: 'button', 'aria-label': 'Close preview', onclick: () => togglePreview(false) }, icon('x', 16)));
  const pv = h('aside.pv', { hidden: true }, pvBar, h('div.pv__stage', frame));
  const editorWrap = h('div.editor.editor--blog', mainCol, sideCol);
  const shellEl = h('div.eshell', editorWrap, pv);
  function togglePreview(on) {
    const show = on === undefined ? pv.hidden : on;
    pv.hidden = !show;
    shellEl.classList.toggle('has-preview', show);
    prevBtn.classList.toggle('is-on', show);
    store.set('blog:preview', show);
    if (show) paintPreview();
  }
  const paintPreview = debounce(() => {
    if (pv.hidden) return;
    const y = (() => { try { return frame.contentWindow.scrollY; } catch (e) { return 0; } })();
    frame.srcdoc = previewDoc();
    frame.onload = () => { try { frame.contentWindow.scrollTo(0, y); } catch (e) { /* ignore */ } };
  }, 350);
  function previewDoc() {
    let html = withIds(currentBody());
    if (model.format === 'gallery' && model.gallery.length) html = withGalleryHtml(html, model.gallery, model.galleryAnchors, (g, items) => galleryHtml(g + ' in pictures', items, true));
    html = safePreview(html);
    const read = model.read_time || `${minutes(currentBody())} min read`;
    const faqs = (model.faqs || []).filter(f => f.q && f.a);
    const v = Date.now().toString(36).slice(0, 4);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css?pv=${v}"><link rel="stylesheet" href="/assets/css/pages.css?pv=${v}"><link rel="stylesheet" href="/assets/css/insights.css?pv=${v}"><link rel="stylesheet" href="/assets/css/gallery.css?pv=${v}">
<style>.rv{opacity:1!important;transform:none!important}.post__sticky{position:static}body{overflow-x:hidden}</style></head>
<body class="ins-post"><main>
<section class="ph ph--post"><div class="wrap"><div class="post__head">
<p class="pill"><span class="pill__dot"></span>${esc(model.category || 'Category')}</p>
<h1 class="ph__h">${esc(model.title || 'Post title')}</h1><p class="ph__lede">${esc(model.excerpt || '')}</p>
<p class="post__by"><b>${esc(model.author || 'Procyon Technostructure')}</b>${model.author_role ? `<span>${esc(model.author_role)}</span>` : ''}<time>${fmtDate(model.published_at || new Date())}</time><span>${esc(read)}</span></p>
</div></div></section>
${model.cover_image ? `<div class="post__cover"><div class="wrap"><img src="${esc(model.cover_image)}" alt="" width="1200" height="675"></div></div>` : ''}
<section class="post"><div class="wrap post__grid"><article class="post__body">${html}
${(model.tags || []).length ? `<p class="post__tags">${model.tags.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}</article>
<aside class="post__side"><div class="post__sticky"><div class="post__cta"><small>${esc(model.category || '')}</small><b>Apply this to the actual platform.</b><span>A senior architect replies within one business day.</span><a class="btn btn--red btn--block" href="#">${esc(model.cta_label && !/\b(my|your|you|us|our|we|me)\b/i.test(model.cta_label) ? model.cta_label : 'Talk to a senior architect')} <i aria-hidden="true">&rarr;</i></a></div></div></aside>
</div></section>
${faqs.length ? `<section class="faq"><div class="wrap faq__in"><h2>Questions this article <em>answers.</em></h2><div class="faq__list">${faqs.map((f, i) => `<details${i ? '' : ' open'}><summary>${esc(f.q)}</summary><p class="faq-a">${esc(f.a)}</p></details>`).join('')}</div></div></section>` : ''}
</main></body></html>`;
  }

  // ---------- State ----------
  function onAutofix(kind) {
    if (kind !== 'dash') return;
    ['title', 'excerpt', 'seo_title', 'seo_description'].forEach(k => { model[k] = tidyDashes(model[k]); });
    model.faqs = (model.faqs || []).map(f => ({ q: tidyDashes(f.q), a: tidyDashes(f.a) }));
    model.gallery.forEach(x => { x.caption = tidyDashes(x.caption); x.alt = tidyDashes(x.alt); });
    body = tidyDashes(currentBody()); blocks = parseBody(body); bodyTouched = true;
    titleIn.value = model.title; excerptIn.value = model.excerpt;
    paintBody(); paintGallery(); showTab('seo'); changed();
    toast.success('Dashes replaced', { detail: 'Ranges use "to", asides use commas.' });
  }
  const saveDraft = debounce(() => store.set(draftKey, { at: Date.now(), model, body: currentBody() }), 700);
  const paintChrome = debounce(() => {
    const res = analyse(model, currentBody(), model.format === 'gallery' ? model.gallery : []);
    seoChip.className = 'seochip seochip--' + scoreTone(res.score);
    clear(seoChip).append(h('b', String(res.score)), h('span.hide-sm', 'SEO'));
    wordsEl.textContent = `${res.words.toLocaleString()} words · ${minutes(currentBody())} min read`;
  }, 300);
  function paintStatus() {
    clear(statusBadge).append(model.status === 'published' ? badge('Published', 'green') : badge('Draft', 'amber'), model.format === 'gallery' ? badge('Gallery', 'violet') : null, dirty ? badge('Unsaved', 'grey') : null);
    clear(pubBtn).append(icon(model.status === 'published' ? 'eye' : 'rocket', 15), h('span', model.status === 'published' ? 'Unpublish' : 'Publish'));
    clear(saveBtn).append(icon('save', 15), h('span', isNew ? 'Save draft' : 'Save'));
  }
  function changed() {
    dirty = !same(model, baseline.model) || (bodyTouched && currentBody() !== baseline.body);
    paintStatus(); paintChrome(); saveDraft(); paintPreview();
  }

  clear(main).append(header, shellEl);
  paintBody(); paintGallery(); showTab('post'); paintStatus(); paintChrome();
  requestAnimationFrame(() => { grow(titleIn); grow(excerptIn); });
  if (store.get('blog:preview')) togglePreview(true);
  if (isNew) setTimeout(() => titleIn.focus(), 50);

  // Restore an unsaved local draft?
  const draft = store.get(draftKey);
  if (draft && draft.model && (!same(draft.model, model) || draft.body !== body) && (!original || !original.updated_at || draft.at > new Date(original.updated_at).getTime())) {
    const bar = h('div.restore', icon('info', 15), h('span', `Unsaved changes from ${fmtDateTime(draft.at)} were autosaved in this browser.`),
      h('button.btn.btn--sm.btn--primary', { type: 'button', onclick: () => {
        Object.keys(model).forEach(k => delete model[k]); Object.assign(model, clone(draft.model));
        body = draft.body || ''; blocks = parseBody(body); bodyTouched = true;
        titleIn.value = model.title; excerptIn.value = model.excerpt; grow(titleIn); grow(excerptIn);
        formatSeg.querySelectorAll('.seg__b').forEach((b, i) => b.classList.toggle('is-on', (i ? 'gallery' : 'standard') === model.format));
        paintBody(); paintGallery(); showTab(tab); changed(); bar.remove();
        toast.success('Draft restored', { detail: 'Save to write it to the CMS.' });
      } }, 'Restore'),
      h('button.btn.btn--sm.btn--ghost', { type: 'button', onclick: () => { store.del(draftKey); bar.remove(); } }, 'Discard'));
    header.after(bar);
  }

  // ---------- Save ----------
  async function save(publish) {
    if (!model.title.trim()) { toast.error('Add a title first'); titleIn.focus(); return; }
    if (publish === true) { model.status = 'published'; if (!model.published_at) model.published_at = new Date().toISOString(); }
    if (publish === false) model.status = 'draft';
    const html = withIds(currentBody());
    const mins = minutes(html);
    const row = {
      slug: slugify(model.slug || model.title), title: model.title.trim(), excerpt: model.excerpt || null, category: model.category || null,
      author: model.author || null, author_role: model.author_role || null, read_time: model.read_time || `${mins} min read`, reading_minutes: mins,
      tags: (model.tags || []).filter(Boolean), cover_image: model.cover_image || null, body_html: html, status: model.status,
      seo_title: model.seo_title || null, seo_description: model.seo_description || null, focus_keyword: model.focus_keyword || null,
      canonical_url: model.canonical_url || null, og_image: model.og_image || null, noindex: !!model.noindex,
      cta_label: model.cta_label || null, cta_url: model.cta_url || null, faqs: (model.faqs || []).filter(f => f && (f.q || f.a)),
      published_at: model.status === 'published' ? (model.published_at || new Date().toISOString()) : (model.published_at || null)
    };
    if ('author_id' in model) row.author_id = model.author_id || null;
    if (model.format === 'gallery') row.content = { format: 'gallery', gallery: model.gallery.map(x => { const y = Object.assign({}, x); if (!y.isVideo) delete y.isVideo; if (!y.poster) delete y.poster; return y; }), galleryAnchors: model.galleryAnchors || {} };
    else if (isNew || (original && isGallery(original.content))) row.content = [];
    if (model.format === 'gallery' && model.gallery.some(x => !x.alt)) toast('Some gallery items have no alt text', { detail: 'Saved anyway. Add alt text for accessibility and SEO.' });
    saveBtn.disabled = pubBtn.disabled = true; saveBtn.classList.add('is-busy');
    try {
      if (isNew) {
        row.toc = [];
        row.created_by = ctx.user.id;
        const created = await db.insert('blog_posts', row);
        store.del(draftKey); dirty = false; ctx.view.dirty = null;
        toast.success(row.status === 'published' ? 'Post published in the CMS' : 'Draft created');
        if (row.status === 'published') ctx.publishHint();
        ctx.go('/admin/blog/' + created.id);
        return;
      }
      const patch = {};
      for (const [k, v] of Object.entries(row)) {
        const before = original[k];
        if (k === 'body_html' && !bodyTouched) continue;
        if (!same(nullish(v), nullish(before))) patch[k] = v;
      }
      if (!Object.keys(patch).length) { toast('No changes to save'); dirty = false; paintStatus(); return; }
      const saved = await db.update('blog_posts', id, patch);
      original = Object.assign(original, saved);
      baseline.model = clone(model); baseline.body = currentBody();
      store.del(draftKey); dirty = false;
      savedAt.textContent = 'Saved just now';
      toast.success(publish === true ? 'Published in the CMS' : publish === false ? 'Moved to draft' : 'Saved');
      if (row.status === 'published' || 'status' in patch) ctx.publishHint();
    } catch (e) {
      toast.error('Save failed', { detail: /duplicate key|unique/i.test(e.message) ? 'Another post already uses this URL slug.' : e.message });
    } finally { saveBtn.disabled = pubBtn.disabled = false; saveBtn.classList.remove('is-busy'); paintStatus(); }
  }
  const nullish = (v) => (v === '' || v === undefined || (Array.isArray(v) && !v.length) ? null : v);
  ctx.view.dirty = () => dirty;
  ctx.view.keys = { save: () => save() };
  return () => { saveDraft.flush && dirty && saveDraft.flush(); };
}
