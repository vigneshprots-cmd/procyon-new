// Block-based body builder. body_html <-> blocks, losslessly for anything it does not understand
// (unknown markup becomes an HTML block holding the original source).
// Block types: text (rich paragraphs and lists), heading, html, image, gallery, quote, cta.
import { h, icon, clear, esc, uid } from '../core/dom.js';
import { db } from '../core/data.js';
import { toast, menu, promptDialog } from '../core/ui.js';

export const BLOCK_TYPES = {
  text: { label: 'Text', icon: 'text', hint: 'Paragraphs, lists and links' },
  heading: { label: 'Heading', icon: 'heading', hint: 'Section title (H2) or sub-heading (H3)' },
  image: { label: 'Image', icon: 'image', hint: 'Single image with alt text and caption' },
  gallery: { label: 'Gallery', icon: 'gallery', hint: 'Grid of photos or videos with a lightbox' },
  quote: { label: 'Quote', icon: 'quote', hint: 'Pull quote with attribution' },
  cta: { label: 'Call to action', icon: 'cta', hint: 'Highlighted box with a button' },
  html: { label: 'HTML', icon: 'code', hint: 'Raw HTML, tables, embeds' }
};

// ---------- Parse ----------
export function parseBody(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const blocks = [];
  let text = [];
  const flush = () => { if (text.length) { blocks.push({ id: uid('b'), type: 'text', html: text.join('\n') }); text = []; } };
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 3) { const t = node.textContent.trim(); if (t) text.push(`<p>${esc(t)}</p>`); continue; }
    if (node.nodeType === 8) { flush(); blocks.push({ id: uid('b'), type: 'html', html: `<!--${node.textContent}-->` }); continue; }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toLowerCase();
    if ((tag === 'p' || tag === 'ul' || tag === 'ol') && !node.querySelector('img, iframe, video, script, style') && !node.attributes.length) { text.push(node.outerHTML); continue; }
    flush();
    if ((tag === 'h2' || tag === 'h3') && !node.querySelector('*:not(br)')) {
      blocks.push({ id: uid('b'), type: 'heading', level: tag === 'h2' ? 2 : 3, text: node.textContent.trim(), anchor: node.getAttribute('id') || '' });
      continue;
    }
    const b = asImage(node) || asGallery(node) || asCta(node) || asQuote(node);
    blocks.push(b ? Object.assign({ id: uid('b') }, b) : { id: uid('b'), type: 'html', html: node.outerHTML });
  }
  flush();
  return blocks;
}
function asImage(node) {
  const tag = node.tagName.toLowerCase();
  let img = null, cap = '';
  if (tag === 'img') img = node;
  else if (tag === 'figure' && node.querySelectorAll('img').length === 1 && !node.querySelector('figure, ul, table') && node.children.length <= 2) {
    img = node.querySelector('img');
    const fc = node.querySelector('figcaption');
    if (node.children.length === 2 && !fc) return null;
    cap = fc ? fc.textContent.trim() : '';
  } else if (tag === 'p' && node.children.length === 1 && node.children[0].tagName === 'IMG' && !node.textContent.trim()) img = node.children[0];
  if (!img) return null;
  return { type: 'image', src: img.getAttribute('src') || '', alt: img.getAttribute('alt') || '', caption: cap };
}
function asGallery(node) {
  if (!node.hasAttribute('data-pg')) return null;
  const items = Array.from(node.querySelectorAll('[data-pg-item]')).map((a, i) => {
    const img = a.querySelector('img');
    return { id: uid('g'), url: (img && img.getAttribute('src')) || a.getAttribute('href'), fullUrl: a.getAttribute('href'), alt: a.getAttribute('data-alt') || (img && img.getAttribute('alt')) || '', caption: a.getAttribute('data-caption') || '', isVideo: a.hasAttribute('data-video'), poster: a.getAttribute('data-poster') || '', sortOrder: i };
  });
  const title = (node.querySelector('.pgal__head b') || {}).textContent || '';
  return { type: 'gallery', title: title.replace(/ in pictures$/, ''), items };
}
function asCta(node) {
  if (node.tagName !== 'BLOCKQUOTE') return null;
  const ps = Array.from(node.children);
  if (!ps.length || ps.some(p => p.tagName !== 'P') || !/^\s*CTA\s*:/i.test(ps[0].textContent)) return null;
  const last = ps[ps.length - 1], a = last.querySelector('a');
  const hasBtn = a && last.textContent.trim() === a.textContent.trim() && ps.length > 1;
  return {
    type: 'cta', title: ps[0].textContent.replace(/^\s*CTA\s*:\s*/i, '').trim(),
    text: ps.slice(1, hasBtn ? -1 : undefined).map(p => p.textContent.trim()).join('\n\n'),
    label: hasBtn ? a.textContent.trim() : '', url: hasBtn ? a.getAttribute('href') || '' : ''
  };
}
function asQuote(node) {
  if (node.tagName !== 'BLOCKQUOTE' || node.attributes.length) return null;
  const kids = Array.from(node.children);
  if (!kids.length || kids.length > 2 || kids.some(k => k.tagName !== 'P')) return null;
  const citeP = kids.length === 2 ? kids[1] : null;
  if (citeP && !(citeP.children.length === 1 && citeP.children[0].tagName === 'CITE')) return null;
  return { type: 'quote', text: kids[0].innerHTML.trim(), cite: citeP ? citeP.textContent.trim() : '' };
}

