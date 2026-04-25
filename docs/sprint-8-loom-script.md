# Sprint 8 — Loom walkthrough script

**Format:** Narration script and shot list for a Loom screen recording. Read off the prose underneath each shot at a slow, conversational pace.
**Status:** Script only. The recording itself happens against the preview URL with the Namotu seed data once Sprint 8 hardening is signed off.

---

## Duration target

Four to five minutes total. Closer to four if the narrator moves smoothly between screens. Don't rush the hub page — that's the moment the brand should land.

## Audience

Namotu Island Fiji front-desk and operations staff, plus the Namotu GM. They'll watch this once before the soft launch and once more on the morning of go-live. It is not for engineers and not for marketing — it is for the people who will be in the room when a guest first asks "what is Koncie?"

---

## Shot list and narration

### Shot 1 — The HotelLink booking confirmation page (about 30 seconds)

**On screen:** Namotu's existing HotelLink-powered booking page, with a confirmation screen showing a fresh test booking — guest name, dates, room, total in FJD. Koncie is not visible anywhere.

**Narration:** "Here's the thing to notice first. This is a guest finishing a booking on the Namotu site, exactly the way they do today. They've picked their dates, they've put their card in, they've got a confirmation. There is nothing on this page that mentions Koncie, and that's deliberate. The booking flow your guests already know, the one that runs through HotelLink, doesn't change at all. Koncie sits quietly in the background, listening."

### Shot 2 — The "your trip hub is ready" email (about 30 seconds)

**On screen:** Resend preview pane showing the Koncie welcome email landing in the guest's inbox a few seconds after the booking. Subject line "Your trip hub is ready". The email is brand-clean — Koncie navy header, sand background, a single green call-to-action button.

**Narration:** "A few seconds later, this email arrives in the guest's inbox. It's from Koncie, it's branded, and it has one job — get the guest to the trip hub for their stay. There's no password to set up, no account to create. The button in the email signs them straight in. Let's follow it."

### Shot 3 — The Koncie guest hub (about 60 to 75 seconds; pause 3 seconds when the page first loads)

**On screen:** The `/hub` page for the seeded Namotu guest. Booking summary card at the top with property name, check-in and check-out dates, number of guests. Below that, a short pre-arrival checklist. Below that, a row of activity offer cards from Namotu's inventory — surf coaching, fishing on Cobalt and Obsession, Cloud9 day trip, kitesurfing, SUP, scuba, spearfishing, wellness and yoga, packaged experiences. To the side or beneath, a single travel-insurance offer card branded as CoverMore.

**Narration:** "And here we are. This is the trip hub. Pause for a moment and let it land — this is what a Namotu guest sees the first time they open Koncie." (Pause three seconds.) "At the top is their booking, pulled in directly from the HotelLink record so the dates and the guest count always match what reception sees. Underneath, a short pre-arrival checklist — flight details, dietary preferences, the kind of small thing that's nicer to do from the couch at home than at the desk after a long flight. And then the part that matters commercially — Namotu's activities, all of them, available to pre-book. Surf coaching, the boats, Cloud9, kite, scuba, the wellness sessions, the packaged days. Provided by Namotu Island Fiji, presented by Koncie. And here, a travel insurance offer powered by CoverMore for the guests who want it."

### Shot 4 — Activity ancillary checkout (about 45 seconds)

**On screen:** Guest clicks the Cloud9 day trip card. A checkout flow appears — date picker for the day they want to go, number of guests, total in FJD, card field, a clear "Pay" button. The page header says "Cloud9 day trip — provided by Namotu Island Fiji". The footer notes "Powered by Koncie". Use sandbox payment data for the recording.

**Narration:** "Say they want to do Cloud9 on the Tuesday of their stay. They click the card, they pick the day, they put in their card details, they pay. The transaction runs through Koncie in the background, but the experience the guest sees is the Namotu activity, the Namotu price, the Namotu inventory. When the boat goes out on Tuesday, that booking is on the daily manifest the same way every other pre-paid booking is."

### Shot 5 — One-click insurance via CoverMore (about 30 seconds)

**On screen:** Back on `/hub`, guest clicks the CoverMore travel insurance offer card. A short, simple confirmation screen appears — quoted premium based on dates and traveller count, a brief plain-English summary of what's covered, a single button to confirm. The page is branded Koncie with "Powered by CoverMore" attribution. Click confirm; success state appears.

**Narration:** "Insurance is even simpler. Koncie already knows the dates, it already knows how many guests are travelling, so the quote is one click away. The guest reads the summary, taps confirm, and CoverMore issues the policy. They get the policy document by email straight from CoverMore. The desk doesn't see this transaction, doesn't have to file anything, doesn't have to chase anything."

### Shot 6 — Confirmation email and updated itinerary (about 20 seconds)

**On screen:** Two things in quick succession. First, the Resend preview of the activity confirmation email landing in the guest's inbox. Then, a quick switch back to the trip hub, where the Cloud9 booking and the insurance policy now appear on the itinerary alongside the room booking.

**Narration:** "The guest gets a confirmation email for the activity, a separate one for the insurance, and when they open the trip hub again everything sits together on a single itinerary. By the time they land in Nadi, they already know what they're doing on the Tuesday, they're already covered, and they have one place to look it all up."

### Shot 7 — The Namotu admin portal (about 30 seconds)

**On screen:** Switch to Namotu's admin portal view. Open the daily activities manifest for the relevant day — the Cloud9 booking the guest just made appears as a pre-paid line, source "Koncie". Then briefly open the revenue view — the insurance purchase appears under ancillary revenue.

**Narration:** "And this is what the desk sees. The Cloud9 booking shows up on the daily manifest, marked pre-paid, source Koncie. The insurance shows up in revenue, again attributed to Koncie. Nothing new to learn — the manifest you check every morning still tells you who's on which boat. The only difference is that some of those names got there before they arrived."

### Closing (about 15 seconds)

**On screen:** Back on the `/hub` page, gentle hold on the hero.

**Narration:** "That's the whole loop. The guest books Namotu the way they always have, Koncie quietly opens a trip hub for them, and they get a clean way to plan their stay before they fly in. Any questions, the support contact is on the printed handout at the desk. Thank you — you're the first team in the world to walk a guest through this."

---

## Recording notes

- Pace: slow and conversational. Aim for the speed you'd use explaining a new check-in process to a colleague over coffee, not a product demo.
- Pauses: take a clean three-second pause when the `/hub` page first loads in Shot 3. That's the brand moment. Resist the urge to talk over it.
- Visuals: use the preview URL with the Namotu seed data. Sandbox payment credentials only. Don't use a real card and don't use a real guest's name.
- Off-limits screens: do not show any Kovena-internal admin screens, do not open the Vercel dashboard, do not show database tables or the Supabase console. Everything in the recording should be either guest-facing or Namotu-admin-facing.
- Branding: Koncie navy and sand should be visible on the hub. If anything renders unstyled or with a flash of unstyled content, stop the recording and reload before continuing.
- Audio: a quiet room and a decent microphone matter more than any edit. One unbroken take is fine; pauses to collect a thought are fine.
- Out of scope for the script: AI concierge, room upgrades, digital check-in, activities outside Namotu's existing inventory. None of these are in MVP, and none of them belong in this video.
