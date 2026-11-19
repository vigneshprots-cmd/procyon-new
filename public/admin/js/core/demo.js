// Demo mode: an in-memory copy of the CMS schema with realistic sample rows.
// Open /admin?demo=admin (or sales, hr). Nothing is sent to Supabase; reload resets the data.
import { LEAD_CATEGORIES } from './constants.js';

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const uuid = () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(rnd() * 16).toString(16));
const ago = (days, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString();
const later = (days) => new Date(Date.now() + days * 864e5).toISOString();

function build(role) {
  const staff = [
    { id: 'u-admin', email: 'maya.admin@procyonts.com', display_name: 'Maya Raman', role: 'admin' },
    { id: 'u-sales1', email: 'arjun.k@procyonts.com', display_name: 'Arjun Kumar', role: 'sales' },
    { id: 'u-sales2', email: 'lena.ortiz@procyonts.com', display_name: 'Lena Ortiz', role: 'sales' },
    { id: 'u-hr', email: 'priya.hr@procyonts.com', display_name: 'Priya Natarajan', role: 'hr' },
    { id: 'u-admin2', email: 'vignesh@procyonts.com', display_name: 'Vignesh', role: 'admin' }
  ];
  const profiles = staff.map((s, i) => ({ id: s.id, email: s.email, display_name: s.display_name, created_at: ago(200 - i * 30) }));
  const user_roles = staff.map(s => ({ id: uuid(), user_id: s.id, role: s.role }));
  const admin_allowlist = staff.map((s, i) => ({ email: s.email, role: s.role, added_at: ago(200 - i * 30), invited_at: ago(200 - i * 30), accepted_at: ago(199 - i * 30) }))
    .concat([{ email: 'new.recruiter@procyonts.com', role: 'hr', added_at: ago(2), invited_at: ago(2), accepted_at: null }]);
  const sales_categories = [
    ['u-sales1', 'Salesforce'], ['u-sales1', 'AI & Machine Learning'], ['u-sales2', 'ServiceNow'], ['u-sales2', 'Cloud and Data'], ['u-sales2', 'Data Strategy & Analytics']
  ].map(([user_id, category]) => ({ id: uuid(), user_id, category }));

  const first = ['Olivia', 'Liam', 'Ava', 'Noah', 'Sophia', 'Ethan', 'Mia', 'Lucas', 'Isabella', 'Mason', 'Aarav', 'Diya', 'Rohan', 'Ananya', 'Chen', 'Hana', 'Marco', 'Elena', 'Kofi', 'Amara'];
  const last = ['Patel', 'Nguyen', 'Garcia', 'Smith', 'Okafor', 'Iyer', 'Rossi', 'Kim', 'Muller', 'Haddad', 'Silva', 'Brown', 'Reddy', 'Johnson'];
  const companies = ['Northwind Health', 'Contoso Manufacturing', 'Bluefin Logistics', 'Apex Retail Group', 'Helios Energy', 'Summit Credit Union', 'Vertex Biotech', 'Atlas Insurance', 'Pioneer Foods', 'Cobalt Telecom', 'Meridian County', 'Harbor University'];
  const requirements = ['Salesforce Implementation', 'Agentforce', 'ServiceNow ITSM', 'Data Cloud', 'Cloud Migration', 'Staff Augmentation', 'MuleSoft Integration', 'AI Strategy', 'Managed Services', 'Government Solutions'];
  const catFor = { 'Salesforce Implementation': 'Salesforce', Agentforce: 'AI & Machine Learning', 'ServiceNow ITSM': 'ServiceNow', 'Data Cloud': 'Data Strategy & Analytics', 'Cloud Migration': 'Cloud and Data', 'Staff Augmentation': 'Staff Augmentation', 'MuleSoft Integration': 'Salesforce', 'AI Strategy': 'AI & Machine Learning', 'Managed Services': 'Others', 'Government Solutions': 'Government Solutions' };
  const sources = ['contact_form', 'audit_form', 'event_booking', 'chatbot', 'popup', 'contact_form', 'audit_form'];
  const pages = ['/contact', '/salesforce/agentforce', '/servicenow', '/blog/agentforce-implementation-guide', '/insights/events/dreamforce-2026', '/ai-data'];
  const utms = ['', '', '?utm_source=linkedin&utm_medium=paid&utm_campaign=agentforce_q4', '?utm_source=google&utm_medium=cpc&utm_campaign=servicenow_itsm', '?utm_source=newsletter&utm_medium=email&utm_campaign=nov_digest'];
  const statuses = ['new', 'new', 'new', 'contacted', 'contacted', 'qualified', 'qualified', 'won', 'lost', 'ignored'];
  const leads = [], lead_activities = [];
  for (let i = 0; i < 64; i++) {
    const f = pick(first), l = pick(last), co = pick(companies), req = pick(requirements);
    const created = ago(Math.floor(rnd() * 88), Math.floor(rnd() * 20));
    const status = i < 6 ? 'new' : pick(statuses);
    const category = catFor[req];
    const reps = sales_categories.filter(s => s.category === category).map(s => s.user_id);
    const owner = status === 'new' && rnd() < 0.35 ? null : (reps.length ? pick(reps) : (rnd() < 0.5 ? null : 'u-admin'));
    const follow = OPENS(status) && rnd() < 0.6 ? (rnd() < 0.4 ? ago(Math.floor(rnd() * 6) + 1) : later(Math.floor(rnd() * 10) + 1)) : null;
    const id = uuid();
    const lead = {
      id, first_name: f, last_name: l, email: `${f}.${l}@${co.toLowerCase().replace(/[^a-z]+/g, '')}.com`.toLowerCase(),
      phone: rnd() < 0.7 ? `+1 415 555 ${String(1000 + Math.floor(rnd() * 8999))}` : null, company: co, requirement: req, category,
      message: pick(['We are evaluating partners for a Q1 rollout and need a scoped estimate.', 'Our current org has grown messy. Looking for a health check and a roadmap.', 'Need two senior developers for six months, starting next month.', 'Interested in an Agentforce pilot for our service team.', 'Can we meet at Dreamforce to discuss our ServiceNow upgrade?', '']),
      source: pick(sources), page_url: 'https://procyonts.com' + pick(pages) + pick(utms), status, owner_id: owner, follow_up_at: follow,
      created_at: created, updated_at: created, last_activity_at: null
    };
    leads.push(lead);
    const n = Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const t = pick(['note', 'call', 'email', 'meeting']);
      const when = new Date(new Date(created).getTime() + (k + 1) * 36e5 * 20).toISOString();
      if (new Date(when) > new Date()) break;
      lead_activities.push({ id: uuid(), lead_id: id, user_id: owner || 'u-admin', type: t, subject: { note: 'Context from the form', call: 'Discovery call', email: 'Sent capability deck', meeting: 'Scoping workshop booked' }[t], body: t === 'call' ? 'Budget approved for Q1. Decision maker is the VP of Operations.' : null, occurred_at: when });
      lead.last_activity_at = when;
    }
  }
  function OPENS(s) { return !['won', 'lost', 'ignored'].includes(s); }

  const blog_posts = [
    { slug: 'dreamforce-2026-key-takeaways', title: 'Dreamforce 2026 key takeaways: what changed for Salesforce teams', category: 'Events', author: 'Vignesh', format: 'gallery' },
    { slug: 'agentforce-implementation-guide', title: 'Agentforce implementation guide for enterprise service teams', category: 'AI & Agentforce' },
    { slug: 'servicenow-itsm-rollout-guide', title: 'ServiceNow ITSM rollout guide: the first 120 days', category: 'ServiceNow' },
    { slug: 'salesforce-org-health-check', title: 'Salesforce org health check: 40 signals worth reviewing', category: 'Salesforce' },
    { slug: 'cloud-migration-strategy-6-rs-framework', title: 'Cloud migration strategy with the 6 Rs framework', category: 'Cloud and Data' },
    { slug: 'enterprise-agent-readiness-checklist', title: 'Enterprise agent readiness checklist', category: 'AI & Agentforce', status: 'draft' }
  ].map((p, i) => {
    const gallery = p.format === 'gallery' ? ['Day 1', 'Day 1', 'Day 1', 'Day 1', 'Day 2', 'Day 2', 'Day 2', 'Day 3', 'Day 3'].map((g, j) => ({
      id: 'g-demo-' + j, url: `/assets/img/insights/blog/${['agentforce-at-dreamforce-2026', 'dreamforce-2026-guide', 'dreamforce-2026-roi', 'dreamforce-2026-sessions-guide', 'meet-procyon-at-dreamforce-2026'][j % 5]}.webp`,
      fullUrl: `/assets/img/insights/blog/${['agentforce-at-dreamforce-2026', 'dreamforce-2026-guide', 'dreamforce-2026-roi', 'dreamforce-2026-sessions-guide', 'meet-procyon-at-dreamforce-2026'][j % 5]}.webp`,
      alt: j === 3 ? '' : `Dreamforce 2026 moment ${j + 1}`, caption: j % 3 === 0 ? 'Keynote stage, Moscone Center' : '', group: g, sortOrder: j
    })) : [];
    return {
      id: uuid(), slug: p.slug, title: p.title, excerpt: 'A practitioner summary of what changed, what it means for platform owners, and what to do in the next 90 days.',
      category: p.category, author: p.author || pick(['Vignesh', 'Procyon Technostructure', 'Arjun Kumar']), author_role: 'Practice Lead', read_time: '7 min read', reading_minutes: 7,
      tags: ['Salesforce', 'Agentforce'], cover_image: `/assets/img/insights/blog/${p.slug}.webp`, status: p.status || 'published',
      body_html: '<p>Dreamforce 2026 moved the conversation from pilots to production. This post covers what Salesforce announced and what platform teams should do next.</p>\n<h2 id="what-salesforce-actually-announced">What Salesforce actually announced</h2>\n<p>Three announcements matter for most enterprise orgs: the agent runtime, Data Cloud pricing and the new governance console.</p>\n<ul><li>Agent runtime is generally available.</li><li>Data Cloud credits are simpler.</li></ul>\n<h2 id="governance-has-to-arrive-before-agent-sprawl">Governance has to arrive before agent sprawl</h2>\n<p>Every agent needs an owner, a budget and a kill switch.</p>\n<blockquote><p>CTA: Plan your first production agent</p><p>A senior architect reviews the org and sends a written plan.</p><p><a href="/contact">Book the architect call</a></p></blockquote>',
      content: p.format === 'gallery' ? { format: 'gallery', gallery, galleryAnchors: {} } : [],
      seo_title: '', seo_description: '', focus_keyword: p.format === 'gallery' ? 'Dreamforce 2026' : '', canonical_url: null, og_image: null, noindex: false,
      cta_label: 'Talk to a senior architect', cta_url: '/contact', faqs: i === 0 ? [{ q: 'When is Dreamforce 2026?', a: 'September 15 to 17, 2026 in San Francisco.' }] : [],
      published_at: ago(i * 9 + 2), updated_at: ago(i * 4 + 1), created_at: ago(i * 9 + 3)
    };
  });
  const case_studies = [
    ['genesys-partner-onboarding', 'Modernizing partner onboarding for Genesys', 'Genesys', 'Technology', 'Salesforce Experience Cloud'],
    ['global-3d-software-service-cloud', 'Service Cloud for a global 3D software leader', 'Global 3D software leader', 'Software', 'Salesforce Service Cloud'],
    ['senior-care-digital-health-platform', 'Reinventing in-home senior care for a US digital health platform', 'US Digital Health Platform', 'Healthcare', 'Salesforce + MuleSoft']
  ].map(([slug, title, client, industry, platform], i) => ({
    id: uuid(), slug, title, client, industry, platform, region: 'United States', duration: '9 months', excerpt: 'How a phased program replaced spreadsheets and email with one platform of record.',
    cover_image: `/assets/img/insights/case-studies/${slug}.webp`, categories: ['Salesforce'], outcomes: [{ value: '50%', label: 'Faster onboarding' }, { value: '1,500+', label: 'Partners served' }],
    challenge: ['Onboarding ran on email and spreadsheets.', 'No single view of partner status.'], approach: [{ title: 'Platform of record', detail: 'Experience Cloud portal with guided onboarding.' }],
    results: ['Onboarding time halved.', 'One dashboard for partner health.'], stack: ['Experience Cloud', 'Sales Cloud'], quote: { text: '', author: '', role: '' },
    status: i === 2 ? 'draft' : 'published', is_featured: i === 0, sort_order: i, seo_title: '', seo_description: '', published_at: ago(60 + i * 20), updated_at: ago(10 + i)
  }));
  const events = [
    { slug: 'dreamforce-2026', title: 'Dreamforce 2026', date_text: 'Sept 15 to 17, 2026', start_date: '2026-09-15', end_date: '2026-09-17', location: 'San Francisco, CA', venue: 'Moscone Center', brand_color: '#0176D3' },
    { slug: 'nmsdc-annual-conference-exchange-2026', title: 'NMSDC Annual Conference & Exchange 2026', date_text: 'Oct 25 to 28, 2026', start_date: '2026-10-25', end_date: '2026-10-28', location: 'Los Angeles, CA', venue: 'LA Convention Center', brand_color: '#C8102E' }
  ].map((e, i) => Object.assign({
    id: uuid(), subtitle: 'Private 1:1 strategy sessions', event_type: 'Conference', category: 'Salesforce', status: 'Upcoming', excerpt: 'Meet Procyon practice leaders for a private session.', description: '',
    logo_url: null, hero_image_url: null, audience: 'CIOs, platform owners, supplier diversity leaders', meeting_url: '/contact', meeting_cta_label: 'Book a Meeting', event_url: 'https://www.salesforce.com/dreamforce/',
    seo_title: '', seo_description: '', is_published: true, is_featured: i === 0, promo_enabled: i === 0, display_order: i, event_timezone: 'America/Los_Angeles',
    highlights: ['Agentforce roadmap review', 'Org health quick scan'], why_meet: ['Planning a 2027 rollout'], services: [{ name: 'Salesforce Implementation', href: '/enterprise/salesforce', description: 'End-to-end delivery' }],
    products: [], agenda: [{ day: 'Day 1', items: ['Keynote', '1:1 sessions'] }], stats: [{ value: '40+', label: 'Sessions booked' }], meeting_slots: { booth_card: { enabled: true, badge: "WE'RE ATTENDING AS VISITORS", title: 'Not Exhibiting', description: 'Book a dedicated slot.', cta_label: 'Book a Slot', cta_url: '', icon: 'shield' } },
    faqs: [], updated_at: ago(5 + i)
  }, e));
  const meetingsList = [];
  for (let i = 0; i < 16; i++) {
    const ev = pick(events);
    const f = pick(first), l = pick(last);
    meetingsList.push({
      id: uuid(), event_id: ev.id, event_slug: ev.slug, event_title: ev.title, full_name: `${f} ${l}`, email: `${f}.${l}@${pick(companies).toLowerCase().replace(/[^a-z]+/g, '')}.com`.toLowerCase(),
      phone: '+1 650 555 ' + (1000 + i), company: pick(companies), requested_date: ev.start_date, requested_time: pick(['09:30', '11:00', '14:00', '15:30']), timezone: 'America/Los_Angeles',
      note: pick(['Want to discuss Agentforce for field service.', 'Looking at a ServiceNow upgrade.', '', 'Supplier diversity program review.']), status: pick(['new', 'new', 'contacted', 'confirmed', 'completed', 'declined']),
      source: 'event_page', created_at: ago(Math.floor(rnd() * 40))
    });
  }
  const jobs = [
    ['salesforce-technical-architect', 'Salesforce Technical Architect', 'SALESFORCE', 'Chennai (Hybrid)', '10+ Years'],
    ['servicenow-developer', 'ServiceNow Developer', 'SERVICENOW', 'Chennai', '4+ Years'],
    ['ai-architect-java-background', 'AI Architect (Java Background)', 'AI & DATA', 'Chennai (Onsite / Hybrid)', '10+ Years'],
    ['qa-engineer-manual-api-testing', 'QA Engineer (Manual + API Testing)', 'ENGINEERING', 'Chennai', '3+ Years'],
    ['business-development-manager', 'Business Development Manager', 'SALES', 'Novato, California', '6+ Years']
  ].map(([slug, title, department, location, experience_level], i) => ({
    id: uuid(), slug, title, department, location, employment_type: 'Full-time', experience_level, short_description: 'Lead delivery on enterprise programs with a senior, hands-on team.',
    full_description: 'You will design and deliver enterprise solutions with Procyon clients across the US and India.', responsibilities: 'Own the solution design.\nLead a small delivery team.\nReview code and configuration.',
    requirements: 'Relevant certifications.\nStrong communication.', nice_to_have: 'Agentforce experience.', is_published: i !== 4, is_open: i !== 3, display_order: i, created_by: i % 2 ? 'u-hr' : 'u-admin', created_at: ago(30 + i * 7), updated_at: ago(3 + i)
  }));
  const job_applications = [], job_application_notes = [];
  for (let i = 0; i < 28; i++) {
    const j = pick(jobs.slice(0, 4));
    const f = pick(first), l = pick(last);
    const id = uuid();
    job_applications.push({
      id, job_id: j.id, full_name: `${f} ${l}`, email: `${f}.${l}${i}@gmail.com`.toLowerCase(), phone: '+91 98400 ' + (10000 + i * 37), location: pick(['Chennai', 'Bengaluru', 'Hyderabad', 'Toronto', 'Remote']),
      current_company: pick(['Infosys', 'TCS', 'Accenture', 'Deloitte', 'Startup']), current_title: pick(['Senior Developer', 'Consultant', 'Architect', 'Lead Engineer']), years_experience: String(2 + Math.floor(rnd() * 12)),
      linkedin_url: 'https://www.linkedin.com/in/example-' + i, portfolio_url: rnd() < 0.3 ? 'https://github.com/example' + i : null, cover_letter: rnd() < 0.5 ? 'I have led three Salesforce rollouts and would love to join a senior team.' : null,
      resume_path: null, status: pick(['new', 'new', 'reviewed', 'shortlisted', 'rejected']), created_at: ago(Math.floor(rnd() * 45))
    });
    if (rnd() < 0.4) job_application_notes.push({ id: uuid(), application_id: id, author_id: 'u-hr', author_name: 'Priya Natarajan', type: pick(['note', 'call', 'interview']), content: 'Strong fundamentals. Schedule a technical round.', metadata: null, created_at: ago(Math.floor(rnd() * 10)) });
  }
  const authors = [
    { id: uuid(), slug: 'vignesh', name: 'Vignesh', role: 'Practice Lead, Salesforce', bio: 'Leads Salesforce delivery at Procyon.', headshot: '', email: '', linkedin_url: '', twitter_url: '', website_url: '' },
    { id: uuid(), slug: 'arjun-kumar', name: 'Arjun Kumar', role: 'Solutions Architect', bio: '', headshot: '', email: '', linkedin_url: '', twitter_url: '', website_url: '' },
    { id: uuid(), slug: 'procyon-technostructure', name: 'Procyon Technostructure', role: '', bio: '', headshot: '', email: '', linkedin_url: '', twitter_url: '', website_url: '' }
  ];
  const site_promo = [{ id: 1, enabled: true, event_slug: 'dreamforce-2026', message: 'Meet Procyon at Dreamforce 2026 | Sept 15 to 17', cta_label: 'Book a Meeting', cta_url: '/insights/events/dreamforce-2026', animation: 'marquee', bg_from: '#0F1E3A', bg_to: '#0176D3', text_color: '#FFFFFF', updated_at: ago(3) }];

  const me = staff.find(s => s.role === role) || staff[0];
  return { me, tables: { profiles, user_roles, admin_allowlist, sales_categories, leads, lead_activities, blog_posts, case_studies, events, event_meeting_requests: meetingsList, jobs, job_applications, job_application_notes, authors, public_authors: authors, site_promo } };
}

