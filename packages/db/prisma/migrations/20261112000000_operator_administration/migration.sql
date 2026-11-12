-- Operator administration (spec 0004): facilities that own the zone and opening hours, rooms that belong to one,
-- blocks, deactivation columns, individual clients, the operator's catalog grants, the booking guard trigger and the
-- availability function with blocks. Sections 1, 2, 3 and 5 are what `prisma migrate dev` writes; the rest is by hand.

-- 1. Clients: a kind, a logo, and a switch that keeps history.
CREATE TYPE "company_kind" AS ENUM ('company', 'individual');
ALTER TABLE "company"
  ADD COLUMN "kind" "company_kind" NOT NULL DEFAULT 'company',
  ADD COLUMN "logo_url" TEXT,
  ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);

-- 2. Facilities. Minutes count from local midnight, weekdays are 0 Sunday to 6 Saturday (Date.getDay).
CREATE TABLE "facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "time_zone" TEXT NOT NULL,
    "opens_at" INTEGER NOT NULL,
    "closes_at" INTEGER NOT NULL,
    "open_weekdays" SMALLINT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(3),

    CONSTRAINT "facility_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "facility_name_key" ON "facility"("name");
ALTER TABLE "facility"
  ADD CONSTRAINT "facility_hours_check" CHECK (
    "opens_at" >= 0 AND "closes_at" <= 1440 AND "opens_at" < "closes_at"
    AND "opens_at" % 30 = 0 AND "closes_at" % 30 = 0
  ),
  ADD CONSTRAINT "facility_weekdays_check" CHECK (
    cardinality("open_weekdays") > 0 AND "open_weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  );

-- The facility every existing room joins: the constants of spec 0001 (Monday to Friday, 08:00 to 20:00, Buenos Aires).
INSERT INTO "facility" ("id", "name", "time_zone", "opens_at", "closes_at", "open_weekdays")
VALUES ('facility-central', 'Sede Central', 'America/Argentina/Buenos_Aires', 480, 1200, ARRAY[1, 2, 3, 4, 5]::smallint[]);

-- 3. Rooms belong to a facility and carry their window. Add nullable, backfill, then require it.
ALTER TABLE "room"
  ADD COLUMN "facility_id" TEXT,
  ADD COLUMN "active_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);
UPDATE "room" SET "facility_id" = 'facility-central', "active_from" = "created_at";
ALTER TABLE "room" ALTER COLUMN "facility_id" SET NOT NULL;
DROP INDEX "room_name_key";
CREATE UNIQUE INDEX "room_facility_id_name_key" ON "room"("facility_id", "name");
CREATE INDEX "room_facility_id_idx" ON "room"("facility_id");
ALTER TABLE "room" ADD CONSTRAINT "room_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Blocks. No row level security and no grant for companies: they only see a busy interval (see section 8).
CREATE TABLE "block" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "room_id" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "block_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "block_facility_id_starts_at_idx" ON "block"("facility_id", "starts_at");
CREATE INDEX "block_room_id_starts_at_idx" ON "block"("room_id", "starts_at");
ALTER TABLE "block" ADD CONSTRAINT "block_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "block" ADD CONSTRAINT "block_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "block" ADD CONSTRAINT "block_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "block" ADD CONSTRAINT "block_period_check" CHECK ("ends_at" > "starts_at");

-- 5. Grants. The operator may now write the catalog (never booking, never DELETE) and insert members. The runtime
-- login reads facilities and companies (the booking guard below does its own reads as the owner).
GRANT SELECT ON "facility", "company" TO espacios_runtime;
GRANT SELECT, INSERT, UPDATE ON "facility", "room", "company", "block" TO espacios_operator;
GRANT SELECT, INSERT ON "app_user" TO espacios_operator;

-- The operator login may insert users, but only members: a grant cannot limit values, so a trigger does. The owner
-- (seeds, fixtures) is not restricted. 42501 is insufficient_privilege, the same code the other refusals use.
CREATE FUNCTION guard_operator_user_insert() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
  AS $$
BEGIN
  IF NEW.role <> 'member' AND current_user = 'espacios_operator' THEN
    RAISE EXCEPTION 'the operator login can only create members' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER app_user_operator_guard BEFORE INSERT ON "app_user"
  FOR EACH ROW EXECUTE FUNCTION guard_operator_user_insert();

-- 6. The booking guard. Two connections can race (a booking against a deactivation, an hours change or a block), and
-- a use case cannot close that race alone, so the database does. The function runs as its owner, locks the room, its
-- facility and the company FOR SHARE (an operator change waits for bookings in flight and then sees them), and
-- refuses a new confirmed booking that cannot happen. Custom SQLSTATEs: EB001 room or facility inactive, EB002
-- company inactive, EB003 outside the opening window, EB004 over a block. The use cases check the same things first,
-- so the usual refusal is a returned result with no write; this is the net for a race or a direct insert.
CREATE FUNCTION guard_booking_insert() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
DECLARE
  v_room public.room%ROWTYPE;
  v_facility public.facility%ROWTYPE;
  v_company_deactivated timestamptz;
  v_start_local timestamp;
  v_end_local timestamp;
  v_day timestamp;
  v_start_min numeric;
  v_end_min numeric;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_room FROM public.room WHERE id = NEW.room_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN NEW; -- the foreign key reports an unknown room
  END IF;
  SELECT * INTO v_facility FROM public.facility WHERE id = v_room.facility_id FOR SHARE;
  IF v_room.deactivated_at IS NOT NULL OR v_facility.deactivated_at IS NOT NULL THEN
    RAISE EXCEPTION 'room_inactive' USING ERRCODE = 'EB001';
  END IF;

  SELECT deactivated_at INTO v_company_deactivated FROM public.company WHERE id = NEW.tenant_id FOR SHARE;
  IF v_company_deactivated IS NOT NULL THEN
    RAISE EXCEPTION 'company_inactive' USING ERRCODE = 'EB002';
  END IF;

  v_start_local := NEW.starts_at AT TIME ZONE v_facility.time_zone;
  v_end_local := NEW.ends_at AT TIME ZONE v_facility.time_zone;
  v_day := date_trunc('day', v_start_local);
  v_start_min := extract(epoch FROM (v_start_local - v_day)) / 60;
  v_end_min := extract(epoch FROM (v_end_local - v_day)) / 60;
  IF NOT (extract(dow FROM v_start_local)::smallint = ANY (v_facility.open_weekdays))
     OR v_start_min < v_facility.opens_at OR v_end_min > v_facility.closes_at THEN
    RAISE EXCEPTION 'outside_hours' USING ERRCODE = 'EB003';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.block k
    WHERE k.released_at IS NULL
      AND k.facility_id = v_facility.id
      AND (k.room_id IS NULL OR k.room_id = NEW.room_id)
      AND tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'room_blocked' USING ERRCODE = 'EB004';
  END IF;

  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION guard_booking_insert() FROM PUBLIC;
CREATE TRIGGER booking_guard BEFORE INSERT ON "booking"
  FOR EACH ROW EXECUTE FUNCTION guard_booking_insert();

-- 7. Availability now includes blocks. A block shows as an interval with kind 'blocked', never its reason, author or
-- id. The return type changes, so the function is dropped and made again, then handed to the availability role.
DROP FUNCTION room_busy_intervals(text, timestamptz, timestamptz);
CREATE FUNCTION room_busy_intervals(p_room_id text, p_from timestamptz, p_to timestamptz)
  RETURNS TABLE (starts_at timestamptz, ends_at timestamptz, kind text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT b.starts_at, b.ends_at, 'booked'::text
    FROM public.booking b
    WHERE b.room_id = p_room_id
      AND b.status = 'confirmed'
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    UNION ALL
    SELECT k.starts_at, k.ends_at, 'blocked'::text
    FROM public.room r
    JOIN public.block k ON k.facility_id = r.facility_id AND (k.room_id IS NULL OR k.room_id = r.id)
    WHERE r.id = p_room_id
      AND k.released_at IS NULL
      AND tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    ORDER BY 1
  $$;
GRANT CREATE ON SCHEMA public TO espacios_availability;
ALTER FUNCTION room_busy_intervals(text, timestamptz, timestamptz) OWNER TO espacios_availability;
REVOKE CREATE ON SCHEMA public FROM espacios_availability;
REVOKE ALL ON FUNCTION room_busy_intervals(text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION room_busy_intervals(text, timestamptz, timestamptz) TO espacios_runtime, espacios_operator;
GRANT SELECT ("id", "facility_id") ON "room" TO espacios_availability;
GRANT SELECT ("facility_id", "room_id", "starts_at", "ends_at", "released_at") ON "block" TO espacios_availability;
