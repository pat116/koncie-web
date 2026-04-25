# Sprint 8 — Pilot go/no-go checkpoint

**Review date:** 2026-05-01 (target — Friday of the Sprint 8 week)
**Pilot property:** Namotu Island Fiji
**Reference:** `docs/sprint-8-brief.md`, `docs/plan.md` §5 Sprint 8, `docs/plan-addendum.md`
**Status:** Draft. Populate through the sprint. Sign on review day.

This is the document that decides whether the first Namotu HotelLink-side invitation gets sent. Until every launch-criterion below is either ticked or carries a written "accepted risk, signed off" note, the invitation trigger stays disabled on Namotu's tenant in Kovena ops.

---

## 1. Launch criteria

Pass/fail checklist. Each item gets a tick, an X, or a short note. Items that fail without a written acceptance from Pat are launch blockers.

### Accessibility

- [ ] Lighthouse accessibility score ≥ 95 per route — code-level audit complete (`docs/sprint-8-engineering-findings.md`); Pat to run Lighthouse against staging and tick once each route lands ≥ 95
- [ ] Zero Axe violations of severity "serious" or "critical" — automated axe spec at `apps/web/tests/e2e/a11y.spec.ts` covers all ten routes; Pat runs `pnpm test:e2e tests/e2e/a11y.spec.ts` once locally before sign-off
- [ ] Manual VoiceOver pass on iOS Safari for the four guest-facing routes — no journey-blocking issue
- [ ] Manual TalkBack pass on Android Chrome for the four guest-facing routes — no journey-blocking issue
- [x] Brand-green CTA contrast resolved — `koncie-green-cta` (`#0B7A3F`) introduced as the AA-safe text/link variant; original `#2DC86E` retained for fills + decorative use. Computation and per-route swaps in `docs/sprint-8-engineering-findings.md`. Pat to confirm the chosen hex at the review.

### Performance (Pacific mobile)

- [ ] LCP < 2.5s on `/` under Slow 4G + Moto G Power profile
- [ ] LCP < 2.5s on `/hub`
- [ ] LCP < 2.5s on `/flights`
- [ ] LCP < 2.5s on `/insurance`
- [ ] LCP < 2.5s on `/checkout`
- [ ] CLS < 0.1 across all five target routes
- [ ] INP < 200ms across all five target routes
- [ ] Measurement methodology agreed and recorded (lab Lighthouse vs Vercel Analytics field vs WebPageTest)

### Bug bash

- [ ] Bash session run (date, participants, duration recorded below)
- [ ] All P0 issues closed
- [ ] All P1 issues closed or carry written acceptance
- [ ] P2/P3 logged as Sprint 9 follow-ups

Bash session record:

| Field | Value |
| --- | --- |
| Date | TBD |
| Participants | TBD — Pat to confirm |
| Duration | TBD |
| Findings count (P0 / P1 / P2 / P3) | TBD |

### HotelLink end-to-end against sandbox

- [ ] Kovena ops HotelLink sandbox emitter stood up and `HOTELLINK_WEBHOOK_SECRET` configured on staging
- [ ] Synthetic booking POSTed → signature verified → `Booking` upserted → `Guest` upserted
- [ ] Magic-link email dispatched and visible in `/admin/messages` as `HOTEL_BOOKING_CONFIRMED` row
- [ ] Magic-link click lands on `/welcome` pre-authenticated for the booking
- [ ] `/hub` populated with the booking + property branding ("Powered by HotelLink")
- [ ] Repeat send is idempotent — no duplicate `Booking`, no duplicate `MessageLog`

Mock-route harness ready (see §1a below); Pat to run pre-launch and tick the boxes against the live evidence. If sandbox parity isn't possible this week, alternative: passing run against the Sprint 7 mock test route, with Pat's written acceptance that production sandbox parity is a 48-hour post-launch follow-up rather than a launch blocker.

### CoverMore sandbox purchase

- [ ] Offer card renders on `/insurance` for a seed booking with realistic premium
- [ ] Quote round-trip through the CoverMore sandbox returns
- [ ] FatZebra sandbox card form completes payment
- [ ] Policy bind succeeds; policy number persisted
- [ ] `INSURANCE_RECEIPT` email dispatched, visible in `/admin/messages` as DELIVERED

Mock-route harness ready (see §1a below); Pat to run pre-launch and tick once each box has live evidence.

### Namotu seed-data realism

- [ ] Property record reflects Namotu Island Fiji (name, slug, hero imagery, location, "Powered by HotelLink")
- [ ] Demo guest has a plausible booking window (post-2026-05-01 check-in)
- [ ] Activities / on-property upsells reflect what Namotu actually offers (surf, fishing, dining)
- [ ] Pricing reads as plausible for a 5-star Fiji surf/fishing resort

(Owned by parallel agent this week; tick at review.)

### Engineering verification bar

