/**
 * SharkySwim: "Tide Run", the one-thumb underwater theme-park runner.
 *
 * Hold anywhere to swim up, let go to sink. Skim the coaster pylons, chomp the
 * prize boxes, chain the golden rings into a Frenzy, beat the tide to each
 * gate, then look up while your shark cruises the Tide Pocket. Walk-safe:
 * line movement never pauses (the shell plays through); letting go wraps the
 * shark in a Bubble Float instead of crashing.
 *
 * Everything that matters runs in the deterministic integer sim (sim/core.ts)
 * on the UI thread; the same file is the server verifier, so ghosts replay
 * exactly and results are server-authoritative (swim proof in meta).
 *
 * External contract (unchanged): onComplete(multiplier, meta), onClose().
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnUI } from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio, useStudioAudio } from '../../gamekit/audio/studioLibrary';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { usePerfProbe, PerfOverlay } from '../../gamekit/perf/PerfOverlay';
import { starsFor } from '../../gamekit/core/scoring';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  END_FINISH, END_GATE, END_TIME, EXT_PAUSE_RESUME, EXT_REVIVE, IN_DASH, IN_PRESS, IN_RELEASE,
  MODE_GHOST, MODE_PRACTICE, MODE_QUEUE, MODE_RACE, MODE_RIDE, decodeInputs, encodeInputs, hash2, multiplier, replay,
  type InputEntry, type SimConfig, type SimState,
} from './sim/core';
import { buildSwimProof } from './sim/verify';
import { BOT_PROFILES, planRun } from './sim/bots';
import { useSharkyEngine, type RivalSpec } from './useSharkyEngine';
import { raceConfig } from './sim/race';
import { useSprintRace } from './net/useSprintRace';
import { RaceCountIn, RaceLobby, RacePodium } from './hud/RaceOverlays';
import { SharkyCanvas } from './render/SharkyCanvas';
import { SharkyHud } from './render/SharkyHud';
import { sharkyLayout, type SharkyLayout } from './render/view';
import { createSharkyFeel } from './sharkyFeel';
import {
  EMPTY_PROGRESS, loadProgress, ratedDifficulty, saveProgress, unlockCard, unlockTier,
  type GhostRecord, type SharkyProgress,
} from './meta/progress';

registerStudioAudio('sharky');

export type SharkyMode = 'queue' | 'ride' | 'race' | 'ghost' | 'practice';
export type Difficulty = 1 | 2 | 3;

export interface SharkySwimProps {
  visible: boolean;
  /** 1-3. When omitted, a local rating from recent stars is used (design 5.6). */
  difficulty?: Difficulty;
  /** Deterministic seed (server attempt seed or LinePlay item seed). */
  seed?: number;
  /** queue (LinePlay, default), ride (Ride Challenge), race, ghost, practice. */
  mode?: SharkyMode;
  taskName?: string;
  rideId?: number;
  /** Live Sprint Race server (lab: ws://localhost:8413). Without it, races run against the house crew offline. */
  raceUrl?: string;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

const MODE_ID: Record<SharkyMode, number> = { queue: MODE_QUEUE, ride: MODE_RIDE, race: MODE_RACE, ghost: MODE_GHOST, practice: MODE_PRACTICE };
const QUEUE_STARS = { one: 900, two: 2400, three: 5000 };
const RACE_NAMES = ['Captain Fin', 'Bubbles', 'Coral'];
const RIVAL_COLORS = ['#ffffff', '#ffe27a', '#bff3ff'];
const RIVAL_PROFILES = ['ace', 'regular', 'rookie'];

function rideStars(s: SimState): number {
  if (s.endReason !== END_GATE || s.hearts < 1) return 0;
  if (s.tokens >= 3 && s.score >= 3300) return 3;
  if (s.score >= 1800) return 2;
  return 1;
}

