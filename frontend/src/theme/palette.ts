/**
 * Single source of truth for UI colour.
 *
 * Base palette: exactly four colours plus white. Everything else in the UI is
 * an opacity or mix of these. The ONLY exception is the alert scale, because
 * safety states must be unmistakable and the base palette has no warm colours.
 * Alert colours are for alerts and conflict highlighting only, and must always
 * be paired with an icon or text label.
 *
 * `tokens.css` mirrors these values as CSS variables; `palette.test.ts` fails
 * if the two drift apart or if any other hex colour appears in the source.
 */

export const palette = {
  ink: "#071B2B",
  teal: "#167D8D",
  aqua: "#B9E4E8",
  paper: "#EEEEEE",
  white: "#FFFFFF",
} as const;

export const alertColors = {
  advisory: "#167D8D",
  caution: "#D97706",
  warning: "#DC2626",
} as const;

export type PaletteName = keyof typeof palette;
export type AlertLevel = keyof typeof alertColors;

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m || m[1] === undefined) throw new Error(`expected #RRGGBB, got ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** CSS rgba() string for a palette colour at the given opacity. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Composite `fg` at opacity `a` over an opaque `bg`. Returns the resulting opaque colour. */
export function over(fg: string, a: number, bg: string): RGB {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  return [0, 1, 2].map((i) => f[i]! * a + b[i]! * (1 - a)) as unknown as RGB;
}

/** Layer several translucent palette colours over an opaque base, in order. */
export function mix(base: string, layers: ReadonlyArray<readonly [string, number]>): string {
  let acc = base;
  for (const [hex, a] of layers) acc = rgbToHex(over(hex, a, acc));
  return acc;
}

/**
 * Derived tints. Text opacities were chosen so they pass WCAG AA (4.5:1) on
 * paper, white AND aqua; see contrast.test.ts. Note ink at 60% does NOT pass
 * on paper, which is why secondary text is 72%.
 */
export const tint = {
  textPrimary: palette.ink,
  textSecondary: alpha(palette.ink, 0.72),
  border: alpha(palette.ink, 0.12),
  borderStrong: alpha(palette.ink, 0.24),
  tealSubtle: alpha(palette.teal, 0.1),
  // Radar ground layers
  taxiwayOutline: alpha(palette.ink, 0.34),
  taxiwayCenterline: alpha(palette.ink, 0.22),
  apronFill: palette.paper,
  apronOutline: alpha(palette.ink, 0.12),
  runwayFill: mix(palette.paper, [
    [palette.teal, 0.2],
    [palette.ink, 0.06],
  ]),
  runwayEdge: alpha(palette.ink, 0.4),
  runwayMarking: palette.white,
  holdShort: palette.ink,
  label: palette.ink,
  labelSecondary: alpha(palette.ink, 0.72),
  fix: palette.ink,
  separationRingFill: alpha(palette.aqua, 0.28),
  separationRingStroke: palette.teal,
  trajectoryLine: palette.teal,
  aircraftSelectedFill: palette.teal,
  aircraftFill: palette.ink,
  dataBlockBg: alpha(palette.white, 0.92),
  alertCautionFill: alpha(alertColors.caution, 0.18),
  alertWarningFill: alpha(alertColors.warning, 0.2),
} as const;

/** Text-on-background pairs the UI actually uses. All must pass WCAG AA (4.5:1). */
export const TEXT_PAIRS: ReadonlyArray<{ name: string; fg: string; fgAlpha?: number; bg: string }> = [
  { name: "ink on paper", fg: palette.ink, bg: palette.paper },
  { name: "ink on white", fg: palette.ink, bg: palette.white },
  { name: "ink on aqua", fg: palette.ink, bg: palette.aqua },
  { name: "white on teal", fg: palette.white, bg: palette.teal },
  { name: "white on ink (safety banner)", fg: palette.white, bg: palette.ink },
  { name: "teal on white (links, active tab on cards)", fg: palette.teal, bg: palette.white },
  { name: "secondary text on paper", fg: palette.ink, fgAlpha: 0.72, bg: palette.paper },
  { name: "secondary text on white", fg: palette.ink, fgAlpha: 0.72, bg: palette.white },
  { name: "secondary text on aqua", fg: palette.ink, fgAlpha: 0.72, bg: palette.aqua },
  { name: "white on warning", fg: palette.white, bg: alertColors.warning },
  { name: "ink on caution", fg: palette.ink, bg: alertColors.caution },
];

/**
 * Non-text UI pairs (focus rings, icons, alert borders, selected-state strokes).
 * WCAG 1.4.11 requires 3:1. Teal on paper is ~4.2:1: fine for these, NOT for text.
 */
export const NON_TEXT_PAIRS: ReadonlyArray<{ name: string; fg: string; bg: string }> = [
  { name: "teal focus ring / selection on paper", fg: palette.teal, bg: palette.paper },
  { name: "teal on white", fg: palette.teal, bg: palette.white },
  { name: "caution icon on white", fg: alertColors.caution, bg: palette.white },
  { name: "caution fill with ink border/icon", fg: palette.ink, bg: alertColors.caution },
  { name: "warning icon on paper", fg: alertColors.warning, bg: palette.paper },
  { name: "ink aircraft on runway fill", fg: palette.ink, bg: tint.runwayFill },
  { name: "teal selected aircraft on white", fg: palette.teal, bg: palette.white },
];
