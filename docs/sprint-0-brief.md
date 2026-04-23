# Sprint 0 — Foundation

**Duration:** 1 week
**Owner:** Claude Code, with checkpoint review by Pat
**Reference:** `docs/plan.md` Section 5, Sprint 0

## Goal

Stand up a deployable, empty Koncie web app with the monorepo structure, brand tokens, CI/CD, and observability in place. Nothing user-facing beyond a "Koncie" wordmark and a healthcheck endpoint. The deliverable is a preview URL Pat can click that loads the shell.

The reason this sprint is a week of its own, rather than rolled into Sprint 1, is that getting the foundation wrong wastes the rest of the 10-week runway. Do it once, do it slow, get it reviewed.

## Out of scope for Sprint 0

Do not build any of the following in this sprint. They are Sprint 1+ material:

- Authentication / sign-up / sign-in
- Any guest-facing hub or dashboard screen
- Any data model beyond the monorepo skeleton
- Any external integration (Jet Seeker, HotelLink, payments, insurance)
- Any tests beyond smoke tests confirming the scaffold runs

## Deliverables

Check each off as you go. Ask before deviating.

- [ ] **Monorepo scaffold** — pnpm workspaces + Turborepo, with the package/app/service directory shape described in `CLAUDE.md`
- [ ] **Next.js 14 app** at `apps/web/` using App Router, TypeScript strict mode
- [ ] **Tailwind CSS + shadcn/ui** installed and wired in `apps/web/`
- [ ] **Brand token package** at `packages/brand/` — Tailwind preset with the real Koncie tokens lifted from the live Lovable prototype: navy `#001F3D` (primary), sand `#F7F3E9` (secondary / muted background), green `#2DC86E` (accent), charcoal `#333333` (body text), warm-sand border `#E4DECD`, corner radius `1rem`. Poppins font via `next/font`. Reference: `https://koncierge-portal-mockup.lovable.app` for live token usage. The uploaded `Koncie Deck.pptx` (in the parent workspace) provides hero-imagery direction — tropical/ocean beach photography for marketing moments, not UI chrome.
- [ ] **Shared types package** at `packages/types/` with empty `Guest`, `Itinerary`, `FlightBooking`, `HotelBooking`, `Upsell`, `Transaction` type stubs
- [ ] **Shared config packages** at `packages/config/` (tsconfig, eslint, prettier) consumed by all apps/packages
- [ ] **Wordmark header** on the root route of `apps/web/` — "Koncie" with the brand gradient, centered, no other content
- [ ] **Healthcheck** at `/api/health` returning `{ status: "ok", version: <git sha>, timestamp: <iso> }`
- [ ] **GitHub Actions CI** — on every PR: typecheck, lint, build, run any existing tests
- [ ] **Vercel project** linked to the GitHub repo, auto-deploying `main` to staging and generating preview URLs for every PR
- [ ] **Sentry** configured for error reporting in `apps/web/`, with a test error visible in the Sentry dashboard
- [ ] **Vercel Analytics** enabled
- [ ] **README.md** at the repo root with local dev instructions and a link to `docs/plan.md`
- [ ] **`.env.example`** with no real secrets, just keys that will be needed

## Acceptance criteria

Sprint 0 is done when:

1. `pnpm install && pnpm dev` from a clean clone works on a Node 20 machine
2. `pnpm build` and `pnpm typecheck` pass with zero errors
3. The `main` branch auto-deploys to a Vercel staging URL that renders the Koncie wordmark
4. Every PR opened against `main` produces a Vercel preview URL
5. The `/api/health` endpoint returns the expected JSON on the staging URL
6. A deliberate test error produced in staging shows up in Sentry
7. CI checks pass on the Sprint 0 PR
8. The final PR is open and ready for Pat to click through and approve

## Checkpoint review — what to ask Pat

At the end of Sprint 0, prepare a message for Pat with:

1. The Vercel staging URL for him to click
2. A screenshot of the Koncie wordmark render
3. A link to the open Sprint 0 PR
4. Confirmation of the tech stack choices (Next.js, Tailwind, shadcn/ui, Prisma/Postgres plan, Clerk, Resend, Twilio, Sentry)
5. **One specific decision Pat must make before Sprint 1 starts:**
   - Postgres hosting: Supabase (fastest) vs AWS RDS in ap-southeast-2 (better for Kovena alignment if Kovena is already on AWS)
   - (Brand direction is already settled — tokens lifted from the live Lovable prototype; see the Brand token package deliverable above.)
6. Any unexpected friction during Sprint 0 that might affect later sprints

Do not start Sprint 1 until Pat explicitly approves.

## Notes for Claude Code

- If something in `CLAUDE.md` conflicts with this brief, flag it — don't pick silently.
- If Vercel, Sentry, or Twilio accounts aren't set up yet, stop and ask Pat. Don't commit placeholder tokens.
- If the initial `pnpm install` flags a peer-dependency issue, document it in the PR body rather than silently bumping versions across the workspace.
- Keep this sprint genuinely minimal. Every piece of code added here gets read by every future sprint. Defer anything that doesn't need to be in the foundation.
- **Visual reference**: the live Lovable prototype at `https://koncierge-portal-mockup.lovable.app` is the primary design reference across all sprints. `/koncie-hub-user` and `/flight-search` are the most fully built routes. The prototype's admin portal (`/koncie-admin`) is intentionally richer than MVP scope — see `docs/plan-addendum.md` §6.5 for scope-trim guidance before rebuilding it in Sprint 5.
