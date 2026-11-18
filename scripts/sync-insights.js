#!/usr/bin/env node
// Pulls the published Insights content (blog, case studies, events, jobs) from the live
// procyonts.com content API, cleans it and stores it in content/insights/*.json.
// Cover images are downloaded once and converted to WebP (page) and JPG (social share).
//
// usage: node scripts/sync-insights.js [path-to-sharp]
// Read-only: uses the same public, publishable key the live site ships to every browser.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'content', 'insights');
const IMG = path.join(ROOT, 'public', 'assets', 'img', 'insights');
const OG = path.join(ROOT, 'public', 'assets', 'img', 'og', 'insights');
const API = 'https://ozuqrpwhywdmcjohkxll.supabase.co/rest/v1';
const KEY = 'sb_publishable_EC_AFs10_QT8zoh0z_jepA_xrSmVBeo';
const LIVE = 'https://procyonts.com';
let sharp = null;
try { sharp = require(process.argv[2] || 'sharp'); } catch (e) { console.warn('sharp not found: images will be skipped'); }

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

async function get(table, query) {
  const r = await fetch(`${API}/${table}?${query}`, { headers: { apikey: KEY } });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

async function image(url, type, slug) {
  if (!sharp || !url) return null;
  const src = url.startsWith('http') ? url : LIVE + url;
  if (!/^https:\/\/(ozuqrpwhywdmcjohkxll\.supabase\.co|procyonts\.com)\//.test(src)) return null; // first-party images only
  const web = path.join(IMG, type, slug + '.webp');
  const og = path.join(OG, slug + '.jpg');
  if (fs.existsSync(web) && fs.existsSync(og)) return { src: `/assets/img/insights/${type}/${slug}.webp`, og: `/assets/img/og/insights/${slug}.jpg` };
  const r = await fetch(src);
  if (!r.ok) { console.warn('image failed', src, r.status); return null; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(web), { recursive: true });
  fs.mkdirSync(OG, { recursive: true });
  await sharp(buf).resize(1200, 675, { fit: 'cover' }).webp({ quality: 74 }).toFile(web);
  await sharp(buf).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(og);
  return { src: `/assets/img/insights/${type}/${slug}.webp`, og: `/assets/img/og/insights/${slug}.jpg` };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const posts = await get('blog_posts', 'select=*&status=eq.published&order=published_at.desc');
  const blog = [];
  for (const p of posts) {
    const img = await image(p.cover_image, 'blog', p.slug);
    blog.push(tidy(Object.assign(pick(p, ['slug', 'title', 'excerpt', 'category', 'author', 'author_role', 'read_time', 'reading_minutes', 'tags',
      'published_at', 'updated_at', 'seo_title', 'seo_description', 'focus_keyword', 'faqs', 'cta_label', 'cta_url', 'body_html']), { image: img })));
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

  console.log(`synced ${blog.length} posts, ${cs.length} case studies, ${events.length} events, ${jobs.length} jobs`);
})().catch(e => { console.error(e); process.exit(1); });
