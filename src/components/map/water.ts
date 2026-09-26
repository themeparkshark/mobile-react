/** Finding a spot on real water near a ride, for Easter eggs that float. */
type Ring = number[][];
type Poly = Ring[];

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPoly(x: number, y: number, poly: Poly): boolean {
  if (!poly.length || !inRing(x, y, poly[0])) return false;
  for (let h = 1; h < poly.length; h++) if (inRing(x, y, poly[h])) return false;
  return true;
}

function polygons(features: readonly GeoJSON.Feature[]): Poly[] {
  const out: Poly[] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') out.push(g.coordinates as Poly);
    else if (g?.type === 'MultiPolygon') for (const p of g.coordinates) out.push(p as Poly);
  }
  return out;
}

/**
 * Closest point within `maxMeters` of the ride that sits comfortably on water
 * (water still `margin` meters away on every side, so a ship isn't beached while a
 * hippo can still fit a narrow jungle river).
 */
export function nearestWaterPoint(features: readonly GeoJSON.Feature[], lat: number, lng: number, margin = 5, maxMeters = 170) {
  const polys = polygons(features);
  if (!polys.length) return null;
  const mLat = 1 / 111320;
  const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  const wet = (x: number, y: number) => polys.some(p => inPoly(x, y, p));
  const comfy = (x: number, y: number) => wet(x, y)
    && wet(x + margin * mLng, y) && wet(x - margin * mLng, y) && wet(x, y + margin * mLat) && wet(x, y - margin * mLat);
  for (let r = 12; r <= maxMeters; r += 8) {
    const steps = Math.max(8, Math.round((2 * Math.PI * r) / 10));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const x = lng + Math.cos(a) * r * mLng;
      const y = lat + Math.sin(a) * r * mLat;
      if (comfy(x, y)) return { latitude: y, longitude: x };
    }
  }
  return null;
}
