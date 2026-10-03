/**
 * Ride variety for Ride Photo. One tap, one shutter and the same ms grading on
 * every ride; what changes is the ride, its camera moment and the scene. Pure,
 * so the picker, the scene variety and the tests agree.
 */

export type RideKind = 'coaster' | 'flume' | 'teacups' | 'drop_tower' | 'dark_ride' | 'carousel' | 'ferris' | 'raft';

export interface RideInfo {
  readonly kind: RideKind;
  /** Shown in the band and on the print caption. */
  readonly name: string;
  /** The camera moment, for accessibility and the hint. */
  readonly moment: string;
  /** Built and graded; rides that are not ready fall back to a ready one. */
  readonly ready: boolean;
  /** Fallback while not ready (always a ready ride). */
  readonly fallback: RideKind;
  /** How wild the ride feels, 1 (gentle) to 3 (wildest). Legendary prefers 3. */
  readonly thrill: 1 | 2 | 3;
  /** The print frame style for this ride. */
  readonly frame: PrintFrame;
}

export type PrintFrame = 'classic' | 'splash' | 'sugar' | 'neon' | 'bunting' | 'stars' | 'rapids' | 'drop';

export const RIDES: Readonly<Record<RideKind, RideInfo>> = {
  coaster: { kind: 'coaster', name: 'Coaster', moment: 'at the drop', ready: true, fallback: 'coaster', thrill: 3, frame: 'classic' },
  flume: { kind: 'flume', name: 'Log Flume', moment: 'at the splash', ready: true, fallback: 'flume', thrill: 2, frame: 'splash' },
  teacups: { kind: 'teacups', name: 'Teacups', moment: 'when the cup faces you', ready: true, fallback: 'teacups', thrill: 1, frame: 'sugar' },
  drop_tower: { kind: 'drop_tower', name: 'Drop Tower', moment: 'the instant it drops', ready: false, fallback: 'coaster', thrill: 3, frame: 'drop' },
  dark_ride: { kind: 'dark_ride', name: 'Dark Ride', moment: 'when the scene lights up', ready: false, fallback: 'coaster', thrill: 2, frame: 'neon' },
  carousel: { kind: 'carousel', name: 'Carousel', moment: 'at the top of the bob', ready: false, fallback: 'teacups', thrill: 1, frame: 'bunting' },
  ferris: { kind: 'ferris', name: 'Ferris Wheel', moment: 'with the gondola at the top', ready: false, fallback: 'teacups', thrill: 1, frame: 'stars' },
  raft: { kind: 'raft', name: 'River Raft', moment: 'bouncing through the rapids', ready: false, fallback: 'flume', thrill: 2, frame: 'rapids' },
};
export const ALL_RIDES = Object.keys(RIDES) as RideKind[];
export const READY_RIDES = ALL_RIDES.filter(kind => RIDES[kind].ready);

/** Each set leans toward a ride that fits it. */
export const SET_RIDE: Readonly<Record<string, RideKind>> = {
  'spooky-snacks': 'dark_ride',
  'parade-day': 'carousel',
  'sweet-treats': 'teacups',
  'night-glow': 'ferris',
  'ride-day-gear': 'coaster',
  'churro-cart': 'raft',
  'snack-stand': 'flume',
  souvenirs: 'ferris',
};

export function setSlug(setName: string | null | undefined): string {
  const slug = (setName ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug === 'souvenir-shop' ? 'souvenirs' : slug;
}

/** A small deterministic hash (mulberry32 step) so the same find and day ride the same way. */
export function seeded(seed: number, salt = 0): number {
  let a = (Math.round(seed) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Which ride this find takes. Themed by its set (x4 weight), wildest rides for
 * Legendary (x4), a seeded roll for variety, and never the same ride twice in
 * a row when there is a choice. Only ready rides are ever returned.
 */
export function pickRide(opts: {
  setName?: string | null;
  rarity: number | null | undefined;
  seed: number;
  lastRide?: RideKind | null;
  ready?: readonly RideKind[];
}): RideKind {
  const ready = opts.ready ?? READY_RIDES;
  if (ready.length === 0) return 'coaster';
  const tier = Math.round(Number(opts.rarity) || 0);
  const themed = SET_RIDE[setSlug(opts.setName)];
  const themedReady = themed ? (ready.includes(themed) ? themed : RIDES[themed].fallback) : null;
  const weights = ready.map(kind => {
    let w = 1;
    if (kind === themedReady) w *= 4;
    if (tier >= 5) w *= RIDES[kind].thrill === 3 ? 4 : RIDES[kind].thrill === 1 ? 0.25 : 1;
    if (opts.lastRide && kind === opts.lastRide && ready.length > 1) w = 0;
    return w;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return ready[0];
  let roll = seeded(opts.seed, 7) * total;
  for (let i = 0; i < ready.length; i++) {
    roll -= weights[i];
    if (roll < 0) return ready[i];
  }
  return ready[ready.length - 1];
}

export type Sky = 'day' | 'sunset' | 'night';
export type Season = 'none' | 'halloween' | 'holiday';
export type Weather = 'clear' | 'breezy';
export type Photobomb = 'none' | 'gull' | 'fireworks';

export interface SceneVariant {
  readonly sky: Sky;
  readonly season: Season;
  readonly weather: Weather;
  readonly photobomb: Photobomb;
  readonly golden: boolean;
  /** Where the camera moment sits within the ride's range (-1..1), so the frame moves ride to ride. */
  readonly frameShift: number;
}

/** October is Halloween, December is the holidays (the device's local date). */
export function seasonFor(date: Date): Season {
  const month = date.getMonth();
  if (month === 9) return 'halloween';
  if (month === 11) return 'holiday';
  return 'none';
}

/**
 * The scene for one ride, seeded by the find so a reopen looks the same.
 * Spooky sets and the dark ride are always night; the Golden Hour shiny wins
 * the sky. Photobombs are rare: a gull by day (1 in 8), fireworks at night (1 in 4).
 */
export function sceneVariant(opts: { seed: number; kind: RideKind; setName?: string | null; golden?: boolean; date?: Date }): SceneVariant {
  const slug = setSlug(opts.setName);
  const r = seeded(opts.seed, 11);
  let sky: Sky = r < 0.25 ? 'night' : r < 0.5 ? 'sunset' : 'day';
  if (slug === 'spooky-snacks' || slug === 'night-glow' || opts.kind === 'dark_ride') sky = 'night';
  if (opts.golden) sky = 'sunset';
  const bomb = seeded(opts.seed, 13);
  const photobomb: Photobomb = sky === 'night' ? (bomb < 0.25 ? 'fireworks' : 'none') : bomb < 0.125 ? 'gull' : 'none';
  const shifts = [0, -0.6, 0.6];
  return {
    sky,
    season: seasonFor(opts.date ?? new Date()),
    weather: seeded(opts.seed, 17) < 0.35 ? 'breezy' : 'clear',
    photobomb,
    golden: opts.golden === true,
    frameShift: shifts[Math.floor(seeded(opts.seed, 19) * 3) % 3],
  };
}

/** "Rides snapped": the collection hook. */
export function ridesSnappedLine(snapped: readonly RideKind[]): string {
  const count = new Set(snapped.filter(kind => kind in RIDES)).size;
  return `${count} of ${ALL_RIDES.length} rides snapped`;
}
