/**
 * Plants illustrated trees, bushes, grass tufts and water ripples as crisp map
 * icons instead of a stretched texture. Points come from a world-anchored grid
 * with hashed jitter, so the same spot always grows the same tree no matter how
 * often the view is rebuilt; only cells inside the matching rendered polygons
 * (woods, lawns, water) get a decoration.
 */
type Ring = number[][];
type Poly = Ring[];
interface Area { readonly poly: Poly; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

export interface DecoInput {
  readonly wood: readonly GeoJSON.Feature[];
  readonly green: readonly GeoJSON.Feature[];
  readonly water: readonly GeoJSON.Feature[];
  /** Neighborhoods: yard trees are planted here, clear of houses and streets. */
  readonly homes?: readonly GeoJSON.Feature[];
  readonly buildings?: readonly GeoJSON.Feature[];
  readonly roads?: readonly GeoJSON.Feature[];
}

export interface Bounds { readonly north: number; readonly south: number; readonly east: number; readonly west: number }

const ROUND = ['tree-round-a', 'tree-round-b', 'tree-round-c', 'tree-round-d', 'tree-round-e'];
const PALM = ['tree-palm-a', 'tree-palm-b', 'tree-palm-c'];

export const DECO_ICONS = {
  'tree-round-a': require('../../../assets/images/map/deco/tree-round-a.png'),
  'tree-round-b': require('../../../assets/images/map/deco/tree-round-b.png'),
  'tree-round-c': require('../../../assets/images/map/deco/tree-round-c.png'),
  'tree-round-d': require('../../../assets/images/map/deco/tree-round-d.png'),
  'tree-round-e': require('../../../assets/images/map/deco/tree-round-e.png'),
  'tree-palm-a': require('../../../assets/images/map/deco/tree-palm-a.png'),
  'tree-palm-b': require('../../../assets/images/map/deco/tree-palm-b.png'),
  'tree-palm-c': require('../../../assets/images/map/deco/tree-palm-c.png'),
  'tree-pine': require('../../../assets/images/map/deco/tree-pine.png'),
  'deco-ripple': require('../../../assets/images/map/deco/ripple.png'),
  'deco-tuft': require('../../../assets/images/map/deco/tuft.png'),
};

function hash(i: number, j: number, salt: number): number {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function toAreas(features: readonly GeoJSON.Feature[]): Area[] {
  const out: Area[] = [];
  const add = (poly: Poly) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const [x, y] of poly[0] ?? []) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x0 <= x1) out.push({ poly, x0, y0, x1, y1 });
  };
  for (const f of features) {
    const g = f.geometry;
    if (g?.type === 'Polygon') add(g.coordinates as Poly);
    else if (g?.type === 'MultiPolygon') for (const p of g.coordinates) add(p as Poly);
  }
  return out;
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inAreas(x: number, y: number, areas: readonly Area[]): boolean {
  for (const a of areas) {
    if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) continue;
    if (!inRing(x, y, a.poly[0])) continue;
    let hole = false;
    for (let h = 1; h < a.poly.length && !hole; h++) hole = inRing(x, y, a.poly[h]);
    if (!hole) return true;
  }
  return false;
}

type Layer = { spacing: number; salt: number; keep: number; areas: Area[]; pick: (r: number) => { icon: string; s: number };
  clear?: (x: number, y: number) => boolean };

type Segment = [number, number, number, number];

function segments(features: readonly GeoJSON.Feature[]): Segment[] {
  const out: Segment[] = [];
  const add = (line: number[][]) => {
    for (let i = 1; i < line.length; i++) out.push([line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]]);
  };
  for (const f of features) {
    const g = f.geometry;
    if (g?.type === 'LineString') add(g.coordinates as number[][]);
    else if (g?.type === 'MultiLineString') for (const l of g.coordinates) add(l as number[][]);
  }
  return out;
}

