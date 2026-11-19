// UI primitives: toasts, modals, confirm, drawers, menus, skeletons, empty states, badges.
import { h, icon, initials, clear } from './dom.js';

// ---------- Toasts ----------
let toastRoot;
export function toast(message, opts = {}) {
  if (!toastRoot) { toastRoot = h('div.toasts', { role: 'region', 'aria-label': 'Notifications' }); document.body.appendChild(toastRoot); }
  const tone = opts.tone || 'info';
  const el = h('div.toast.toast--' + tone, { role: tone === 'error' ? 'alert' : 'status' },
    icon(tone === 'error' ? 'alert' : tone === 'success' ? 'check' : 'info', 16, 'toast__ic'),
    h('div.toast__body', h('b', message), opts.detail ? h('span', opts.detail) : null),
    opts.action ? h('button.toast__act', { type: 'button', onclick: () => { opts.action.run(); close(); } }, opts.action.label) : null,
    h('button.toast__x', { type: 'button', 'aria-label': 'Dismiss', onclick: () => close() }, icon('x', 14)));
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  let timer = setTimeout(close, opts.duration || (tone === 'error' ? 7000 : 4200));
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(close, 2000); });
  function close() { clearTimeout(timer); el.classList.remove('is-in'); setTimeout(() => el.remove(), 200); }
  return { close, update(msg, detail) { el.querySelector('.toast__body b').textContent = msg; const s = el.querySelector('.toast__body span'); if (s && detail != null) s.textContent = detail; } };
}
toast.success = (m, o) => toast(m, Object.assign({ tone: 'success' }, o));
toast.error = (m, o) => toast(m, Object.assign({ tone: 'error' }, o));

// ---------- Layers (modal + drawer share focus handling and Escape) ----------
const layers = [];
export const hasLayer = () => layers.length > 0;
document.addEventListener('keydown', (e) => {
  const top = layers[layers.length - 1];
  if (!top) return;
  if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); top.close(); }
  if (e.key === 'Tab') {
    const f = Array.from(top.el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
function pushLayer(el, onClose) {
  const back = document.activeElement;
  const layer = {
    el,
    close() {
      const i = layers.indexOf(layer);
      if (i < 0) return;
      if (onClose && onClose() === false) return;
      layers.splice(i, 1);
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 180);
      if (back && back.focus && document.contains(back)) back.focus();
    }
  };
  layers.push(layer);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  return layer;
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const panel = h('div.modal__panel' + (wide ? '.modal__panel--wide' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const el = h('div.modal', { onmousedown: (e) => { if (e.target === el) layer.close(); } }, panel);
  const foot = actions.length ? h('div.modal__foot', actions.map(a => h('button.btn' + (a.primary ? '.btn--primary' : a.danger ? '.btn--danger' : ''), {
    type: 'button', onclick: async (e) => { const b = e.currentTarget; if (a.run) { b.disabled = true; try { if ((await a.run()) !== false) layer.close(); } finally { b.disabled = false; } } else layer.close(); }
  }, a.label))) : null;
  panel.append(h('div.modal__head', h('h2', title), h('button.iconbtn', { type: 'button', 'aria-label': 'Close', onclick: () => layer.close() }, icon('x'))), h('div.modal__body', body), foot);
  const layer = pushLayer(el, onClose);
  setTimeout(() => { const f = panel.querySelector('input, textarea, select, button.btn--primary'); if (f) f.focus(); }, 30);
  return layer;
}

export function confirmDialog({ title, message, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: h('p.modal__msg', message),
      actions: [{ label: 'Cancel' }, { label: confirm, primary: !danger, danger, run: () => { done = true; resolve(true); } }],
      onClose: () => { if (!done) resolve(false); }
    });
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirm = 'Save' }) {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input.input', { value, placeholder, 'aria-label': label });
    const layer = modal({
      title, body: h('label.field', h('span.field__l', label), input),
      actions: [{ label: 'Cancel' }, { label: confirm, primary: true, run: () => { done = true; resolve(input.value.trim()); } }],
      onClose: () => { if (!done) resolve(null); }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done = true; resolve(input.value.trim()); layer.close(); } });
  });
}

export function drawer({ title, subtitle, body, actions, width = 560, onClose }) {
  const panel = h('aside.drawer__panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Details', style: { width: `min(${width}px, 100vw)` } });
  const el = h('div.drawer', { onmousedown: (e) => { if (e.target === el) layer.close(); } }, panel);
  const head = h('div.drawer__head', h('div.drawer__titles', h('h2', title), subtitle ? h('p', subtitle) : null), h('div.drawer__acts', actions || null, h('button.iconbtn', { type: 'button', 'aria-label': 'Close', onclick: () => layer.close() }, icon('x'))));
  const content = h('div.drawer__body', body);
  panel.append(head, content);
  const layer = pushLayer(el, onClose);
  setTimeout(() => panel.querySelector('.iconbtn').focus(), 30);
  layer.setBody = (b) => { clear(content); content.append(b); };
  layer.setTitle = (t, s) => { const tt = head.querySelector('.drawer__titles'); clear(tt); tt.append(h('h2', t), s ? h('p', s) : null); };
  return layer;
}

