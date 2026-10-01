/**
 * Night show timing for the living map. Pure, unit tested.
 *
 * The server sends tonight's real showtime (GET /parks/{id}/night-show): start
 * and end with the park's UTC offset, runtime, finale length and an intensity
 * arc. From that the app knows when to tease the show, when it is live, how far
 * into the show it is, and builds a deterministic burst schedule whose finale
 * lands on the real end. Visuals only: no names, music or logos.
 */

export type NightShowKind = 'fireworks' | 'water' | 'projection';

export interface NightShow {
  readonly kind: NightShowKind;
  /** Generic noun for the teaser ("Fireworks", "Water show"). */
  readonly label: string;
  /** Generic viewing hint ("Over the castle"). */
  readonly where: string;
  /** ISO 8601 with the park's UTC offset, e.g. 2026-10-05T21:00:00-04:00. */
  readonly starts_at: string;
  readonly ends_at: string;
  readonly duration_seconds: number;
  readonly finale_seconds: number;
  readonly finale_fireworks: boolean;
  readonly anchor: { readonly latitude: number; readonly longitude: number };
  /** [fraction of runtime, intensity 0..1], sorted by fraction. */
  readonly curve: readonly (readonly [number, number])[];
  readonly timezone: string;
}

export type ShowPhase = 'none' | 'teaser' | 'live' | 'done';

/** The teaser shows in the hour before the show. */
export const TEASER_MS = 60 * 60_000;

export function showTimes(show: NightShow): { start: number; end: number } | null {
  const start = Date.parse(show.starts_at);
  const end = Date.parse(show.ends_at);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function showPhase(show: NightShow | null | undefined, now: number): ShowPhase {
  const times = show ? showTimes(show) : null;
  if (!times) return 'none';
  if (now >= times.end) return 'done';
  if (now >= times.start) return 'live';
  return now >= times.start - TEASER_MS ? 'teaser' : 'none';
}

/**
 * "9:30 PM" in the park's own time: read straight from the offset timestamp the
 * server sends, so it is right whatever time zone the phone is set to.
 */
export function parkClock(iso: string): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2];
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "Fireworks tonight at 9:30 PM" (no em dashes, no show names). */
export function teaserText(show: NightShow): string {
  const at = parkClock(show.starts_at);
  return at ? `${show.label} tonight at ${at}` : `${show.label} tonight`;
}

export function liveText(show: NightShow): string {
  return `${show.label} now! ${show.where}`;
}

/** Intensity 0..1 at a fraction of the runtime (linear between curve points). */
export function intensityAt(curve: readonly (readonly [number, number])[], fraction: number): number {
  if (!curve.length || fraction < 0 || fraction > 1) return 0;
  if (fraction <= curve[0][0]) return clamp01(curve[0][1]);
  for (let i = 1; i < curve.length; i++) {
    const [f1, v1] = curve[i];
    const [f0, v0] = curve[i - 1];
    if (fraction <= f1) return clamp01(f1 === f0 ? v1 : v0 + ((v1 - v0) * (fraction - f0)) / (f1 - f0));
  }
  return clamp01(curve[curve.length - 1][1]);
}

export type BurstType = 0 | 1 | 2 | 3; // 0 peony, 1 willow, 2 fountain jet, 3 light wash

export interface Burst {
  /** Seconds into the show when it bursts (fountains: when the jet fires). */
  readonly t: number;
  /** Offset from the launch point in px (y negative = up). */
  readonly x: number;
  readonly y: number;
  readonly color: number;
  /** 0.6..1.4 */
  readonly size: number;
  readonly type: BurstType;
}

/** Hard ceiling on scheduled bursts per show (memory and UI-thread search). */
export const MAX_BURSTS = 2400;

/**
 * Every burst of the show, in time order, from the intensity arc: busier
 * moments fire more and bigger, the finale fires fastest and the last burst
 * lands just before the real end. Deterministic for the same show.
 */
export function burstSchedule(show: NightShow): Burst[] {
  const duration = show.duration_seconds;
  if (!(duration > 0) || !show.curve.length) return [];
  const finaleStart = duration - Math.max(0, Math.min(show.finale_seconds, duration));
  const out: Burst[] = [];
  let seed = Math.round(Date.parse(show.starts_at) / 1000) || 1;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  let t = 0.4;
  while (t < duration - 0.8 && out.length < MAX_BURSTS) {
    const finale = t >= finaleStart;
    const level = Math.max(0.05, intensityAt(show.curve, t / duration));
    const fireworks = show.kind === 'fireworks' || (finale && show.finale_fireworks);
    const type: BurstType = fireworks ? (rand() < (finale ? 0.35 : 0.2) ? 1 : 0) : show.kind === 'water' ? 2 : 3;
    out.push({
      t: round2(t),
      x: Math.round((rand() - 0.5) * (fireworks ? 220 : 240)),
      y: Math.round(fireworks ? -170 - rand() * 160 : type === 2 ? -6 - rand() * 14 : -60 - rand() * 120),
      color: Math.floor(rand() * 6),
      size: round2(0.6 + level * 0.6 + rand() * 0.2),
      type,
    });
    // Bursts per second climb with intensity; the finale is a barrage.
    const rate = finale ? 2.6 + level * 1.6 : 0.25 + level * 1.6;
    t += (0.6 + rand() * 0.8) / rate;
  }
  return out;
}

/** Seconds into the show at a wall-clock time (negative before it starts). */
export function showSecond(show: NightShow, now: number): number {
  const times = showTimes(show);
  return times ? (now - times.start) / 1000 : Number.NaN;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
