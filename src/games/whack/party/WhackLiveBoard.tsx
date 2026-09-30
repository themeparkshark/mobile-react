/**
 * WhackLiveBoard: one player's board in a live Line Party "Whack Rush" round.
 *
 * Everyone in the line plays the same seeded Bonk Rush Burst at the same GO,
 * each on their own board. This is the full Whack presentation (one Skia
 * canvas, perspective holes, pose-to-pose Finns, QUICK rings, the shared juice
 * layer) driven by the room's board clock instead of a solo game clock:
 *
 * - The sim runs on the UI thread and resolves touch-downs in the same frame.
 *   Every logged tap is echoed to the PartyClient with its sim stamp, so the
 *   tap log the server replays is exactly what the player saw scored.
 * - Every 100 ms the board compares its sim time with the client's board clock
 *   and nudges itself back on it (a dropped frame never desyncs a seat).
 * - A personal HOLD (pause button, app in the background) stops only this
 *   board; the 3-2-1 and the ghost hand-off belong to the PartyClient.
 * - No Auto Look-Up, no global freezes, no slow-mo: the room never stops.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { FxStage, type FxStageHandle } from '../../../gamekit/fx/FxStage';
import { useCamera } from '../../../gamekit/fx/useCamera';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../../gamekit/audio/studioLibrary';
import { playHaptic } from '../../../gamekit/Haptics';
import { forEachEvent } from '../../../gamekit/core/eventRing';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import type { WhackTheme } from '../assets';
import { createSim } from '../sim';
import type { Timeline } from '../timeline';
import { computeLayout, type BoardLayout } from '../render/layout';
import { boxesFor } from '../render/boxes';
import { WhackBoard, useBoardImages } from '../render/WhackBoard';
import { E_TAPLOG, useWhackRuntime } from '../useWhackRuntime';
import { pickCue, useWhackCues, useWhackJuice } from '../useWhackJuice';
import { useGameMusic } from '../../../gamekit/audio/useGameMusic';

registerStudioAudio(['whack']);

export interface WhackLiveBoardProps {
  /** The shared board (PartyClient builds it from the round seed with the registered sim). */
  board: Timeline;
  /** perfNow ms of this board's GO. */
  goAt: number;
  durationMs: number;
  perfNow: () => number;
  /** The client's board clock: ms since GO, frozen during my HOLD. */
  boardClock: () => number | null;
  /** My board is on HOLD (only mine). */
  held: boolean;
  /** Log a touch-down with its sim stamp (PartyClient.recordTapAt). */
  recordTap: (boardMs: number, hole: number) => number | null;
  onProgress?: (score: number, streak: number) => void;
  onTick?: (boardMs: number, score: number) => void;
  /** Dev-only demo hands for recorded proof runs. */
  autoplay?: boolean;
  theme?: WhackTheme;
}

const DRIFT_MS = 25;
const NUDGE_CAP_MS = 250;

