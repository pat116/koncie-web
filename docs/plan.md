# Koncie Prototype — Rebuild Plan

**Author:** Pat Shiels (with Claude)
**Date:** 2026-04-23
**Status:** Draft v1 — plan only, no code written
**Inputs reviewed:**
- `Koncie Board Presentation (DRAFT) (4).docx` (last modified 2026-04-23 10:12 AM)
- `Loveable Koncie Prototype.tsx` (last modified 2026-04-23 2:35 PM)
- Koncie Project Design Brief (in the project workspace system instructions)

---

## 1. Concept summary

Koncie is a post-booking guest experience platform and consumer travel companion that sits on top of Kovena's existing 23+ PMS/OBE integrations (30,000+ accommodation partners). It activates the moment a guest books with one of those partners and stays with them through their journey, surfacing ancillary products — flights, travel insurance, activities, and on-property upsells — through a single branded interface.

The strategic thesis, confirmed in the board deck, is that Kovena already owns the backend payment rails into the global hotel tech stack, and Koncie extends that position into the guest relationship itself. The deck frames it as "Kovena's leap from payment rails to guest rails" (the Shopify-to-Shop analogue).

The non-negotiables, all reinforced by the deck:

- **Koncie acts as the Merchant of Record** for all ancillary transactions. This is the commercial moat. Kovena captures payment volume and commission margin without the hotel or provider needing to complete new KYC/onboarding.
- **Koncie never touches the original room booking transaction.** That keeps flowing through the hotel's existing system. Koncie only processes ancillaries post-booking.
- **All Koncie transactions process under MCC 4722** (travel agent), with an AFTA/ATAS and IATA Lite accreditation pathway as load-bearing trust signals to card networks and acquirers. The deck carries an apparent placeholder IATA Agency Code ("123 456") — worth treating as TBD until confirmed.
- **Distribution is partner-led.** PMS/OBE integration-first onboarding, revenue share downstream, no hotel-by-hotel sales cycle. Feature choices that require bespoke hotel engineering work are out of scope for MVP.
- **Guest experience is web-first.** The deck explicitly names "no download required" as a pilot-adoption mitigation.

Three revenue streams: flights (~2% + $35 booking fee, via Jet Seeker rebranded as "Kovena Flights"), travel insurance (~30% commission), and activities/ancillaries (10–20%). Projected build: ~$1M (2026 pilot) → ~$10M (2027 regional) → $25–30M+ (2028 global), with insurance becoming the single largest segment by value.

Pilot: Q2 2026 (Fiji), which — given today is 2026-04-23 — means the MVP ship window is effectively the next 8–10 weeks.

### Divergences / updates from the project brief worth flagging

- The deck introduces a **meta-search pivot for Jet Seeker**: post-acquisition it is relaunched as "Kovena Flights" and evolved into a "flights-only meta-search engine" aggregating inventory from Skyscanner, Kayak, Momondo, Cheapflights, plus Google Flights distribution. The brief frames Jet Seeker as an OTA license + booking stack, not a meta-search aggregator. This is a meaningful scope shift that will show up in the tech architecture — if Kovena Flights is ingesting third-party meta-search inventory rather than issuing tickets directly, the flow and commercials are different.
- The deck lists **attach rate targets** for Phase 2 (>5% insurance, >3% flights by end of 2026 across 100 hotels / 50k+ guest accounts). The brief uses the same numbers — aligned.
- The deck is explicit about **distribution via HotelLink first** for direct bookings, with references to existing Lovable prototype URLs for the hub pages. The existing prototype file I reviewed is only the index/navigation page (see Section 2).
- **Jet Seeker acquisition status**: the deck's Phase 1 window is Q3 2025 – Q3 2026. Today is 2026-04-23, so we're ~7 months into that window. The plan assumes the acquisition is closed or imminent — flagged as an open question in Section 7.

---

## 2. Lovable prototype assessment

The file I reviewed (`Loveable Koncie Prototype.tsx`) is **not the prototype itself — it is the index/hub page** that links out to the actual prototype screens. The individual screen files (e.g. `koncie-hub-user`, `flight-search`, `payment`, etc.) are not in the workspace and must live elsewhere in the Lovable project.

### What the file tells us about the stack

