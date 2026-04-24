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

- [ ] Lighthouse accessibility score ≥ 95 on `/`, `/hub`, `/sign-in`, `/welcome`, `/flights`, `/insurance`, `/checkout`, `/admin`, `/admin/messages`, `/admin/bookings`
- [ ] Zero Axe violations of severity "serious" or "critical" across the same routes
- [ ] Manual VoiceOver pass on iOS Safari for the four guest-facing routes — no journey-blocking issue
- [ ] Manual TalkBack pass on Android Chrome for the four guest-facing routes — no journey-blocking issue
- [ ] Brand-green CTA contrast resolved (either passes AA on koncie-sand, or restricted to large text + iconography with sign-off)

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

If sandbox parity isn't possible this week, alternative: passing run against the Sprint 7 mock test route, with Pat's written acceptance that production sandbox parity is a 48-hour post-launch follow-up rather than a launch blocker.

### CoverMore sandbox purchase

- [ ] Offer card renders on `/insurance` for a seed booking with realistic premium
- [ ] Quote round-trip through the CoverMore sandbox returns
- [ ] FatZebra sandbox card form completes payment
- [ ] Policy bind succeeds; policy number persisted
- [ ] `INSURANCE_RECEIPT` email dispatched, visible in `/admin/messages` as DELIVERED

### Namotu seed-data realism

- [ ] Property record reflects Namotu Island Fiji (name, slug, hero imagery, location, "Powered by HotelLink")
- [ ] Demo guest has a plausible booking window (post-2026-05-01 check-in)
- [ ] Activities / on-property upsells reflect what Namotu actually offers (surf, fishing, dining)
- [ ] Pricing reads as plausible for a 5-star Fiji surf/fishing resort

(Owned by parallel agent this week; tick at review.)

### Engineering verification bar

- [ ] `pnpm -r typecheck` green
- [ ] `pnpm -r lint` green
- [ ] `pnpm -r test` green (~144+ baseline)
- [ ] `pnpm -r build` green
- [ ] No new Sentry errors of severity error or fatal in the 24 hours before review

---

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
