# Sprint 8 — Engineering audit findings

**Date:** 2026-04-25
**Author:** Claude Code, executing the Sprint 8 second-wave engineering pass per the brief
**Reference:** `docs/sprint-8-brief.md`, `docs/sprint-8-go-no-go.md`
**Branch:** `sprint-8` (off the post-Sprint-7 baseline; latest visible commit `0fb4d3b chore(sprint-8): namotu seed polish + image assets`)

This document captures the discovery pass, the WCAG AA fixes applied, the perf changes applied, and the residual items handed back to Pat for local verification. It is the engineering counterpart to the go/no-go gate — the launch decision still happens at the go/no-go on review day.

---

## Routes audited

The Sprint 8 brief targets ten routes. Their on-disk locations in the App Router:

| Brief name | Real path | File |
| --- | --- | --- |
| Marketing landing | `/` | `apps/web/src/app/page.tsx` |
| Hub | `/hub` | `apps/web/src/app/hub/page.tsx` |
| Sign-in / register | `/register` | `apps/web/src/app/register/page.tsx` |
| Welcome / magic-link landing | `/welcome` | `apps/web/src/app/welcome/page.tsx` |
| Flights / trip detail | `/hub/trip` | `apps/web/src/app/hub/trip/page.tsx` |
| Insurance offer | rendered inline on `/hub` via `ContextualOffersSection` + `InsuranceOfferCard` | `apps/web/src/components/hub/insurance-offer-card.tsx` |
| Insurance checkout | `/hub/checkout/insurance/[quoteId]` | `apps/web/src/app/hub/checkout/insurance/[quoteId]/page.tsx` |
| Activity checkout | `/hub/checkout` | `apps/web/src/app/hub/checkout/page.tsx` |
| Admin overview | `/admin` | `apps/web/src/app/(admin)/admin/page.tsx` |
| Admin messages | `/admin/messages` | `apps/web/src/app/(admin)/admin/messages/page.tsx` |
| Admin bookings | `/admin/bookings` | `apps/web/src/app/(admin)/admin/bookings/page.tsx` |

The brief lists `/sign-in`, `/flights`, `/insurance`, `/checkout` as canonical names; the real implementation routes them through `/register`, `/hub/trip`, the inline offer card, and `/hub/checkout` respectively. The axe spec uses the real paths.

Also touched in the audit (shared chrome and decorative pieces): `apps/web/src/app/layout.tsx`, `apps/web/src/app/(admin)/layout.tsx`, `apps/web/src/app/hub/layout.tsx`, `apps/web/src/components/hub/{booking-hero,bottom-nav,flight-itinerary-card,contextual-offers-section,insurance-offer-card,section-card,addons-section}.tsx`, `apps/web/src/components/welcome/{booking-summary-card,preview-card}.tsx`, `apps/web/src/components/checkout/{card-form,saved-card-row}.tsx`, `apps/web/src/components/activities/activity-card.tsx`.

---

## Existing infrastructure

