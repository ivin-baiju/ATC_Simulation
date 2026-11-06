import { useCallback, useEffect, useRef, useState } from "react";
import type { AircraftState, Airport, Point, SimAlert } from "../api/types";
import { drawLayout, type LayerToggles } from "./drawLayout";
import * as vp from "./viewport";

export interface RadarCanvasProps {
  airport: Airport;
  layers: LayerToggles;
  viewMode: "surface" | "terminal";
  resetCounter: number;
  aircraft?: AircraftState[];
  selectedCallsign?: string | null;
  onSelectAircraft?: (callsign: string | null) => void;
  alerts?: SimAlert[];
  placementMode?: boolean;
  onPlaceWorldPoint?: (pt: Point) => void;
}

export function RadarCanvas({
  airport,
  layers,
  viewMode,
  resetCounter,
  aircraft = [],
  selectedCallsign = null,
  onSelectAircraft,
  alerts = [],
  placementMode = false,
  onPlaceWorldPoint,
}: RadarCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<vp.Size>({ width: 900, height: 540 });
  const [view, setView] = useState<vp.View>(() =>
    vp.fitBounds(
      viewMode === "surface" ? airport.bounds_surface : airport.bounds_all,
      { width: 900, height: 540 },
    ),
  );
  const [cursorWorld, setCursorWorld] = useState<Point | null>(null);

  // Drag state stored in ref for zero-latency 60fps tracking
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });

  const renderRafRef = useRef<number | null>(null);
  const tileRafRef = useRef<number | null>(null);

  // Resize observer to track container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const nextW = Math.round(rect.width);
        const nextH = Math.round(rect.height);
        setSize((prev) => (prev.width === nextW && prev.height === nextH ? prev : { width: nextW, height: nextH }));
      }
    };
    updateSize();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateSize);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, []);

  // Update canvas internal buffer dimensions ONLY when size changes, NOT on pan/zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetW = Math.max(1, Math.floor(size.width * dpr));
    const targetH = Math.max(1, Math.floor(size.height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }, [size]);

  // Recenter when airport or view mode changes
  useEffect(() => {
    const b = viewMode === "surface" ? airport.bounds_surface : airport.bounds_all;
    setView(vp.fitBounds(b, size));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airport.id, viewMode, resetCounter]);

  // Unified redraw function
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    ctx.save();
    ctx.scale(dpr, dpr);

    drawLayout(
      ctx,
      airport,
      view,
      size,
      layers,
      {
        aircraft,
        selectedCallsign,
        alerts,
      },
      () => {
        // Debounce tile load callbacks via requestAnimationFrame
        if (tileRafRef.current === null) {
          tileRafRef.current = requestAnimationFrame(() => {
            tileRafRef.current = null;
            renderCanvas();
          });
        }
      },
    );

    ctx.restore();
  }, [airport, view, size, layers, aircraft, selectedCallsign, alerts]);

  // Render when state changes using rAF
  useEffect(() => {
    if (renderRafRef.current !== null) {
      cancelAnimationFrame(renderRafRef.current);
    }
    renderRafRef.current = requestAnimationFrame(() => {
      renderCanvas();
    });
    return () => {
      if (renderRafRef.current !== null) cancelAnimationFrame(renderRafRef.current);
      if (tileRafRef.current !== null) cancelAnimationFrame(tileRafRef.current);
    };
  }, [renderCanvas]);

  // Smooth wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor: Point = [e.clientX - rect.left, e.clientY - rect.top];
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => vp.zoomAt(v, size, anchor, factor));
  };

  // Pointer-based smooth dragging with pointer capture for buttery smooth interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture not supported
    }
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      const totalDist = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY);
      if (totalDist > 4) {
        dragRef.current.moved = true;
      }
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      if (dx !== 0 || dy !== 0) {
        setView((v) => vp.panBy(v, dx, dy));
      }
    } else {
      // Only compute and update cursor readout when hovering freely, to keep dragging at 60fps
      setCursorWorld(vp.screenToWorld([sx, sy], view, size));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;

    if (wasMoved) return;

    // Normal click selection
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldPt = vp.screenToWorld([sx, sy], view, size);

    if (placementMode && onPlaceWorldPoint) {
      onPlaceWorldPoint([Math.round(worldPt[0]), Math.round(worldPt[1])]);
      return;
    }

    if (onSelectAircraft) {
      let best: { callsign: string; distPx: number } | null = null;
      for (const ac of aircraft) {
        const [ax, ay] = vp.worldToScreen(ac.position, view, size);
        const d = Math.hypot(ax - sx, ay - sy);
        if (d <= 26 && (!best || d < best.distPx)) {
          best = { callsign: ac.callsign, distPx: d };
        }
      }
      onSelectAircraft(best ? best.callsign : null);
    }
  };

  const handlePointerCancel = () => {
    dragRef.current.active = false;
  };

  const zoomCenter = (factor: number) => {
    setView((v) => vp.zoomAt(v, size, [size.width / 2, size.height / 2], factor));
  };

  return (
    <div className="radar-stage" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="radar-canvas"
        style={{
          cursor: placementMode
            ? "crosshair"
            : dragRef.current.active
            ? "grabbing"
            : "grab",
          touchAction: "none",
        }}
        aria-label={`Airport surface radar for ${airport.name} (${airport.icao})`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => {
          if (!dragRef.current.active) {
            setCursorWorld(null);
          }
        }}
      />
      <div className="radar-hud-controls" role="toolbar" aria-label="Viewport zoom controls">
        <button
          type="button"
          className="btn-icon"
          onClick={() => zoomCenter(1.25)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="btn-icon"
          onClick={() => zoomCenter(1 / 1.25)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
      </div>
      <div className="radar-readout" aria-live="off">
        <span>
          Scale <strong>{(1 / view.scale).toFixed(1)} m/px</strong>
        </span>
        {cursorWorld ? (
          <span>
            ENU{" "}
            <strong>
              {Math.round(cursorWorld[0])} m E, {Math.round(cursorWorld[1])} m N
            </strong>
          </span>
        ) : (
          <span>
            {placementMode
              ? "Click on radar to place aircraft spawn"
              : "Click aircraft to inspect · Drag to pan · Scroll to zoom"}
          </span>
        )}
      </div>
    </div>
  );
}
