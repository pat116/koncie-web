# Sprint 1 Design — Guest Hub skeleton + Auth

**Status:** Spec — awaiting Pat's review
**Date:** 2026-04-23
**Sprint:** 1 (reference: `docs/plan.md` §5 — "Sprint 1 — Guest Hub skeleton + Auth")
**Author:** Claude (via brainstorming session with Pat)

## TL;DR

Sprint 1 adds the first guest-facing surface to Koncie. A seeded HotelLink booking is delivered via a signed magic link; the guest lands on a personalised preview page, creates a Koncie account via email magic link, and reaches a hub dashboard showing their booking + "coming soon" slots for activities, insurance, and flights. Data is stored in Supabase Postgres via Prisma; auth is Supabase Auth; email delivery is Resend.

## Goals

1. A clickable `anonymous → signed-in` flow using seeded Namotu data end-to-end on the staging URL.
2. A real Prisma schema for `Guest`, `Booking`, `Property`, `PartnerIntegration` that Sprint 2+ can extend without rework.
3. A `PartnerAdapter` abstraction that the mock HotelLink connector implements now and the real Sprint 7 connector will drop into without touching app code.
4. Magic-link auth via Supabase + Resend that feels like Koncie, not like a Supabase-branded default.
5. Koncie-branded error pages (404, 500, signed-link-expired) replacing Next.js defaults.

## Non-goals

- Payments, transactions, MoR plumbing → Sprint 2
- Flight search, JetSeeker integration → Sprint 3
- Insurance offer, CoverMore integration → Sprint 4
- Hotel admin portal → Sprint 5
- Pre-arrival comms, SMS via Twilio → Sprint 6
- Real HotelLink webhook ingestion → Sprint 7
- Social login (Google, Apple), password auth, account deletion self-service → Phase 2
- Visual regression, load testing, accessibility audits → Phase 2

## Architecture

**Data layer.** Supabase Postgres (`ap-southeast-2`), accessed by Prisma 5 from server components and route handlers. Schema at `apps/web/prisma/schema.prisma`. Migrations run locally via `pnpm prisma migrate dev` and in Vercel's build step via `prisma migrate deploy`.

**Auth layer.** Supabase Auth for email magic links. `@supabase/ssr` on the Next.js side manages cookie-based sessions compatible with server components. The `Guest` row holds profile data; Supabase's `auth.users` holds the credential. They link via `guest.auth_user_id = auth.users.id`.

**Email.** Resend as the SMTP sender, configured via Supabase Auth's SMTP override. Magic link emails ship from `noreply@koncie.app` with a Koncie-branded HTML template: sand background, navy header with wordmark, navy CTA button, Poppins (web-safe fallback), signoff `— The Koncie team`. Template lives at `apps/web/src/email/templates/magic-link.tsx` and renders to HTML at build time via `@react-email/render`.

**Deployment topology.** Three env scopes: Production (main), Preview (every PR), Development (local). Production points at a separate Supabase project from Preview/Dev so pilot data is never contaminated by test writes. Prisma connection string is per-env.

**Stack versions** (unchanged from Sprint 0): Next.js 14.2, React 18.3, TypeScript 5.7, Tailwind 3.4, Node 20, pnpm 10.

## Domain model (Prisma schema v1)

Four entities. Fields below capture the minimum for Sprint 1 — Sprint 2+ will add columns as needed.

### Guest
| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `email` | text | unique |
| `first_name` | text | |
| `last_name` | text | |
| `auth_user_id` | uuid (fk, nullable) | references `auth.users.id`; null until the guest claims the account |
| `claimed_at` | timestamptz (nullable) | set when `auth_user_id` is first populated |
| `created_at`, `updated_at` | timestamptz | |

### Property
| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `slug` | text | unique, e.g. `namotu-island-fiji` |
| `name` | text | |
| `country` | text | ISO 3166-1 alpha-2 |
| `region` | text | free-form, e.g. `Fiji` |
| `timezone` | text | IANA, e.g. `Pacific/Fiji` |
| `partner_integration_id` | uuid (fk) | |
| `created_at`, `updated_at` | timestamptz | |

