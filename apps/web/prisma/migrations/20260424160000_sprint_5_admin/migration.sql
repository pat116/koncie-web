-- Sprint 5: Hotel admin portal foundation — AdminUser + AdminRole enum.
-- Hand-written migration (prisma migrate dev blocked in CI sandbox).
-- Apply with: pnpm --filter @koncie/web exec prisma migrate dev

-- ─── enum ─────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('HOTEL_ADMIN', 'KONCIE_STAFF');

-- ─── admin_users ──────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "property_id" UUID NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'HOTEL_ADMIN',
    "auth_user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_auth_user_id_key" ON "admin_users" ("auth_user_id");

-- CreateIndex
CREATE INDEX "admin_users_property_id_idx" ON "admin_users" ("property_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
