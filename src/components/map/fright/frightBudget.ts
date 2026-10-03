/**
 * Fin-ister Nights map layer: phase to intensity, tier selection, LOD,
 * off-screen culling and per-spot budget allocation. Pure, unit tested.
 *
 * Tiers reuse the living map's ALIVE_CAPS (ambientBudget.ts):
 *  - full: every family at its cap.
 *  - lite: about half.
 *  - calm: a static night tint and still lanterns. No fog, critters, thunder,
 *    pops or sound. Reduce Motion, the Spooky effects toggle being off, and a
 *    battery under 20% all land here.
 */
import { ALIVE_CAPS, frightSpriteBudget, type AliveCaps, type AliveTier } from '../alive/ambientBudget';
import type { FrightNightWindow, FrightPhase, FrightSpot } from '../../../api/endpoints/fright/types';
import { distanceMeters, pointsPerMeter, type LatLng } from './geo';

/* ── Phase to intensity ───────────────────────────────────────────────── */

/** Early Access runs the fog and tint at 40% (DESIGN R7). */
export const EARLY_INTENSITY = 0.4;
/** After close everything fades out over 10 minutes (DESIGN R8). */
export const AFTER_FADE_MS = 10 * 60_000;
/** Blend in when the mode turns on. */
export const BLEND_IN_MS = 4000;

/** Phases where the mode can be ON (DESIGN R6). */
export function isLivePhase(phase: FrightPhase | null | undefined): boolean {
  return phase === 'early' || phase === 'live' || phase === 'last_call';
}

/** 0..1 strength of the takeover for a phase at a server-clock instant. */
export function phaseIntensity(phase: FrightPhase | null | undefined, serverNowMs: number,
  night: Pick<FrightNightWindow, 'closes_at'> | null | undefined): number {
  if (phase === 'early') return EARLY_INTENSITY;
  if (phase === 'live' || phase === 'last_call') return 1;
  if (phase === 'after') {
    const closes = night ? Date.parse(night.closes_at) : NaN;
    if (!Number.isFinite(closes)) return 0;
    const t = (serverNowMs - closes) / AFTER_FADE_MS;
    return round3(Math.max(0, Math.min(1, 1 - t)));
  }
  return 0;
}

/**
 * What the layer shows. The takeover needs the mode ON; the 10 minute fade in
 * `after` only plays for a map that was showing it (never for someone who
 * opens the app after close).
 */
export function frightVisibility({ active, phase, serverNowMs, night, wasActive }: {
  readonly active: boolean;
  readonly phase: FrightPhase | null | undefined;
  readonly serverNowMs: number;
  readonly night: Pick<FrightNightWindow, 'closes_at'> | null | undefined;
  readonly wasActive: boolean;
}): number {
  if (active && isLivePhase(phase)) return phaseIntensity(phase, serverNowMs, night);
  if (phase === 'after' && wasActive) return phaseIntensity('after', serverNowMs, night);
  return 0;
}

/* ── Tier ─────────────────────────────────────────────────────────────── */

export const LOW_BATTERY = 0.2;

/**
 * The fright layer's tier: the living map's governed tier, stepped down by
 * the player's toggle, Reduce Motion and power. `lowPower` and `batteryLevel`
 * are optional: this build has no battery module, so they stay undefined.
 */
export function frightTier({ alive, spooky, reducedMotion, lowPower, batteryLevel, cap }: {
  readonly alive: AliveTier;
  /** Highest tier allowed (server config.fx_tier_cap). */
  readonly cap?: AliveTier | null;
  readonly spooky: boolean;
  readonly reducedMotion: boolean;
  readonly lowPower?: boolean;
  readonly batteryLevel?: number | null;
}): AliveTier {
  if (!spooky || reducedMotion || alive === 'calm') return 'calm';
  if (typeof batteryLevel === 'number' && batteryLevel >= 0 && batteryLevel < LOW_BATTERY) return 'calm';
  const computed: AliveTier = lowPower && alive === 'full' ? 'lite' : alive;
  return cap ? minTier(computed, cap) : computed;
}

const TIER_RANK: Readonly<Record<AliveTier, number>> = { calm: 0, lite: 1, full: 2 };

export function minTier(a: AliveTier, b: AliveTier): AliveTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

/**
 * The cap in force: the server's when sent; otherwise `lite` while the mode is
 * ON (battery is not measured yet), none when the mode is off.
 */
export function frightTierCap(serverCap: AliveTier | null | undefined, modeOn: boolean): AliveTier | null {
  if (serverCap === 'full' || serverCap === 'lite' || serverCap === 'calm') return serverCap;
  return modeOn ? 'lite' : null;
}

