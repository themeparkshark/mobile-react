/**
 * Server-hosted art for the fright map (GET /parks/{id}/fright `assets`):
 * slug lookups, sheet geometry, window flicker timelines per MAP_FX_SPEC,
 * the encounter's Chaos Hour and an image cache that loads each URL once.
 * Pure, unit tested. Nothing here hard-codes a critter or haunt slug: spots
 * name their art (`fx.critter`, `fx.art`) and the manifest says what exists.
 */
import type { FrightAssets, FrightHauntLayers, FrightSheetAsset, FrightSpot } from '../../../api/endpoints/fright/types';
import { randAt } from './random';

/* ── Lookups ──────────────────────────────────────────────────────────── */

/** A haunt's facade layers, when the manifest has them and the base is present. */
export function hauntLayers(assets: FrightAssets | null | undefined, spot: Pick<FrightSpot, 'fx'>): FrightHauntLayers | null {
  const slug = spot.fx?.art;
  const layers = slug ? assets?.haunts?.[slug]?.layers : null;
  return layers && layers.base && validFrame(layers.frame) ? layers : null;
}

/** A critter's sheet by slug (null: unknown slug, draw the placeholder). */
export function critterAsset(assets: FrightAssets | null | undefined, slug: string | null | undefined): FrightSheetAsset | null {
  const a = slug ? assets?.critters?.[slug] : null;
  return a && (a.sheet || a.static) && validFrame(a.frame) ? a : null;
}

export function iconAsset(assets: FrightAssets | null | undefined, slug: string): FrightSheetAsset | null {
  const a = assets?.icons?.[slug];
  return a && (a.sheet || a.static) && validFrame(a.frame) ? a : null;
}

export function ambientUrl(assets: FrightAssets | null | undefined, key: string): string | null {
  return assets?.ambient?.[key]?.file ?? null;
}

function validFrame(frame: readonly number[] | null | undefined): boolean {
  return !!frame && frame.length === 2 && frame[0] > 0 && frame[1] > 0;
}

/** Row index for a row name ("idle", "jump", "appear"...): rows may carry suffixes ("idle loop"). -1 when absent. */
export function rowIndex(asset: Pick<FrightSheetAsset, 'rows'>, name: string): number {
  return asset.rows.findIndex(row => row === name || row.startsWith(`${name} `));
}

/** Frames per row (manifest value, 10 by default) and the frame rate (10 fps, never above 10). */
export function sheetTiming(asset: Pick<FrightSheetAsset, 'frames_per_row' | 'fps'>): { frames: number; fps: number } {
  const frames = Math.max(1, Math.floor(Number(asset.frames_per_row) || 10));
  const fps = Math.max(1, Math.min(10, Number(asset.fps) || 10));
  return { frames, fps };
}

/** Sprites are @2x: points = pixels / 2. */
export function pointSize(frame: readonly [number, number]): { w: number; h: number } {
  return { w: frame[0] / 2, h: frame[1] / 2 };
}

/* ── Encounter ────────────────────────────────────────────────────────── */

/**
 * The window holds 11:11 PM park time (Chaos Hour). Read straight from the
 * offset timestamps, so the phone's time zone never matters.
 */
