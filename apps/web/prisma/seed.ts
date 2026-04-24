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

  // Sprint 2 — five Namotu activity upsells
  await prisma.upsell.deleteMany({ where: { propertyId: property.id } });
  await prisma.upsell.createMany({
    data: [
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
    ],
  });
  console.log('[seed] 5 Namotu upsells inserted');

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
