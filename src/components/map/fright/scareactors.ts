/**
 * Fin-ister Nights scareactors: the human performers at the Fright Reefs and
 * the Lantern Star encounter (art MANIFEST "Scareactors", MAP_FX_SPEC critter
 * timing). Pure, unit tested; the pose and facing functions run on the UI
 * thread every ambient clock step.
 *
 * Sheets: 4 rows x 10 frames of 128 px at 10 fps. Rows are idle, lurk, scare
 * (a lunge-jump that starts and ends hidden in fog) and slide (a knee slide
 * with sparks, no fog). `slide_ok: false` (swamp, ghost and stilt characters)
 * means the slide row never plays. The server names each reef's cast in
 * `fx.scareactors` and ships only the current park's sheets.
 */
import type { FrightAssets, FrightEncounter, FrightFx, FrightSheetAsset } from '../../../api/endpoints/fright/types';
import { hash01 } from '../alive/ambientBudget';
import { faceToward, reefReaction } from './critters';
import { rowIndex } from './frightAssets';

/* ── Lookups ──────────────────────────────────────────────────────────── */

/** A scareactor's sheet by slug (null: unknown slug or unusable entry; nothing draws). */
export function scareactorAsset(assets: FrightAssets | null | undefined, slug: string | null | undefined): FrightSheetAsset | null {
  const a = slug ? assets?.scareactors?.[slug] : null;
  return a && (a.sheet || a.static) && validFrame(a.frame) ? a : null;
}

function validFrame(frame: readonly number[] | null | undefined): boolean {
  return !!frame && frame.length === 2 && frame[0] > 0 && frame[1] > 0;
}