export function isChaosHour(startsAt: string, endsAt: string): boolean {
  const mins = (iso: string) => {
    const m = /T(\d{2}):(\d{2})/.exec(iso);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const a = mins(startsAt);
  const b = mins(endsAt);
  const chaos = 23 * 60 + 11;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a <= b ? a <= chaos && chaos < b : a <= chaos || chaos < b;
}

/** Chaos Hour from the server's flag when sent, else from the window's park times. */
export function encounterChaos(enc: { readonly chaos_hour?: boolean | null; readonly starts_at: string; readonly ends_at: string }): boolean {
  return typeof enc.chaos_hour === 'boolean' ? enc.chaos_hour : isChaosHour(enc.starts_at, enc.ends_at);
}

/** Seconds the chaos loop plays after any spawn (MAP_FX_SPEC). */
export const CHAOS_SPAWN_S = 20;

/**
 * The encounter's frame (UI thread). `rows` = [idle, appear, chaos] row
 * indexes (-1 when missing). On spawn `appear` plays once; then `chaos`
 * during Chaos Hour and for the first 20 s (full only), else `idle`.
 */
export function encounterPose(t: number, age: number, rows: readonly number[], frames: number, fps: number,
  chaos: boolean, full: boolean): { row: number; frame: number } {
  'worklet';
  const idle = rows[0] >= 0 ? rows[0] : 0;
  const loop = Math.floor(Math.max(0, t) * fps) % frames;
  if (rows[1] >= 0 && age >= 0 && age < frames / fps) return { row: rows[1], frame: Math.min(frames - 1, Math.floor(age * fps)) };
  if (full && rows[2] >= 0 && (chaos || (age >= 0 && age < 20))) return { row: rows[2], frame: loop };
  return { row: idle, frame: loop };
}

/** Skid-fin sparks: 8 frames at 16 fps, sliding 80 pt/s for 1.5 s across the encounter (MAP_FX_SPEC). */
export const SPARK_RUN_S = 1.5;
export const SPARK_SPEED_PT = 80;

/** Where a spark pass is at `age` seconds: offset from its start along its heading, frame, opacity. */
export function sparkPass(age: number, frames: number, fps: number): { d: number; frame: number; opacity: number } {
  'worklet';
  if (age < 0 || age >= SPARK_RUN_S) return { d: 0, frame: 0, opacity: 0 };
  const fade = Math.min(1, age / 0.15, (SPARK_RUN_S - age) / 0.25);
  return { d: age * SPARK_SPEED_PT, frame: Math.floor(age * fps) % Math.max(1, frames), opacity: fade };
}

/** Lagoon Glow-Down: the start (ms) of the show performance running now, or null. */
export function activeShowStart(times: readonly string[] | null | undefined, serverNowMs: number, windowMs: number): number | null {
  for (const iso of times ?? []) {
    const start = Date.parse(iso);
    if (Number.isFinite(start) && serverNowMs >= start && serverNowMs < start + windowMs) return start;
  }
  return null;
}

/* ── Window flicker timelines (MAP_FX_SPEC section 2, Haunts) ─────────── */

/** Seconds a timeline covers before it repeats. */
export const WINDOW_PERIOD_S = 90;
const STEP_S = 0.01;

/**
 * Toggle times (seconds) per window over one period, every window starting
 * lit. Steady holds of 2 to 9 s, then bursts of 2 to 4 toggles (off 40 to
 * 120 ms, on 60 to 200 ms); about 1 burst in 6 ends dark for 1 to 4 s. At
 * least one window is always lit, and a survived haunt never goes fully dark.
 */
export function windowTimelines(seed: number, windows: number): number[][] {
  const n = Math.max(0, Math.min(8, Math.floor(windows)));
  const steps = Math.round(WINDOW_PERIOD_S / STEP_S);
  const lit: Uint8Array[] = [];
  for (let w = 0; w < n; w++) {
    const on = new Uint8Array(steps).fill(1);
    let k = 0;
    let t = randAt(seed, w * 1000) * 6;
    const r = () => randAt(seed, w * 1000 + ++k);
    while (t < WINDOW_PERIOD_S) {
      t += 2 + r() * 7; // steady hold
      const toggles = 2 + Math.floor(r() * 3);
      for (let i = 0; i < toggles && t < WINDOW_PERIOD_S; i++) {
        const off = 0.04 + r() * 0.08;
        fill(on, t, t + off, 0);
        t += off + 0.06 + r() * 0.14;
      }
      if (r() < 1 / 6) {
        const dark = 1 + r() * 3;
        fill(on, t, t + dark, 0);
        t += dark;
      }
    }
    lit.push(on);
  }
  // Never all dark: the first window covers any gap.
  if (n > 0) {
    for (let s = 0; s < steps; s++) {
      let any = 0;
      for (let w = 0; w < n; w++) any |= lit[w][s];
      if (!any) lit[0][s] = 1;
    }
  }
  return lit.map(on => {
    const toggles: number[] = [];
    for (let s = 1; s < steps; s++) if (on[s] !== on[s - 1]) toggles.push(round3(s * STEP_S));
    return toggles;
  });
}

function fill(on: Uint8Array, from: number, to: number, v: number) {
  const a = Math.max(0, Math.round(from / STEP_S));
  const b = Math.min(on.length, Math.round(to / STEP_S));
  for (let i = a; i < b; i++) on[i] = v;
}

/** Whether a window is lit at time t (seconds), from its toggle list. UI thread. */
export function timelineLit(toggles: readonly number[], t: number): boolean {
  'worklet';
  const x = ((t % 90) + 90) % 90;
  let lo = 0;
  let hi = toggles.length - 1;
  let count = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (toggles[mid] <= x) { count = mid + 1; lo = mid + 1; } else hi = mid - 1;
  }
  return count % 2 === 0;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/* ── Image cache ──────────────────────────────────────────────────────── */

export const IMAGE_RETRY_MS = 60_000;

export interface ImageCache<T> {
  /** The loaded image, or null while loading, failed or unknown. Starts a load when needed. */
  get(url: string): T | null;
  /** The loaded image without starting a load. */
  peek(url: string): T | null;
  subscribe(listener: () => void): () => void;
  /** Loads started so far (tests). */
  loads(): number;
}

/**
 * One loader per URL for the whole app: every marker asking for the same
 * sheet shares one fetch and one decoded image. A failure is retried at most
 * once a minute (no fetch storm on a bad connection).
 */
export function createImageCache<T>(load: (url: string) => Promise<T | null>, now: () => number = Date.now): ImageCache<T> {
  const images = new Map<string, T>();
  const pending = new Set<string>();
  const failedAt = new Map<string, number>();
  const listeners = new Set<() => void>();
  let started = 0;
  const notify = () => listeners.forEach(fn => fn());
  return {
    get(url) {
      const hit = images.get(url);
      if (hit) return hit;
      if (!url || pending.has(url)) return null;
      const failed = failedAt.get(url);
      if (failed !== undefined && now() - failed < IMAGE_RETRY_MS) return null;
      pending.add(url);
      started++;
      load(url).then(image => {
        pending.delete(url);
        if (image) { images.set(url, image); failedAt.delete(url); } else failedAt.set(url, now());
        notify();
      }, () => {
        pending.delete(url);
        failedAt.set(url, now());
        notify();
      });
      return null;
    },
    peek(url) {
      return images.get(url) ?? null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    loads: () => started,
  };
}
