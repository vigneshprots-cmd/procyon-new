// Author bylines (authors table): name, slug, role, bio, headshot and links.
import { h, icon, clear, clone, slugify, plural } from '../core/dom.js';
import { db } from '../core/data.js';
import { ctx } from '../core/ctx.js';
import { toast, modal, confirmDialog, avatar, skeletonRows, empty, errorState, pageHead } from '../core/ui.js';
import { buildForm, autoSlug } from '../core/form.js';

const FIELDS = [
  { path: 'name', label: 'Name', required: true },
  { path: 'slug', label: 'Slug', type: 'slug', required: true, hint: 'Used for /authors/… on the old site.' },
  { path: 'role', label: 'Title or role', placeholder: 'Practice Lead, AI' },
  { path: 'bio', label: 'Bio', type: 'textarea', rows: 4 },
  { path: 'headshot', label: 'Headshot', type: 'image', folder: 'authors' },
  { path: 'email', label: 'Email', type: 'email' },
  { path: 'linkedin_url', label: 'LinkedIn', type: 'url' },
  { path: 'twitter_url', label: 'X / Twitter', type: 'url' },
  { path: 'website_url', label: 'Website', type: 'url' }
];

export async function render(main) {
  document.title = 'Authors | Procyon Admin';
  const list = h('div');
  const add = () => edit({ slug: '', name: '', role: '', bio: '', headshot: '', email: '', linkedin_url: '', twitter_url: '', website_url: '' });
  main.append(pageHead('Authors', 'Bylines for blog posts. Pick an author in the post editor to fill the name and role.', [h('button.btn.btn--primary', { type: 'button', onclick: add }, icon('plus', 15), 'New author')]), list);
  ctx.view.onNew = add;
  let rows = [], counts = {};
  async function load() {
    clear(list).append(skeletonRows(4, 3));
    try {
      const [a, posts] = await Promise.all([db.list('authors', { order: [['name', true]] }), db.list('blog_posts', { select: 'author' }).catch(() => [])]);
      rows = a; counts = {};
      posts.forEach(p => { if (p.author) counts[p.author] = (counts[p.author] || 0) + 1; });
      paint();
    } catch (e) { clear(list).append(errorState(e, load)); }
  }
  function paint() {
    clear(list);
    if (!rows.length) return list.append(empty({ icon: 'authors', title: 'No authors yet', text: 'Add the people who write for the blog.', action: { label: 'New author', icon: 'plus', run: add } }));
    list.append(h('div.cards', rows.map(a => h('button.pcard', { type: 'button', onclick: () => edit(a) },
      a.headshot ? h('img.pcard__img', { src: a.headshot, alt: '' }) : avatar(a.name, 48),
      h('div.pcard__t', h('b', a.name), h('span', a.role || '—'), h('small.muted', plural(counts[a.name] || 0, 'post'))),
      icon('chevronRight', 16)))));
  }
  function edit(a) {
    const m = clone(a);
    const form = buildForm(FIELDS, m);
    if (!a.id) autoSlug(form.el, m, 'name', 'slug');
    modal({
      title: a.id ? `Edit ${a.name}` : 'New author', body: form.el, wide: true,
      actions: [
        a.id ? { label: 'Delete', danger: true, run: async () => {
          if (!(await confirmDialog({ title: `Delete ${a.name}?`, message: counts[a.name] ? `${plural(counts[a.name], 'post')} use this byline. The posts keep the name as text.` : 'This byline is not used by any post.', confirm: 'Delete', danger: true }))) return false;
          try { await db.remove('authors', [['eq', 'id', a.id]]); toast.success('Author deleted'); load(); } catch (e) { toast.error('Delete failed', { detail: e.message }); return false; }
        } } : null,
        { label: 'Cancel' },
        { label: 'Save', primary: true, run: async () => {
          const err = form.validate(); if (err) { toast.error(err); return false; }
          m.slug = slugify(m.slug || m.name);
          try {
            if (a.id) { const patch = {}; for (const k of Object.keys(m)) if (k !== 'id' && m[k] !== a[k]) patch[k] = m[k]; if (Object.keys(patch).length) await db.update('authors', a.id, patch); }
            else { const row = Object.assign({}, m); delete row.id; await db.insert('authors', row); }
            toast.success('Author saved'); load();
          } catch (e) { toast.error('Save failed', { detail: e.message }); return false; }
        } }
      ].filter(Boolean)
    });
  }
  load();
}