- **React + TypeScript** (functional components, arrow syntax, typed `.tsx`)
- **React Router** (`useNavigate` from `react-router-dom`) — client-side routing, so it's a SPA architecture, not Next.js or similar server-rendered
- **shadcn/ui** component library (`Card`, `Button` from `@/components/ui/*`)
- **Tailwind CSS** for styling (extensive utility classes, custom gradient tokens, `font-poppins` referenced)
- **lucide-react** for iconography
- No state management library, no data fetching library visible in this file
- No evidence of backend integration, authentication, or payment wiring

### Information architecture inferred from the file

The hub presents two groups of routes: a **Main Workflow** (7 steps) and a **Supporting Pages** cluster (4 items).

Main workflow steps are numbered 1, 2, 3, **5**, 6, 7, 8 — **step 4 is missing**. Given the labels, step 4 is probably the account-creation / email-verification handoff that lives in the Supporting Pages cluster as "Email Confirmation" / "User Registration" / "Welcome". Worth confirming with the original Lovable project.

The workflow map:

1. Resort Booking (embedded widget on resort website)
2. Koncie Hub Non-User (branded transition / non-user view)
3. Payment Flow (secure checkout)
4. *(missing — likely registration/email handoff)*
5. Flight Search (browse/book flights)
6. Pre-Arrival SMS (iPhone message interface demo)
7. Admin Portal (Koncie admin dashboard)
8. Koncie Hub User (registered user hub)

Supporting: Email Confirmation, User Registration, Welcome Screen, Workflow Diagram.

### What works

- **Clean design vocabulary**: Tailwind + shadcn/ui + lucide is a modern, fast, well-supported stack with a large ecosystem. No exotic choices that would lock us in.
- **Navigation mirrors the deck's guest journey logic**: resort booking → hub → payment → flight → pre-arrival comms → in-stay. That narrative coherence is good.
- **Responsive grid** (md:grid-cols-2 lg:grid-cols-4) — mobile-first layout is right for a guest-facing web-first product.
- **Card-based information architecture** is appropriate for a dashboard/hub.

### What's weak

- **The file is a demo index, not a prototype of a product.** It's a dev-facing navigation scaffold for a showcase deployment — useful for investor demos, but it would be replaced entirely in a real product build. The actual screens that matter (hub user, flight search, payment) aren't in the workspace.
- **Hard-coded navigation data** in `workflowSteps` and `supportingPages` arrays — fine for a demo, but a real product would drive these from a guest's booking state and role, not from a static list.
- **No differentiation between guest and admin contexts.** In the real product these are two distinct apps with different auth, layouts, and data models; the demo flattens them.
- **No data model visible.** No types for Booking, Guest, Upsell, etc. Any rebuild needs to start with a real domain model.
- **Styling inconsistencies already creeping in** (the card color utility strings are duplicated across steps; would want centralised brand tokens).
- **`font-poppins` is referenced but not loaded in this file** — assumes a CSS import or `next/font` setup elsewhere. Easy fix, but a sign that this file alone isn't runnable.

### What's missing vs. the board deck

The Lovable index covers about **half** of what the deck describes. Gaps:

- **Insurance offer flow** — central to the revenue model (largest segment by value), completely absent from the prototype navigation.
- **Activities / ancillaries marketplace** — named in the deck as a revenue stream and as the glue for the in-stay experience, not in the prototype.
- **QR-code OTA onboarding flow** — the deck describes this as one of two primary guest entry paths (for guests who booked via Expedia/Booking.com rather than direct). Not in the prototype.
- **AI-powered concierge chat** — called out in the deck's "Benefits to Travelers" section. Absent.
- **Merchant-of-Record payment plumbing** — the prototype has a "Payment Flow" page referenced but the MoR structure (trust accounts, MCC 4722, tokenisation, payout splits) isn't modelled here.
- **Partner-facing revenue dashboards** — the deck calls out partner rev-share and dashboards for hotels to track their ancillary revenue. Only a thin "Admin Portal" card in the prototype.
- **Meta-search integration** for flights — if Kovena Flights is a meta-search aggregator (per the deck's Phase 1 pivot), there's architecture implied here the prototype doesn't hint at.
- **PMS/OBE connector patterns** — the whole point of the distribution model is low-touch PMS integration. Nothing in the prototype shows booking ingestion or the partner-side toggle.
- **Pre-arrival engagement logic** — there's a "Pre-Arrival SMS" card, but no template/trigger model behind it.
- **Digital check-in / room key integration** — Phase 2 material per the deck, but worth having a seam in the architecture.

### Summary judgement

Treat the Lovable file as **visual reference and IA inspiration, not a foundation to build on**. The rebuild should start clean with a proper domain model, auth, data fetching, and backend, porting the visual language and screen structure. The actual screens (if they exist in the Lovable project but aren't in this workspace) are probably worth a second look before Sprint 1 — see open questions.

---

## 3. Target tech stack and architecture

### Recommendation

**Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui**, deployed on **Vercel** with **Cloudflare** in front for Pacific-region edge caching. Backend in the same monorepo using **Next.js API routes and Server Actions** for MVP, with **Postgres (Supabase or AWS RDS) + Prisma**. **tRPC** for typed client-server contracts. **Clerk** or **Auth.js** for authentication.

### Why Next.js over the Lovable Vite/React Router SPA

- **Server rendering and edge caching matter for a Pacific consumer audience.** Guest reach includes travellers on patchy 4G in Fiji, Cook Islands, Vanuatu. SPA TTI and bundle size hurt here; SSR/RSC and route-level caching help materially.
- **SEO on confirmation and landing pages**: the hotel-integration entry point is a confirmation page with a "Koncie Hub Non-User" handoff. Server rendering is friendlier for link previews and share metadata.
- **Server Components and Server Actions** reduce the JS shipped to the device. For a dashboard-heavy product like a guest trip hub, this is meaningful.
- **Next.js + Vercel is a near-zero-friction deployment path**, which matters given the compressed pilot timeline.
- **App Router's route groups** (`(guest)`, `(admin)`, `(partner)`) map cleanly onto Koncie's three distinct user surfaces.
- **It keeps the existing vocabulary** — shadcn/ui, Tailwind, lucide-react all work natively with Next.js, so Lovable design assets port directly.

### Alternatives considered

- **Vite + React SPA (Lovable's stack)** — faster dev loop, simpler mental model, but no SSR, no built-in API layer, weaker SEO, and we'd end up bolting on a separate backend service that Next.js handles natively. Reasonable fallback if the team has a strong SPA preference or Vercel isn't on the table.
- **Remix** — similar SSR benefits to Next.js, smaller ecosystem, fewer enterprise deployment patterns. Defensible but no meaningful advantage over Next.js for this case.
- **React Native / Expo** — needed **later** if we ship a native app (which the deck keeps optional: "no download required" is a pilot pitch). Recommendation is to defer native to Phase 3, not MVP, and use web responsive design plus PWA install for mobile-feel in the pilot.
- **Full-stack separation (Go/Python backend + React frontend)** — more operationally correct for long-term scale, but adds a second language and a second deployment pipeline to a team that likely doesn't have the headcount to justify it pre-pilot. If Kovena's core backend is already Go/Python, we can carve out services behind an API gateway in Phase 2+ without rewriting the frontend.

### High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE                              │
│             (edge cache, WAF, AU/Pacific POPs)                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    NEXT.JS (VERCEL)                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐     │
│   │   (guest)   │  │   (admin)   │  │     (partner)       │     │
│   │    hub      │  │   hotel     │  │  PMS/OBE dashboard  │     │
│   │  flights    │  │   portal    │  │  rev-share reports  │     │
│   │  insurance  │  │             │  │                     │     │
│   │  checkout   │  │             │  │                     │     │
│   └─────────────┘  └─────────────┘  └─────────────────────┘     │
│                                                                 │
│   Server Actions + API routes  ——  tRPC contracts              │
└──┬──────────────┬──────────────┬───────────────┬────────────────┘
   │              │              │               │
   ▼              ▼              ▼               ▼
┌────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐
│Postgres│  │  Kovena  │  │  Jet Seeker │  │  Insurance   │
│Prisma  │  │ payments │  │  / Kovena   │  │  partner     │
│        │  │  (MoR)   │  │  Flights    │  │  API         │
└────────┘  └──────────┘  └─────────────┘  └──────────────┘
                                ▲
                                │
                    ┌───────────┴──────────┐
                    │  PMS/OBE connectors  │
                    │  (HotelLink, STAAH,  │
                    │   Levart, Opera,     │
                    │   Abode, ResBook)    │
                    └──────────────────────┘
```

### Domain model sketch (starting point)

Core entities the rebuild needs to model from day one:

- `Guest` — identity, contact, saved payment methods (tokenised), preferences
- `Booking` — hotel reservation pulled from PMS; source (direct vs OTA); dates; property; linked to `Property`
- `Property` — hotel/resort; tied to `PartnerIntegration`; brand config
- `PartnerIntegration` — PMS/OBE connector instance; rev-share terms
- `Itinerary` — aggregated view of booking + ancillaries for a given Guest
- `Upsell` — catalogue of purchasable items (flight, insurance, activity, upgrade); provider-backed
- `Transaction` — MoR ledger: amount, splits (Kovena, hotel, partner, provider), MCC, trust account reference
- `Flight`, `InsurancePolicy`, `Activity` — ancillary-type specialisations, each with provider reference

### Integration seams

The architecture should **abstract every external provider behind a clean port**, with a thin implementation adapter per vendor. Specifically:

- `FlightProvider` port — implementations: Jet Seeker / Kovena Flights, meta-search partners
- `InsuranceProvider` port — implementations: CoverMore, Allianz, etc.
- `ActivityProvider` port — implementations: Viator, Expedia Local Expert, bespoke
- `PMSConnector` port — implementations: HotelLink, STAAH, Levart, Opera, Abode, ResBook
- `PaymentProvider` port — Kovena MoR implementation

This is important because the commercial relationships (which provider, which PMS) are still being negotiated per the deck. The codebase must not bake in a single vendor.

---

## 4. Feature scope — MVP vs later phases

Scope is anchored to the deck's four-phase rollout.

### MVP (Phase 1 — Fiji pilot, Q2 2026)

The minimum that proves the revenue model works end-to-end with one pilot hotel and one flight/insurance provider each.

**Must-have:**

- Direct Booking flow: Koncie invitation on confirmation page (embed/snippet), hand-off to Koncie Hub
- Koncie Hub (Non-User): anonymous landing page with booking context pulled via signed link
- Account creation flow: email verification, password or magic link, welcome screen, payment method saved (tokenised)
- Koncie Hub (User): authenticated guest dashboard showing booking + available upsells
- **Flight search and book** (Jet Seeker / Kovena Flights, one provider, one route pattern tested — ex-AU/NZ to Pacific)
- **Travel insurance offer** (one provider, single policy type, single-click buy)
- **Merchant-of-Record payment flow** with tokenisation, card-on-file, receipts
- Pre-arrival email + SMS triggers (template-driven)
- Hotel admin portal (basic): bookings list, upsell activity, revenue summary, CSV export
- PMS ingestion for **one pilot partner** (HotelLink or STAAH — decision needed)
- Basic analytics/logging for attach-rate measurement (this is how we prove the pilot worked)

**Deliberately out of MVP** (but stubbed/abstracted so they slot in later):

- OTA booking / QR-code onboarding flow
- Activities marketplace
- AI concierge chat
- Room upgrade bidding (PlusGrade-style)
- Multi-PMS / multi-OBE simultaneous support
- Digital check-in / digital key
- Native mobile apps
- Multi-currency, full i18n (we serve AUD + USD to start)
- Points.com / loyalty integration
- Two-way messaging

### Phase 2 (Regional, Q3–Q4 2026)

Add, in priority order:

- Activities marketplace (Viator or Expedia Local Expert integration)
- OTA QR-code onboarding flow
- Room upgrade bidding (PlusGrade if partner integration is quick, otherwise a minimal custom bidding module)
- Personalised recommendations (rules-based first, ML later)
- Two-way guest messaging
- Digital check-in via PMS
- Second and third PMS connectors
- Multi-property admin (hotel groups)
- i18n scaffolding (UI language switching; content translation can lag)

### Phase 3 (Global rollout, 2027)

- Full PMS/OBE connector catalogue (all 23+ partners)
- AI concierge chat (LLM-backed)
- Partner rev-share dashboards
- Points.com / loyalty bidirectional integration
- Native mobile apps (React Native + shared component library from the web monorepo)
- ML-driven upsell targeting
- Multi-currency at scale

### Phase 4 (Optimisation, 2028+)

- Koncie Club membership / loyalty
- Tiered SaaS pricing for hotels (premium features)
- Advanced fraud models
- Partner API for third-party extensions

---

## 5. Step-by-step build sequence with review checkpoints

Target: pilot-ready MVP by early July 2026 for a Q3 2026 Fiji soft launch. That's **~10 weeks** from today (2026-04-23), which is tight. The sequence assumes Pat reviews at each sprint boundary before I start the next one.

### Sprint 0 — Foundation (1 week)
- Monorepo scaffold (pnpm workspaces + Turborepo)
- Next.js 14 App Router app, TypeScript strict mode
- Design system port: shadcn/ui components + Koncie brand tokens (pulled from Lovable file's palette)
- Domain types package scaffold (`Guest`, `Booking`, `Upsell`, `Transaction`)
- CI/CD to Vercel preview; environment split (dev / staging / prod)
- Basic observability (Sentry, Vercel Analytics)
- **Checkpoint review:** repo walkthrough + preview deploy URL. Pat confirms stack choices, naming, repo structure before we build anything user-facing.

### Sprint 1 — Guest Hub skeleton + Auth (2 weeks)
- Koncie Hub Non-User landing page (signed-link-based, booking context loaded)
- Account creation: email verification, magic link option, welcome screen
- Koncie Hub User dashboard shell (empty state with placeholders)
- Prisma schema v1: `Guest`, `Booking`, `Property`, `PartnerIntegration`
- Mock PMS connector seeded with sample bookings
- **Checkpoint review:** clickable preview of full anonymous → signed-up flow using seeded data. Pat reviews copy, UX flow, branding.

### Sprint 2 — Merchant-of-Record payment foundation (2 weeks)
- Payment module built around a `PaymentProvider` port; initial Kovena wrapper (against sandbox)
- Card tokenisation + saved-card UX
- `Transaction` ledger model (splits, MCC 4722 tagging, trust-account reference field)
- Test harness with mocked Kovena responses
- **Checkpoint review:** end-to-end dummy purchase flow, inspected transaction ledger, Pat confirms compliance shape before we plug in real providers.

### Sprint 3 — Flights via Jet Seeker / Kovena Flights (2 weeks)
- `FlightProvider` port + Jet Seeker adapter (sandbox)
- Flight search UI (origin/destination/dates, results, price, select)
- Booking flow with PNR capture, payment collection via MoR layer
- "Kovena Flights" branding variant
- **Checkpoint review:** search + book against sandbox API; we agree timing for switching to production credentials.

### Sprint 4 — Insurance offer (2 weeks)
- `InsuranceProvider` port + one-provider adapter (CoverMore or Allianz sandbox)
- Contextual offer UI triggered by booking destination/dates
- Single-click purchase using saved card
- Policy document generation + delivery (email attach)
- **Checkpoint review:** insurance offer displayed, purchased, policy PDF delivered. This is the highest-margin flow — worth extra review on UX polish here.

### Sprint 5 — Hotel admin portal MVP (1 week)
- Admin login (role-based: hotel_admin)
- Bookings list, upsell activity log, revenue summary
- CSV export of upsell transactions
- Read-only — no action-taking yet
- **Checkpoint review:** walkthrough from a pilot hotel's perspective; Pat or a pilot hotel contact signs off on dashboard usefulness.

### Sprint 6 — Pre-arrival comms (1 week)
- Email send service (SendGrid or Kovena internal)
- SMS send service (Twilio)
- Trigger rules (X days before check-in, on booking confirmation, etc.)
- Template system with variable substitution
- **Checkpoint review:** Pat receives real test emails/SMS; we agree on cadence and content before enabling for pilot.

### Sprint 7 — First live PMS integration (1 week)
- HotelLink or STAAH connector (whichever is pilot partner)
- Webhook booking ingestion
- Signed invite-link generation
- End-to-end test with partner sandbox
- **Checkpoint review:** live booking ingested from partner sandbox, guest flow runs to completion. Partner contact is in the loop.

### Sprint 8 — Pilot hardening (1 week)
- Accessibility audit (WCAG AA pass)
- Mobile-web performance tuning against Pacific-representative network profiles (throttled 3G/slow 4G)
- Bug bash with a small internal test group
- Pilot hotel staff training materials (short PDF + Loom)
- Soft launch with **one** Fiji hotel
- **Checkpoint review:** go/no-go for pilot hotel. We agree on success metrics for the first 30 days of live data.

### Total: ~10 weeks. The critical-path risks are Sprint 3 (depends on Jet Seeker access) and Sprint 7 (depends on pilot partner contract).

---

## 6. Risks, open questions, and assumptions

### Open questions (block execution — need answers before kick-off)

1. **Is the Jet Seeker acquisition closed?** The deck's Phase 1 window is Q3 2025 – Q3 2026 and it's now late April 2026. If the deal isn't closed or production API access isn't wired, Sprint 3 slips or needs a fallback provider. What's the status?
2. **Which PMS partner anchors the MVP pilot** — HotelLink, STAAH, Levart, or ResBook? Picks drive Sprint 7 scope and partner kick-off timing.
3. **Which insurance provider for MVP** — CoverMore, Allianz, or other? Drives Sprint 4 scope; API quality varies wildly.
4. **Which Fiji pilot hotel(s)?** Their tech stack, booking volume, and team tech-readiness drive onboarding effort and success-metric realism.
5. **Does Kovena have an existing payments SDK/API surface** the new Koncie frontend should wrap, or do we build the MoR plumbing from scratch in the new codebase? This materially changes Sprint 2.
6. **Are there existing Kovena or Jet Seeker codebases I should integrate with** vs. greenfield build? A separate codebase under Kovena's main ops is the default assumption, but if there's an existing monorepo to slot into, that changes everything.
7. **Are the full Lovable prototype screens available anywhere** (outside the two files in this workspace)? The index file references 11 routes whose implementations would be useful reference even if we don't port them directly.
8. **Is IATA Lite accreditation required before MVP launch**, or can it lag into Phase 2? The deck treats it as load-bearing for margin ("~1% uplift on ex-AU flights") but doesn't say it's a blocker for shipping.
9. **Brand direction** — the Lovable file uses a generic blue/cyan "Waves" aesthetic. Is there a brand guideline with locked-in logo, colour palette, type system?
10. **Design resource** — is there a designer on this, or should I propose a design direction as part of Sprint 0?

### Risks (likely; mitigation required)

- **Jet Seeker integration overrun** — deck calls this out explicitly. Mitigation: carve out Sprint 3 with a clear swap-in point; fall back to a single direct-API carrier pilot if Jet Seeker isn't ready.
- **Guest adoption** — if the app isn't opened, no revenue. Mitigation: web-first, no download; in-stay QR prompts; hotel-staff training materials shipped in Sprint 8.
- **Pacific mobile performance** — limited bandwidth, older devices. Mitigation: Next.js RSC + edge caching; performance budget enforced in Sprint 8.
- **Payment compliance** — MoR + MCC 4722 + trust accounts is sophisticated; screwing this up is an existential brand risk. Mitigation: get compliance/legal signoff on the Sprint 2 design before we plug in the real gateway; keep a separate trust-account abstraction with the real bookkeeping outside this codebase.
- **Partner contract timing** — pilot PMS and insurance contracts may not close in time for the relevant sprint. Mitigation: start paper concurrent with Sprint 0; mocked adapters let us build against fake providers until real credentials land.
- **Brand collision** with Kovena's core business — "Koncie by Kovena" cobrand option from the deck is probably right; MVP shouldn't decide the final brand architecture.
- **Competitor response** — Canary or Duve could paper the flight/insurance gap via partnership mid-pilot. Mitigation: speed, payments moat. No code change required; more a comms/PR consideration.

### Assumptions (explicit so you can correct)

- MVP is **web-first**, no native app required for pilot.
- **Next.js + TypeScript + Tailwind + shadcn/ui** is acceptable to Kovena engineering (it extends, rather than replaces, the Lovable stack).
- **Postgres + Prisma** is acceptable. (Alternatives: Planetscale/MySQL, DynamoDB. Postgres has the fewest sharp edges for this shape of app.)
- **Vercel + Cloudflare** deployment is acceptable. (Alternatives: AWS Amplify, Cloudflare Pages, self-hosted on AWS.)
- **AU (Sydney) region** is acceptable primary region given Pacific pilot.
- **10-week MVP target is ambitious but not impossible** if answers to the open questions land in week 1.
- **Kovena carries the MoR trust account** outside of this codebase; Koncie references it but doesn't own the ledger of record.
- **IATA code in the deck ("123 456") is a placeholder**; real accreditation status is TBD.
- **Revenue-share terms with PMS/OBE partners and hotels are commercial-side work**; the codebase models the splits as config, not hard-coded.
- **Design system work happens in parallel** with Sprint 0/1 — no dedicated design sprint planned, but this may need revision depending on brand direction.

---

## 7. Suggested folder structure

Monorepo (pnpm workspaces + Turborepo). Apps for user-facing surfaces, packages for shared code, services for long-running workers.

```
koncie/
├── apps/
│   ├── web/                    # Next.js 14 App Router — guest + admin + partner surfaces
│   │   ├── app/
│   │   │   ├── (guest)/        # route group: guest-facing pages
│   │   │   │   ├── hub/
│   │   │   │   ├── flights/
│   │   │   │   ├── insurance/
│   │   │   │   ├── activities/
│   │   │   │   └── checkout/
│   │   │   ├── (admin)/        # route group: hotel admin portal
│   │   │   │   ├── dashboard/
│   │   │   │   ├── bookings/
│   │   │   │   └── reports/
│   │   │   ├── (partner)/      # route group: PMS/OBE partner view (Phase 2+)
│   │   │   ├── (auth)/         # sign-in, sign-up, verify
│   │   │   ├── api/            # Next.js API routes
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   └── public/
│   └── marketing/              # (optional, Phase 2) public marketing site
├── packages/
│   ├── ui/                     # shared shadcn/ui-based component library
│   ├── brand/                  # design tokens, Tailwind preset, logo assets
│   ├── db/                     # Prisma schema, migrations, typed client
│   ├── config/                 # shared TS, ESLint, Prettier configs
│   ├── types/                  # shared domain types (Guest, Booking, Upsell, Transaction)
│   ├── payments/               # PaymentProvider port + Kovena adapter + MoR helpers
│   ├── providers/
│   │   ├── flights/            # FlightProvider port + Jet Seeker adapter
│   │   ├── insurance/          # InsuranceProvider port + partner adapters
│   │   ├── activities/         # ActivityProvider port + partner adapters (Phase 2)
│   │   └── pms/                # PMSConnector port + HotelLink, STAAH, Levart adapters
│   └── testing/                # shared test helpers, fakes, fixtures
├── services/
│   ├── booking-ingest/         # webhook handler for PMS booking events
│   ├── notifications/          # email + SMS worker (SendGrid + Twilio)
│   └── reporting/              # nightly aggregation jobs for admin dashboards
├── docs/
│   ├── architecture.md
│   ├── brand.md
│   ├── partner-integrations/   # one doc per PMS/OBE/insurance/flight partner
│   └── compliance/             # MoR, MCC 4722, IATA Lite, ATAS notes
├── infra/                      # IaC — Terraform or Pulumi (probably just Vercel/CF config for MVP)
├── .github/
│   └── workflows/              # CI pipelines
├── CLAUDE.md                   # Claude Code project memory / repo instructions
├── package.json                # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

### Why this shape

- **Apps vs. packages vs. services** split keeps UI code separate from domain logic and long-running work, which is how this scales if the admin portal, partner portal, or native app split out later.
- **Provider ports in `packages/providers/*`** means swapping Jet Seeker for a different flight provider, or adding a new PMS, is a new adapter — not a rewrite.
- **`packages/brand/`** ensures the design system is a first-class concern and gets shared with the eventual native app.
- **`docs/partner-integrations/`** is a forcing function for capturing the commercial + technical terms of each partner in one place — critical because the partnership structure is non-trivial and changes over time.
- **`CLAUDE.md` at the root** gives Claude Code (or any AI coding assistant) durable project memory so conventions don't drift.

---

## 8. What happens next

Nothing in this plan is locked. On your approval, I'd proceed in this order:

1. You answer the open questions in Section 6 (or flag which ones you'd like to defer).
2. I lock Sprint 0 scope and we create the Claude Code project repo.
3. First checkpoint at end of Sprint 0 — you approve the foundation before I start building user-facing surfaces.

No code has been written. No existing files have been modified.

---

**Files created by this session:**

- `Koncie/Planning/2026-04-23-koncie-prototype-plan.md` (this file)

**Files read, not modified:**

- `Koncie/Koncie Board Presentation (DRAFT) (4).docx`
- `Koncie/Loveable Koncie Prototype.tsx`