- [ ] `pnpm -r typecheck` green — Pat to run on the Windows side after `pnpm install` picks up `@axe-core/playwright`
- [ ] `pnpm -r lint` green
- [ ] `pnpm -r test` green (~144+ baseline; no new vitest tests added in the Sprint 8 second wave — only Playwright a11y advisory)
- [ ] `pnpm -r build` green
- [ ] `pnpm test:e2e tests/e2e/a11y.spec.ts` green — axe scan, advisory but expected to pass after the Sprint 8 fixes
- [ ] No new Sentry errors of severity error or fatal in the 24 hours before review

---

## 1a. Verification harness — HotelLink + CoverMore E2E

The Sprint 8 brief asks for "passing run" evidence on two end-to-end flows. Neither can be exercised from the engineering sandbox (no dev server, no Resend webhook listener), so the harness below documents the exact local commands Pat runs pre-launch. Each is marked "Harness ready, Pat to run pre-launch" in the launch criteria above.

### HotelLink ingest harness (mock test route)

The Sprint 7 dev-only test route at `apps/web/src/app/__test__/ingest-hotellink-for-seed-guest/route.ts` runs the production ingest pipeline (`ingestHotelLinkBooking` → upsert Booking + Guest → MessageLog `MAGIC_LINK` row) without the HMAC dance. Use it to validate the end-to-end before the Kovena ops sandbox emitter is wired.

```bash
# Terminal 1 — boot the app
cd apps/web && pnpm dev

# Terminal 2 — trigger the ingest
curl -i http://localhost:3000/__test__/ingest-hotellink-for-seed-guest
# Expect: 303 redirect to /hub with Set-Cookie session

# In a browser:
# 1. Sign in as the seed admin: /__test__/sign-in-as-seed-admin → lands on /admin
# 2. Open /admin/messages → expect a MAGIC_LINK row for jane.demo@... (or your KONCIE_SEED_EMAIL)
# 3. Open /admin/bookings → expect the synthetic Namotu booking row
# 4. Sign in as the seed guest: /__test__/sign-in-as-seed-guest → lands on /hub
# 5. Confirm the booking-hero shows Namotu Island Fiji + the seeded check-in dates
```

If the Kovena ops HotelLink sandbox stands up before launch, replace step 2 with a real signed POST (script under `Kovena - Chief Revenue Officer/Koncie/...` ops directory), and confirm the same `/admin/messages` and `/admin/bookings` rows materialise.

### CoverMore sandbox harness

`apps/web/src/adapters/covermore-mock.ts` returns three deterministic tier quotes per call (Essentials AU$89, Comprehensive AU$149, Comprehensive+ AU$219), keyed off guest email + flight dates so repeated syncs upsert the same rows. The fail-trigger email `covermore-unavailable@test.com` exercises the soft-fail path.

```bash
# Terminal 1 — boot the app
cd apps/web && pnpm dev

# In a browser:
# 1. Hit /__test__/ingest-jetseeker-for-seed-guest        (gives the seed guest a flight)
# 2. Hit /__test__/seed-insurance-quote-for-seed-guest    (forces the three CoverMore quotes)
# 3. Hit /__test__/sign-in-as-seed-guest                  (lands on /hub)
# 4. On /hub, scroll to the "Travel protection · via CoverMore" card
# 5. Click "Protect your trip" with Comprehensive selected
# 6. Land on /hub/checkout/insurance/[quoteId]
# 7. Fill the new-card form with 4242424242424242 / 12 / next year / 123 / any name
# 8. Click "Pay" — expect /hub/checkout/success
# 9. Sign in as the seed admin (/__test__/sign-in-as-seed-admin)
# 10. /admin/messages → expect a row with kind INSURANCE_RECEIPT, status DELIVERED
```

Sign-off rule: both harnesses must run clean once each before Pat ticks the corresponding launch-criteria boxes. The harness output (curl response, browser screenshots) goes into the bug bash log if anything regresses; otherwise a one-line "ran clean on YYYY-MM-DD" against each box is enough.

## 2. Known issues register

Populated through the sprint, especially during the bug bash. Empty at brief-time. P0/P1 must close before launch; P2/P3 get Sprint 9 tickets.

| ID | Severity | Surface | Description | Found by | Found on | Status | Resolution / Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| _none yet_ | | | | | | | |

Severity definitions: **P0** — blocks the canonical guest journey, no workaround. **P1** — blocks a meaningful fraction of guests or breaks a non-trivial flow, workaround exists. **P2** — visible defect, doesn't block. **P3** — polish.

---

## 3. Rollback plan (first 48 hours of pilot)

Koncie is a consumer web app fronted by Vercel + Cloudflare. Rollback is fast and reversible. The plan, in order of escalation:

**Tier 1 — soft pause.** If a single guest reports an issue and we want to investigate before more invitations land, ask Kovena ops to disable the HotelLink-side invitation trigger on Namotu's tenant. New bookings still ingest into Koncie and the booking is intact in the database; the magic-link email just doesn't fire. Reversible in minutes once the issue is understood. This is the default response to anything short of a site-down event.

