/**
 * LagoonDashBoard: the Line Party board for Lagoon Dash (Current Quest's
 * Same-Board Showdown micro-round). Same diorama, same red-cap shark, same
 * walk-safe controls as the solo game, on the room's seeded board and the
 * client's board clock (frozen during a personal HOLD).
 *
 * Every committed stroke is recorded with the PartyClient at its board time
 * and applied locally with that same time, so the local score is exactly the
 * server's replay. Bumps are never recorded. Nothing here ever pauses for
 * walking; there is no clock inside the board, only the room's window.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFont, useImage } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import GameIcon from '../../../ui/GameIcon';
import { Haptic, scheduleHaptics } from '../../../gamekit/Haptics';
import { gridSteps } from '../../../gamekit/core/hapticGrammar';
import {
  A_RESTART, A_TREAD, A_UNDO, applyAction, createRun, heightOf, previewFor, PUZZLE_KNOBS, tideAt, TIDE_LOW, totalShells,
  type Board, type CqEvent, type RunState,
} from '../rules';
import { LagoonBoard, type BoardImages, type BoardSV, type PreviewSV } from '../LagoonBoard';
import { idlePlan, newFrame, planDuration, PLAN_BUMP, PLAN_CHEER, PLAN_STROKE, PLAN_TREAD, PLAN_UNDO, T_ANTIC, T_GRAB, T_TILE, T_TRAVEL, type MotionPlan } from '../motion';
import { boardLayout, cellCenter, CQ, type BoardLayout } from '../theme';
import {
  registerCqAudio, sfxAim, sfxBump, sfxCarry, sfxChest, sfxGolden, sfxPearl, sfxRiptide, sfxShells, sfxSwim, sfxTide, sfxTread, sfxUndo, sfxUnlock,
} from '../audio';
import { botTaps, resolve, type DashProfile, type DashTap } from './lagoonDash';

export interface LagoonDashBoardProps {
  board: Board;
  seed: number;
  goAt: number;
  durationMs: number;
  perfNow: () => number;
  /** Records the action with the client; returns board ms since GO, or null outside play / on HOLD. */
  onTap: (action: number) => number | null;
  onProgress?: (score: number, streak: number) => void;
  onTick?: (boardMs: number, score: number) => void;
  boardClock?: () => number | null;
  /** Dev-only demo hands (recorded proof runs): a human-paced bot plays this board. */
  autoplay?: DashProfile | null;
}

const THRESHOLD = 22;

