-- Cluster roles for local development and for the test containers. Postgres runs this once, as the superuser
-- (POSTGRES_USER), when the data directory is first created. After changing it, run: docker compose down -v
-- BYPASSRLS roles are cluster wide and need a superuser, so they cannot be created from a migration (and Prisma's
-- shadow database replays migrations in the same cluster). Migrations only GRANT to these roles.
-- Spec: docs/specs/_root/0001-booking-platform-architecture/index.md ("Database roles and connections").
-- The passwords are local development credentials. Production creates its logins the same way, with real secrets.

-- Companies: the app login. Owns nothing, so row level security always applies.
CREATE ROLE espacios_runtime NOLOGIN;
CREATE ROLE espacios_app LOGIN PASSWORD 'espacios_app' IN ROLE espacios_runtime;

-- The schema owner: migrations, seeds, Prisma Studio. Not a superuser, and FORCE ROW LEVEL SECURITY applies to it.
-- CREATEDB is for Prisma's shadow database in `prisma migrate dev`.
CREATE ROLE espacios_owner LOGIN PASSWORD 'espacios_owner' CREATEDB;

-- The operator: sees every company, writes nothing (SELECT grants only, see the migrations).
CREATE ROLE espacios_operator LOGIN PASSWORD 'espacios_operator' BYPASSRLS;

-- Owns the availability function, which must see every company's bookings (but only four columns, by grant).
-- The owner becomes a member so a migration can hand the function over.
CREATE ROLE espacios_availability NOLOGIN BYPASSRLS;
GRANT espacios_availability TO espacios_owner;

-- The owner role owns the database and the public schema, so migrations run without a superuser.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I OWNER TO espacios_owner', current_database());
END
$$;
ALTER SCHEMA public OWNER TO espacios_owner;