**Tier 2 — maintenance redirect.** If `/hub` itself is broken for guests already invited, redirect `/hub` (and only `/hub`) to a static maintenance page on Cloudflare, hosted out of `apps/web/public/maintenance.html`. The marketing landing, the auth flow, and the admin portal stay live. Guests who arrive get a "we'll be back shortly, your booking is safe" message with a contact email. Implemented as a Cloudflare Page Rule; takes effect inside a minute. The auth and admin surfaces staying live means Pat and ops can keep diagnosing without losing tooling.

**Tier 3 — full rollback.** If the broken commit is on `main`, revert to the last-known-good Vercel deployment via the dashboard's "Promote to Production" button on a prior deployment. Vercel keeps the rollback history; this is sub-minute. Combine with Tier 1 if needed.

**Status posting.** Whichever tier we're at, post on the agreed pilot-comms channel within 15 minutes of the trigger. Default channel is the Slack DM thread between Pat, ops, and the partner; status page is overkill for a one-property pilot. Re-post on resolution. No tweets or public-facing comms during pilot regardless of severity.

**Database.** No rollback needed for data — `Booking`, `Guest`, `MessageLog` are append-or-upsert and intact through any front-end issue. If a real data corruption event occurs (it shouldn't — there are no destructive paths in the pilot), Supabase's PITR window covers it.

**Trigger ownership.** The Tier 1 disable is owned by Kovena ops, not Koncie. Confirmed contact + escalation path before launch:

| Role | Name | Contact | Notes |
| --- | --- | --- | --- |
| Koncie product / on-call | Pat | TBD | Primary |
| Kovena ops on-call | TBD | TBD | Owns Tier 1 disable on Namotu tenant |
| Partner contact | TBD | TBD | Pilot-side coordination |

---

## 4. First-30-days pilot success metrics

Reference: the board-deck targets are **insurance attach > 5% and flights attach > 3% across 100 hotels and 50,000+ guest accounts by end of 2026.** For one property over 30 days, those numbers are interpolated downward both in volume and (somewhat) in attach rate, since a single resort doesn't get the full distribution effect of the platform.

Namotu Island Fiji as the pilot is a reasonable single-property baseline: it's a 5-star surf/fishing destination resort, guests are travelling internationally, the cohort actually wants insurance and is likely to buy ancillaries — so attach rates should land closer to the board target than a generic city hotel would. The interim targets below assume that.

### Volume targets (30 days)

| Metric | Interim target | Notes |
| --- | --- | --- |
| HotelLink bookings ingested | ≥ 30 | Reflects Namotu's typical 30-day booking volume; refine once the seed is in |
| Guest accounts created (magic-link claimed) | ≥ 60% of ingested | Email-claim rate, not unique-guest rate |
| Active hub sessions | ≥ 40% of created accounts | At least one `/hub` page-view post-claim |

### Attach-rate targets (30 days, against ingested bookings)

| Ancillary | Interim target | Board target end-2026 |
| --- | --- | --- |
| Insurance attach | ≥ 4% | > 5% |
| Flights attach | ≥ 2% | > 3% |
| On-property upsell engagement | ≥ 10% click-through | Not in board deck — Namotu-specific signal |

Interim attach rates sit a touch below the board targets because (a) one property has no platform halo effect, (b) the first 30 days carry onboarding noise as we tune the offer cards and timing, and (c) a single CoverMore product without iteration is a narrower funnel than the eventual multi-product mix.

### Operational targets

| Metric | Target | Notes |
| --- | --- | --- |
| P0 incidents | 0 | Site-down or cohort-blocking |
| P1 incidents | ≤ 2 | With same-day resolution |
| Magic-link delivery rate | ≥ 98% | Resend `delivered` events / sent |
| LCP p75 (field) | < 3.0s | Looser than lab gate to allow for true Pacific variance |
| Sentry error rate | < 1% of sessions | Production-grade baseline |

A formal review at day 30 (target: 2026-05-31, contingent on launch date) decides whether to proceed to the second pilot hotel and what Sprint 9's prioritisation looks like.

---

## 5. Sign-off

Launch is gated on three signatures. None of them are pro forma — each signer is attesting they've read the launch criteria above and accept the residual risk on items that aren't ticked.

**Pat — Koncie product / on-call**

- Name: Pat
- Date:
- Signature:
- Notes / accepted residual risks:

**Kovena ops — owns the Tier 1 invitation-trigger disable**

- Name: TBD — Pat to confirm
- Date:
- Signature:
- Notes / accepted residual risks:

**Pilot partner — Namotu Island Fiji**

- Name: TBD — Pat to confirm
- Date:
- Signature:
- Notes / accepted residual risks:

Once all three are signed and the launch-criteria checklist is clean (or carries written acceptance for any unticked item), Kovena ops enables the HotelLink-side invitation trigger on Namotu's tenant. The pilot is live from that moment.
