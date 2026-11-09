# procyon-new

New procyonts.com website for Procyon Technostructure (Salesforce and ServiceNow consulting partner).

- `public/` static site (home page, 404, robots.txt, sitemap.xml, llms.txt, icons)
- `server.js` zero-dependency Node server: static files, gzip, security headers, `POST /api/lead`
- `SITEMAP.md` full menu, footer and planned page list

## Run locally

```bash
npm start
```

Open http://localhost:3000

## Deploy (Railway)

Railway detects Node and runs `npm start`. It provides `PORT` automatically.

Optional environment variables:

| Variable | Purpose |
|---|---|
| `LEAD_WEBHOOK_URL` | Forward every form lead as JSON (Zapier, Make, HubSpot, Slack, Teams) |
| `SF_WEB_TO_LEAD_OID` | Your Salesforce org ID. Sends leads straight into Salesforce via Web-to-Lead |
| `CANONICAL_HOST` | e.g. `procyonts.com`. Redirects other hostnames (www) to it |

If neither lead variable is set, leads are written to the Railway service logs (`[lead] {...}`) so none are lost.

## Analytics

`main.js` pushes events to `window.dataLayer` (`cta_click`, `service_tab_view`, `generate_lead`). Add your GTM container snippet to `index.html` and these become GA4 / LinkedIn conversions. The CSP in `server.js` already allows Google Tag Manager and LinkedIn Insight.
