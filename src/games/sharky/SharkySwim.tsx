/**
 * SharkySwim: "Tide Run" (design v7.1), the one-thumb underwater theme-park runner.
 *
 * Hold anywhere to swim up, let go to sink; let go entirely and the shark
 * settles to mid-depth. Graze hazards inside their white halo to build one
 * chain that floats behind the shark; Close Skims and Perfect rings count
 * double and fire Overdrive once the dorsal fin glows gold. Each Tide Gate
 * cashes the chain (Gate Bonus) and adds a flat +4s; Frenzy is x1.5 and banks
 * at once. A hit costs a heart and a Coin Scatter you can win back. Runs last
 * 30-60 seconds; line movement never pauses (QUEUE REALITY).
 *
 * Everything that matters runs in the deterministic integer sim (sim/core.ts)
 * on the UI thread; the same file is the server verifier, so ghosts replay
 * exactly and results are server-authoritative (swim proof in meta).
 *
 * External contract (unchanged): onComplete(multiplier, meta), onClose().
 * The game never renders `taskName`: the header shows a themed course label.
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AuthContext } from '../../context/AuthProvider';
import { StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnUI, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { GameShellV2, type GameResult, type GameShellV2Handle, type ShellResultsArgs } from '../../gamekit/GameShellV2';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { CAMERA_PRESETS } from '../../gamekit/core/camera';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio, useStudioAudio } from '../../gamekit/audio/studioLibrary';
import { configureHaptics } from '../../gamekit/Haptics';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { usePerfProbe, PerfOverlay } from '../../gamekit/perf/PerfOverlay';
import { usePerfTier } from '../../gamekit/perf/usePerfTier';
import { starsFor } from '../../gamekit/core/scoring';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import {
  END_FINISH, END_GATE, END_TIME, EXT_BUBBLE_GIFT, EXT_PAUSE_RESUME, EXT_REVIVE, G_TIDE,
  IN_PRESS, IN_RELEASE, MODE_GHOST, MODE_PRACTICE, MODE_QUEUE, MODE_RALLY, MODE_RIDE, chainTier, decodeInputs,
  encodeInputs, hash2, multiplier, replay, timedMode,
  type SimConfig, type SimState,
} from './sim/core';
import { buildSwimProof } from './sim/verify';
import { BOT_PROFILES, planRun } from './sim/bots';
import { useSharkyEngine, type RivalSpec } from './useSharkyEngine';
import { RALLY_HOUSE_CREW, RALLY_MAX_STEPS, rallyConfig } from './sim/rally';
import { useRally } from './net/useRally';
import { RallyCountIn, RallyLobby, RallyPodium } from './hud/RallyOverlays';
import { SharkyResults, type SharkyResultsData } from './hud/SharkyResults';
import { SharkyCanvas } from './render/SharkyCanvas';
import { SharkyHud } from './render/SharkyHud';
import { sharkyLayout, type SharkyLayout } from './render/view';
import { INK, NEUTRAL, REWARD } from './render/palette';
import { createSharkyFeel } from './sharkyFeel';
import { registerSharkyAudio, sharkyBed, useSharkyMusic, type SharkyMusicState } from './audio/sharkyAudio';
import { applyRun, type MissionUpdate } from './meta/missions';
import {
  EMPTY_PROGRESS, loadProgress, ratedDifficulty, saveProgress, unlockCard, unlockTier,
  type GhostRecord, type SharkyProgress,
} from './meta/progress';

registerStudioAudio('sharky');
registerSharkyAudio();

export type SharkyMode = 'queue' | 'ride' | 'rally' | 'ghost' | 'practice';
export type Difficulty = 1 | 2 | 3;

export interface SharkySwimProps {
  visible: boolean;
  /** 1-3. When omitted, a local rating from recent stars is used (design 5.9). */
  difficulty?: Difficulty;
  /** Deterministic seed (server attempt seed or LinePlay item seed). */
  seed?: number;
  /** queue (LinePlay, default), ride (Ride Challenge), rally, ghost, practice. 'race' is accepted as 'rally'. */
  mode?: SharkyMode | 'race';
  /** Kept for the selector's API; never rendered (design 5.10: no real ride names in game UI). */
  taskName?: string;
  rideId?: number;
  /** Ride category for the themed course label (coaster, water, dark, spinner, family). */
  rideCategory?: string;
  /** Live Rally server (lab: ws://localhost:8413). Without it, rallies run against labeled ghost seats. */
  raceUrl?: string;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

