-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_slug_key" ON "company"("slug");


-- The apps connect with a login in espacios_runtime (infra/local/postgres/01-runtime-role.sql). It owns no table,
-- so row level security always applies to it. See docs/adr/0003-prisma-multitenancy.md.
GRANT USAGE ON SCHEMA public TO espacios_runtime;

-- Companies are written by the operator through the owner connection; the runtime only reads them.
GRANT SELECT ON company TO espacios_runtime;
