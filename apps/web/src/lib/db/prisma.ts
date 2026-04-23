import { PrismaClient } from '@prisma/client';

/**
 * Singleton Prisma client.
 *
 * Prevents connection storms during Next.js dev HMR — without the global
 * cache, every hot reload creates a fresh client and exhausts the pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