/** The ambient sound bed is opt-in (`ambience: true`) and needs effects on. Thunder and pops do not need it. */
export function ambienceOn(input: { readonly ambience?: boolean }, effectsOn: boolean): boolean {
  return input.ambience === true && effectsOn;
}

/** The chip under a haunt: "The Robot City · 25m", just the name without a wait, "Closed" when closed. */
export function hauntChipLabel(spot: Pick<FrightSpot, 'name' | 'status' | 'posted_minutes'>): string {
  const closed = spot.status === 'CLOSED' || spot.status === 'DOWN' || spot.status === 'REFURBISHMENT';
  if (closed) return `${spot.name} · Closed`;
  const wait = spot.posted_minutes;
  return typeof wait === 'number' && Number.isFinite(wait) && wait >= 0 ? `${spot.name} · ${Math.round(wait)} min` : spot.name;
}

/**
 * Intro cue edges: 'hold' when the intro starts (haunts unlit, no flash or
 * thunder: the tutorial plays the night's one thunder), 'light' when it ends.
 */
export function introStep(prev: 'intro' | null, next: 'intro' | null): 'hold' | 'light' | 'none' {
  if (next === 'intro' && prev !== 'intro') return 'hold';
  if (prev === 'intro' && next !== 'intro') return 'light';
  return 'none';
}

/** Chips closer than this (points on screen) to a chip already shown are hidden. */
export const CHIP_MIN_GAP_PT = 72;

/**
 * Which haunts show their chip: in rank order (nearest first), skipping any
 * haunt whose chip would land within CHIP_MIN_GAP_PT of one already shown,
 * so two neighbouring haunts never stack unreadable chips.
 */
export function chipKeys(ranked: readonly { readonly key: string; readonly latitude: number; readonly longitude: number }[],
  zoom: number): Set<string> {
  const shown: { latitude: number; longitude: number }[] = [];
  const keys = new Set<string>();
  if (!Number.isFinite(zoom) || zoom < HAUNT_CHIP_ZOOM) return keys;
  for (const h of ranked) {
    const ppm = pointsPerMeter(zoom, h.latitude);
    if (shown.some(o => distanceMeters(o, h) * ppm < CHIP_MIN_GAP_PT)) continue;
    shown.push(h);
    keys.add(h.key);
  }
  return keys;
}

/** Haunt chips show from this zoom in (they would crowd ride markers further out). */
export const HAUNT_CHIP_ZOOM = 16;

export type FrightCaps = Pick<AliveCaps, 'frightCritters' | 'frightFog' | 'frightBats' | 'frightWindows' | 'frightBolts' | 'frightProps'>;

export function frightCaps(tier: AliveTier): FrightCaps {
  const c = ALIVE_CAPS[tier];
  return { frightCritters: c.frightCritters, frightFog: c.frightFog, frightBats: c.frightBats,
    frightWindows: c.frightWindows, frightBolts: c.frightBolts, frightProps: c.frightProps };
}

/** Worst case moving sprites per tier (the same count ambientSpriteBudget adds). */
export function frightWorstCase(tier: AliveTier): number {
  return frightSpriteBudget(ALIVE_CAPS[tier]);
}

/* ── LOD and culling ──────────────────────────────────────────────────── */

/** Below this zoom a reef's critters collapse into one still glyph. */
export const CRITTER_LOD_ZOOM = 15.5;

export function critterLod(zoom: number): 'sprites' | 'glyph' {
  return Number.isFinite(zoom) && zoom < CRITTER_LOD_ZOOM ? 'glyph' : 'sprites';
}

export interface Bounds { readonly north: number; readonly south: number; readonly east: number; readonly west: number }

/**
 * Inside the view or within `margin` screens of it. Unknown bounds keep
 * everything (the first frames before the map reports its view).
 */
export function nearView(p: LatLng, bounds: Bounds | null | undefined, margin = 1): boolean {
  if (!bounds) return true;
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lngSpan = Math.abs(bounds.east - bounds.west);
  const north = Math.max(bounds.north, bounds.south) + latSpan * margin;
  const south = Math.min(bounds.north, bounds.south) - latSpan * margin;
  const east = Math.max(bounds.east, bounds.west) + lngSpan * margin;
  const west = Math.min(bounds.east, bounds.west) - lngSpan * margin;
  return p.latitude <= north && p.latitude >= south && p.longitude <= east && p.longitude >= west;
}

/** MapLibre getVisibleBounds() ([[east, north], [west, south]]) to Bounds. */
export function boundsFromVisible(visible: readonly (readonly number[])[] | null | undefined): Bounds | null {
  if (!visible || visible.length < 2) return null;
  const [[east, north], [west, south]] = visible;
  if (![east, north, west, south].every(Number.isFinite)) return null;
  return { north, south, east, west };
}

export function boundsCenter(b: Bounds): LatLng {
  return { latitude: (b.north + b.south) / 2, longitude: (b.east + b.west) / 2 };
}

