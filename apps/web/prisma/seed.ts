import { PrismaClient, PartnerType, BookingStatus } from '@prisma/client';
import { signMagicLink } from '../src/lib/auth/signed-link';

const prisma = new PrismaClient();

async function main() {
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error(
      'Refusing to seed Production DB. Seed is for dev + preview only.',
    );
  }

  const partner = await prisma.partnerIntegration.upsert({
    where: { name: 'HotelLink — Namotu pilot' },
    create: {
      type: PartnerType.HOTELLINK,
      name: 'HotelLink — Namotu pilot',
      config: {
        webhookSecret: 'mock-secret',
        baseUrl: 'https://mock.hotellink.local',
      },
    },
    update: {},
  });

  const property = await prisma.property.upsert({
    where: { slug: 'namotu-island-fiji' },
    create: {
      slug: 'namotu-island-fiji',
      name: 'Namotu Island Fiji',
      country: 'FJ',
      region: 'Fiji',
      timezone: 'Pacific/Fiji',
      partnerIntegrationId: partner.id,
    },
    update: {},
  });

  const guest = await prisma.guest.upsert({
    where: { email: 'demo@koncie.app' },
    create: {
      email: 'demo@koncie.app',
      firstName: 'Jane',
      lastName: 'Demo',
    },
    update: {},
  });

  const booking = await prisma.booking.upsert({
    where: { externalRef: 'HL-84321-NMT' },
    create: {
      externalRef: 'HL-84321-NMT',
      guestId: guest.id,
      propertyId: property.id,
      checkIn: new Date('2026-07-14'),
      checkOut: new Date('2026-07-21'),
      numGuests: 2,
      status: BookingStatus.CONFIRMED,
    },
    update: {},
  });

  const token = await signMagicLink({
    bookingId: booking.id,
    guestEmail: guest.email,
    expiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  console.log('\n✨ Seed complete.\n');
  console.log('Signed magic link for demo guest:');
  console.log(`${baseUrl}/welcome?token=${token}\n`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
