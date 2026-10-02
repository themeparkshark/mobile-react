/**
 * ParadeBoard: Parade Beat inside a Line Party room (sim `parade_sprint`).
 *
 * The room hands every phone the same seed; this board builds the sprint
 * chart, starts the song on GO from the room clock and judges every touch on
 * the UI thread exactly like the solo game. Each judged input goes to the
 * party client at the same ms the judge used (recordAt), so the server's
 * sidecar replay lands on the same Duel Points this screen shows.
 *
 * The line is always moving: nothing here pauses for movement. A personal
 * HOLD (pause button or backgrounding) freezes the song and the board clock
 * together; on release the song picks up at the frozen board time, so no note
 * is voided and the replay stays continuous. Past the HOLD budget the client
 * hands the seat to the ghost.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, runOnUI, useFrameCallback, useSharedValue, type FrameInfo } from 'react-native-reanimated';
import { GameAudio, Haptic, drainEvents, forEachEvent, registerStudioAudio } from '../../../gamekit';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { stagePlayer, type StagePlayer } from '../audio/stagePlayer';
import { ParadeAudio } from '../audio/ParadeAudio';
import { playKeysound, registerKeysounds } from '../audio/keysounds';
import type { SongAnchor } from '../audio/SongPlayer';
import {
  EV_FEVER_END,
  EV_FEVER_START,
  EV_HIT,
  EV_MILESTONE,
  EV_MISS,
  EV_ROLL_TICK,
  EV_WRONG,
  createJudge,
  judgeDown,
  judgeMove,
  judgeTick,
  judgeUp,
  nextOpenSection,
  type JudgeState,
} from '../core/judge';
import { DEFAULT_GRIP, gripFor, zoneOf } from '../core/grip';
import { ACCURACY_VALUE, J_GOOD, J_GREAT, J_PERFECT, K_BIG, K_RIM, L_MARCH } from '../core/types';
import { ParadeField, fieldGeom } from '../field/ParadeField';
import { createDrawList, layoutFrame, beatAt } from '../field/layout';
import { applyEventsUI, createView, showRibbon, stepView, RB_FULL, RB_MARCH, type ParadeView } from '../field/view';
import { STAGES, type StageId } from '../stages';
import { botTaps, decodeTap, encodeTap, T_DOWN, T_MARCH, T_UP, type SprintBoard, type SprintProfile } from './paradeSprint';

export interface ParadeBoardProps {
  board: SprintBoard;
  seed: number;
  /** Board ms since GO (negative before GO, frozen during a HOLD), or null outside a round. */
  boardClock: () => number | null;
  /** My board is on HOLD. */
  held: boolean;
  /** Store an input at the exact ms the judge used. */
  recordAt: (ms: number, code: number) => number | null;
  /** Live Duel Points and combo for the room strip. */
  onProgress?: (score: number, combo: number) => void;
  /** Dev-only demo hands: a house drummer plays this board. */
  autoplay?: SprintProfile | null;
  /** Route offset (ms): the song is heard this much after the judge's time. */
  offsetMs?: number;
}

const NO_DARES: number[] = [];

