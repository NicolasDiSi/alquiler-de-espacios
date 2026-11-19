/**
 * Checks the default theme in `globals.css` against the contrast matrix.
 * Pairs are checked as shadcn/ui renders them, including its opacity modifiers, so the file that ships is the file
 * that is checked. Disabled controls are exempt, as WCAG allows.
 */

import { type Color, converter, interpolate, parse, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS_CSS = readFileSync(fileURLToPath(new URL("./globals.css", import.meta.url)), "utf8");

const TEXT = 4.5;
const NON_TEXT = 3;

type Rgb = { mode: "rgb"; r: number; g: number; b: number };
type Mode = "light" | "dark";
type Pair = { name: string; foreground: Rgb; background: Rgb; minimum: number };

const toRgb = converter("rgb");

/** The raw values of every block with this selector, in order (the calendar's tokens are a second `:root`). */
function readBlocks(selector: string): Map<string, string> {
  const escaped = selector.replace(".", "\\.");
  const blocks = [...GLOBALS_CSS.matchAll(new RegExp(`^${escaped} \\{([\\s\\S]*?)^\\}`, "gm"))];
  if (blocks.length === 0) throw new Error(`globals.css has no ${selector} block`);

  const values = new Map<string, string>();
  for (const [, block = ""] of blocks) {
    for (const [, name, value] of block.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      if (name && value) values.set(name, value.trim());
    }
  }
  return values;
}

/**
 * The theme of one mode, colors only: `.dark` overrides `:root` on the same element, and a `var(--x)` reads `x` in that
 * same mode, as the browser resolves it.
 */
function readTheme(mode: Mode): Map<string, Rgb> {
  const raw = readBlocks(":root");
  if (mode === "dark") for (const [name, value] of readBlocks(".dark")) raw.set(name, value);
  const resolve = (value: string, depth = 0): string | undefined => {
    const reference = /^var\(--([\w-]+)\)$/.exec(value)?.[1];
    if (!reference) return value;
    const target = raw.get(reference);
    return target && depth < 8 ? resolve(target, depth + 1) : undefined;
  };
  const tokens = new Map<string, Rgb>();
  for (const [name, value] of raw) {
    const resolved = resolve(value);
    const color = resolved ? parse(resolved) : undefined;
    if (color) tokens.set(name, opaque(color));
  }
  return tokens;
}

function opaque(color: Color): Rgb {
  const { r, g, b } = toRgb(color);
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel));
  return { mode: "rgb", r: clamp(r), g: clamp(g), b: clamp(b) };
}

/** A color at `alpha` over an opaque background, blended the way the browser composites it. */
function over(color: Rgb, alpha: number, background: Rgb): Rgb {
  const mix = (front: number, back: number) => alpha * front + (1 - alpha) * back;
  return { mode: "rgb", r: mix(color.r, background.r), g: mix(color.g, background.g), b: mix(color.b, background.b) };
}

