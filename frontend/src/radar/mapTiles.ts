/**
 * Real-world map tile loader.
 * Supports:
 * - "satellite": Esri World Imagery (high-resolution Google Earth-like satellite imagery, free & NO API KEY required)
 * - "streets": OpenStreetMap standard
 */

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

const tileCache = new Map<string, HTMLImageElement>();

export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const rad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

export function tileToLonLat(x: number, y: number, zoom: number): { lon: number; lat: number } {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lon, lat };
}

export function getTileImage(
  coord: TileCoord,
  style: "satellite" | "streets" = "satellite",
  onLoaded?: () => void,
): HTMLImageElement | null {
  const key = `${style}/${coord.z}/${coord.x}/${coord.y}`;
  const existing = tileCache.get(key);
  if (existing) {
    return existing.complete && existing.naturalWidth > 0 ? existing : null;
  }

  let url: string;
  if (style === "satellite") {
    // Esri World Imagery: Real aerial/satellite earth photos, public & NO API KEY required
    url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${coord.z}/${coord.y}/${coord.x}`;
  } else {
    // OpenStreetMap public tile server
    url = `https://tile.openstreetmap.org/${coord.z}/${coord.x}/${coord.y}.png`;
  }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  img.onload = () => {
    if (onLoaded) onLoaded();
  };
  tileCache.set(key, img);
  return null;
}
