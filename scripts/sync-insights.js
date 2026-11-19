#!/usr/bin/env node
// Pulls the published Insights content (blog, case studies, events, jobs) from the live
// procyonts.com content API, cleans it and stores it in content/insights/*.json.
// Cover images are downloaded once and converted to WebP (page) and JPG (social share).
// Without sharp the run still succeeds: covers already on disk are kept, never removed.
// Gallery-format posts also carry their gallery (format, gallery, galleryAnchors) for build-insights.js.
//
// usage: node scripts/sync-insights.js [path-to-sharp]
// Read-only: uses the same public, publishable key the live site ships to every browser.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'insights');
const IMG = path.join(ROOT, 'public', 'assets', 'img', 'insights');

const API = 'https://ozuqrpwhywdmcjohkxll.supabase.co/rest/v1';
const KEY = 'sb_publishable_EC_AFs10_QT8zoh0z_jepA_xrSmVBeo';
const LIVE = 'https://procyonts.com';
let sharp = null;
try { sharp = require(process.argv[2] || 'sharp'); } catch (e) { console.warn('sharp not found: existing cover images are kept, new covers wait for a run with sharp'); }

// House style: no em or en dashes. Ranges become "to", asides become commas.
const tidy = (v) => {
  if (typeof v === 'string') {
    return v.replace(/(\d)\s*[–—]\s*(\d)/g, '$1 to $2')
      .replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-');
  }
  if (Array.isArray(v)) return v.map(tidy);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, tidy(x)]));
  return v;
};
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

// Gallery-format posts keep their media in blog_posts.content: { format: 'gallery', gallery: [...], galleryAnchors: { group: regex } }
// (older rows store the item array directly). Same reading rules as the CMS front end.
const MEDIA = /^https:\/\/(ozuqrpwhywdmcjohkxll\.supabase\.co|procyonts\.com)\//;
function galleryOf(content) {
  let items = null, anchors = null;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    if (content.format !== 'gallery') return {};
    items = Array.isArray(content.gallery) ? content.gallery : [];
    anchors = content.galleryAnchors && typeof content.galleryAnchors === 'object' ? content.galleryAnchors : null;
  } else if (Array.isArray(content) && content.some(x => x && (x.url || x.group))) items = content;
  else return {};
  const gallery = items.filter(x => x && MEDIA.test(String(x.url || ''))).map((x, i) => {
    const g = {
      id: String(x.id || 'g-' + i), url: x.url, fullUrl: MEDIA.test(String(x.fullUrl || '')) ? x.fullUrl : x.url,
      alt: String(x.alt || ''), caption: String(x.caption || ''), group: String(x.group || 'Day 1').trim() || 'Day 1',
      sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : i
    };
    if (x.isVideo) g.isVideo = true;
    if (x.poster && MEDIA.test(String(x.poster))) g.poster = x.poster;
    return g;
  });
  if (!gallery.length) return {};
  return { format: 'gallery', gallery, galleryAnchors: anchors || undefined };
}

