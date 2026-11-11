# apps/web

The web app for client companies and the operator: the Studio Admin shell (sidebar, header, preferences) with one Ant Design inspired default theme, built on Next.js 16 (App Router), Tailwind CSS v4 and shadcn/ui (`radix-nova`).

## Commands

```bash
pnpm --filter @espacios/web dev        # http://localhost:3000
pnpm --filter @espacios/web build
pnpm --filter @espacios/web typecheck  # next typegen, then tsc
pnpm --filter @espacios/web test       # Vitest, src/**/*.test.ts
pnpm check:ai --gate=e2e                 # turbo builds first, then Playwright against next start on port 3100
pnpm check:ai --gate=strings             # no visible text written in code
```

## Where things live

- `src/app/(app)/`: the shell layout and its routes. `_components/` holds the shell pieces (sidebar, header controls, `DashboardSidebarProvider`). `design-system/` is the gallery page, `noindex` and outside the sidebar.
- `src/components/ui/`: shadcn/ui output, added with the shadcn CLI and never edited. Biome, knip and the `strings` gate skip it. Our own components live one level up in `src/components/`.
- `src/styles/`: CSS keyed by the `data-slot` attributes shadcn/ui renders, to adapt generated components without editing them (floating content capped to the viewport, sidebar widths derived from `--spacing`). Imported from `globals.css`. It is the only place a `data-slot` selector is allowed, and its rules change layout only; `theme-contrast.test.ts` fails otherwise. Review it when the shadcn CLI updates components, since a renamed `data-slot` or `--radix-*` variable silently stops a fix.
- `src/app/globals.css`: the theme. Token values only, under `:root` and `.dark`; `theme-contrast.test.ts` reads this file and checks the contrast matrix.
- `src/lib/preferences/`, `src/stores/preferences/`, `src/scripts/theme-boot.tsx`: the preference registry, its store and the inline boot script that applies mode and density before the first paint.
- `src/i18n/` and `messages/es.json`: next-intl. Locale `es-AR` and time zone `America/Argentina/Buenos_Aires` come from `src/i18n/config.ts`.
- `src/navigation/sidebar-items.ts`: the sidebar entries (only sections that exist). `src/config/app-config.ts`: the product name.

## Rules

- **Layouts and pages read no cookies or headers**, so every route prerenders. Stored preferences are restored on the client (the boot script, `DashboardSidebarProvider`).
- **Every visible text comes from `messages/es.json`** through next-intl, including the labels shadcn/ui would render in English (pass them translated where the component is used). The `strings` gate fails on JSX text and on literal `aria-label`, `title`, `placeholder`, `alt` and `label` values.
- **The theme is token values, not overrides.** Change colors, radius, shadows and fonts through the variables in `globals.css`; density changes only `--spacing` (`html[data-density]`). Status colors (`destructive`, `success`, `warning`, `info`) are fixed and never derived from a brand color.
- **Two Biome exceptions, and only these:** `src/scripts/theme-boot.tsx` may use `dangerouslySetInnerHTML` (the inline boot script) and `src/lib/cookie.client.ts` may write `document.cookie`. Both are scoped overrides in `biome.json`.
- **Server or Client Component, Server Action or Route Handler:** follow the `nextjs-server-client` skill.

## Tests

- Vitest runs only `src/**/*.test.ts` (no DOM environment).
- Playwright suites in `e2e/` run against the production build (`next start`), with axe on WCAG 2.2 AA tags. `e2e/fixtures.ts` has the helpers: `setPreferences` stores preferences as cookies before load, `blockHydration` checks what paints before React, `waitForHydration` waits for the client.

_Drafted by /sync from the introducing change, worth a quick human pass._

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
