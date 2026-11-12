import type {
  CompanyUsageRow,
  DailyUsageRow,
  HeatmapRow,
  HeatmapScope,
  MetricRange,
  OperatorBookingFilter,
  OperatorBookingRecord,
  OperatorBookingsPageQuery,
  OperatorQueries,
  RoomUsageRow,
} from "@espacios/application";
import type { BookingId, LocalDate } from "@espacios/domain";

import type { DatabaseClient } from "./client";
import { Prisma } from "./generated/prisma/client";

const RECORD_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  createdAt: true,
  cancelledAt: true,
  company: { select: { id: true, name: true } },
  room: { select: { id: true, name: true, facility: { select: { timeZone: true, name: true } } } },
  user: { select: { name: true } },
} as const satisfies Prisma.BookingSelect;

type Row = Prisma.BookingGetPayload<{ select: typeof RECORD_SELECT }>;

function toRecord(row: Row): OperatorBookingRecord {
  return {
    id: row.id as BookingId,
    company: row.company,
    room: {
      id: row.room.id,
      name: row.room.name,
      timeZone: row.room.facility.timeZone,
      facilityName: row.room.facility.name,
    },
    bookedBy: { name: row.user.name },
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
  };
}

function matching(filter: OperatorBookingFilter): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (filter.companyId) where.tenantId = filter.companyId;
  if (filter.roomId) where.roomId = filter.roomId;
  if (filter.facilityId) where.room = { facilityId: filter.facilityId };
  if (filter.status) where.status = filter.status;
  if (filter.from || filter.to) {
    where.startsAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) };
  }
  return where;
}

const MINUTES_OF = (ranges: string) =>
  Prisma.raw(
    `(SELECT COALESCE(SUM(EXTRACT(EPOCH FROM upper(x) - lower(x))), 0) / 60 FROM unnest(${ranges}) AS x)::float8`,
  );

/**
 * One row per room and open local day (spec 0004, "Open minutes of a room"): the facility's opening window of that day,
 * read in its own zone, cut to the room's active window `[active_from, deactivated_at)`. Blocks (the room's own and
 * facility wide) are taken out: `blocked_ranges` is what they covered, `open_ranges` what is left. A released block only
 * counts until its release, and one released before it began is skipped (`tstzrange` refuses a reversed range).
 */
function roomDays(range: MetricRange, scope: HeatmapScope) {
  return Prisma.sql`
    room_day AS (
      SELECT r.id AS room_id, f.id AS facility_id, f.name AS facility_name, f.time_zone, dy.day,
        tstzmultirange(tstzrange(
          (dy.day::timestamp + make_interval(mins => f.opens_at)) AT TIME ZONE f.time_zone,
          (dy.day::timestamp + make_interval(mins => f.closes_at)) AT TIME ZONE f.time_zone, '[)'))
        * tstzmultirange(tstzrange(r.active_from, r.deactivated_at, '[)')) AS open_window
      FROM room r
      JOIN facility f ON f.id = r.facility_id
      CROSS JOIN (
        SELECT d::date AS day FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d
      ) dy
      WHERE EXTRACT(DOW FROM dy.day)::smallint = ANY (f.open_weekdays)
        AND (${scope.facilityId ?? null}::text IS NULL OR f.id = ${scope.facilityId ?? null}::text)
        AND (${scope.roomId ?? null}::text IS NULL OR r.id = ${scope.roomId ?? null}::text)
    ),
    room_day_open AS (
      SELECT rd.*,
        rd.open_window * COALESCE(bl.ranges, '{}'::tstzmultirange) AS blocked_ranges,
        rd.open_window - COALESCE(bl.ranges, '{}'::tstzmultirange) AS open_ranges
      FROM room_day rd
      LEFT JOIN LATERAL (
        SELECT range_agg(CASE WHEN LEAST(b.ends_at, COALESCE(b.released_at, b.ends_at)) > b.starts_at
          THEN tstzrange(b.starts_at, LEAST(b.ends_at, COALESCE(b.released_at, b.ends_at)), '[)') END) AS ranges
        FROM block b
        WHERE b.facility_id = rd.facility_id AND (b.room_id IS NULL OR b.room_id = rd.room_id)
      ) bl ON true
    )`;
}

/**
 * The operator's global reads, on the operator login: `BYPASSRLS` and `SELECT` only. There is no tenant filter on
 * purpose, the operator sees every company (spec 0004). Two runs, ordered on `(starts_at, id)`: not ended yet (soonest
 * first), then ended (most recent first). The second run only starts once the first has no more rows.
 */
