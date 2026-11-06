/**
 * Draws the airport layout and live simulation layers onto a 2D canvas context.
 *
 * Layer order (bottom to top):
 * 1. Ground (white)
 * 2. Aprons
 * 3. Taxiways (thin ink-tinted outlines + centerlines)
 * 4. Runways (slightly darker grey-teal tint + markings)
 * 5. Hold-short lines
 * 6. Gates
 * 7. Taxiway & Runway labels
 * 8. Arrival / Departure fixes
 * 9. Separation rings (aqua fill at low opacity with teal stroke)
 * 10. Predicted trajectory lines (teal dashed)
 * 11. Alert / conflict highlighting (caution/warning rings + connecting line + badge)
 * 12. Aircraft icons with heading (ink default, teal when selected)
 * 13. Speed / altitude data blocks
 * 14. Scale bar & north arrow
 *
 * Every colour comes from `tint` / `palette` / `alertColors`; enforced by tests.
 */
import type { AircraftState, Airport, Point, Runway, SimAlert } from "../api/types";
import { alertColors, palette, tint } from "../theme/palette";
import { getTileImage, lonLatToTile, tileToLonLat } from "./mapTiles";
import * as vp from "./viewport";

export interface LayerToggles {
  mapBackground: boolean;
  mapStyle?: "satellite" | "streets";
  taxiwayLabels: boolean;
  holdShorts: boolean;
  gates: boolean;
  fixes: boolean;
  aircraft: boolean;
  dataBlocks: boolean;
  trajectories: boolean;
  separationRings: boolean;
  alerts: boolean;
}

export const DEFAULT_LAYERS: LayerToggles = {
  mapBackground: true,
  mapStyle: "satellite",
  taxiwayLabels: true,
  holdShorts: true,
  gates: true,
  fixes: true,
  aircraft: true,
  dataBlocks: true,
  trajectories: true,
  separationRings: true,
  alerts: true,
};

export interface SceneOverlays {
  aircraft?: AircraftState[];
  selectedCallsign?: string | null;
  alerts?: SimAlert[];
}

export const CANVAS_FONT = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';

type Ctx = CanvasRenderingContext2D;

const font = (size: number, weight = 500) => `${weight} ${size}px ${CANVAS_FONT}`;

function polyline(ctx: Ctx, pts: Point[], v: vp.View, s: vp.Size): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = vp.worldToScreen(p, v, s);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function polylineMidpoint(pts: Point[]): { at: Point; angle: number } {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot(pts[i + 1]![0] - pts[i]![0], pts[i + 1]![1] - pts[i]![1]);
  }
  let remaining = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= seg || i === pts.length - 2) {
      const t = seg === 0 ? 0 : remaining / seg;
      return {
        at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        angle: Math.atan2(b[1] - a[1], b[0] - a[0]),
      };
    }
    remaining -= seg;
  }
  return { at: pts[0]!, angle: 0 };
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tag(ctx: Ctx, text: string, x: number, y: number): void {
  ctx.font = font(10.5, 600);
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const h = 16;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 4);
  ctx.fillStyle = palette.white;
  ctx.fill();
  ctx.strokeStyle = tint.borderStrong;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = tint.label;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
}

