# Sprint 8 — Pilot hardening

**Duration:** ~1 week (kick-off 2026-04-27, target wrap 2026-05-01, with Friday reserved for the go/no-go review)
**Owner:** Claude Code, executing autonomously per the Sprints 6–7 pattern
**Reference:** `docs/plan.md` §5 Sprint 8, `docs/plan-addendum.md`, Sprint 7 brief, latest commit `420d012` on branch `sprint-7`
**Baseline:** `main` once Sprint 7 lands; until then, branch off `sprint-7@420d012`
**Status:** Planned, awaiting kick-off

---

## Execution posture

- This is the last sprint before the Namotu soft launch. No new feature work. The job is to take the engineering loop that Sprints 0–7 built and make it pilot-ready: accessible, fast on a Fiji 4G connection, reasonably bug-free, and gated by an explicit go/no-go.
- Two scope items in the original plan are being handled in parallel by other agents this week and are deliberately not in this brief: pilot hotel staff training materials (short PDF + Loom) and Namotu seed-data polish. Coordinate at the go/no-go, don't duplicate.
- HotelLink real-webhook wiring on the Kovena ops side is also a parallel track. Sprint 7 shipped the Koncie-side ingest + signature verification against a mock; this sprint validates the same path against the Kovena ops sandbox once it's stood up, but does not block on production credentials.
- Mirror the prior-sprint working pattern: branch `sprint-8` off the agreed baseline, one squash-ready commit titled `chore(sprint-8): pilot hardening`, typecheck / lint / test / build green before push, Playwright `continue-on-error`. Migrations: none expected this sprint (no schema changes), but if a perf fix demands an index, follow the Sprint 6/7 manual-Supabase pattern.

---

## Goal

Get Koncie into a state where Pat is comfortable inviting the first real Namotu Island Fiji guest in. Concretely: a guest opening their magic-link email on a mid-range Android over a Fiji mobile network can land on `/hub`, navigate to the flight and insurance offers, complete a sandbox checkout, and have the admin portal reflect it — all without an avoidable accessibility blocker, an LCP regression, or a known P0/P1 bug. The deliverable that closes the sprint is the go/no-go checkpoint document at `docs/sprint-8-go-no-go.md`, signed off by Pat, ops, and the partner.

---

## Locked scope

### 1. WCAG AA accessibility audit

Run a full WCAG 2.1 AA pass across the four surfaces that a real guest or staff member will actually touch in the pilot: the marketing landing route, the guest hub, the auth flow (sign-in / magic-link claim / `/welcome`), the checkout flow (insurance offer card, Kovena MoR card form, receipt), and the admin portal (dashboard + `/admin/messages` + `/admin/bookings`).

Tooling: `@axe-core/playwright` integrated into the existing E2E suite as a non-blocking advisory job (matches the Sprint 2-polish CI posture for Playwright), plus a manual pass with VoiceOver on iOS Safari and TalkBack on Android Chrome for the four guest-facing routes. Lighthouse accessibility score ≥ 95 on each route.