export function ParadeBoard({ board, seed, boardClock, held, recordAt, onProgress, autoplay, offsetMs = 25 }: ParadeBoardProps) {
  const reducedMotion = useReducedGameMotion();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
  }, []);
  const geom = useMemo(() => fieldGeom(size?.w ?? 390, size?.h ?? 600), [size]);
  const chart = board.chart;
  const hasRim = chart.kind.includes(K_RIM);
  const grip = gripFor(DEFAULT_GRIP, 1, 'ride', hasRim);

  const judge = useSharedValue<JudgeState>(createJudge(chart, {}));
  const view = useSharedValue<ParadeView>(createView(chart.t.length, geom.cx, geom.yLine, geom.width));
  const draw = useSharedValue(createDrawList());
  const tick = useSharedValue(0);
  const clock = useSharedValue(0);
  const running = useSharedValue(0);
  const anchor = useSharedValue<SongAnchor>({ pos: 0, wall: 0, playing: false });
  const lastWall = useSharedValue(0);
  const lastTapT = useSharedValue(0);
  const offset = useSharedValue(offsetMs);
  const marchSv = useSharedValue(0);
  const beatsSv = useSharedValue<number[]>(chart.beats);
  const railFlash = useSharedValue<number[]>([-1e9, -1e9, -1e9]);
  const lastBarSv = useSharedValue(-1);
  const auto = useSharedValue<{ t: number[]; c: number[]; i: number }>({ t: [], c: [], i: 0 });
  const [marchOn, setMarchOn] = useState(false);
  const [marchLive, setMarchLive] = useState(false);

  // A fresh judge and view for every board (and when the layout settles).
  useEffect(() => {
    judge.value = createJudge(chart, {});
    const v = createView(chart.t.length, geom.cx, geom.yLine, geom.width, [chart.beats[4], chart.beats[5], chart.beats[6], chart.beats[7], chart.beats[8]]);
    v.reduced = reducedMotion ? 1 : 0;
    view.value = v;
    beatsSv.value = chart.beats;
    if (autoplay) {
      const taps = botTaps(board, seed, 97, autoplay);
      auto.value = { t: taps.map((x) => x[0]), c: taps.map((x) => x[1]), i: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, geom.cx, geom.yLine]);

  // -- Live Duel Points (the sim's score), kept in JS from the judge events.
  const bars = chart.lastBar - chart.firstBar + 1;
  const pts = useRef({ sum: new Array<number>(bars).fill(0), n: new Array<number>(bars).fill(0), feverFrom: -100 });
  const liveScore = useCallback(() => {
    const p = pts.current;
    let total = 0;
    for (let b = 0; b < bars; b++) {
      if (!p.n[b]) continue;
      const acc = Math.round(p.sum[b] / p.n[b]);
      const bar = chart.firstBar + b;
      total += bar >= p.feverFrom && bar < p.feverFrom + 4 ? Math.round((acc * 3) / 2) : acc;
    }
    return total;
  }, [bars, chart.firstBar]);

  // -- Audio -------------------------------------------------------------------
  const song = useRef<StagePlayer | null>(null);
  const started = useRef(false);
  useEffect(() => {
    registerStudioAudio('rhythm');
    registerKeysounds();
    const entry = STAGES[board.stage as StageId];
    const player = entry ? stagePlayer(entry, 'ride') : null;
    if (!player) return undefined;
    song.current = player;
    started.current = false;
    player.onAnchor((a) => {
      anchor.value = a;
    });
    void player.load();
    return () => {
      running.value = 0;
      player.onAnchor(null);
      void player.dispose();
      if (song.current === player) song.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.stage]);

  // Start on GO (the room clock), and follow my HOLD.
  useEffect(() => {
    const id = setInterval(() => {
      const player = song.current;
      const bt = boardClock();
      if (!player || bt == null) return;
      if (held) {
        if (running.value) {
          running.value = 0;
          void player.pause();
        }
        return;
      }
      if (!started.current) {
        if (bt < -45) return;
        started.current = true;
        const from = Math.max(0, bt);
        const go = () => {
          clock.value = from + offset.value;
          anchor.value = { pos: from, wall: Date.now(), playing: false };
          running.value = 1;
          void player.play(from);
        };
        if (bt < 0) setTimeout(go, -bt);
        else go();
        return;
      }
      if (!running.value) {
        // Back from a HOLD: pick up at the frozen board time.
        const from = Math.max(0, bt);
        clock.value = from + offset.value;
        anchor.value = { pos: from, wall: Date.now(), playing: false };
        void player.play(from).then(() => {
          running.value = 1;
        });
        running.value = 1;
      }
    }, 20);
    return () => clearInterval(id);
  }, [boardClock, held, running, clock, anchor, offset]);

  // -- JS side of every judge batch --------------------------------------------
  const onBatch = useCallback((batch: number[], combo: number) => {
    const p = pts.current;
    forEachEvent(batch, (kind, a, b, c) => {
      if (kind === EV_HIT || kind === EV_MISS || kind === EV_WRONG) {
        const bi = chart.bar[a] - chart.firstBar;
        if (bi >= 0 && bi < bars) {
          p.sum[bi] += kind === EV_HIT ? ACCURACY_VALUE[b] ?? 0 : 0;
          p.n[bi] += 1;
        }
      }
      if (kind === EV_HIT) {
        const k = chart.kind[a];
        playKeysound(k, b, c);
        if (song.current instanceof ParadeAudio) song.current.hitDuck();
        if (k === K_BIG) Haptic.comboHeavy();
        else if (b <= J_PERFECT) (k === K_RIM ? Haptic.hitRigid : Haptic.hitMedium)();
        else if (b === J_GREAT) (k === K_RIM ? Haptic.tapLight : Haptic.hitSoft)();
        else if (b === J_GOOD) Haptic.tickSelection();
      } else if (kind === EV_ROLL_TICK) {
        GameAudio.play('rh_drum_hit', { volume: 0.4 });
      } else if (kind === EV_FEVER_START) {
        p.feverFrom = a;
        GameAudio.play('rh_firework');
        Haptic.success();
        const beat = (chart.barStart[a + 1] - chart.barStart[a]) / 4;
        song.current?.setFever(true, beat);
      } else if (kind === EV_FEVER_END) {
        song.current?.setFever(false, 500);
      } else if (kind === EV_MILESTONE) {
        GameAudio.play('fx.reveal', { volume: 0.6 });
      }
    });
    onProgress?.(liveScore(), combo);
  }, [chart, bars, liveScore, onProgress]);

  const onBar = useCallback((march: number) => setMarchLive(!!march), []);

  // -- The frame -----------------------------------------------------------------
  const frame = useCallback((info: FrameInfo) => {
    'worklet';
    const raw = info.timeSincePreviousFrame ?? 16;
    const dt = raw > 50 ? 50 : raw;
    const nowWall = Date.now();
    const v = view.value;
    const s = judge.value;
    if (running.value) {
      let c = clock.value + dt;
      const a = anchor.value;
      if (a.playing) {
        const target = a.pos + (nowWall - a.wall);
        const err = target - c;
        if (err > 80 || err < -80) c = target;
        else c += err > 0 ? Math.min(2, err * 0.1) : Math.max(-2, err * 0.1);
      }
      clock.value = c;
      lastWall.value = nowWall;
      const vnow = c - offset.value;
      v.now = vnow;
      s.marchWant = marchSv.value;
      // Dev demo hands: replay the house drummer's log at its own times.
      const ap = auto.value;
      while (ap.i < ap.t.length && ap.t[ap.i] <= vnow) {
        const t = ap.t[ap.i];
        const d = decodeTap(ap.c[ap.i]);
        ap.i++;
        const at = Math.max(t, lastTapT.value);
        lastTapT.value = at;
        if (d.type === T_DOWN) {
          v.touchX = geom.cx;
          v.touchY = geom.touchTop + 120;
          v.touchZone = d.zone;
          judgeDown(s, at, d.zone, d.pointer, 700);
        } else if (d.type === T_UP) judgeUp(s, at, d.pointer);
        runOnJS(recordAt)(at, encodeTap(d.type, d.zone, d.pointer));
      }
      judgeTick(s, vnow);
      const bf = beatAt(beatsSv.value, vnow);
      const bar = Math.floor(bf / 4);
      v.marchTarget = bar >= 0 && bar < s.nBars && s.barLayer[bar] === L_MARCH ? 1 : 0;
      if (bar !== lastBarSv.value && bar >= 0 && bar < s.nBars) {
        lastBarSv.value = bar;
        const m = s.barLayer[bar] === L_MARCH;
        if (m && (bar === 0 || s.barLayer[bar - 1] !== L_MARCH)) showRibbon(v, RB_MARCH);
        else if (!m && bar > 0 && s.barLayer[bar - 1] === L_MARCH && bar <= s.lastBar) showRibbon(v, RB_FULL);
        runOnJS(onBar)(m ? 1 : 0);
      }
      if (s.armed && v.armed === 0) v.armed = 1;
    }
    stepView(v, null, dt);
    layoutFrame(draw.value, s, beatsSv.value, geom, v.now, s.approach, v.march, v.missAt, v.wt, 0, 1, NO_DARES);
    const batch = drainEvents(s.ev);
    if (batch.length) {
      applyEventsUI(v, s, null, batch);
      runOnJS(onBatch)(batch, s.combo);
    }
    tick.value = tick.value + 1;
  }, [onBatch, onBar, recordAt, geom]);
  useFrameCallback(frame);

  // -- Touch: judged on touch-down, recorded at the same ms ---------------------
  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      const v = view.value;
      for (const touch of e.changedTouches) {
        const t0 = Math.round(clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value);
        const t = Math.max(t0, lastTapT.value);
        if (t < 0) continue;
        lastTapT.value = t;
        const zone = zoneOf(touch.x, geom.width, grip, 1, 0);
        v.touchX = touch.x;
        v.touchY = touch.y + geom.touchTop;
        v.touchZone = zone;
        judgeDown(s, t, zone, touch.id, touch.absoluteY);
        runOnJS(recordAt)(t, encodeTap(T_DOWN, zone, touch.id));
      }
      const batch = drainEvents(s.ev);
      if (batch.length) {
        applyEventsUI(v, s, null, batch);
        runOnJS(onBatch)(batch, s.combo);
      }
    })
    .onTouchesMove((e) => {
      'worklet';
      if (!running.value) return;
      const s = judge.value;
      for (const touch of e.changedTouches) {
        const t0 = Math.round(clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value);
        const t = Math.max(t0, lastTapT.value);
        judgeMove(s, t, touch.id, touch.absoluteY);
      }
    })
    .onTouchesUp((e) => {
      'worklet';
      const s = judge.value;
      for (const touch of e.changedTouches) {
        const t0 = Math.round(clock.value + Math.min(34, Math.max(0, Date.now() - lastWall.value)) - offset.value);
        const t = Math.max(t0, lastTapT.value);
        lastTapT.value = t;
        judgeUp(s, t, touch.id);
        runOnJS(recordAt)(t, encodeTap(T_UP, 0, touch.id));
      }
    }), [judge, view, clock, lastWall, offset, running, geom, grip, onBatch, recordAt, lastTapT]);

  // MARCH pill: applies from the next section, recorded in the room log.
  const toggleMarch = useCallback(() => {
    const next = !marchOn;
    setMarchOn(next);
    runOnUI((want: number) => {
      'worklet';
      const s = judge.value;
      marchSv.value = want;
      s.marchWant = want;
      void nextOpenSection(s);
      const t = Math.max(Math.round(clock.value - offset.value), lastTapT.value);
      lastTapT.value = t;
      runOnJS(recordAt)(t, encodeTap(T_MARCH, want, 0));
    })(next ? 1 : 0);
  }, [marchOn, marchSv, judge, clock, offset, lastTapT, recordAt]);

  return (
    <View style={styles.root} onLayout={onLayout}>
      {size ? (
        <>
          <ParadeField
            geom={geom}
            judge={judge}
            view={view}
            draw={draw}
            tick={tick}
            reducedMotion={reducedMotion}
            rails={[]}
            railFlash={railFlash}
            grip={grip}
            hand={1}
            swap={0}
            approach={chart.difficulty === 1 ? 1600 : 1300}
          />
          <GestureDetector gesture={gesture}>
            <View style={[styles.touch, { top: geom.touchTop, height: geom.height - geom.touchTop }]} />
          </GestureDetector>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={marchOn ? 'Back to the full chart' : 'March: big beats only'}
            hitSlop={6}
            onPress={toggleMarch}
            style={[styles.march, marchLive && styles.marchLive, marchOn !== marchLive && styles.marchPending]}
          >
            <Text style={styles.marchTxt}>{marchLive ? 'MARCHING' : 'MARCH'}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#4fc3ff', overflow: 'hidden' },
  touch: { position: 'absolute', left: 0, right: 0 },
  march: { position: 'absolute', left: 10, top: 92, height: 40, minWidth: 92, borderRadius: 20, borderWidth: 3, borderColor: '#0b3a6b', backgroundColor: '#ffffff', paddingHorizontal: 12, justifyContent: 'center' },
  marchLive: { backgroundColor: '#ffcf3b' },
  marchPending: { borderStyle: 'dashed', backgroundColor: '#eaf6ff' },
  marchTxt: { fontFamily: 'Shark', fontSize: 14, color: '#0b3a6b' },
});

export default React.memo(ParadeBoard);
