import crypto from 'node:crypto';
import {
  PrismaClient,
  PartnerType,
  BookingStatus,
  AdminRole,
  MessageKind,
  MessageStatus,
} from '@prisma/client';
import { signMagicLink } from '../src/lib/auth/signed-link';

const prisma = new PrismaClient();

async function main() {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'Refusing to seed Production DB. Seed is for dev + preview only.',
    );
  }

  // Hard reset for idempotent dev seeding. Delete in FK-safe order.
  // Safe because this is a dev/preview-only script — Production is guarded
  // by the VERCEL_ENV check above.
  await prisma.messageLog.deleteMany({});
  await prisma.adminUser.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.guest.deleteMany({});
  await prisma.property.deleteMany({});
  await prisma.partnerIntegration.deleteMany({});

  const partner = await prisma.partnerIntegration.create({
    data: {
      type: PartnerType.HOTELLINK,
      name: 'HotelLink — Namotu pilot',
      config: {
        webhookSecret: 'mock-secret',
        baseUrl: 'https://mock.hotellink.local',
      },
    },
  });

  const property = await prisma.property.create({
    data: {
      slug: 'namotu-island-fiji',
      name: 'Namotu Island Fiji',
      country: 'FJ',
      region: 'Fiji',
      timezone: 'Pacific/Fiji',
      partnerIntegrationId: partner.id,
    },
  });

  // Override via `KONCIE_SEED_EMAIL` during dev so Supabase can deliver the
  // magic link to a real inbox. Defaults to the demo placeholder.
  const guestEmail = process.env.KONCIE_SEED_EMAIL ?? 'demo@koncie.app';

  const guest = await prisma.guest.create({
    data: {
      email: guestEmail,
      firstName: 'Jane',
      lastName: 'Demo',
    },
  });

  const booking = await prisma.booking.create({
    data: {
      externalRef: 'HL-84321-NMT',
      guestId: guest.id,
      propertyId: property.id,
      checkIn: new Date('2026-07-14'),
      checkOut: new Date('2026-07-21'),
      numGuests: 2,
      status: BookingStatus.CONFIRMED,
    },
  });

  const token = await signMagicLink({
    bookingId: booking.id,
    guestEmail: guest.email,
    expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  });

  // Sprint 2 — Namotu Island Fiji ancillary inventory.
  //
  // Source of truth: Sprint-7 planning addendum "Namotu real ancillary
  // inventory" (2026-04-25). Provider for every record is Namotu Island Fiji
  // itself unless noted (apply "Provided by Namotu Island Fiji" in the UI).
  //
  // DEMO PRICING — confirm with property before pilot. Order-of-magnitude
  //   estimates only. Brief specified AUD; Namotu actually quotes guests in
  //   FJD on-property — Pat to confirm the display-currency convention
  //   before pilot soft launch.
  //
  // IMAGE PATHS are placeholders under /images/namotu/<slug>.jpg — actual
  //   assets to be supplied by Namotu marketing pre-pilot. Do NOT hotlink
  //   live Namotu imagery.
  //
  // Schema notes / limitations encountered while seeding:
  //  - UpsellCategory enum has no PACKAGE value, so Signature/Family/Kalama
  //    weeks are stored as category=OTHER with metadata.kind='package'.
  //  - Upsell has no first-class duration / provider / tags fields — those
  //    are stashed in the metadata Json column under stable keys
  //    (durationLabel, provider, tags, kind) so the UI can read them.
  //  - The three pre-existing generic upsells (Sunset sail, Resort spa
  //    treatment, Cultural village tour) are preserved per the "don't replace
  //    generic demo data" rule, even though they aren't in Namotu's real
  //    inventory list — flagged for Pat to prune later.
  await prisma.upsell.deleteMany({ where: { propertyId: property.id } });
  await prisma.upsell.createMany({
    data: [
      // -- Pre-existing generic seed records (preserved) -----------------
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Half-day reef snorkel',
        description:
          'Guided boat trip to Namotu Lefts outer reef. Gear, lunch, and fresh coconuts included.',
        priceMinor: 7500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/snorkel.svg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Sunset sail',
        description:
          'Two-hour catamaran sail along the reef edge at golden hour. Champagne + canapés on board.',
        priceMinor: 12500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/sunset-sail.svg',
      },
      {
        propertyId: property.id,
        category: 'SPA',
        name: 'Resort spa treatment',
        description:
          'Traditional Bobo massage, 60 minutes, in the over-water spa bure.',
        priceMinor: 18000,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/spa.svg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Pro surfing lesson',
        description:
          '90-minute one-on-one coaching with a Namotu local pro at a beginner-friendly reef break.',
        priceMinor: 22000,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/surf-lesson.svg',
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Cultural village tour',
        description:
          'Half-day visit to a nearby village with kava ceremony, meke dance, and village lunch.',
        priceMinor: 9500,
        priceCurrency: 'FJD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/upsells/village-tour.svg',
      },

      // -- Namotu real inventory: surf -----------------------------------
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Surf Coaching — Daily Group Session',
        description:
          'Two-hour coached session with Namotu surf staff at one of the resort breaks (Namotu Lefts, Wilkes, Swimming Pools). Includes boat transfer, water-safety crew, and video review back on the island.',
        priceMinor: 17500, // AUD 175.00 — demo pricing, confirm with property
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/surf-coaching-group.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '2 hours',
          tags: ['surf', 'group', 'all-levels'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Surf Coaching — Private 1:1',
        description:
          'Dedicated private session with a senior Namotu coach. Choose your break (Cloudbreak and Restaurants on the right swell), one-on-one boat, and personalised video debrief.',
        priceMinor: 24500, // AUD 245.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/surf-coaching-private.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '2 hours',
          tags: ['surf', 'private', 'premium'],
        },
      },

      // -- Namotu real inventory: fishing --------------------------------
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Fishing Charter — Cobalt (Half Day)',
        description:
          'Half-day sport fishing aboard "Cobalt", Namotu\'s 28ft centre console. Trolling for mahi mahi, wahoo and yellowfin along the reef edge. Up to 4 anglers, all gear and bait included.',
        priceMinor: 95000, // AUD 950.00 boat — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/fishing-cobalt.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '4 hours',
          tags: ['fishing', 'charter', 'half-day'],
          boat: 'Cobalt',
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Fishing Charter — Obsession (Full Day)',
        description:
          'Full-day game fishing aboard "Obsession", Namotu\'s flagship game boat. Heavy tackle for marlin and sailfish out wide, lighter setups for reef species on the way home. Lunch and drinks included.',
        priceMinor: 145000, // AUD 1,450.00 boat — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/fishing-obsession.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '8 hours',
          tags: ['fishing', 'charter', 'full-day', 'game'],
          boat: 'Obsession',
        },
      },

      // -- Namotu real inventory: water sports ---------------------------
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Jet Ski Hire',
        description:
          'Solo or tandem jet ski hire around the Namotu lagoon. Quick safety brief, then explore the surrounding reef passages. Fuel and life vests included.',
        priceMinor: 18000, // AUD 180.00/hr — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/jet-ski.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '1 hour',
          tags: ['watersports', 'self-guided'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Outrigger Canoe Session',
        description:
          'Traditional Fijian outrigger canoe paddle around Namotu and Tavarua. Calm-water session at sunrise or sunset — guide optional.',
        priceMinor: 5500, // AUD 55.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/outrigger-canoe.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '1 hour',
          tags: ['watersports', 'cultural', 'easy'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Kitesurfing Lesson',
        description:
          'Beginner-to-intermediate kite lesson on Namotu\'s reliable trade-wind days. IKO-certified instructor, full kit (kite, board, harness) supplied.',
        priceMinor: 22000, // AUD 220.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/kitesurfing.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '2 hours',
          tags: ['watersports', 'lesson', 'wind'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Foiling Session',
        description:
          'Hydrofoil session — wing, surf or tow — on Namotu\'s glassy inside reef. Coach in the water, foilboard and wing supplied. Existing foilers welcome to bring their own kit.',
        priceMinor: 21000, // AUD 210.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/foiling.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '90 minutes',
          tags: ['watersports', 'foil', 'progression'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Stand-Up Paddleboard Hire',
        description:
          'SUP rental from the Namotu boatshed. Glide around the lagoon at your own pace — boards, paddles and leashes provided.',
        priceMinor: 4500, // AUD 45.00/hr — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/sup.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '1 hour',
          tags: ['watersports', 'self-guided', 'easy'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Snorkelling & SCUBA Dive',
        description:
          'Guided snorkel or single-tank SCUBA dive on Namotu\'s outer reef — soft corals, reef sharks, and the occasional manta. PADI-certified divemaster, all gear included.',
        priceMinor: 22000, // AUD 220.00 SCUBA single — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/scuba.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '2 hours',
          tags: ['watersports', 'reef', 'scuba'],
        },
      },
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Spearfishing Trip',
        description:
          'Free-diving spearfishing trip with a Namotu local guide. Reef species in the morning, pelagics on the drop-off when conditions allow. Gun, fins and weight belt supplied.',
        priceMinor: 24000, // AUD 240.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/spearfishing.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '3 hours',
          tags: ['watersports', 'fishing', 'guided'],
        },
      },

      // -- Namotu real inventory: signature day trip ---------------------
      {
        propertyId: property.id,
        category: 'ACTIVITY',
        name: 'Cloud9 Day Trip',
        description:
          'Boat across to Cloud9, the legendary floating pizza bar moored on the Ro Ro reef. Wood-fired pizzas, cold Fiji Bitters, and a swim platform straight onto the reef. Round-trip transfer included.',
        priceMinor: 26000, // AUD 260.00 pp — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/cloud9.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: 'Half day',
          tags: ['day-trip', 'famous', 'food-and-drink'],
        },
      },

      // -- Namotu real inventory: wellbeing & retail ---------------------
      {
        propertyId: property.id,
        category: 'OTHER',
        name: 'Wellbeing & Yoga Class',
        description:
          'Drop-in yoga or wellbeing class on the Namotu beach deck. Mat-based vinyasa or restorative flow with the resident wellbeing host. All levels welcome.',
        priceMinor: 4000, // AUD 40.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/yoga.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: '60 minutes',
          tags: ['wellbeing', 'yoga', 'drop-in'],
        },
      },
      {
        propertyId: property.id,
        category: 'OTHER',
        name: 'Boutique Shop Credit',
        description:
          'Pre-load resort boutique credit — apparel, surf accessories, sunscreen, and Namotu-branded merch. Redeem at the shop on arrival.',
        priceMinor: 10000, // AUD 100.00 — demo pricing
        priceCurrency: 'AUD',
        providerPayoutPct: '85.00',
        imageUrl: '/images/namotu/boutique.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          durationLabel: 'N/A',
          tags: ['retail', 'credit'],
        },
      },

      // -- Namotu packaged experiences -----------------------------------
      // NOTE: UpsellCategory has no PACKAGE value — using OTHER with
      // metadata.kind='package' so the UI can filter / render distinctly.
      // Pricing here is per-person indicative; Signature/Family weeks are
      // typically full-resort week-long packages priced separately by the
      // property — confirm with Namotu before pilot.
      {
        propertyId: property.id,
        category: 'OTHER',
        name: 'Signature Week',
        description:
          'Namotu\'s flagship surf week — seven nights, all meals, daily boat transfers to the surrounding breaks (Cloudbreak, Restaurants, Namotu Lefts, Wilkes), and curated experiences led by the resort team.',
        priceMinor: 850000, // AUD 8,500.00 pp — demo pricing, confirm
        priceCurrency: 'AUD',
        providerPayoutPct: '90.00',
        imageUrl: '/images/namotu/signature-week.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          kind: 'package',
          durationLabel: '7 nights',
          tags: ['package', 'surf', 'flagship'],
        },
      },
      {
        propertyId: property.id,
        category: 'OTHER',
        name: 'Family Week',
        description:
          'A week designed around families — kid-friendly surf coaching, snorkel safaris, outrigger paddles, and Cloud9 day trip included. Seven nights, all meals, family bure accommodation.',
        priceMinor: 720000, // AUD 7,200.00 pp adult — demo pricing, confirm
        priceCurrency: 'AUD',
        providerPayoutPct: '90.00',
        imageUrl: '/images/namotu/family-week.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          kind: 'package',
          durationLabel: '7 nights',
          tags: ['package', 'family', 'all-ages'],
        },
      },
      {
        propertyId: property.id,
        category: 'OTHER',
        name: 'Kalama Kamp',
        description:
          'The legendary Kalama Kamp — foil and waterman skills clinic with Dave Kalama and crew. Wing, foil, SUP, and downwind sessions across a full week, capped at a small group.',
        priceMinor: 980000, // AUD 9,800.00 pp — demo pricing, confirm
        priceCurrency: 'AUD',
        providerPayoutPct: '90.00',
        imageUrl: '/images/namotu/kalama-kamp.jpg',
        metadata: {
          provider: 'Namotu Island Fiji',
          kind: 'package',
          durationLabel: '7 nights',
          tags: ['package', 'foil', 'clinic', 'premium'],
        },
      },
    ],
  });
  console.log('[seed] Namotu upsell catalogue inserted (5 legacy + 16 real inventory + 3 packages = 24 records)');

  // Insurance: CoverMore quotes are produced at runtime by
  // src/adapters/covermore-mock.ts (3 tiers). MVP design calls for a single
  // one-click policy contextual to a Fiji/Namotu trip (~7-day, water-sports
  // coverage). The mock currently returns 3 tiers — narrowing to one is a
  // runtime concern, not a seed-data one, so no insurance quote rows are
  // pre-seeded here. See addendum 2026-04-25 § "Insurance MVP simplification".

  // Sprint 3 — Jane's flight itinerary (Sydney → Nadi for Namotu stay)
  await prisma.flightBooking.deleteMany({ where: { guestId: guest.id } });
  await prisma.flightBooking.create({
    data: {
      guestId: guest.id,
      externalRef: 'JS-JANE-NAMOTU-01',
      origin: 'SYD',
      destination: 'NAN',
      departureAt: new Date('2026-07-14T08:00:00+10:00'),
      returnAt: new Date('2026-07-21T14:30:00+12:00'),
      carrier: 'FJ',
      metadata: { adults: 2, class: 'economy' },
    },
  });
  // Reset lazy-sync watermark so the hub will re-sync on first render if desired.
  await prisma.guest.update({
    where: { id: guest.id },
    data: { flightsLastSyncedAt: null },
  });
  console.log('[seed] Jane\'s SYD↔NAN flight inserted');

  // Sprint 5 — one seeded hotel_admin for Namotu Island Fiji.
  // Override via `KONCIE_SEED_ADMIN_EMAIL` during dev so Supabase can deliver
  // the magic link to a real inbox. Defaults to the demo placeholder.
  const adminEmail =
    process.env.KONCIE_SEED_ADMIN_EMAIL ?? 'admin.namotu@koncie.app';
  const admin = await prisma.adminUser.create({
    data: {
      email: adminEmail,
      propertyId: property.id,
      role: AdminRole.HOTEL_ADMIN,
      firstName: 'Namotu',
      lastName: 'Admin',
    },
  });
  console.log(
    `[seed] AdminUser ${admin.email} (${admin.role}) for ${property.name}`,
  );

  // Sprint 6 — one example MessageLog row so /admin/messages isn't empty on
  // a fresh seed. Represents the magic-link Koncie sent Jane at booking
  // confirmation (kind MAGIC_LINK, status DELIVERED).
  const seedSentAt = new Date();
  await prisma.messageLog.create({
    data: {
      guestId: guest.id,
      bookingId: booking.id,
      kind: MessageKind.MAGIC_LINK,
      templateId: 'magic-link-v1',
      recipientEmail: guest.email,
      subject: `Your Koncie account for ${property.name} is ready`,
      status: MessageStatus.DELIVERED,
      providerMessageId: `seed-${crypto.randomUUID()}`,
      sentAt: seedSentAt,
      deliveredAt: seedSentAt,
    },
  });
  console.log('[seed] Seed MessageLog row inserted for Jane Demo');

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  console.log('\n✨ Seed complete.\n');
  console.log(`Guest: ${guest.firstName} ${guest.lastName} <${guest.email}>`);
  console.log(`Admin: ${admin.firstName} ${admin.lastName} <${admin.email}>`);
  console.log('\nSigned magic link (guest):');
  console.log(`${baseUrl}/welcome?token=${token}\n`);
  console.log('Admin sign-in: use magic link flow at /welcome with the admin email.\n');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
