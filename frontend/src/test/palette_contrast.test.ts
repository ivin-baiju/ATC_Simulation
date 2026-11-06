import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  contrastWithAlpha,
  WCAG_AA_TEXT,
  WCAG_NON_TEXT,
} from "../theme/contrast";
import {
  alertColors,
  NON_TEXT_PAIRS,
  palette,
  TEXT_PAIRS,
} from "../theme/palette";

describe("Theme palette & WCAG contrast compliance", () => {
  it("defines the exact required base palette hex values", () => {
    expect(palette.ink).toBe("#071B2B");
    expect(palette.teal).toBe("#167D8D");
    expect(palette.aqua).toBe("#B9E4E8");
    expect(palette.paper).toBe("#EEEEEE");
    expect(palette.white).toBe("#FFFFFF");
  });

  it("defines the exact safety alert exception colours", () => {
    expect(alertColors.advisory).toBe("#167D8D");
    expect(alertColors.caution).toBe("#D97706");
    expect(alertColors.warning).toBe("#DC2626");
  });

  it("meets WCAG AA (>= 4.5:1) for ink on paper, white, and aqua, and white on teal", () => {
    expect(contrastRatio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(contrastRatio(palette.ink, palette.white)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(contrastRatio(palette.ink, palette.aqua)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    expect(contrastRatio(palette.white, palette.teal)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(TEXT_PAIRS)("meets WCAG AA text contrast for $name", ({ fg, fgAlpha, bg }) => {
    const ratio =
      fgAlpha !== undefined ? contrastWithAlpha(fg, fgAlpha, bg) : contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
  });

  it.each(NON_TEXT_PAIRS)("meets WCAG 1.4.11 non-text contrast (>= 3:1) for $name", ({ fg, bg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_NON_TEXT);
  });

  it("keeps tokens.css in sync with palette.ts and enforces light-only mode", () => {
    const tokensPath = path.resolve(__dirname, "../theme/tokens.css");
    const css = fs.readFileSync(tokensPath, "utf-8");

    expect(css).toContain("color-scheme: light only;");
    expect(css).not.toMatch(/prefers-color-scheme:\s*dark/i);

    expect(css).toContain(`--ink: ${palette.ink};`);
    expect(css).toContain(`--teal: ${palette.teal};`);
    expect(css).toContain(`--aqua: ${palette.aqua};`);
    expect(css).toContain(`--paper: ${palette.paper};`);
    expect(css).toContain(`--white: ${palette.white};`);
    expect(css).toContain(`--alert-advisory: ${alertColors.advisory};`);
    expect(css).toContain(`--alert-caution: ${alertColors.caution};`);
    expect(css).toContain(`--alert-warning: ${alertColors.warning};`);
    expect(css).toContain("--radius-card: 12px;");

    const allowedHex = new Set<string>([
      ...Object.values(palette).map((c) => c.toUpperCase()),
      ...Object.values(alertColors).map((c) => c.toUpperCase()),
    ]);
    const foundHex = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    for (const hex of foundHex) {
      expect(allowedHex.has(hex.toUpperCase())).toBe(true);
    }
  });
});