export default function WhackLiveBoard({
  board, goAt, durationMs, perfNow, boardClock, held, recordTap, onProgress, onTick, autoplay, theme = 'park',
}: WhackLiveBoardProps) {
  const reducedMotion = useReducedGameMotion();
  const fx = useRef<FxStageHandle>(null);
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const L: BoardLayout | null = useMemo(() => (field ? computeLayout(field.w, field.h, theme, { topFrac: 0.17 }) : null), [field, theme]);
  const Lref = useRef<BoardLayout | null>(null);
  Lref.current = L;
  const geo = useSharedValue<BoardLayout>(computeLayout(390, 520, theme, { topFrac: 0.17 }));
  const boxes = useSharedValue<number[][]>(boxesFor(theme));
  useEffect(() => { if (L) geo.value = L; }, [L, geo]);
  useEffect(() => { boxes.value = boxesFor(theme); }, [theme, boxes]);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);

  const cues = useWhackCues(true);
  const camera = useCamera({ width: field?.w ?? 390, height: field?.h ?? 520, timeScale: undefined, reducedMotion, walking: false });
  const onEventsRef = useRef<(batch: number[]) => void>(() => undefined);
  const onEvents = useCallback((batch: number[]) => onEventsRef.current(batch), []);
  const runtime = useWhackRuntime({ geo, boxes, onEvents });
  const [fever, setFever] = useState(false);
  const juice = useWhackJuice({
    fx, camera, cues, runtime, layout: Lref, width: field?.w ?? 390, reducedMotion, walking: false, party: true, onFever: setFever,
  });
  const recordRef = useRef(recordTap);
  recordRef.current = recordTap;

  onEventsRef.current = (batch) => {
    const now = Date.now();
    forEachEvent(batch, (kind, a, b, c, t) => {
      if (kind === E_TAPLOG) {
        recordRef.current(t, a);
        return;
      }
      juice.handle(kind, a, b, c, now);
    });
  };

  // GO on the room's clock (late phones start at once and catch up through the nudge).
  const started = useRef(false);
  useEffect(() => {
    runtime.rt.value.reducedMotion = reducedMotion;
  }, [reducedMotion, runtime.rt]);
  useEffect(() => {
    started.current = false;
    const go = () => {
      if (started.current) return;
      started.current = true;
      juice.reset(0);
      runtime.start(createSim(board), !!autoplay, true);
      const late = Math.round(perfNow() - goAt);
      if (late > 0) runtime.nudge(Math.min(late, durationMs));
      GameAudio.play(cues.start, { volume: 0.7 });
      playHaptic('tick');
    };
    const wait = goAt - perfNow();
    const h = setTimeout(go, Math.max(0, wait));
    return () => {
      clearTimeout(h);
      runtime.setRunning(false);
    };
    // The board, seed and GO define a round; nothing else restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, goAt]);

  // My HOLD freezes only my board.
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  useEffect(() => {
    if (!started.current) return;
    runtimeRef.current.setRunning(!held);
  }, [held]);

  // Stay on the board clock; feed the room HUD; last-3s pips. One interval for the
  // whole round: everything it reads comes through refs (the runtime handle and
  // the parent's callbacks change identity on every render).
  const live = useRef({ runtime, boardClock, held, onTick, onProgress });
  live.current = { runtime, boardClock, held, onTick, onProgress };
  useEffect(() => {
    let lastProgress = 0;
    let lastPip = -1;
    let endLogged = false;
    const iv = setInterval(() => {
      if (!started.current) return;
      const { runtime: rt, boardClock: clockNow, held: onHold } = live.current;
      const bt = clockNow();
      void rt.mirror().then((m) => {
        const cur = live.current;
        if (m.ended && !endLogged) {
          endLogged = true;
          if (__DEV__) console.log('[whack-rush] board final', { score: m.score, taps: m.taps.length / 3, t: m.t });
        }
        if (bt !== null && !onHold && !m.ended) {
          const drift = bt - m.t;
          if (Math.abs(drift) > DRIFT_MS) cur.runtime.nudge(Math.max(-NUDGE_CAP_MS, Math.min(NUDGE_CAP_MS, drift)));
        }
        const t = bt ?? m.t;
        cur.onTick?.(t, m.score);
        const now = Date.now();
        if (now - lastProgress > 250) {
          lastProgress = now;
          cur.onProgress?.(m.score, m.streak);
        }
        const left = Math.ceil((durationMs - t) / 1000);
        if (left <= 3 && left >= 1 && left !== lastPip && !onHold) {
          lastPip = left;
          GameAudio.play(cues.tick, { volume: 0.6 });
          playHaptic('tick');
        }
      });
    }, 100);
    return () => clearInterval(iv);
  }, [durationMs, cues]);

  // Chris's Whack loop edits: the intense bed for the race, the fever variant while fever runs.
  useGameMusic(fever ? pickCue('mus_whack_fever', 'chris.track1') : pickCue('mus_whack_intense', 'chris.track1'), { at: 'bar' });

  const images = useBoardImages(theme, null);
  const hud = useMemo(() => ({ burstLabel: 'WHACK RUSH', ride: false, feverOn: true, boss: false, notches: 0, compact: true }), []);
  const bossFx = useSharedValue({ rise: 0, flinch: 0, flash: 0, ghost: 1, sink: 0 });
  const pace = useSharedValue(0);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {L ? (
        <GestureDetector gesture={runtime.gesture}>
          <Animated.View style={[StyleSheet.absoluteFill, camera.style]}>
            <WhackBoard L={L} sim={runtime.sim} rs={runtime.rs} tick={runtime.tick} images={images} hud={hud}
              bossFx={bossFx} pace={pace} showPace={false} />
          </Animated.View>
        </GestureDetector>
      ) : null}
      {L ? <FxStage ref={fx} width={L.w} height={L.h} timeScale={runtime.clock.fxScale} reducedMotion={reducedMotion} capacity={120}
        onArrive={(n) => { for (let k = 0; k < n; k++) setTimeout(() => GameAudio.playLadder(cues.coinTick, Math.min(12, k)), k * 20); playHaptic('tick'); }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
