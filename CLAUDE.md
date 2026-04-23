# Koncie Web — Repo Instructions for Claude Code

This file is read automatically at the start of every Claude Code session in this repo. It is the operating contract for all AI-assisted work.

## What this repo is

This repo implements **Koncie** — a unified member/account area that sits on top of two Kovena-owned products:

- **Jet Seeker** (Kovena's flights OTA, user-acquired via meta-search partners like Skyscanner)
- **HotelLink** (Kovena's PMS, powering direct hotel bookings for 30,000+ accommodation partners)

Koncie provides a shared identity, a unified trip itinerary, and an ancillary storefront (travel insurance, activities, on-property upsells) layered on top of both. It acts as the Merchant of Record for all ancillary transactions under MCC 4722. It does **not** process flight or room booking transactions — those stay inside Jet Seeker and HotelLink respectively.

The full plan lives in `docs/plan.md` and the clarifications addendum in `docs/plan-addendum.md`. Read both before touching code.

## Non-negotiables

1. **Koncie is the Merchant of Record for ancillaries only.** Room bookings flow through HotelLink; flight bookings flow through Jet Seeker. Koncie never touches those primary transactions.
2. **Every ancillary transaction is processed under MCC 4722** and references a trust-account ledger entry. The trust-account ledger of record lives outside this repo (Kovena's payments system); Koncie references it but does not own it.
3. **Partner-first distribution.** The codebase must not hard-code a single PMS, flight provider, or insurance provider. Every external integration is a port with adapters.
4. **Web-first.** The pilot ships as a responsive web app with no native download required. PWA install is acceptable; native apps are deferred to Phase 3.
5. **Pacific mobile performance is a first-class constraint.** Pilot users are on 4G in Fiji, Cook Islands, Vanuatu. Performance budget: LCP under 2.5s on a throttled 4G profile, JS bundle under 200KB compressed on the critical path.
6. **Accessibility ≥ WCAG AA** for all guest-facing surfaces. Not optional.
7. **Compliance takes precedence over ergonomics.** If a commercial or compliance constraint conflicts with the cleanest technical implementation, the constraint wins. Flag it and ask.
8. **Consumer-facing attribution uses "Powered by [Provider]".** Every third-party or subsidiary integration surfaced to the guest carries a "Powered by ..." label — e.g. "Powered by JetSeeker" on flights, "Powered by CoverMore" on insurance, "Powered by Viator" on activities. The convention is already established in the Lovable prototype at `https://koncierge-portal-mockup.lovable.app`. Do not hide source provenance from guests.

## How to work in this repo

### Sprint-by-sprint execution

The plan (`docs/plan.md`, Section 5) lays out 9 sprints (Sprint 0 through Sprint 8). **Work one sprint at a time.** Do not start the next sprint until Pat has reviewed the previous one.

For each sprint:

1. Start in **plan mode** (Shift+Tab twice). Propose the work, acceptance criteria, and the concrete tasks you'll do. Wait for Pat's approval.
2. Execute with **TodoWrite** tracking — one todo per deliverable in the sprint brief.
3. Use **Task subagents** for parallelisable work within a sprint (e.g., provider adapter in one subagent, UI flow in another).
4. Open a **PR per sprint** (not per commit). Each PR body links the sprint brief and summarises acceptance against it.
5. At the end of each sprint, run `/review`, then surface a checkpoint summary to Pat with the Vercel preview URL and the specific questions you need answered before starting the next sprint.

### Current sprint

The active sprint at time of writing is **Sprint 0** — see `docs/sprint-0-brief.md`. Start there on first session.

### Branch hygiene

- `main` → trunk, always deployable, auto-deploys to staging
- One feature branch per sprint: `sprint-0/foundation`, `sprint-1/hub-and-auth`, etc.
- Squash-merge PRs into main. Conventional commit messages on the squash commit (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Do not push force to `main` ever. Do not push force to a feature branch without flagging it.

### Testing

- Write tests for provider adapters (Jet Seeker, HotelLink, Kovena payments, insurance) before the implementation. Adapters are the most likely place for external-system drift, and TDD helps keep them honest.
- Critical guest flows (sign up, itinerary render, ancillary purchase end-to-end) get Playwright tests before we call the sprint done.
- Unit tests on pure domain logic (splits calculation, offer targeting, trust-account reference formatting).
- Internal utilities and UI presentation components don't need tests unless they have non-trivial logic.

### Environment

- Node 20+
- pnpm (not npm, not yarn)
- Monorepo via Turborepo
- Postgres 15+ (Supabase or AWS RDS, decision deferred to Sprint 0 checkpoint)
- Deployment: Vercel (web app) + Cloudflare (edge cache, AU/Pacific POPs)

Three environments: `dev` (local), `staging` (auto-deploy from main), `production` (manual promote from staging). No code ever ships to production without a manual promote.

### Secrets

- Never commit secrets.
- Use Vercel environment variables for staging and production.
- Use a `.env.local` (gitignored) for dev.
- When a secret is needed and not available, **stop and ask Pat** — don't invent placeholder credentials or commit a `.env.example` with real-looking values.

## Tech stack (locked for Sprint 0)

- **Framework:** Next.js 14 (App Router), TypeScript strict mode
- **Styling:** Tailwind CSS + shadcn/ui components
- **Icons:** lucide-react
- **Data:** Postgres + Prisma
- **API layer:** tRPC for client-server typed contracts; Next.js Server Actions for simple mutations
- **Auth:** Clerk for MVP (deferred full SSO with Jet Seeker + HotelLink to Phase 2)
- **Email:** Resend
- **SMS:** Twilio
- **Observability:** Sentry + Vercel Analytics
- **Testing:** Vitest (unit), Playwright (e2e)

If any of these needs to change, flag it at the Sprint 0 checkpoint and get explicit approval before deviating.

## Known integrations

MVP scope (Sprint 3–4, 7):

- **Jet Seeker** — flight itinerary ingestion (read-only for MVP). Stack: Symfony/PHP + PostgreSQL/Doctrine + Amadeus (SOAP) + FatZebra payments + HubSpot CRM, on GitLab. Jet Seeker does *not* run on Kovena payments — its flight transactions stay inside Jet Seeker via FatZebra. Recommended MVP ingestion: add a thin Symfony webhook on Jet Seeker that POSTs booking completions (the `Order` row: email + JSONB itinerary) to a Koncie endpoint. Do not read Jet Seeker's database directly. Consumer-facing flight surfaces inside Koncie stay Jet Seeker-branded ("Koncie Flights Powered by JetSeeker").
- **HotelLink** — hotel booking ingestion, confirmation-page embed for Koncie invites. Kovena-owned, so webhook/API changes are in-house. Build in whatever webhook shape Koncie needs rather than working around what exists.
- **Kovena payments** — MoR transaction processing for ancillaries. **For the prototype/demo MVP, this is greenfield** — no production Kovena SDK wiring required. Treat payment processing as a stubbed port for demo purposes and wire real Kovena payments in Phase 2.
- **Insurance provider** — **CoverMore** (confirmed). API shape and commercial terms TBD in Sprint 4 planning.

Later phases (do not build in MVP):

- Additional PMS/OBE partners (STAAH, Levart, Opera, Abode, ResBook)
- Activities marketplace (Viator, Expedia Local Expert)
- PlusGrade upgrade bidding
- Native apps

## Folder structure (scaffold in Sprint 0)

```
koncie-web/
├── apps/web/                    # Next.js app
├── packages/
│   ├── ui/                      # shared component library
│   ├── brand/                   # design tokens
│   ├── db/                      # Prisma schema + client
│   ├── types/                   # shared domain types
│   ├── payments/                # Kovena MoR wrapper
│   └── providers/
│       ├── flights/             # Jet Seeker adapter
│       ├── insurance/           # provider adapter
│       └── pms/                 # HotelLink adapter
├── services/
│   ├── booking-ingest/          # webhook handler
│   └── notifications/           # email + SMS worker
├── docs/
│   ├── plan.md                  # full plan
│   ├── plan-addendum.md         # clarifications
│   └── sprint-*-brief.md        # per-sprint briefs
├── infra/                       # IaC as we need it
├── CLAUDE.md                    # this file
└── README.md
```

## Things that are explicitly not in Claude Code's remit

- Contract negotiations with insurance providers, PMS partners, or insurers
- Pricing or revenue-share terms
- Brand direction (logo, colours, tone) — Claude can propose placeholders but final direction needs Pat's sign-off
- Legal/compliance sign-off on MoR structure, trust accounts, or AFTA/IATA accreditation
- Anything that requires human judgement about Kovena's business relationships

When any of these come up: flag to Pat and wait. Don't paper over.

## Getting unstuck

If you hit something ambiguous mid-sprint:

1. Re-read `docs/plan.md` and `docs/plan-addendum.md` first.
2. If still ambiguous, stop work, articulate the ambiguity precisely, and ask Pat. Don't guess and build — it wastes the review cycle.
3. If the ambiguity is about the mechanical tech choice (framework API, library version), make the reasonable default and note it in the PR description.
4. If the ambiguity is about product behaviour, user experience, or commercial logic, always stop and ask.

Sprint 0 starts now. First prompt: `execute the tasks in docs/sprint-0-brief.md in plan mode, stop at the checkpoint.`