// ---------- Popover menu ----------
let openMenu = null;
export function menu(anchor, items, { align = 'start' } = {}) {
  if (openMenu) openMenu.close();
  const list = h('div.menu', { role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? h('div.menu__sep') :
    h('button.menu__item' + (it.danger ? '.menu__item--danger' : '') + (it.active ? '.is-active' : ''), { type: 'button', role: 'menuitem', onclick: () => { close(); it.run && it.run(); } },
      it.icon ? icon(it.icon, 15) : null, h('span', it.label), it.hint ? h('kbd', it.hint) : null)));
  document.body.appendChild(list);
  const r = anchor.getBoundingClientRect();
  const w = list.offsetWidth, hgt = list.offsetHeight;
  let left = align === 'end' ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, innerWidth - w - 8));
  let top = r.bottom + 6;
  if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 6);
  Object.assign(list.style, { left: left + 'px', top: top + 'px' });
  const first = list.querySelector('.menu__item');
  if (first) first.focus();
  const onDoc = (e) => { if (!list.contains(e.target) && e.target !== anchor) close(); };
  const onKey = (e) => {
    const its = Array.from(list.querySelectorAll('.menu__item'));
    const i = its.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (its[i + 1] || its[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (its[i - 1] || its[its.length - 1]).focus(); }
  };
  setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
  document.addEventListener('keydown', onKey, true);
  function close() { list.remove(); document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); openMenu = null; }
  openMenu = { close };
  return openMenu;
}

// ---------- Small building blocks ----------
export const badge = (label, tone = 'grey') => h('span.badge.badge--' + tone, label);
export function avatar(name, size = 28) {
  const s = String(name || '?');
  let hash = 0; for (const c of s) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const hues = [199, 124, 355, 262, 32, 172, 220];
  return h('span.avatar', { title: s, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.4) + 'px', background: `hsl(${hues[hash % hues.length]} 55% 92%)`, color: `hsl(${hues[hash % hues.length]} 55% 30%)` } }, initials(s));
}
export function skeletonRows(n = 6, cols = 5) {
  return h('div.skel', Array.from({ length: n }, () => h('div.skel__row', Array.from({ length: cols }, (_, i) => h('span.skel__bar', { style: { width: (i === 0 ? 30 : 10 + ((i * 37) % 18)) + '%' } })))));
}
export function skeletonCards(n = 4) { return h('div.kpis', Array.from({ length: n }, () => h('div.kpi.kpi--skel', h('span.skel__bar', { style: { width: '50%' } }), h('span.skel__bar.skel__bar--lg', { style: { width: '30%' } })))); }
export function empty({ icon: ic = 'sparkle', title, text, action }) {
  return h('div.empty', h('div.empty__ic', icon(ic, 26)), h('h3', title), text ? h('p', text) : null,
    action ? h('button.btn.btn--primary', { type: 'button', onclick: action.run }, action.icon ? icon(action.icon, 15) : null, action.label) : null);
}
export function errorState(err, retry) {
  return h('div.empty.empty--error', h('div.empty__ic', icon('alert', 26)), h('h3', 'Could not load this page'), h('p', err && err.message ? err.message : String(err || 'Unknown error')),
    retry ? h('button.btn', { type: 'button', onclick: retry }, icon('refresh', 15), 'Try again') : null);
}
export function segmented(options, value, onChange, label) {
  const wrap = h('div.seg', { role: 'radiogroup', 'aria-label': label || '' });
  const render = (v) => {
    clear(wrap);
    options.forEach(o => wrap.append(h('button.seg__b' + (o.id === v ? '.is-on' : ''), {
      type: 'button', role: 'radio', 'aria-checked': String(o.id === v), title: o.title || '', onclick: () => { render(o.id); onChange(o.id); }
    }, o.icon ? icon(o.icon, 15) : null, o.label ? h('span', o.label) : null)));
  };
  render(value);
  return wrap;
}
export function selectEl(options, value, onChange, attrs = {}) {
  const s = h('select.input.input--sm', attrs, options.map(o => typeof o === 'string' ? h('option', { value: o, selected: o === value }, o) : h('option', { value: o.id, selected: String(o.id) === String(value ?? '') }, o.label)));
  if (onChange) s.addEventListener('change', () => onChange(s.value));
  return s;
}
export function field(label, control, hint) {
  return h('label.field', h('span.field__l', label), control, hint ? h('span.field__h', hint) : null);
}
export function pageHead(title, sub, actions) {
  return h('div.phead', h('div', h('h1', title), sub ? h('p', sub) : null), actions ? h('div.phead__acts', actions) : null);
}
export function kbd(...keys) { return h('span.kbds', keys.map(k => h('kbd', k))); }