const MODE_ID: Record<SharkyMode, number> = { queue: MODE_QUEUE, ride: MODE_RIDE, rally: MODE_RALLY, ghost: MODE_GHOST, practice: MODE_PRACTICE };
/** Queue stars from the starting-value bot spread (regular p50 about 7k, ace about 14k). */
const QUEUE_STARS = { one: 2500, two: 6000, three: 11000 };
const RIDE_STARS = { one: 1, two: 4000, three: 7000 };
const RIVAL_COLORS = [NEUTRAL, '#ffe27a', '#bff3ff'];

/** Themed course label (design 5.10): never the ride's real name. */
export function courseLabel(category?: string): string {
  switch ((category ?? '').toLowerCase()) {
    case 'coaster': return 'Coaster Course';
    case 'water': case 'water ride': return 'Splash Course';
    case 'dark': case 'dark ride': return 'Lantern Course';
    case 'spinner': return 'Twirl Course';
    case 'family': case 'family train': return 'Station Course';
    default: return 'Lagoon Course';
  }
}

function rideStars(s: SimState): number {
  if (s.endReason !== END_GATE || s.hearts < 1) return 0;
  if (s.tokens >= 3 && s.score >= RIDE_STARS.three) return 3;
  if (s.score >= RIDE_STARS.two) return 2;
  return 1;
}

/** The closest goal you missed (Geometry Dash / Clash Royale near-miss line). */
function nearMissLine(s: SimState, mode: number, best: number, stars: number): string {
  if (mode === MODE_RIDE && s.endReason !== END_GATE) {
    const pct = Math.min(99, Math.floor((100 * ((s.dist >> 8) - 0)) / Math.max(1, s.gateX || 15000)));
    return `${pct}% to the gate`;
  }
  if (best > s.score && best - s.score < 0.12 * best) return `Only ${best - s.score} from your best`;
  if (mode !== MODE_RIDE && stars < 3) {
    const next = stars === 0 ? QUEUE_STARS.one : stars === 1 ? QUEUE_STARS.two : QUEUE_STARS.three;
    return `Only ${Math.max(1, next - s.score)} from ${stars + 1} star${stars === 0 ? '' : 's'}`;
  }
  return '';
}

