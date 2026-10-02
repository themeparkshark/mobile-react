/**
 * useFinisher: plays a core/finisher plan (Final Bonk cam, match point,
 * extreme finish, Final Pop, Finale BIG) through the engine's real systems.
 *
 *   const finisher = useFinisher({ clock, camera, fx, stamps, wave, sunburst, width, height,
 *     stinger: 'sting_whack_win', reducedMotion });
 *   const doneInMs = finisher.run('bossDefeat', { x, y, text: 'KNOCKOUT!' });
 *   setTimeout(showResults, doneInMs);
 *
 * Every cue is one engine call: clock.hitStop (forced, it is THE moment),
 * clock.slowMo, camera.frame + lean toward the impact, fx.flash (2-frame
 * impact frame), fx.ring + shockwave, confetti from both sides, the stamp,
 * the stinger with a music duck, and the finalBonk Core Haptics pattern.
 * `cancel()` stops pending cues (pause, wrap-up, unmount).
 */

import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { withTiming, type SharedValue } from 'react-native-reanimated';
import { GameAudio } from '../audio/GameAudio';
import { playPattern, HP } from '../Haptics';
import { FINISHER_PRESETS, finisherDuration, finisherPlan, type FinisherPreset, type FinisherPresetName } from '../core/finisher';
import type { AhapPatternName } from '../core/hapticPattern';
import type { FxStageHandle } from './FxStage';
import type { CameraRig } from './useCamera';
import type { GameClockHandle } from '../useGameClock';
import type { StampLayerHandle } from './StampLayer';
import type { ShockwaveHandle } from './ShaderFx';

export interface FinisherDeps {
  clock?: GameClockHandle | null;
  camera?: CameraRig | null;
  fx?: RefObject<FxStageHandle | null>;
  stamps?: RefObject<StampLayerHandle | null>;
  wave?: ShockwaveHandle | null;
  /** 0..1 shared value driving a <Sunburst intensity>. */
  sunburst?: SharedValue<number> | null;
  width: number;
  height: number;
  /** Stinger cue (studio or Chris bank id). */
  stinger?: string;
  haptic?: AhapPatternName;
  reducedMotion?: boolean;
}

export interface FinisherAt {
  x?: number;
  y?: number;
  text?: string;
  stampColor?: string;
}

export function useFinisher(deps: FinisherDeps) {
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cancel = useCallback(() => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    const d = depsRef.current;
    d.camera?.frame(1);
    d.camera?.lean(0, 0);
  }, []);

  useEffect(() => cancel, [cancel]);

  const run = useCallback((preset: FinisherPresetName | FinisherPreset, at: FinisherAt = {}): number => {
    cancel();
    const p = typeof preset === 'string' ? FINISHER_PRESETS[preset] : preset;
    const d = depsRef.current;
    const rm = !!d.reducedMotion;
    const x = at.x ?? d.width / 2;
    const y = at.y ?? d.height / 2;
    const plan = finisherPlan(p, rm);
    for (const cue of plan) {
      const fire = () => {
        const dd = depsRef.current;
        const fx = dd.fx?.current;
        switch (cue.kind) {
          case 'haptic':
            playPattern(dd.haptic ?? 'finalBonk', { priority: HP.critical });
            break;
          case 'duck':
            GameAudio.duck(cue.a, 60, cue.b, 400);
            break;
          case 'freeze':
            dd.clock?.hitStop(cue.a, { force: true });
            break;
          case 'slowmo':
            dd.clock?.slowMo(cue.a, cue.b, 180);
            break;
          case 'impact':
            fx?.flash({ color: '#ffffff', peak: 0.35, ms: 66 });
            break;
          case 'shake':
            dd.camera?.shake(cue.a);
            break;
          case 'push': {
            dd.camera?.frame(cue.a);
            // Lean toward the impact so the push lands on it.
            const lx = (x - dd.width / 2) * (cue.a - 1) * 0.8;
            const ly = (y - dd.height / 2) * (cue.a - 1) * 0.8;
            dd.camera?.lean(-lx, -ly);
            break;
          }
          case 'release':
            dd.camera?.frame(1);
            dd.camera?.lean(0, 0);
            break;
          case 'ring':
            fx?.ring(x, y, { color: '#ffffff', from: 16, to: cue.a, ms: 320 });
            dd.wave?.fire(x, y, { radius: cue.a * 1.2, strength: rm ? 0 : 9, ms: 420 });
            break;
          case 'sunburst':
            if (dd.sunburst) {
              dd.sunburst.value = withTiming(0.55, { duration: 200 });
              timers.current.push(setTimeout(() => {
                if (depsRef.current.sunburst) depsRef.current.sunburst.value = withTiming(0, { duration: 500 });
              }, 1200));
            }
            break;
          case 'stamp':
            if (at.text) dd.stamps?.current?.push(at.text, { x, y: Math.max(120, y - 70), style: 'fever', color: at.stampColor ?? '#ffcf3b', size: 44, priority: 9 });
            break;
          case 'confetti': {
            const half = Math.round(cue.a / 2);
            for (let side = 0; side < 2; side++) {
              const cx = side === 0 ? 24 : dd.width - 24;
              // Cannons from both edges, angled in toward the middle (degrees).
              fx?.burst('confetti', cx, dd.height * 0.72, { count: half, angle: side === 0 ? -62 : -118, spread: 34, speed: 1.35 });
            }
            break;
          }
          case 'stinger':
            if (dd.stinger) GameAudio.play(dd.stinger);
            break;
        }
      };
      if (cue.at <= 0) fire();
      else timers.current.push(setTimeout(fire, cue.at));
    }
    return finisherDuration(p, rm);
  }, [cancel]);

  return useMemo(() => ({ run, cancel }), [run, cancel]);
}
