/**
 * Park pulse: how the live wait feed shows on the map. Pure, unit tested.
 *
 *  - Every operating ride breathes a glow under its island; the busier it is,
 *    the warmer the colour and the quicker the breath (cool mint at a walk-on,
 *    gold around a normal line, warm coral when it is slammed).
 *  - Down, closed and not-yet-open rides sleep: no glow, drifting "z".
 *  - A soft warm haze gathers over the busiest corners of the park.
 */

export interface PulseRide {
  readonly status: string;
  readonly wait: number | null;
  readonly typical?: number | null;
}

/** 0 = walk on, 1 = slammed. Absolute wait leads; a line far over its usual nudges it warmer. */
export function rideBusyness(wait: number, typical?: number | null): number {
  const absolute = clamp01((wait - 5) / 70);
  if (!typical || typical <= 0) return absolute;
  const relative = clamp01((wait / typical - 0.5) / 1.5);
  return clamp01(absolute * 0.75 + relative * 0.25);
}

export interface WaitGlow {
  readonly color: string;
  /** Peak opacity of the glow. */
  readonly strength: number;
  /** Seconds per breath: busier rides breathe faster. */
  readonly period: number;
  readonly busy: number;
}

const COOL: Rgb = [127, 228, 214]; // mint
const MID: Rgb = [255, 207, 59]; // brand gold
const WARM: Rgb = [255, 110, 64]; // coral

/** The glow under an operating ride with a posted wait; null when it should not glow. */
export function waitGlow(ride: PulseRide | null | undefined): WaitGlow | null {
  if (!ride || ride.status !== 'OPERATING' || ride.wait === null || !Number.isFinite(ride.wait)) return null;
  const busy = rideBusyness(Math.max(0, ride.wait), ride.typical);
  const color = busy < 0.5 ? mix(COOL, MID, busy / 0.5) : mix(MID, WARM, (busy - 0.5) / 0.5);
  return { color, strength: round2(0.38 + busy * 0.4), period: round2(3.6 - busy * 1.8), busy: round2(busy) };
}

/** Down, closed, in refurbishment, or a timed ride that opens later: the island sleeps. */
export function rideAsleep(ride: PulseRide | null | undefined, restingUntil?: number | null): boolean {
  if (restingUntil !== null && restingUntil !== undefined) return true;
  return !!ride && (ride.status === 'DOWN' || ride.status === 'CLOSED' || ride.status === 'REFURBISHMENT');
}

export interface HazeRide extends PulseRide {
  readonly latitude: number;
  readonly longitude: number;
}

/** Busy rides only, weighted by busyness, as heatmap points. Short lines add no haze. */
export function crowdHaze(rides: readonly HazeRide[]): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> {
  const features: GeoJSON.Feature<GeoJSON.Point, { w: number }>[] = [];
  for (const ride of rides) {
    if (ride.status !== 'OPERATING' || ride.wait === null || ride.wait < 15) continue;
    if (!Number.isFinite(ride.latitude) || !Number.isFinite(ride.longitude)) continue;
    const w = round2(rideBusyness(ride.wait, ride.typical));
    if (w <= 0.05) continue;
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ride.longitude, ride.latitude] }, properties: { w } });
  }
  return { type: 'FeatureCollection', features };
}

type Rgb = readonly [number, number, number];

function mix(a: Rgb, b: Rgb, t: number): string {
  const k = clamp01(t);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
