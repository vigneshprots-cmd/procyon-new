// Schema-driven form builder used by the content editors.
// Field: { path, label, type, hint, placeholder, required, options, rows, counter: [min, max], fields (repeater/group), folder (image) }
// Types: text url email number date color textarea select checkbox slug tags list lines repeater group image
import { h, icon, clear, slugify } from './dom.js';
import { db } from './data.js';
import { toast } from './ui.js';

export const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function setPath(o, p, v) {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach(k => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
}

export function buildForm(fields, model, onChange) {
  const errs = new Map();
  const changed = (path) => { errs.delete(path); onChange && onChange(path); };
  const el = h('div.form', fields.map(f => fieldEl(f, model, changed, errs)));
  return {
    el,
    validate() {
      let first = null;
      el.querySelectorAll('.field.has-err').forEach(x => x.classList.remove('has-err'));
      for (const f of flat(fields)) {
        const v = getPath(model, f.path);
        let msg = null;
        if (f.required && (v == null || String(v).trim() === '')) msg = `${f.label} is required.`;
        else if (f.type === 'slug' && v && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) msg = 'Use lowercase letters, numbers and single hyphens.';
        else if (f.type === 'url' && v && !/^(https?:\/\/|\/|#|mailto:)/.test(v)) msg = 'Use a full https:// link or a site path starting with /.';
        if (msg) {
          const box = el.querySelector(`[data-path="${f.path}"]`);
          if (box) { box.classList.add('has-err'); const e = box.querySelector('.field__err'); if (e) e.textContent = msg; }
          if (!first) first = { f, msg, box };
        }
      }
      if (first && first.box) { first.box.scrollIntoView({ block: 'center', behavior: 'smooth' }); const i = first.box.querySelector('input, textarea, select'); if (i) i.focus({ preventScroll: true }); }
      return first ? first.msg : null;
    }
  };
}
const flat = (fields) => fields.flatMap(f => f.type === 'group' ? flat(f.fields.map(x => Object.assign({}, x, { path: f.path ? f.path + '.' + x.path : x.path }))) : [f]);

function counter(f, input) {
  if (!f.counter) return null;
  const [min, max] = f.counter;
  const c = h('span.counter');
  const upd = () => {
    const n = input.value.length;
    c.textContent = `${n}${max ? ' / ' + max : ''}`;
    c.className = 'counter' + (n && ((min && n < min) || (max && n > max)) ? ' is-bad' : n ? ' is-ok' : '');
  };
  input.addEventListener('input', upd); upd();
  return c;
}

export function fieldEl(f, model, changed) {
  if (f.type === 'group') {
    const sub = f.fields.map(x => Object.assign({}, x, { path: f.path ? f.path + '.' + x.path : x.path }));
    return h('fieldset.fgroup', h('legend', f.label), f.hint ? h('p.field__h', f.hint) : null, h('div.fgroup__grid' + (f.cols ? '.cols-' + f.cols : ''), sub.map(x => fieldEl(x, model, changed))));
  }
  const val = getPath(model, f.path);
  const set = (v) => { setPath(model, f.path, v); changed(f.path); };
  let control;
  switch (f.type) {
    case 'textarea': {
      control = h('textarea.input', { rows: f.rows || 3, placeholder: f.placeholder || '', value: val == null ? '' : val });
      control.addEventListener('input', () => set(control.value));
      break;
    }
    case 'select': {
      const opts = typeof f.options === 'function' ? f.options() : f.options;
      control = h('select.input', opts.map(o => typeof o === 'string' ? h('option', { value: o, selected: o === val }, o) : h('option', { value: o.id, selected: String(o.id) === String(val ?? '') }, o.label)));
      if (val != null && !opts.some(o => (typeof o === 'string' ? o : String(o.id)) === String(val))) control.append(h('option', { value: val, selected: true }, val + ' (current)'));
      control.addEventListener('change', () => set(control.value));
      break;
    }
    case 'checkbox': {
      const cb = h('input', { type: 'checkbox', checked: !!val });
      cb.addEventListener('change', () => set(cb.checked));
      return h('label.switch', { 'data-path': f.path }, cb, h('span.switch__ui'), h('span.switch__t', h('b', f.label), f.hint ? h('small', f.hint) : null));
    }
    case 'number': {
      control = h('input.input', { type: 'number', value: val == null ? '' : val, step: f.step || 1 });
      control.addEventListener('input', () => set(control.value === '' ? null : Number(control.value)));
      break;
    }
    case 'color': {
      const pick = h('input.input.input--color', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val || '') ? val : '#000000', 'aria-label': f.label + ' picker' });
      const txt = h('input.input', { value: val || '', placeholder: '#28A8DE' });
      pick.addEventListener('input', () => { txt.value = pick.value; set(pick.value); });
      txt.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(txt.value)) pick.value = txt.value; set(txt.value); });
      control = h('div.colorpair', pick, txt);
      break;
    }
    case 'slug': {
      control = h('input.input.input--mono', { value: val || '', placeholder: 'auto-from-title', spellcheck: 'false' });
      control.addEventListener('input', () => { control.dataset.touched = '1'; set(control.value); });
      control.addEventListener('blur', () => { const s = slugify(control.value); if (s !== control.value) { control.value = s; set(s); } });
      control.dataset.slugFor = f.source || 'title';
      if (val) control.dataset.touched = '1';
      break;
    }
    case 'tags': control = tagsEl(Array.isArray(val) ? val : [], set, f); break;
    case 'list': control = listEl(Array.isArray(val) ? val : [], set, f); break;
    case 'lines': {
      control = h('textarea.input', { rows: f.rows || 4, placeholder: f.placeholder || 'One item per line', value: Array.isArray(val) ? val.join('\n') : (val || '') });
      control.addEventListener('input', () => set(f.asArray ? control.value.split('\n').map(s => s.trim()).filter(Boolean) : control.value));
      break;
    }
    case 'repeater': control = repeaterEl(Array.isArray(val) ? val : [], set, f); break;
    case 'image': control = imageEl(val || '', set, f); break;
    default: {
      control = h('input.input', { type: f.type === 'url' ? 'text' : (f.type || 'text'), value: val == null ? '' : val, placeholder: f.placeholder || '', inputmode: f.type === 'url' ? 'url' : null, list: f.datalist ? 'dl-' + f.path.replace(/\W/g, '') : null });
      control.addEventListener('input', () => set(control.value));
    }
  }
  const dl = f.datalist ? h('datalist', { id: 'dl-' + f.path.replace(/\W/g, '') }, (typeof f.datalist === 'function' ? f.datalist() : f.datalist).map(o => h('option', { value: o }))) : null;
  const inputForCounter = control.tagName === 'INPUT' || control.tagName === 'TEXTAREA' ? control : null;
  return h('div.field' + (f.wide ? '.field--wide' : ''), { 'data-path': f.path },
    h('label.field__l', f.label, f.required ? h('span.req', ' *') : null, inputForCounter ? counter(f, inputForCounter) : null),
    control, dl, f.hint ? h('span.field__h', f.hint) : null, h('span.field__err', { role: 'alert' }));
}

