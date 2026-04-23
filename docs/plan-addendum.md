# Koncie Prototype Plan — Addendum

**Date:** 2026-04-23
**Status:** Companion to `2026-04-23-koncie-prototype-plan.md`
**Purpose:** Captures clarifications Pat provided after the plan was drafted. Treat this as source of truth where it conflicts with the original.

---

## 1. Answered Sprint-0 blockers

Three of the ten open questions from the plan (Section 6) are now resolved:

**Q1 — Jet Seeker acquisition status:** Closed / open. Jet Seeker is live and will be connected to meta-search engines (Skyscanner, Kayak, Momondo, Cheapflights.com.au) to drive user acquisition into its flight booking funnel. Note: the directionality is meta-search → Jet Seeker, not Jet Seeker aggregating meta-search inventory (which is how the board deck Section 6 phrased it). The Pat-confirmed model is commercially cleaner: pay meta-search for traffic, close bookings inside Jet Seeker's OTA.

**Q2 — Anchor PMS for MVP:** HotelLink. Critically, **HotelLink is Kovena-owned**, which removes the external-partner-contract risk from Phase 1 entirely. That has a few downstream effects:

- No revenue-share negotiation blocking Sprint 7
- Full API access, with the option to modify HotelLink itself if needed to accommodate Koncie's invitation links, tokenised booking IDs, or webhooks
- Data model for `Booking` should start from HotelLink's schema, not an abstracted partner-agnostic generic
- The "low-touch integration" positioning still matters for future PMS partners, but for MVP, there's no low-touch constraint

**Q3 — Insurance provider for MVP:** Not yet named. Still to decide (CoverMore or Allianz were proposed). Not a Sprint 0 blocker; needed by Sprint 4.

## 2. Reframing: Koncie as the member area over Jet Seeker + HotelLink

This is the biggest conceptual shift from the original plan.

**Original framing (in the plan):** Koncie is a post-booking hotel guest app that also sells flights and insurance.

**New framing (per Pat):** Koncie is the unified member/account area that sits on top of two Kovena-owned products — Jet Seeker (flights) and HotelLink (PMS/hotels) — and wraps them with a shared identity, itinerary view, and ancillary storefront (insurance, activities, on-property upsells).

In this model:

- A user who books a flight on Jet Seeker lands in Koncie as their trip hub
- A user who books a hotel via a HotelLink-powered site also lands in Koncie as the same trip hub, with the same account
- Koncie does not re-do flight search or room search; those live in Jet Seeker and HotelLink respectively
- **Koncie's native transactional surface is the ancillary layer only** — insurance, activities, transfers, on-property upsells
- This is consistent with the plan's non-negotiable of "never touch the original room booking transaction" — and now extends the same principle to flight booking transactions

This framing simplifies MVP in one important way: we're not rebuilding flight search. We're ingesting Jet Seeker itineraries into Koncie's member profile and overlaying ancillary offers.

## 3. Implications for the sprint plan

The 10-week sequence in Section 5 of the plan mostly holds, with two adjustments:

**Sprint 3 reframed** — from "Flights via Jet Seeker / Kovena Flights" to **"Jet Seeker itinerary ingestion"**:

- Pull flight booking data from Jet Seeker into the Koncie member profile (webhook or polled API, depending on what Jet Seeker exposes today)
- Render flight itinerary in the Koncie Hub
- Trigger insurance / activity offers contextually from the flight's destination and dates
- No flight search UI built inside Koncie for MVP (could be a Phase 2 inline embed if the product research justifies it)

Sprint 3 is now smaller — effectively a week of integration work plus a week of hub UI refinement. That buys schedule back into the pilot runway.

**Sprint 7 simplified** — "HotelLink connector" becomes an internal Kovena integration rather than a partner-channel integration:

- Direct API access, not a partner sandbox
- Can coordinate with the HotelLink team directly on any necessary changes to HotelLink's confirmation page or webhook shape
- Low-touch partner positioning is a Phase 2 concern (once we onboard STAAH, Levart, Opera etc.)

Everything else in the sequence (Sprint 0 foundation, Sprint 1 hub+auth, Sprint 2 MoR payment foundation, Sprint 4 insurance, Sprint 5 admin, Sprint 6 comms, Sprint 8 pilot hardening) is unchanged.

## 4. Implications for architecture

Two meaningful updates to Section 3 of the plan:

**Domain model** — `Booking` becomes a supertype with two concrete flavours for MVP:

- `FlightBooking` — sourced from Jet Seeker, not owned by Koncie's ledger of record
- `HotelBooking` — sourced from HotelLink, not owned by Koncie's ledger of record

Both feed into a single `Itinerary` that Koncie owns. Ancillary purchases (insurance, activities) are owned by Koncie.

**Provider ports** — the `FlightProvider` port becomes a **`FlightItinerarySource`** port for MVP (read-only: "give me this user's bookings"). Adding flight search/book as a port becomes a Phase 2 consideration.

