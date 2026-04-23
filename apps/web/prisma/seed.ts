import { PrismaClient, PartnerType, BookingStatus } from '@prisma/client';
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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  console.log('\n✨ Seed complete.\n');
  console.log(`Guest: ${guest.firstName} ${guest.lastName} <${guest.email}>`);
  console.log('\nSigned magic link:');
  console.log(`${baseUrl}/welcome?token=${token}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