### PartnerIntegration
| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `type` | enum | `HOTELLINK`, plus stubs `SITEMINDER`, `OPERA` for future |
| `name` | text | e.g. `HotelLink — Namotu pilot` |
| `config` | jsonb | per-partner credentials + webhook secrets; shape validated at the adapter boundary in TypeScript |
| `created_at`, `updated_at` | timestamptz | |

### Booking
| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk) | |
| `property_id` | uuid (fk) | |
| `external_ref` | text | unique; the HotelLink booking ID |
| `check_in`, `check_out` | date | |
| `num_guests` | int | |
| `status` | enum | `CONFIRMED`, `CANCELLED`, `COMPLETED` |
| `created_at`, `updated_at` | timestamptz | |

### Relationships

- `Guest 1:M Booking`
- `Property 1:M Booking`
- `PartnerIntegration 1:M Property`
- `Guest 0..1:1 auth.users` (via `auth_user_id`, nullable until claim)

### Intentionally deferred entities

`Upsell`, `Transaction`, `FlightBooking`, `InsurancePolicy`, `Message` — added in the sprint where their code lives, to avoid migrations we'd regret.

## Guest journey UX

Three mobile-first screens. Desktop scale-ups are grid/column variants, no novel layouts.

### Screen 1 — Non-user landing (`/welcome?token=...`)

Personalised preview. Header with Koncie wordmark; hero greeting (`Hi Jane ✨`) with booking summary card (`7-night stay · 2 guests · Namotu Island Fiji · ref HL-84321-NMT`); three preview cards (`Activities at the resort`, `Travel protection`, `Flight add-ons · Powered by JetSeeker`) with stubbed icon + one-line description; primary CTA `Create your Koncie account`; secondary link `Already have one? Sign in`.

### Screen 2 — Register + verify (`/register`)

Reached after CTA click. No email input — we already have the email from the signed link, so we fire the magic link immediately and render a "check your email" confirmation state with: step indicator (`Step 2 of 2`), email icon, headline (`Check your email`), email address shown in bold (`jane@example.com`), three-step next-steps card, `resend the link` secondary action, `change it` link for wrong-email recovery.

### Screen 3 — Hub dashboard (`/hub`)

Reached after magic-link callback. Header with wordmark + avatar; navy hero booking card (`YOUR UPCOMING TRIP · Namotu Island Fiji · 14–21 July 2026 · 2 guests · View details · in 82 days`); three stubbed section cards under `PLAN YOUR TRIP` (`Activities · Available from 14 July`, `Travel protection · Coming soon`, `Flight add-ons · Coming soon · via JetSeeker`); bottom nav with four items.

**Bottom nav behaviour in Sprint 1:**
- **Home** (`/hub`) — this screen.
- **Trip** (`/hub/trip`) — booking detail view; Sprint 1 ships a simple read-only detail page with check-in/out, room count, external_ref, "contact your host" link.
- **Messages** (`/hub/messages`) — disabled visual state (greyed, no tap target), tooltip `Available closer to your trip`. Real messaging lands in Sprint 6.
- **Profile** (`/hub/profile`) — email + `Sign out` button + "account deletion? contact us" link. Nothing else until Phase 2.

## Auth + signed link flow

### Seed-to-hub sequence

1. **Seed runs.** Creates `PartnerIntegration` (HotelLink), `Property` (Namotu), `Guest` (`first_name: 'Jane'`, `last_name: 'Demo'`, `email: 'demo@koncie.app'`, `auth_user_id = null`), `Booking` (14–21 July 2026, `external_ref = HL-84321-NMT`). Prints pre-signed magic link URL to stdout. The mockup greeting `Hi Jane ✨` and subsequent UI copy reference this seeded first name.

2. **Signed link URL.** `https://koncie-web.vercel.app/welcome?token=<JWT>`. JWT payload = `{ booking_id, guest_email, exp: now + 7d }`, signed HS256 with `KONCIE_SIGNED_LINK_SECRET`. This is Koncie's own signing key, distinct from Supabase's magic-link secret.

