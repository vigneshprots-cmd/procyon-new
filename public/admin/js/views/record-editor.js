// Editors for case studies, events and job posts, built from field schemas.
// Saves only the columns that changed, so fields this console does not edit are never overwritten.
import { h, icon, clear, clone, same, debounce, store, ago, fmtDateTime } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, confirmDialog, badge, errorState, skeletonRows } from '../core/ui.js';
import { buildForm, autoSlug } from '../core/form.js';

const TZ = ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto', 'Europe/London', 'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney', 'UTC'];
const seo = [
  { path: 'seo_title', label: 'SEO title', counter: [0, 60], hint: '60 characters or fewer. Leave blank to use the title.' },
  { path: 'seo_description', label: 'Meta description', type: 'textarea', rows: 3, counter: [110, 160], hint: '110 to 160 characters.' }
];

const SCHEMAS = {
  'case-studies': {
    table: 'case_studies', noun: 'case study', base: '/admin/case-studies', live: (m) => '/case-studies/' + m.slug,
    blank: { slug: '', title: '', client: '', industry: '', platform: '', region: '', duration: '', excerpt: '', cover_image: '', categories: [], outcomes: [], challenge: [], approach: [], results: [], stack: [], quote: { text: '', author: '', role: '' }, status: 'draft', is_featured: false, sort_order: 0, seo_title: '', seo_description: '' },
    isLive: (m) => m.status === 'published',
    publish: (m, on) => { m.status = on ? 'published' : 'draft'; if (on && !m.published_at) m.published_at = new Date().toISOString(); },
    nullable: ['client', 'industry', 'platform', 'region', 'duration', 'excerpt', 'cover_image', 'seo_title', 'seo_description'],
    createdBy: true,
    main: [
      { title: 'Story', fields: [
        { path: 'title', label: 'Title', required: true, placeholder: 'Modernizing partner onboarding for Genesys' },
        { path: 'slug', label: 'URL slug', type: 'slug', required: true, hint: 'procyonts.com/case-studies/…' },
        { path: 'excerpt', label: 'Summary', type: 'textarea', rows: 3, counter: [0, 220] },
        { path: 'challenge', label: 'The situation', type: 'list', placeholder: 'One problem per line', addLabel: 'Add a problem' },
        { path: 'approach', label: 'How the program was run', type: 'repeater', itemLabel: 'Workstream', cols: 1, fields: [{ path: 'title', label: 'Workstream' }, { path: 'detail', label: 'What was done', type: 'textarea', rows: 2 }] },
        { path: 'results', label: 'The result', type: 'list', addLabel: 'Add a result' }
      ] },
      { title: 'Outcomes and quote', fields: [
        { path: 'outcomes', label: 'Headline numbers', type: 'repeater', itemLabel: 'Outcome', cols: 2, fields: [{ path: 'value', label: 'Value', placeholder: '50%' }, { path: 'label', label: 'Label', placeholder: 'Faster onboarding' }] },
        { type: 'group', path: 'quote', label: 'Client quote', cols: 2, fields: [{ path: 'text', label: 'Quote', type: 'textarea', rows: 3, wide: true }, { path: 'author', label: 'Name' }, { path: 'role', label: 'Role' }] }
      ] }
    ],
    side: [
      { title: 'Publishing', fields: [
        { path: 'status', label: 'Status', type: 'select', options: [{ id: 'draft', label: 'Draft' }, { id: 'published', label: 'Published' }] },
        { path: 'is_featured', label: 'Featured', type: 'checkbox', hint: 'Highlighted on listing pages' },
        { path: 'sort_order', label: 'Sort order', type: 'number', hint: 'Lower numbers show first' }
      ] },
      { title: 'Program facts', fields: [
        { path: 'client', label: 'Client' }, { path: 'industry', label: 'Industry' }, { path: 'platform', label: 'Platform' },
        { path: 'region', label: 'Region' }, { path: 'duration', label: 'Duration' },
        { path: 'stack', label: 'Stack', type: 'tags', placeholder: 'Sales Cloud, MuleSoft' },
        { path: 'categories', label: 'Categories', type: 'tags' }
      ] },
      { title: 'Cover image', fields: [{ path: 'cover_image', label: 'Cover image', type: 'image', folder: 'covers', hint: '1200 × 675 works best.' }] },
      { title: 'Search', fields: seo }
    ]
  },
  events: {
    table: 'events', noun: 'event', base: '/admin/events', live: (m) => '/insights/events/' + m.slug,
    blank: { slug: '', title: '', subtitle: '', date_text: '', start_date: '', end_date: '', location: '', venue: '', event_type: 'Conference', category: 'Salesforce', status: 'Upcoming', excerpt: '', description: '', logo_url: '', hero_image_url: '', brand_color: '#0176D3', audience: '', meeting_url: '/contact', meeting_cta_label: 'Book a Meeting', event_url: '', seo_title: '', seo_description: '', is_published: true, is_featured: false, display_order: 0, event_timezone: 'America/Los_Angeles', highlights: [], why_meet: [], services: [], products: [], agenda: [], stats: [], faqs: [], meeting_slots: { booth_card: { enabled: true, badge: "WE'RE ATTENDING AS VISITORS", title: 'Not Exhibiting', description: 'We are not running a booth. Our senior practitioners are visiting to listen, whiteboard, and solve your real platform blockers. Book a dedicated slot to consult with us.', cta_label: 'Book a Slot', cta_url: '', icon: 'shield' } } },
    isLive: (m) => !!m.is_published,
    publish: (m, on) => { m.is_published = on; },
    nullable: ['start_date', 'end_date', 'logo_url', 'hero_image_url', 'venue', 'event_url', 'seo_title', 'seo_description'],
    stamp: true,
    main: [
      { title: 'Event', fields: [
        { path: 'title', label: 'Event name', required: true, placeholder: 'Dreamforce 2026' },
        { path: 'slug', label: 'URL slug', type: 'slug', required: true, hint: 'procyonts.com/insights/events/…' },
        { path: 'subtitle', label: 'Subtitle', placeholder: 'Private 1:1 Salesforce strategy sessions' },
        { path: 'excerpt', label: 'Summary', type: 'textarea', rows: 3 },
        { path: 'description', label: 'Description', type: 'textarea', rows: 5 },
        { path: 'audience', label: 'Who meets', placeholder: 'CIOs, platform owners…' }
      ] },
      { title: 'When and where', cols: 2, fields: [
        { path: 'date_text', label: 'Dates as shown', placeholder: 'Sept 15 to 17, 2026' }, { path: 'event_timezone', label: 'Time zone', type: 'select', options: TZ },
        { path: 'start_date', label: 'Start date', type: 'date' }, { path: 'end_date', label: 'End date', type: 'date' },
        { path: 'location', label: 'City' }, { path: 'venue', label: 'Venue' }
      ] },
      { title: 'Page sections', fields: [
        { path: 'highlights', label: 'What a 1:1 covers', type: 'list' },
        { path: 'why_meet', label: 'Worth a meeting if', type: 'list' },
        { path: 'stats', label: 'Event in numbers', type: 'repeater', itemLabel: 'Stat', cols: 2, fields: [{ path: 'value', label: 'Value' }, { path: 'label', label: 'Label' }] },
        { path: 'services', label: 'Practices in the room', type: 'repeater', itemLabel: 'Practice', cols: 2, fields: [{ path: 'name', label: 'Name' }, { path: 'href', label: 'Link', type: 'url', placeholder: '/enterprise/salesforce' }, { path: 'description', label: 'Description', wide: true }] },
        { path: 'products', label: 'Products', type: 'repeater', itemLabel: 'Product', cols: 2, fields: [{ path: 'name', label: 'Name' }, { path: 'description', label: 'Description' }] },
        { path: 'agenda', label: 'Agenda', type: 'repeater', itemLabel: 'Day', cols: 1, fields: [{ path: 'day', label: 'Day', placeholder: 'Day 1, Sept 15' }, { path: 'items', label: 'Items', type: 'lines', asArray: true, rows: 3 }] },
        { path: 'faqs', label: 'FAQs', type: 'repeater', itemLabel: 'Question', cols: 1, fields: [{ path: 'q', label: 'Question' }, { path: 'a', label: 'Answer', type: 'textarea', rows: 2 }] }
      ] },
      { title: 'Meeting card', fields: [
        { type: 'group', path: 'meeting_slots.booth_card', label: 'Booth or visitor card', hint: 'Shown beside the booking form on the old site.', cols: 2, fields: [
          { path: 'enabled', label: 'Show the card', type: 'checkbox' }, { path: 'icon', label: 'Icon', type: 'select', options: ['shield', 'booth', 'briefcase', 'users', 'coffee'] },
          { path: 'badge', label: 'Badge' }, { path: 'title', label: 'Title' }, { path: 'description', label: 'Description', type: 'textarea', rows: 2, wide: true },
          { path: 'cta_label', label: 'Button label' }, { path: 'cta_url', label: 'Button link', type: 'url' }] }
      ] }
    ],
    side: [
      { title: 'Publishing', fields: [
        { path: 'is_published', label: 'Published', type: 'checkbox', hint: 'Visible on the events page' },
        { path: 'is_featured', label: 'Promoted', type: 'checkbox', hint: 'Drives the event promo on the old site' },
        { path: 'display_order', label: 'Display order', type: 'number' },
        { path: 'status', label: 'Stage', type: 'select', options: ['Upcoming', 'Live', 'Past'] }
      ] },
      { title: 'Details', fields: [
        { path: 'event_type', label: 'Type', type: 'select', options: ['Conference', 'Summit', 'Expo', 'Roadshow', 'Webinar', 'Meetup', 'Workshop'] },
        { path: 'category', label: 'Category', datalist: ['Salesforce', 'ServiceNow', 'Supplier Diversity', 'AI & Data', 'Cloud', 'Industry'] },
        { path: 'brand_color', label: 'Brand colour', type: 'color' },
        { path: 'event_url', label: 'Official event site', type: 'url' },
        { path: 'meeting_cta_label', label: 'Booking button label' }, { path: 'meeting_url', label: 'Booking link', type: 'url' }
      ] },
      { title: 'Images', fields: [{ path: 'logo_url', label: 'Logo', type: 'image', folder: 'events' }, { path: 'hero_image_url', label: 'Hero image', type: 'image', folder: 'events' }] },
      { title: 'Search', fields: seo }
    ]
  },
  careers: {
    table: 'jobs', noun: 'job post', base: '/admin/careers', live: (m) => '/careers/' + m.slug,
    blank: { slug: '', title: '', department: '', location: '', employment_type: 'Full-time', experience_level: '', short_description: '', full_description: '', responsibilities: '', requirements: '', nice_to_have: '', is_published: true, is_open: true, display_order: 0 },
    isLive: (m) => !!m.is_published,
    publish: (m, on) => { m.is_published = on; },
    nullable: ['department', 'location', 'employment_type', 'experience_level', 'short_description', 'full_description', 'responsibilities', 'requirements', 'nice_to_have'],
    createdBy: true,
    main: [
      { title: 'Role', fields: [
        { path: 'title', label: 'Job title', required: true, placeholder: 'Salesforce Technical Architect' },
        { path: 'slug', label: 'URL slug', type: 'slug', required: true, hint: 'procyonts.com/careers/…' },
        { path: 'short_description', label: 'Short description', type: 'textarea', rows: 2, counter: [0, 200], hint: 'Shown on the careers list and in search results.' },
        { path: 'full_description', label: 'About the role', type: 'textarea', rows: 6 }
      ] },
      { title: 'Details', fields: [
        { path: 'responsibilities', label: 'What the work involves', type: 'lines', rows: 6, hint: 'One item per line.' },
        { path: 'requirements', label: 'What the role needs', type: 'lines', rows: 6, hint: 'One item per line.' },
        { path: 'nice_to_have', label: 'Good to have', type: 'lines', rows: 4, hint: 'One item per line.' }
      ] }
    ],
    side: [
      { title: 'Publishing', fields: [
        { path: 'is_published', label: 'Published', type: 'checkbox', hint: 'Listed on the careers page' },
        { path: 'is_open', label: 'Taking applications', type: 'checkbox', hint: 'Closed roles stay visible, marked closed' },
        { path: 'display_order', label: 'Display order', type: 'number' }
      ] },
      { title: 'Facts', fields: [
        { path: 'department', label: 'Department', datalist: ['SALESFORCE', 'SERVICENOW', 'AI & DATA', 'ENGINEERING', 'DELIVERY', 'SALES', 'MARKETING', 'OPERATIONS'] },
        { path: 'location', label: 'Location', datalist: ['Chennai', 'Chennai (Hybrid)', 'Novato, California', 'Toronto, Canada', 'Remote'] },
        { path: 'employment_type', label: 'Employment type', type: 'select', options: ['Full-time', 'Part-time', 'Contract', 'Internship'] },
        { path: 'experience_level', label: 'Experience', placeholder: '5+ Years' }
      ] }
    ]
  }
};