export function SharkySwim({
  visible, difficulty, seed, mode = 'queue', taskName, rideId, raceUrl, onComplete, onClose, onQuit,
}: SharkySwimProps) {
  const auth = useContext(AuthContext);
  const reducedMotion = useReducedGameMotion();
  const shell = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const [layout, setLayout] = useState<SharkyLayout | null>(null);
  const layoutRef = useRef<SharkyLayout>(sharkyLayout(390, 700));
  const [progress, setProgress] = useState<SharkyProgress | null>(null);
  const [runIdx, setRunIdx] = useState(0);
  // Dev lab: EXPO_PUBLIC_SHARKY_MODE=race|ghost|ride opens that mode directly.
  const devMode = (__DEV__ ? process.env.EXPO_PUBLIC_SHARKY_MODE : undefined) as SharkyMode | undefined;
  const [runMode, setRunMode] = useState<SharkyMode>(devMode ?? mode);
  const [ghost, setGhost] = useState<GhostRecord | null>(null);
  const [score, setScore] = useState(0);
  const [fever, setFever] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [reviveOffer, setReviveOffer] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [gates, setGates] = useState(0);
  const [newCard, setNewCard] = useState<string | null>(null);
  const startedAt = useRef(0);
  const pausedMs = useRef(0);
  const endedRef = useRef(false);
  const perf = usePerfProbe(visible && !result);

  // --- live Sprint Race (Line Party semantics; lab transport in dev) ----------------
  const liveUrl = raceUrl ?? (__DEV__ ? process.env.EXPO_PUBLIC_SHARKY_RACE_URL : undefined) ?? null;
  const liveRace = runMode === 'race' && !!liveUrl;
  const playerName = (__DEV__ && process.env.EXPO_PUBLIC_SHARKY_NAME) || auth?.player?.username || 'Shark';
  const race = useSprintRace(liveRace ? liveUrl : null, rideId ?? 1, playerName);
  const round = liveRace ? race.state.round : null;
  const [raceGo, setRaceGo] = useState(false);
  const [raceDone, setRaceDone] = useState(false);
  const seatToSlot = useRef<Record<number, number>>({});
  const slotNames = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    void loadProgress().then((p) => alive && setProgress(p));
    return () => {
      alive = false;
    };
  }, []);

  // --- run config ---------------------------------------------------------------
  const prog = progress ?? EMPTY_PROGRESS;
  const cfg = useMemo<SimConfig>(() => {
    if (round) return raceConfig(round.seed);
    const m = MODE_ID[runMode];
    const base = (seed ?? 20260930) >>> 0;
    const runSeed = ghost ? ghost.seed : runIdx === 0 ? base : hash2(base, runIdx) >>> 0;
    return {
      seed: runSeed | 0,
      mode: m,
      difficulty: ghost ? ghost.difficulty : difficulty ?? ratedDifficulty(prog),
      tier: ghost ? ghost.tier : unlockTier(prog.runs),
      runs: ghost ? ghost.runs : prog.runs,
    };
  }, [runMode, seed, runIdx, ghost, difficulty, prog, round]);

  // --- engine ---------------------------------------------------------------------
  const feelRef = useRef<ReturnType<typeof createSharkyFeel> | null>(null);
  const autoplay = __DEV__ && process.env.EXPO_PUBLIC_SHARKY_AUTOPLAY === '1';
  const autoSalt = autoplay ? ((process.env.EXPO_PUBLIC_SHARKY_NAME ?? '').length % 5) : 0;
  const engine = useSharkyEngine(cfg, (batch) => feelRef.current?.handle(batch), autoplay, autoSalt);
  const walk = useWalkSense({ active: visible && !result });
  const L = layout ?? layoutRef.current;
  const camera = useCamera({ width: L.w, height: L.h, timeScale: engine.clock.fxScale, reducedMotion, walking: walk.walking });

  const finish = useCallback((reason: number) => {
    if (endedRef.current) return;
    endedRef.current = true;
    // Read the final state by replaying the JS log (exact, and proof-grade).
    const entries = engine.log.current.slice();
    setTimeout(() => {
      {
        const s = replay(cfg, entries, 60 * 60 * 20);
        const elapsed = Date.now() - startedAt.current;
        const proof = buildSwimProof(cfg, entries, s, elapsed);
        const m = cfg.mode;
        const stars = m === MODE_RIDE ? rideStars(s) : m === MODE_RACE ? (s.endReason === END_FINISH ? 1 : 0) : starsFor(s.score, QUEUE_STARS);
        const before = prog.runs;
        const next: SharkyProgress = {
          ...prog,
          runs: before + 1,
          best: { ...prog.best },
          recentStars: [...prog.recentStars, stars].slice(-5),
          ghosts: { ...prog.ghosts },
          rideTokens: { ...prog.rideTokens },
        };
        const key = runMode;
        const isBest = s.score > (prog.best[key] ?? 0);
        if (isBest) next.best[key] = s.score;
        if (m !== MODE_RACE && (isBest || !prog.ghosts[key])) {
          next.ghosts[key] = {
            seed: cfg.seed, mode: cfg.mode, tier: cfg.tier, difficulty: cfg.difficulty, runs: cfg.runs,
            score: s.score, finishStep: s.finishStep || s.step, inputs: encodeInputs(entries), name: 'Your best', at: Date.now(),
          };
        }
        if (rideId != null) next.rideTokens[String(rideId)] = (prog.rideTokens[String(rideId)] ?? 0) + s.tokens;
        setNewCard(m === MODE_QUEUE ? unlockCard(before, before + 1) : null);
        setProgress(next);
        void saveProgress(next);
        if (liveRace && round && race.transport) {
          // Server-authoritative: the room replays this proof; the podium waits for it.
          race.transport.submit(round.roundId, proof);
          setRaceDone(true);
          return;
        }
        const res: GameResult = {
          score: s.score,
          stars,
          message: reason === END_TIME ? 'TIME!' : reason === END_GATE ? 'RIDE GATE!' : reason === END_FINISH ? 'FINISH!' : 'WIPEOUT!',
          maxCombo: s.maxChain,
          thresholds: m === MODE_RIDE ? { one: 1, two: 1800, three: 3300 } : QUEUE_STARS,
          stats: [
            { label: 'SKIMS', value: `${s.stSkims}` },
            { label: 'PERFECT', value: `${s.stPerfects}` },
            { label: 'TOKENS', value: `${s.tokens}/3` },
            { label: 'CHOMPS', value: `${s.stChomps}` },
          ],
          meta: {
            game: 'shark', score: s.score, seed: cfg.seed, mode: runMode, stars, reason,
            maxCombo: s.maxChain, tokens: s.tokens, hearts: s.hearts, distance: s.dist >> 8,
            duration: elapsed, swimProof: proof, walking: walk.walking, fps_p5: perf.summary().fpsP5,
          },
        };
        setResult(res);
      }
    }, reason === END_TIME || reason === END_GATE || reason === END_FINISH ? 900 : 300);
  }, [engine.log, cfg, prog, runMode, rideId, walk.walking, perf, liveRace, round, race.transport]);

  feelRef.current = useMemo(() => createSharkyFeel({
    fx,
    camera,
    clock: engine.clock,
    layout: () => layoutRef.current,
    calm: reducedMotion,
    tier: () => cfg.tier,
    hooks: {
      onScore: (sc) => setScore(sc),
      onGate: (_bonus, _kind, _step, g) => {
        setGates(g);
        setBanner(`SPRINT ${g + 1}`);
        setTimeout(() => setBanner(null), 1800);
      },
      onPocketEnd: () => setBanner(null),
      onFrenzy: (on) => setFever(on),
      onFreeze: (on) => setFrozen(on),
      onWipeout: () => {
        if ((cfg.mode === MODE_QUEUE || cfg.mode === MODE_GHOST || cfg.mode === MODE_PRACTICE)) {
          setTimeout(() => setReviveOffer(true), 900);
          if (autoplay) setTimeout(() => engine.ext(EXT_REVIVE, 1), 1800);
        }
      },
      onRevive: () => setReviveOffer(false),
      onEnd: (reason) => {
        setReviveOffer(false);
        finish(reason);
      },
      onRivalDone: () => undefined,
      onCam: (du, y, step) => {
        const t = Date.now();
        if (liveRace && race.transport && raceGo && t - lastWhisper.current >= 100) {
          lastWhisper.current = t;
          race.transport.whisper(step, du, y, 0);
        }
        myDist.current = du;
      },
      onRivalPos: (slot, d, _y, step) => {
        const ahead = myDist.current > d;
        const was = rivalAhead.current[slot];
        rivalAhead.current[slot] = ahead;
        if (ahead && was === false && step > 90) {
          const L = layoutRef.current;
          GameAudio.play(GameAudio.hasCue('sk_pass_whoosh') ? 'sk_pass_whoosh' : 'fx.whoosh');
          fx.current?.flyUp(`PASSED ${slotNames.current[slot] ?? ''}`.trim(), L.w / 2, L.skyH + 60, { size: 'lg', color: '#ffffff', key: 'pass' });
        }
      },
      onSprint: () => undefined,
      onGateNear: () => undefined,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [camera, engine.clock, reducedMotion, cfg, finish, liveRace, race.transport, raceGo]);
  const lastWhisper = useRef(0);
  const myDist = useRef(0);
  const rivalAhead = useRef<Record<number, boolean>>({});

  // Reset the sim for every run (rematch, ghost race, sprint race).
  const [rivalNames, setRivalNames] = useState<string[]>([]);
  useEffect(() => {
    if (!progress) return;
    endedRef.current = false;
    setScore(0);
    setFever(false);
    setGates(0);
    setReviveOffer(false);
    setFrozen(false);
    let rv: Array<RivalSpec | null> = [];
    const names: string[] = [];
    rivalAhead.current = {};
    if (round) {
      // Live race: bots replay the room's planned logs; humans arrive as whispers.
      seatToSlot.current = {};
      round.seats.filter((st) => st.seat !== round.you).slice(0, 3).forEach((st, j) => {
        seatToSlot.current[st.seat] = j;
        names.push(st.name);
        rv.push(st.kind === 'bot' && st.inputs ? { cfg: raceConfig(round.seed), log: decodeInputs(st.inputs) } : { remote: true });
      });
      setRaceGo(false);
      setRaceDone(false);
    } else if (ghost) {
      rv = [{ cfg: { seed: ghost.seed, mode: ghost.mode, difficulty: ghost.difficulty, tier: ghost.tier, runs: ghost.runs }, log: decodeInputs(ghost.inputs) }];
      names.push(ghost.name);
    } else if (cfg.mode === MODE_RACE && !liveRace) {
      // House-crew racers: planned once here, then replayed in lockstep.
      rv = RIVAL_PROFILES.map((p, j) => {
        const bc = { ...cfg };
        const plan = planRun(bc, BOT_PROFILES[p], hash2(cfg.seed, j + 11), 2400);
        names.push(RACE_NAMES[j]);
        return { cfg: bc, log: plan.log };
      });
    }
    setRivalNames(names);
    slotNames.current = names;
    engine.reset(cfg, rv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, progress == null, round?.roundId]);

  // Live rivals: 10 Hz display whispers, interpolated on the UI thread.
  useEffect(() => {
    if (!race.transport) return undefined;
    const last: Record<number, { d: number; at: number }> = {};
    return race.transport.onWhisper((w) => {
      const slot = seatToSlot.current[w.seat];
      if (slot === undefined) return;
      const prev = last[w.seat];
      const t = Date.now();
      const vel = prev && t > prev.at ? ((w.d - prev.d) * 1000) / (t - prev.at) : 0;
      last[w.seat] = { d: w.d, at: t };
      engine.remote(slot, w.d, w.y, Math.max(0, Math.min(1000, vel)));
    });
  }, [race.transport, engine]);

  const onRaceGo = useCallback(() => {
    setRaceGo(true);
    startedAt.current = Date.now();
    engine.clock.resume();
    engine.setRunning(true);
  }, [engine]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init();
    return undefined;
  }, [visible]);
  useStudioAudio('sharky', ['sk_ring', 'sk_ring_perfect', 'sk_skim', 'sk_bump', 'sk_dash', 'sk_tide_gate', 'sh_chomp', 'coin_tick']);

  // Music: Chris's track-3 loop-edit; key rises each Tide Gate; Frenzy variant.
  const key = gates >= 2 ? '_p4' : gates === 1 ? '_p2' : '';
  const wanted = fever ? `sharky_frenzy_loop${key}` : `sharky_loop${key}`;
  const bed = GameAudio.bed?.(wanted) ? wanted : GameAudio.bed?.('sharky_loop') ? 'sharky_loop' : 'chris.track3';
  useGameMusic(visible && !result ? bed : null, { at: 'bar', fadeMs: 250 });

  // --- input: one thumb; hold = swim, slide right or 2nd finger = Dash ------------
  const input = engine.input;
  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e, mgr) => {
      'worklet';
      mgr.activate();
      const inp = input.value;
      const t = e.allTouches[0];
      if (inp.fingers === 0) {
        inp.q.push(IN_PRESS, 0, 0);
        inp.holding = true;
        inp.startX = t ? t.x : 0;
        inp.startY = t ? t.y : 0;
        inp.startT = Date.now();
        inp.slideFired = false;
      } else if (e.numberOfTouches >= 2) {
        inp.q.push(IN_DASH, 0, 0);
      }
      inp.fingers = e.numberOfTouches;
    })
    .onTouchesMove((e) => {
      'worklet';
      const inp = input.value;
      const t = e.allTouches[0];
      if (!t || !inp.holding) return;
      const now = Date.now();
      if (now - inp.startT > 180) {
        inp.startX = t.x;
        inp.startY = t.y;
        inp.startT = now;
        inp.slideFired = false;
      }
      const dx = t.x - inp.startX;
      const dy = t.y - inp.startY;
      if (!inp.slideFired && dx >= 28 && dy < 36 && dy > -36) {
        inp.q.push(IN_DASH, 0, 0);
        inp.slideFired = true;
        inp.startX = t.x;
        inp.startY = t.y;
        inp.startT = now;
      }
    })
    .onTouchesUp((e, mgr) => {
      'worklet';
      const inp = input.value;
      const left = e.numberOfTouches - e.changedTouches.length;
      inp.fingers = left < 0 ? 0 : left;
      if (inp.fingers === 0) {
        if (inp.holding) inp.q.push(IN_RELEASE, 0, 0);
        inp.holding = false;
        mgr.end();
      }
    })
    .onTouchesCancelled((_e, mgr) => {
      'worklet';
      const inp = input.value;
      if (inp.holding) inp.q.push(IN_RELEASE, 0, 0);
      inp.holding = false;
      inp.fingers = 0;
      mgr.end();
    }), [input]);

  // --- shell hooks -------------------------------------------------------------------
  const onStart = useCallback(() => {
    if (liveRace) return; // the server's synced GO starts a live race
    startedAt.current = Date.now();
    pausedMs.current = 0;
    engine.clock.resume();
    engine.setRunning(true);
  }, [engine, liveRace]);

  const onPause = useCallback(() => {
    engine.clock.pause();
    race.transport?.background(true);
    // A held finger is gone after a hold: release on the first step back.
    runOnUI(() => {
      'worklet';
      const inp = input.value;
      if (inp.holding) inp.q.push(IN_RELEASE, 0, 0);
      inp.holding = false;
      inp.fingers = 0;
    })();
  }, [engine, input, race.transport]);

  const onResume = useCallback(() => {
    race.transport?.background(false);
    engine.ext(EXT_PAUSE_RESUME, 0);
    engine.clock.resume();
  }, [engine, race.transport]);

  const onRematch = useCallback(() => {
    setGhost(null);
    setRunMode(mode);
    setResult(null);
    setNewCard(null);
    setRunIdx((n) => n + 1);
  }, [mode]);

  const onChallenge = useCallback(() => {
    // Race your best ghost on its identical course, or the house crew once races unlock.
    const g = progress?.ghosts[mode] ?? null;
    setResult(null);
    setNewCard(null);
    if (g && (progress?.runs ?? 0) < 3) {
      setGhost(g);
      setRunMode('ghost');
    } else {
      setGhost(null);
      setRunMode('race');
    }
    setRunIdx((n) => n + 1);
  }, [progress, mode]);

  const onWrapUp = useCallback(() => {
    // "Your ride's up!": save what we have.
    const entries = engine.log.current.slice();
    const sc = score;
    return {
      score: sc,
      stars: cfg.mode === MODE_RIDE ? 0 : starsFor(sc, QUEUE_STARS),
      thresholds: QUEUE_STARS,
      meta: { game: 'shark', score: sc, seed: cfg.seed, mode: runMode, inputs: encodeInputs(entries) },
    } as GameResult;
  }, [engine.log, score, cfg, runMode]);

  const getSnapshot = useCallback(() => ({
    score,
    steps: engine.log.current.length ? engine.log.current[engine.log.current.length - 1].step : 0,
    state: { cfg, inputs: encodeInputs(engine.log.current) },
  }), [score, cfg, engine.log]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width < 10 || height < 10) return;
    const l = sharkyLayout(width, height);
    layoutRef.current = l;
    setLayout(l);
  }, []);

  const title = runMode === 'ride' ? 'Ride Challenge' : runMode === 'race' ? 'Sprint Race' : runMode === 'ghost' ? 'Ghost Race' : 'Sharky Swim';
  const objective = runMode === 'ride'
    ? 'Reach the Ride Gate. Hold to swim up, let go to sink.'
    : cfg.tier === 0 ? 'Hold anywhere to swim up. Let go to sink.' : 'Beat the tide to each gate. Chain rings into a FRENZY.';
  const showBoost = cfg.tier >= 2 || cfg.mode === MODE_RACE;

  return (
    <GameShellV2
      key={`sharky-${runIdx}`}
      ref={shell}
      visible={visible}
      title={title}
      subtitle={taskName}
      score={score}
      multiplier={1}
      fever={fever}
      personalBest={prog.best[runMode] ?? 0}
      objective={objective}
      result={result}
      thresholds={cfg.mode === MODE_RIDE ? { one: 1, two: 1800, three: 3300 } : QUEUE_STARS}
      gameId="sharky"
      sessionKey={`sharky:${rideId ?? 0}:${cfg.seed}`}
      movementPolicy="playThrough"
      getSnapshot={getSnapshot}
      onWrapUp={onWrapUp}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
      onRematch={runMode === 'ride' ? undefined : onRematch}
      onChallenge={runMode === 'ride' || prog.runs < 1 ? undefined : onChallenge}
    >
      <GestureHandlerRootView style={styles.fill}>
        <GestureDetector gesture={gesture}>
          <View style={styles.fill} onLayout={onLayout} collapsable={false}>
            {layout ? (
              <>
                <Animated.View style={[StyleSheet.absoluteFill, camera.style]} pointerEvents="none">
                  <SharkyCanvas
                    layout={layout}
                    sim={engine.sim}
                    rivals={engine.rivals}
                    ambient={engine.ambient}
                    tick={engine.tick}
                    alpha={engine.alpha}
                    rivalColors={RIVAL_COLORS}
                    reducedMotion={reducedMotion}
                  />
                </Animated.View>
                <SharkyHud layout={layout} sim={engine.sim} rivals={engine.rivals} tick={engine.tick} showBoost={showBoost} boostHint={!prog.boostHintSeen} />
                <FxStage ref={fx} width={layout.w} height={layout.h} timeScale={engine.clock.fxScale} reducedMotion={reducedMotion} />
              </>
            ) : null}

            {rivalNames.length ? (
              <View pointerEvents="none" style={[styles.pills, { top: (layout?.skyH ?? 120) - 34 }]}>
                {rivalNames.map((n, j) => (
                  <View key={n} style={[styles.pill, { borderColor: RIVAL_COLORS[j] }]}>
                    <Text style={styles.pillText}>{n}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {banner ? (
              <View pointerEvents="none" style={[styles.banner, { top: (layout?.skyH ?? 120) + 40 }]}>
                <Text style={styles.bannerText}>{banner}</Text>
                <Text style={styles.bannerSub}>Look up, your shark is cruising</Text>
              </View>
            ) : null}

            {frozen ? (
              <View pointerEvents="none" style={styles.freeze}>
                <View style={styles.freezeBubble}>
                  <Text style={styles.freezeText}>TAP TO SWIM</Text>
                </View>
              </View>
            ) : null}

            {reviveOffer ? (
              <View style={styles.revive}>
                <View style={styles.reviveCard}>
                  <Text style={styles.reviveTitle}>SECOND WIND?</Text>
                  <Text style={styles.reviveBody}>One free revive this run. Back in with 1 heart.</Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    style={styles.reviveBtn}
                    onPress={() => {
                      setReviveOffer(false);
                      engine.ext(EXT_REVIVE, 1);
                    }}
                  >
                    <Text style={styles.reviveBtnText}>REVIVE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" onPress={() => setReviveOffer(false)}>
                    <Text style={styles.reviveSkip}>No thanks</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {liveRace && !round && !race.state.results ? (
              <RaceLobby state={race.state} crew={['Captain Fin', 'Bubbles', 'Coral']} onReady={() => race.transport?.ready()}
                onLeave={onClose} toLocal={(ms) => race.transport?.toLocal(ms) ?? ms} />
            ) : null}
            {liveRace && round && !raceGo && !raceDone ? (
              <RaceCountIn round={round} toLocal={(ms) => race.transport?.toLocal(ms) ?? ms} onGo={onRaceGo} />
            ) : null}
            {liveRace && (raceDone || race.state.results) ? (
              <RacePodium results={race.state.results} you={round?.you ?? -1} verdict={race.state.entryVerdict}
                nextAtMs={race.state.nextLobbyAtMs} toLocal={(ms) => race.transport?.toLocal(ms) ?? ms}
                onAgain={() => { setRaceDone(false); race.transport?.ready(); }} onLeave={onClose} />
            ) : null}

            {result && newCard ? (
              <View pointerEvents="none" style={styles.newCard}>
                <Text style={styles.newCardTitle}>NEXT RUN</Text>
                <Text style={styles.newCardText}>{newCard}</Text>
              </View>
            ) : null}

            {__DEV__ ? <PerfOverlay probe={perf} style={styles.perf} extra={() => `mult x${multiplier(engine.sim.value)} ${walk.walking ? 'walking' : ''}`} /> : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

const INK = '#23384f';
const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#7fd3ff' },
  pills: { position: 'absolute', right: 10, flexDirection: 'row' },
  pill: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 999, borderWidth: 3, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 6 },
  pillText: { fontFamily: 'Knockout', fontSize: 13, color: INK },
  banner: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bannerText: {
    fontFamily: 'Shark', fontSize: 40, color: '#ffffff',
    textShadowColor: INK, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
  },
  bannerSub: { fontFamily: 'Knockout', fontSize: 16, color: INK, marginTop: 2 },
  freeze: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(235,248,255,0.55)' },
  freezeBubble: { backgroundColor: '#ffffff', borderRadius: 999, borderWidth: 4, borderColor: INK, paddingHorizontal: 26, paddingVertical: 14 },
  freezeText: { fontFamily: 'Shark', fontSize: 30, color: INK },
  revive: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reviveCard: { width: '80%', backgroundColor: '#fff8e4', borderRadius: 24, borderWidth: 4, borderColor: INK, padding: 20, alignItems: 'center' },
  reviveTitle: { fontFamily: 'Shark', fontSize: 34, color: INK },
  reviveBody: { fontFamily: 'Knockout', fontSize: 16, color: INK, textAlign: 'center', marginVertical: 10 },
  reviveBtn: { backgroundColor: '#ffc233', borderRadius: 999, borderWidth: 4, borderColor: INK, paddingHorizontal: 40, paddingVertical: 12, marginTop: 4 },
  reviveBtnText: { fontFamily: 'Shark', fontSize: 28, color: INK },
  reviveSkip: { fontFamily: 'Knockout', fontSize: 15, color: INK, marginTop: 12, opacity: 0.8 },
  newCard: {
    position: 'absolute', top: 12, alignSelf: 'center', backgroundColor: '#ffc233', borderRadius: 16, borderWidth: 4,
    borderColor: INK, paddingHorizontal: 18, paddingVertical: 8, alignItems: 'center',
  },
  newCardTitle: { fontFamily: 'Knockout', fontSize: 13, color: INK, letterSpacing: 1 },
  newCardText: { fontFamily: 'Shark', fontSize: 22, color: INK },
  perf: { top: undefined, bottom: 4, left: 4, right: undefined },
});

export default SharkySwim;
