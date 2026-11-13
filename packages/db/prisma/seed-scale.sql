-- Volume data on top of seed.sql, to see the app the way the brief expects it to grow ("more facilities and
-- companies later"): 4 sedes, 42 rooms, 15 clients with 22 members and about 3000 bookings over the previous and
-- next four weeks. Some rooms and hours are busy and others barely used, so the metrics have low periods to find.
-- Run with: pnpm db:seed:scale   (after pnpm db:seed, which creates the operator; `pnpm dev` runs both)
--
-- Not part of db:seed on purpose: the e2e suites and seed.test.ts count the base seed's rows.
-- Idempotent like seed.sql: fixed ids and ON CONFLICT DO NOTHING; booking ids include the local date, so a run on
-- another day adds that day's window. Bookings are written per company with the tenant set (FORCE RLS), only inside
-- each sede's hours and never over a block, so the booking guard trigger accepts every row.

INSERT INTO facility (id, name, address, time_zone, opens_at, closes_at, open_weekdays) VALUES
  ('facility-norte', 'Sede Norte', 'Av. del Libertador 7200, CABA', 'America/Argentina/Buenos_Aires', 480, 1200,
    ARRAY[1, 2, 3, 4, 5]::smallint[]),
  ('facility-cordoba', 'Sede Córdoba', 'Bv. San Juan 450, Córdoba', 'America/Argentina/Cordoba', 540, 1140,
    ARRAY[1, 2, 3, 4, 5, 6]::smallint[]),
  ('facility-rosario', 'Sede Rosario', 'Bv. Oroño 1100, Rosario', 'America/Argentina/Cordoba', 510, 1110,
    ARRAY[1, 2, 3, 4, 5]::smallint[])
ON CONFLICT DO NOTHING;

-- Nine more rooms in the base seed's sede, so its room list scrolls; the rest spread over the new sedes.
INSERT INTO room (id, facility_id, name, capacity, active_from)
SELECT 'room-' || f.key || '-' || lpad(n::text, 2, '0'), f.id, 'Sala ' || f.names[n],
  (ARRAY[4, 6, 8, 10, 12, 16, 20])[1 + (n * 3 + f.shift) % 7], now() - interval '120 days'
FROM (VALUES
  ('central', 'facility-central', 0,
    ARRAY['Río', 'Bosque', 'Cumbre', 'Delta', 'Glaciar', 'Pampa', 'Selva', 'Valle', 'Puna']),
  ('norte', 'facility-norte', 1,
    ARRAY['Aconcagua', 'Lanín', 'Fitz Roy', 'Tronador', 'Champaquí', 'Uritorco', 'Domuyo', 'Llullaillaco',
      'Mercedario', 'Tupungato', 'Maipo', 'Copahue']),
  ('cordoba', 'facility-cordoba', 2,
    ARRAY['Suquía', 'Xanaes', 'Ctalamochita', 'Calamuchita', 'Traslasierra', 'Punilla', 'Sobremonte', 'Ischilín',
      'Tulumba', 'Minas']),
  ('rosario', 'facility-rosario', 3,
    ARRAY['Paraná', 'Saladillo', 'Ludueña', 'Carcarañá', 'Coronda', 'Setúbal', 'Colastiné', 'Salado'])
) AS f(key, id, shift, names)
CROSS JOIN LATERAL generate_series(1, cardinality(f.names)) AS n
ON CONFLICT DO NOTHING;

INSERT INTO company (id, name, slug, kind) VALUES
  ('company-andes', 'Andes Consulting', 'andes', 'company'),
  ('company-nova', 'Nova Software', 'nova', 'company'),
  ('company-logistica-sur', 'Logística Sur', 'logistica-sur', 'company'),
  ('company-ferrari', 'Estudio Ferrari', 'ferrari', 'company'),
  ('company-pampa-agro', 'Pampa Agro', 'pampa-agro', 'company'),
  ('company-delta-finanzas', 'Delta Finanzas', 'delta-finanzas', 'company'),
  ('company-cumbre-seguros', 'Cumbre Seguros', 'cumbre-seguros', 'company'),
  ('company-patagonia-energia', 'Patagonia Energía', 'patagonia-energia', 'company'),
  ('company-austral-media', 'Austral Media', 'austral-media', 'company'),
  ('company-rio-diseno', 'Río Diseño', 'rio-diseno', 'company'),
  ('company-maria-perez', 'María Pérez', 'maria-perez', 'individual'),
  ('company-julian-gomez', 'Julián Gómez', 'julian-gomez', 'individual')
ON CONFLICT DO NOTHING;

INSERT INTO app_user (id, tenant_id, name, role) VALUES
  ('user-andes-gonzalo', 'company-andes', 'Gonzalo Ramos (Andes)', 'member'),
  ('user-andes-paula', 'company-andes', 'Paula Sosa (Andes)', 'member'),
  ('user-nova-camila', 'company-nova', 'Camila Rojas (Nova)', 'member'),
  ('user-nova-tomas', 'company-nova', 'Tomás Acosta (Nova)', 'member'),
  ('user-nova-lucas', 'company-nova', 'Lucas Medina (Nova)', 'member'),
  ('user-logistica-sur-ramiro', 'company-logistica-sur', 'Ramiro Herrera (Logística Sur)', 'member'),
  ('user-ferrari-lucia', 'company-ferrari', 'Lucía Ferrari (Estudio Ferrari)', 'member'),
  ('user-ferrari-martin', 'company-ferrari', 'Martín Benítez (Estudio Ferrari)', 'member'),
  ('user-pampa-agro-sofia', 'company-pampa-agro', 'Sofía Molina (Pampa Agro)', 'member'),
  ('user-delta-finanzas-ignacio', 'company-delta-finanzas', 'Ignacio Paz (Delta Finanzas)', 'member'),
  ('user-delta-finanzas-valeria', 'company-delta-finanzas', 'Valeria Ríos (Delta Finanzas)', 'member'),
  ('user-cumbre-seguros-federico', 'company-cumbre-seguros', 'Federico Luna (Cumbre Seguros)', 'member'),
  ('user-patagonia-energia-agustina', 'company-patagonia-energia', 'Agustina Vera (Patagonia Energía)', 'member'),
  ('user-patagonia-energia-nicolas', 'company-patagonia-energia', 'Nicolás Ortiz (Patagonia Energía)', 'member'),
  ('user-austral-media-carolina', 'company-austral-media', 'Carolina Suárez (Austral Media)', 'member'),
  ('user-rio-diseno-joaquin', 'company-rio-diseno', 'Joaquín Castro (Río Diseño)', 'member'),
  ('user-maria-perez', 'company-maria-perez', 'María Pérez', 'member'),
  ('user-julian-gomez', 'company-julian-gomez', 'Julián Gómez', 'member')
ON CONFLICT DO NOTHING;

-- A room that closed (no bookings, so the guard never sees it) and two blocks next week: a sede's holiday and one
-- room's maintenance. A block is written only where no confirmed booking sits yet, as the operator screens require.
UPDATE room SET deactivated_at = now() - interval '10 days' WHERE id = 'room-rosario-08' AND deactivated_at IS NULL;

DO $$
DECLARE
  next_week constant date := date_trunc('week', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)::date + 7;
  planned record;
  taken boolean;
  client record;
BEGIN
  FOR planned IN
    SELECT * FROM (VALUES
      ('scale-block-cordoba-' || to_char(next_week + 2, 'YYYY-MM-DD'), 'facility-cordoba', NULL::text,
        (next_week + 2)::timestamp AT TIME ZONE 'America/Argentina/Cordoba',
        (next_week + 3)::timestamp AT TIME ZONE 'America/Argentina/Cordoba', 'Feriado provincial'),
      ('scale-block-norte-01-' || to_char(next_week, 'YYYY-MM-DD'), 'facility-norte', 'room-norte-01',
        (next_week + time '08:00') AT TIME ZONE 'America/Argentina/Buenos_Aires',
        (next_week + 1 + time '20:00') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'Cambio de alfombra')
    ) AS b(id, facility_id, room_id, starts_at, ends_at, reason)
  LOOP
    -- FORCE RLS shows the owner one company's bookings at a time, so the check walks every company.
    taken := false;
    FOR client IN SELECT id FROM company LOOP
      PERFORM set_config('app.tenant_id', client.id, true);
      taken := taken OR EXISTS (
        SELECT 1 FROM booking k JOIN room r ON r.id = k.room_id
        WHERE k.status = 'confirmed' AND r.facility_id = planned.facility_id
          AND (planned.room_id IS NULL OR k.room_id = planned.room_id)
          AND tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(planned.starts_at, planned.ends_at, '[)')
      );
    END LOOP;
    IF NOT taken THEN
      INSERT INTO block (id, facility_id, room_id, starts_at, ends_at, reason, created_by)
      VALUES (planned.id, planned.facility_id, planned.room_id, planned.starts_at, planned.ends_at, planned.reason,
        'user-operador')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END
$$;

-- Bookings: five slots a day on each open day, each one taken with a chance that falls in the afternoon, on Fridays
-- and Saturdays, in the future and in every fifth room (the quiet ones). Clients are weighted: a few book most.
DO $$
DECLARE
  tenant record;
  clients constant text[] := ARRAY[
    'company-acme', 'company-acme', 'company-globex', 'company-initech',
    'company-andes', 'company-nova', 'company-nova', 'company-nova', 'company-logistica-sur', 'company-ferrari',
    'company-ferrari', 'company-pampa-agro', 'company-delta-finanzas', 'company-delta-finanzas',
    'company-cumbre-seguros', 'company-patagonia-energia', 'company-austral-media', 'company-rio-diseno',
    'company-maria-perez', 'company-julian-gomez'];
BEGIN
  FOR tenant IN SELECT id FROM company WHERE id = ANY (clients) ORDER BY id LOOP
    PERFORM set_config('app.tenant_id', tenant.id, true);

    INSERT INTO booking (id, tenant_id, room_id, booked_by, starts_at, ends_at, status, cancelled_at)
    SELECT
      c.key,
      tenant.id,
      c.room_id,
      (SELECT u.id FROM app_user u WHERE u.tenant_id = tenant.id ORDER BY u.id LIMIT 1),
      c.starts_at,
      c.ends_at,
      CASE WHEN abs(hashtext(c.key || 's')) % 7 = 0 THEN 'cancelled'::booking_status ELSE 'confirmed'::booking_status END,
      CASE WHEN abs(hashtext(c.key || 's')) % 7 = 0 THEN c.starts_at - interval '1 day' END
    FROM (
      SELECT
        k.key, k.room_id,
        (k.day + make_interval(mins => k.opens_at + k.offset_min)) AT TIME ZONE k.time_zone AS starts_at,
        (k.day + make_interval(mins => k.opens_at + k.offset_min + k.minutes)) AT TIME ZONE k.time_zone AS ends_at,
        k.chance
      FROM (
        SELECT
          'scale-' || to_char(d.day, 'YYYY-MM-DD') || '-' || r.id || '-' || s.n AS key,
          r.id AS room_id, d.day, f.opens_at, f.time_zone, s.offset_min, s.minutes,
          s.chance
            - CASE WHEN extract(isodow FROM d.day) >= 5 THEN 20 ELSE 0 END
            - CASE WHEN d.day > (now() AT TIME ZONE f.time_zone)::date THEN 15 ELSE 0 END
            - CASE WHEN abs(hashtext(r.id)) % 5 = 0 THEN 30 ELSE 0 END AS chance
        FROM room r
        JOIN facility f ON f.id = r.facility_id
        CROSS JOIN LATERAL (
          SELECT (now() AT TIME ZONE f.time_zone)::date + g AS day FROM generate_series(-28, 28) AS g
        ) AS d
        -- Offsets from opening time; the last one ends 9 hours after it, inside every sede's hours.
        CROSS JOIN (VALUES (1, 0, 60, 70), (2, 90, 90, 65), (3, 210, 60, 45), (4, 300, 120, 50), (5, 450, 90, 35))
          AS s(n, offset_min, minutes, chance)
        WHERE (r.id LIKE 'room-central-%' OR r.facility_id IN ('facility-norte', 'facility-cordoba', 'facility-rosario'))
          AND r.deactivated_at IS NULL
          AND extract(dow FROM d.day)::smallint = ANY (f.open_weekdays)
      ) AS k
    ) AS c
    WHERE abs(hashtext(c.key)) % 100 < c.chance
      AND clients[1 + abs(hashtext(c.key || 'c')) % cardinality(clients)] = tenant.id
      AND NOT EXISTS (
        SELECT 1 FROM block b JOIN room r ON r.id = c.room_id
        WHERE b.released_at IS NULL AND b.facility_id = r.facility_id AND (b.room_id IS NULL OR b.room_id = c.room_id)
          AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(c.starts_at, c.ends_at, '[)')
      )
    ON CONFLICT DO NOTHING;
  END LOOP;
END
$$;