function tagsEl(arr, set, f) {
  const box = h('div.tags');
  const input = h('input.tags__in', { placeholder: arr.length ? '' : (f.placeholder || 'Type and press Enter'), list: f.datalist ? 'dl-' + f.path.replace(/\W/g, '') : null });
  const paint = () => {
    clear(box).append(...arr.map((t, i) => h('span.tag.tag--x', t, h('button', { type: 'button', 'aria-label': 'Remove ' + t, onclick: () => { arr.splice(i, 1); set(arr.slice()); paint(); input.focus(); } }, icon('x', 11)))), input);
  };
  const add = () => { const parts = input.value.split(',').map(s => s.trim()).filter(Boolean); if (!parts.length) return; parts.forEach(p => { if (!arr.includes(p)) arr.push(p); }); input.value = ''; set(arr.slice()); paint(); input.focus(); };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    else if (e.key === 'Backspace' && !input.value && arr.length) { arr.pop(); set(arr.slice()); paint(); input.focus(); }
  });
  input.addEventListener('blur', add);
  box.addEventListener('click', (e) => { if (e.target === box) input.focus(); });
  paint();
  return box;
}

function dragSort(container, items, onMove) {
  let from = null;
  container.querySelectorAll(':scope > [data-i]').forEach(row => {
    const grip = row.querySelector('.grip');
    if (grip) { grip.addEventListener('mousedown', () => row.setAttribute('draggable', 'true')); grip.addEventListener('touchstart', () => row.setAttribute('draggable', 'true'), { passive: true }); }
    row.addEventListener('dragstart', (e) => { from = Number(row.dataset.i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(from)); row.classList.add('is-drag'); });
    row.addEventListener('dragend', () => { row.removeAttribute('draggable'); row.classList.remove('is-drag'); container.querySelectorAll('.is-target').forEach(x => x.classList.remove('is-target')); });
    row.addEventListener('dragover', (e) => { if (from == null) return; e.preventDefault(); row.classList.add('is-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('is-target'));
    row.addEventListener('drop', (e) => { e.preventDefault(); const to = Number(row.dataset.i); if (from != null && from !== to) { const [x] = items.splice(from, 1); items.splice(to, 0, x); onMove(); } from = null; });
  });
}

function listEl(arr, set, f) {
  const box = h('div.list');
  const paint = () => {
    clear(box).append(...arr.map((v, i) => {
      const input = h('input.input', { value: v, placeholder: f.placeholder || '', 'aria-label': `${f.label} ${i + 1}` });
      input.addEventListener('input', () => { arr[i] = input.value; set(arr.slice()); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); arr.splice(i + 1, 0, ''); set(arr.slice()); paint(); box.querySelectorAll('input')[i + 1].focus(); } });
      return h('div.list__row', { dataset: { i } }, h('span.grip', { title: 'Drag to reorder' }, icon('grip', 14)), input,
        h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Remove', onclick: () => { arr.splice(i, 1); set(arr.slice()); paint(); } }, icon('x', 14)));
    }), h('button.btn.btn--ghost.btn--sm.list__add', { type: 'button', onclick: () => { arr.push(''); set(arr.slice()); paint(); const ins = box.querySelectorAll('input'); ins[ins.length - 1].focus(); } }, icon('plus', 14), f.addLabel || 'Add item'));
    dragSort(box, arr, () => { set(arr.slice()); paint(); });
  };
  paint();
  return box;
}

function repeaterEl(arr, set, f) {
  const box = h('div.rep');
  const blank = () => Object.fromEntries(f.fields.map(x => [x.path, x.type === 'lines' && x.asArray ? [] : '']));
  const paint = () => {
    clear(box).append(...arr.map((item, i) => {
      const sub = f.fields.map(x => fieldEl(x, item, () => { set(arr.slice()); }));
      return h('div.rep__item', { dataset: { i } },
        h('div.rep__bar', h('span.grip', { title: 'Drag to reorder' }, icon('grip', 14)), h('b', `${f.itemLabel || 'Item'} ${i + 1}`),
          h('span.rep__acts',
            h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; set(arr.slice()); paint(); } }, icon('up', 14)),
            h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Move down', disabled: i === arr.length - 1, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; set(arr.slice()); paint(); } }, icon('down', 14)),
            h('button.iconbtn.iconbtn--sm', { type: 'button', 'aria-label': 'Remove', onclick: () => { arr.splice(i, 1); set(arr.slice()); paint(); } }, icon('trash', 14)))),
        h('div.rep__grid' + (f.cols ? '.cols-' + f.cols : ''), sub));
    }), h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { arr.push(blank()); set(arr.slice()); paint(); } }, icon('plus', 14), 'Add ' + (f.itemLabel || 'item').toLowerCase()));
    dragSort(box, arr, () => { set(arr.slice()); paint(); });
  };
  paint();
  return box;
}

