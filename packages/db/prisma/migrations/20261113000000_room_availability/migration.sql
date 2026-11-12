-- Spec 0008: every room's busy time in one read, for the rooms list, the room calendar and the new booking search.
-- Hand written: no table changes, so the Prisma schema does not move.
--
-- rooms_busy_intervals(p_from, p_to, p_room_id) returns, for every room (or one), the confirmed bookings and the
-- unreleased blocks overlapping [p_from, p_to): start, end, kind ('booked' or 'blocked') and mine. `mine` is true only
-- for a booking of current_tenant_id(), the tenant the unit of work set for this transaction: it is never a
-- parameter, so a caller can only learn which busy time is its own. No company, user, booking id or block reason
-- ever leaves the function.
CREATE FUNCTION rooms_busy_intervals(p_from timestamptz, p_to timestamptz, p_room_id text DEFAULT NULL)
  RETURNS TABLE (room_id text, starts_at timestamptz, ends_at timestamptz, kind text, mine boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    SELECT b.room_id, b.starts_at, b.ends_at, 'booked'::text,
      COALESCE(b.tenant_id = public.current_tenant_id(), false)
    FROM public.booking b
    WHERE b.status = 'confirmed'
      AND (p_room_id IS NULL OR b.room_id = p_room_id)
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    UNION ALL
    SELECT r.id, k.starts_at, k.ends_at, 'blocked'::text, false
    FROM public.room r
    JOIN public.block k ON k.facility_id = r.facility_id AND (k.room_id IS NULL OR k.room_id = r.id)
    WHERE (p_room_id IS NULL OR r.id = p_room_id)
      AND k.released_at IS NULL
      AND tstzrange(k.starts_at, k.ends_at, '[)') && tstzrange(p_from, p_to, '[)')
    ORDER BY 1, 2
  $$;

-- The function reads the caller's tenant through current_tenant_id() and compares it with tenant_id: one more column.
GRANT SELECT ("tenant_id") ON "booking" TO espacios_availability;
GRANT EXECUTE ON FUNCTION current_tenant_id() TO espacios_availability;
GRANT CREATE ON SCHEMA public TO espacios_availability;
ALTER FUNCTION rooms_busy_intervals(timestamptz, timestamptz, text) OWNER TO espacios_availability;
REVOKE CREATE ON SCHEMA public FROM espacios_availability;
REVOKE ALL ON FUNCTION rooms_busy_intervals(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rooms_busy_intervals(timestamptz, timestamptz, text) TO espacios_runtime, espacios_operator;