function LagoonDashBoard({ board, seed, goAt, durationMs, perfNow, onTap, onProgress, onTick, boardClock, autoplay }: LagoonDashBoardProps) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (b && Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  }, []);
  const layout: BoardLayout | null = useMemo(() => (box ? boardLayout(box.w, box.h - 70, heightOf(board)) : null), [box, board]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const images: BoardImages = {
    idle: useImage(require('../../../assets/games/current-quest/cq_shark_idle_swim.png')),
    dash: useImage(require('../../../assets/games/current-quest/cq_shark_swim_dash.png')),
    surf: useImage(require('../../../assets/games/current-quest/cq_shark_surf_ride.png')),
    ouch: useImage(require('../../../assets/games/current-quest/cq_shark_bump_ouch.png')),
    cheer: useImage(require('../../../assets/games/current-quest/cq_shark_cheer.png')),
    coralA: useImage(require('../../../assets/games/current-quest/coral_a.png')),
    coralB: useImage(require('../../../assets/games/current-quest/coral_b.png')),
    coralC: useImage(require('../../../assets/games/current-quest/coral_c.png')),
    sand: useImage(require('../../../assets/games/current-quest/sandbar.png')),
    sandWet: useImage(require('../../../assets/games/current-quest/sandbar_wet.png')),
    foam: useImage(require('../../../assets/games/current-quest/foam_strip.png')),
    pearl: useImage(require('../../../assets/games/current-quest/pearl.png')),
    golden: useImage(require('../../../assets/games/current-quest/golden_pearl.png')),
    chestClosed: useImage(require('../../../assets/games/current-quest/chest_closed.png')),
    chestOpen: useImage(require('../../../assets/games/current-quest/chest_open.png')),
    padlock: useImage(require('../../../assets/games/current-quest/padlock.png')),
    chevron: useImage(require('../../../assets/games/current-quest/current_chevron.png')),
  };
  const ready = Object.values(images).every(Boolean);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableImages = useMemo(() => images, [ready]);
  const font = useFont(require('../../../../assets/fonts/shark-random-funnyness-2.ttf'), 34);
  const timeScale = useSharedValue(1);

  const sv: BoardSV = {
    fxT: useSharedValue(0), timeScale, plan: useSharedValue<MotionPlan>(idlePlan(0, 0)), shark: useSharedValue(newFrame()), tail: useSharedValue(0),
    picks: useSharedValue<number[]>([-1, -1, -1, -1]), pickQueue: useSharedValue<number[]>([]), tideDrop: useSharedValue(0), chest: useSharedValue(0),
    unlockT: useSharedValue(-1e9), rattleT: useSharedValue(-1e9), armed: useSharedValue(-1), previews: useSharedValue<PreviewSV[]>([]),
    surge: useSharedValue(0), gridA: useSharedValue(1), undoTint: useSharedValue(0), breath: useSharedValue(0), riseT0: useSharedValue(0),
    banner: useSharedValue({ text: '', t0: -1e9, kind: 0, ms: 0 }), hint: useSharedValue<number[]>([]), hintT0: useSharedValue(-1e9),
    swirl: useSharedValue(0), trail: useSharedValue<number[]>([]), flareT: useSharedValue(-1e9), flareRun: useSharedValue(-1),
    walking: useSharedValue(1), nervous: useSharedValue(0), banked: useSharedValue(0), bankT: useSharedValue(-1e9),
    recap: useSharedValue<number[]>([]), recapPar: useSharedValue<number[]>([]), recapT0: useSharedValue(-1e9),
    wrong: useSharedValue<number[]>([]), wrongT0: useSharedValue(-1e9), sweepT0: useSharedValue(-1e9), tourT0: useSharedValue(-1e9),
    idleSince: useSharedValue(0), sway: useSharedValue<number[]>([]),
  };
  const svRef = useRef(sv);
  svRef.current = sv;

  const runRef = useRef<RunState>(createRun([board], PUZZLE_KNOBS));
  const taps = useRef<DashTap[]>([]);
  const busyUntil = useRef(0);
  const pathStack = useRef<number[][]>([]);
  const pearlStep = useRef(0);
  const [hud, setHud] = useState({ strokes: 0, pearls: 0, golden: false, cleared: false, shells: 0 });
  const [chip, setChip] = useState<string | null>(null);

  useEffect(() => { registerCqAudio(); }, []);
  // Parent callbacks change identity every render; the board must never reset because of that.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const center = useCallback((i: number) => (layoutRef.current ? cellCenter(layoutRef.current, i) : { x: 0, y: 0 }), []);

  const sync = useCallback(() => {
    const run = runRef.current;
    const v = run.voyage;
    let pearls = 0;
    for (let k = 0; k < board.pearls.length; k++) if (v.mask & (1 << k)) pearls++;
    const cleared = run.complete;
    const r = resolve(board, taps.current);
    setHud({ strokes: cleared ? run.results[0].strokes : v.strokes, pearls: cleared ? board.pearls.length : pearls, golden: v.golden || (cleared && run.results[0].shellGolden), cleared, shells: cleared ? totalShells(run.results) : 0 });
    onProgressRef.current?.(r.score, cleared ? totalShells(run.results) : pearls);
    const s = svRef.current;
    const picks = [-1, -1, -1, -1];
    for (let k = 0; k < board.pearls.length; k++) if (v.mask & (1 << k)) picks[k] = -1e9;
    if (board.golden >= 0 && v.golden) picks[board.pearls.length] = -1e9;
    if (!cleared) { s.picks.value = picks; s.banked.value = pearls; s.chest.value = pearls === board.pearls.length ? 1 : 0; }
    const k = board.P ? (v.moves + v.phase) % board.P : 0;
    const low = tideAt(board.P, v.moves, v.phase) === TIDE_LOW;
    s.tideDrop.value = withTiming(!board.P ? 0 : low ? 8 - 2 * Math.min(3, k) : 2 * Math.min(3, k), { duration: 500 });
  }, [board]);

  const refreshPreviews = useCallback(() => {
    const run = runRef.current;
    const out: PreviewSV[] = [];
    for (let a = 0; a <= 4; a++) {
      const pv = previewFor(run, a);
      if (!pv.valid) { out.push({ valid: 0, red: 0, pts: [], lx: 0, ly: 0, facing: 1, rot: 0, beached: 0, clears: 0, rip: 0, icons: [] }); continue; }
      const pts: number[] = [];
      for (const c of pv.path) { const p = center(c); pts.push(p.x, p.y); }
      const land = center(pv.path[pv.path.length - 1]);
      const prev = center(pv.path[Math.max(0, pv.path.length - 2)]);
      const facing = Math.abs(land.x - prev.x) > 0.5 ? (land.x > prev.x ? 1 : -1) : 1;
      const icons: number[] = [];
      pv.pearlAt.forEach((at, k) => { const c = center(pv.path[at]); icons.push(c.x, c.y, pv.golden && k === pv.pearlAt.length - 1 ? 1 : 0); });
      out.push({ valid: 1, red: 0, pts, lx: land.x, ly: land.y, facing, rot: 0, beached: pv.beached ? 1 : 0, clears: pv.clears ? 1 : 0, rip: pv.riptide ? 1 : 0, icons });
    }
    svRef.current.previews.value = out;
  }, [center]);

  // Reset on a new board / layout.
  useEffect(() => {
    if (!layout) return;
    runRef.current = createRun([board], PUZZLE_KNOBS);
    taps.current = [];
    pathStack.current = [];
    pearlStep.current = 0;
    const s = svRef.current;
    const st = center(board.start);
    s.plan.value = { ...idlePlan(st.x, st.y, 1), t0: -1 };
    s.riseT0.value = s.fxT.value;
    s.tourT0.value = s.fxT.value + 450;
    sync();
    refreshPreviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, layout]);

  const present = useCallback((events: CqEvent[]) => {
    const s = svRef.current;
    let dur = 200;
    for (const ev of events) {
      if (ev.type === 'stroke') {
        const pts: number[] = [];
        for (const c of ev.path) { const p = center(c); pts.push(p.x, p.y); }
        const plan: MotionPlan = { kind: ev.dir < 0 ? PLAN_TREAD : PLAN_STROKE, t0: -1, pts, carry: ev.carried, facing: s.plan.value.facing || 1, dive: ev.cleared ? 1 : 0, beached: ev.beached ? 1 : 0, wasBeached: ev.wasBeached && ev.dir >= 0 ? 1 : 0, bx: 0, by: 0, speed: 1, rip: ev.riptide ? 1 : 0 };
        const q: number[] = [];
        for (const p of ev.pearls) q.push(p.at, p.k);
        if (ev.golden) q.push(ev.goldenAt, board.pearls.length);
        s.pickQueue.value = q;
        s.plan.value = plan;
        if (ev.dir >= 0) pathStack.current.push(ev.path.slice());
        dur = planDuration(plan);
        const carryStart = T_ANTIC + T_TRAVEL;
        if (ev.dir < 0) sfxTread();
        else {
          sfxSwim(0);
          if (ev.carried > 0) {
            setTimeout(() => sfxCarry(ev.carried, ev.riptide), carryStart - 10);
            scheduleHaptics([{ at: 0, p: 'light' }, ...gridSteps(Math.min(3, ev.carried), carryStart + T_GRAB, T_TILE, 'selection'), { at: carryStart + T_GRAB + T_TILE * ev.carried + 40, p: 'medium' }]);
          } else Haptic.tapLight();
        }
        for (const p of ev.pearls) setTimeout(() => { sfxPearl(pearlStep.current++); Haptic.tickSelection(); }, ev.carried > 0 ? carryStart + T_GRAB + T_TILE * (p.at - 1) : carryStart);
        if (ev.golden) setTimeout(() => { sfxGolden(); s.banner.value = { text: 'GOLDEN!', t0: s.fxT.value, kind: 0, ms: 500 }; }, dur - 200);
        if (ev.unlocked) setTimeout(() => { s.chest.value = 1; s.unlockT.value = s.fxT.value; sfxUnlock(); }, carryStart + 60);
        if (ev.riptide) setTimeout(() => { sfxRiptide(); s.banner.value = { text: 'RIPTIDE!', t0: s.fxT.value, kind: 0, ms: 600 }; s.surge.value = withSequence(withTiming(1, { duration: 200 }), withTiming(1, { duration: 4000 }), withTiming(0, { duration: 400 })); }, dur - 120);
        if (ev.tideAfter !== ev.tideBefore && !ev.cleared) setTimeout(() => { sfxTide(); s.sweepT0.value = s.fxT.value; }, dur - 100);
      } else if (ev.type === 'clear') {
        setTimeout(() => {
          s.chest.value = 2;
          sfxChest();
          sfxShells(ev.result.shells);
          Haptic.success();
          s.banner.value = { text: ev.result.shells >= 3 ? 'PERFECT!' : 'TREASURE!', t0: s.fxT.value, kind: 0, ms: 900 };
          const p = s.shark.value;
          s.plan.value = { ...idlePlan(p.x, p.y, p.facing), kind: PLAN_CHEER, t0: -1 };
        }, dur - 240);
      } else if (ev.type === 'undo' || ev.type === 'restart') {
        const path = ev.type === 'undo' ? pathStack.current.pop() : undefined;
        if (ev.type === 'restart') pathStack.current = [];
        const pts: number[] = [];
        const cells = path ?? [runRef.current.voyage.pos, ev.type === 'undo' ? ev.from : runRef.current.voyage.pos];
        for (const c of cells) { const p = center(c); pts.push(p.x, p.y); }
        s.plan.value = { kind: PLAN_UNDO, t0: -1, pts, carry: path ? Math.max(0, path.length - 2) : 0, facing: s.plan.value.facing || 1, dive: 0, beached: 0, wasBeached: 0, bx: 0, by: 0, speed: 1.6, rip: 0 };
        s.undoTint.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 300 }));
        sfxUndo();
        Haptic.tickSelection();
        dur = 320;
      }
    }
    busyUntil.current = Date.now() + Math.min(dur, 900);
  }, [board, center]);

  const commit = useCallback((action: number) => {
    const run = runRef.current;
    if (run.complete || Date.now() < busyUntil.current) return;
    const s = svRef.current;
    s.armed.value = -1;
    setChip(null);
    if (action <= A_TREAD) {
      const pv = previewFor(run, action);
      if (!pv.valid) {
        if (pv.bump) {
          const from = center(run.voyage.pos);
          const cell = layoutRef.current?.cell ?? 60;
          s.plan.value = { ...idlePlan(from.x, from.y, s.plan.value.facing || 1), kind: PLAN_BUMP, t0: -1, pts: [from.x, from.y], bx: from.x + [0, 1, 0, -1][action] * cell, by: from.y + [-1, 0, 1, 0][action] * cell };
          sfxBump(pv.bump);
          Haptic.hitRigid();
          setTimeout(() => { const p = center(runRef.current.voyage.pos); s.plan.value = { ...idlePlan(p.x, p.y, s.plan.value.facing || 1), t0: -1 }; }, 270);
        }
        return;
      }
    }
    const t = onTapRef.current(action);
    if (t === null) return;
    const res = applyAction(run, action, t);
    if (!res.ok || !res.recorded) return;
    runRef.current = res.run;
    taps.current.push([t, action]);
    present(res.events);
    sync();
    refreshPreviews();
  }, [center, present, sync, refreshPreviews]);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  function commitFromUi(dir: number) { commitRef.current(dir); }

  const onAim = useCallback((dir: number) => {
    if (dir < 0) { setChip(null); return; }
    sfxAim(dir);
    Haptic.tickSelection();
    const pv = previewFor(runRef.current, dir);
    setChip(pv.valid ? (pv.riptide ? 'RIPTIDE!' : pv.clears ? 'Treasure!' : pv.tideTurns ? 'Tide turns' : null) : pv.bump === 'upstream' ? 'Against the current' : pv.bump === 'locked' ? 'Chest is locked' : null);
  }, []);

  const gesture = useMemo(() => {
    const s = sv;
    return Gesture.Pan().minDistance(4)
      .onUpdate((e) => {
        'worklet';
        const adx = Math.abs(e.translationX);
        const ady = Math.abs(e.translationY);
        let dir = -1;
        if (Math.max(adx, ady) >= THRESHOLD) dir = adx > ady ? (e.translationX > 0 ? 1 : 3) : (e.translationY > 0 ? 2 : 0);
        if (dir !== s.armed.value) { s.armed.value = dir; runOnJS(onAim)(dir); }
      })
      .onEnd(() => {
        'worklet';
        const dir = s.armed.value;
        s.armed.value = -1;
        if (dir >= 0) runOnJS(commitFromUi)(dir);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAim]);

  // Board clock: HUD tick, and the dev demo hands.
  const auto = useMemo(() => (autoplay ? botTaps(board, seed, 9, autoplay) : []), [autoplay, board, seed]);
  const autoIndex = useRef(0);
  const autoNext = useRef(0);
  useEffect(() => {
    let raf = 0;
    let lastQ = -1;
    const frame = () => {
      const t = boardClock?.() ?? perfNow() - goAt;
      if (auto.length && t >= 0) {
        if (autoIndex.current < auto.length && auto[autoIndex.current][0] <= t && Date.now() >= Math.max(busyUntil.current, autoNext.current)) {
          const a = auto[autoIndex.current][1];
          if (a <= A_TREAD) { svRef.current.armed.value = a; onAim(a); setTimeout(() => commitRef.current(a), 380); } else commitRef.current(a);
          autoIndex.current += 1;
          autoNext.current = Date.now() + 520;
        }
      }
      const q = Math.floor(t / 250);
      if (q !== lastQ) { lastQ = q; onTickRef.current?.(t, resolve(board, taps.current).score); }
      if (t < durationMs + 400) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, board, durationMs, goAt]);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={styles.hud} pointerEvents="none">
        <Text style={styles.hudTxt}>{hud.cleared ? `${hud.shells} shell${hud.shells === 1 ? '' : 's'}!` : `Pearls ${hud.pearls}/${board.pearls.length}`}</Text>
        <Text style={styles.hudTxt}>{`Strokes ${hud.strokes}  par ${board.par}`}</Text>
      </View>
      {layout && ready ? (
        <GestureDetector gesture={gesture}>
          <View style={{ width: layout.cw, height: layout.ch, alignSelf: 'center' }} accessibilityLabel="Lagoon Dash board. Swipe to swim.">
            <LagoonBoard key={`${board.id}:${layout.cell}`} board={board} layout={layout} images={stableImages} font={font} sv={sv} reducedMotion={false} />
            {chip ? (
              <Animated.View entering={ZoomIn.duration(120)} style={[styles.chip, chip === 'RIPTIDE!' && styles.chipGold]} pointerEvents="none">
                <Text style={styles.chipTxt}>{chip}</Text>
              </Animated.View>
            ) : null}
          </View>
        </GestureDetector>
      ) : null}
      <View style={styles.bar}>
        {[3, 0, 2, 1].map((d) => (
          <Pressable key={`d${d}`} accessibilityRole="button" accessibilityLabel={['Swim up', 'Swim right', 'Swim down', 'Swim left'][d]}
            onPressIn={() => { sv.armed.value = d; onAim(d); }} onPressOut={() => { sv.armed.value = -1; }} onPress={() => commit(d)}
            style={({ pressed }) => [styles.btn, pressed && styles.btnOn]}>
            <View style={{ transform: [{ rotate: `${[-90, 0, 90, 180][d]}deg` }] }}><GameIcon name="arrow" size={24} /></View>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => commit(A_UNDO)} style={({ pressed }) => [styles.btn, styles.btnSmall, pressed && styles.btnOn]}>
          <View style={{ transform: [{ scaleX: -1 }] }}><GameIcon name="retry" size={22} /></View>
        </Pressable>
        {board.P ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Tread water" onPress={() => commit(A_TREAD)} style={({ pressed }) => [styles.btn, styles.btnSmall, pressed && styles.btnOn]}>
            <Text style={styles.btnTxt}>Tread</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Restart board" onPress={() => commit(A_RESTART)} style={({ pressed }) => [styles.btn, styles.btnSmall, pressed && styles.btnOn]}>
            <GameIcon name="retry" size={22} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default React.memo(LagoonDashBoard);

const styles = StyleSheet.create({
  wrap: { flex: 1, alignSelf: 'stretch' },
  hud: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 2 },
  hudTxt: { fontFamily: 'Knockout', fontSize: 14, color: '#ffffff', textShadowColor: CQ.waterDeep, textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } },
  chip: { position: 'absolute', alignSelf: 'center', top: 2, paddingHorizontal: 12, paddingVertical: 3, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink },
  chipGold: { backgroundColor: CQ.gold },
  chipTxt: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy },
  bar: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, justifyContent: 'center' },
  btn: { flex: 1, height: 50, borderRadius: 14, backgroundColor: '#ffffff', borderWidth: 2.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { flex: 0.85, backgroundColor: CQ.cream },
  btnOn: { backgroundColor: '#fff3c2', transform: [{ scale: 0.95 }] },
  btnTxt: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy },
});