export function createPrismaOperatorQueries(db: DatabaseClient): OperatorQueries {
  const run = (
    query: OperatorBookingsPageQuery,
    kind: "upcoming" | "past",
    cursor: OperatorBookingsPageQuery["after"],
    take: number,
  ) => {
    const asc = kind === "upcoming";
    const beyond = asc ? "gt" : "lt";
    const where: Prisma.BookingWhereInput[] = [
      matching(query.filter),
      asc ? { endsAt: { gt: query.now } } : { endsAt: { lte: query.now } },
    ];
    if (cursor) {
      where.push({
        OR: [{ startsAt: { [beyond]: cursor.startsAt } }, { startsAt: cursor.startsAt, id: { [beyond]: cursor.id } }],
      });
    }
    return db.booking.findMany({
      where: { AND: where },
      orderBy: [{ startsAt: asc ? "asc" : "desc" }, { id: asc ? "asc" : "desc" }],
      take,
      select: RECORD_SELECT,
    });
  };

  return {
    roomUsage: async (range) => {
      const rows = await db.$queryRaw<
        {
          room_id: string;
          room_name: string;
          facility_id: string;
          facility_name: string;
          open: number;
          blocked: number;
          booked: number;
        }[]
      >`
        WITH ${roomDays(range, {})},
        open_total AS (
          SELECT room_id, SUM(${MINUTES_OF("open_ranges")}) AS open, SUM(${MINUTES_OF("blocked_ranges")}) AS blocked
          FROM room_day_open GROUP BY room_id
        ),
        booked AS (
          SELECT bk.room_id, SUM(EXTRACT(EPOCH FROM bk.ends_at - bk.starts_at)) / 60 AS minutes
          FROM booking bk
          JOIN room r ON r.id = bk.room_id
          JOIN facility f ON f.id = r.facility_id
          WHERE bk.status = 'confirmed'
            AND (bk.starts_at AT TIME ZONE f.time_zone)::date BETWEEN ${range.from}::date AND ${range.to}::date
          GROUP BY bk.room_id
        )
        SELECT r.id AS room_id, r.name AS room_name, f.id AS facility_id, f.name AS facility_name,
          COALESCE(o.open, 0)::float8 AS open, COALESCE(o.blocked, 0)::float8 AS blocked,
          COALESCE(b.minutes, 0)::float8 AS booked
        FROM room r
        JOIN facility f ON f.id = r.facility_id
        LEFT JOIN open_total o ON o.room_id = r.id
        LEFT JOIN booked b ON b.room_id = r.id
        ORDER BY f.name, r.name`;
      return rows.map(
        (row): RoomUsageRow => ({
          roomId: row.room_id,
          roomName: row.room_name,
          facilityId: row.facility_id,
          facilityName: row.facility_name,
          openMinutes: row.open,
          blockedMinutes: row.blocked,
          bookedMinutes: row.booked,
        }),
      );
    },

    companyUsage: async (range, kind) => {
      const rows = await db.$queryRaw<
        {
          id: string;
          name: string;
          kind: "company" | "individual";
          active: boolean;
          booked: number;
          confirmed: number;
          cancelled: number;
          last_booking_at: Date | null;
        }[]
      >`
        SELECT c.id, c.name, c.kind::text AS kind, (c.deactivated_at IS NULL) AS active,
          COALESCE(SUM(EXTRACT(EPOCH FROM b.ends_at - b.starts_at) / 60)
            FILTER (WHERE b.status = 'confirmed' AND b.in_range), 0)::float8 AS booked,
          (COUNT(*) FILTER (WHERE b.status = 'confirmed' AND b.in_range))::int AS confirmed,
          (COUNT(*) FILTER (WHERE b.status = 'cancelled' AND b.in_range))::int AS cancelled,
          MAX(b.created_at) FILTER (WHERE b.status = 'confirmed') AS last_booking_at
        FROM company c
        LEFT JOIN (
          SELECT bk.tenant_id, bk.status, bk.starts_at, bk.ends_at, bk.created_at,
            (bk.starts_at AT TIME ZONE f.time_zone)::date BETWEEN ${range.from}::date AND ${range.to}::date AS in_range
          FROM booking bk
          JOIN room r ON r.id = bk.room_id
          JOIN facility f ON f.id = r.facility_id
        ) b ON b.tenant_id = c.id
        WHERE (${kind ?? null}::text IS NULL OR c.kind::text = ${kind ?? null}::text)
        GROUP BY c.id
        ORDER BY c.name`;
      return rows.map(
        (row): CompanyUsageRow => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          active: row.active,
          bookedMinutes: row.booked,
          confirmed: row.confirmed,
          cancelled: row.cancelled,
          lastBookingAt: row.last_booking_at,
        }),
      );
    },

    clientActivity: async (range, companyId, now) => {
      // Confirmed bookings of one client, each on the local day it starts in its facility's zone (as `roomUsage`).
      const confirmedInRange = Prisma.sql`
        FROM booking bk
        JOIN room r ON r.id = bk.room_id
        JOIN facility f ON f.id = r.facility_id
        WHERE bk.tenant_id = ${companyId} AND bk.status = 'confirmed'
          AND (bk.starts_at AT TIME ZONE f.time_zone)::date BETWEEN ${range.from}::date AND ${range.to}::date`;
      const [rooms, weekdays, upcoming] = await Promise.all([
        db.$queryRaw<
          {
            room_id: string;
            room_name: string;
            facility_id: string;
            facility_name: string;
            booked: number;
            confirmed: number;
          }[]
        >`
          SELECT r.id AS room_id, r.name AS room_name, f.id AS facility_id, f.name AS facility_name,
            (SUM(EXTRACT(EPOCH FROM bk.ends_at - bk.starts_at)) / 60)::float8 AS booked, COUNT(*)::int AS confirmed
          ${confirmedInRange}
          GROUP BY r.id, f.id
          ORDER BY booked DESC, r.name`,
        db.$queryRaw<{ weekday: number; booked: number; confirmed: number }[]>`
          SELECT EXTRACT(DOW FROM (bk.starts_at AT TIME ZONE f.time_zone))::int AS weekday,
            (SUM(EXTRACT(EPOCH FROM bk.ends_at - bk.starts_at)) / 60)::float8 AS booked, COUNT(*)::int AS confirmed
          ${confirmedInRange}
          GROUP BY 1
          ORDER BY 1`,
        db.$queryRaw<{ upcoming: number }[]>`
          SELECT COUNT(*)::int AS upcoming FROM booking
          WHERE tenant_id = ${companyId} AND status = 'confirmed' AND starts_at > ${now}`,
      ]);
      return {
        rooms: rooms.map((row) => ({
          roomId: row.room_id,
          roomName: row.room_name,
          facilityId: row.facility_id,
          facilityName: row.facility_name,
          bookedMinutes: row.booked,
          confirmed: row.confirmed,
        })),
        weekdays: weekdays.map((row) => ({
          weekday: row.weekday,
          bookedMinutes: row.booked,
          confirmed: row.confirmed,
        })),
        upcoming: upcoming[0]?.upcoming ?? 0,
      };
    },

    dailyUsage: async (range, scope) => {
      // Open minutes per local day come from `room_day_open`; bookings count on the local day they start in their
      // facility's zone, exactly like `roomUsage`. Every day of the range answers, closed ones with zero.
      const rows = await db.$queryRaw<{ day: string; open: number; booked: number }[]>`
        WITH ${roomDays(range, scope)},
        open_day AS (
          SELECT day, SUM(${MINUTES_OF("open_ranges")}) AS open FROM room_day_open GROUP BY day
        ),
        booked_day AS (
          SELECT (bk.starts_at AT TIME ZONE f.time_zone)::date AS day,
            SUM(EXTRACT(EPOCH FROM bk.ends_at - bk.starts_at)) / 60 AS minutes
          FROM booking bk
          JOIN room r ON r.id = bk.room_id
          JOIN facility f ON f.id = r.facility_id
          WHERE bk.status = 'confirmed'
            AND (bk.starts_at AT TIME ZONE f.time_zone)::date BETWEEN ${range.from}::date AND ${range.to}::date
            AND (${scope.facilityId ?? null}::text IS NULL OR f.id = ${scope.facilityId ?? null}::text)
            AND (${scope.roomId ?? null}::text IS NULL OR r.id = ${scope.roomId ?? null}::text)
          GROUP BY 1
        )
        SELECT to_char(d, 'YYYY-MM-DD') AS day,
          COALESCE(o.open, 0)::float8 AS open, COALESCE(b.minutes, 0)::float8 AS booked
        FROM generate_series(${range.from}::date, ${range.to}::date, interval '1 day') AS d
        LEFT JOIN open_day o ON o.day = d::date
        LEFT JOIN booked_day b ON b.day = d::date
        ORDER BY d`;
      return rows.map(
        (row): DailyUsageRow => ({ date: row.day as LocalDate, openMinutes: row.open, bookedMinutes: row.booked }),
      );
    },

    heatmap: async (range, scope) => {
      const rows = await db.$queryRaw<
        { facility_id: string; facility_name: string; weekday: number; hour: number; open: number; booked: number }[]
      >`
        WITH ${roomDays(range, scope)},
        open_cells AS (
          SELECT rd.facility_id, rd.facility_name, EXTRACT(DOW FROM rd.day)::int AS weekday, h AS hour,
            ${MINUTES_OF("(rd.open_ranges * cell.hour_range)")} AS open, 0::float8 AS booked
          FROM room_day_open rd
          CROSS JOIN generate_series(0, 23) AS h
          CROSS JOIN LATERAL (
            SELECT tstzmultirange(tstzrange(
              (rd.day::timestamp + make_interval(hours => h)) AT TIME ZONE rd.time_zone,
              (rd.day::timestamp + make_interval(hours => h + 1)) AT TIME ZONE rd.time_zone, '[)')) AS hour_range
          ) cell
        ),
        booked_cells AS (
          SELECT f.id AS facility_id, f.name AS facility_name,
            EXTRACT(DOW FROM c.local_start)::int AS weekday, EXTRACT(HOUR FROM c.local_start)::int AS hour,
            0::float8 AS open,
            SUM(EXTRACT(EPOCH FROM LEAST(bk.ends_at, c.cell_end) - GREATEST(bk.starts_at, c.cell_start)) / 60)::float8 AS booked
          FROM booking bk
          JOIN room r ON r.id = bk.room_id
          JOIN facility f ON f.id = r.facility_id
          CROSS JOIN LATERAL (
            SELECT g AS local_start,
              g AT TIME ZONE f.time_zone AS cell_start,
              (g + interval '1 hour') AT TIME ZONE f.time_zone AS cell_end
            FROM generate_series(
              date_trunc('hour', bk.starts_at AT TIME ZONE f.time_zone),
              (bk.ends_at AT TIME ZONE f.time_zone) - interval '1 microsecond',
              interval '1 hour') AS g
          ) c
          WHERE bk.status = 'confirmed'
            AND (bk.starts_at AT TIME ZONE f.time_zone)::date BETWEEN ${range.from}::date AND ${range.to}::date
            AND (${scope.facilityId ?? null}::text IS NULL OR f.id = ${scope.facilityId ?? null}::text)
            AND (${scope.roomId ?? null}::text IS NULL OR r.id = ${scope.roomId ?? null}::text)
          GROUP BY f.id, f.name, weekday, hour
        )
        SELECT facility_id, facility_name, weekday, hour, SUM(open)::float8 AS open, SUM(booked)::float8 AS booked
        FROM (
          SELECT facility_id, facility_name, weekday, hour, open, booked FROM open_cells
          UNION ALL
          SELECT facility_id, facility_name, weekday, hour, open, booked FROM booked_cells
        ) cells
        GROUP BY facility_id, facility_name, weekday, hour
        HAVING SUM(open) > 0 OR SUM(booked) > 0
        ORDER BY facility_name, weekday, hour`;
      return rows.map(
        (row): HeatmapRow => ({
          facilityId: row.facility_id,
          facilityName: row.facility_name,
          weekday: row.weekday,
          hour: row.hour,
          openMinutes: row.open,
          bookedMinutes: row.booked,
        }),
      );
    },

    scopeExists: async (scope) => {
      if (scope.roomId) {
        const room = await db.room.findUnique({ where: { id: scope.roomId }, select: { facilityId: true } });
        return room !== null && (!scope.facilityId || room.facilityId === scope.facilityId);
      }
      if (scope.facilityId) {
        return (await db.facility.findUnique({ where: { id: scope.facilityId }, select: { id: true } })) !== null;
      }
      return true;
    },

    listBookings: async (query) => {
      const { after, limit } = query;
      const first = after?.run ?? "upcoming";
      const rows = await run(query, first, after, limit);
      if (first === "past" || rows.length >= limit) return rows.map(toRecord);
      const rest = await run(query, "past", null, limit - rows.length);
      return [...rows, ...rest].map(toRecord);
    },
  };
}
