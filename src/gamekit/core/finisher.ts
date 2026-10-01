/**
 * finisher.ts: the "final blow" camera (Peggle's Extreme Fever beat) as a
 * pure, data-driven cue plan every game shares.
 *
 * Designs:
 *   - Whack Final Bonk (boss defeat, Champ KO, ride win): 160 ms freeze,
 *     0.25x for 700 ms, push-in 1.10 inOutCubic, impact frame, 3 ring
 *     shockwaves 150 ms apart, confetti (60 boss / 24 Champ or ride), the win
 *     stinger, music -8 dB under the swell. Shake only for the boss.
 *   - Trivia match-deciding correct: 0.4x for 900 ms, SINGLE 1.6 push, a
 *     brand-colour sunburst, a confetti cannon, the win stinger on the half-beat.
 *   - Banana extreme finish: 0.25 timescale with a 1.3 close-up, 60 confetti.
 *   - Sharky Ride Gate: 0.4 slow-mo for 300 ms, push 1.15.
 *   - Boss Final Pop: 220 ms whole-arena freeze, 1.18x zoom, 200 ms slow-mo.
 *   - Rhythm Finale BIG: hold 80 ms, zoom 1.06 in 120 ms and spring back,
 *     5 px / 140 ms shake, 3 bursts of 48.
 *
 * finisherPlan() returns time-sorted cues; fx/useFinisher plays them through
 * the clock, camera, FX stage, stamps, audio and haptics. Reduced motion keeps
 * the stamp, confetti (cut down) and stinger, and drops freeze, slow-mo,
 * push, shake and the impact frame. All times are wall ms from the trigger.
 */

export type FinisherCueKind =
  | 'freeze'
  | 'slowmo'
  | 'push'
  | 'release'
  | 'impact'
  | 'ring'
  | 'confetti'
  | 'sunburst'
  | 'shake'
  | 'stamp'
  | 'stinger'
  | 'duck'
  | 'haptic';

export interface FinisherCue {
  at: number;
  kind: FinisherCueKind;
  /** freeze/slowmo/duck: ms; push: zoom; ring: radius; confetti: count; shake: trauma; slowmo: scale. */
  a: number;
  /** slowmo: hold ms; duck: hold ms; push: ease-in ms. */
  b: number;
}

export interface FinisherPreset {
  freezeMs: number;
  slowScale: number;
  slowMs: number;
  push: number;
  pushInMs: number;
  /** When the push releases (ms from trigger). */
  releaseAt: number;
  impact: boolean;
  rings: number;
  ringGapMs: number;
  ringRadius: number;
  confetti: number;
  sunburst: boolean;
  shake: number;
  stamp: boolean;
  stinger: boolean;
  duckDb: number;
}

export const FINISHER_PRESETS = {
  bossDefeat: { freezeMs: 160, slowScale: 0.25, slowMs: 700, push: 1.1, pushInMs: 300, releaseAt: 1300, impact: true, rings: 3, ringGapMs: 150, ringRadius: 220, confetti: 60, sunburst: false, shake: 0.5, stamp: true, stinger: true, duckDb: 8 },
  rideWin: { freezeMs: 160, slowScale: 0.25, slowMs: 700, push: 1.1, pushInMs: 300, releaseAt: 1300, impact: true, rings: 3, ringGapMs: 150, ringRadius: 180, confetti: 24, sunburst: false, shake: 0, stamp: true, stinger: true, duckDb: 8 },
  matchPoint: { freezeMs: 0, slowScale: 0.4, slowMs: 900, push: 1.6, pushInMs: 220, releaseAt: 1400, impact: false, rings: 1, ringGapMs: 0, ringRadius: 160, confetti: 40, sunburst: true, shake: 0, stamp: true, stinger: true, duckDb: 6 },
  extremeFinish: { freezeMs: 0, slowScale: 0.25, slowMs: 600, push: 1.3, pushInMs: 200, releaseAt: 1100, impact: false, rings: 1, ringGapMs: 0, ringRadius: 140, confetti: 60, sunburst: false, shake: 0, stamp: true, stinger: true, duckDb: 6 },
  gateFinale: { freezeMs: 0, slowScale: 0.4, slowMs: 300, push: 1.15, pushInMs: 180, releaseAt: 700, impact: false, rings: 1, ringGapMs: 0, ringRadius: 160, confetti: 40, sunburst: false, shake: 0, stamp: true, stinger: false, duckDb: 0 },
  finalPop: { freezeMs: 220, slowScale: 0.5, slowMs: 200, push: 1.18, pushInMs: 160, releaseAt: 800, impact: true, rings: 1, ringGapMs: 0, ringRadius: 200, confetti: 0, sunburst: false, shake: 0.3, stamp: true, stinger: false, duckDb: 5 },
  finaleBig: { freezeMs: 80, slowScale: 1, slowMs: 0, push: 1.06, pushInMs: 120, releaseAt: 260, impact: false, rings: 3, ringGapMs: 120, ringRadius: 160, confetti: 48, sunburst: false, shake: 0.35, stamp: false, stinger: false, duckDb: 0 },
} satisfies Record<string, FinisherPreset>;

export type FinisherPresetName = keyof typeof FINISHER_PRESETS;

export function finisherPlan(p: FinisherPreset, reducedMotion = false): FinisherCue[] {
  const cues: FinisherCue[] = [];
  const add = (at: number, kind: FinisherCueKind, a = 0, b = 0) => cues.push({ at, kind, a, b });
  const motion = !reducedMotion;
  add(0, 'haptic');
  if (p.duckDb > 0) add(0, 'duck', p.duckDb, Math.max(400, p.freezeMs + p.slowMs));
  if (motion && p.freezeMs > 0) add(0, 'freeze', p.freezeMs);
  if (motion && p.impact) add(0, 'impact');
  if (motion && p.shake > 0) add(0, 'shake', p.shake);
  // Slow-mo starts as the freeze lets go.
  if (motion && p.slowMs > 0 && p.slowScale < 1) add(p.freezeMs, 'slowmo', p.slowScale, p.slowMs);
  if (motion && p.push > 1) {
    add(p.freezeMs, 'push', p.push, p.pushInMs);
    add(p.releaseAt, 'release');
  }
  for (let i = 0; i < p.rings; i++) add(p.freezeMs + i * p.ringGapMs, 'ring', p.ringRadius);
  if (p.sunburst) add(p.freezeMs, 'sunburst');
  if (p.stamp) add(p.freezeMs, 'stamp');
  if (p.confetti > 0) add(p.freezeMs + 60, 'confetti', reducedMotion ? Math.min(12, p.confetti) : p.confetti);
  // The stinger swells over 400 ms into the hero beat.
  if (p.stinger) add(p.freezeMs, 'stinger');
  return cues.sort((x, y) => x.at - y.at);
}

/** When the finisher hands over to the results (ms after the trigger). */
export function finisherDuration(p: FinisherPreset, reducedMotion = false): number {
  const plan = finisherPlan(p, reducedMotion);
  let end = 0;
  for (const c of plan) {
    const len = c.kind === 'freeze' ? c.a : c.kind === 'slowmo' ? c.b : 0;
    end = Math.max(end, c.at + len);
  }
  return Math.max(end, reducedMotion ? 400 : p.releaseAt);
}