export function SharkySwim({
  visible, difficulty, seed, mode: modeProp = 'queue', rideId, rideCategory, raceUrl, onComplete, onClose, onQuit,
}: SharkySwimProps) {
  const mode: SharkyMode = modeProp === 'race' ? 'rally' : modeProp;
  const auth = useContext(AuthContext);
  const reducedMotion = useReducedGameMotion();
  const shell = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const [layout, setLayout] = useState<SharkyLayout | null>(null);
  const layoutRef = useRef<SharkyLayout>(sharkyLayout(390, 700));
  const [progress, setProgress] = useState<SharkyProgress | null>(null);
  const [runIdx, setRunIdx] = useState(0);
  const devMode = ((__DEV__ ? process.env.EXPO_PUBLIC_SHARKY_MODE : undefined) || undefined) as SharkyMode | 'race' | undefined;
  const [runMode, setRunMode] = useState<SharkyMode>(devMode === 'race' ? 'rally' : devMode ?? mode);
  const [ghost, setGhost] = useState<GhostRecord | null>(null);
  const [score, setScore] = useState(0);
  const [fever, setFever] = useState(false);
  const [overdrive, setOverdrive] = useState(false);
  const [floating, setFloating] = useState(false);
  const [inPocket, setInPocket] = useState(false);
  const [deep, setDeep] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const [resultsData, setResultsData] = useState<SharkyResultsData | null>(null);
  const [reviveOffer, setReviveOffer] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [gates, setGates] = useState(0);
  const [missionView, setMissionView] = useState<MissionUpdate | null>(null);
  const startedAt = useRef(0);
  const endedRef = useRef(false);
  const deepSince = useRef(0);
  const perf = usePerfProbe(visible && !result);
  const perfTier = usePerfTier({ active: visible && !result });
  const qualityRef = useRef(0);
  qualityRef.current = perfTier.tierJs;
  const pinQuality = __DEV__ ? process.env.EXPO_PUBLIC_SHARKY_QUALITY : undefined;
  useEffect(() => {
    if (pinQuality !== undefined && pinQuality !== '') perfTier.force(Number(pinQuality));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinQuality]);
  useEffect(() => {
    configureHaptics('sharky');
    return () => configureHaptics('default');
  }, []);

  // --- live Rally (Line Party semantics; lab transport in dev) ---------------------
  const liveUrl = raceUrl ?? (__DEV__ ? process.env.EXPO_PUBLIC_SHARKY_RACE_URL : undefined) ?? null;
  const liveRally = runMode === 'rally' && !!liveUrl;
  const playerName = (__DEV__ && process.env.EXPO_PUBLIC_SHARKY_NAME) || auth?.player?.username || 'Shark';
  const rally = useRally(liveRally ? liveUrl : null, rideId ?? 1, playerName);
  const round = liveRally ? rally.state.round : null;
  const [rallyGo, setRallyGo] = useState(false);
  const [rallyDone, setRallyDone] = useState(false);
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
  // The run's config reads progress as it was when the run began: saving the
  // finished run must never re-create the config and restart a sim under the results.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const progAtRun = useMemo(() => prog, [runIdx, runMode, ghost, progress == null]);
  const cfg = useMemo<SimConfig>(() => {
    if (round) return rallyConfig(round.seed);
    const m = MODE_ID[runMode];
    const base = (seed ?? 20261001) >>> 0;
    const runSeed = ghost ? ghost.seed : runIdx === 0 ? base : hash2(base, runIdx) >>> 0;
    if (m === MODE_RALLY) return rallyConfig(runSeed | 0);
    return {
      seed: runSeed | 0,
      mode: m,
      difficulty: ghost ? ghost.difficulty : difficulty ?? ratedDifficulty(progAtRun),
      tier: ghost ? ghost.tier : unlockTier(progAtRun.runs),
      runs: ghost ? ghost.runs : progAtRun.runs,
    };
  }, [runMode, seed, runIdx, ghost, difficulty, progAtRun, round]);
  const cfgKey = `${cfg.seed}:${cfg.mode}:${cfg.difficulty}:${cfg.tier}:${cfg.runs}:${runIdx}:${ghost ? ghost.at : 0}`;

  // --- engine ---------------------------------------------------------------------
  const feelRef = useRef<ReturnType<typeof createSharkyFeel> | null>(null);
  const autoplay = __DEV__ && (process.env.EXPO_PUBLIC_SHARKY_AUTOPLAY === '1' || process.env.EXPO_PUBLIC_SHARKY_AUTOPLAY === '2');
  const autoCheap = __DEV__ && process.env.EXPO_PUBLIC_SHARKY_AUTOPLAY === '2';
  const autoSalt = autoplay ? ((process.env.EXPO_PUBLIC_SHARKY_NAME ?? '').length % 5) : 0;
  const engine = useSharkyEngine(cfg, (batch) => feelRef.current?.handle(batch), autoplay, autoSalt, autoCheap, reducedMotion);
  const walk = useWalkSense({ active: visible && !result });
  const L = layout ?? layoutRef.current;
  const camera = useCamera({ width: L.w, height: L.h, timeScale: engine.clock.fxScale, reducedMotion, walking: walk.walking, config: CAMERA_PRESETS.sharky });

  // HUD shared state: the rolling score, the split chip, the postcard.
  const shownScore = useSharedValue(0);
  const split = useSharedValue({ delta: 0, at: -9999, label: '' });
  const postcard = useSharedValue({ title: '', at: -9999, until: -9999 });
  const ghostSplits = useRef<number[]>([]);
  const mySplits = useRef<number[]>([]);

  const finish = useCallback((reason: number) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const entries = engine.log.current.slice();
    setTimeout(() => {
      const s = replay(cfg, entries, 60 * 60 * 20);
      const elapsed = Date.now() - startedAt.current;
      const proof = buildSwimProof(cfg, entries, s, elapsed);
      const m = cfg.mode;
      const stars = m === MODE_RIDE ? rideStars(s) : m === MODE_RALLY ? (s.endReason === END_FINISH ? 1 : 0) : starsFor(s.score, QUEUE_STARS);
      const before = prog.runs;
      const key = runMode;
      const best = prog.best[key] ?? 0;
      const isBest = s.score > best;
      const next: SharkyProgress = {
        ...prog,
        runs: m === MODE_RALLY ? before : before + 1,
        best: { ...prog.best },
        recentStars: [...prog.recentStars, stars].slice(-5),
        ghosts: { ...prog.ghosts },
        rideTokens: { ...prog.rideTokens },
      };
      if (isBest) next.best[key] = s.score;
      if (isBest || !prog.ghosts[key]) {
        next.ghosts[key] = {
          seed: cfg.seed, mode: cfg.mode, tier: cfg.tier, difficulty: cfg.difficulty, runs: cfg.runs,
          score: s.score, finishStep: s.finishStep || s.step, inputs: encodeInputs(entries), name: 'Your best', at: Date.now(),
          splits: s.splitScores.slice(0, Math.max(1, s.gates)),
        };
      }
      if (rideId != null) next.rideTokens[String(rideId)] = (prog.rideTokens[String(rideId)] ?? 0) + s.tokens;
      let mu: (MissionUpdate & { rankCount: number }) | null = null;
      if (before >= 3 && m !== MODE_RIDE && m !== MODE_RALLY) {
        mu = applyRun(prog.missions, prog.rank, prog.rankCount ?? 0, cfg.tier, {
          skims: s.stSkims, closeSkims: s.stCloseSkims, perfects: s.stPerfects, frenzies: s.stFrenzies, tokens: s.tokens,
          chomps: s.stChomps, score: s.score, gates: s.gates, coins: s.stCoins, overdrives: s.stOverdrives, hits: s.stHits,
        }, cfg.seed);
        next.missions = mu.missions.filter((x) => !x.done);
        next.rank = mu.rank;
        next.rankCount = mu.rankCount;
      }
      setMissionView(mu);
      const card = m === MODE_QUEUE ? unlockCard(before, before + 1) : null;
      setProgress(next);
      void saveProgress(next);
      if (liveRally && round && rally.transport) {
        // Server-authoritative: the room replays this proof; the podium waits for it.
        rally.transport.submit(round.roundId, proof);
        setRallyDone(true);
        return;
      }
      const ghostSp = ghostSplits.current;
      const splits = s.splitScores.slice(0, s.gates).map((v, i) => (ghostSp[i] !== undefined ? v - ghostSp[i] : 0)).filter((_, i) => ghostSp[i] !== undefined);
      setResultsData({
        score: s.score,
        stars,
        won: m === MODE_RIDE ? stars > 0 : true,
        wipeout: s.hearts <= 0,
        newBest: isBest && best > 0,
        bestChainMult: Math.min(4, Math.floor(Math.min(s.maxChain, 9) / 3) + 1),
        closeSkims: s.stCloseSkims,
        nearMiss: nearMissLine(s, m, best, stars),
        splits,
        missions: mu,
        newCard: card,
        tokensAtRide: rideId != null ? next.rideTokens[String(rideId)] % 9 || (next.rideTokens[String(rideId)] ? 9 : 0) : null,
        fullClear: s.tokens >= 3,
        headline: reason === END_TIME ? 'TIME!' : reason === END_GATE ? 'RIDE GATE!' : reason === END_FINISH ? 'FINISH!' : 'WIPEOUT!',
      });
      setResult({
        score: s.score,
        stars,
        message: reason === END_TIME ? 'TIME!' : reason === END_GATE ? 'RIDE GATE!' : reason === END_FINISH ? 'FINISH!' : 'WIPEOUT!',
        maxCombo: s.maxChain,
        thresholds: m === MODE_RIDE ? RIDE_STARS : QUEUE_STARS,
        meta: {
          game: 'shark', score: s.score, seed: cfg.seed, mode: runMode, stars, reason,
          maxCombo: s.maxChain, closeSkims: s.stCloseSkims, tokens: s.tokens, hearts: s.hearts, distance: s.dist >> 8,
          duration: elapsed, swimProof: proof, walking: walk.walking, fps_p5: perf.summary().fpsP5,
        },
      });
    }, reason === END_TIME || reason === END_GATE || reason === END_FINISH ? 1100 : 450);
  }, [engine.log, cfg, prog, runMode, rideId, walk.walking, perf, liveRally, round, rally.transport]);

  const scoreAt = useCallback(() => ({ x: 40, y: Math.max(6, Math.min(12, layoutRef.current.skyH * 0.05)) + 20 }), []);
  const pipAt = useCallback((slot: number) => {
    const Lr = layoutRef.current;
    const barW = Math.min(170, Lr.w * 0.42);
    return { x: Lr.w / 2 + barW / 2 - 18 - slot * 22, y: Math.max(6, Math.min(12, Lr.skyH * 0.05)) + 19 };
  }, []);
  const gatesRef = useRef(0);
  gatesRef.current = gates;

  feelRef.current = useMemo(() => createSharkyFeel({
    fx,
    camera,
    clock: engine.clock,
    layout: () => layoutRef.current,
    calm: reducedMotion,
    rally: () => cfg.mode === MODE_RALLY,
    gates: () => gatesRef.current,
    quality: () => qualityRef.current,
    hooks: {
      onScore: (sc) => {
        setScore(sc);
        runOnUI((v: number) => {
          'worklet';
          shownScore.value = withTiming(v, { duration: v < shownScore.value ? 260 : 200, easing: Easing.out(Easing.quad) });
        })(sc);
      },
      onGate: (_bonus, kind, _step, g) => {
        if (kind === G_TIDE) {
          setGates(g);
          setInPocket(true);
        }
      },
      onGateBonus: () => {
        // Split vs your ghost / best at this gate (score at the gate, design 7.10).
        const s = engine.sim.value;
        const gi = Math.max(0, s.gates - 1);
        mySplits.current[gi] = s.score;
        const gv = ghostSplits.current[gi];
        const fxNow = engine.pres.value.fx;
        if (gv !== undefined) {
          const delta = s.score - gv;
          split.value = { delta, at: fxNow, label: `${delta >= 0 ? '+' : '-'}${Math.abs(delta)}` };
        } else if (cfg.mode === MODE_RIDE) {
          const need = RIDE_STARS.two - s.score;
          split.value = { delta: -need, at: fxNow, label: need > 0 ? `2 STARS -${need}` : `2 STARS +${-need}` };
        } else if (timedMode(cfg.mode)) {
          const next = s.score < QUEUE_STARS.one ? QUEUE_STARS.one : s.score < QUEUE_STARS.two ? QUEUE_STARS.two : QUEUE_STARS.three;
          if (s.score < next) split.value = { delta: 1, at: fxNow, label: `NEXT STAR +${next - s.score}` };
        }
        if (s.phase === 1 && s.pocketLen > 48) {
          const titles = ['Shipwreck Coaster', 'Storm Surge', 'Final Stretch'];
          postcard.value = { title: titles[Math.min(2, gi)], at: fxNow + 150, until: fxNow + (s.pocketLen * 1000) / 60 - 100 };
        }
      },
      onPocketEnd: () => setInPocket(false),
      onFrenzy: (on) => setFever(on),
      onOverdrive: (on) => {
        setOverdrive(on);
        // Live Rally: your Overdrive puffs a Bubble Gift to the rival behind you.
        if (on && liveRally && rally.transport) rally.transport.gift();
      },
      onFloat: (on) => setFloating(on),
      onFreeze: (on) => setFrozen(on),
      onWipeout: () => {
        if (timedMode(cfg.mode)) {
          setTimeout(() => setReviveOffer(true), 900);
          if (autoplay) setTimeout(() => engine.ext(EXT_REVIVE, 1), 1800);
        }
      },
      onRevive: () => setReviveOffer(false),
      onEnd: (reason) => {
        engine.setRunning(false);
        setReviveOffer(false);
        finish(reason);
      },
      onRivalDone: () => undefined,
      onCam: (du, y, step) => {
        const t = Date.now();
        if (liveRally && rally.transport && rallyGo && t - lastWhisper.current >= 100) {
          lastWhisper.current = t;
          const s = engine.sim.value;
          rally.transport.whisper(step, du, y, 0, s.score, s.crowd);
        }
        // Muffled when the shark stays below y 700 for 300ms+ (design 8.5).
        if (y > 700) {
          if (!deepSince.current) deepSince.current = t;
          if (t - deepSince.current > 300 && !deepRef.current) setDeep(true);
        } else {
          deepSince.current = 0;
          if (deepRef.current) setDeep(false);
        }
      },
      onRivalPos: () => undefined,
      onSprint: () => undefined,
      onGateNear: () => undefined,
      scoreAt,
      pipAt,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [camera, engine.clock, reducedMotion, cfg, finish, liveRally, rally.transport, rallyGo]);
  const lastWhisper = useRef(0);
  const deepRef = useRef(false);
  deepRef.current = deep;

  // Reset the sim for every run (rematch, ghost, rally).
  const [rivalNames, setRivalNames] = useState<string[]>([]);
  useEffect(() => {
    if (!progress) return;
    endedRef.current = false;
    setScore(0);
    setFever(false);
    setOverdrive(false);
    setFloating(false);
    setInPocket(false);
    setGates(0);
    setReviveOffer(false);
    setFrozen(false);
    runOnUI(() => {
      'worklet';
      shownScore.value = 0;
    })();
    let rv: Array<RivalSpec | null> = [];
    const names: string[] = [];
    mySplits.current = [];
    ghostSplits.current = [];
    if (round) {
      // Live rally: ghost seats replay the room's planned logs; humans arrive as whispers.
      seatToSlot.current = {};
      round.seats.filter((st) => st.seat !== round.you).slice(0, 3).forEach((st, j) => {
        seatToSlot.current[st.seat] = j;
        names.push(st.kind === 'bot' ? `GHOST ${st.name}` : st.name);
        rv.push(st.kind === 'bot' && st.inputs ? { cfg: rallyConfig(round.seed), log: decodeInputs(st.inputs) } : { remote: true });
      });
      setRallyGo(false);
      setRallyDone(false);
    } else if (ghost) {
      rv = [{ cfg: { seed: ghost.seed, mode: ghost.mode, difficulty: ghost.difficulty, tier: ghost.tier, runs: ghost.runs }, log: decodeInputs(ghost.inputs) }];
      names.push(`GHOST ${ghost.name}`);
      ghostSplits.current = ghost.splits ?? [];
    } else if (cfg.mode === MODE_RALLY) {
      // Ghost Rally (async): labeled ghost seats planned once, then replayed in lockstep.
      rv = RALLY_HOUSE_CREW.slice(0, 3).map((c, j) => {
        const plan = planRun({ ...cfg }, BOT_PROFILES[c.profile], hash2(cfg.seed, j + 101), RALLY_MAX_STEPS);
        names.push(`GHOST ${c.name}`);
        return { cfg: { ...cfg }, log: plan.log };
      });
    } else {
      // Splits against your best on this mode (score at each gate).
      ghostSplits.current = prog.ghosts[runMode]?.splits ?? [];
    }
    setRivalNames(names);
    slotNames.current = names;
    engine.reset(cfg, rv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey, progress == null, round?.roundId]);

  // Live rivals: 10 Hz display whispers (with live scores), interpolated on the UI thread.
  useEffect(() => {
    if (!rally.transport) return undefined;
    const last: Record<number, { d: number; at: number }> = {};
    const offW = rally.transport.onWhisper((w) => {
      const slot = seatToSlot.current[w.seat];
      if (slot === undefined) return;
      const prev = last[w.seat];
      const t = Date.now();
      const vel = prev && t > prev.at ? ((w.d - prev.d) * 1000) / (t - prev.at) : 0;
      last[w.seat] = { d: w.d, at: t };
      engine.remote(slot, w.d, w.y, Math.max(0, Math.min(1000, vel)), w.score, w.crowd);
    });
    // A server-stamped Bubble Gift: the sim places a 5-coin line in your lane.
    const offG = rally.transport.onGift((g) => engine.ext(EXT_BUBBLE_GIFT, g.eventId));
    return () => {
      offW();
      offG();
    };
  }, [rally.transport, engine]);

  const onRallyGo = useCallback(() => {
    setRallyGo(true);
    startedAt.current = Date.now();
    engine.clock.resume();
    engine.setRunning(true);
  }, [engine]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init();
    return undefined;
  }, [visible]);
  useStudioAudio('sharky', ['sk_ring', 'sk_ring_perfect', 'sk_skim', 'sk_bump', 'sk_close_glint', 'sk_tide_gate', 'sh_chomp', 'sk_coin_k0', 'sk_graze']);

  // Music (8.5): Chris's track-3 loop-edit; the key rises each Tide Gate;
  // muffled in pockets, Float and deep water; lift in Frenzy and Overdrive.
  const key = gates >= 2 ? '_p4' : gates === 1 ? '_p2' : '';
  const state: SharkyMusicState = fever || overdrive ? 'lift' : inPocket || floating || frozen || deep ? 'muffled' : 'open';
  const bed = sharkyBed(key, state, fever);
  const prevKey = useRef(key);
  const stateOnly = prevKey.current === key;
  prevKey.current = key;
  useSharkyMusic(visible && !result ? bed : null, stateOnly && !fever);

  // --- input: one thumb, one verb (design 3.1): hold = swim up, release = sink ----
  const input = engine.input;
  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e, mgr) => {
      'worklet';
      mgr.activate();
      const inp = input.value;
      if (inp.fingers === 0) {
        inp.q.push(IN_PRESS, 0, 0);
        inp.holding = true;
      }
      inp.fingers = e.numberOfTouches;
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
    if (liveRally) return; // the server's synced GO starts a live rally
    startedAt.current = Date.now();
    engine.clock.resume();
    engine.setRunning(true);
  }, [engine, liveRally]);

  const onPause = useCallback(() => {
    engine.clock.pause();
    rally.transport?.background(true);
    runOnUI(() => {
      'worklet';
      const inp = input.value;
      if (inp.holding) inp.q.push(IN_RELEASE, 0, 0);
      inp.holding = false;
      inp.fingers = 0;
    })();
  }, [engine, input, rally.transport]);

  const onResume = useCallback(() => {
    rally.transport?.background(false);
    engine.ext(EXT_PAUSE_RESUME, 0);
    engine.clock.resume();
  }, [engine, rally.transport]);

  const onRematch = useCallback(() => {
    setGhost(null);
    setRunMode(mode);
    setResult(null);
    setResultsData(null);
    setMissionView(null);
    setRunIdx((n) => n + 1);
  }, [mode]);

  const onChallenge = useCallback(() => {
    // Ghost Rally: your best ghost on its exact course early, labeled ghost seats from unlock 3.
    const g = progress?.ghosts[mode] ?? null;
    setResult(null);
    setResultsData(null);
    if (g && (progress?.runs ?? 0) < 3) {
      setGhost(g);
      setRunMode('ghost');
    } else {
      setGhost(null);
      setRunMode('rally');
    }
    setRunIdx((n) => n + 1);
  }, [progress, mode]);

  const onWrapUp = useCallback(() => {
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

  const renderResults = useCallback((args: ShellResultsArgs) => {
    if (!resultsData) return null;
    return (
      <SharkyResults
        data={resultsData}
        playAgain={args.rematch}
        claim={args.claim}
        claimLabel={runMode === 'ride' ? (args.won ? 'COLLECT' : 'CONTINUE') : 'DONE'}
        challenge={args.challenge}
        challengeLabel={prog.runs < 3 ? 'Race my ghost' : 'Rally a ghost'}
        reducedMotion={args.reducedMotion}
      />
    );
  }, [resultsData, runMode, prog.runs]);

  const title = runMode === 'ride' ? 'Ride Challenge' : runMode === 'rally' ? 'Rally' : runMode === 'ghost' ? 'Ghost Rally' : 'Sharky Swim';
  const objective = runMode === 'ride'
    ? 'Reach the Ride Gate. Hold to swim up, let go to sink.'
    : cfg.tier === 0 ? 'Hold anywhere to swim up. Let go to sink.' : 'Skim close past the sparkle halos to build your chain.';

  return (
    <GameShellV2
      key={`sharky-${runIdx}`}
      ref={shell}
      visible={visible}
      title={title}
      subtitle={courseLabel(rideCategory)}
      score={result?.score ?? score}
      multiplier={1}
      fever={fever}
      hideHeaderScore
      personalBest={prog.best[runMode] ?? 0}
      objective={objective}
      result={result}
      thresholds={cfg.mode === MODE_RIDE ? RIDE_STARS : QUEUE_STARS}
      gameId="sharky"
      sessionKey={`sharky:${rideId ?? 0}:${cfg.seed}`}
      movementPolicy="playThrough"
      countdownStyle={runIdx > 0 ? 'go' : 'full'}
      countdownScrim="light"
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
      challengeLabel={prog.runs < 3 ? 'Race my ghost' : 'Rally a ghost'}
      renderResults={renderResults}
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
                    pres={engine.pres}
                    tick={engine.tick}
                    alpha={engine.alpha}
                    rivalColors={RIVAL_COLORS}
                    reducedMotion={reducedMotion}
                    quality={perfTier.tierJs}
                  />
                </Animated.View>
                <SharkyHud layout={layout} sim={engine.sim} pres={engine.pres} rivals={engine.rivals} tick={engine.tick}
                  shownScore={shownScore} split={split} postcard={postcard} rivalColors={RIVAL_COLORS} />
                <FxStage ref={fx} width={layout.w} height={layout.h} timeScale={engine.clock.fxScale} reducedMotion={reducedMotion} />
              </>
            ) : null}

            {rivalNames.length ? (
              <View pointerEvents="none" style={[styles.pills, { top: (layout?.skyH ?? 120) - 30 }]}>
                {rivalNames.map((n, j) => (
                  <View key={`${n}-${j}`} style={[styles.pill, { borderColor: RIVAL_COLORS[j] }]}>
                    <Text style={styles.pillText} numberOfLines={1}>{n}</Text>
                  </View>
                ))}
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

            {liveRally && !round && !rally.state.results ? (
              <RallyLobby state={rally.state} crew={RALLY_HOUSE_CREW.map((c) => c.name)} onReady={() => rally.transport?.ready()}
                onLeave={onClose} toLocal={(ms) => rally.transport?.toLocal(ms) ?? ms} />
            ) : null}
            {liveRally && round && !rallyGo && !rallyDone ? (
              <RallyCountIn round={round} toLocal={(ms) => rally.transport?.toLocal(ms) ?? ms} onGo={onRallyGo} />
            ) : null}
            {liveRally && (rallyDone || rally.state.results) ? (
              <RallyPodium results={rally.state.results} you={round?.you ?? -1} verdict={rally.state.entryVerdict}
                nextAtMs={rally.state.nextLobbyAtMs} toLocal={(ms) => rally.transport?.toLocal(ms) ?? ms}
                onAgain={() => { setRallyDone(false); rally.transport?.ready(); }}
                onSolo={() => { setRunMode('queue'); setRunIdx((n) => n + 1); }}
                onLeave={onClose} />
            ) : null}

            {__DEV__ ? <PerfOverlay probe={perf} style={styles.perf} extra={() => {
              const s = engine.sim.value;
              return `x${multiplier(s)} t${chainTier(s)} ${walk.walking ? 'walking' : ''}`;
            }} /> : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#7fd3ff' },
  pills: { position: 'absolute', right: 10, flexDirection: 'row' },
  pill: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, borderWidth: 3, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 6, maxWidth: 120 },
  pillText: { fontFamily: 'Knockout', fontSize: 12, color: INK },
  freeze: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(235,248,255,0.55)' },
  freezeBubble: { backgroundColor: NEUTRAL, borderRadius: 999, borderWidth: 4, borderColor: INK, paddingHorizontal: 26, paddingVertical: 14 },
  freezeText: { fontFamily: 'Shark', fontSize: 30, color: INK },
  revive: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reviveCard: { width: '80%', backgroundColor: '#fff8e4', borderRadius: 24, borderWidth: 4, borderColor: INK, padding: 20, alignItems: 'center' },
  reviveTitle: { fontFamily: 'Shark', fontSize: 34, color: INK },
  reviveBody: { fontFamily: 'Knockout', fontSize: 16, color: INK, textAlign: 'center', marginVertical: 10 },
  reviveBtn: { backgroundColor: REWARD, borderRadius: 999, borderWidth: 4, borderColor: INK, paddingHorizontal: 40, paddingVertical: 12, marginTop: 4 },
  reviveBtnText: { fontFamily: 'Shark', fontSize: 28, color: INK },
  reviveSkip: { fontFamily: 'Knockout', fontSize: 15, color: INK, marginTop: 12, opacity: 0.8 },
  perf: { top: undefined, bottom: 4, left: 4, right: undefined },
});

export default SharkySwim;
