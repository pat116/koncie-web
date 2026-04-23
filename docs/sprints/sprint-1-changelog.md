# Sprint 1 Changelog

**Spec:** `docs/specs/2026-04-23-sprint-1-design.md`
**Plan:** `docs/plans/2026-04-23-sprint-1-plan.md`
**Shipped:** 2026-04-23 (single-day sprint execution)
**Branch:** `sprint-1` → PR against `main`

## What shipped

The full `anonymous → signed-in guest` flow works end-to-end against seeded data, both locally (`pnpm --filter @koncie/web dev`) and on the Vercel preview (`https://koncie-web-git-sprint-1-pat-3409s-projects.vercel.app`).

### Data layer
- Prisma schema v1: `Guest`, `Property`, `PartnerIntegration`, `Booking`
- Initial migration applied to Supabase (Singapore, ap-southeast-1)
- Prisma singleton client at `apps/web/src/lib/db/prisma.ts`

### Auth + identity
- `KONCIE_SIGNED_LINK_SECRET`-signed JWT magic link (HS256) for the non-user entry point — carries `{ bookingId, guestEmail, exp }`
- `@supabase/ssr` server + browser + middleware clients, with `setAll` callbacks explicitly typed for strict `noImplicitAny`
- `/auth/callback` handles both PKCE `?code` and OTP `?token_hash` flows
- `linkGuestToAuthUser` helper — idempotent, preserves first-claim timestamp
- Resend wired into Supabase Auth SMTP; sender `Koncie <onboarding@resend.dev>` (sandbox)

### UI
- `/welcome?token=...` — personalized non-user landing with booking summary + three preview cards
- `/register` — "check your email" state after firing Supabase OTP
- `/hub` — booking hero card, three "plan your trip" stubs, bottom nav
- `/hub/trip` — booking detail page
- `/hub/profile` — email + sign-out
- `apps/web/src/app/{not-found,error,global-error}.tsx` — Koncie-branded replacements for Next.js defaults

### Adapters + seed
- `PartnerAdapter` port in `@koncie/types`
- `HotelLinkMockAdapter` implementing it from the DB (Sprint 7 swaps to a real HTTP implementation)
- `prisma/seed.ts` — idempotent hard-reset + prints a ready-to-click Koncie-signed magic link. `KONCIE_SEED_EMAIL` env var overrides the demo email for local dev.

### Tests
- 7 Vitest unit tests passing (4 signed-link JWT + 3 guest-linking)
- `pnpm test` wired in CI

### Infrastructure
- Vercel env vars (8): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KONCIE_SIGNED_LINK_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL` — set for Production + Preview
- `turbo.json` `globalEnv` passes the new vars through to the Next build
- `apps/web/package.json` `build` script runs `prisma generate && next build`; `postinstall` also runs `prisma generate` belt-and-braces

### Docs
- `docs/specs/2026-04-23-sprint-1-design.md` (this sprint's spec, already shipped with the plan commit)
- `docs/plans/2026-04-23-sprint-1-plan.md` (38-task implementation plan)
- `docs/architecture.md` (stack + topology reference)
- `docs/data-model.md` (Prisma schema reference)
- `docs/glossary.md` (terms: MoR, MCC 4722, PMS, OBE, two magic links, etc.)
- `docs/auth.md` (the two-hop flow with step-by-step sequence + security notes)
- `docs/sprints/sprint-1-changelog.md` (this file)

## Deferred, with rationale

| Task in plan | Why not this sprint | When |
|---|---|---|
| **Task 16** — shadcn button + card install | YAGNI — welcome/hub use vanilla Tailwind divs; no component needed the shadcn primitives | When we hit a component that needs them (Sprint 2 payment forms are likely first) |
| **Task 19** — React Email template (`@react-email/components`) | Supabase's inline HTML template works adequately for the single Sprint 1 email type; full template system isn't load-bearing until richer comms | Sprint 6 (pre-arrival comms) |
| **Task 28** — Prisma integration tests via `@testcontainers/postgresql` | Requires Docker Desktop on Pat's Windows PC; not yet installed; the unit tests cover the critical logic (JWT encode/decode, Guest-linking idempotency) | When Docker Desktop is available OR Sprint 2 when MoR Transaction queries warrant real DB coverage |
| **Task 29** — Playwright E2E happy path | Coordinating Playwright with real Supabase OTP delivery is ~2hrs on its own and would have flaky CI runs without a mock OTP pathway; unit tests + manual verification of the preview URL cover Sprint 1's critical paths | Sprint 2 when we have more flows worth protecting |

## Bugs caught during Sprint 1 execution (now fixed)

Worth remembering because they'd bite again otherwise:
- **pnpm lockfile must be committed on first push** — otherwise Vercel resolves every package from scratch and flakes on `ERR_PNPM_META_FETCH_FAIL`
- **Next.js with `src/` directory looks for `src/instrumentation.ts`, not `instrumentation.ts`** — Sentry was silently never initializing
- **Supabase `DATABASE_URL` uses pooler hostname + tenant-prefixed user `postgres.<ref>` on port 6543; `DIRECT_URL` uses direct host `db.<ref>.supabase.co` with plain `postgres` on port 5432** — mixing them up produces `FATAL: Tenant or user not found`
- **Supabase's pooler hostname number varies per project** — ours is `aws-1-ap-southeast-1`, not the common `aws-0`. Always copy from the Connect modal, don't assume
- **Avoid `/` and `+` in JWT secret values** — base64 with slashes causes JWT verify to fail in our setup (`openssl rand -hex 32` is safe; `openssl rand -base64 32` was not)
- **Prisma seed should hard-reset on every run** — upsert leaves orphan rows when rotating `KONCIE_SEED_EMAIL`, breaking the signed-link email-match check
- **Turbo 2.x requires env vars in `globalEnv` to pass them to the build command** — Vercel env vars alone aren't enough
- **Prisma client isn't generated automatically on Vercel** — `prisma generate` must be explicit in the `build` script
- **TypeScript strict mode with `noUncheckedIndexedAccess`** catches `arr[0]` as `T | undefined` that Next.js dev mode lets slide — add explicit narrowing
- **`@supabase/ssr` `setAll(cookiesToSet)` callback needs explicit parameter type annotation** under strict `noImplicitAny`
- **Supabase free-tier shared SMTP rate-limits at 3 emails/hour** — custom SMTP via Resend lifts that to 30/hour
- **Supabase's default "Confirm Signup" email redirects via `/auth/v1/verify?token_hash=…&type=signup`** — our callback must handle OTP flow via `verifyOtp`, not just `exchangeCodeForSession`

## Next sprint

Sprint 2 — Merchant-of-Record payment foundation. See `docs/plan.md` §5.

Pre-sprint-2 housekeeping that's NOT blocking:
- Docker Desktop install on dev machine (enables integration tests)
- Verified Resend sending domain for `koncie.app` or `kovena.com` (lets us send to any email, not just `pat@kovena.com`)
- Separate Preview Supabase project (currently Preview + Dev share one DB)