function drawRunway(ctx: Ctx, r: Runway, v: vp.View, s: vp.Size): void {
  const widthPx = r.width_m * v.scale;
  if (widthPx >= 2.5) {
    polyline(ctx, r.polygon, v, s);
    ctx.closePath();
    ctx.fillStyle = tint.runwayFill;
    ctx.fill();
    ctx.strokeStyle = tint.runwayEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    polyline(ctx, r.centerline, v, s);
    ctx.strokeStyle = tint.runwayEdge;
    ctx.lineWidth = 3;
    ctx.lineCap = "butt";
    ctx.stroke();
  }

  if (widthPx >= 9) {
    ctx.save();
    polyline(ctx, r.centerline, v, s);
    ctx.setLineDash([30 * v.scale, 20 * v.scale]);
    ctx.strokeStyle = tint.runwayMarking;
    ctx.lineWidth = Math.max(1, 0.9 * v.scale);
    ctx.stroke();
    ctx.restore();

    const [a, b] = r.centerline;
    const len = r.length_m;
    const d: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n: Point = [-d[1], d[0]];
    const half = r.width_m / 2 - 3;
    ctx.strokeStyle = tint.runwayMarking;
    ctx.lineWidth = Math.max(1, 1.8 * v.scale);
    for (const [end, dir] of [
      [a, 1],
      [b, -1],
    ] as const) {
      const base: Point = [end[0] + d[0] * 6 * dir, end[1] + d[1] * 6 * dir];
      polyline(
        ctx,
        [
          [base[0] + n[0] * half, base[1] + n[1] * half],
          [base[0] - n[0] * half, base[1] - n[1] * half],
        ],
        v,
        s,
      );
      ctx.stroke();
    }
  }
}

function drawRunwayLabels(ctx: Ctx, r: Runway, v: vp.View, s: vp.Size): void {
  ctx.font = font(12, 650);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const [end, other] of [
    [r.ends[0], r.ends[1]],
    [r.ends[1], r.ends[0]],
  ] as const) {
    const p = vp.worldToScreen(end.threshold, v, s);
    const q = vp.worldToScreen(other.threshold, v, s);
    const len = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    const x = p[0] + ((p[0] - q[0]) / len) * 16;
    const y = p[1] + ((p[1] - q[1]) / len) * 16;
    ctx.fillStyle = palette.white;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint.label;
    ctx.fillText(end.designator, x, y + 0.5);
  }
}