**Authentication** — single sign-on across Jet Seeker, HotelLink, and Koncie becomes a first-class architectural concern. Options:

- Koncie owns the identity layer; Jet Seeker and HotelLink delegate to it (cleaner long-term, requires auth migration in those apps)
- Federated identity across three apps with a shared token store (faster to MVP, messier long-term)
- For MVP: a simple email-based account linking — Koncie creates accounts on-demand from Jet Seeker or HotelLink booking data using the guest email as the link key. Good enough for pilot; refactor later.

## 5. Remaining open questions (still unanswered)

From the original plan's 10:

- Q3 — Which insurance provider for MVP? (needed by Sprint 4)
- Q4 — Which Fiji pilot hotel(s)?
- Q5 — Existing Kovena payments SDK/API surface, or build fresh?
- Q6 — Existing Kovena/Jet Seeker codebase to integrate with, or greenfield? (Given the repo `koncie-web` is fresh, assuming greenfield for now)
- Q7 — Are the original Lovable prototype screens available anywhere beyond the index file?
- Q8 — Is IATA Lite accreditation a pre-launch blocker or can it lag?
- Q9 — Brand direction (logo, colour palette, type system)?
- Q10 — Design resource or proceed with my proposed direction?

New questions surfaced by the reframing:

- **Jet Seeker's current tech stack** — language, framework, API shape, auth model. Determines how we ingest itineraries.
- **HotelLink's current tech stack** — same, plus: does it already emit webhooks for bookings, or do we need to add that?
- **SSO strategy** — do we want to consolidate identity across Jet Seeker + HotelLink + Koncie now, or defer?
- **Is there existing Jet Seeker branding?** The plan mentioned "Kovena Flights" as a potential rebrand of Jet Seeker. If Jet Seeker is staying branded as Jet Seeker in the consumer-facing flow, that changes Koncie's role from "trip hub masking the Jet Seeker origin" to "trip hub that explicitly references Jet Seeker-branded flights".

---

## 6. Round 2 — answers received 2026-04-23 afternoon

After this addendum was first drafted, Pat answered the remaining sprint-blocker questions. Captured here verbatim with implications.

### 6.1 Answers to open questions

| Question | Answer | Sprint gate |
|---|---|---|
| SSO strategy | (c) Email-based account linking for MVP — auto-create Koncie accounts on ingestion using guest email as the link key; defer real SSO to Phase 2 | Sprint 1 |
| Jet Seeker branding | Stay Jet Seeker-branded inside Koncie (confirmed by prototype: "Koncie Flights Powered by JetSeeker") | Sprint 3 |
| Kovena payments SDK | Greenfield for prototype demo purposes only — no production SDK wiring required for MVP; wire real payments in Phase 2 | Sprint 2 |
| Insurance provider | **CoverMore** | Sprint 4 |
| HotelLink webhooks | Build it into HotelLink once requirements are known (Kovena-owned, no partner negotiation) | Sprint 7 |
| Fiji pilot hotel | Any random 5-star resort for MVP — real property selection deferred | Sprint 8 |
| IATA Lite accreditation | **Not** a pre-launch blocker — accreditation lifts margin per flight booking but the pilot can ship without it | Phase 2 |
| Design resource | No dedicated designer. Pat open to UI suggestions. The uploaded Koncie Deck + live Lovable prototype together form the reference brief | Every sprint |

### 6.2 Jet Seeker technical stack (confirmed)

From Pat's uploaded "Jetseeker Technical Overview":

