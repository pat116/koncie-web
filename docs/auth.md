# Auth

Koncie's auth is a **two-hop flow**: a Koncie-signed JWT magic link carries booking context into the app, then Supabase Auth's magic link handles the actual credential exchange. This keeps the Koncie entry point independent of Supabase (we could swap identity providers without reissuing signed booking links) while still using Supabase for credential storage and session management.

## Step-by-step sequence

### 1. Ingestion (mocked in Sprint 1, real HotelLink webhook in Sprint 7)

- `HotelLinkMockAdapter` (or the real Sprint 7 adapter) upserts `PartnerIntegration`, `Property`, `Guest`, `Booking` rows.
- `Guest.auth_user_id` is `null` at this point — the guest has no account yet.

### 2. Koncie-signed magic link issuance

- Seed script (Sprint 1) or hotel admin action (future) calls `signMagicLink({ bookingId, guestEmail, expiresInSeconds })`.
- Returns a JWT signed HS256 with `KONCIE_SIGNED_LINK_SECRET` (hex-only, ≥32 chars).
- URL shape: `https://koncie-web.vercel.app/welcome?token=<JWT>`.

### 3. Non-user landing (`/welcome?token=...`)

Server component at `apps/web/src/app/welcome/page.tsx`:
1. `verifyMagicLink(token)` validates signature + expiry + payload shape.
2. Looks up `Booking` by `payload.bookingId`.
3. Confirms `booking.guest.email === payload.guestEmail`.
4. On any failure, renders a neutral `This link has expired` page (no leakage of which check failed — Sentry logs capture details).
5. On success, renders the personalized landing: greeting, booking summary, preview cards, CTA.

### 4. Magic-link request (CTA click → `/register`)

Server action at `apps/web/src/app/register/actions.ts`:
```ts
await supabase.auth.signInWithOtp({
  email: guest.email,
  options: { emailRedirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback` },
});
```
Supabase sends the auth email via Resend SMTP (configured in Supabase dashboard → Authentication → SMTP Settings). Guest sees the "check your email" state.

### 5. Supabase callback (`/auth/callback?...`)

Route handler at `apps/web/src/app/auth/callback/route.ts` accepts **both** Supabase flow variants:
- **PKCE flow** (`?code=...`): `supabase.auth.exchangeCodeForSession(code)`
- **OTP token flow** (`?token_hash=...&type=signup|magiclink|email`): `supabase.auth.verifyOtp({ type, token_hash })`

Either path yields a session + user. Then `linkGuestToAuthUser({ email, authUserId })` sets `Guest.auth_user_id` and `claimed_at` (first time only), and we redirect to `/hub`.

Supporting both is necessary because Supabase's default email template uses the OTP flow (redirects via `/auth/v1/verify`), not PKCE.

### 6. Session maintenance

`apps/web/src/middleware.ts` → `updateSession(request)`:
- Refreshes expired access tokens via the refresh-token cookie on every non-static request
- Gates `/hub/*` on a session — redirects to `/welcome` if no user

## Security notes

- **Two secrets, two jobs.** `KONCIE_SIGNED_LINK_SECRET` signs the booking-context token. Supabase has its own secret for OTP codes. Compromising one does not compromise the other.
- **Email mismatch protection.** Even with a valid Koncie JWT, we verify the booking's guest email matches the payload email — stops a forwarded link from being exploitable by anyone other than the intended recipient.
- **Short expiry.** Seed links default to 7 days. Real Sprint 7 links can be shorter.
- **Revocation.** No per-token revocation table. If the signing secret leaks, rotate `KONCIE_SIGNED_LINK_SECRET` in both Vercel env vars and `apps/web/.env` — all outstanding Koncie-signed links invalidate on next verify.
- **Base64 character gotcha.** Generating the signing secret with `openssl rand -hex 32` is safe. `openssl rand -base64 32` can produce `/` and `+` characters that some dotenv/JWT round-trips mishandle (we hit this in Sprint 1 implementation). Use hex.

## Testing

| Test | File | Coverage |
|---|---|---|
| `signed-link` unit tests | `apps/web/src/lib/auth/signed-link.test.ts` | round-trip, tampered signature, expiry, wrong secret |
| `guest-linking` unit tests | `apps/web/src/lib/auth/guest-linking.test.ts` | first link, idempotent re-link preserves `claimedAt`, throws on missing Guest |
| End-to-end (deferred) | `apps/web/tests/e2e/guest-journey.spec.ts` | seed → magic link → welcome → register → callback → hub |

## Configuration checklist

Required env vars (both `apps/web/.env` locally and Vercel Production + Preview scopes):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key; new Supabase format)
- `SUPABASE_SERVICE_ROLE_KEY` (secret key)
- `KONCIE_SIGNED_LINK_SECRET` (hex, ≥32 chars)
- `NEXT_PUBLIC_SITE_URL` (production URL)
- `RESEND_API_KEY`
- `DATABASE_URL`, `DIRECT_URL` (Prisma)

Supabase dashboard configuration:
- **Authentication → URL Configuration → Redirect URLs**: add `{site-url}/auth/callback` for each environment (localhost, preview, production). Supabase rejects redirects to non-whitelisted URLs.
- **Authentication → SMTP Settings**: custom SMTP enabled with Resend (host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender `Koncie <onboarding@resend.dev>` for dev or `noreply@koncie.app` for prod).

## Deferred

- Social login (Google, Apple) — Phase 2
- SMS authentication — Sprint 6 when Twilio lands
- Password auth — never in scope; Koncie is magic-link-only
- Account-deletion self-service — Phase 2 (manual ops until then)
