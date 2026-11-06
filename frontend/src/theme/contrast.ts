/** WCAG 2.x relative luminance and contrast ratio. */
import { hexToRgb, over, type RGB } from "./palette";

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: RGB): number {
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: RGB | string, b: RGB | string): number {
  const la = relativeLuminance(typeof a === "string" ? hexToRgb(a) : a);
  const lb = relativeLuminance(typeof b === "string" ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Contrast of `fg` drawn at opacity `fgAlpha` on opaque `bg`. */
export function contrastWithAlpha(fg: string, fgAlpha: number, bg: string): number {
  return contrastRatio(over(fg, fgAlpha, bg), bg);
}

export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;
export const WCAG_NON_TEXT = 3;
