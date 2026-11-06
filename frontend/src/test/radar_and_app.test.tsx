import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App, SAFETY_NOTICE } from "../App";
import { FALLBACK_FRAMES, FALLBACK_GENFIELD } from "../fallbackAirport";
import { DEFAULT_LAYERS, drawLayout } from "../radar/drawLayout";
import * as vp from "../radar/viewport";
import { alertColors, palette, tint } from "../theme/palette";

describe("Viewport coordinate maths", () => {
  const size: vp.Size = { width: 1000, height: 800 };

  it("round-trips worldToScreen and screenToWorld", () => {
    const view = vp.fitBounds(FALLBACK_GENFIELD.bounds_surface, size);
    const pt: [number, number] = [420.5, -185.25];
    const screenPt = vp.worldToScreen(pt, view, size);
    const back = vp.screenToWorld(screenPt, view, size);
    expect(back[0]).toBeCloseTo(pt[0], 5);
    expect(back[1]).toBeCloseTo(pt[1], 5);
  });

  it("keeps the anchor world point fixed under zoomAt", () => {
    const view = vp.fitBounds(FALLBACK_GENFIELD.bounds_surface, size);
    const anchor: [number, number] = [310, 240];
    const before = vp.screenToWorld(anchor, view, size);
    const zoomed = vp.zoomAt(view, size, anchor, 1.8);
    const after = vp.screenToWorld(anchor, zoomed, size);
    expect(after[0]).toBeCloseTo(before[0], 5);
    expect(after[1]).toBeCloseTo(before[1], 5);
  });

  it("computes nice scale bar steps", () => {
    const bar = vp.niceScaleBar(0.2, 120);
    expect(bar.metres).toBe(500);
    expect(bar.px).toBeCloseTo(100, 5);
  });
});

function createMockCanvasContext() {
  const stylesUsed = new Set<string>();
  let fillStyle = "";
  let strokeStyle = "";

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    lineJoin: "round",
    lineCap: "butt",
    lineWidth: 1,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
      stylesUsed.add(v);
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(v: string) {
      strokeStyle = v;
      stylesUsed.add(v);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, stylesUsed };
}

describe("Radar layout & dynamic layers renderer + App panels", () => {
  it("draws the layout, aircraft, trajectories, separation rings, and alerts using only approved colours", () => {
    const { ctx, stylesUsed } = createMockCanvasContext();
    const size = { width: 900, height: 600 };
    const view = vp.fitBounds(FALLBACK_GENFIELD.bounds_surface, size);
    const sampleFrame = FALLBACK_FRAMES[6]!;
    drawLayout(ctx, FALLBACK_GENFIELD, view, size, DEFAULT_LAYERS, {
      aircraft: sampleFrame.aircraft,
      selectedCallsign: "EZY409",
      alerts: sampleFrame.alerts,
    });

    const allowedStyles = new Set<string>([
      ...Object.values(palette),
      ...Object.values(tint),
      ...Object.values(alertColors),
    ]);
    expect(stylesUsed.size).toBeGreaterThan(0);
    for (const style of stylesUsed) {
      expect(allowedStyles.has(style)).toBe(true);
    }
  });

  it("renders the persistent SIMULATION ONLY banner, panels, comparison view, and scenario builder", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => createMockCanvasContext().ctx,
    );
    render(<App />);
    expect(screen.getByText(SAFETY_NOTICE)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /ATC Surface & Terminal Simulator/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("09/27")).toBeInTheDocument();
    expect(screen.getByText("04/22")).toBeInTheDocument();
    expect(screen.getByText("Controller Decision Panel")).toBeInTheDocument();
    expect(screen.getByText("Live Safety Alerts")).toBeInTheDocument();
    expect(screen.getByText("Communication Log")).toBeInTheDocument();

    // Switch to Run Comparison tab
    fireEvent.click(screen.getByRole("tab", { name: /Run Comparison/i }));
    expect(screen.getByText(/Same-Seed Side-by-Side Comparison/i)).toBeInTheDocument();

    // Switch to Scenario Builder tab
    fireEvent.click(screen.getByRole("tab", { name: /Scenario Builder/i }));
    expect(screen.getByRole("button", { name: /Save as YAML/i })).toBeInTheDocument();
  });
});