// ---------- Serialize ----------
const attr = (s) => esc(s || '');
export function galleryHtml(title, items, collapse) {
  const t = title || 'Gallery';
  return `<section class="pgal" data-pg aria-label="${attr(t)}"${collapse && items.length > 8 ? ' data-pg-collapse="8"' : ''}>
  <div class="pgal__head"><b>${esc(t)}</b><span>${items.length} ${items.some(x => x.isVideo) ? 'photos and videos' : 'photos'}. Select one to enlarge.</span></div>
  <ul class="pgal__grid" role="list">
${items.map((x, i) => {
    const thumb = x.isVideo ? (x.poster || '') : x.url;
    const media = thumb ? `<img src="${attr(thumb)}" alt="${attr(x.alt)}" loading="lazy" decoding="async" width="640" height="480">` : `<video src="${attr(x.url)}#t=0.1" preload="metadata" muted playsinline aria-label="${attr(x.alt)}"></video>`;
    return `    <li><a class="pgal__tile" href="${attr(x.fullUrl || x.url)}" data-pg-item${x.isVideo ? ' data-video' : ''}${x.poster ? ` data-poster="${attr(x.poster)}"` : ''} data-alt="${attr(x.alt)}" data-caption="${attr(x.caption)}" aria-label="Open ${x.isVideo ? 'video' : 'photo'} ${i + 1} of ${items.length}${x.alt ? ': ' + attr(x.alt) : ''}">${media}${x.isVideo ? '<span class="pgal__play" aria-hidden="true"></span>' : ''}${x.caption ? `<span class="pgal__cap">${esc(x.caption)}</span>` : ''}</a></li>`;
  }).join('\n')}
  </ul>
</section>`;
}
export function serialize(blocks) {
  return blocks.map(b => {
    switch (b.type) {
      case 'text': return b.edited ? cleanRich(b.html) : b.html; // untouched text keeps its original markup
      case 'heading': return `<h${b.level}${b.anchor ? ` id="${attr(b.anchor)}"` : ''}>${esc(b.text)}</h${b.level}>`;
      case 'image': return b.src ? (b.caption ? `<figure><img src="${attr(b.src)}" alt="${attr(b.alt)}" loading="lazy" decoding="async"><figcaption>${esc(b.caption)}</figcaption></figure>` : `<p><img src="${attr(b.src)}" alt="${attr(b.alt)}" loading="lazy" decoding="async"></p>`) : '';
      case 'gallery': return b.items.length ? galleryHtml(b.title, b.items, true) : '';
      case 'quote': return b.text ? `<blockquote><p>${cleanInline(b.text)}</p>${b.cite ? `<p><cite>${esc(b.cite)}</cite></p>` : ''}</blockquote>` : '';
      case 'cta': return b.title ? `<blockquote><p>CTA: ${esc(b.title)}</p>${String(b.text || '').split(/\n{2,}/).filter(s => s.trim()).map(p => `<p>${esc(p.trim())}</p>`).join('')}${b.label && b.url ? `<p><a href="${attr(b.url)}">${esc(b.label)}</a></p>` : ''}</blockquote>` : '';
      default: return b.html || '';
    }
  }).filter(s => s && s.trim()).join('\n');
}