Fix-as-you-go for AA violations: missing alt text, non-AA contrast pairs (the brand-green `#2DC86E` on koncie-sand needs verifying — early signal is that it's borderline), focus traps in the dialog/sheet shadcn primitives, missing `aria-label` on icon-only buttons, form fields without associated labels, skip-to-content link on the hub layout, and reduced-motion handling on the brand gradient hero. Anything that's a genuine design change rather than a fix gets logged as a known issue and triaged at the go/no-go.

### 2. Pacific mobile performance tuning

Target routes: `/`, `/hub`, `/flights`, `/insurance`, `/checkout`. Budget: LCP under 2.5s on a throttled Slow 4G profile (1.6 Mbps down, 750 Kbps up, 150ms RTT — the Lighthouse "Slow 4G" preset), CLS under 0.1, INP under 200ms. Measure on a Moto G Power-class device profile, which is a reasonable proxy for the mid-range Android the Namotu front-of-house staff and most guests will be on.

Methodology — open question, see below — is one of: (a) Vercel Analytics field data once we've had enough preview traffic, (b) local Lighthouse runs against the staging URL with throttling enabled, or (c) WebPageTest from the Auckland or Sydney node as the closest proxy to a Fiji-bound packet. Pat's call; default to (b) for the iteration loop and (a) for the post-launch baseline.

Likely fixes given what's already in the build: image policy (the hero photography is heavy — convert to AVIF/WebP, set explicit `width`/`height`, lazy-load anything below the fold, use `next/image` everywhere), font policy (Poppins is loaded via `next/font` already; verify subset and `display: swap`), bundle policy (audit `apps/web/.next/analyze` output for accidental client-component bloat, push the insurance offer card to a server component if it isn't already, defer Sentry's browser bundle until after first interaction), data policy (the `/hub` query fan-out should be a single `prisma.guest.findUnique` with the right `include`, not a waterfall — verify), and Cloudflare cache rules on the marketing route.

### 3. Internal bug bash

Half-day session, mid-sprint. Small group — the participant list is an open question (Pat plus a handful from Kovena ops and partners; size TBD). Run a written script that walks each tester through the canonical guest journey (HotelLink-triggered magic link → `/welcome` → `/hub` → flight ingestion via the Sprint 3 test route → insurance purchase via CoverMore sandbox → admin portal verification), then ten minutes of unscripted exploration. Capture findings in the known issues register inside `docs/sprint-8-go-no-go.md` and triage P0/P1 same-day; P2/P3 get a follow-up ticket and don't block launch.

### 4. Go/no-go checkpoint document

Create `docs/sprint-8-go-no-go.md` (drafted alongside this brief, populated through the sprint, signed off Friday). Sections covered there: launch criteria checklist, known-issues register, rollback plan for the first 48 hours of pilot, first-30-days success metrics, sign-off block. Pat, ops, and the partner all sign before the HotelLink-side invitation trigger gets enabled on Namotu's tenant.

---

## Out of scope

- Any new feature work. If a fix turns into a feature, it gets logged and deferred to Sprint 9.
- Real CoverMore production credentials. Stay on sandbox through pilot; production cutover is a post-launch Sprint 9 ticket once the policy-issuance volume justifies the contractual move.
- Real Kovena MoR production credentials. Same posture — sandbox only this sprint. Pat has noted production cutover follows the same gate.
- Real HotelLink webhook wiring on Kovena's ops infrastructure (parallel ops track, not Koncie code).
- Pilot hotel staff training materials and Namotu seed data polish — handled by other agents this week. Coordinate at the go/no-go.
- SMS via Twilio (still parked from Sprint 6's out-of-scope).
- Multi-language. English only for pilot.
- Native app. Web-first per the plan; rechecking responsiveness is part of the perf pass, but no Capacitor/React Native wrapper this sprint.
- AAA accessibility. AA is the bar; AAA is a Phase 2 nice-to-have.
- Multi-property admin. Single-tenant Namotu only.

---

## Success criteria

Measurable, all of the following before we mark the sprint done:

- Lighthouse accessibility score ≥ 95 on `/`, `/hub`, `/sign-in`, `/welcome`, `/flights`, `/insurance`, `/checkout`, `/admin`, `/admin/messages`, `/admin/bookings`.
- Zero open Axe violations of severity "serious" or "critical" across the same routes.
- Manual VoiceOver + TalkBack pass on the four guest-facing routes with no journey-blocking issue.
- LCP < 2.5s, CLS < 0.1, INP < 200ms on the five target routes under the agreed measurement methodology.
- Bug bash run, findings logged in the known-issues register, all P0/P1 closed.
- HotelLink webhook end-to-end against the Kovena ops sandbox: synthetic booking in → magic-link email out → `/welcome` claim → `/hub` populated. Documented as a passing run in the go/no-go doc.
- CoverMore sandbox purchase end-to-end: offer card → quote → bind → policy receipt email → `/admin/messages` shows `INSURANCE_RECEIPT` row delivered.
- Verification bar holds: typecheck, lint, test (~144+ baseline from Sprint 7, plus whatever a11y/perf tests get added), build green.
- Go/no-go doc signed by Pat, ops, partner.

---

## Dependencies and risks

**HotelLink ops sandbox availability.** The end-to-end criterion above depends on Kovena's ops team standing up the sandbox emitter and configuring the webhook secret. If that slips past mid-sprint, the criterion downgrades to "passing run against the Sprint 7 mock test route" and Pat decides at the go/no-go whether sandbox parity is a launch blocker or a 48-hour follow-up.

**Namotu seed-data polish.** Owned by another agent this week. The bug bash and the screenshots in the go/no-go doc will look thin if the seed isn't realistic by Wednesday. Coordinate early.

**OneDrive git lock.** Pat's repo lives under OneDrive and the `.git/index.lock` issue plus `.next` EINVAL plus the migration-folder delete retry have all bitten in prior sprints. Documented in `CLAUDE.md` and the Sprint 5/6/7 handoffs. Workarounds (force-reset, manual lock removal, stop dev server before prisma generate) are known. Don't fight them; clean them as they appear. No schema changes expected this sprint reduces the surface area.

**Bug-bash schedule.** A live half-day session needs people on calendars. If we can't pull a quorum together inside the week, fall back to an asynchronous bash with a 48-hour window — less interactive, still useful.

**Pacific network variability.** Field LCP from a Fiji device is the only true measurement. Pre-launch we're approximating from Auckland/Sydney; the first 48 hours of pilot Vercel Analytics is the real signal. The rollback plan in the go/no-go covers what happens if the field numbers come in materially worse than the lab estimate.

---

## Open questions

- **Bug-bash participants.** Who's in the room? Pat alone, Pat plus two Kovena ops, Pat plus ops plus a Namotu staff member? Calendar lead time matters. Pat to confirm by 2026-04-28.
- **LCP measurement methodology.** Vercel Analytics field data, local throttled Lighthouse against staging, or WebPageTest from Auckland? Default is local Lighthouse for the iteration loop and Vercel Analytics for the post-launch baseline; Pat to confirm or override.
- **Contrast on brand-green CTA.** The accent green `#2DC86E` on koncie-sand `#F7F3E9` is borderline against AA for non-large text. Early audit will confirm; if it fails, the fix is either darkening the green slightly (brand impact, Pat call) or restricting the green to large text + iconography. Pat to weigh in once the audit returns hard numbers.
- **Sandbox parity gate.** If the HotelLink ops sandbox doesn't materialise this week, is "mock test route passing" sufficient for go/no-go, or do we hold the launch? Pat's call at Friday's review.

---

## Verification bar

Same as Sprints 1–7:

```
pnpm -r typecheck
pnpm -r lint
pnpm -r test       # baseline ~144 from Sprint 7; +a11y/perf assertions as added
pnpm -r build
```

Plus:

- Lighthouse runs against staging on each of the ten target routes (accessibility score and Core Web Vitals captured)
- Axe Playwright job green (no serious/critical violations)
- Manual VoiceOver + TalkBack pass logged
- Sandbox HotelLink + CoverMore E2E run logged in the go/no-go doc

---

## Exit criteria — go/no-go gate

The sprint is not done when the verification bar is green. It's done when `docs/sprint-8-go-no-go.md` is fully populated, every launch-criteria checkbox is ticked or has an explicit "accepted risk, signed off" note next to it, and Pat, ops, and the partner have signed. The first Namotu HotelLink-side invitation does not get sent until that signature block is complete. If we miss the gate on Friday, the sprint extends by however many days it takes to clear it — feature freeze remains in effect.

---

## Sprint 9 preview (not this sprint)

Post-pilot. The shape depends entirely on what the first 30 days of Namotu data reveals. Likely candidates: CoverMore production cutover, Kovena MoR production cutover, Twilio SMS for the magic-link path on guests with no email-on-file, the second pilot hotel onboarded, HotelLink MODIFY/CANCEL/DATE_CHANGE webhooks, opt-out tracking for compliance. Real prioritisation happens at the post-pilot retro, not here.