- **Playwright** is installed (`@playwright/test` in `apps/web/package.json` devDeps) and the suite lives at `apps/web/tests/e2e/` with six specs covering admin, checkout, flights, hotellink, insurance, and messages. There was no `playwright.config.ts` checked in before this sprint — the suite presumably ran with the built-in defaults. Sprint 8 adds the explicit config at `apps/web/playwright.config.ts` with the same `continue-on-error` posture flagged by the brief and matched to Sprint 2-polish.
- **axe-core / axe-playwright** was not present. Added `@axe-core/playwright` to `apps/web/package.json` devDependencies. `pnpm install` was deliberately not run from the sandbox (see "Verification bar" below).
- **Vitest** is the unit-test runner (`vitest.config.ts`); E2E is excluded from the unit run.
- **shadcn/ui Dialog or Sheet** primitives are not used anywhere in the app — the search was exhaustive (no `@/components/ui/`, no `Dialog`, no `Sheet`). That removes a whole category of focus-trap risk; the only modal-ish surface is the `<details>` "Enter a new card" disclosure on the activity checkout, which the browser handles natively.
- **Sentry** is wired through `@sentry/nextjs` v8 with separate `sentry.client.config.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts` plus the App Router `src/instrumentation.ts` for server/edge. No `instrumentation-client.ts` (that's a Next 15 pattern; this app is Next 14.2.28).

---

## Brand-green contrast computation

The brief flagged `koncie-green` (`#2DC86E`) on `koncie-sand` (`#F7F3E9`) as borderline. Computed using WCAG 2.1 relative luminance:

| Pair | Ratio | WCAG verdict |
| --- | --- | --- |
| `#2DC86E` text on `#F7F3E9` sand | **1.98 : 1** | Fails AA Normal (4.5:1) and even AA Large (3:1) |
| `#2DC86E` text on `#FFFFFF` white | **2.19 : 1** | Fails AA Normal and AA Large |
| `#2DC86E` text on `#001F3D` navy | **7.41 : 1** | Passes AAA — fine for navy-bg headers |
| `#001F3D` navy text on `#2DC86E` green | **7.41 : 1** | Passes AAA — fine for green-bg CTAs with navy text |

Brand green as text on a sand or white surface is significantly worse than borderline. It fails outright. Brand green as a fill colour (with navy text on top) is fine. Brand green as text on navy is fine.

The fix without losing the brand's green identity: introduce a darker `koncie-green-cta` token reserved for green-coloured text. Audited candidate hexes:

| Candidate | On sand | On white | Verdict |
| --- | --- | --- | --- |
| `#1FA854` | 2.65 : 1 | 2.93 : 1 | Still fails AA |
| `#1A8F4C` | 3.74 : 1 | 4.13 : 1 | AA Large only |
| `#107A41` | 4.86 : 1 | 5.36 : 1 | AA Normal pass |
| `#0B7A3F` (chosen) | **4.88 : 1** | **5.39 : 1** | AA Normal pass |

`#0B7A3F` ships as `koncie-green-cta` in `packages/brand/src/tokens.ts` (hex + HSL), exposed in the Tailwind preset (`packages/brand/src/tailwind-preset.ts`) as the `koncie-green-cta` colour, and mirrored as `--koncie-green-cta` in `apps/web/src/app/globals.css`. The original `koncie-green` is unchanged — it stays the canonical brand fill colour, used in badges, the booking-hero "your upcoming trip" eyebrow on navy, the flight-itinerary-card eyebrow on navy, the "Protect your trip" CTA fill (with navy text on top), the activity card hover state, and so on. The split is: green pixels that are text or thin glyphs should come from `koncie-green-cta`; green pixels that are fills, badges, or backgrounds with navy/white text overlaid should come from `koncie-green`.

Files swapped from `text-koncie-green` to `text-koncie-green-cta` (every place where `koncie-green` was being used as a text colour against a sand or white background):

- `apps/web/src/app/(admin)/admin/alerts/page.tsx`
- `apps/web/src/app/(admin)/admin/bookings/page.tsx`
- `apps/web/src/app/(admin)/admin/guests/page.tsx`
- `apps/web/src/app/(admin)/admin/messages/page.tsx`
- `apps/web/src/app/(admin)/admin/page.tsx`
- `apps/web/src/app/hub/profile/page.tsx`
- `apps/web/src/app/register/page.tsx`
- `apps/web/src/app/welcome/page.tsx`
- `apps/web/src/components/hub/bottom-nav.tsx` (active-tab label)

Deliberately not swapped — the green pixels that sit on a navy background and so already pass at 7.4:1:

- `apps/web/src/components/hub/booking-hero.tsx` (eyebrow on navy)
- `apps/web/src/components/hub/flight-itinerary-card.tsx` (eyebrow + "NEW" pill on navy)

This is Pat's call to confirm at the go/no-go. The alternative — keeping `#2DC86E` as the only brand green and restricting it to non-text use only — is also viable, but every existing CTA/link that says "click me" in green would need to be swapped to navy or charcoal, which is a bigger visual change than introducing a darker green text variant.

---

## A11y findings

Severity is the axe-style classification (critical / serious / moderate / minor). Items marked "fixed" are addressed by this sprint; items marked "documented" are noted as follow-ups for Pat.

| Route / surface | Severity | Description | Status |
| --- | --- | --- | --- |
| All routes | serious | Brand-green text on sand/white fails AA (1.98 : 1). | **Fixed** — `koncie-green-cta` token introduced, all text-on-sand-or-white usages swapped. See above. |
| `apps/web/src/app/layout.tsx` | serious | No skip-to-content link. Keyboard users had to tab through nav before reaching the page body. | **Fixed** — `<a href="#main-content">` injected at the top of `<body>`, visible on focus, with `focus:ring-2 focus:ring-koncie-green-cta`. |
| `(admin)/layout.tsx`, `hub/layout.tsx`, `page.tsx`, `welcome/page.tsx`, `register/page.tsx` | serious | No `id="main-content"` target landmark for the new skip link to land on. | **Fixed** — added `id="main-content" tabIndex={-1}` on the outermost `<main>` of each top-level layout / unwrapped page. `tabIndex={-1}` makes the main programmatically focusable so the skip link actually moves keyboard focus. |
| `components/checkout/card-form.tsx` | serious | Expiry month and year inputs shared a single label "Expiry"; screen readers announced both inputs as just "Expiry". | **Fixed** — added `aria-label="Expiry month"`/`aria-label="Expiry year"` plus the matching `autocomplete="cc-exp-month"`/`cc-exp-year` hints. The visible "Expiry" label remains as the group affordance; the slash separator is now `aria-hidden`. |
| `components/hub/bottom-nav.tsx` | moderate | `<nav>` had no accessible name; disabled items used `<span title="...">` with no `aria-disabled` cue. Inactive labels used `text-koncie-charcoal/60` (~3.7 : 1 on white, AA Large only). | **Fixed** — `aria-label="Hub primary navigation"` on the `<nav>`, `aria-current="page"` on the active link, `aria-disabled="true"` on the disabled-item span, opacity bumped from 40% to 50%, and the inactive label colour bumped from `/60` to `/70`. |
| Marketing `/` "Koncie" gradient text | minor | The h1 uses `WebKitTextFillColor: transparent` with a `linear-gradient` background-clip so it relies on browser support; no `prefers-reduced-motion` because there is no actual motion. The page has no `animate-*` classes, no CSS keyframes, no JS animation. | **Documented** — no functional change required for AA. The gradient is static. |
| Activity card and activity detail | moderate | Heavy hero photography rendered as CSS `background-image: url(...)` on a `<div>`, which means no `next/image` optimisation, no AVIF/WebP serving, no width/height to reserve layout space (CLS risk on Slow 4G), and no `alt` semantics. | **Fixed** — both swapped to `<Image fill alt="..." sizes="...">`. The activity card uses `alt=""` because the activity name is the link's accessible name and the image is decorative; the activity detail uses `alt={upsell.name}` because it's the only labelling for the hero image. The detail page also gets `priority` since it's above-the-fold. |
| Form labels generally | n/a | Audited every `<input>`/`<select>`/`<textarea>` across the routes. The card form and saved-card-row already use parent `<label>` wrapping, the radio in `<label>` pattern in `/hub/checkout`, and the seed-checkout `defaultChecked` are all accessible. | **No change** — labelling pattern is consistent and screen-reader-friendly. |
| Icon-only buttons | n/a | Audited. There is exactly one icon-only-ish element — the `J` avatar in the hub header, which is decorative chrome (the user already knows they're signed in). No focusable icon-only buttons found anywhere. shadcn `Button` is not in use. | **No change.** |
| Muted text contrast (`text-koncie-charcoal/60`, `/70`, `/80`) | moderate | Charcoal at 60% alpha over sand renders at roughly `#80807C`, which yields ~3.66 : 1 against sand. AA Large pass, AA Normal fail. Used widely for muted descriptions and footnotes. | **Documented** — most of these are sub-`text-sm` body text, which axe will flag as serious. Recommendation: bump body-text uses from `/60` to `/70` (~4.2 : 1) where the text is meaningful, keep `/60` only for genuinely tertiary metadata. Pat call — too widespread to change wholesale without a brand pass; better to triage off the first axe report. |
| Activity-card on hover | minor | `transition-shadow` on the `<Link>`. Not animation, not a motion concern. | **Documented** — no action needed. |

---

## Perf findings + changes applied

Per-route observations under the brief's Pacific 4G assumption (1.6 Mbps down, 750 Kbps up, 150ms RTT):

- **`/` (marketing)** — single static page, no DB queries, no images, single Poppins font subset. Already a strong LCP candidate. Action: nothing to fix; verified `export const dynamic` not present, so this route is naturally statically rendered. No `revalidate` is required because the page has no data dependencies that change.
- **`/hub`** — `force-dynamic` (correct, depends on the signed-in guest). The data layer runs two precondition `count`s, two soft-fail `sync...ForGuest` calls, then a `Promise.all` over four `findMany`s and a final `findMany` for the upsell-existence flag. The `Promise.all` already parallelises the four real queries. The two preceding counts are gating logic for the lazy-sync window — they could be elided by always calling `Promise.all` and letting the sync run inline, but that costs an adapter round-trip on every hub render rather than every 60s. Net: the existing shape is correct; the brief's "single `prisma.guest.findUnique({include})`" framing isn't applicable because the hub assembles data from four sibling models (transactions, flightBookings, insuranceQuotes, upsells) plus the contextual-offer resolver, which a single `include` can't express cleanly. **Documented in this section, no code change.**
- **`/welcome`** — `force-dynamic`. Single `findUnique` on Booking with `include: { guest: true, property: true }` — already optimal.
- **`/register`** — `force-dynamic`. Single `findUnique` on Booking with `include: { guest: true }` — already optimal.
- **`/hub/checkout`** — `force-dynamic`. Single `findUnique` on Upsell, single `findMany` on SavedCard. Optimal.
- **`/hub/checkout/insurance/[quoteId]`** — same shape, optimal.
- **`/admin/*`** — `force-dynamic` on each. Sprint 5/6 admin queries (`computeRevenueKpis`, `listPriorityAlerts`, `listMessagesForProperty`, `listBookingsForProperty`, `listGuestsForProperty`) are aggregating queries per-property; they're cheap on the seed-volume Namotu dataset and run server-side. No client bundle fetches them.

Image policy — the only heavy images in the build are the Namotu `.jpg` set under `apps/web/public/images/namotu/`. Pre-Sprint-8 they were rendered as CSS `background-image` on `<div>`s, which skips Next's image optimisation entirely. Changes applied:

- `apps/web/src/components/activities/activity-card.tsx` — swapped the CSS-bg div for `<Image fill sizes="(min-width: 640px) 50vw, 100vw" alt="">`. Empty alt because the link already carries the activity name.
- `apps/web/src/app/hub/activities/[id]/page.tsx` — swapped for `<Image fill priority sizes="(min-width: 768px) 672px, 100vw" alt={upsell.name}>`. `priority` because this image is above-the-fold on the detail route.

The CSS-bg pattern in `apps/web/src/app/page.tsx` is a `linear-gradient` (no actual image) and stays as-is. No `<img>` tags were ever in the codebase — the swap is wholly within the activity surfaces.

Font policy — Poppins is loaded via `next/font/google` in `apps/web/src/app/layout.tsx` with `subsets: ['latin']`, weights 400/500/600/700, `display: 'swap'`, and `variable: '--font-poppins'`. This is correct — no link-rel-stylesheet pattern. No change.

Bundle policy — audited every `'use client'` file. The pre-Sprint-8 set was three: `apps/web/src/components/checkout/card-form.tsx` (necessary — local form state), `apps/web/src/components/hub/bottom-nav.tsx` (necessary — `usePathname` for active state), and `apps/web/src/components/hub/insurance-offer-card.tsx` (necessary — `useState` for tier selection). The brief asked to push the insurance offer card to a server component if it isn't already. It can't be without losing the interactive tier-switching UX. The whole rest of the hub tree (BookingHero, FlightItineraryCard, AddonsSection, ActivityCard, SectionCard, ContextualOffersSection) is already RSC. Net: no change required.

Sentry deferral — for Next.js 14.2 with `@sentry/nextjs` v8, the client SDK is loaded by `sentry.client.config.ts` via the Sentry webpack plugin. The "defer until after first interaction" pattern the brief refers to is the Next 15 `instrumentation-client.ts` runtime. Forcing a deferred dynamic import in the v8/Next 14 setup risks losing client-side error capture on the very first crash, which is the worst time to lose telemetry for a pilot. **Documented as a Sprint 9 / Next 15 upgrade ticket** rather than fixed this sprint. The compromise that does ship: `tracesSampleRate: 0.1` in the client config means we're already sampling 10% of traces, which keeps the perf cost bounded.

Cloudflare cache rules — `apps/web/vercel.json` only declares the cron schedule. There's no static-asset cache header config in the repo because Vercel + Cloudflare default to immutable caching for `_next/static` and `next/image` already does the right thing. The marketing `/` route is naturally SSG since it has no dynamic data; Vercel's edge will cache it. No change required.

---

## Perf changes applied (summary)

- Activity card hero photography: CSS background-image → `next/image` with `fill`, `sizes`, decorative `alt=""`.
- Activity detail hero photography: same swap, additionally `priority` because above-the-fold.
- A11y-related side benefit: with `next/image` driving the activity images, the layout reserves space (no CLS), and Next negotiates AVIF/WebP based on the client.

---

## Open questions for Pat

- **Brand-green CTA decision.** Confirm `koncie-green-cta = #0B7A3F` is acceptable as a sister token to the existing brand green, or override with a different darkening (e.g. keep more saturation). Either way the original `#2DC86E` stays in the palette for fills and decorative use.
- **Muted-text-contrast triage.** The widespread `text-koncie-charcoal/60` pattern fails AA Normal at ~3.66 : 1. Bump to `/70` everywhere it's body-tier text? Or accept as a known-issue P2 and triage off the axe report? The axe spec in this PR will surface every concrete violation.
- **Sentry browser deferral.** Worth scheduling a Next 15 + `@sentry/nextjs` v9 upgrade in Sprint 9 to enable `instrumentation-client.ts`, or stay on Next 14 through pilot? Current Sentry overhead is ~30KB gzipped — non-trivial on Slow 4G but not a launch blocker.

---

## What Pat needs to run himself

The sandbox bash environment couldn't safely run `pnpm install` in under 45 seconds, so the verification bar at the bottom of the brief was deferred to Pat's Windows side. To validate Sprint 8:

```
cd apps/web
pnpm install                              # picks up the new @axe-core/playwright dep
pnpm typecheck
pnpm lint
pnpm test                                 # baseline ~144 from Sprint 7; no new vitest tests added this sprint
pnpm build
pnpm exec playwright install chromium     # one-off if not already installed
pnpm test:e2e tests/e2e/a11y.spec.ts      # the Sprint 8 axe scan; expects zero serious/critical violations
```

Lighthouse runs are also Pat's to drive — the sandbox has no Chrome, so the Lighthouse scores in the go/no-go are TBD until Pat runs them locally against the staging URL with the Slow 4G + Moto G Power preset:

```
# From a staging Vercel deployment (or local `pnpm dev`):
pnpm exec lighthouse https://staging.koncie.app/ --preset=desktop --throttling-method=simulate
# repeat per route, capture accessibility + performance scores into the go/no-go doc
```

Expected accessibility scores after this pass, in principle:

| Route | Expected score | Rationale |
| --- | --- | --- |
| `/` | ≥ 95 | Single static page, fixed contrast and main landmark. Gradient h1 is the only soft spot. |
| `/welcome` | ≥ 95 | Skip link added; content text uses charcoal on sand at 11.4 : 1. |
| `/register` | ≥ 95 | Skip link added; links swapped to AA-green. |
| `/hub` | ≥ 95 | Skip link added; navigation labelled; muted-text findings will be moderate at worst. |
| `/hub/trip` | ≥ 95 | Inherits hub layout. Pure static content. |
| Insurance offer (rendered on `/hub`) | ≥ 95 | Already had the radiogroup pattern; CTA is navy text on green fill (passes AAA). |
| `/hub/checkout` and `/hub/checkout/insurance/[quoteId]` | ≥ 95 | Card form labelling improved, expiry inputs now have explicit aria-labels. |
| `/admin`, `/admin/messages`, `/admin/bookings` | ≥ 95 | Pill colours swapped to AA-green; nav, headers, and tables all use the existing semantic structure. |

These are projections. The real numbers come from Pat's Lighthouse runs and feed straight into the go/no-go.

---

## OneDrive damage flag (pre-existing, not Sprint 8)

`git status` on the working tree at `apps/web/prisma/seed.ts` shows the file truncated mid-statement:

```
main()
  .then(() => prisma.$disconnec
```

This is OneDrive-sync damage matching the failure modes called out in `CLAUDE.md` (".git/index.lock issue plus .next EINVAL plus the migration-folder delete retry"). The truncation is not from this sprint — `git diff` shows it as the only delta on a file the engineering pass did not touch. Pat to restore from `git` (`git checkout -- apps/web/prisma/seed.ts`) before running `pnpm db:seed`. Flagging here so it doesn't surprise the verification bar.

## Files modified or created (full Linux-mount paths)

Modified:

- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/packages/brand/src/tokens.ts`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/packages/brand/src/tailwind-preset.ts`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/globals.css`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/layout.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/welcome/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/register/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/hub/layout.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/hub/profile/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/hub/activities/[id]/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/layout.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/admin/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/admin/messages/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/admin/bookings/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/admin/alerts/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/app/(admin)/admin/guests/page.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/components/activities/activity-card.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/components/checkout/card-form.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/src/components/hub/bottom-nav.tsx`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/package.json`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/docs/sprint-8-go-no-go.md`

Created:

- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/playwright.config.ts`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/apps/web/tests/e2e/a11y.spec.ts`
- `/sessions/beautiful-loving-mendel/mnt/Koncie/Planning/repo-scaffold/docs/sprint-8-engineering-findings.md` (this file)