const cmp = (a, b) => (a == null) - (b == null) || (a < b ? -1 : a > b ? 1 : 0);
function test(row, [op, col, val]) {
  const v = row[col];
  switch (op) {
    case 'eq': return v === val || String(v) === String(val);
    case 'neq': return !(v === val || String(v) === String(val));
    case 'gt': return v != null && v > val;
    case 'gte': return v != null && v >= val;
    case 'lt': return v != null && v < val;
    case 'lte': return v != null && v <= val;
    case 'in': return val.includes(v);
    case 'notIn': return !val.includes(v);
    case 'is': return val === null ? v == null : v === val;
    case 'ilike': return String(v || '').toLowerCase().includes(String(val).replace(/%/g, '').toLowerCase());
    default: return true;
  }
}

export function createDemo(role) {
  const { me, tables } = build(role);
  const t = (name) => (tables[name] = tables[name] || []);
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const wait = (v) => new Promise(r => setTimeout(() => r(v), 120 + Math.random() * 180));
  const rows = (name, filters) => t(name).filter(r => (filters || []).every(f => test(r, f)));
  let build$ = { running: false, result: 'ok', finishedAt: new Date(Date.now() - 36e5).toISOString(), startedAt: null, steps: [], message: 'The site is up to date with the CMS.' };
  return {
    role,
    list(name, { filters, order, limit } = {}) {
      let out = rows(name, filters);
      for (const [col, asc] of (order || []).slice().reverse()) out = out.slice().sort((a, b) => asc ? cmp(a[col], b[col]) : cmp(b[col], a[col]));
      return wait(copy(limit ? out.slice(0, limit) : out));
    },
    count(name, filters) { return wait(rows(name, filters).length); },
    get(name, id, key = 'id') { return wait(copy(t(name).find(r => String(r[key]) === String(id)) || null)); },
    insert(name, row) {
      const now = new Date().toISOString();
      const r = Object.assign({ id: name === 'site_promo' ? 1 : uuid(), created_at: now, updated_at: now }, name === 'lead_activities' ? { occurred_at: now } : {}, copy(row));
      t(name).unshift(r);
      if (name === 'lead_activities') { const l = t('leads').find(x => x.id === r.lead_id); if (l) l.last_activity_at = now; }
      return wait(copy(r));
    },
    update(name, id, patch, key = 'id') {
      const r = t(name).find(x => String(x[key]) === String(id));
      if (!r) return Promise.reject(new Error('Not saved: record not found.'));
      if (name === 'leads' && role === 'sales' && r.owner_id !== me.id) return Promise.reject(new Error('Not saved: this account is not allowed to change that record.'));
      Object.assign(r, copy(patch), { updated_at: new Date().toISOString() });
      return wait(copy(r));
    },
    upsert(name, row, onConflict = 'id') {
      const r = t(name).find(x => String(x[onConflict]) === String(row[onConflict]));
      return r ? this.update(name, row[onConflict], row, onConflict) : this.insert(name, row);
    },
    remove(name, filters) {
      const gone = rows(name, filters);
      tables[name] = t(name).filter(r => !gone.includes(r));
      return wait(copy(gone));
    },
    upload(file) { return wait(URL.createObjectURL(file)); },
    invoke(fn, body) {
      if (fn === 'invite-admin') {
        const ex = t('admin_allowlist').find(a => a.email === body.email);
        if (ex) Object.assign(ex, { role: body.role, invited_at: new Date().toISOString() });
        else t('admin_allowlist').unshift({ email: body.email, role: body.role, added_at: new Date().toISOString(), invited_at: new Date().toISOString(), accepted_at: null });
        return wait({ ok: true });
      }
      if (fn === 'delete-admin') { tables.admin_allowlist = t('admin_allowlist').filter(a => a.email !== body.email); return wait({ ok: true }); }
      return wait({ ok: true });
    },
    session() { return Promise.resolve({ access_token: 'demo', user: { id: me.id, email: me.email, user_metadata: { display_name: me.display_name } } }); },
    rebuild() {
      if (build$.running) return wait({ ok: true, started: false, queued: true, status: build$ });
      build$ = { running: true, startedAt: new Date().toISOString(), finishedAt: null, result: null, steps: [], totalSteps: 3, message: '' };
      const steps = [['sync', 'Sync content from the CMS'], ['insights', 'Build insights pages'], ['site', 'Build site pages']];
      steps.forEach(([name, label], i) => setTimeout(() => {
        build$.steps.push({ name, label, ok: true, ms: 1400 });
        if (i === steps.length - 1) Object.assign(build$, { running: false, result: 'ok', finishedAt: new Date().toISOString(), message: 'Demo: nothing was published.' });
      }, 1500 * (i + 1)));
      return wait({ ok: true, started: true, status: build$ });
    },
    rebuildStatus() { return wait(Object.assign({ totalSteps: 3, autoSync: true, intervalMinutes: 30 }, copy(build$))); }
  };
}

export const DEMO_CATEGORIES = LEAD_CATEGORIES;