// Rich text sanitiser: keeps the tags the site styles, drops inline styles and editor debris.
const KEEP = { P: 1, UL: 1, OL: 1, LI: 1, A: 1, STRONG: 1, B: 1, EM: 1, I: 1, BR: 1, CODE: 1, SUB: 1, SUP: 1, H3: 1 };
export function cleanRich(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
  const walk = (el) => {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 8) { n.remove(); continue; }
      if (n.nodeType !== 1) continue;
      walk(n);
      const tag = n.tagName;
      if (tag === 'DIV') { const p = doc.createElement('p'); while (n.firstChild) p.appendChild(n.firstChild); n.replaceWith(p); continue; }
      if (!KEEP[tag]) { n.replaceWith(...Array.from(n.childNodes)); continue; }
      for (const a of Array.from(n.attributes)) if (!(tag === 'A' && (a.name === 'href' || a.name === 'target' || a.name === 'rel'))) n.removeAttribute(a.name);
      if (tag === 'A') { const href = n.getAttribute('href') || ''; if (/^\s*javascript:/i.test(href)) n.removeAttribute('href'); }
    }
  };
  walk(doc.body);
  // Bare text or inline nodes at the top level go inside a paragraph.
  let p = null;
  for (const n of Array.from(doc.body.childNodes)) {
    const block = n.nodeType === 1 && /^(P|UL|OL|H3)$/.test(n.tagName);
    if (block) { p = null; continue; }
    if (n.nodeType === 3 && !n.textContent.trim()) { n.remove(); continue; }
    if (!p) { p = doc.createElement('p'); n.before(p); }
    p.appendChild(n);
  }
  doc.body.querySelectorAll('p').forEach(x => { if (!x.textContent.trim() && !x.querySelector('br, img')) x.remove(); });
  return Array.from(doc.body.children).map(x => x.outerHTML).join('\n');
}
const cleanInline = (html) => cleanRich(`<p>${html}</p>`).replace(/^<p>|<\/p>$/g, '');

