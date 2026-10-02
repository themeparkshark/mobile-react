/**
 * The arena's world camera (design v7.1 11.3), pure and worklet-safe so the
 * capture checks and tests can read the same numbers the arena draws with.
 *
 * Loom 1.0 -> 1.12 is the boss rig's own scale (BossArena); this is the world
 * group: pin pull-back to 0.92 on the row, Break push-in 1.16 / 1.19 / 1.22 on
 * the face, Final Pop 1.18 on the impact point, and the foreground slide (fg).
 */
import type { ArenaLayout, BossView } from './view';
import type { Pres } from './BossArena';

function c01(x: number): number {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function inQuad(x: number): number {
  'worklet';
  const t = c01(x);
  return t * t;
}
function outQuad(x: number): number {
  'worklet';
  const t = c01(x);
  return 1 - (1 - t) * (1 - t);
}

/** Break push-in peak per Break (design 6.2). */
export function breakPush(n: number): number {
  'worklet';
  return 1 + 0.13 + 0.03 * Math.min(3, Math.max(1, n));
}
export const PIN_ZOOM = 0.92;
export const FINAL_ZOOM = 1.18;

export interface WorldCam { z: number; ox: number; oy: number; fg: number }

/** Pure camera state for the world group at bout time `now` / fx time `f` (also used by the capture check). */
export function worldCamAt(L: ArenaLayout, v: BossView, pr: Pres, now: number, f: number, breakAt: number, breakN: number,
  finalAt: number, finalGrade: number, finalLane: number, reduced: boolean): WorldCam {
  'worklet';
  if (reduced) return { z: 1, ox: L.W / 2, oy: L.targetY, fg: 0 };
  // Break push-in on the face: 160 in, hold 300, out 260.
  if (breakAt >= 0 && f >= breakAt && f < breakAt + 720) {
    const e = f - breakAt;
    const k = e < 160 ? outQuad(e / 160) : e < 460 ? 1 : 1 - inQuad((e - 460) / 260);
    const peak = breakPush(breakN) - 1;
    return { z: 1 + peak * k, ox: L.bossX, oy: L.bossY + L.bossSize * 0.08, fg: k };
  }
  // Final Pop: 1.18 on the impact point after the anchor drop (220 ms), hold, out.
  if (finalAt >= 0 && finalGrade >= 2 && f >= finalAt + 200 && f < finalAt + 1000) {
    const e = f - finalAt - 200;
    const k = e < 160 ? outQuad(e / 160) : e < 500 ? 1 : 1 - inQuad((e - 500) / 300);
    return { z: 1 + (FINAL_ZOOM - 1) * k, ox: L.laneX[finalLane >= 0 && finalLane <= 2 ? finalLane : 1], oy: L.targetY - 40, fg: k };
  }
  // Pin pull-back: 1.0 -> 0.92 in 90 ms on the slam frame, held through the opening, back over 300 ms on close-up.
  if (pr.pinKind !== 1 && now >= pr.pinStart && now < pr.pinEnd + 60) {
    const k = now < pr.pinStart + 90 ? outQuad((now - pr.pinStart) / 90) : now > pr.pinEnd - 300 ? 1 - outQuad((now - (pr.pinEnd - 300)) / 300) : 1;
    return { z: 1 - (1 - PIN_ZOOM) * k, ox: L.W / 2, oy: L.targetY, fg: 0.4 * k };
  }
  // Anticipation: the foreground slides in with the loom.
  let fg = 0;
  if (v.aOn && v.steps.length > 0) {
    const I = v.steps[v.step * 3 + 1];
    const T = Math.max(v.aT, I - v.aW);
    if (now >= T && now < I + 200) fg = now < I ? inQuad((now - T) / Math.max(1, I - T)) : 1 - (now - I) / 200;
  }
  return { z: 1, ox: L.W / 2, oy: L.targetY, fg: 0.5 * fg };
}