/** Distance from a point to the nearest segment, in the same (scaled) units. */
function nearSegment(x: number, y: number, segs: readonly Segment[], kx: number, limit: number): boolean {
  for (const [x1, y1, x2, y2] of segs) {
    const ax = (x - x1) * kx; const ay = y - y1;
    const bx = (x2 - x1) * kx; const by = y2 - y1;
    const len = bx * bx + by * by;
    const t = len ? Math.max(0, Math.min(1, (ax * bx + ay * by) / len)) : 0;
    const dx = ax - t * bx; const dy = ay - t * by;
    if (dx * dx + dy * dy < limit * limit) return true;
  }
  return false;
}

/** Tree spacing tightens as you zoom in so woods always read as a full canopy. */
export function treeSpacing(zoom: number): number | null {
  if (zoom < 15.3) return null;
  return zoom >= 18 ? 4.5 : zoom >= 17 ? 6 : zoom >= 16 ? 11 : 19;
}

export function decorationBand(zoom: number): string {
  return `${treeSpacing(zoom) ?? 0}|${zoom >= 16.5 ? 1 : 0}|${zoom >= 17 ? 1 : 0}`;
}

export function buildDecorations(input: DecoInput, b: Bounds, zoom: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const spacing = treeSpacing(zoom);
  if (spacing === null) return { type: 'FeatureCollection', features };
  const lat = (b.north + b.south) / 2;
  const mLat = 1 / 111320;
  const mLng = 1 / (111320 * Math.cos((lat * Math.PI) / 180));
  const green = toAreas(input.green);
  const layers: Layer[] = [
    { spacing, salt: 1, keep: 1, areas: toAreas(input.wood), pick: r => ({
      icon: r < 0.76 ? ROUND[Math.floor((r / 0.76) * ROUND.length)] : r < 0.93 ? PALM[Math.floor(((r - 0.76) / 0.17) * PALM.length)] : 'tree-pine',
      s: 0.85 + ((r * 7919) % 1) * 0.3,
    }) },
  ];
  if (zoom >= 16.5) {
    // A few bushes dotted over lawns and parks, like a hand-drawn park map.
    layers.push({ spacing: 12, salt: 2, keep: 0.12, areas: green, pick: r => ({ icon: ROUND[Math.floor(r * ROUND.length)], s: 0.5 }) });
    layers.push({ spacing: 26, salt: 4, keep: 0.4, areas: toAreas(input.water), pick: () => ({ icon: 'deco-ripple', s: 1.6 }) });
  }
  if (zoom >= 17) {
    layers.push({ spacing: 7, salt: 3, keep: 0.16, areas: green, pick: () => ({ icon: 'deco-tuft', s: 1.3 }) });
  }
  if (zoom >= 16.3 && input.homes?.length) {
    // Yard trees: a leafy neighborhood, never on a roof or in the street.
    const houses = toAreas(input.buildings ?? []);
    const roads = segments(input.roads ?? []);
    const kx = Math.cos((lat * Math.PI) / 180);
    const clearance = 5 * mLat; // ~5 m from any road centerline edge
    layers.push({ spacing: 11, salt: 5, keep: 0.42, areas: toAreas(input.homes),
      pick: r => ({ icon: r < 0.85 ? ROUND[Math.floor((r / 0.85) * ROUND.length)] : PALM[Math.floor(((r - 0.85) / 0.15) * PALM.length)], s: 0.62 }),
      clear: (x, y) => !inAreas(x, y, houses) && !nearSegment(x, y, roads, kx, clearance + 4 * mLat) });
  }
  for (const layer of layers) {
    if (!layer.areas.length) continue;
    const dLat = layer.spacing * mLat;
    const dLng = layer.spacing * mLng;
    const i0 = Math.floor(b.west / dLng); const i1 = Math.ceil(b.east / dLng);
    const j0 = Math.floor(b.south / dLat); const j1 = Math.ceil(b.north / dLat);
    if ((i1 - i0) * (j1 - j0) > 12000) continue;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        if (layer.keep < 1 && hash(i, j, layer.salt + 10) > layer.keep) continue;
        const x = (i + 0.15 + hash(i, j, layer.salt) * 0.7) * dLng;
        const y = (j + 0.15 + hash(j, i, layer.salt) * 0.7) * dLat;
        if (!inAreas(x, y, layer.areas)) continue;
        if (layer.clear && !layer.clear(x, y)) continue;
        const { icon, s } = layer.pick(hash(i, j, layer.salt + 20));
        // Southern items draw last so trees overlap like a front-lit illustration.
        features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { icon, s, k: -y } });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Where the sun glints on water: a few world-anchored points inside the water
 * polygons on screen, nearest the middle of the view first, so the glints sit
 * where the player is looking and never on land. Deterministic per spot.
 */