// ---------- Builder UI ----------
export function blockBuilder(blocks, onChange) {
  const root = h('div.bb');
  const changed = () => onChange(blocks);
  const insert = (at, type) => {
    const b = newBlock(type);
    blocks.splice(at, 0, b);
    changed(); paint();
    setTimeout(() => { const el = root.querySelector(`[data-id="${b.id}"] [contenteditable], [data-id="${b.id}"] input, [data-id="${b.id}"] textarea`); if (el) el.focus(); }, 20);
  };
  const adder = (at) => {
    const btn = h('button.bb__add', { type: 'button', title: 'Add a block here', 'aria-label': 'Add a block here' }, icon('plus', 14));
    btn.addEventListener('click', () => menu(btn, Object.entries(BLOCK_TYPES).map(([k, t]) => ({ label: t.label, icon: t.icon, run: () => insert(at, k) }))));
    return h('div.bb__gap', btn);
  };
  let dragFrom = null;
  function paint() {
    clear(root);
    blocks.forEach((b, i) => {
      root.append(adder(i));
      const el = blockEl(b, i);
      root.append(el);
    });
    root.append(h('div.bb__end', h('span.muted.small', 'Add a block'), Object.entries(BLOCK_TYPES).map(([k, t]) => h('button.btn.btn--sm.btn--ghost', { type: 'button', title: t.hint, onclick: () => insert(blocks.length, k) }, icon(t.icon, 14), t.label))));
  }
  function blockEl(b, i) {
    const T = BLOCK_TYPES[b.type];
    const tools = h('div.blk__tools',
      h('button.iconbtn.iconbtn--sm', { type: 'button', title: 'Move up', 'aria-label': 'Move block up', disabled: i === 0, onclick: () => { [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]]; changed(); paint(); } }, icon('up', 14)),
      h('button.iconbtn.iconbtn--sm', { type: 'button', title: 'Move down', 'aria-label': 'Move block down', disabled: i === blocks.length - 1, onclick: () => { [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]]; changed(); paint(); } }, icon('down', 14)),
      h('button.iconbtn.iconbtn--sm', { type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate block', onclick: () => { blocks.splice(i + 1, 0, Object.assign(JSON.parse(JSON.stringify(b)), { id: uid('b') })); changed(); paint(); } }, icon('copy', 14)),
      b.type !== 'html' ? h('button.iconbtn.iconbtn--sm', { type: 'button', title: 'Convert to HTML', 'aria-label': 'Convert to an HTML block', onclick: () => { blocks[i] = { id: b.id, type: 'html', html: serialize([b]) }; changed(); paint(); } }, icon('code', 14)) : null,
      h('button.iconbtn.iconbtn--sm.danger', { type: 'button', title: 'Delete block', 'aria-label': 'Delete block', onclick: () => { blocks.splice(i, 1); changed(); paint(); } }, icon('trash', 14)));
    const grip = h('span.blk__grip', { title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip', 14));
    const el = h('div.blk.blk--' + b.type, { 'data-id': b.id }, h('div.blk__side', grip, h('span.blk__type', { title: T.label }, icon(T.icon, 13))), h('div.blk__main', editor(b)), tools);
    grip.addEventListener('mousedown', () => el.setAttribute('draggable', 'true'));
    el.addEventListener('dragstart', (e) => { if (el.getAttribute('draggable') !== 'true') return; dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'block'); el.classList.add('is-drag'); });
    el.addEventListener('dragend', () => { el.removeAttribute('draggable'); el.classList.remove('is-drag'); root.querySelectorAll('.is-target').forEach(x => x.classList.remove('is-target')); dragFrom = null; });
    el.addEventListener('dragover', (e) => { if (dragFrom == null) return; e.preventDefault(); el.classList.add('is-target'); });
    el.addEventListener('dragleave', () => el.classList.remove('is-target'));
    el.addEventListener('drop', (e) => { if (dragFrom == null) return; e.preventDefault(); const [x] = blocks.splice(dragFrom, 1); blocks.splice(i, 0, x); dragFrom = null; changed(); paint(); });
    return el;
  }
  function editor(b) {
    switch (b.type) {
      case 'text': return richEditor(b, changed, (after) => insert(blocks.indexOf(b) + 1, after));
      case 'heading': {
        const lvl = h('select.input.input--sm.blk__lvl', { 'aria-label': 'Heading level' }, h('option', { value: 2, selected: b.level === 2 }, 'H2'), h('option', { value: 3, selected: b.level === 3 }, 'H3'));
        lvl.addEventListener('change', () => { b.level = Number(lvl.value); input.className = 'blk__h blk__h--' + b.level; changed(); });
        const input = h('input.blk__h.blk__h--' + b.level, { value: b.text, placeholder: b.level === 2 ? 'Section heading' : 'Sub-heading', 'aria-label': 'Heading text' });
        input.addEventListener('input', () => { b.text = input.value; changed(); });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); insert(blocks.indexOf(b) + 1, 'text'); } });
        return h('div.blk__row', lvl, input);
      }
      case 'html': {
        const ta = h('textarea.input.input--code', { rows: Math.min(18, Math.max(3, (b.html.match(/\n/g) || []).length + 2)), spellcheck: 'false', value: b.html, 'aria-label': 'HTML' });
        ta.addEventListener('input', () => { b.html = ta.value; changed(); });
        ta.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); b.html = ta.value; changed(); } });
        const prev = h('div.blk__htmlprev', { hidden: true });
        const tg = h('button.linkbtn', { type: 'button', onclick: () => { prev.hidden = !prev.hidden; tg.textContent = prev.hidden ? 'Show rendered' : 'Hide rendered'; if (!prev.hidden) prev.innerHTML = safePreview(b.html); } }, 'Show rendered');
        return h('div', h('div.blk__label', 'HTML ', tg), ta, prev);
      }
      case 'image': return imageBlock(b, changed);
      case 'gallery': return galleryBlock(b, changed);
      case 'quote': {
        const t = h('textarea.input.blk__quote', { rows: 2, value: decode(b.text), placeholder: 'Quote text', 'aria-label': 'Quote' });
        const c = h('input.input.input--sm', { value: b.cite, placeholder: 'Name, role (optional)', 'aria-label': 'Attribution' });
        t.addEventListener('input', () => { b.text = esc(t.value); changed(); });
        c.addEventListener('input', () => { b.cite = c.value; changed(); });
        return h('div.blk__stack', t, c);
      }
      case 'cta': {
        const mk = (k, ph, tag = 'input') => { const x = h(tag + '.input' + (tag === 'input' ? '.input--sm' : ''), { value: b[k] || '', placeholder: ph, rows: tag === 'textarea' ? 2 : null, 'aria-label': ph }); x.addEventListener('input', () => { b[k] = x.value; changed(); }); return x; };
        return h('div.blk__cta', h('div.blk__label', 'Call-to-action box'), mk('title', 'Headline, e.g. Plan your first production agent'), mk('text', 'Supporting line', 'textarea'), h('div.blk__row', mk('label', 'Button label'), mk('url', 'Button link, e.g. /contact')));
      }
    }
    return h('div');
  }
  paint();
  return { el: root, refresh: paint };
}

