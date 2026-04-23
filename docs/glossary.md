# Glossary

Terms used across the Koncie repo and product docs.

**Ancillaries** — flights, insurance, activities, transfers. Anything that is NOT the core room booking. Koncie is the Merchant of Record for ancillaries only.

**Claimed account** — a `Guest` row where `auth_user_id` is populated. Before claiming, the Guest exists as contact info only — created at booking-ingestion time.

**HotelLink** — the PMS our pilot hotel Namotu uses. Sprint 7 builds the live integration; Sprint 1 mocks it via `HotelLinkMockAdapter`.

**Hub** — the signed-in guest surface at `/hub/*`. Post-booking, post-sign-in destination. Bottom-nav items: Home, Trip, Messages (Sprint 6), Profile.

**IATA Lite** — limited travel-agent accreditation that lifts our flight booking margin. Not a pre-launch blocker — deferred to Phase 2.

**Jet Seeker** — Kovena-acquired flight search provider. Surfaces as "Koncie Flights · Powered by JetSeeker" in guest-facing UI.

**Magic link** — passwordless sign-in URL containing a one-time code. **Two distinct magic links** in the Koncie flow:
- **Koncie-signed** — JWT signed with `KONCIE_SIGNED_LINK_SECRET`; carries booking context (booking_id, guest_email); delivered out-of-band today (seed-script print in Sprint 1; HotelLink webhook → Koncie email in Sprint 7); hydrates the non-user landing page before the guest has any account.
- **Supabase-signed** — issued by Supabase Auth when `signInWithOtp()` is called; the actual auth ceremony; delivered via Resend SMTP; clicking it lands on `/auth/callback` and establishes a session.

**MCC 4722** — Merchant Category Code for Travel Agencies and Tour Operators. All Koncie ancillary transactions are stamped with this (see `Transaction.mcc` in `packages/types/src/transaction.ts`).

**Merchant of Record (MoR)** — legal entity that owns the customer transaction. Koncie/Kovena is MoR for ancillaries; the hotel remains MoR for the room booking.

**OBE** — Online Booking Engine. Examples: HotelLink, STAAH, Levart, Opera. Koncie integrates with these via the `PartnerAdapter` port in `@koncie/types`.

**Partner / partner integration** — a PMS or OBE that feeds us bookings. Each is modelled as a `PartnerIntegration` row + a `PartnerAdapter` implementation under `apps/web/src/adapters/`.

**PMS** — Property Management System. Hotel's back-office booking system. HotelLink is both a PMS and an OBE.

**"Powered by" attribution** — brand attribution pattern: "Koncie Flights · Powered by JetSeeker", "Koncie Activities · Powered by [provider]". Retains origin visibility while presenting a unified guest surface.

**Resend** — email delivery service. Configured as Supabase Auth's custom SMTP override (Settings → Authentication → SMTP) so magic-link emails ship from `Koncie <onboarding@resend.dev>` (sandbox) or `noreply@koncie.app` (once a domain is verified).

**Signed link** — see "Magic link / Koncie-signed" above.

**Trust account** — segregated bank account holding guest ancillary payments before payout to providers. MoR regulatory requirement; not modelled in Sprint 1 but referenced in `Transaction.trust_ledger_ref` in `packages/types/src/transaction.ts` for Sprint 2.
