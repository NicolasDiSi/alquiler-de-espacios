-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('member', 'operator');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('confirmed', 'cancelled');

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "booked_by" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'confirmed',
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_user_tenant_id_idx" ON "app_user"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "room_name_key" ON "room"("name");

-- CreateIndex
CREATE INDEX "booking_tenant_id_starts_at_id_idx" ON "booking"("tenant_id", "starts_at", "id");

-- CreateIndex
CREATE INDEX "booking_room_id_starts_at_idx" ON "booking"("room_id", "starts_at");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking" ADD CONSTRAINT "booking_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------------------------
-- Hand written part: what Prisma cannot model. Spec: docs/specs/_root/0001-booking-platform-architecture/index.md
-- The cluster roles (espacios_runtime, espacios_operator, espacios_availability) come from the infra init SQL
-- (infra/local/postgres/01-roles.sql), because BYPASSRLS roles are cluster wide and need a superuser.
-- ---------------------------------------------------------------------------------------------------------------

-- Lets an equality on room_id sit inside a gist exclusion constraint. A trusted extension, so the owner may create it.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Rules every row must satisfy.
ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_role_tenant_check" CHECK (("role" = 'member') = ("tenant_id" IS NOT NULL));
ALTER TABLE "booking"
  ADD CONSTRAINT "booking_period_check" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "booking_cancelled_check" CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));

-- Two confirmed bookings of one room never overlap, for any company, even under concurrency. Half open range: a
-- booking ending at 15:00 and another starting at 15:00 do not overlap. Cancelling leaves the constraint, so the
-- slot is free at once. Constraints ignore row level security, so this sees every company's rows. A violation is
-- SQLSTATE 23P01.
ALTER TABLE "booking"
  ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist ("room_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE ("status" = 'confirmed');

-- The tenant of the current transaction (set by the unit of work with set_config). An empty or missing setting gives
-- NULL, so the policy matches no row: it fails closed.
CREATE FUNCTION current_tenant_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '') $$;

-- Row level security. FORCE applies it to the table owner too (only superusers and BYPASSRLS roles skip it).
-- The (SELECT ...) wrapper lets the planner evaluate the setting once per query instead of once per row.
ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "booking"
  USING ("tenant_id" = (SELECT current_tenant_id()))
  WITH CHECK ("tenant_id" = (SELECT current_tenant_id()));

-- Availability: a company cannot see other companies' bookings, yet must see that a room is taken. This returns the
-- busy time ranges and nothing else (no company, user or booking id). SECURITY DEFINER runs as its owner, a role
-- with BYPASSRLS and a column grant, so FORCE does not filter it by the caller's company.
CREATE FUNCTION room_busy_intervals(p_room_id text, p_from timestamptz, p_to timestamptz)
  RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT b.starts_at, b.ends_at
    FROM public.booking b
    WHERE b.room_id = p_room_id
      AND b.status = 'confirmed'
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    ORDER BY b.starts_at
  $$;

-- The owner can only hand the function to a role it is a member of that may create objects in the schema.
GRANT CREATE ON SCHEMA public TO espacios_availability;
ALTER FUNCTION room_busy_intervals(text, timestamptz, timestamptz) OWNER TO espacios_availability;
REVOKE CREATE ON SCHEMA public FROM espacios_availability;

REVOKE ALL ON FUNCTION room_busy_intervals(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION room_busy_intervals(text, timestamptz, timestamptz) TO espacios_runtime, espacios_operator;

-- Grants. Companies read rooms, users and companies, and write only their own bookings (RLS). The operator reads
-- everything and writes nothing. The availability owner sees four booking columns, nothing else.
GRANT USAGE ON SCHEMA public TO espacios_operator, espacios_availability;
GRANT SELECT ON "room", "app_user" TO espacios_runtime;
GRANT SELECT, INSERT, UPDATE ON "booking" TO espacios_runtime;
GRANT SELECT ON "company", "app_user", "room", "booking" TO espacios_operator;
GRANT SELECT ("room_id", "starts_at", "ends_at", "status") ON "booking" TO espacios_availability;
-- Tables added by later migrations are readable by the operator without another grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO espacios_operator;