export function newBlock(type) {
  const id = uid('b');
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '', anchor: '' };
    case 'image': return { id, type, src: '', alt: '', caption: '' };
    case 'gallery': return { id, type, title: 'In pictures', items: [] };
    case 'quote': return { id, type, text: '', cite: '' };
    case 'cta': return { id, type, title: '', text: '', label: 'Talk to a senior architect', url: '/contact' };
    case 'html': return { id, type, html: '' };
    default: return { id, type: 'text', html: '<p></p>' };
  }
}

const decode = (html) => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent || ''; };

// Strip scripts and handlers before showing author HTML inside the admin.
export function safePreview(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<iframe[\s\S]*?<\/iframe>/gi, '<p><em>[embedded frame]</em></p>').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
}

function richEditor(b, changed, addAfter) {
  const area = h('div.rich', { contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Text', 'data-placeholder': 'Write, or paste from a document…' });
  area.innerHTML = b.html || '<p></p>';
  const sync = () => { b.html = area.innerHTML; b.edited = true; changed(); };
  const cmd = (c, v) => { area.focus(); document.execCommand(c, false, v); sync(); };
  const tb = h('div.rich__tb', { role: 'toolbar', 'aria-label': 'Formatting' },
    h('button', { type: 'button', title: 'Bold (Ctrl+B)', 'aria-label': 'Bold', onmousedown: (e) => { e.preventDefault(); cmd('bold'); } }, icon('bold', 14)),
    h('button', { type: 'button', title: 'Italic (Ctrl+I)', 'aria-label': 'Italic', onmousedown: (e) => { e.preventDefault(); cmd('italic'); } }, icon('italic', 14)),
    h('button', { type: 'button', title: 'Link (Ctrl+K)', 'aria-label': 'Link', onmousedown: (e) => { e.preventDefault(); link(); } }, icon('link', 14)),
    h('button', { type: 'button', title: 'Bulleted list', 'aria-label': 'Bulleted list', onmousedown: (e) => { e.preventDefault(); cmd('insertUnorderedList'); } }, icon('ul', 14)),
    h('button', { type: 'button', title: 'Numbered list', 'aria-label': 'Numbered list', onmousedown: (e) => { e.preventDefault(); cmd('insertOrderedList'); } }, icon('ol', 14)),
    h('button', { type: 'button', title: 'Sub-heading inside text', 'aria-label': 'Sub-heading', onmousedown: (e) => { e.preventDefault(); cmd('formatBlock', 'h3'); } }, 'H3'),
    h('button', { type: 'button', title: 'Plain paragraph', 'aria-label': 'Paragraph', onmousedown: (e) => { e.preventDefault(); cmd('formatBlock', 'p'); } }, '¶'),
    h('button', { type: 'button', title: 'Clear formatting', 'aria-label': 'Clear formatting', onmousedown: (e) => { e.preventDefault(); cmd('removeFormat'); cmd('unlink'); } }, icon('x', 13)));
  async function link() {
    const sel = window.getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const url = await promptDialog({ title: 'Insert link', label: 'Link address', placeholder: '/contact or https://…', confirm: 'Insert' });
    area.focus();
    if (range) { sel.removeAllRanges(); sel.addRange(range); }
    if (url === null) return;
    if (!url) { cmd('unlink'); return; }
    if (/^\s*javascript:/i.test(url)) return;
    if (range && range.collapsed) { cmd('insertHTML', `<a href="${esc(url)}">${esc(url)}</a>`); return; }
    cmd('createLink', url);
  }
  area.addEventListener('focus', () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* older browsers */ } });
  area.addEventListener('input', sync);
  area.addEventListener('blur', () => { const c = cleanRich(area.innerHTML) || '<p></p>'; if (c !== area.innerHTML) area.innerHTML = c; if (cleanRich(b.html) !== c) { b.html = c; changed(); } });
  area.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); link(); }
  });
  area.addEventListener('paste', (e) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    const clean = html ? cleanRich(html.replace(/<!--[\s\S]*?-->/g, '')) : String(text).split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    document.execCommand('insertHTML', false, clean);
    sync();
  });
  return h('div.rich__wrap', tb, area);
}