/* ── Allocation ───────────────────────────────────────────────────────── */

/** Spot keys nearest first (from the player, else the view center). Ties keep server sort. */
export function rankSpots(spots: readonly FrightSpot[], from: LatLng | null): string[] {
  const withDistance = spots.map((s, i) => ({ key: s.key, i, d: from ? distanceMeters(from, s) : s.sort }));
  withDistance.sort((a, b) => a.d - b.d || a.i - b.i);
  return withDistance.map(s => s.key);
}

/**
 * Hand a shared cap to spots in rank order: each takes what it wants (up to
 * its own max) until the cap runs out. Spots not listed get nothing.
 */
export function allocate(wants: readonly (readonly [string, number])[], cap: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = Math.max(0, Math.floor(cap));
  for (const [key, want] of wants) {
    const n = Math.max(0, Math.min(left, Math.floor(want)));
    out[key] = n;
    left -= n;
  }
  return out;
}

/** Critters a reef asks for: fx.critters clamped to 1..3 (default 2). */
export function critterWant(fx: FrightSpot['fx']): number {
  const n = Number(fx?.critters ?? 2);
  return Number.isFinite(n) ? Math.max(1, Math.min(3, Math.round(n))) : 2;
}

/** Lantern windows a haunt asks for: fx.windows clamped to 2..6 (default 3). */
export function windowWant(fx: FrightSpot['fx']): number {
  const n = Number(fx?.windows ?? 3);
  return Number.isFinite(n) ? Math.max(2, Math.min(6, Math.round(n))) : 3;
}

export const KNOWN_PROPS = ['bats', 'eyes', 'pumpkin', 'skid-fins', 'lantern', 'fog-thick', 'lagoon-glow'] as const;
export type FrightProp = typeof KNOWN_PROPS[number];

/** A spot's props, known kinds only, in a stable order, no duplicates. */
export function spotProps(fx: FrightSpot['fx']): FrightProp[] {
  const list = Array.isArray(fx?.props) ? fx!.props! : [];
  return KNOWN_PROPS.filter(kind => list.includes(kind));
}

/** Props that move and cost budget (fog-thick is a still mist). */
export function movingProps(props: readonly FrightProp[]): FrightProp[] {
  return props.filter(p => p !== 'fog-thick' && p !== 'bats' && p !== 'lagoon-glow');
}

/** Props drawn by the spot props canvas (the lagoon glow has its own marker, at showtimes only). */
export function canvasProps(props: readonly FrightProp[]): FrightProp[] {
  return props.filter(p => p !== 'lagoon-glow');
}

/* ── Night show yield ─────────────────────────────────────────────────── */

/** A show listed with only start times is treated as running this long. */
export const SHOW_WINDOW_MS = 20 * 60_000;

/** A show spot's performance is running at this instant (from its `times`). */
export function showLiveFromSpots(spots: readonly FrightSpot[], serverNowMs: number): boolean {
  for (const spot of spots) {
    if (spot.kind !== 'show' || !spot.times) continue;
    for (const iso of spot.times) {
      const start = Date.parse(iso);
      if (Number.isFinite(start) && serverNowMs >= start && serverNowMs < start + SHOW_WINDOW_MS) return true;
    }
  }
  return false;
}

/* ── Perf probe ───────────────────────────────────────────────────────── */

/** Average and 95th percentile of frame intervals (ms). */
export function frameStats(samples: readonly number[]): { avg: number; p95: number; n: number } {
  const clean = samples.filter(v => Number.isFinite(v) && v > 0);
  if (!clean.length) return { avg: 0, p95: 0, n: 0 };
  const sorted = [...clean].sort((a, b) => a - b);
  const avg = clean.reduce((s, v) => s + v, 0) / clean.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  return { avg: round3(avg), p95: round3(p95), n: clean.length };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * The fixed Marker order for a payload: reefs, prop spots, haunts, each by key.
 * Pure (tools/tests/fright-mapfx-markers.test.cjs): the same payload always
 * gives the same list, whatever the camera, ranking or tier.
 */
export function stableMarkerSpots(spots: readonly FrightSpot[]): {
  readonly reefs: readonly FrightSpot[]; readonly props: readonly FrightSpot[]; readonly haunts: readonly FrightSpot[];
  readonly all: readonly FrightSpot[];
} {
  const byKey = (a: FrightSpot, b: FrightSpot) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const reefs = spots.filter(s => s.kind === 'reef').slice().sort(byKey);
  const props = spots.filter(s => spotProps(s.fx).length > 0).slice().sort(byKey);
  const haunts = spots.filter(s => s.kind === 'haunt').slice().sort(byKey);
  return { reefs, props, haunts, all: [...reefs, ...props, ...haunts] };
}

