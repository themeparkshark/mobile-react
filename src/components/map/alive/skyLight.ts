/**
 * Time-of-day lighting for the living map. Pure, unit tested.
 *
 * Lighting follows the real sun over the player's park: the sun's elevation is
 * computed from the map position and the clock (no network, no time zone
 * table), so golden hour, dusk and night land when they actually happen there.
 * Every value eases continuously with the sun, so the map never snaps between
 * looks. The tint is laid over the map tiles only (pins stay bright on top of
 * it) and is capped so roads, paths and water always read clearly.
 */

export type SkyPhase = 'day' | 'golden' | 'dusk' | 'night';

export interface SkyLight {
  readonly phase: SkyPhase;
  /** Sun elevation in degrees (negative below the horizon). */
  readonly elevation: number;
  /** Colour laid over the map tiles (under every pin), never strong enough to hurt legibility. */
  readonly tint: { readonly color: string; readonly opacity: number };
  /** Warm low-sun wash from the corner (golden hour). 0..1 */
  readonly wash: number;
  /** Soft darkening at the screen edges after sunset. 0..1 */
  readonly vignette: number;
  /** Warm lamp glows on pins and paths. 0..1 */
  readonly lamps: number;
  /** Ambient daytime life: cloud shadows, birds, sun glints on water. 0..1 */
  readonly clouds: number;
  readonly birds: number;
  readonly glints: number;
  /** Night life: fireflies around the shark. 0..1 */
  readonly fireflies: number;
}

export const DAYLIGHT: SkyLight = {
  phase: 'day', elevation: 45, tint: { color: '#ffffff', opacity: 0 }, wash: 0, vignette: 0, lamps: 0,
  clouds: 1, birds: 1, glints: 1, fireflies: 0,
};

/** Never dim the map tiles more than this: paths and water must stay legible at night. */
export const MAX_TINT_OPACITY = 0.34;

const RAD = Math.PI / 180;

/**
 * Sun elevation (degrees) at a place and instant. Low-precision solar
 * position (good to well under a degree), plenty for lighting.
 */
export function sunElevation(at: Date | number, latitude: number, longitude: number): number {
  const ms = typeof at === 'number' ? at : at.getTime();
  const n = ms / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000.0
  const meanLongitude = mod360(280.46 + 0.9856474 * n);
  const meanAnomaly = mod360(357.528 + 0.9856003 * n) * RAD;
  const eclipticLongitude = (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.0000004 * n) * RAD;
  const rightAscension = Math.atan2(Math.cos(obliquity) * Math.sin(eclipticLongitude), Math.cos(eclipticLongitude));
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const siderealDegrees = mod360(280.46061837 + 360.98564736629 * n + longitude);
  const hourAngle = siderealDegrees * RAD - rightAscension;
  const lat = latitude * RAD;
  const sinElevation = Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinElevation))) / RAD;
}

export function skyPhase(elevation: number): SkyPhase {
  if (elevation >= 10) return 'day';
  if (elevation >= 1) return 'golden';
  if (elevation >= -7) return 'dusk';
  return 'night';
}

interface Key {
  readonly e: number;
  readonly tint: readonly [number, number, number];
  readonly tintOpacity: number;
  readonly wash: number;
  readonly vignette: number;
  readonly lamps: number;
  readonly clouds: number;
  readonly birds: number;
  readonly glints: number;
  readonly fireflies: number;
}

// Keyframes by sun elevation, high sun first. Values ease linearly between them.
const KEYS: readonly Key[] = [
  { e: 15, tint: [255, 255, 255], tintOpacity: 0, wash: 0, vignette: 0, lamps: 0, clouds: 1, birds: 1, glints: 1, fireflies: 0 },
  // Golden hour: honey light, long warm wash.
  { e: 6, tint: [255, 176, 74], tintOpacity: 0.08, wash: 0.55, vignette: 0, lamps: 0, clouds: 0.9, birds: 0.9, glints: 1, fireflies: 0 },
  // Sunset: peach and coral, the first lamps come on.
  { e: 0, tint: [255, 122, 89], tintOpacity: 0.14, wash: 0.75, vignette: 0.12, lamps: 0.3, clouds: 0.45, birds: 0.6, glints: 0.7, fireflies: 0 },
  // Dusk: violet blue hour.
  { e: -5, tint: [106, 79, 181], tintOpacity: 0.22, wash: 0.15, vignette: 0.26, lamps: 0.75, clouds: 0.1, birds: 0.15, glints: 0.3, fireflies: 0.45 },
  // Night: deep navy, warm lamps, fireflies, moonlit glints.
  { e: -11, tint: [20, 39, 94], tintOpacity: MAX_TINT_OPACITY, wash: 0, vignette: 0.4, lamps: 1, clouds: 0, birds: 0, glints: 0.15, fireflies: 1 },
];

/** The map's lighting for a sun elevation. */
export function lightForElevation(elevation: number): SkyLight {
  const e = Math.round(elevation * 2) / 2; // half-degree steps: stable values, rare re-renders
  let a = KEYS[0];
  let b = KEYS[0];
  if (e <= KEYS[KEYS.length - 1].e) {
    a = KEYS[KEYS.length - 1];
    b = a;
  } else if (e < KEYS[0].e) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (e <= KEYS[i].e && e >= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
  }
  const t = a === b ? 0 : (a.e - e) / (a.e - b.e);
  const lerp = (x: number, y: number) => round2(x + (y - x) * t);
  const rgb = a.tint.map((v, i) => Math.round(v + (b.tint[i] - v) * t));
  return {
    phase: skyPhase(e),
    elevation: e,
    tint: { color: `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`, opacity: Math.min(MAX_TINT_OPACITY, lerp(a.tintOpacity, b.tintOpacity)) },
    wash: lerp(a.wash, b.wash),
    vignette: lerp(a.vignette, b.vignette),
    lamps: lerp(a.lamps, b.lamps),
    clouds: lerp(a.clouds, b.clouds),
    birds: lerp(a.birds, b.birds),
    glints: lerp(a.glints, b.glints),
    fireflies: lerp(a.fireflies, b.fireflies),
  };
}

/** Lighting at a place and instant. Without a position the map stays in daylight. */
export function skyLightAt(at: Date | number, position: { latitude: number; longitude: number } | null | undefined): SkyLight {
  if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return DAYLIGHT;
  return lightForElevation(sunElevation(at, position.latitude, position.longitude));
}

function mod360(v: number): number {
  return ((v % 360) + 360) % 360;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
