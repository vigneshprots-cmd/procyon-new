// Gallery tools: the media tile grid (upload, drag to reorder, alt/caption/poster) and the
// gallery-format manager (groups such as "Day 1", placement anchors under H2 sections).
// Item shape (blog_posts.content.gallery[]): { id, url, fullUrl, alt, caption, group, sortOrder, isVideo?, poster? }
import { h, icon, clear, uid } from '../core/dom.js';
import { db } from '../core/data.js';
import { toast, modal, confirmDialog, promptDialog, menu } from '../core/ui.js';
import { imageEl } from '../core/form.js';

const MAX_IMAGE_MB = 20, MAX_VIDEO_MB = 200;
const nameToAlt = (n) => n.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

async function uploadFiles(files, makeItem, progress) {
  const out = [];
  const list = Array.from(files);
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const video = /^video\//.test(f.type);
    if (!/^(image|video)\//.test(f.type)) { toast.error(`${f.name} is not an image or video`); continue; }
    if (f.size > (video ? MAX_VIDEO_MB : MAX_IMAGE_MB) * 1048576) { toast.error(`${f.name} is too large`, { detail: `Limit ${video ? MAX_VIDEO_MB : MAX_IMAGE_MB} MB.` }); continue; }
    progress(`Uploading ${i + 1} of ${list.length}: ${f.name}`);
    try {
      const url = await db.upload(f, 'gallery');
      out.push(makeItem({ id: uid('g'), url, fullUrl: url, alt: nameToAlt(f.name), caption: '', isVideo: video }));
    } catch (e) { toast.error(`Upload failed: ${f.name}`, { detail: e.message }); }
  }
  progress(null);
  return out;
}

// Tile grid over `items` (mutated in place). Used by the inline gallery block.
export function mediaGrid(items, onChange, opts = {}) {
  const root = h('div.mgrid');
  const paint = () => {
    clear(root).append(tiles(items, { onChange: () => { onChange(); paint(); }, groups: null }), uploader(async (files, progress) => {
      const added = await uploadFiles(files, (x) => Object.assign(x, { group: opts.group || 'Gallery', sortOrder: items.length }), progress);
      items.push(...added); onChange(); paint();
      if (added.length) toast.success(`Added ${added.length} item${added.length > 1 ? 's' : ''}`);
    }, (url) => { items.push({ id: uid('g'), url, fullUrl: url, alt: '', caption: '', group: opts.group || 'Gallery', sortOrder: items.length }); onChange(); paint(); }));
  };
  paint();
  return root;
}