function drawHoldShort(
  ctx: Ctx,
  line: [Point, Point],
  runway: Runway | undefined,
  v: vp.View,
  s: vp.Size,
): void {
  const p1 = vp.worldToScreen(line[0], v, s);
  const p2 = vp.worldToScreen(line[1], v, s);
  ctx.strokeStyle = tint.holdShort;
  if (v.scale < 0.2 || !runway) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...p1);
    ctx.lineTo(...p2);
    ctx.stroke();
    return;
  }
  const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const ra = vp.worldToScreen(runway.centerline[0], v, s);
  const rb = vp.worldToScreen(runway.centerline[1], v, s);
  const ab: Point = [rb[0] - ra[0], rb[1] - ra[1]];
  const t = ((mid[0] - ra[0]) * ab[0] + (mid[1] - ra[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2);
  const foot: Point = [ra[0] + ab[0] * t, ra[1] + ab[1] * t];
  const toRwyLen = Math.hypot(foot[0] - mid[0], foot[1] - mid[1]) || 1;
  const toRwy: Point = [(foot[0] - mid[0]) / toRwyLen, (foot[1] - mid[1]) / toRwyLen];
  const gap = Math.max(1.6, 0.6 * v.scale);
  const offsets: Array<[number, boolean]> = [
    [-1.5 * gap, false],
    [-0.5 * gap, false],
    [0.5 * gap, true],
    [1.5 * gap, true],
  ];
  ctx.lineWidth = Math.max(1, 0.3 * v.scale);
  for (const [off, dashed] of offsets) {
    ctx.setLineDash(dashed ? [Math.max(2, 1 * v.scale), Math.max(2, 1 * v.scale)] : []);
    ctx.beginPath();
    ctx.moveTo(p1[0] + toRwy[0] * off, p1[1] + toRwy[1] * off);
    ctx.lineTo(p2[0] + toRwy[0] * off, p2[1] + toRwy[1] * off);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawFixes(ctx: Ctx, airport: Airport, v: vp.View, s: vp.Size): void {
  const inset = 22;
  const cx = s.width / 2;
  const cy = s.height / 2;
  for (const f of airport.fixes) {
    const [x, y] = vp.worldToScreen(f.position, v, s);
    const inside = x >= inset && x <= s.width - inset && y >= inset && y <= s.height - inset;
    const dist = vp.formatDistance(Math.hypot(f.position[0], f.position[1]));
    if (inside) {
      const r = 6;
      ctx.beginPath();
      if (f.role === "arrival") {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
        ctx.fillStyle = tint.fix;
        ctx.fill();
      } else {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r * 0.8);
        ctx.lineTo(x - r, y + r * 0.8);
        ctx.closePath();
        ctx.fillStyle = palette.white;
        ctx.fill();
        ctx.strokeStyle = tint.fix;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = font(11.5, 650);
      ctx.fillStyle = tint.label;
      ctx.fillText(f.name, x + 10, y - 5);
      ctx.font = font(10.5, 500);
      ctx.fillStyle = tint.labelSecondary;
      const alt = f.altitude_ft != null ? ` · ${f.altitude_ft.toLocaleString("en-US")} ft` : "";
      ctx.fillText(`${f.role === "arrival" ? "ARR" : "DEP"}${alt}`, x + 10, y + 8);
    } else {
      const dx = x - cx;
      const dy = y - cy;
      const k = Math.min(
        dx !== 0 ? (s.width / 2 - inset) / Math.abs(dx) : Infinity,
        dy !== 0 ? (s.height / 2 - inset) / Math.abs(dy) : Infinity,
      );
      const ex = cx + dx * k;
      const ey = cy + dy * k;
      const ang = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fillStyle = f.role === "arrival" ? tint.fix : palette.white;
      ctx.fill();
      ctx.strokeStyle = tint.fix;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
      const label = `${f.name} ${dist}`;
      ctx.font = font(10.5, 600);
      const tw = ctx.measureText(label).width;
      const lx = Math.min(Math.max(ex - Math.cos(ang) * 14 - tw / 2, 6), s.width - tw - 6);
      const ly = Math.min(Math.max(ey - Math.sin(ang) * 14, 10), s.height - 10);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = tint.labelSecondary;
      ctx.fillText(label, lx, ly);
    }
  }
}

function drawSeparationRings(ctx: Ctx, aircraft: AircraftState[], v: vp.View, s: vp.Size): void {
  for (const ac of aircraft) {
    const [x, y] = vp.worldToScreen(ac.position, v, s);
    const rPx = Math.max(14, ac.separation_ring_m * v.scale);
    ctx.beginPath();
    ctx.arc(x, y, rPx, 0, Math.PI * 2);
    ctx.fillStyle = tint.separationRingFill;
    ctx.fill();
    ctx.strokeStyle = tint.separationRingStroke;
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
}

function drawTrajectories(ctx: Ctx, aircraft: AircraftState[], v: vp.View, s: vp.Size): void {
  ctx.save();
  ctx.strokeStyle = tint.trajectoryLine;
  ctx.lineWidth = 1.75;
  ctx.setLineDash([6, 4]);
  for (const ac of aircraft) {
    if (ac.predicted_trajectory.length < 2) continue;
    polyline(ctx, ac.predicted_trajectory, v, s);
    ctx.stroke();
    const last = ac.predicted_trajectory[ac.predicted_trajectory.length - 1]!;
    const [lx, ly] = vp.worldToScreen(last, v, s);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = tint.trajectoryLine;
    ctx.fill();
    ctx.setLineDash([6, 4]);
  }
  ctx.restore();
}

function drawAlertHighlights(ctx: Ctx, aircraft: AircraftState[], v: vp.View, s: vp.Size): void {
  for (const ac of aircraft) {
    if (!ac.alert_severity) continue;
    const [x, y] = vp.worldToScreen(ac.position, v, s);
    const rPx = Math.max(20, ac.separation_ring_m * v.scale + 6);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rPx, 0, Math.PI * 2);
    ctx.fillStyle =
      ac.alert_severity === "warning" ? tint.alertWarningFill : tint.alertCautionFill;
    ctx.fill();
    ctx.strokeStyle =
      ac.alert_severity === "warning"
        ? alertColors.warning
        : ac.alert_severity === "caution"
          ? alertColors.caution
          : alertColors.advisory;
    ctx.lineWidth = 2.25;
    ctx.stroke();
    ctx.restore();
  }
}

function drawAircraftIcons(
  ctx: Ctx,
  aircraft: AircraftState[],
  selectedCallsign: string | null,
  v: vp.View,
  s: vp.Size,
): void {
  for (const ac of aircraft) {
    const [x, y] = vp.worldToScreen(ac.position, v, s);
    const isSelected = ac.callsign === selectedCallsign;
    const rad = (ac.heading_deg * Math.PI) / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);

    // Swept-wing aircraft symbol pointing up (north = 0 deg before rotation)
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(2.4, -4);
    ctx.lineTo(10, 1);
    ctx.lineTo(10, 3.2);
    ctx.lineTo(2.2, 1.5);
    ctx.lineTo(1.8, 7.5);
    ctx.lineTo(5, 9.5);
    ctx.lineTo(5, 11);
    ctx.lineTo(0, 9.8);
    ctx.lineTo(-5, 11);
    ctx.lineTo(-5, 9.5);
    ctx.lineTo(-1.8, 7.5);
    ctx.lineTo(-2.2, 1.5);
    ctx.lineTo(-10, 3.2);
    ctx.lineTo(-10, 1);
    ctx.lineTo(-2.4, -4);
    ctx.closePath();

    ctx.fillStyle = isSelected ? tint.aircraftSelectedFill : tint.aircraftFill;
    ctx.fill();
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();
  }
}

function drawDataBlocks(
  ctx: Ctx,
  aircraft: AircraftState[],
  selectedCallsign: string | null,
  v: vp.View,
  s: vp.Size,
): void {
  for (const ac of aircraft) {
    const isSelected = ac.callsign === selectedCallsign;
    const hasAlert = ac.alert_severity != null;
    const [x, y] = vp.worldToScreen(ac.position, v, s);

    // Skip drawing off-canvas targets
    if (x < -100 || x > s.width + 100 || y < -100 || y > s.height + 100) continue;

    if (isSelected || hasAlert) {
      // Full prominent telemetry data block with leader line
      const bx = x + 16;
      const by = y - 28;
      const line1 = `${ac.callsign}`;
      const line2 = `${Math.round(ac.speed_kts)} kt · ${Math.round(ac.altitude_ft)} ft`;

      ctx.font = font(11, 700);
      const w1 = ctx.measureText(line1).width;
      ctx.font = font(10.5, 500);
      const w2 = ctx.measureText(line2).width;
      const w = Math.ceil(Math.max(w1, w2)) + 12;
      const h = 32;

      // Leader line
      ctx.strokeStyle = isSelected ? palette.teal : alertColors[ac.alert_severity ?? "caution"];
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(bx, by + h / 2);
      ctx.stroke();

      roundRect(ctx, bx, by, w, h, 6);
      ctx.fillStyle = isSelected ? palette.aqua : tint.dataBlockBg;
      ctx.fill();
      ctx.strokeStyle =
        ac.alert_severity === "warning"
          ? alertColors.warning
          : ac.alert_severity === "caution"
            ? alertColors.caution
            : isSelected
              ? palette.teal
              : tint.borderStrong;
      ctx.lineWidth = isSelected || hasAlert ? 1.75 : 1;
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = font(11, 700);
      ctx.fillStyle = palette.ink;
      ctx.fillText(line1, bx + 6, by + 4);
      ctx.font = font(10, 500);
      ctx.fillStyle = tint.labelSecondary;
      ctx.fillText(line2, bx + 6, by + 17);
    } else if (v.scale > 0.04) {
      // Clean, compact unselected callsign tag (avoids messy overlapping blocks)
      const tagText = ac.callsign;
      ctx.font = font(9.5, 600);
      const tw = ctx.measureText(tagText).width + 8;
      const th = 15;
      const tx = x + 10;
      const ty = y - 16;

      roundRect(ctx, tx, ty, tw, th, 3);
      ctx.fillStyle = palette.white;
      ctx.fill();
      ctx.strokeStyle = tint.borderStrong;
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = tint.label;
      ctx.fillText(tagText, tx + tw / 2, ty + th / 2);
    }
  }
}

function drawScaleBar(ctx: Ctx, v: vp.View, s: vp.Size): void {
  const { metres, px } = vp.niceScaleBar(v.scale);
  const x = 16;
  const y = s.height - 18;
  ctx.strokeStyle = tint.label;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x, y);
  ctx.lineTo(x + px, y);
  ctx.lineTo(x + px, y - 5);
  ctx.stroke();
  ctx.font = font(11, 600);
  ctx.fillStyle = tint.label;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(vp.formatDistance(metres), x + 4, y - 4);

  const nx = s.width - 22;
  const ny = 26;
  ctx.beginPath();
  ctx.moveTo(nx, ny - 10);
  ctx.lineTo(nx + 6, ny + 6);
  ctx.lineTo(nx, ny + 2);
  ctx.lineTo(nx - 6, ny + 6);
  ctx.closePath();
  ctx.fillStyle = tint.label;
  ctx.fill();
  ctx.font = font(10, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("N", nx, ny + 9);
}

function drawMapBackground(
  ctx: Ctx,
  airport: Airport,
  v: vp.View,
  s: vp.Size,
  mapStyle: "satellite" | "streets" = "satellite",
  onTileLoaded?: () => void,
): void {
  const mPerPx = 1 / v.scale;
  let zoom = Math.max(8, Math.min(16, Math.round(18 - Math.log2(Math.max(1, mPerPx * 1.8)))));

  const refLat = airport.reference.lat;
  const refLon = airport.reference.lon;

  const wb = vp.visibleWorldBounds(v, s);

  const mToDegLat = 1 / 111132;
  const mToDegLon = 1 / (111132 * Math.cos((refLat * Math.PI) / 180));

  const minLon = refLon + wb.min_x * mToDegLon;
  const maxLon = refLon + wb.max_x * mToDegLon;
  const minLat = refLat + wb.min_y * mToDegLat;
  const maxLat = refLat + wb.max_y * mToDegLat;

  let t1 = lonLatToTile(minLon, maxLat, zoom);
  let t2 = lonLatToTile(maxLon, minLat, zoom);
  let startX = Math.min(t1.x, t2.x);
  let endX = Math.max(t1.x, t2.x);
  let startY = Math.min(t1.y, t2.y);
  let endY = Math.max(t1.y, t2.y);

  // If the tile grid is too large for the viewport, step down zoom until under tile budget
  while ((endX - startX + 1) * (endY - startY + 1) > 64 && zoom > 6) {
    zoom -= 1;
    t1 = lonLatToTile(minLon, maxLat, zoom);
    t2 = lonLatToTile(maxLon, minLat, zoom);
    startX = Math.min(t1.x, t2.x);
    endX = Math.max(t1.x, t2.x);
    startY = Math.min(t1.y, t2.y);
    endY = Math.max(t1.y, t2.y);
  }

  for (let tx = startX; tx <= endX; tx++) {
    for (let ty = startY; ty <= endY; ty++) {
      const img = getTileImage({ x: tx, y: ty, z: zoom }, mapStyle, onTileLoaded);
      if (!img) continue;

      const cNw = tileToLonLat(tx, ty, zoom);
      const cSe = tileToLonLat(tx + 1, ty + 1, zoom);

      const xNw = (cNw.lon - refLon) / mToDegLon;
      const yNw = (cNw.lat - refLat) / mToDegLat;
      const xSe = (cSe.lon - refLon) / mToDegLon;
      const ySe = (cSe.lat - refLat) / mToDegLat;

      const pNw = vp.worldToScreen([xNw, yNw], v, s);
      const pSe = vp.worldToScreen([xSe, ySe], v, s);

      const dx = Math.floor(pNw[0]);
      const dy = Math.floor(pNw[1]);
      const dw = Math.ceil(pSe[0] - pNw[0]);
      const dh = Math.ceil(pSe[1] - pNw[1]);

      ctx.drawImage(img, dx, dy, dw, dh);
    }
  }
}

export function drawLayout(
  ctx: Ctx,
  airport: Airport,
  v: vp.View,
  s: vp.Size,
  layers: LayerToggles = DEFAULT_LAYERS,
  overlays: SceneOverlays = {},
  onTileLoaded?: () => void,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "butt";
  ctx.setLineDash([]);

  // Ground
  ctx.fillStyle = palette.white;
  ctx.fillRect(0, 0, s.width, s.height);

  if (layers.mapBackground && !airport.fictional) {
    drawMapBackground(ctx, airport, v, s, layers.mapStyle ?? "satellite", onTileLoaded);
  }

  // Aprons
  for (const a of airport.aprons) {
    polyline(ctx, a.polygon, v, s);
    ctx.closePath();
    ctx.fillStyle = tint.apronFill;
    ctx.fill();
    ctx.strokeStyle = tint.apronOutline;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Taxiways
  const twyPx = (w: number) => Math.max(2, w * v.scale);
  for (const t of airport.taxiways) {
    polyline(ctx, t.centerline, v, s);
    ctx.strokeStyle = tint.taxiwayOutline;
    ctx.lineWidth = twyPx(t.width_m) + 2;
    ctx.stroke();
  }
  for (const t of airport.taxiways) {
    if (twyPx(t.width_m) < 3) continue;
    polyline(ctx, t.centerline, v, s);
    ctx.strokeStyle = palette.white;
    ctx.lineWidth = twyPx(t.width_m);
    ctx.stroke();
  }
  if (v.scale > 0.15) {
    for (const t of airport.taxiways) {
      polyline(ctx, t.centerline, v, s);
      ctx.strokeStyle = tint.taxiwayCenterline;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Runways
  for (const r of airport.runways) drawRunway(ctx, r, v, s);

  // Hold-short lines
  if (layers.holdShorts) {
    const byId = new Map(airport.runways.map((r) => [r.id, r]));
    for (const h of airport.hold_shorts) drawHoldShort(ctx, h.line, byId.get(h.runway), v, s);
  }

  // Gates
  if (layers.gates && v.scale > 0.08) {
    for (const g of airport.gates) {
      const [x, y] = vp.worldToScreen(g.position, v, s);
      const back = ((g.heading_deg + 180) * Math.PI) / 180;
      const lead = Math.max(10, 50 * v.scale);
      ctx.strokeStyle = tint.taxiwayOutline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(back) * lead, y - Math.cos(back) * lead);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = palette.white;
      ctx.fill();
      ctx.strokeStyle = tint.label;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const fwd = (g.heading_deg * Math.PI) / 180;
      ctx.font = font(10.5, 600);
      ctx.fillStyle = tint.label;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(g.name, x + Math.sin(fwd) * 13, y - Math.cos(fwd) * 13);
    }
  }

  // Taxiway name tags
  if (layers.taxiwayLabels && v.scale > 0.12) {
    for (const t of airport.taxiways) {
      const { at } = polylineMidpoint(t.centerline);
      const [x, y] = vp.worldToScreen(at, v, s);
      tag(ctx, t.name, x, y);
    }
  }

  for (const r of airport.runways) drawRunwayLabels(ctx, r, v, s);

  if (layers.fixes) drawFixes(ctx, airport, v, s);

  const acList = overlays.aircraft ?? [];
  if (acList.length > 0) {
    if (layers.separationRings) drawSeparationRings(ctx, acList, v, s);
    if (layers.trajectories) drawTrajectories(ctx, acList, v, s);
    if (layers.alerts) drawAlertHighlights(ctx, acList, v, s);
    if (layers.aircraft) {
      drawAircraftIcons(ctx, acList, overlays.selectedCallsign ?? null, v, s);
    }
    if (layers.dataBlocks) {
      drawDataBlocks(ctx, acList, overlays.selectedCallsign ?? null, v, s);
    }
  }

  drawScaleBar(ctx, v, s);
  ctx.restore();
}
