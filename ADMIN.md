# Procyon admin console

A CRM-style admin for the Procyon site, served at **/admin** by `server.js`. It is a no-build single-page app (`public/admin/`: vanilla ES modules and one CSS file) that talks to the existing Supabase project with supabase-js 2.49.4 (pinned, from jsDelivr) and the publishable key. Row Level Security on Supabase decides what each signed-in user can read and change; the console only hides what a role cannot use.

It reads and writes the same tables and JSON shapes as the Lovable admin at procyonts.com/admin, so both consoles can be used side by side.

## Signing in

- Existing Supabase accounts sign in with email and password. "Forgot password?" sends a Supabase reset email.
- Invite and reset links land on `/admin/accept-invite`, where the person sets a password; the invite is then marked accepted in `admin_allowlist`.
- The role comes from `user_roles` (admin > hr > sales). An account with none of these roles sees a "no access" screen.
- **Demo mode**: `/admin?demo=admin` (or `sales`, `hr`) runs the whole console on sample data in the browser. Nothing is sent to Supabase. `?demo=off` leaves it.

## What each role sees

| Section | Admin | Sales | HR |
|---|---|---|---|
| Dashboard | everything | pipeline KPIs | hiring KPIs |
| Leads, meeting requests | yes | yes (edit only leads they own) | no |
| Applications, careers (jobs) | yes | no | yes |
| Blog, case studies, events, authors | yes | no | no |
| Promo bar, users and access, Publish to site | yes | no | no |

## Features

