## What and why

<!-- What changes, and the need from the brief it addresses. -->

## How

<!-- The approach, and the layers it touches: domain / application / db / web. -->

## Screenshots

<!-- UI changes: desktop and 375px, light and dark. Delete this section otherwise. -->

## Checklist

- [ ] `pnpm check:ai` passes
- [ ] Tests cover the new behavior (rules, use cases, tenant isolation, concurrency where relevant)
- [ ] Authorization is enforced in the use case, input validated with Zod at the boundary
- [ ] README assumptions, ADRs or specs updated if behavior or architecture changed
- [ ] AI corrections logged in `docs/ai-usage.md`