export function buildWaterGlints(water: readonly GeoJSON.Feature[], b: Bounds, zoom: number, cap: number): { latitude: number; longitude: number; seed: number }[] {
  if (cap <= 0 || zoom < 16 || !water.length) return [];
  const areas = toAreas(water);
  if (!areas.length) return [];
  const lat = (b.north + b.south) / 2;
  const lng = (b.east + b.west) / 2;
  const spacing = zoom >= 18 ? 14 : zoom >= 17 ? 22 : 34; // metres between candidate spots
  const dLat = spacing / 111320;
  const dLng = spacing / (111320 * Math.cos((lat * Math.PI) / 180));
  const i0 = Math.floor(b.west / dLng); const i1 = Math.ceil(b.east / dLng);
  const j0 = Math.floor(b.south / dLat); const j1 = Math.ceil(b.north / dLat);
  if ((i1 - i0) * (j1 - j0) > 6000) return [];
  const found: { latitude: number; longitude: number; seed: number; d: number }[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (hash(i, j, 61) > 0.5) continue;
      const x = (i + 0.2 + hash(i, j, 62) * 0.6) * dLng;
      const y = (j + 0.2 + hash(j, i, 63) * 0.6) * dLat;
      if (!inAreas(x, y, areas)) continue;
      const dx = (x - lng) / dLng; const dy = (y - lat) / dLat;
      found.push({ latitude: y, longitude: x, seed: Math.floor(hash(i, j, 64) * 1000), d: dx * dx + dy * dy });
    }
  }
  return found.sort((a, c) => a.d - c.d).slice(0, cap).map(({ latitude, longitude, seed }) => ({ latitude, longitude, seed }));
}

/**
 * Lamp posts for the night map: points every ~28 m along the walkways and
 * roads on screen (a world-anchored grid keeps one lamp per cell, so lamps
 * never bunch where lines meet and stay put as the view is rebuilt).
 */
export function buildLampPoints(roads: readonly GeoJSON.Feature[], b: Bounds, zoom: number, cap = 120): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  if (zoom < 16 || !roads.length || cap <= 0) return { type: 'FeatureCollection', features };
  const lat = (b.north + b.south) / 2;
  const mLat = 1 / 111320;
  const kx = Math.cos((lat * Math.PI) / 180);
  const step = 28 * mLat; // in latitude-degree units (x scaled by kx)
  const cell = 20 * mLat;
  const taken = new Set<string>();
  for (const [x1, y1, x2, y2] of segments(roads)) {
    const dx = (x2 - x1) * kx; const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (!len) continue;
    // Anchor stops to a world grid along the segment so rebuilding never shuffles lamps.
    for (let d = (step - (((Math.abs(x1 * kx) + Math.abs(y1)) / step) % 1) * step) % step; d <= len; d += step) {
      const x = x1 + ((x2 - x1) * d) / len;
      const y = y1 + ((y2 - y1) * d) / len;
      if (x < b.west || x > b.east || y < b.south || y > b.north) continue;
      const key = `${Math.floor((x * kx) / cell)}:${Math.floor(y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: {} });
      if (features.length >= cap) return { type: 'FeatureCollection', features };
    }
  }
  return { type: 'FeatureCollection', features };
}
