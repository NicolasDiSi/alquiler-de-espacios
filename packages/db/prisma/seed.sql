-- Demo data: 3 rooms, 3 companies, their users, one operator, and about 40 bookings over the previous and next two
-- weeks (some cancelled), so the operator screens show something on first run.
-- Run with: pnpm db:seed   (as the schema owner, through DATABASE_OWNER_URL)
--
-- Idempotent: every row has a fixed id and ON CONFLICT DO NOTHING, so a second run adds nothing. Booking ids include
-- the local date, so a run on another day adds that day's window (the old rows stay).
-- FORCE row level security applies to the owner, so each company's bookings are written after setting that
-- company as the tenant, exactly like the app does. Opening hours, the 30 minute grid and the facility zone
-- follow the booking rules in spec 0001: Monday to Friday, 08:00 to 20:00, America/Argentina/Buenos_Aires.

-- The default facility ('facility-central', Monday to Friday 08:00 to 20:00, Buenos Aires) is created by the
-- migration. Rooms start their window well in the past so the seeded history counts in the metrics.
INSERT INTO room (id, facility_id, name, capacity, active_from) VALUES
  ('room-sol', 'facility-central', 'Sala Sol', 6, now() - interval '90 days'),
  ('room-luna', 'facility-central', 'Sala Luna', 10, now() - interval '90 days'),
  ('room-mar', 'facility-central', 'Sala Mar', 16, now() - interval '90 days')
ON CONFLICT DO NOTHING;

INSERT INTO company (id, name, slug) VALUES
  ('company-acme', 'Acme SA', 'acme'),
  ('company-globex', 'Globex SRL', 'globex'),
  ('company-initech', 'Initech SA', 'initech')
ON CONFLICT DO NOTHING;

INSERT INTO app_user (id, tenant_id, name, role) VALUES
  ('user-acme-ana', 'company-acme', 'Ana (Acme)', 'member'),
  ('user-acme-bruno', 'company-acme', 'Bruno (Acme)', 'member'),
  ('user-globex-carla', 'company-globex', 'Carla (Globex)', 'member'),
  ('user-initech-diego', 'company-initech', 'Diego (Initech)', 'member'),
  ('user-operador', NULL, 'Operador', 'operator')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  tenant record;
  facility_zone constant text := 'America/Argentina/Buenos_Aires';
  today constant date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  FOR tenant IN SELECT id FROM company WHERE id IN ('company-acme', 'company-globex', 'company-initech') ORDER BY id LOOP
    PERFORM set_config('app.tenant_id', tenant.id, true);

    INSERT INTO booking (id, tenant_id, room_id, booked_by, starts_at, ends_at, status, cancelled_at)
    SELECT
      key,
      tenant.id,
      room_id,
      (SELECT u.id FROM app_user u WHERE u.tenant_id = tenant.id ORDER BY u.id LIMIT 1),
      (day + start_time) AT TIME ZONE facility_zone,
      (day + start_time + make_interval(mins => minutes)) AT TIME ZONE facility_zone,
      CASE WHEN abs(hashtext(key || 's')) % 5 = 0 THEN 'cancelled'::booking_status ELSE 'confirmed'::booking_status END,
      CASE WHEN abs(hashtext(key || 's')) % 5 = 0 THEN (day + start_time - interval '1 day') AT TIME ZONE facility_zone END
    FROM (
      SELECT
        'seed-' || to_char(day, 'YYYY-MM-DD') || '-' || r.id || '-' || s.n AS key,
        day, r.id AS room_id, s.start_time, s.minutes
      FROM (SELECT today + n AS day FROM generate_series(-14, 14) AS g(n)) AS days
      CROSS JOIN (SELECT id FROM room WHERE id IN ('room-sol', 'room-luna', 'room-mar')) AS r
      CROSS JOIN (VALUES (1, time '09:00', 60), (2, time '11:00', 120), (3, time '14:00', 90), (4, time '16:30', 120))
        AS s(n, start_time, minutes)
      WHERE extract(isodow FROM day) BETWEEN 1 AND 5
    ) AS candidate
    -- About one candidate in six becomes a booking, spread over the three companies.
    WHERE abs(hashtext(key)) % 6 = 0
      AND (SELECT (array['company-acme', 'company-globex', 'company-initech'])[1 + abs(hashtext(key || 'c')) % 3]) = tenant.id
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
