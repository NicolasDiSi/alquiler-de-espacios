import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

const WCAG_22_AA = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

export async function expectNoViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(WCAG_22_AA);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  const summary = violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, include ? `axe on ${include}` : "axe on the page").toEqual([]);
}

/**
 * The WCAG contrast ratio between an element's text and what is painted behind it: its own background, or the first
 * ancestor's that is not transparent, with translucent layers composed over it. Colors are read through a canvas, so
 * `oklch()` and `lab()` come back as sRGB. axe checks text only on what it can see; this covers a marked day too.
 */
export function contrastOf(target: Locator): Promise<number> {
  return target.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("no canvas");
    const rgba = (color: string): [number, number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: number[], bottom: number[]) =>
      [0, 1, 2].map((i) => (top[i] ?? 0) * (top[3] ?? 1) + (bottom[i] ?? 0) * (1 - (top[3] ?? 1)));

    const layers: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const layer = rgba(getComputedStyle(node).backgroundColor);
      if ((layer[3] ?? 0) > 0) layers.push(layer);
      if ((layer[3] ?? 0) >= 1) break;
    }
    const background = layers.reverse().reduce((below, layer) => over(layer, below), [255, 255, 255]);
    const foreground = over(rgba(getComputedStyle(element).color), background);

    const luminance = (rgb: number[]) => {
      const [r = 0, g = 0, b = 0] = rgb.map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
  });
}