function tiles(list, { onChange, groups, onMoveGroup }) {
  if (!list.length) return h('div.mgrid__empty', icon('image', 22), h('span', 'No photos or videos yet. Upload some below.'));
  const grid = h('div.mtiles');
  let from = null;
  list.forEach((x, i) => {
    const thumb = x.isVideo ? (x.poster ? h('img', { src: x.poster, alt: '', loading: 'lazy' }) : h('video', { src: x.url + '#t=0.1', muted: true, preload: 'metadata' })) : h('img', { src: x.url, alt: '', loading: 'lazy' });
    const tile = h('div.mtile' + (!x.alt ? '.is-warn' : ''), { draggable: 'true', dataset: { i }, tabindex: '0', title: x.alt || 'Missing alt text', onclick: () => edit(x), onkeydown: (e) => { if (e.key === 'Enter') edit(x); } },
      thumb, x.isVideo ? h('span.mtile__vid', icon('video', 12)) : null,
      !x.alt ? h('span.mtile__warn', { title: 'Missing alt text' }, icon('alert', 12)) : null,
      h('span.mtile__n', String(i + 1)),
      x.caption ? h('span.mtile__cap', x.caption) : null);
    tile.addEventListener('dragstart', (e) => { from = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/gallery', x.id); tile.classList.add('is-drag'); });
    tile.addEventListener('dragend', () => { tile.classList.remove('is-drag'); grid.querySelectorAll('.is-target').forEach(t => t.classList.remove('is-target')); from = null; });
    tile.addEventListener('dragover', (e) => { if (from == null) return; e.preventDefault(); tile.classList.add('is-target'); });
    tile.addEventListener('dragleave', () => tile.classList.remove('is-target'));
    tile.addEventListener('drop', (e) => { e.preventDefault(); if (from == null || from === i) return; const [m] = list.splice(from, 1); list.splice(i, 0, m); from = null; onChange(); });
    grid.append(tile);
  });
  function edit(x) {
    const alt = h('input.input', { value: x.alt || '', placeholder: 'Describe the photo for screen readers and search' });
    const cap = h('input.input', { value: x.caption || '', placeholder: 'Shown on hover and in the lightbox' });
    const url = h('input.input.input--sm', { value: x.url || '' });
    const full = h('input.input.input--sm', { value: x.fullUrl || '' });
    const vid = h('input', { type: 'checkbox', checked: !!x.isVideo });
    const groupSel = groups ? h('select.input', groups.map(g => h('option', { value: g, selected: g === x.group }, g))) : null;
    let poster = x.poster || '';
    const posterField = imageEl(poster, (v) => { poster = v; }, { label: 'Poster', folder: 'gallery' });
    modal({
      title: x.isVideo ? 'Edit video' : 'Edit photo', wide: true,
      body: h('div.medit',
        h('div.medit__prev', x.isVideo ? h('video', { src: x.url, controls: true, poster: x.poster || null, preload: 'metadata' }) : h('img', { src: x.fullUrl || x.url, alt: '' })),
        h('div.form',
          h('label.field', h('span.field__l', 'Alt text ', h('span.req', '*')), alt, h('span.field__h', 'Required for accessibility and the SEO score.')),
          h('label.field', h('span.field__l', 'Caption'), cap),
          groupSel ? h('label.field', h('span.field__l', 'Group'), groupSel) : null,
          h('label.switch', vid, h('span.switch__ui'), h('span.switch__t', h('b', 'This is a video'))),
          h('div.field', h('span.field__l', 'Video poster image'), posterField, h('span.field__h', 'Shown on the tile and before playback. Videos without a poster show their first frame.')),
          h('details.adv', h('summary', 'File addresses'), h('label.field', h('span.field__l', 'Tile image URL'), url), h('label.field', h('span.field__l', 'Full-size URL (lightbox)'), full)))),
      actions: [
        { label: 'Delete', danger: true, run: async () => { if (!(await confirmDialog({ title: 'Remove this item?', message: 'It is removed from the gallery. The file stays in storage.', confirm: 'Remove', danger: true }))) return false; list.splice(list.indexOf(x), 1); onChange(); } },
        { label: 'Cancel' },
        { label: 'Done', primary: true, run: () => {
          Object.assign(x, { alt: alt.value.trim(), caption: cap.value.trim(), url: url.value.trim() || x.url, fullUrl: full.value.trim() || url.value.trim() || x.url, isVideo: vid.checked || undefined });
          if (!x.isVideo) delete x.isVideo;
          if (poster) x.poster = poster; else delete x.poster;
          if (groupSel && groupSel.value !== x.group) { onMoveGroup(x, groupSel.value); return; }
          onChange();
        } }]
    });
  }
  return grid;
}

function uploader(onFiles, onUrl) {
  const status = h('span.muted.small');
  const file = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
  const run = async (files) => { if (!files || !files.length) return; drop.classList.add('is-busy'); await onFiles(files, (msg) => { status.textContent = msg || ''; }); drop.classList.remove('is-busy'); };
  file.addEventListener('change', () => { run(file.files); file.value = ''; });
  const drop = h('div.drop', { tabindex: '0', role: 'button', 'aria-label': 'Upload photos or videos', onclick: () => file.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } } },
    icon('upload', 18), h('span', h('b', 'Drop photos or videos'), ' or click to upload. Several at once is fine.'), status, file);
  drop.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { if (!e.dataTransfer.files.length) return; e.preventDefault(); drop.classList.remove('is-over'); run(e.dataTransfer.files); });
  const byUrl = h('button.linkbtn', { type: 'button', onclick: async () => { const u = await promptDialog({ title: 'Add by URL', label: 'Image or video address', placeholder: 'https://…', confirm: 'Add' }); if (u && /^https?:\/\//.test(u)) onUrl(u); else if (u) toast.error('Use a full https:// address.'); } }, 'Add by URL instead');
  return h('div.uploader', drop, byUrl);
}

// ---------- Placement: which H2 does each group sit under? (same rules as build-insights.js) ----------
const DEFAULT_ANCHORS = { 'Day 1': /actually announced|announcement|day 1/i, 'Day 2': /demos to numbers|evidence|proof|day 2/i, 'Day 3': /governance|sprawl|day 3/i };
const safeRe = (s) => { try { return s ? new RegExp(s, 'i') : null; } catch (e) { return null; } };
export function placeGroups(headings, groupNames, anchors = {}) {
  const used = new Set(), at = {};
  for (const heading of headings) {
    for (const g of groupNames) {
      if (used.has(g)) continue;
      const byName = new RegExp('^\\s*' + g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\b', 'i');
      const a = safeRe(anchors[g]);
      if (byName.test(heading) || (a && a.test(heading)) || (DEFAULT_ANCHORS[g] && DEFAULT_ANCHORS[g].test(heading))) { used.add(g); at[g] = heading; break; }
    }
  }
  return at;
}
export function groupsOf(items) {
  const m = new Map();
  items.forEach(x => { const g = String(x.group || 'Day 1').trim() || 'Day 1'; if (!m.has(g)) m.set(g, []); m.get(g).push(x); });
  m.forEach(l => l.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
  return m;
}
// Inserts strips after their sections, unmatched groups at the end. Mirrors build-insights.js withGallery().
export function withGalleryHtml(html, items, anchors, stripHtml) {
  const groups = groupsOf(items);
  if (!groups.size) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const heads = Array.from(doc.body.children).filter(e => e.tagName === 'H2');
  const place = placeGroups(heads.map(x => x.textContent.trim()), [...groups.keys()], anchors);
  for (const [g, heading] of Object.entries(place)) {
    const hEl = heads.find(x => x.textContent.trim() === heading);
    let end = hEl.nextElementSibling;
    while (end && end.tagName !== 'H2') end = end.nextElementSibling;
    const tpl = doc.createElement('template');
    tpl.innerHTML = stripHtml(g, groups.get(g));
    if (end) end.before(tpl.content); else doc.body.append(tpl.content);
  }
  let out = doc.body.innerHTML;
  for (const [g, list] of groups) if (!place[g]) out += '\n' + stripHtml(g, list);
  return out;
}

// ---------- Gallery-format manager ----------
export function galleryManager(model, onChange, getHeadings) {
  const root = h('div.gman');
  let current = null;
  const items = model.gallery;
  const renumber = () => {
    // Keep the array grouped in group order, then number sortOrder globally (what the existing CMS does).
    const g = groupsOf(items);
    const ordered = [...g.values()].flat();
    items.length = 0; items.push(...ordered);
    items.forEach((x, i) => { x.sortOrder = i; });
  };
  const changed = () => { renumber(); onChange(); paint(); };
  function paint() {
    const groups = groupsOf(items);
    const names = [...new Set([...groups.keys(), ...(model._extraGroups || [])])];
    if (!names.length) names.push('Day 1');
    if (!current || !names.includes(current)) current = names[0];
    const place = placeGroups(getHeadings(), names, model.galleryAnchors || {});
    const tabs = h('div.gman__tabs', { role: 'tablist' }, names.map(n => {
      const t = h('button.gman__tab' + (n === current ? '.is-on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(n === current), onclick: () => { current = n; paint(); } }, n, h('small', String((groups.get(n) || []).length)));
      t.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/gallery')) { e.preventDefault(); t.classList.add('is-over'); } });
      t.addEventListener('dragleave', () => t.classList.remove('is-over'));
      t.addEventListener('drop', (e) => { e.preventDefault(); t.classList.remove('is-over'); const x = items.find(i => i.id === e.dataTransfer.getData('text/gallery')); if (x && x.group !== n) { x.group = n; x.sortOrder = 1e9; changed(); toast(`Moved to ${n}`); } });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); groupMenu(t, n); });
      return t;
    }), h('button.gman__tab.gman__tab--add', { type: 'button', onclick: async () => {
      const n = await promptDialog({ title: 'New group', label: 'Group name', placeholder: 'Day 4, The keynote, Booth…', confirm: 'Add group' });
      if (!n) return; model._extraGroups = [...(model._extraGroups || []), n]; current = n; paint();
    } }, icon('plus', 13), 'Group'));
    const list = (groups.get(current) || []).slice();
    const grid = tiles(list, {
      groups: names,
      onChange: () => { const g = groupsOf(items); g.set(current, list); const ord = [...g.values()].flat(); items.length = 0; items.push(...ord); items.forEach((x, i) => { x.sortOrder = i; }); changed(); },
      onMoveGroup: (x, g) => { x.group = g; x.sortOrder = 1e9; changed(); }
    });
    const anchor = h('input.input.input--sm', { value: (model.galleryAnchors || {})[current] || '', placeholder: 'e.g. keynote|announced (words from the H2)', 'aria-label': 'Heading match' });
    anchor.addEventListener('input', () => { model.galleryAnchors = Object.assign({}, model.galleryAnchors || {}); if (anchor.value.trim()) model.galleryAnchors[current] = anchor.value.trim(); else delete model.galleryAnchors[current]; onChange(); placeNote.textContent = where(); });
    const where = () => { const p = placeGroups(getHeadings(), names, model.galleryAnchors || {})[current]; return p ? `Shows under the section "${p}".` : 'No heading matches, so this strip shows after the article.'; };
    const placeNote = h('span.gman__where', where());
    clear(root).append(
      h('div.gman__head', h('div', h('b', 'Photo strips'), h('p.muted.small', `${items.length} items in ${names.length} group${names.length > 1 ? 's' : ''}. Drag tiles to reorder, or onto a group tab to move them.`)),
        h('button.iconbtn', { type: 'button', title: 'Group options', 'aria-label': 'Group options', onclick: (e) => groupMenu(e.currentTarget, current) }, icon('more', 16))),
      tabs,
      h('div.gman__place', icon('info', 14), placeNote, h('label.gman__anchor', h('span.small.muted', 'Place under the heading matching'), anchor)),
      grid,
      uploader(async (files, progress) => {
        const added = await uploadFiles(files, (x) => Object.assign(x, { group: current, sortOrder: 1e9 }), progress);
        items.push(...added); changed();
        if (added.length) toast.success(`Added ${added.length} to ${current}`);
      }, (url) => { items.push({ id: uid('g'), url, fullUrl: url, alt: '', caption: '', group: current, sortOrder: 1e9 }); changed(); }));
    void place;
  }
  function groupMenu(anchor, n) {
    menu(anchor, [
      { label: `Rename "${n}"`, icon: 'authors', run: async () => {
        const v = await promptDialog({ title: 'Rename group', label: 'Group name', value: n });
        if (!v || v === n) return;
        items.forEach(x => { if ((x.group || 'Day 1') === n) x.group = v; });
        if (model.galleryAnchors && model.galleryAnchors[n]) { model.galleryAnchors[v] = model.galleryAnchors[n]; delete model.galleryAnchors[n]; }
        model._extraGroups = (model._extraGroups || []).map(g => g === n ? v : g);
        current = v; changed();
      } },
      { label: `Move "${n}" earlier`, icon: 'up', run: () => moveGroup(n, -1) },
      { label: `Move "${n}" later`, icon: 'down', run: () => moveGroup(n, 1) },
      '-',
      { label: `Delete "${n}" and its items`, icon: 'trash', danger: true, run: async () => {
        const count = items.filter(x => (x.group || 'Day 1') === n).length;
        if (count && !(await confirmDialog({ title: `Delete ${n}?`, message: `${count} item${count > 1 ? 's' : ''} will be removed from this post. Files stay in storage.`, confirm: 'Delete group', danger: true }))) return;
        for (let i = items.length - 1; i >= 0; i--) if ((items[i].group || 'Day 1') === n) items.splice(i, 1);
        model._extraGroups = (model._extraGroups || []).filter(g => g !== n);
        current = null; changed();
      } }
    ]);
  }
  function moveGroup(n, d) {
    const g = groupsOf(items); const names = [...g.keys()]; const i = names.indexOf(n), j = i + d;
    if (i < 0 || j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    const ordered = names.flatMap(k => g.get(k));
    items.length = 0; items.push(...ordered); items.forEach((x, k) => { x.sortOrder = k; });
    onChange(); paint();
  }
  paint();
  return { el: root, refresh: paint };
}