- **Dashboard**: new leads (7 and 30 days, with change against the previous 30), open pipeline, unassigned, overdue follow-ups, won this month, meeting requests, new applications, open roles; pipeline bar, leads by interest or source (inline SVG), new leads per week, follow-ups due, recent activity feed.
- **Leads**: table with sorting, quick filters (open, mine, unassigned, overdue, by status), filters for status, owner, interest (`requirement`), category, source and received date, saved views (stored in the browser), bulk status and bulk assign, CSV export of the filtered or selected set, and a Kanban board by status with drag and drop. The lead drawer has status, owner (reps who own the lead's category listed first), follow-up date with quick picks, contact facts, the message, page URL with parsed UTM parameters, and the `lead_activities` timeline with quick-add for notes, calls, emails and meetings. Status and owner changes write `status_change` and `assignment` activities, as the old console does.
- **Meeting requests** (`event_meeting_requests`): status chips, event filter, search, drawer with reply-by-email and next-step buttons, CSV export.
- **Applications** (`job_applications`): table or board by status, role filter, candidate drawer with links, cover letter, recruiter notes (`job_application_notes`: note, call, interview) and "move to another role" (writes the transfer columns and a `role_transfer` note with the same metadata as the old console).
- **Blog editor**: title, slug, excerpt, category, tags, author (from `authors`, or a free-text byline), status, publish date, read time, cover upload, CTA label and link, SEO title, meta description, focus keyword, canonical URL, share image, noindex, FAQs.
  - Body as **blocks** (text, heading, image, gallery, quote, call to action, raw HTML) or as **raw HTML** for the whole article. Blocks serialize to `body_html`; anything the builder does not recognise stays as an HTML block with its original markup, so existing posts round-trip unchanged (checked on all 33 published posts).
  - **Gallery format**: `content = { format: 'gallery', gallery: [...], galleryAnchors: { group: pattern } }`. Upload many photos or videos at once to `blog-media/gallery/`, group them (Day 1, Day 2…), drag to reorder or onto another group, edit alt text, captions and video posters, and see which H2 each strip will sit under.
  - **Live preview** in an iframe using the site's own `styles.css`, `pages.css`, `insights.css` and `gallery.css`, desktop or mobile width.
  - **SEO score**: title 60 characters or fewer, description 110 to 160, focus keyword in title, an H2 and the first paragraph, alt text on every image and gallery item, no em or en dashes (with an automatic fix), H2 count, length, excerpt, cover and slug.
  - Autosave to the browser while editing, with a restore prompt. Saves write only the columns that changed.
- **Case studies, events, job posts**: form editors (repeaters for outcomes, approach, agenda, stats, services, FAQs; the events booth card lives in `meeting_slots.booth_card`), drafts autosaved, column-level saves.
- **Authors**, **promo bar** (`site_promo` row 1, with a live preview), **users and access** (invite by email with a role, resend, revoke, pending invites, per-rep lead categories in `sales_categories`). Invites and revokes call the existing Edge Functions `invite-admin` and `delete-admin`; if Supabase's email limit is hit, the one-time link is shown to copy.
- **Global search** (`/` or Ctrl+K) across leads, meetings, applicants, posts, case studies, events and jobs, plus quick navigation and "new" commands. Shortcuts: `g` then `d l m a b c e j w p u` to jump, `n` for new, `j`/`k`/Enter/`x` in lists, `v` to switch table and board, Ctrl+S to save, `?` for the list.

## Publishing (CMS to static site)

The public site is static HTML built from `content/insights/*.json`. Changes in the CMS reach it through **sync + build**:

1. `node scripts/sync-insights.js` pulls published rows into `content/insights/*.json` (gallery posts now include `format`, `gallery`, `galleryAnchors`).
2. `node scripts/build-insights.js` and `node scripts/build.js` regenerate the pages.

This runs:

- when an admin clicks **Publish to site** (`POST /api/admin/rebuild`), and
- automatically about 30 seconds after the server starts and then every 30 minutes.

`server/admin-api.js` verifies the caller's Supabase access token with `GET /auth/v1/user`, then reads `user_roles` with that same token (so RLS applies) and requires `admin`. Builds run one at a time in a child process; a request during a build is queued and coalesced. `GET /api/admin/rebuild/status` (admin only) returns the state, the steps and the recent log. Rate limits: 6 publish requests per IP per 10 minutes, and a cap on failed auth attempts. The static site keeps serving while a build rewrites files in place. If the CMS sync fails (network), the site is rebuilt from the last synced content and the result is reported as "partial".

`sync-insights.js` works without `sharp`: covers already on disk are kept and never removed; new covers wait for a run where sharp is installed.

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `ADMIN_AUTO_SYNC` | on | Set to `0` to turn off the startup and 30-minute sync (useful in local development, where it rewrites the working tree) |
| `ADMIN_SYNC_DELAY_MS`, `ADMIN_SYNC_EVERY_MS` | 30000, 1800000 | Timing of the automatic sync |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | the live project | Used only to verify admin tokens |

## Gallery posts on the public site

`build-insights.js` places each gallery group under the first H2 that starts with the group name, matches its `galleryAnchors` pattern, or matches the built-in Day 1/2/3 patterns; unmatched groups follow the article (the same rules as the old React page). Strips use `public/assets/css/gallery.css` and `public/assets/js/gallery.js`, which are added only to posts that contain a gallery. The lightbox is a modal dialog with focus trapping, Escape, arrow keys, Home and End, swipe, video playback, lazy-loaded thumbnails, and focus returned to the tile on close. Long strips show 8 tiles (6 on phones) with a "Show all" button. Inline galleries added with the block builder use the same markup.

## Security notes

- `/admin` sends `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` and its own CSP (scripts only from self and jsDelivr; connections only to the Supabase project). `robots.txt` disallows `/admin` for every crawler group, and the sitemap never lists it.
- No service-role key is used anywhere. The browser only has the publishable key; every read and write is checked by RLS.
- The post preview strips scripts and event handlers and runs in a sandboxed iframe without script permission.

## Needs a database or platform change later

- **Leads from the new site**: `POST /api/lead` forwards to the webhook or Salesforce Web-to-Lead and does not insert into Supabase `leads`, so new-site enquiries do not appear in this CRM. Fix: have the server call the `submit-lead` Edge Function (or insert with a restricted policy). Same for `/api/apply` and `job_applications`.
- **UTM fields**: leads have no UTM columns; the console parses them from `page_url`. Add `utm_source`, `utm_medium`, `utm_campaign` (and capture them at submit) for reliable reporting.
- **Meeting request notes**: there is no notes table for `event_meeting_requests`. Suggested: `event_meeting_request_notes (id, request_id, author_id, author_name, type, content, created_at)` with the same RLS as leads.
- **Shared saved views**: saved lead views live in each browser. A `crm_saved_views` table would let the team share them.
- **Changing a user's role**: there is no UI to edit `user_roles` directly; today it means revoking and re-inviting (or SQL). A small admin-only RPC would make this one click.
- **Resumes**: `resume_path` values are signed links issued by the old site's `/api/download-url`; they expire, and this server has no equivalent endpoint.
- **Auth redirect URLs**: add `https://procyon.up.railway.app/admin/accept-invite` (and the final domain) to Supabase Auth's allowed redirect URLs, or invite and reset emails will send people to the old site.
- **Promo bar on the new site**: the static site does not render `site_promo` yet; the old site reads it live.
- **Subresource integrity**: add an `integrity` hash for the pinned supabase-js script.
- **Railway filesystem**: builds write to the container's disk, which resets on each deploy; the startup sync rebuilds within a minute of boot.
