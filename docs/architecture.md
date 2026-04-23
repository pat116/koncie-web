# Architecture

Koncie's shape as of Sprint 1. Update this file when the stack or topology changes.

## Overview

Koncie is a Next.js 14 App Router application deployed on Vercel. Postgres data lives in Supabase, accessed via Prisma. Auth is Supabase Auth with Resend handling email delivery. Sentry captures runtime errors; Vercel Analytics captures traffic.

## Services

| Service | Purpose | Env vars |
|---|---|---|
| Vercel | Hosting, builds, CDN, preview deployments | platform-managed |
| Supabase | Postgres DB + Auth (magic-link flow) | `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Resend | Magic-link email delivery (configured as Supabase Auth's custom SMTP) | `RESEND_API_KEY` |
| Sentry | Error reporting | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` |

## Deployment topology

- **Production** — `main` branch auto-deploys to `koncie-web.vercel.app`. Serves pilot traffic (once live).
- **Preview** — every PR and every push to `sprint-*` branches gets a preview URL at `koncie-web-git-<branch>-pat-3409s-projects.vercel.app`.
- **Development** — local. Each developer runs against the single shared Supabase dev project today. A separate Preview Supabase project is a Phase 2 split.

Prisma migrations run at build time on Vercel via `prisma generate && next build` in `apps/web/package.json`. Database schema changes require a new migration committed to `apps/web/prisma/migrations/`.

## Monorepo shape

```
koncie-web/
├── apps/
│   └── web/              Next.js 14 app — the guest-facing Koncie experience
├── packages/
│   ├── brand/            Design tokens + Tailwind preset + font config
│   ├── config/           Shared tsconfig, ESLint (base + Next overlay), Prettier
│   └── types/            Domain types: Guest, Itinerary, Booking, Upsell, Transaction, PartnerAdapter
├── services/             (reserved for future backend services)
├── docs/
│   ├── specs/            Per-sprint design docs (this skill's output)
│   ├── plans/            Per-sprint implementation plans
│   ├── sprints/          Per-sprint changelogs (what shipped, what deferred)
│   └── [reference docs]  architecture.md · data-model.md · glossary.md · auth.md
└── package.json          pnpm workspaces + Turborepo
```

## Data flow (Sprint 1 scope)

1. Mock `HotelLinkMockAdapter` seeds `Booking` rows directly in Postgres via `pnpm db:seed`.
2. Seed script emits a **Koncie-signed JWT magic link** (different secret from Supabase's) to stdout.
3. Guest clicks link → `/welcome` server component verifies JWT + looks up `Booking` → renders personalized landing.
4. Guest clicks CTA → server action fires `supabase.auth.signInWithOtp()` → Supabase sends email via Resend SMTP.
5. Guest clicks Supabase magic link → `/auth/callback` handles either PKCE `code` or OTP `token_hash` flow → exchanges for session → links `Guest.auth_user_id` to `auth.users.id` → redirects to `/hub`.
6. `/hub/*` pages read session cookies (refreshed by middleware) and query Prisma for the guest's bookings.

For auth specifics see `docs/auth.md`. For the domain model see `docs/data-model.md`.

## Non-goals in Sprint 1

- Real HotelLink API integration (Sprint 7)
- Payments / MoR plumbing (Sprint 2)
- Insurance offer UI (Sprint 4)
- Flight search UI (Sprint 3)
- Hotel admin portal (Sprint 5)
- SMS via Twilio (Sprint 6)
- Row-Level Security on Supabase tables (multi-tenant isolation lands with Sprint 5 admin portal)

## Stack versions

Pinned in `package.json` / `apps/web/package.json`:
Next.js 14.2, React 18.3, TypeScript 5.7 strict, Tailwind 3.4, Node 20+, pnpm 10, Prisma 5.22, `@supabase/ssr` 0.5, `@supabase/supabase-js` 2.47, Resend 4, jose 5, Vitest 2, Playwright 1.49.