export function imageEl(val, set, f) {
  const box = h('div.imgfield');
  let cur = val;
  const paint = (busy) => {
    const url = h('input.input.input--sm', { value: cur, placeholder: 'https://… or upload', 'aria-label': f.label + ' URL' });
    url.addEventListener('change', () => { cur = url.value.trim(); set(cur); paint(); });
    const file = h('input', { type: 'file', accept: f.accept || 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const fl = file.files[0]; if (!fl) return;
      if (fl.size > (f.maxMb || 8) * 1048576) { toast.error(`That file is over ${f.maxMb || 8} MB.`); return; }
      paint(true);
      try { cur = await db.upload(fl, f.folder || 'uploads'); set(cur); toast.success('Uploaded'); }
      catch (e) { toast.error('Upload failed', { detail: e.message }); }
      paint();
    });
    clear(box).append(
      h('div.imgfield__prev' + (cur ? '' : '.is-empty'), busy ? h('span.spin') : cur ? h('img', { src: cur, alt: '', loading: 'lazy' }) : icon('image', 22)),
      h('div.imgfield__ctl', h('div.imgfield__btns',
        h('button.btn.btn--sm', { type: 'button', disabled: busy, onclick: () => file.click() }, icon('upload', 14), cur ? 'Replace' : 'Upload'),
        cur ? h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { cur = ''; set(''); paint(); } }, 'Remove') : null), url, file));
  };
  paint();
  return box;
}

// Keep a slug in step with its source field until someone edits the slug by hand.
export function autoSlug(formEl, model, sourcePath = 'title', slugPath = 'slug') {
  const slugInput = formEl.querySelector(`[data-path="${slugPath}"] input`);
  const src = formEl.querySelector(`[data-path="${sourcePath}"] input, [data-path="${sourcePath}"] textarea`);
  if (!slugInput || !src) return;
  src.addEventListener('input', () => {
    if (slugInput.dataset.touched) return;
    const s = slugify(src.value);
    slugInput.value = s; setPath(model, slugPath, s);
  });
}
