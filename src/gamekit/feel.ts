/**
 * feel.ts: one call fires sound, haptic, hit-stop, camera and FX together.
 *
 * The studio's feel grammar lives in a table per game, so a QUICK hit is the
 * same bundle everywhere it happens and audio/haptic/visual land on the same
 * frame (the design rule every game shares):
 *
 *   const feel = useFeel({
 *     late:  { sfx: 'wh_bonk', ladder: true, haptic: 'lateHit', burst: [{ emitter: 'glints' }], flyUp: { size: 'sm' } },
 *     quick: { sfx: 'wh_bonk', ladder: true, haptic: 'quickHit', localStop: 65,
 *              burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 10 }],
 *              ring: { color: '#ffcf3b', to: 80 }, flyUp: { size: 'lg', color: '#ffcf3b' } },
 *     golden:{ sfx: 'wh_golden_hit', haptic: 'golden', hitStop: 110, hitStopSim: true, slowMo: [0.35, 280, 120],
 *              burst: [{ emitter: 'speedLines' }, { emitter: 'coins', magnet: true }], vignette: { color: '#ffcf3b', peak: 0.35 } },
 *   }, { fx: fxRef, camera, clock, width });
 *   feel('quick', { x, y, step: combo, text: 'QUICK +150', slot: hole });
 *
 * Audio pans by x when the backend supports it (spatial tells), ladder cues
 * climb with `step`, and haptics use the grammar scheduler (tells outrank
 * reactions, rival-caused feel is dropped).
 */

import { useCallback, useRef, type RefObject } from 'react';
import type { EmitterName } from './core/particles';
import { GameAudio } from './audio/GameAudio';
import { playHaptic, HP, type HapticPatternName } from './Haptics';
import type { FxStageHandle, FlyUpOptions } from './fx/FxStage';
import type { CameraRig } from './fx/useCamera';
import type { GameClockHandle } from './useGameClock';
import { govFlash, govHitStop, govPunch, govShake, type FxGovernor } from './core/fxGovernor';

export interface FeelBurst {
  emitter: EmitterName;
  count?: number;
  color?: number;
  speed?: number;
  size?: number;
  angle?: number;
  spread?: number;
  /** Magnetize to `magnetTo` (e.g. the HUD coin counter). */
  magnet?: boolean;
}

export interface FeelDef {
  sfx?: string;
  /** Use at.step to pick a pitch-ladder file. */
  ladder?: boolean;
  volume?: number;
  pitch?: number;
  /** Pan by x across the play field (-0.6..0.6 by default). */
  spatial?: boolean | number;
  haptic?: HapticPatternName;
  /** HP.telegraph, HP.critical, HP.rival ... */
  priority?: number;
  tell?: boolean;
  /** Global presentation hit-stop (ms). */
  hitStop?: number;
  /** Also hold gameplay time (golden freeze). */
  hitStopSim?: boolean;
  forceStop?: boolean;
  /** Local hit-stop for at.slot (ms). */
  localStop?: number;
  /** [scale, holdMs, easeMs] */
  slowMo?: [number, number, number];
  /** Camera trauma (0..1), directional if at.dx/dy given. */
  shake?: number;
  punch?: number;
  kick?: number;
  burst?: FeelBurst[];
  ring?: { color?: string; from?: number; to?: number; ms?: number };
  flash?: { color?: string; peak?: number; ms?: number };
  bloom?: { color?: string; radius?: number; peak?: number; ms?: number };
  vignette?: { color?: string; peak?: number; inMs?: number; holdMs?: number; outMs?: number };
  flyUp?: FlyUpOptions & { dy?: number };
  /** Duck music (dB) for this moment. */
  duckDb?: number;
  /** Governor priority (higher wins stacked flashes, stops and punches). */
  prio?: number;
  /** KO / round end: bypass the governor's gaps and budgets. */
  force?: boolean;
  /** Anything bespoke (sprite swaps, banners). Runs last. */
  custom?: (at: FeelAt) => void;
}

export interface FeelAt {
  x?: number;
  y?: number;
  /** Knockback / touch-to-target direction for directional shake/kick. */
  dx?: number;
  dy?: number;
  /** Ladder step (combo count, chain). */
  step?: number;
  /** Local hit-stop slot (hole / lane). */
  slot?: number;
  /** Fly-up text. */
  text?: string;
  /** Magnet target (HUD). */
  magnetTo?: { x: number; y: number };
  /** Rival-caused: skip haptics entirely. */
  rival?: boolean;
}

