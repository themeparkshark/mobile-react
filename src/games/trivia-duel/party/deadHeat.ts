/**
 * DEAD HEAT (design 4.8, live Line Party rooms only, S3). Rev 7 cut it from
 * every other mode: vs Fin, ghosts and Huddle settle simultaneous buzzes by
 * the lower scored time. In a live room a second buzz within 200ms makes both
 * pick blind within 3.5s: correct beats wrong; both correct, the lower answer
 * time takes 150 + speed (its buzz time) and the other a flat 75; a wrong or
 * missing blind pick costs 50 (0 with a Shield).
 */
import { POINTS } from '../engine/config';
import { buzzPoints, type SpeedMods } from '../engine/scoring';

export const DEAD_HEAT = { windowMs: 200, pickMs: 3500, second: 75, wrong: -50 } as const;

export interface DeadHeatSide {
  correct: boolean;
  answerMs: number;
  buzzMs: number;
  streakAfter: number;
  shield: boolean;
  mods?: SpeedMods;
}

export function isDeadHeat(aMs: number, bMs: number): boolean {
  return aMs >= 0 && bMs >= 0 && Math.abs(aMs - bMs) <= DEAD_HEAT.windowMs;
}

export function deadHeatPoints(a: DeadHeatSide, b: DeadHeatSide): { a: number; b: number; winner: 'a' | 'b' | 'none' } {
  const win = (x: DeadHeatSide) => buzzPoints(true, x.buzzMs, x.streakAfter, false, x.mods ?? {});
  const lose = (x: DeadHeatSide) => (x.shield ? 0 : DEAD_HEAT.wrong);
  if (a.correct && b.correct) {
    const aFirst = a.answerMs < b.answerMs || (a.answerMs === b.answerMs && a.buzzMs <= b.buzzMs);
    return aFirst ? { a: win(a), b: DEAD_HEAT.second, winner: 'a' } : { a: DEAD_HEAT.second, b: win(b), winner: 'b' };
  }
  if (a.correct) return { a: win(a), b: lose(b), winner: 'a' };
  if (b.correct) return { a: lose(a), b: win(b), winner: 'b' };
  return { a: lose(a), b: lose(b), winner: 'none' };
}

/** Base points a live-room buzz is worth before the multiplier (for the room's bell display). */
export const LIVE_BUZZ_BASE = POINTS.buzzBase;
