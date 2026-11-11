---
name: pattern-catalog
description: Pick and record design patterns in alquiler-de-espacios before building. Use in /architect when a design has two writes in one action, a second client type, a cache, an external call, a retry or a concurrent counter, in /develop when a spec names a pattern, and in /check review to see the diff follows the patterns the spec chose.
---

# Pattern catalog

Patterns are chosen at design time (`/architect`), consumed while building (`/develop`) and checked at review (`/check review`). The catalog is [catalog.md](catalog.md): each entry says when to reach for the pattern, what this project decided, where it lives and what proves it.

## The reuse ladder (first, always)

Before a new pattern or a new piece of code, answer in order. Stop at the first yes.

1. Is it needed at all? Can the requirement be met by doing less?
2. Does this repo already do it? Search `packages/` and `apps/web/src/composition/` first.
3. Does the platform cover it (Postgres, Next.js, the standard library)?
4. Does a dependency we already installed cover it (Prisma, Next.js, Zod)?
5. Only then write the minimum that works.

Adapted from the "ladder" in ponytail (`dietrichgebert/ponytail`, MIT). Nothing else of that package is used.

## The pattern check (in `/architect`, after the API and security stages)

Walk the triggers below against the design. For each one that fires, find the catalog entry and write one line in the spec (under `## Feature design`, "Key invariants" or a `**Patterns**` line): the concern, the pattern or the reason it is skipped, and the proof (a test or a gate).

| Trigger in the design | Look at |
| --- | --- |
| One action writes in two places (two tables owned by different code, a table and an email, a table and a cache) | Consistency across writes |
| A value is copied from its source to be read fast | Read through cache with a fence |
| A call to something outside our process (mail, a calendar, any HTTP API) | Bounded external call |
| A write that must not happen twice (retries, double clicks, webhooks) | Idempotent write |
| Two requests can change the same rule at once (the same room and time, counters) | Serialized by a lock |
| A second kind of client (operator vs company, a public API) | Backends for frontends |
| Access to tenant data | Tenant isolation twice |
| A change that must be explainable later | Append only history |
| A booking is cancelled and must free its slot | Overlap guarded by the database |
| A slow or fallible side effect after a change (mail, push, webhook) | Transactional outbox |

Rules:
- **Infer, ask only on a gap.** If the catalog already decides it, state the decision and move on. Ask the engineer only when a trigger fires and no entry covers it, or when they may want a different trade off.
- **A skipped pattern needs a reason** in one sentence. "Not needed yet" is a valid reason when it names what would change it.
- **Tier.** `GA` and `Beta`: run the whole check. `Alpha`: only the first trigger (two writes) and tenant isolation. `Prototype`: skip.
- **New pattern.** If the design needs one the catalog does not have, `/architect` adds the entry in the same change as the spec, with all four fields.

## While building (`/develop`)

- Read the spec's pattern lines and the catalog entry's "Where it lives" file as the example to copy.
- If an action writes in two places and the spec names no consistency pattern, stop and send it to `/architect`. Do not choose one while coding.

## At review (`/check review`)

Add to the review: does the diff follow the patterns the spec chose, and does it introduce a second write, a cache, an outside call, a retry or a second client type that has no pattern line? A new one without an entry is a major finding.

## After merge (`/sync`)

Update the "Where it lives" and "Proof" pointers of any entry the change touched (and a `Status` word the repo now contradicts), and flag a pattern the code uses that has no entry. The vendored `sync` skill carries the same rule as a local addition.