function buildPairs(mode: Mode): Pair[] {
  const theme = readTheme(mode);
  const token = (name: string): Rgb => {
    const value = theme.get(name);
    if (!value) throw new Error(`${mode} theme is missing --${name}`);
    return value;
  };

  const surfaces = ["background", "card", "popover", "muted"];
  const sidebarSurfaces = ["sidebar", "sidebar-accent"];
  const pairs: Pair[] = [];
  const add = (name: string, foreground: Rgb, background: Rgb, minimum: number) =>
    pairs.push({ name: `${mode}: ${name}`, foreground, background, minimum });

  // Text on every surface.
  for (const text of ["foreground", "muted-foreground", "primary"]) {
    for (const surface of surfaces) add(`${text} on ${surface}`, token(text), token(surface), TEXT);
  }
  add("card-foreground on card", token("card-foreground"), token("card"), TEXT);
  add("popover-foreground on popover", token("popover-foreground"), token("popover"), TEXT);

  // Filled controls, at rest and in shadcn/ui's hover states.
  add("primary-foreground on primary", token("primary-foreground"), token("primary"), TEXT);
  for (const surface of surfaces) {
    const hover = over(token("primary"), 0.8, token(surface));
    add(`primary-foreground on primary/80 over ${surface}`, token("primary-foreground"), hover, TEXT);
  }
  add("secondary-foreground on secondary", token("secondary-foreground"), token("secondary"), TEXT);
  // Button secondary hover: color-mix(in oklch, var(--secondary), var(--foreground) 5%).
  const secondaryHover = opaque(interpolate([token("secondary"), token("foreground")], "oklch")(0.05));
  add("secondary-foreground on the secondary hover mix", token("secondary-foreground"), secondaryHover, TEXT);
  add("accent-foreground on accent", token("accent-foreground"), token("accent"), TEXT);

  // Sidebar.
  for (const surface of sidebarSurfaces) {
    add(`sidebar-foreground on ${surface}`, token("sidebar-foreground"), token(surface), TEXT);
    add(`sidebar-ring against ${surface}`, token("sidebar-ring"), token(surface), NON_TEXT);
  }
  add("sidebar-accent-foreground on sidebar-accent", token("sidebar-accent-foreground"), token("sidebar-accent"), TEXT);
  add(
    "sidebar-primary-foreground on sidebar-primary",
    token("sidebar-primary-foreground"),
    token("sidebar-primary"),
    TEXT,
  );

  // Status colors: as text on every surface, at 90% on card (alert descriptions) and on their tints.
  const restTint = mode === "light" ? 0.1 : 0.2;
  const tints: Record<string, number[]> = {
    destructive: mode === "light" ? [0.1, 0.2] : [0.2, 0.3],
    success: [restTint],
    warning: [restTint],
    info: [restTint],
  };
  for (const [status, alphas] of Object.entries(tints)) {
    const color = token(status);
    for (const surface of surfaces) {
      add(`${status} on ${surface}`, color, token(surface), TEXT);
      for (const alpha of alphas) {
        add(`${status} on ${status}/${alpha * 100} over ${surface}`, color, over(color, alpha, token(surface)), TEXT);
      }
    }
    add(`${status}/90 on card`, over(color, 0.9, token("card")), token("card"), TEXT);
  }

  // Control boundaries, focus indicators and chart marks.
  for (const boundary of ["input", "ring"]) {
    for (const surface of surfaces) add(`${boundary} against ${surface}`, token(boundary), token(surface), NON_TEXT);
  }
  for (const chart of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]) {
    add(`${chart} against card`, token(chart), token("card"), NON_TEXT);
  }

  // Calendars: the words on each state's fill, the selection's length chip, and the marks that are the only cue of a
  // day (today's ring and number, the picked day's frame) against the free surface. Borders and stripes of the cards
  // are decorative: every card names its state in words.
  for (const state of ["booked", "mine", "blocked", "draft", "chip", "picked"]) {
    add(
      `calendar-${state}-foreground on calendar-${state}`,
      token(`calendar-${state}-foreground`),
      token(`calendar-${state}`),
      TEXT,
    );
  }
  add(
    "calendar-blocked-foreground on calendar-blocked-hatch",
    token("calendar-blocked-foreground"),
    token("calendar-blocked-hatch"),
    TEXT,
  );
  add("calendar-today on calendar-free", token("calendar-today"), token("calendar-free"), TEXT);
  add("calendar-picked against calendar-free", token("calendar-picked"), token("calendar-free"), NON_TEXT);
  add("muted-foreground on calendar-past", token("muted-foreground"), token("calendar-past"), TEXT);
  // A closed day has no words on it: its fill is the cue, apart from the free surface. Not 3:1 (a fill, like a disabled
  // area, is exempt), but never the same color.
  add("calendar-past apart from calendar-free", token("calendar-past"), token("calendar-free"), 1.05);

  return pairs;
}

describe.each<Mode>(["light", "dark"])("%s theme contrast", (mode) => {
  it.each(buildPairs(mode).map((pair) => [pair.name, pair] as const))("%s", (_name, pair) => {
    const ratio = wcagContrast(pair.foreground, pair.background);
    expect(ratio, `${pair.name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.minimum);
  });
});

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

/** Layout fixes for generated components live here and only here. */
const STYLES_DIR = join(SRC_DIR, "styles");

/** Declarations that change how a component looks rather than how it is laid out. Custom properties are not matched. */
function lookDeclarations(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [
    ...withoutComments.matchAll(
      /(?:^|[;{\s])((?:color|background|border|outline|box-shadow|text-shadow|font|fill|stroke)[a-z-]*)\s*:/g,
    ),
  ].map((match) => match[1] ?? "");
}

describe("the theme does not fight shadcn/ui", () => {
  it("only src/styles/ targets a component's data-slot", () => {
    const offenders = cssFiles(SRC_DIR).filter(
      (file) => !file.startsWith(STYLES_DIR) && /\[\s*data-slot/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("src/styles/ changes layout only, never color, background, border, shadow, radius or font", () => {
    const offenders = cssFiles(STYLES_DIR).flatMap((file) =>
      lookDeclarations(readFileSync(file, "utf8")).map((property) => `${file}: ${property}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the layout only check catches look properties and ignores custom properties", () => {
    expect(lookDeclarations("[data-slot=x] { background: red; border-radius: 0; max-height: 1px; }")).toEqual([
      "background",
      "border-radius",
    ]);
    expect(lookDeclarations("/* color: red */ [data-slot=x] { --sidebar-width: 1rem; overflow-y: auto; }")).toEqual([]);
  });
});