/** A reef's cast in order (fx.scareactors), blanks and repeats dropped. */
export function reefCast(fx: Pick<FrightFx, 'scareactors'> | null | undefined): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(fx?.scareactors) ? fx!.scareactors! : []) {
    const slug = typeof raw === 'string' ? raw.trim() : '';
    if (slug && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/**
 * The encounter's performer: the server's `scareactor`, else the manifest's
 * Lantern Star map (chuckles and riptide to their human slugs). Null: nothing
 * to draw but the ring.
 */
export function encounterScareactor(assets: FrightAssets | null | undefined,
  encounter: Pick<FrightEncounter, 'critter' | 'scareactor'> | null | undefined): string | null {
  if (!encounter) return null;
  if (typeof encounter.scareactor === 'string' && encounter.scareactor) return encounter.scareactor;
  return assets?.lantern_star?.[encounter.critter] ?? null;
}

/**
 * Every sheet URL the current payload can draw (the server already limits it
 * to this park's cast): the prefetch list for the disk cache.
 */
export function castUrls(assets: FrightAssets | null | undefined): string[] {
  const out: string[] = [];
  for (const a of Object.values(assets?.scareactors ?? {})) {
    for (const url of [a?.static, a?.sheet]) if (typeof url === 'string' && url && !out.includes(url)) out.push(url);
  }
  return out;
}

/* ── Rows ─────────────────────────────────────────────────────────────── */

/**
 * Row indexes [idle, lurk, scare, slide] (-1 when a sheet lacks one). The
 * slide row is -1 unless the manifest says `slide_ok: true`.
 */
export function scareactorRows(asset: Pick<FrightSheetAsset, 'rows' | 'slide_ok'>): number[] {
  return [rowIndex(asset, 'idle'), rowIndex(asset, 'lurk'), rowIndex(asset, 'scare'), asset.slide_ok === true ? rowIndex(asset, 'slide') : -1];
}

/**
 * The encounter's rows [idle, appear, chaos]: it appears with the scare row
 * (out of the fog and back, then idle) and loops the knee slide during Chaos
 * Hour and the first 20 s, or the lurk when the performer may not slide.
 */
export function encounterRows(asset: Pick<FrightSheetAsset, 'rows' | 'slide_ok'>): number[] {
  const [idle, lurk, scare, slide] = scareactorRows(asset);
  return [idle, scare, slide >= 0 ? slide : lurk];
}

/* ── Timing (MAP_FX_SPEC, Fright Reefs) ───────────────────────────────── */

/** Idle hold before each lurk, seconds (uniform per performer). */
export const LURK_GAP_MIN_S = 6;
export const LURK_GAP_MAX_S = 14;
/** Share of lurk turns that become a knee slide (full tier, slide_ok only). */
export const SLIDE_SHARE = 0.25;

export interface ScarePose {
  readonly row: number;
  readonly frame: number;
}

/**
 * Which frame of a scareactor sheet plays at ambient time t. Idle by default;
 * every 6 to 14 s (per performer) a lurk for 1 or 2 loops, or about 1 turn in
 * 4 a knee slide (one loop) when the sheet may slide. Lite plays idle and the
 * jump only. `jumpAge` >= 0 plays the scare row once from its first frame,
 * then cuts back to idle (the row ends hidden in fog). `rows` come from
 * scareactorRows.
 */
export function scareactorPose(seed: number, t: number, frames: number, fps: number, rows: readonly number[],
  full: boolean, jumpAge: number): ScarePose {
  'worklet';
  const idle = rows[0] >= 0 ? rows[0] : 0;
  const loop = frames / fps;
  if (rows[2] >= 0 && jumpAge >= 0 && jumpAge < loop) {
    return { row: rows[2], frame: Math.min(frames - 1, Math.floor(jumpAge * fps)) };
  }
  const idleFrame = Math.floor(t * fps + hash01(seed * 7 + 2) * frames) % frames;
  if (!full || rows[1] < 0) return { row: idle, frame: idleFrame };
  const turn = lurkTurn(seed, loop);
  const c = (t + turn.offset) % turn.period;
  if (c < turn.gap) return { row: idle, frame: idleFrame };
  const k = Math.floor((t + turn.offset) / turn.period);
  const into = c - turn.gap;
  const slides = rows[3] >= 0 && hash01(seed * 13 + k * 7 + 1) < SLIDE_SHARE;
  if (slides) {
    // One slide loop, then idle until the next turn.
    if (into < loop) return { row: rows[3], frame: Math.min(frames - 1, Math.floor(into * fps)) };
    return { row: idle, frame: idleFrame };
  }
  return { row: rows[1], frame: Math.floor(into * fps) % frames };
}

/** A performer's lurk turn: the idle gap (6 to 14 s), the lurk loops (1 or 2) and the full period. */
export function lurkTurn(seed: number, loop: number): { gap: number; loops: number; period: number; offset: number } {
  'worklet';
  const gap = LURK_GAP_MIN_S + (LURK_GAP_MAX_S - LURK_GAP_MIN_S) * hash01(seed * 7 + 4);
  const loops = hash01(seed * 7 + 3) < 0.5 ? 1 : 2;
  const period = gap + loops * loop;
  return { gap, loops, period, offset: hash01(seed * 7 + 5) * period };
}

/* ── Facing ───────────────────────────────────────────────────────────── */

/** The art faces right; scaleX -1 mirrors it. */
export type Face = 1 | -1;

/**
 * Which way a reef's cast turns: toward the player within 60 m of the reef
 * (or inside it), else 0 (each performer keeps its resting side).
 */
export function watchSide(distanceM: number, radiusM: number, bearingToPlayer: number, mapHeading: number | null | undefined): 0 | Face {
  return reefReaction(distanceM, radiusM) === 'ignore' ? 0 : faceToward(bearingToPlayer, mapHeading);
}

/** A performer's resting side when nobody is near (seeded, so a reef is never all mirrored). */
export function restFace(seed: number): Face {
  return hash01(seed * 11 + 7) < 0.5 ? -1 : 1;
}

/**
 * The facing to draw now: flips only on an idle frame (never mid-lurk,
 * mid-jump or mid-slide); otherwise it holds the current side.
 */
export function nextFace(current: number, watch: number, rest: number, row: number, idleRow: number): number {
  'worklet';
  const want = watch !== 0 ? watch : rest;
  return row === idleRow ? want : current;
}

/* ── Layout ───────────────────────────────────────────────────────────── */

/**
 * Where performer `index` of `slots` stands, in points from the reef center
 * (east right, south down). They spread around the reef on a flat ellipse
 * (reads as ground) and stand still: humans gliding while idle look wrong.
 */
export function scareactorSpot(seed: number, index: number, slots: number, wander: number): { x: number; y: number } {
  const n = Math.max(1, slots);
  const r = Math.max(0, wander) * (0.45 + 0.4 * hash01(seed * 3 + 1));
  const ang = (index / n) * Math.PI * 2 + hash01(seed * 3 + 3) * 0.9;
  return { x: Math.round(Math.cos(ang) * r * 10) / 10, y: Math.round(Math.sin(ang) * r * 0.6 * 10) / 10 };
}