function imageBlock(b, changed) {
  const box = h('div.blk__img');
  const paint = (busy) => {
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      paint(true);
      try { b.src = await db.upload(f, 'inline'); if (!b.alt) b.alt = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); changed(); toast.success('Image uploaded'); }
      catch (e) { toast.error('Upload failed', { detail: e.message }); }
      paint();
    });
    const alt = h('input.input.input--sm' + (b.src && !b.alt ? '.is-warn' : ''), { value: b.alt, placeholder: 'Alt text: describe the image for screen readers and search', 'aria-label': 'Alt text' });
    alt.addEventListener('input', () => { b.alt = alt.value; alt.classList.toggle('is-warn', !!b.src && !b.alt); changed(); });
    const cap = h('input.input.input--sm', { value: b.caption, placeholder: 'Caption (optional)', 'aria-label': 'Caption' });
    cap.addEventListener('input', () => { b.caption = cap.value; changed(); });
    const url = h('input.input.input--sm', { value: b.src, placeholder: 'Image URL', 'aria-label': 'Image URL' });
    url.addEventListener('change', () => { b.src = url.value.trim(); changed(); paint(); });
    clear(box).append(
      h('div.blk__imgprev' + (b.src ? '' : '.is-empty'), busy ? h('span.spin') : b.src ? h('img', { src: b.src, alt: '' }) : h('button.btn.btn--sm', { type: 'button', onclick: () => file.click() }, icon('upload', 14), 'Upload image')),
      h('div.blk__stack', b.src ? h('div.blk__row', url, h('button.btn.btn--sm', { type: 'button', onclick: () => file.click() }, 'Replace')) : url, alt, cap, file));
  };
  paint();
  return box;
}

function galleryBlock(b, changed) {
  const box = h('div.blk__gal');
  const title = h('input.input.input--sm', { value: b.title, placeholder: 'Strip title, e.g. Day 1', 'aria-label': 'Gallery title' });
  title.addEventListener('input', () => { b.title = title.value; changed(); });
  const grid = h('div');
  import('./gallery-editor.js').then(({ mediaGrid }) => {
    const g = mediaGrid(b.items, () => { b.items.forEach((x, i) => { x.sortOrder = i; }); changed(); }, { folder: 'gallery' });
    grid.append(g);
  });
  box.append(h('div.blk__label', 'Inline gallery ', h('span.muted', 'opens in the site lightbox')), title, grid);
  return box;
}