export interface FeelDeps {
  fx?: RefObject<FxStageHandle | null>;
  camera?: CameraRig | null;
  clock?: GameClockHandle | null;
  /** Field width for spatial panning. */
  width?: number;
  /** Walking or reduced motion: skip camera moves. */
  calm?: boolean;
  /**
   * Optional FX governor (core/fxGovernor): gates full-frame flashes (a denied
   * flash becomes a localized bloom), budgets global hit-stops, merges shakes
   * and keeps punches away from shakes. Create one per game with createFxGovernor().
   */
  governor?: FxGovernor | null;
  /** Clock for the governor (default Date.now). */
  now?: () => number;
}

export type FeelFire<K extends string> = (name: K, at?: FeelAt) => void;

export function fireFeel(def: FeelDef, at: FeelAt, deps: FeelDeps): void {
  const x = at.x ?? 0;
  const y = at.y ?? 0;
  // 1. Sound and haptic first: they must not wait on anything else.
  if (def.sfx) {
    const span = typeof def.spatial === 'number' ? def.spatial : 0.6;
    const pan = def.spatial && deps.width ? ((x / deps.width) * 2 - 1) * span : 0;
    const opts = { volume: def.volume, pitch: def.pitch, pan };
    if (def.ladder && at.step !== undefined) GameAudio.playLadder(def.sfx, at.step, opts);
    else GameAudio.play(def.sfx, opts);
  }
  if (def.haptic && !at.rival) {
    playHaptic(def.haptic, { priority: def.priority ?? (def.tell ? HP.telegraph : HP.own), tell: def.tell });
  }
  if (def.duckDb) GameAudio.duck(def.duckDb, 40, 250, 300);
  const gov = deps.governor;
  const now = gov ? (deps.now ? deps.now() : Date.now()) : 0;
  const prio = def.prio ?? 0;
  const force = !!(def.force || def.forceStop);
  // 2. Time.
  if (deps.clock) {
    const stop = def.hitStop && gov ? govHitStop(gov, now, def.hitStop, prio, force) : def.hitStop;
    if (stop) deps.clock.hitStop(stop, { holdSim: def.hitStopSim, force: def.forceStop });
    if (def.localStop && at.slot !== undefined) deps.clock.localStop(at.slot, def.localStop);
    if (def.slowMo) deps.clock.slowMo(def.slowMo[0], def.slowMo[1], def.slowMo[2]);
  }
  // 3. Camera (skipped while calm: walking / reduced motion handled in rig too).
  if (deps.camera && !deps.calm) {
    const trauma = def.shake && gov ? govShake(gov, now, def.shake) : def.shake;
    if (trauma) deps.camera.shake(trauma, at.dx ?? 0, at.dy ?? 0);
    if (def.punch && (!gov || govPunch(gov, now, prio, force))) deps.camera.punch(def.punch);
    if (def.kick && (at.dx || at.dy)) {
      const len = Math.hypot(at.dx ?? 0, at.dy ?? 0) || 1;
      deps.camera.kick(((at.dx ?? 0) / len) * def.kick, ((at.dy ?? 0) / len) * def.kick);
    }
  }
  // 4. FX.
  const fx = deps.fx?.current;
  if (fx) {
    def.burst?.forEach((b) => fx.burst(b.emitter, x, y, {
      count: b.count, color: b.color, speed: b.speed, size: b.size, angle: b.angle, spread: b.spread,
      ...(b.magnet && at.magnetTo ? { tx: at.magnetTo.x, ty: at.magnetTo.y } : {}),
    }));
    if (def.ring) fx.ring(x, y, def.ring);
    if (def.flash) {
      const peak = gov ? govFlash(gov, now, def.flash.peak ?? 0.35, prio, force) : (def.flash.peak ?? 0.35);
      if (peak > 0) fx.flash({ ...def.flash, peak });
      else if (!def.bloom) fx.bloom(x, y, { color: def.flash.color, radius: 140, peak: 0.6 });
    }
    if (def.bloom) fx.bloom(x, y, def.bloom);
    if (def.vignette) fx.vignette(def.vignette);
    if (def.flyUp && at.text) fx.flyUp(at.text, x, y + (def.flyUp.dy ?? -24), def.flyUp);
  }
  def.custom?.(at);
}

/** Hook form: a stable fire(name, at) bound to the latest table and deps. */
export function useFeel<T extends Record<string, FeelDef>>(table: T, deps: FeelDeps): FeelFire<Extract<keyof T, string>> {
  const tableRef = useRef(table);
  tableRef.current = table;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  return useCallback((name: Extract<keyof T, string>, at: FeelAt = {}) => {
    const def = tableRef.current[name];
    if (def) fireFeel(def, at, depsRef.current);
  }, []);
}