3. **Landing verification.** `/welcome` server component verifies JWT signature + expiry → looks up `Booking` by `booking_id` → confirms `booking.guest.email === payload.guest_email`. Any failure renders a neutral `This link has expired, please contact your host` page (no leakage of which check failed).

4. **CTA click → magic link request.** Server action calls `supabase.auth.signInWithOtp({ email: guest.email, options: { emailRedirectTo: '/auth/callback' } })`. Supabase's email template is overridden to route via Resend. Renders the "check your email" screen.

5. **Magic link callback.** Guest clicks link in email → lands on `/auth/callback?code=<supabase-code>`. Route handler uses `@supabase/ssr` to exchange the code for a session cookie, reads `session.user.email`, updates `Guest` row (`SET auth_user_id = session.user.id, claimed_at = now() WHERE email = session.user.email`), redirects to `/hub`.

6. **Hub load.** `/hub` server component reads session → Prisma lookup of `Guest` joined to `Booking` joined to `Property` → renders screen 3.

### Edge cases handled

| Case | Behaviour |
|---|---|
| Expired signed link (JWT past `exp`) | Neutral error page, Sentry level `info` |
| Bad signature / tampered token | Same neutral error page, Sentry level `warning` |
| Guest already has `auth_user_id` set | `/welcome` renders a "welcome back, sign in to continue" variant that fires the magic link directly (skips the "Create your Koncie account" CTA) |
| Session expires mid-session | Supabase middleware auto-refreshes via refresh token; if refresh fails, redirect to `/welcome` |
| Email mismatch on callback (forwarded link) | Callback handler finds no matching `Guest`; renders `we couldn't find a matching booking` |

### Edge cases deferred

Social login, SMS auth, password auth, account-deletion self-service.

## Mock HotelLink connector

`PartnerAdapter` interface (at `packages/types/src/partner-adapter.ts`) with methods:

```ts
interface PartnerAdapter {
  listBookings(propertyId: string): Promise<ExternalBooking[]>;
  getBooking(externalRef: string): Promise<ExternalBooking | null>;
  onWebhook(payload: unknown): Promise<WebhookResult>;
}
```

Sprint 1 implementation: `apps/web/src/adapters/hotellink-mock.ts` — DB-backed fake that reads from the seeded Booking rows and simulates HotelLink's payload shape. Sprint 7 replaces this file with a real HotelLink adapter hitting their HTTPS API; nothing else in the app changes.

`Booking.external_ref` is the idempotency key for both the seed script and future real webhooks.

## Seed script

Location: `apps/web/prisma/seed.ts`. Invoked via `pnpm prisma db seed`.

Idempotent upserts keyed on:
- `Guest.email`
- `Property.slug`
- `Booking.external_ref`
- `PartnerIntegration.name`

Running twice produces no duplicates.

Env guardrails:
- Always runs in local dev.
- Runs once per deployment on Preview env via a `prisma migrate deploy`-hook wrapper.
- Hard-throws if `VERCEL_ENV === 'production'` — pilot data integrity depends on this.

Outputs a ready-to-click signed magic link URL to stdout on every run.

## Error handling

Four typed error classes, all routed to Sentry via the Sprint 0 instrumentation:

| Class | Trigger | User-facing result | Sentry level |
|---|---|---|---|
| `SignedLinkError` | Expired / bad signature / email mismatch | Neutral "link expired" page | `info` |
| `BookingNotFoundError` | DB lookup miss after JWT verified | Generic fallback page | `warning` |
| `AuthSessionError` | Middleware-level session failure | Redirect to `/welcome` | `warning` |
| `DatabaseUnavailableError` | Prisma connection failure | "Try again" page | `error` |

App-level error pages:
- `apps/web/src/app/not-found.tsx` — Koncie-branded 404
- `apps/web/src/app/error.tsx` — Koncie-branded 500 (client-side error boundary)
- `apps/web/src/app/global-error.tsx` — resolves the Sprint 0 Sentry warning about missing global error handler; also Koncie-branded