export async function render(main, { type, id }) {
  const S = SCHEMAS[type];
  const isNew = id === 'new';
  document.title = `${isNew ? 'New ' + S.noun : 'Edit ' + S.noun} | Procyon Admin`;
  main.append(skeletonRows(6, 2));
  let original = null, model;
  try {
    if (isNew) model = clone(S.blank);
    else {
      original = await db.get(S.table, id);
      if (!original) { clear(main).append(errorState(new Error(`This ${S.noun} was not found, or this account cannot see it.`))); return; }
      model = Object.assign(clone(S.blank), clone(original));
      for (const [k, v] of Object.entries(S.blank)) if (model[k] == null) model[k] = clone(v);
    }
  } catch (e) { clear(main).append(errorState(e, () => ctx.go(location.pathname))); return; }
  const baseline = clone(model);
  const draftKey = `draft:${type}:${id}`;
  let dirty = false;

  const statusBadge = h('span');
  const savedAt = h('span.muted.small');
  const paintStatus = () => { clear(statusBadge).append(S.isLive(model) ? badge('Published', 'green') : badge('Draft', 'amber'), dirty ? badge('Unsaved', 'grey') : null); };
  const saveDraft = debounce(() => store.set(draftKey, { at: Date.now(), model }), 600);
  const onChange = () => { dirty = !same(model, baseline); paintStatus(); saveDraft(); };

  const cards = (groups) => groups.map(g => {
    const form = buildForm(g.fields, model, onChange);
    forms.push(form);
    return h('section.card.ecard', h('h2.ecard__t', g.title), h('div' + (g.cols ? '.fgrid.cols-' + g.cols : ''), form.el));
  });
  const forms = [];
  const mainCol = h('div.editor__main', cards(S.main));
  const sideCol = h('div.editor__side', cards(S.side));

  const saveBtn = h('button.btn.btn--primary', { type: 'button', onclick: () => save() }, icon('save', 15), 'Save');
  const pubBtn = h('button.btn', { type: 'button', onclick: () => save(!S.isLive(model)) });
  const paintPub = () => { clear(pubBtn).append(icon(S.isLive(model) ? 'eye' : 'rocket', 15), S.isLive(model) ? 'Unpublish' : 'Save and publish'); };
  const liveLink = !isNew && S.isLive(original || {}) ? h('a.btn.btn--ghost', { href: S.live(model), target: '_blank', rel: 'noopener' }, icon('external', 15), h('span.hide-sm', 'View live')) : null;
  const head = h('div.ebar',
    h('a.ebar__back', { href: S.base, 'aria-label': 'Back to the list' }, icon('chevronLeft', 18)),
    h('div.ebar__t', h('h1', isNew ? 'New ' + S.noun : (model.title || 'Untitled')), h('div.ebar__meta', statusBadge, savedAt)),
    h('div.ebar__acts', liveLink, pubBtn, saveBtn));
  clear(main).append(head, h('div.editor', mainCol, sideCol));
  forms.forEach(f => autoSlug(f.el, model));
  if (!isNew && original.updated_at) savedAt.textContent = 'Last saved ' + ago(original.updated_at);
  paintStatus(); paintPub();

  // Offer to restore an unsaved local draft.
  const draft = store.get(draftKey);
  if (draft && draft.model && !same(draft.model, model) && (!original || !original.updated_at || draft.at > new Date(original.updated_at).getTime())) {
    const bar = h('div.restore', icon('info', 15), h('span', `Unsaved changes from ${fmtDateTime(draft.at)} were kept in this browser.`),
      h('button.btn.btn--sm.btn--primary', { type: 'button', onclick: () => { restoreNow(); } }, 'Restore'),
      h('button.btn.btn--sm.btn--ghost', { type: 'button', onclick: () => { store.del(draftKey); bar.remove(); } }, 'Discard'));
    head.after(bar);
  }
  function restoreNow() {
    Object.keys(model).forEach(k => delete model[k]);
    Object.assign(model, clone(draft.model));
    clear(mainCol).append(...rebuild(S.main)); clear(sideCol).append(...rebuild(S.side));
    forms.forEach(f => autoSlug(f.el, model));
    onChange(); paintPub();
    document.querySelector('.restore') && document.querySelector('.restore').remove();
    toast.success('Draft restored', { detail: 'Review it, then save to update the CMS.' });
  }
  function rebuild(groups) { forms.length = 0; return cards(groups); }

  async function save(publish) {
    for (const f of forms) { const err = f.validate(); if (err) { toast.error('Check the form', { detail: err }); return; } }
    if (publish !== undefined) S.publish(model, publish);
    const out = clone(model);
    (S.nullable || []).forEach(k => { if (out[k] === '' || out[k] === undefined) out[k] = null; });
    if (S.stamp) out.updated_at = new Date().toISOString();
    const btns = [saveBtn, pubBtn]; btns.forEach(b => { b.disabled = true; }); saveBtn.classList.add('is-busy');
    try {
      if (isNew) {
        if (S.createdBy) out.created_by = ctx.user.id;
        const row = await db.insert(S.table, out);
        store.del(draftKey); dirty = false; ctx.view.dirty = null;
        toast.success(`${cap(S.noun)} created`);
        if (S.isLive(out)) ctx.publishHint();
        ctx.go(`${S.base}/${row.id}`);
        return;
      }
      const patch = {};
      for (const k of Object.keys(out)) if (k !== 'id' && k !== 'created_at' && !same(norm(out[k]), norm(original[k]))) patch[k] = out[k];
      if (!Object.keys(patch).length || (Object.keys(patch).length === 1 && patch.updated_at)) { toast('No changes to save'); return; }
      const saved = await db.update(S.table, id, patch);
      original = saved; Object.assign(baseline, clone(model));
      store.del(draftKey); dirty = false;
      savedAt.textContent = 'Saved just now';
      head.querySelector('h1').textContent = model.title || 'Untitled';
      toast.success('Saved');
      if (S.isLive(model) || 'status' in patch || 'is_published' in patch) ctx.publishHint();
    } catch (e) {
      toast.error('Save failed', { detail: /duplicate key|unique/i.test(e.message) ? 'That URL slug is already used. Choose another.' : e.message });
    } finally { btns.forEach(b => { b.disabled = false; }); saveBtn.classList.remove('is-busy'); paintStatus(); paintPub(); }
  }
  ctx.view.dirty = () => dirty;
  ctx.view.keys = { save: () => save() };
}
// '' and [] count as unchanged when the column was null, so untouched fields are never rewritten.
const norm = (v) => (v === '' || v === undefined || (Array.isArray(v) && !v.length) ? null : v);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export { SCHEMAS };