- **Backend**: Symfony (PHP) + Composer
- **Frontend**: JavaScript + Webpack + Redux
- **Database**: PostgreSQL via Doctrine ORM
- **Infrastructure**: Docker + Nginx + Supervisor
- **CI/CD**: GitLab
- **Flight inventory**: Amadeus (SOAP/WSDL)
- **Payment processing**: FatZebra (**not** Kovena — confirms Jet Seeker's own flight transactions stay in Jet Seeker; Koncie only touches ancillaries)
- **CRM**: HubSpot
- **Key data**: `Order` table keyed on `email` with a JSONB `object` blob carrying the full itinerary

**Recommended ingestion approach for Sprint 3**: add a thin Symfony endpoint on Jet Seeker that POSTs a booking-completion event to a Koncie webhook. Payload = the `Order` row (email + JSONB itinerary). Koncie upserts the user (email as key) and the `FlightBooking`. ~1 day of Symfony work on Jet Seeker side; no polling, no direct database access, no Kovena infrastructure coupling.

**Do not read Jet Seeker's PostgreSQL directly** — keep the integration as a loose HTTP contract so Jet Seeker stays free to evolve its schema.

### 6.3 Lovable prototype — design reference

Live at `https://koncierge-portal-mockup.lovable.app`.

**Design tokens (lifted from the running app)**:

```css
--koncie-navy:      #001F3D  /* hsl(210 100% 12%) — primary */
--koncie-sand:      #F7F3E9  /* hsl(45 45% 94%)  — secondary / muted background */
--koncie-green:     #2DC86E  /* hsl(145 63% 48%) — accent */
--koncie-white:     #FFFFFF
--koncie-charcoal:  #333333  /* primary text */
--koncie-border:    #E4DECD  /* warm sand border */
--koncie-radius:    1rem     /* 16px — applied everywhere */
```

**Typography**: Poppins (body + headings).

**Hero imagery**: the uploaded Koncie Deck sets tropical/ocean beach photography as the emotional register. Use deck aesthetic for hero moments; use the navy+sand+green palette for UI chrome.

**Attribution pattern**: "Powered by [Provider]" labels are already established in the prototype ("Powered by JetSeeker", "Powered by Viator"). Apply the same convention to "Powered by CoverMore" for insurance and "Powered by HotelLink" where consumer-facing.

**MoR-only principle reinforced in UI**: the `/payment` route's empty-state copy reads *"Your resort booking is already paid for. You don't have any add-ons selected for payment."* Keep this copy verbatim in the rebuild — it is the single best guest-facing explanation of Koncie's ancillary-only scope.

### 6.4 Prototype route build status

| Route | Status | Notes |
|---|---|---|
| `/` (index) | Rich | Workflow step cards + supporting pages directory |
| `/koncie-hub-user` | Rich | Main registered-user hub — anchor design |
| `/flight-search` | Rich | Full flight results UI; "Koncie Flights Powered by JetSeeker" branding confirmed |
| `/koncie-admin` | Rich | 12-section admin portal (more than MVP needs — see §6.5) |
| `/workflow-diagram` | Rich | Interactive application map |
| `/koncie-hub-non-user` | Stub | "Welcome to Koncie" placeholder |
| `/payment` | Stub | Empty-state copy (load-bearing — see §6.3) |
| `/resort-booking`, `/message-demo`, `/email-confirmation`, `/registration`, `/welcome` | Not walked | Review when the relevant sprint reaches them |

### 6.5 Scope trim based on prototype review

The prototype's `/koncie-admin` is richer than MVP needs — 12 nav sections, draggable dashboard widgets, multi-chart analytics, staff performance tracking, revenue optimisation module. For the pilot:

- **Keep in MVP (Sprint 5)**: Guests list · Bookings list · Priority Alerts · Upsell Revenue KPI · basic messaging
- **Defer to Phase 2**: Advanced Analytics, Revenue Optimization module, draggable widget layout system, Staff Performance analytics, F&B management

### 6.6 Pilot property — resolved

**Pilot property: Namotu Island Fiji** — https://www.namotuislandfiji.com

- **HotelLink customer** (confirmed by Pat). The HotelLink webhook ingestion path scoped in §6.2 / CLAUDE.md runs end-to-end against this property — no SiteMinder detour required.
- **Fiji pilot market thesis unchanged**: aligns with the board-level Q2 2026 Fiji target.
- **Ancillary surface is unusually rich for demo purposes** — surf coaching, fishing charters (Cobalt, Obsession), jet ski, outrigger canoe, kitesurfing, foiling, SUP, snorkelling & SCUBA, spearfishing, Cloud9 day trips, wellbeing/yoga, private coaching, boutique. Use this inventory as the **seed-data template** in Sprint 2/3 so the demo activity storefront reflects realistic Pacific-resort economics, not generic stock.
- **Already insurance-aware**: the resort surfaces travel insurance to guests directly — the CoverMore cross-sell lands naturally in the demo.
- **Packaged experiences** (Signature Weeks, Family Weeks, Kalama Kamps) give Sprint 6 a real-world test case for the pre-stay cross-sell surface.

**Adjacent reference, not the pilot**: **The Rarotongan Beach Resort & Lagoonarium** (Aroa Beach, Rarotonga, Cook Islands) — on SiteMinder Canvas, not HotelLink. Hold as a Phase 2 regional-expansion reference if/when SiteMinder becomes a second PMS/OBE adapter. Do not build against it for MVP.

All Sprint 0 decisions are now unblocked. One decision remains for the Sprint 0 checkpoint: Postgres hosting (Supabase is the pragmatic default given AWS-access constraints — re-evaluate post-pilot).

---

## Files updated by this addendum

- `Koncie/Planning/2026-04-23-plan-addendum.md` (this file — Round 2 appended)
- `Koncie/Planning/repo-scaffold/CLAUDE.md` (brand tokens updated; Jet Seeker stack noted; CoverMore as insurance partner; "Powered by [Provider]" attribution convention added to non-negotiables)
- `Koncie/Planning/repo-scaffold/docs/sprint-0-brief.md` (placeholder blue/cyan palette replaced with real Koncie tokens; live Lovable prototype added as visual reference; brand-direction checkpoint question removed — it's now settled)

Original plan (`Koncie/Planning/2026-04-23-koncie-prototype-plan.md`) is unchanged. Read this addendum alongside it.