## Test strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | JWT encode/decode, seed upsert logic, guest → auth-user linking helper |
| Integration | Vitest + `@testcontainers/postgres` | Prisma queries against an ephemeral Postgres |
| E2E | Playwright | One spec: the full happy path (seeded link → landing → register → callback → hub shows booking) |
| Smoke | existing | Sprint 0's wordmark + `/api/health` + `/api/test-error` tests still pass |

CI additions to `.github/workflows/ci.yml`: `pnpm test` runs unit + integration on every PR; a separate `e2e` matrix job runs Playwright against the Preview URL once it's deployed. No coverage threshold — tests exist where they earn their keep.

## Documentation deliverables

Per the docs framework agreed during brainstorming:

**Tier 1 (this sprint):**
- `docs/specs/2026-04-23-sprint-1-design.md` — this document
- `docs/sprints/sprint-1-changelog.md` — created when the sprint ships

**Tier 2 (new, this sprint):**
- `docs/architecture.md` — system shape, stack, deployment topology
- `docs/data-model.md` — Prisma schema reference with field-level notes
- `docs/glossary.md` — MoR, MCC 4722, PMS, OBE, "guest hub", signed link, magic link, claimed account
- `docs/auth.md` — the two-hop auth flow (Koncie signed link → Supabase magic link) with sequence diagrams

## Acceptance criteria

Sprint 1 is done when all of the following are true on the Vercel staging URL:

1. `pnpm install && pnpm prisma migrate dev && pnpm prisma db seed && pnpm dev` from a clean clone works on a Node 20 + pnpm 10 machine.
2. `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass with zero errors/warnings.
3. The seed script prints a signed magic link URL; clicking it on staging renders the personalised Screen 1 for the demo Namotu booking.
4. Clicking "Create your Koncie account" delivers a Resend-routed, Koncie-branded magic link email to the configured address within 30 seconds.
5. Clicking the magic link in email completes `/auth/callback`, sets `auth_user_id` on the `Guest` row, and lands on `/hub`.
6. `/hub` renders the booking hero card with real seeded data plus the three stubbed section cards.
7. Tampering with the signed-link JWT (change a character, expire the `exp` claim) renders the neutral error page rather than leaking which check failed.
8. `/api/health` still returns ok and `/api/test-error` still reaches Sentry (no Sprint 0 regression).
9. The Playwright E2E spec passes end-to-end.
10. All Tier 1 and Tier 2 docs listed above exist and are committed.
11. Sprint 1 PR is open and ready for Pat's review.

## Dependencies

- Supabase project must be provisioned in both Production and Preview scopes. If not already done, this is the first setup step of implementation.
- Resend account + verified sending domain (`koncie.app`). Sending domain verification can lag behind code — Resend's sandbox mode works against a single verified recipient while DNS propagates.
- Vercel env vars to add: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KONCIE_SIGNED_LINK_SECRET`, `RESEND_API_KEY`.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Resend sending domain DNS propagation delays the magic-link demo | medium | Fall back to Resend sandbox mode with `demo@koncie.app` as the only permitted recipient until DNS is live |
| Supabase email template override is finicky with Resend SMTP | medium | Budget a half-day specifically for this; fall back to Supabase's built-in email sender if blocker persists, and migrate to Resend in Sprint 6 |
| Prisma migrations on Vercel build step flake | low | `prisma migrate deploy` is idempotent; if a deploy fails the app is still on the previous schema |
| `@testcontainers/postgres` on CI slow / flaky | medium | Allow integration test job to be advisory (non-blocking) on first setup; tighten to blocking after 3 green runs |
| Seed script accidentally runs in Production | low but catastrophic | Explicit `VERCEL_ENV === 'production'` guard that throws; add to PR review checklist |

## Open questions deferred to implementation

- **Supabase project split** — do we create a dedicated `koncie-preview` Supabase project today, or share with Production until the pilot launches? My lean: dedicated from day one. Cheap insurance.
- **Email domain** — `koncie.app` vs `koncie.kovena.com` vs other. Assuming `koncie.app` in this spec; confirm before Resend setup.
- **`demo@koncie.app` inbox** — does one exist? If not, we'll set up a forwarding address so Pat can receive the demo magic link during staging verification.
