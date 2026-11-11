-- Login used by the apps at runtime. It is not the owner of any table, so row-level security always applies.
-- Grants on tables come from the migrations (role espacios_runtime). Production creates its login the same way.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'espacios_runtime') THEN
    CREATE ROLE espacios_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'espacios_app') THEN
    CREATE ROLE espacios_app LOGIN PASSWORD 'espacios_app' IN ROLE espacios_runtime;
  END IF;
END
$$;
