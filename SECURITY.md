# Security

## Scope highlights

- **Tenant isolation.** No client company may read or change another company's bookings. Row level security in Postgres and a tenant filter in every repository enforce it twice.
- **Identity.** The challenge does not require real authentication; how the current company is chosen is documented in the README and must never come from a value the client can freely change without a server check.

## Practices

- **Secrets:** they are never committed and never logged. Local credentials live in `.env.local` (from `.env.example`).
- **Dependencies:** they are pinned. pnpm's minimum release age blocks freshly published versions, so do not add exclusions to bypass it.
