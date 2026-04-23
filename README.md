# Koncie Web

Monorepo for **Koncie** — Kovena's post-booking guest experience platform. Consumer-facing companion that surfaces flights, insurance, and activities to guests after they book with a Kovena-integrated property.

> Status: Sprint 0 scaffold. Pre-launch. First pilot: **Namotu Island Fiji** (HotelLink customer), Q2 2026.

For strategic context, read `docs/plan.md` and `docs/plan-addendum.md`. For the operating contract Claude Code works under, read `CLAUDE.md`.

## Stack

- **Runtime** — Node 20, pnpm 10, Next.js 14.2 (App Router), React 18, TypeScript 5.7 strict
- **Styling** — Tailwind CSS 3.4 with the Koncie brand preset (`@koncie/brand/tailwind-preset`), shadcn/ui plumbing, Poppins via `next/font/google`
- **Observability** — Sentry (`@sentry/nextjs`), Vercel Analytics
- **Monorepo** — pnpm workspaces + Turborepo
- **Hosting** — Vercel (target)
- **Payments / MoR** — Kovena, MCC 4722 (ancillaries only — the original room booking is untouched)

## Repo layout

```
koncie-web/
├── apps/
│   └── web/              # Next.js 14 app — the guest-facing Koncie experience
├── packages/
│   ├── brand/            # Design tokens + Tailwind preset + font config
│   ├── config/           # Shared tsconfig, ESLint (base + Next overlay), Prettier
│   └── types/            # Domain types: Guest, Itinerary, Booking, Upsell, Transaction
├── services/             # (reserved for future backend services)
├── docs/
│   ├── plan.md
│   ├── plan-addendum.md
│   └── sprint-0-brief.md
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Getting started

Requires Node 20+ and pnpm 10+ (the exact pnpm version is pinned in `packageManager`).

```bash
pnpm install
cp .env.example .env.local   # fill in Sentry DSN etc.
pnpm dev
```

App runs on http://localhost:3000.

### Environment variables

See `.env.example` for the full list. For Sprint 0, the only variables that matter in local dev:

| Variable | Purpose | Sprint |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side error reporting | 0 |
| `SENTRY_DSN` | Server-side error reporting | 0 |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | Source-map upload at build time | 0 |

Placeholders for later sprints (Clerk, Resend, Twilio, Postgres, Jet Seeker, HotelLink, insurance providers) are listed in `.env.example` but can be left empty until the sprint that introduces them.

## Commands

All commands run through Turbo from the repo root.

| Command | What it does |
|---|---|
| `pnpm dev` | Run the web app in dev mode |
| `pnpm build` | Production build across all workspaces |
| `pnpm typecheck` | `tsc --noEmit` across all workspaces |
| `pnpm lint` | ESLint across all workspaces |
| `pnpm test` | Test runner placeholder (wired up in Sprint 1) |
| `pnpm clean` | Remove `.next`, `.turbo`, build artefacts |

Filter to a single workspace with `pnpm --filter @koncie/web <cmd>`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck → lint → build → test on every push and PR against `main`. Uses the same `pnpm@10.x` pinned version as local dev.

## Health check

Once deployed, `/api/health` returns:

```json
{
  "status": "ok",
  "version": "<git sha>",
  "environment": "production",
  "timestamp": "2026-04-23T..."
}
```

`/api/test-error` throws deliberately — use it to verify Sentry is wired up end-to-end.

## Architectural principles

- **Ports & adapters.** Domain types in `packages/types` are provider-agnostic. Jet Seeker / HotelLink / insurance providers sit behind adapter interfaces so they can be swapped or run in parallel.
- **Merchant of Record, always.** Every `Transaction` carries `mcc: '4722'` as a literal — compile-time guarantee that we don't accidentally process anything under the wrong MCC.
- **Post-booking only.** Koncie never touches the original room booking transaction. That flows through the hotel's PMS.
- **Partner-first distribution.** Integrations live behind adapters so the same guest UX can be turned on across HotelLink, SiteMinder, Opera, etc. with minimal per-partner work.

See `docs/plan.md` for the full architectural rationale.

## Working with Claude Code

The operating contract for AI-assisted work lives in `CLAUDE.md` at the repo root. The per-sprint briefs live in `docs/`. Standard flow:

1. Start a Claude Code session at the repo root.
2. Point it at the current sprint brief: *"Execute the tasks in `docs/sprint-N-brief.md`. Start in plan mode."*
3. Review the plan, approve, then let it execute.
4. Checkpoint review at the end of each sprint before moving on.

## License

Proprietary. © Kovena Pty Ltd.
