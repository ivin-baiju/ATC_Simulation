/**
 * Radar viewport: maps world metres (x east, y north) to CSS pixels (y down).
 * Pure functions so the maths is unit-tested independently of canvas.
 */
import type { Bounds, Point } from "../api/types";

export interface View {
  /** World point at the centre of the viewport, metres. */
  cx: number;
  cy: number;
  /** CSS pixels per metre. */
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.004; // ~250 m per px: whole terminal area
export const MAX_SCALE = 8; // 8 px per m: individual aircraft

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

export function fitBounds(b: Bounds, size: Size, margin = 0.06): View {
  const w = Math.max(1, b.max_x - b.min_x);
  const h = Math.max(1, b.max_y - b.min_y);
  const usableW = size.width * (1 - 2 * margin);
  const usableH = size.height * (1 - 2 * margin);
  return {
    cx: (b.min_x + b.max_x) / 2,
    cy: (b.min_y + b.max_y) / 2,
    scale: clampScale(Math.min(usableW / w, usableH / h)),
  };
}

export function worldToScreen(p: Point, v: View, size: Size): Point {
  return [size.width / 2 + (p[0] - v.cx) * v.scale, size.height / 2 - (p[1] - v.cy) * v.scale];
}

export function screenToWorld(s: Point, v: View, size: Size): Point {
  return [v.cx + (s[0] - size.width / 2) / v.scale, v.cy - (s[1] - size.height / 2) / v.scale];
}

/** Zoom by `factor`, keeping the world point under screen point `anchor` fixed. */
export function zoomAt(v: View, size: Size, anchor: Point, factor: number): View {
  const before = screenToWorld(anchor, v, size);
  const scale = clampScale(v.scale * factor);
  // Solve for the centre that puts `before` back under `anchor` at the new scale.
  return {
    scale,
    cx: before[0] - (anchor[0] - size.width / 2) / scale,
    cy: before[1] + (anchor[1] - size.height / 2) / scale,
  };
}

/** Pan by a screen-space delta in CSS pixels (drag right => world moves right). */
export function panBy(v: View, dxPx: number, dyPx: number): View {
  return { ...v, cx: v.cx - dxPx / v.scale, cy: v.cy + dyPx / v.scale };
}

export function visibleWorldBounds(v: View, size: Size): Bounds {
  const [x0, y1] = screenToWorld([0, 0], v, size);
  const [x1, y0] = screenToWorld([size.width, size.height], v, size);
  return { min_x: x0, min_y: y0, max_x: x1, max_y: y1 };
}

/** A "nice" scale-bar length (1, 2, 5 x 10^n metres) close to `targetPx` on screen. */
export function niceScaleBar(scale: number, targetPx = 120): { metres: number; px: number } {
  const raw = targetPx / scale;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).filter((m) => m <= raw);
  const metres = step.length ? step[step.length - 1]! : pow;
  return { metres, px: metres * scale };
}

export function formatDistance(m: number): string {
  return m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