async function get(table, query) {
  const r = await fetch(`${API}/${table}?${query}`, { headers: { apikey: KEY } });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

// The last synced files, so a run without sharp (or with a failed download) never drops a good cover.
const previous = (f) => { try { return new Map(JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')).map(x => [x.slug, x])); } catch (e) { return new Map(); } };
const PREV = { blog: previous('blog.json'), 'case-studies': previous('case-studies.json') };
const localImage = (p) => p && typeof p === 'string' && p.startsWith('/') ? fs.existsSync(path.join(ROOT, 'public', p.split('?')[0])) : true;

async function image(url, type, slug) {
  const keep = () => {
    const old = (PREV[type] && PREV[type].get(slug) || {}).image;
    return old && old.src && localImage(old.src) && localImage(old.og) ? old : null;
  };
  try { return (await convert(url, type, slug)) || keep(); } catch (e) { console.warn('image failed', slug, e.message); return keep(); }
}
async function convert(url, type, slug) {
  if (!url) return null;
  // Share images are made per page by scripts/og-images.js, so only the on-page cover is needed here.
  const web = path.join(IMG, type, slug + '.webp');
  if (fs.existsSync(web)) return { src: `/assets/img/insights/${type}/${slug}.webp` };
  if (!sharp) return null;
  const src = url.startsWith('http') ? url : LIVE + url;
  if (!/^https:\/\/(ozuqrpwhywdmcjohkxll\.supabase\.co|procyonts\.com)\//.test(src)) return null; // first-party images only
  const r = await fetch(src);
  if (!r.ok) { console.warn('image failed', src, r.status); return null; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(web), { recursive: true });
  await sharp(buf).resize(1200, 675, { fit: 'cover' }).webp({ quality: 74 }).toFile(web);
  await sharp(buf).resize(480, 270, { fit: 'cover' }).webp({ quality: 70 }).toFile(web.replace(/\.webp$/, '-480.webp')); // phones and list thumbnails
  return { src: `/assets/img/insights/${type}/${slug}.webp` };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const posts = await get('blog_posts', 'select=*&status=eq.published&order=published_at.desc');
  const blog = [];
  for (const p of posts) {
    const img = await image(p.cover_image, 'blog', p.slug);
    blog.push(tidy(Object.assign(pick(p, ['slug', 'title', 'excerpt', 'category', 'author', 'author_role', 'read_time', 'reading_minutes', 'tags',
      'published_at', 'updated_at', 'seo_title', 'seo_description', 'focus_keyword', 'faqs', 'cta_label', 'cta_url', 'body_html']), { image: img }, galleryOf(p.content))));
  }
  fs.writeFileSync(path.join(OUT, 'blog.json'), JSON.stringify(blog, null, 1));

  const cases = await get('case_studies', 'select=*&status=eq.published&order=sort_order.asc');
  const cs = [];
  for (const c of cases) {
    const img = await image(c.cover_image, 'case-studies', c.slug);
    cs.push(tidy(Object.assign(pick(c, ['slug', 'title', 'client', 'industry', 'platform', 'region', 'duration', 'excerpt', 'outcomes', 'challenge',
      'approach', 'results', 'stack', 'quote', 'is_featured', 'sort_order', 'seo_title', 'seo_description', 'published_at', 'updated_at', 'categories']), { image: img })));
  }
  fs.writeFileSync(path.join(OUT, 'case-studies.json'), JSON.stringify(cs, null, 1));

  const events = await get('events', 'select=*&is_published=eq.true&order=start_date.desc');
  fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(events.map(e => tidy(pick(e, ['slug', 'title', 'subtitle', 'date_text', 'start_date', 'end_date',
    'location', 'venue', 'event_type', 'category', 'excerpt', 'description', 'highlights', 'why_meet', 'services', 'products', 'agenda', 'stats', 'audience',
    'event_url', 'seo_title', 'seo_description', 'faqs', 'updated_at']))), null, 1));

  const jobs = await get('jobs', 'select=*&is_published=eq.true&order=created_at.desc');
  fs.writeFileSync(path.join(OUT, 'jobs.json'), JSON.stringify(jobs.map(j => tidy(pick(j, ['slug', 'title', 'department', 'location', 'employment_type',
    'experience_level', 'short_description', 'full_description', 'responsibilities', 'requirements', 'nice_to_have', 'is_open', 'created_at', 'updated_at']))), null, 1));

  // Site-wide promo bar (admin > Promo bar). Baked into every page at build time.
  try {
    const promo = (await get('site_promo', 'id=eq.1&select=*'))[0] || { enabled: false };
    fs.writeFileSync(path.join(OUT, 'promo.json'), JSON.stringify(tidy(pick(promo, ['enabled', 'message', 'cta_label', 'cta_url', 'animation', 'bg_from', 'bg_to', 'text_color', 'updated_at'])), null, 1));
  } catch (e) { console.warn('promo bar not synced:', e.message); }

  console.log(`synced ${blog.length} posts, ${cs.length} case studies, ${events.length} events, ${jobs.length} jobs`);
})().catch(e => { console.error(e); process.exit(1); });
