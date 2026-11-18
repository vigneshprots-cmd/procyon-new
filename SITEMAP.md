# procyonts.com: Information Architecture (v2, lean)

The home page and the Salesforce, AI & Data, Talent and Company menus (20 pages, marked Live) are built. Salesforce pages are generated with `npm run build` from `src/pages/`. Every other page below is planned; until it exists, its link shows a "page in progress" screen with a contact button.
The menu is cut to what Procyon actually sells: Salesforce, ServiceNow, AI & data, certified talent, and the Ranger Fusion product.
Priority: P1 = build next (highest buying intent), P2 = second wave.

## Primary navigation (6 menus + 1 CTA)

| Menu | Page | URL | Priority |
|---|---|---|---|
| **Salesforce** | Salesforce hub | /salesforce/ | Live |
| | Implementation & rollout (Sales, Service, Revenue, Experience Cloud) | /salesforce/implementation/ | Live |
| | Agentforce (Agent Launch Kit) | /salesforce/agentforce/ | Live |
| | Data Cloud & integration | /salesforce/data-cloud/ | Live |
| | Org audit & rescue | /salesforce/org-audit/ | Live |
| | Managed services | /salesforce/managed-services/ | Live |
| | Feature card: Ranger Fusion ERP | /ranger-fusion/ | Live |
| **ServiceNow** | ServiceNow hub | /servicenow/ | P1 |
| | Platform audit & tech-debt removal | /servicenow/platform-audit/ | P1 |
| | ITSM, ITOM & CMDB | /servicenow/itsm-itom/ | P1 |
| | Security & risk (SecOps, GRC) | /servicenow/security-risk/ | P2 |
| | Now Assist & AI agents | /servicenow/now-assist/ | P2 |
| | Managed services | /servicenow/managed-services/ | P2 |
| **AI & Data** | AI & data hub | /ai-data/ | Live |
| | AI agents & automation | /ai-data/ai-agents/ | Live |
| | Knowledge assistants (RAG) | /ai-data/knowledge-assistants/ | Live |
| | Data platforms & analytics | /ai-data/data-analytics/ | Live |
| | Integration & APIs (MuleSoft, SAP, Oracle, NetSuite, Workday) | /ai-data/integration/ | Live |
| | Product engineering hub (listed under AI & Data in the menu) | /engineering/ | Live |
| | Product engineering | /engineering/product-engineering/ | P2 |
| | Enterprise web & mobility | /engineering/web-mobility/ | P2 |
| | Application maintenance & support | /engineering/application-support/ | P2 |
| | Application modernization | /engineering/modernization/ | P3 |
| | Cloud transformation | /engineering/cloud/ | P3 |
| | Cybersecurity & compliance | /engineering/security-compliance/ | P3 |
| **Talent** | Talent hub | /talent/ | P1 |
| | Staff augmentation | /talent/staff-augmentation/ | Live |
| | Delivery pods | /talent/delivery-pods/ | Live |
| | How we engage (fixed, T&M, outcome-based) | /talent/engagement-models/ | Live |
| **Work** | Case studies (filter by platform and industry) | /work/ | P1 |
| | Industries hub (Healthcare, Financial services, Public sector, Retail, High tech) | /industries/ + /industries/{name}/ | P2 |
| | Insights | /insights/ | P2 |
| **Company** | About Procyon | /about/ | Live |
| | Partners & certifications | /about/certifications/ | Live |
| | Careers | /careers/ | Live |
| | Contact | /contact/ | Live |

Header CTA on every page: **Talk to an architect** (opens the pop-up contact form).

Total: about 32 pages, down from about 80 in v1.

## Footer

1. Brand: original logo + "Run the business. Not the software."
2. Salesforce: Implementation, Agentforce, Data Cloud, Org audit & rescue, Managed services.
3. ServiceNow: Platform audit, ITSM & ITOM, Security & risk, Now Assist, Managed services.
4. AI, Data & Talent: AI agents, Integration, Data & analytics, Staff augmentation, Ranger Fusion ERP.
5. Company: About, Case studies, Insights, Careers, Contact.
6. Offices: Novato CA, Toronto ON, Chennai TN, plus phone and email.
7. Legal: Privacy, Terms, Cookies, Accessibility. Social icons.

## Landing page template

Outcome headline (no jargon) > the cost of the problem > what we deliver (scope chips) > fastest way in (fixed-scope offer with timeline) > one case study with before/after numbers > FAQ (FAQPage schema) > 3-step audit form.
One primary keyword per page in the title, URL, first H2 and meta description.
