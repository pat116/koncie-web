# Data Model (Prisma v1)

Reference for the four entities introduced in Sprint 1. Source of truth is `apps/web/prisma/schema.prisma` — update this doc when that file changes.

## Entities

### Guest

A traveller. Created at booking-ingestion time (email, first name, last name). `auth_user_id` is populated when the guest claims the account via magic link.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `email` | text | unique; the linking key across the system |
| `first_name`, `last_name` | text | captured at booking ingestion |
| `auth_user_id` | uuid? | nullable, unique; references Supabase's `auth.users.id` |
| `claimed_at` | timestamptz? | set once, on first successful link |
| `created_at`, `updated_at` | timestamptz | |

### Property

A hotel. Owned by a partner integration.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `slug` | text | unique, kebab-case (e.g. `namotu-island-fiji`) |
| `name` | text | display name |
| `country` | text | ISO 3166-1 alpha-2 (e.g. `FJ`) |
| `region` | text | free-form (e.g. `Fiji`) |
| `timezone` | text | IANA (e.g. `Pacific/Fiji`) |
| `partner_integration_id` | uuid (fk) | → PartnerIntegration |

### PartnerIntegration

A PMS/OBE link (HotelLink, SiteMinder, Opera, ...). Config is per-partner JSON, validated in TypeScript at the adapter boundary.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `type` | enum | `HOTELLINK`, `SITEMINDER`, `OPERA` |
| `name` | text | unique, human-readable (e.g. `HotelLink — Namotu pilot`) |
| `config` | jsonb | per-partner credentials + webhook secrets |

### Booking

A guest's stay. `external_ref` is the idempotency key for ingestion (seed script today, real webhooks in Sprint 7).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid (pk) | |
| `guest_id` | uuid (fk) | → Guest |
| `property_id` | uuid (fk) | → Property |
| `external_ref` | text | unique; the PMS booking ID |
| `check_in`, `check_out` | date | |
| `num_guests` | int | |
| `status` | enum | `CONFIRMED`, `CANCELLED`, `COMPLETED` |

## Relationships

- `Guest 1:M Booking`
- `Property 1:M Booking`
- `PartnerIntegration 1:M Property`
- `Guest 0..1:1 auth.users` (via `auth_user_id`, nullable until claim)

## Indexing

All `id`, unique (`email`, `slug`, `external_ref`, `PartnerIntegration.name`, `Guest.auth_user_id`) fields are indexed automatically. Additional composite indexes will be added in Sprint 2+ when query patterns emerge.

## Intentionally deferred entities

Arrive in the sprint whose code needs them:

| Entity | Sprint |
|---|---|
| `Upsell`, `Transaction` | Sprint 2 (MoR payment foundation) |
| `FlightBooking` | Sprint 3 (Jet Seeker integration) |
| `InsurancePolicy` | Sprint 4 (CoverMore) |
| `Message` | Sprint 6 (pre-arrival comms) |
| `HotelStaffUser`, `AdminAuditLog` | Sprint 5 (hotel admin portal) |

Adding them ahead of time would produce migrations we'd regret when the shape of their usage becomes clear.
