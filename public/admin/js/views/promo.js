// Site-wide promo bar (site_promo, single row id = 1) with a live preview.
import { h, icon, clear, clone, same, ago } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, errorState, skeletonRows, pageHead, segmented, badge } from '../core/ui.js';
import { buildForm } from '../core/form.js';

const DEFAULT = { id: 1, enabled: false, event_slug: '', message: '', cta_label: 'Book a Meeting', cta_url: '', animation: 'marquee', bg_from: '#0F1E3A', bg_to: '#C8102E', text_color: '#FFFFFF' };

export async function render(main) {
  document.title = 'Promo bar | Procyon Admin';
  main.append(skeletonRows(4, 2));
  let row, events;
  try {
    [row, events] = await Promise.all([db.get('site_promo', 1), db.list('events', { select: 'id, slug, title, date_text, brand_color', filters: [['eq', 'is_published', true]], order: [['display_order', true]] })]);
  } catch (e) { clear(main).append(errorState(e, () => ctx.go('/admin/promo-bar'))); return; }
  const original = row ? clone(row) : null;
  const m = Object.assign(clone(DEFAULT), row || {});
  let dirty = false;
  const preview = h('div.promo');
  const state = h('span');
  const paint = () => {
    const bar = h('div.promo__bar' + (m.animation === 'pulse' ? '.is-pulse' : ''), { style: { background: `linear-gradient(135deg, ${m.bg_from}, ${m.bg_to})`, color: m.text_color } },
      h('div.promo__msg' + (m.animation === 'marquee' ? '.is-marquee' : ''), h('span', m.message || 'Your message appears here')),
      m.cta_label ? h('span.promo__cta', { style: { borderColor: m.text_color, color: m.text_color } }, m.cta_label, ' →') : null);
    clear(preview).append(h('div.promo__chrome', h('i'), h('i'), h('i'), h('span', 'procyonts.com')), m.enabled ? bar : h('div.promo__off', 'The bar is switched off. Visitors see the normal header.'), h('div.promo__page'));
    clear(state).append(m.enabled ? badge('Live on the old site', 'green') : badge('Off', 'grey'), dirty ? badge('Unsaved', 'grey') : null);
  };
  const changed = () => { dirty = !same(m, Object.assign(clone(DEFAULT), original || {})); paint(); };
  const eventSel = h('select.input', h('option', { value: '' }, 'No event (custom message)'), events.map(e => h('option', { value: e.slug, selected: e.slug === m.event_slug }, e.title + (e.date_text ? ` · ${e.date_text}` : ''))));
  eventSel.addEventListener('change', () => {
    const e = events.find(x => x.slug === eventSel.value);
    m.event_slug = eventSel.value;
    if (e) {
      // Same defaults the existing CMS fills in.
      m.message = `Meet Procyon at ${e.title} | ${e.date_text || ''}`.trim();
      m.cta_url = `/insights/events/${e.slug}`;
      m.bg_to = e.brand_color || '#C8102E';
      formBox.replaceChildren(buildForm(FIELDS, m, changed).el);
    }
    changed();
  });
  const FIELDS = [
    { path: 'enabled', label: 'Show the promo bar', type: 'checkbox', hint: 'Appears above the header on every page of the old site' },
    { path: 'message', label: 'Message', counter: [0, 90], placeholder: 'Meet Procyon at Dreamforce 2026 | Sept 15 to 17' },
    { type: 'group', path: '', label: 'Button', cols: 2, fields: [{ path: 'cta_label', label: 'Label' }, { path: 'cta_url', label: 'Link', type: 'url', placeholder: '/insights/events/…' }] },
    { type: 'group', path: '', label: 'Colours', cols: 3, fields: [{ path: 'bg_from', label: 'Gradient start', type: 'color' }, { path: 'bg_to', label: 'Gradient end', type: 'color' }, { path: 'text_color', label: 'Text', type: 'color' }] }
  ];
  const formBox = h('div', buildForm(FIELDS, m, changed).el);
  const anim = segmented([{ id: 'marquee', label: 'Scrolling' }, { id: 'pulse', label: 'Pulse' }, { id: 'none', label: 'Static' }], m.animation || 'marquee', (v) => { m.animation = v; changed(); }, 'Animation');
  const save = async () => {
    try {
      const out = Object.assign({}, m, { id: 1, updated_at: new Date().toISOString() });
      await db.upsert('site_promo', out, 'id');
      Object.assign(original || {}, out); dirty = false; paint();
      toast.success('Promo bar saved', { detail: 'The old site updates instantly. The new site does not show a promo bar yet.' });
    } catch (e) { toast.error('Save failed', { detail: e.message }); }
  };
  clear(main).append(
    pageHead('Promo bar', 'The announcement strip at the top of procyonts.com (the current site reads it live).', [state, h('button.btn.btn--primary', { type: 'button', onclick: save }, icon('save', 15), 'Save')]),
    h('div.editor', h('div.editor__main', h('section.card.ecard', h('h2.ecard__t', 'Preview'), preview),
      h('section.card.ecard', h('h2.ecard__t', 'Content'), h('label.field', h('span.field__l', 'Event'), eventSel, h('span.field__h', 'Picking an event fills in the message, link and colour.')), formBox, h('div.field', h('span.field__l', 'Animation'), anim)),
      row && row.updated_at ? h('p.muted.small', 'Last saved ' + ago(row.updated_at)) : null)));
  paint();
  ctx.view.dirty = () => dirty;
  ctx.view.keys = { save };
}
