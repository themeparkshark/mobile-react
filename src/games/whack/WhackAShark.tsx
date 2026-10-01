/**
 * WhackAShark: "Bonk Rush" v4 (design: tps-prime-time-audit/studio/design/whack.md).
 *
 * A glance-safe arcade whack built from short authored Bursts:
 *   - Queue Run: 4 Bursts (12/13/14s, then the finale: Golden Rush, or a Boss
 *     Run every 3rd Run of the park day) with open breathers. A full Bonk
 *     Meter banks ("FEVER READY") and is fired from the breather (GO FEVER).
 *   - Line of the Day: the same 4-Burst Run on today's seed for this ride's
 *     line, racing the named ghosts just above your best rank.
 *   - Ride Challenge: one 30s Burst with a 13-notch Coin Meter; the proof
 *     replays server-side; a win plays the Final Bonk cam and a Coin Rush.
 *   - Daily Bonk, Bonk Battle duels and Crew Raids on shared seeds.
 *
 * Walk-safe: movement is never an input. Auto Look-Up freezes the board
 * before a target can escape a player who looked up at the line; one tap
 * resumes (no countdown). Backgrounding snapshots and resumes instantly.
 *
 * Runtime split: the sim + render state live on the UI thread
 * (useWhackRuntime); this component only reacts to batched sim events for
 * audio, haptics and FX, and owns the Burst / breather / result flow.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { LogBox, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, type SharedValue } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deckIdForRideName } from '../../services/rideTheme';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { StampLayer, type StampLayerHandle } from '../../gamekit/fx/StampLayer';
import { useCamera } from '../../gamekit/fx/useCamera';
import { useFinisher } from '../../gamekit/fx/useFinisher';
import { TIER_NAMES, TIER_SCALES } from '../../gamekit/core/perfTier';
import { usePerfTier } from '../../gamekit/perf/usePerfTier';
import { useThermal } from '../../gamekit/perf/useThermal';
import { THERMAL_NAMES, THERMAL_SCALES } from '../../gamekit/core/thermal';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { playPattern } from '../../gamekit/Haptics';
import { WHACK_PRIO } from '../../gamekit/core/hapticBus';
import { forEachEvent } from '../../gamekit/core/eventRing';
import { starsFor, nextStarGoal } from '../../gamekit/core/scoring';
import { deriveRunSeed } from '../../gamekit/core/rng';
import { useWhackCues, useWhackJuice, pickCue as pick } from './useWhackJuice';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { PerfOverlay, usePerfProbe } from '../../gamekit/perf/PerfOverlay';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BOSS_ART, THEMED_SHARK_FRAMES, THEMES, type WhackTheme } from './assets';
import { buildBurst, walkOk, type Timeline, type WalkBoost } from './timeline';
import {
  E_ATTACK, E_BLOCKED, E_BOSS_DMG, E_BOSS_DOWN, E_END, E_SPLAT, E_SPLAT_CLEAR, E_WIN, NO_CARRY, createSim, type BurstCarry, type BurstResult,
} from './sim';
import { buildProof, type WhackProofV4 } from './proof';
import {
  PTS_CRIT, PTS_DOUBLE, PTS_FINN, PTS_GOLDEN, RIDE_WIN_NOTCHES, RUN_STARS, WALK_BOOST_EVERY, WALK_PCT_PER_M, burstCount, isBossRun,
  type Difficulty, type WhackFormat,
} from './waves';
import { A_CANDY, A_FADE, A_INK, A_SCAN, BOSS_NAMES } from './timeline';
import { computeLayout, type BoardLayout } from './render/layout';
import { boxesFor, poseScaleFor } from './render/boxes';
import { WhackBoard, useBoardImages } from './render/WhackBoard';
import { useWhackRuntime } from './useWhackRuntime';
import { Banner, Breather, DuelCard } from './ui/Overlays';
import { duelTimeline } from './net/duel';
import { ghostFromRun, ghostHitsBetween, paceAt, pbGhostKey } from './net/ghost';
import { createLocalNetAdapter } from './net/localAdapter';
import { ghostDeltaLine, lineDaySeed, lineDayXform, parkLocalDate, type LineDayEntry } from './net/lineDay';
import { applyMastery, applyRunToBook, cardTitle, nextRunOfDay, type CardBook, type FinnCard, type MasteryBook } from './meta/collection';
import type { DuelReveal, WhackDuelConfig, WhackGhost, WhackNetAdapter, WhackRaidConfig } from './net/types';

registerStudioAudio(['whack', 'boss']);

export type { WhackTheme };

export interface BurstBanked {
  index: number;
  score: number;
  result: BurstResult;
  proof: WhackProofV4;
}

export interface WhackASharkProps {
  visible: boolean;
  /** 'ride' = paid Ride Challenge (one 30s Burst); 'queue' = LinePlay Run; 'lineDay' = Line of the Day. */
  format?: WhackFormat;
  /** Resolved ride theme (queue passes it); otherwise derived from taskName. */
  theme?: WhackTheme;
  taskName?: string;
  /** The ride whose line this is (Line of the Day seed, Finn cards, mastery). */
  rideId?: string | number;
  userId?: number | string;
  difficulty?: Difficulty;
  /** Server-issued seed (ride attempt seed). */
  seed?: number;
  /** Lifetime Bursts from the server profile (local cache when absent). */
  unlockLevel?: number;
  /** Run of the park day (server profile); drives the Boss Run cadence. Local count when absent. */
  runOfDay?: number;
  /** WS5: meters walked in line (GPS + pedometer). Falls back to local step sense. */
  walkMeters?: SharedValue<number> | number;
  ghost?: WhackGhost | null;
  /** Line of the Day rivals (the 3 just above your best), each with one verified ghost per Burst. */
  lineDay?: { rivals: LineDayEntry[]; myBest?: number | null } | null;
  duel?: WhackDuelConfig | null;
  raid?: WhackRaidConfig | null;
  net?: WhackNetAdapter | null;
  autoplay?: boolean;
  onBurstBanked?: (b: BurstBanked) => void;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onQuit?: (resume: () => void) => void;
}

export interface WhackHandle {
  /** "Your ride's up!" / boarding: bank everything so far, including the live Burst. */
  bankAndExit: () => void;
}

const LIFETIME_KEY = '@whack/lifetime_bursts';
const RUN_OF_DAY_KEY = '@whack/run_of_day';
const CARDS_KEY = '@whack/finn_cards';
const MASTERY_KEY = '@whack/mastery';
const PB_KEY = '@whack_a_shark/best';
const pbKeyFor = (f: WhackFormat) => (f === 'ride' ? '@whack_a_shark/ride_best' : f === 'queue' ? PB_KEY : `@whack_a_shark/best_${f}`);
const GOLD = '#ffcf3b';
/** Star slams on the win stinger's beat (129.2 BPM quarter notes). */
const STAR_STEP_MS = 464;
const GHOST_COLORS = ['#ff9f1c', '#1fc8b8', '#ff6b5c'];

type Phase = 'play' | 'finish' | 'breather' | 'done';

function formatName(f: WhackFormat): string {
  return f === 'ride' ? 'Ride Challenge' : f === 'duel' ? 'Bonk Battle' : f === 'raid' ? 'Crew Raid' : f === 'daily' ? 'Daily Bonk'
    : f === 'lineDay' || f === 'weekly' ? 'Line of the Day' : 'Bonk Rush';
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export const WhackAShark = forwardRef<WhackHandle, WhackASharkProps>(function WhackAShark(props, ref) {
  const {
    visible, taskName, onComplete, onClose, onQuit, onBurstBanked, walkMeters, ghost: ghostProp, duel, raid,
  } = props;
  const format: WhackFormat = props.format ?? 'queue';
  const ride = format === 'ride';
  const lineRun = format === 'lineDay' || format === 'weekly';
  const devAuto = __DEV__ && process.env.EXPO_PUBLIC_GAME_AUTOPLAY === '1';
  const autoplay = !!props.autoplay || devAuto;
  const difficulty: Difficulty = props.difficulty ?? 2;
  const rideKey = props.rideId != null ? String(props.rideId) : (taskName ?? null);
  const [runIndex, setRunIndex] = useState(0);
  // Dev bench: EXPO_PUBLIC_WHACK_THEME=cycle walks the 6 themes, one per PLAY AGAIN (screenshot matrix).
  const cycle = __DEV__ && (props.theme as string) === 'cycle';
  const theme: WhackTheme = useMemo(() => {
    if (cycle) return THEMES[runIndex % THEMES.length];
    if (props.theme && props.theme in THEMED_SHARK_FRAMES) return props.theme;
    const deck = deckIdForRideName(taskName);
    return (deck in THEMED_SHARK_FRAMES ? deck : 'park') as WhackTheme;
  }, [props.theme, taskName, cycle, runIndex]);
  const reducedMotion = useReducedGameMotion();
  const shellRef = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const stamps = useRef<StampLayerHandle>(null);
  const perf = usePerfProbe(visible);
  // Perf tier (full / lite / min) and the thermal ladder: an older or hot phone keeps 60fps by thinning particles, never by dropping a tell.
  const perfTier = usePerfTier({ active: visible });
  const tierScale = TIER_SCALES[perfTier.tierJs] ?? TIER_SCALES[0];
  const thermal = useThermal({ active: visible });
  const thermalScale = THERMAL_SCALES[thermal.levelJs] ?? THERMAL_SCALES[0];
  const thermalMax = useRef(0);
  thermalMax.current = Math.max(thermalMax.current, thermal.levelJs);
  const net = useMemo(() => props.net ?? ((format === 'duel' || format === 'raid') ? createLocalNetAdapter({ rivalName: duel?.rival.name ?? 'Captain Fin' }) : null), [props.net, format, duel?.rival.name]);
  const today = useMemo(() => parkLocalDate(Date.now()), []);

  // ---------------------------------------------------------------- layout
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const L: BoardLayout | null = useMemo(() => (field ? computeLayout(field.w, field.h, theme) : null), [field, theme]);
  const geo = useSharedValue<BoardLayout>(computeLayout(390, 700, theme));
  const boxes = useSharedValue<number[][]>(boxesFor(theme));
  const poseScale = useSharedValue<number[]>(poseScaleFor(theme));
  useEffect(() => {
    if (L) geo.value = L;
  }, [L, geo]);
  useEffect(() => {
    boxes.value = boxesFor(theme);
    poseScale.value = poseScaleFor(theme);
  }, [theme, boxes, poseScale]);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);
  const Lref = useRef<BoardLayout | null>(null);
  Lref.current = L;

  // ---------------------------------------------------------------- run state
  const [phase, setPhase] = useState<Phase>('play');
  const [burstIdx, setBurstIdx] = useState(0);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [fever, setFever] = useState(false);
  const [shellScore, setShellScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [banner, setBanner] = useState<{ text: string | null; sub?: string | null; color?: string; stamp: number }>({ text: null, stamp: 0 });
  const [breather, setBreather] = useState<null | {
    burstScore: number; runScore: number; stats: { label: string; value: string }[]; next: string; readyAt: number; goal: string | null;
    duelLine: string | null; incoming: number; feverReady: boolean; bossNext: boolean; boost: boolean;
  }>(null);
  const [readyOn, setReadyOn] = useState(false);
  const [reveal, setReveal] = useState<DuelReveal | null>(null);
  const [lifetime, setLifetime] = useState<number | null>(props.unlockLevel ?? null);
  const [best, setBest] = useState(0);

  const runSeedRef = useRef(0);
  const runOfDayRef = useRef(props.runOfDay ?? 0);
  const bankedRef = useRef<BurstBanked[]>([]);
  const carryRef = useRef<BurstCarry>(NO_CARRY);
  const interrupts = useRef<[number, number, string][]>([]);
  const pauseAt = useRef<{ wall: number; gt: number; reason: string } | null>(null);
  const tlRef = useRef<Timeline | null>(null);
  const incomingRef = useRef<number[]>(duel?.incomingSplats ?? []);
  const duelWinsRef = useRef<[number, number]>(duel?.wins ?? [0, 0]);
  /** Rival's verified Burst totals so far (duel), for the near-miss line on the card. */
  const rivalTotalRef = useRef(0);
  const walkBaseRef = useRef(0);
  const lastBoostRef = useRef(-9);
  const boostedRunRef = useRef(false);
  const pendingBoost = useRef<WalkBoost>(null);
  const startWall = useRef(Date.now());
  const ghostRef = useRef<WhackGhost | null>(ghostProp ?? null);
  const finishing = useRef(false);
  const raidRef = useRef<{ hpNow: number; hpMax: number; defeated: boolean } | null>(null);
  const winRef = useRef<{ at: number; ms: number } | null>(null);

  // Lifetime Bursts (unlock ladder) and the personal best.
  useEffect(() => {
    let alive = true;
    if (props.unlockLevel == null) {
      AsyncStorage.getItem(LIFETIME_KEY).then((v) => { if (alive) setLifetime(v ? parseInt(v, 10) || 0 : 0); }).catch(() => alive && setLifetime(0));
    }
    AsyncStorage.getItem(pbKeyFor(format)).then((v) => { if (alive && v) setBest(parseInt(v, 10) || 0); }).catch(() => undefined);
    return () => { alive = false; };
  }, [props.unlockLevel, format]);

  /** Run of the park day: the server's when given, else a local count per park-local date. */
  const claimRunOfDay = useCallback(async () => {
    if (props.runOfDay != null) { runOfDayRef.current = props.runOfDay; return; }
    if (ride) return;
    const stored = await readJson<{ date: string; n: number }>(RUN_OF_DAY_KEY);
    const next = nextRunOfDay(stored, today);
    runOfDayRef.current = next.runOfDay;
    AsyncStorage.setItem(RUN_OF_DAY_KEY, JSON.stringify({ date: next.date, n: next.n })).catch(() => undefined);
  }, [props.runOfDay, ride, today]);

  const totalBursts = burstCount(format);
  const baseSeed = props.seed ?? 20260930;
  const lineSeed = useMemo(() => lineDaySeed(rideKey ?? 'ride', today), [rideKey, today]);
  const lineXform = useMemo(() => lineDayXform(lineSeed, props.userId ?? 0), [lineSeed, props.userId]);

  const buildTimeline = useCallback((bi: number, runIdx: number, feverFired = false): Timeline => {
    if (format === 'duel' && duel) return duelTimeline(duel.matchSeed, bi, difficulty, theme, lifetime ?? 0, incomingRef.current);
    if (format === 'duel') return duelTimeline(baseSeed, bi, difficulty, theme, lifetime ?? 0, incomingRef.current);
    const seed = lineRun ? (props.seed ?? lineSeed)
      : ride || format === 'daily' || format === 'raid' ? (raid ? raid.raidSeed : baseSeed) : deriveRunSeed(baseSeed, runIdx);
    runSeedRef.current = seed;
    return buildBurst({
      seed, burstIndex: bi, format, difficulty, theme, unlockLevel: lifetime ?? 0,
      xform: lineRun ? lineXform : 0,
      walkBoost: walkOk(format) ? pendingBoost.current : null,
      runOfDay: runOfDayRef.current,
      feverFired,
    });
  }, [format, duel, difficulty, theme, lifetime, baseSeed, ride, raid, lineRun, props.seed, lineSeed, lineXform]);

  // ---------------------------------------------------------------- audio
  const cues = useWhackCues(visible);

  const shape = tl?.shape ?? 'b1';
  const bed = !visible || result ? null
    : fever ? pick('mus_whack_fever', 'chris.track1')
      : shape === 'b5' || shape === 'raid' ? pick('mus_whack_boss', 'chris.track1')
        : shape === 'b3' || shape === 'b4' || shape === 'rush' ? pick('mus_whack_intense', 'chris.track1')
          : pick('mus_whack_main', 'chris.track1');
  useGameMusic(bed, { at: 'bar' });
  useEffect(() => {
    GameAudio.music.setState(phase === 'breather' ? 'muffled' : 'open', 250);
  }, [phase]);

  // ---------------------------------------------------------------- walk sense (fallback for walkMeters)
  const walk = useWalkSense({ active: visible && !result });
  const metersNow = useCallback((): number => {
    if (typeof walkMeters === 'number') return walkMeters;
    if (walkMeters && typeof walkMeters === 'object') return walkMeters.value;
    return walk.state.current.steps * 0.7;
  }, [walkMeters, walk.state]);
  const camera = useCamera({ width: field?.w ?? 390, height: field?.h ?? 700, timeScale: undefined, reducedMotion, walking: walk.walking });

  // ---------------------------------------------------------------- sim events (JS)
  const onEventsRef = useRef<(batch: number[]) => void>(() => undefined);
  const onEvents = useCallback((batch: number[]) => onEventsRef.current(batch), []);
  const runtime = useWhackRuntime({ geo, boxes, poseScale, onEvents });
  const bossFx = useSharedValue({ rise: 0, flinch: 0, flash: 0, ghost: 1, sink: 0 });
  const pace = useSharedValue(0);
  const finisher = useFinisher({
    clock: runtime.clock, camera, fx, stamps, width: field?.w ?? 390, height: field?.h ?? 700,
    stinger: ride ? cues.stingWin : cues.stingBoss, reducedMotion,
  });
  // The shared Bonk Rush feel layer (tells, grades, crits, goldens, combo slab, tiers, fever).
  const juice = useWhackJuice({
    fx, stamps, camera, cues, runtime, layout: Lref, width: field?.w ?? 390, reducedMotion, walking: walk.walking, onFever: setFever,
  });
  const feel = juice.fire;
  const HUD = juice.hud;
  const holeXY = juice.holeXY;
  const liveScoreRef = juice.liveScore;

  // Ride Coin Rush overflow (6.3): remaining whole seconds become a cosmetic coin cascade.
  const coinRush = useCallback((secs: number, delay: number) => {
    const G = Lref.current;
    if (!G || secs <= 0) return;
    const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
    for (let k = 0; k < secs; k++) {
      setTimeout(() => {
        const h = order[k % 9];
        const x = G.cx[h];
        const y = G.my[h] - G.spriteH[h] * 0.45;
        fx.current?.ring(x, y, { color: GOLD, from: 10, to: 60, ms: 220 });
        fx.current?.burst('coins', x, y, { count: 6 });
        fx.current?.burst('stars', x, y, { count: 4 });
        GameAudio.playLadder(cues.coinTick, Math.min(12, k * 2));
      }, delay + k * 200);
    }
  }, [cues.coinTick]);

  onEventsRef.current = (batch) => {
    const G = Lref.current;
    const now = Date.now();
    forEachEvent(batch, (kind, a, b, c) => {
      if (kind === E_WIN && G) {
        // Final Bonk cam (8.9) on the winning hit: freeze, 0.25x, push-in, rings, confetti, stinger.
        const t = tlRef.current;
        const ms = finisher.run('rideWin', { x: G.w / 2, y: G.deckTop + (G.h - G.deckTop) * 0.45, text: 'COIN CAUGHT!', stampColor: GOLD });
        winRef.current = { at: now, ms: ms + 300 };
        void runtime.mirror().then((m) => {
          const secs = Math.min(6, Math.floor(((t ? t.lengthMs : 30000) - m.t) / 1000));
          coinRush(secs, Math.round(ms * 0.55));
          winRef.current = { at: now, ms: Math.max(ms, Math.round(ms * 0.55) + secs * 200) + 300 };
        });
      }
      if (juice.handle(kind, a, b, c, now)) return;
      switch (kind) {
        case E_ATTACK: {
          if (a === A_INK || a === A_CANDY) {
            GameAudio.play(cues.inkWhistle, { pan: ((b % 3) - 1) * 0.6, volume: 0.8 });
          } else if (a === A_FADE) GameAudio.play(cues.fade, { volume: 0.8 });
          else if (a === A_SCAN) GameAudio.play(cues.scan, { volume: 0.8 });
          bossFx.value = { ...bossFx.value, flinch: -10 };
          setTimeout(() => { bossFx.value = { ...bossFx.value, flinch: 0 }; }, 160);
          break;
        }
        case E_SPLAT:
          feel('splat', { ...holeXY(a) });
          if (a >= 0 && !splatHint.current) {
            splatHint.current = true;
            flash(b === A_CANDY ? 'CANDY SPLAT! SWIPE IT' : 'SWIPE THE INK!', null, '#ffffff', 1400);
          }
          break;
        case E_SPLAT_CLEAR:
          feel('squeegee', { ...holeXY(a) });
          break;
        case E_BLOCKED:
          GameAudio.play(cues.blocked);
          if (G) fx.current?.flyUp('BLOCKED!', G.w / 2, G.deckTop - 20, { size: 'lg', color: '#7fd6ff' });
          break;
        case E_BOSS_DMG: {
          const cur = bossFx.value;
          bossFx.value = { ...cur, flinch: 8, flash: 1 };
          setTimeout(() => { bossFx.value = { ...bossFx.value, flinch: -5 }; }, 60);
          setTimeout(() => { bossFx.value = { ...bossFx.value, flinch: 0, flash: 0 }; }, 120);
          setTimeout(() => {
            const s = tlRef.current;
            if (s && s.bossHp > 0) bossFx.value = { ...bossFx.value, ghost: b / s.bossHp };
          }, 250);
          if (G) feel('bossHit', { x: G.w * 0.74, y: G.deckTop - 60 });
          break;
        }
        case E_BOSS_DOWN: {
          liveScoreRef.current += a;
          const s = tlRef.current;
          if (G) {
            finisher.run('bossDefeat', { x: G.w * 0.74, y: G.deckTop - 60, text: 'BOSS BONKED!', stampColor: GOLD });
            feel('bossDown', { x: G.w * 0.74, y: G.deckTop - 60, text: `+${a}`, magnetTo: HUD });
          }
          GameAudio.play(cues.bossKo[s?.bossKind ?? 0]);
          bossFx.value = { ...bossFx.value, sink: 0 };
          const t0 = Date.now();
          const sinkIv = setInterval(() => {
            const k = Math.min(1, (Date.now() - t0) / 700);
            bossFx.value = { ...bossFx.value, sink: k * k };
            if (k >= 1) clearInterval(sinkIv);
          }, 16);
          setTimeout(() => flash('VICTORY LAP!', 'EVERY BONK IS QUICK', GOLD, 1400), 1400);
          break;
        }
        case E_END:
          void onBurstEnd(a === 1);
          break;
        default:
          break;
      }
    });
  };
  const splatHint = useRef(false);

  // Pace line, Line of the Day ghost pucks and last-3s pips (4 Hz, JS). The runtime
  // handle changes identity every render, so the interval reads it through a ref.
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const ghostT = useRef(0);
  const busyRef = juice.busy;
  useEffect(() => {
    if (!visible) return undefined;
    let lastPip = -1;
    const iv = setInterval(() => {
      if (phase !== 'play') return;
      void runtimeRef.current.mirror().then((m) => {
        const t = tlRef.current;
        const G = Lref.current;
        if (!t || m.ended) return;
        const left = Math.ceil((t.lengthMs - m.t) / 1000);
        if (left <= 3 && left >= 1 && left !== lastPip && !m.frozen) {
          lastPip = left;
          GameAudio.play(cues.tick, { volume: 0.6 });
          // Countdown ticks never buzz while targets are up (11.2).
          if (busyRef.current.size === 0) playPattern('lookUpResume', { priority: WHACK_PRIO.flow });
        }
        // Header score from the sim itself (exact; the board never re-renders for it).
        setShellScore(bankedRef.current.reduce((s, x) => s + x.score, 0) + m.score);
        const g = ghostRef.current;
        if (g) pace.value = m.score - paceAt(g, m.t);
        // Line of the Day: named ghost pucks flash on the wells they hit (mapped through mine o theirs^-1).
        const rivals = props.lineDay?.rivals ?? [];
        if (G && rivals.length && m.t > ghostT.current) {
          rivals.slice(0, 3).forEach((r, i) => {
            const gb = r.ghosts?.[t.input.burstIndex];
            if (!gb) return;
            for (const h of ghostHitsBetween(gb, ghostT.current, m.t, (t.input.xform ?? 0) & 7)) {
              fx.current?.flyUp(r.name.split(' ')[0].toUpperCase(), G.cx[h] + (i - 1) * 14, G.my[h] - G.spriteH[h] * 0.2, { size: 'sm', color: GHOST_COLORS[i] });
            }
          });
        }
        ghostT.current = m.t;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [visible, phase, cues, pace, props.lineDay, busyRef]);

  // ---------------------------------------------------------------- flow
  const flash = useCallback((text: string, sub: string | null = null, color = '#ffffff', ms = 1100) => {
    setBanner({ text, sub, color, stamp: Date.now() });
    setTimeout(() => setBanner((b) => (b.text === text ? { ...b, text: null, sub: null } : b)), ms);
  }, []);

  const startBurst = useCallback((bi: number, runIdx: number, withSlam: boolean, feverFired = false) => {
    if (feverFired) carryRef.current = { ...carryRef.current, feverReady: false, meter: 0 };
    const t = buildTimeline(bi, runIdx, feverFired);
    tlRef.current = t;
    setTl(t);
    setBurstIdx(bi);
    splatHint.current = false;
    ghostT.current = 0;
    winRef.current = null;
    const sim = createSim(t, carryRef.current);
    juice.reset(carryRef.current.streak);
    setFever(t.feverStart || (carryRef.current.feverLeft > 0 && t.fever));
    bossFx.value = { rise: 0, flinch: 0, flash: 0, ghost: 1, sink: 0 };
    setPhase('play');
    const go = () => {
      runtime.start(sim, autoplay);
      startWall.current = Date.now();
      interrupts.current = [];
      if (t.boss) {
        const roar = cues.bossRoar[t.bossKind] ?? cues.bossRoar[0];
        GameAudio.play(roar);
        playPattern('champSlam', { priority: WHACK_PRIO.golden });
        const t0 = Date.now();
        const iv = setInterval(() => {
          const k = Math.min(1, (Date.now() - t0) / 800);
          bossFx.value = { ...bossFx.value, rise: 1 - (1 - k) * (1 - k) * (1 - k) };
          if (k >= 1) clearInterval(iv);
        }, 16);
        flash(BOSS_NAMES[t.bossKind], t.callout ?? 'BONK THE TENTACLES', GOLD, 1600);
      } else {
        flash(t.banner, t.callout, '#ffffff', 1500);
      }
      GameAudio.play(cues.start, { volume: 0.8 });
    };
    if (withSlam) {
      flash('READY...', null, '#ffffff', 450);
      GameAudio.play(cues.pip);
      setTimeout(() => {
        flash(feverFired ? 'GO FEVER!' : 'GO!', null, GOLD, 450);
        GameAudio.play(cues.pip, { pitch: 7 });
        playPattern('lookUpResume', { priority: WHACK_PRIO.flow });
      }, 450);
      setTimeout(go, 900);
    } else {
      go();
    }
  }, [buildTimeline, runtime, autoplay, cues, flash, bossFx, juice]);

  const finishRun = useCallback((reason?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    // The Run is over the moment this is called: no breather timer or autoplay may start another Burst.
    setPhase('done');
    setBreather(null);
    runtime.setRunning(false);
    thermal.runEnd();
    const banked = bankedRef.current;
    const total = banked.reduce((s, b) => s + b.score, 0);
    const last = banked[banked.length - 1];
    const allResults = banked.map((b) => b.result);
    const sum = (f: (r: BurstResult) => number) => allResults.reduce((s, r) => s + f(r), 0);
    const maxStreak = Math.max(0, ...allResults.map((r) => r.maxStreak));
    const hits = sum((r) => r.legacyHits);
    const quick = sum((r) => r.quick);
    const judged = sum((r) => r.quick + r.good + r.late);
    const goldens = sum((r) => r.goldens);
    const thresholds = RUN_STARS[difficulty];
    let stars: number;
    let message: string | undefined;
    if (ride) {
      stars = last?.result.stars ?? 0;
      message = last?.result.win ? 'COIN CAUGHT!' : `SO CLOSE! ${Math.max(1, 100 - (last?.result.coin ?? 0))}% TO GO`;
    } else if (format === 'raid') {
      const r = raidRef.current;
      const dmg = last?.result.bossDamage ?? 0;
      stars = r?.defeated || last?.result.bossDown ? 3 : dmg >= (last ? tlRef.current?.bossHp ?? 20 : 20) * 0.5 ? 2 : dmg > 0 ? 1 : 0;
      message = r?.defeated ? 'RAID BOSS DOWN!' : r ? `RAID HP ${r.hpNow}/${r.hpMax}` : `${dmg} DAMAGE`;
    } else if (format === 'duel') {
      const [w0, w1] = duelWinsRef.current;
      stars = w0 > w1 ? 3 : w0 === w1 ? 2 : 1;
      message = w0 > w1 ? 'BONK BATTLE WON!' : w0 === w1 ? 'DEAD HEAT!' : 'GOOD FIGHT!';
    } else {
      stars = starsFor(total, thresholds);
    }
    // Walk Boosted Runs never set a ranked personal best (6.12).
    const isNewBest = total > best && !boostedRunRef.current;
    if (isNewBest) {
      setBest(total);
      AsyncStorage.setItem(pbKeyFor(format), String(total)).catch(() => undefined);
    }
    // Buckets (8.9): HITS (base grade points), COMBO (what the multiplier added), BONUS (flat).
    const base = sum((r) => r.quick * PTS_FINN[2] + r.good * PTS_FINN[1] + r.late * PTS_FINN[0]);
    const bonus = sum((r) => r.goldens * PTS_GOLDEN + r.doubles * PTS_DOUBLE + r.crits * PTS_CRIT);
    const combo = Math.max(0, total - base - bonus);
    const nextBoss = format === 'queue' && isBossRun('queue', runOfDayRef.current + 1, (lifetime ?? 0) + 8);
    const goal = ride ? null : nextStarGoal(total, thresholds);
    const rivals = props.lineDay?.rivals ?? [];
    const target = rivals.length ? [...rivals].sort((a, b) => a.score - b.score).find((r) => r.score > total) ?? rivals[rivals.length - 1] : null;
    const ghostLine = lineRun ? ghostDeltaLine(total, target ?? null) : null;
    const meta: Record<string, unknown> = {
      game: 'tap',
      v: 5,
      score: total,
      seed: runSeedRef.current >>> 0,
      hits,
      maxCombo: maxStreak,
      duration: (Date.now() - startWall.current) / 1000,
      difficulty,
      format,
      theme,
      rideId: rideKey,
      runOfDay: runOfDayRef.current,
      isNewBest,
      walkBoost: boostedRunRef.current,
      bursts: banked.length,
      proof: ride ? last?.proof : banked.map((b) => b.proof),
      fps_p5: perf.summary().fpsP5,
      perf_tier: TIER_NAMES[perfTier.tierJs],
      thermal_max: THERMAL_NAMES[thermalMax.current],
      finaleShown: false,
      ...(reason ? { reason } : {}),
    };
    let unlocked: FinnCard | null = null;
    const collect = (async () => {
      if (!rideKey) return;
      const book = (await readJson<CardBook>(CARDS_KEY)) ?? {};
      const applied = applyRunToBook(book, { rideId: rideKey, theme, format, goldens, date: today, rank: null });
      if (applied.unlocked) {
        unlocked = applied.unlocked;
        AsyncStorage.setItem(CARDS_KEY, JSON.stringify(applied.book)).catch(() => undefined);
      }
      const mastery = applyMastery((await readJson<MasteryBook>(MASTERY_KEY)) ?? {}, rideKey, stars);
      AsyncStorage.setItem(MASTERY_KEY, JSON.stringify(mastery)).catch(() => undefined);
      meta.mastery = mastery;
    })();
    void collect.catch(() => undefined).finally(() => {
      meta.cardsUnlocked = unlocked ? [unlocked] : [];
      if (!(ride && last?.result.win)) GameAudio.play(stars > 0 ? cues.stingWin : cues.stingLose);
      setResult({
        score: total,
        stars,
        message: unlocked ? `NEW FINN: ${cardTitle(theme)}` : message,
        maxCombo: maxStreak,
        thresholds: ride || format === 'raid' || format === 'duel' ? undefined : thresholds,
        rival: format === 'duel' ? { name: duel?.rival.name ?? 'Captain Fin', score: rivalTotalRef.current }
          : target ? { name: target.name.split(' ')[0], score: target.score } : null,
        buckets: ride ? undefined : [{ label: 'HITS', value: `${judged}` }, { label: 'COMBO', value: `+${combo.toLocaleString()}` }, { label: 'BONUS', value: `+${bonus.toLocaleString()}` }],
        bucketValues: ride ? undefined : [base, combo, bonus],
        starStepMs: STAR_STEP_MS,
        stats: [
          { label: 'QUICK', value: `${judged ? Math.round((100 * quick) / judged) : 0}%` },
          { label: 'BEST STREAK', value: `${maxStreak}` },
          ...(ride ? [{ label: 'COIN', value: `${last?.result.coin ?? 0}%` }]
            : format === 'raid' ? [{ label: 'BOSS DAMAGE', value: `${last?.result.bossDamage ?? 0}` }]
              : [{ label: 'BURSTS', value: `${banked.length}/${totalBursts}` }]),
          ...(ghostLine ? [{ label: 'LINE OF THE DAY', value: ghostLine }] : []),
          ...(nextBoss ? [{ label: 'NEXT', value: 'BOSS RUN' }]
            : goal && goal.remaining > 0 && format !== 'raid' && format !== 'duel' ? [{ label: 'NEXT STAR', value: `+${goal.remaining}` }] : []),
          ...(boostedRunRef.current ? [{ label: 'WALK BOOST', value: 'ON' }] : []),
        ],
        meta,
      });
      setPhase('done');
    });
  }, [best, cues, difficulty, format, perf, perfTier.tierJs, ride, theme, totalBursts, duel?.rival.name, thermal, lifetime, props.lineDay, lineRun, rideKey, today, runtime]);

  const bankBurst = useCallback(async (): Promise<BurstBanked | null> => {
    const t = tlRef.current;
    if (!t) return null;
    const carryIn = carryRef.current;
    const { result: res, taps, pos, wallMs } = await runtime.final();
    const proof = buildProof(t, carryIn, taps, res, {
      wallMs: Math.max(wallMs, Date.now() - startWall.current), pos, interrupts: interrupts.current, build: 'dev',
      fpsP5: perf.summary().fpsP5, hz: thermal.hz(), perfTier: TIER_NAMES[perfTier.tierJs], thermalMax: THERMAL_NAMES[thermalMax.current], walking: walk.walking,
    });
    const banked: BurstBanked = { index: t.input.burstIndex, score: res.score, result: res, proof };
    bankedRef.current = [...bankedRef.current, banked];
    carryRef.current = res.carry;
    liveScoreRef.current = 0;
    setShellScore(bankedRef.current.reduce((s, x) => s + x.score, 0));
    onBurstBanked?.(banked);
    if (!ride && format !== 'duel') {
      const lt = (lifetime ?? 0) + 1;
      AsyncStorage.setItem(LIFETIME_KEY, String(lt)).catch(() => undefined);
    }
    try {
      const shared = format === 'daily' || lineRun;
      const key = pbGhostKey(format, t.input.burstIndex, shared ? t.input.seed : undefined);
      const prev = await AsyncStorage.getItem(key);
      const prevScore = prev ? (JSON.parse(prev) as WhackGhost).score : -1;
      if (res.score > prevScore && !boostedRunRef.current) {
        const triples: number[][] = [];
        for (let i = 0; i + 2 < taps.length; i += 3) triples.push([taps[i], taps[i + 1], taps[i + 2]]);
        const g = ghostFromRun(t, triples, 'Your best', res.elapsedMs);
        await AsyncStorage.setItem(key, JSON.stringify(g));
      }
    } catch {
      // Ghost storage is a convenience; never block the run.
    }
    return banked;
  }, [runtime, perf, walk.walking, onBurstBanked, ride, format, lifetime, lineRun, thermal, perfTier.tierJs]);

  const onBurstEnd = useCallback(async (bankedEarly: boolean) => {
    const t = tlRef.current;
    if (!t) return;
    setPhase('finish');
    const b = await bankBurst();
    if (!b) return;
    const won = b.result.win;
    if (ride) {
      if (won) {
        const w = winRef.current;
        const wait = w ? Math.max(600, w.ms - (Date.now() - w.at)) : 1400;
        setTimeout(() => finishRun(), wait);
      } else {
        GameAudio.play(cues.whistle, { volume: 0.8 });
        flash('TIME!', `SO CLOSE! ${Math.max(1, 100 - b.result.coin)}% TO GO`, '#ffffff', 1200);
        setTimeout(() => finishRun(), 1100);
      }
      return;
    }
    GameAudio.play(cues.whistle, { volume: 0.8 });
    flash('FINISH!', null, GOLD, 900);
    if (bankedEarly) {
      setTimeout(() => finishRun('banked'), 700);
      return;
    }
    // Multiplayer submissions.
    let duelLine: string | null = null;
    if (net) {
      const v = await net.submitBurst(b.proof).catch(() => null);
      if (v && v.ok && v.duel) {
        setReveal(v.duel);
        duelWinsRef.current = v.duel.wins;
        rivalTotalRef.current += v.duel.rival?.score ?? 0;
        incomingRef.current = v.duel.incoming;
        duelLine = v.duel.winner === 'me' ? `BURST ${t.input.burstIndex + 1}: YOU!` : v.duel.winner === 'rival' ? `BURST ${t.input.burstIndex + 1}: RIVAL` : 'DEAD HEAT';
        if (v.duel.matchOver) {
          setTimeout(() => finishRun(), 2600);
          return;
        }
      }
      if (v && v.ok && v.raid) raidRef.current = { hpNow: v.raid.hpNow, hpMax: v.raid.hpMax, defeated: v.raid.defeated };
      if (v && v.ok && v.raid) duelLine = v.raid.defeated ? 'RAID BOSS DOWN!' : `RAID HP ${v.raid.hpNow}/${v.raid.hpMax}${v.raid.tagTeam ? '  TAG TEAM!' : ''}`;
    }
    const next = t.input.burstIndex + 1;
    if (next >= totalBursts) {
      // The finale's own cam (boss) already played; leave a beat for it.
      setTimeout(() => finishRun(), t.boss && b.result.bossDown ? 1600 : 900);
      return;
    }
    // Walk Boost: +2.5%/m, full at 40m, a Golden Start at most once per 3 Bursts, random-seed solo Runs only.
    const m = metersNow() - walkBaseRef.current;
    const pct = Math.min(1, (m * WALK_PCT_PER_M) / 100);
    if (walkOk(format) && pct >= 1 && next - lastBoostRef.current >= WALK_BOOST_EVERY) {
      pendingBoost.current = 'golden';
      boostedRunRef.current = true;
      lastBoostRef.current = next;
      walkBaseRef.current = metersNow();
    } else {
      pendingBoost.current = null;
    }
    const total = bankedRef.current.reduce((s, x) => s + x.score, 0);
    const nextTl = buildTimeline(next, runIndex);
    const g = nextStarGoal(total, RUN_STARS[difficulty]);
    const feverReady = !!carryRef.current.feverReady;
    setTimeout(() => {
      setBreather({
        burstScore: b.score,
        runScore: total,
        stats: [
          { label: 'QUICK', value: `${b.result.quick}` },
          { label: 'STREAK', value: `${b.result.maxStreak}` },
          ...(b.result.crits ? [{ label: 'CRITS', value: `${b.result.crits}` }] : []),
          ...(b.result.freezes ? [{ label: 'LOOK-UPS', value: `${b.result.freezes}` }] : []),
        ],
        next: nextTl.boss ? BOSS_NAMES[nextTl.bossKind] : nextTl.banner,
        readyAt: Date.now() + 1200,
        goal: g.remaining > 0 ? `NEXT STAR AT ${g.target.toLocaleString()}` : 'THREE STARS! GO FOR A BEST',
        duelLine,
        incoming: incomingRef.current.length,
        feverReady,
        bossNext: nextTl.boss,
        boost: pendingBoost.current === 'golden',
      });
      setReadyOn(false);
      setPhase('breather');
      setTimeout(() => setReadyOn(true), 1200);
      // Autoplay saves a banked fever for the finale (the expert line).
      if (autoplay) setTimeout(() => onReadyRef.current(feverReady && next === totalBursts - 1), 3500);
    }, 800);
  }, [bankBurst, cues, flash, ride, finishRun, net, totalBursts, metersNow, format, buildTimeline, runIndex, difficulty, autoplay]);

  const onReady = useCallback((goFever: boolean) => {
    if (phase !== 'breather' || finishing.current) return;
    setBreather(null);
    setReveal(null);
    startBurst(burstIdx + 1, runIndex, true, goFever && !!carryRef.current.feverReady);
  }, [phase, startBurst, burstIdx, runIndex]);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const onBankExit = useCallback(() => {
    setBreather(null);
    finishRun('banked');
  }, [finishRun]);

  // Shell lifecycle.
  const handleStart = useCallback(() => {
    finishing.current = false;
    bankedRef.current = [];
    carryRef.current = NO_CARRY;
    boostedRunRef.current = false;
    lastBoostRef.current = -9;
    walkBaseRef.current = metersNow();
    setResult(null);
    setShellScore(0);
    startWall.current = Date.now();
    if (autoplay) LogBox.ignoreAllLogs(true);
    void claimRunOfDay().finally(() => startBurst(0, runIndex, false));
  }, [metersNow, autoplay, startBurst, runIndex, claimRunOfDay]);

  const handlePause = useCallback((reason?: string) => {
    runtime.setRunning(false);
    runtime.clock.pause();
    finisher.cancel();
    void runtime.mirror().then((m) => { pauseAt.current = { wall: Date.now(), gt: m.t, reason: reason ?? 'pause' }; });
  }, [runtime, finisher]);

  const handleResume = useCallback(() => {
    const p = pauseAt.current;
    if (p) interrupts.current.push([p.gt, Date.now() - p.wall, p.reason.includes('away') ? 'background' : p.reason]);
    pauseAt.current = null;
    runtime.clock.resume();
    if (phase === 'play') {
      runtime.setRunning(true, true);
      flash('READY', null, '#ffffff', 600);
      GameAudio.play(cues.pip);
    }
  }, [runtime, phase, flash, cues.pip]);

  const handleRematch = useCallback(() => {
    finishing.current = false;
    const nextRun = runIndex + 1;
    setRunIndex(nextRun);
    bankedRef.current = [];
    carryRef.current = NO_CARRY;
    boostedRunRef.current = false;
    setResult(null);
    setShellScore(0);
    setBreather(null);
    void claimRunOfDay().finally(() => startBurst(0, nextRun, true));
  }, [runIndex, startBurst, claimRunOfDay]);

  // Wrap-up (boarding / left the queue): bank the live Burst from a coherent snapshot.
  const wrapMirror = useRef<{ score: number } | null>(null);
  useEffect(() => {
    if (!visible || phase !== 'play') return undefined;
    const iv = setInterval(() => { void runtimeRef.current.mirror().then((m) => { wrapMirror.current = { score: m.score }; }); }, 500);
    return () => clearInterval(iv);
  }, [visible, phase]);
  const onWrapUp = useCallback((reason: string): GameResult | null => {
    runtime.bank();
    finisher.cancel();
    const live = phase === 'play' ? wrapMirror.current?.score ?? Math.max(0, liveScoreRef.current) : 0;
    const total = bankedRef.current.reduce((s, b) => s + b.score, 0) + live;
    const thresholds = RUN_STARS[difficulty];
    return {
      score: total,
      stars: ride ? 0 : starsFor(total, thresholds),
      thresholds: ride ? undefined : thresholds,
      maxCombo: Math.max(0, ...bankedRef.current.map((b) => b.result.maxStreak)),
      meta: { game: 'tap', v: 5, score: total, seed: runSeedRef.current >>> 0, format, reason, proof: bankedRef.current.map((b) => b.proof) },
    };
  }, [runtime, phase, difficulty, ride, format, finisher, liveScoreRef]);

  useImperativeHandle(ref, () => ({
    bankAndExit: () => {
      if (phase === 'play') runtime.bank();
      else if (phase === 'breather') onBankExit();
    },
  }), [phase, runtime, onBankExit]);

  // Ghost for shared seeds (PB by default); Line of the Day races the nearest named rival.
  useEffect(() => {
    if (ghostProp) { ghostRef.current = ghostProp; return; }
    if (!tl || ride) return;
    const rivals = props.lineDay?.rivals ?? [];
    const rg = rivals.length ? rivals[rivals.length - 1].ghosts?.[tl.input.burstIndex] : null;
    if (rg) { ghostRef.current = rg; return; }
    const key = pbGhostKey(format, tl.input.burstIndex, format === 'daily' || lineRun ? tl.input.seed : undefined);
    AsyncStorage.getItem(key).then((v) => { ghostRef.current = v ? (JSON.parse(v) as WhackGhost) : null; }).catch(() => undefined);
  }, [tl, ghostProp, ride, format, lineRun, props.lineDay]);

  // ---------------------------------------------------------------- render
  const bossSrc = tl?.boss ? BOSS_ART[tl.bossKind].src : null;
  const images = useBoardImages(theme, bossSrc);
  const hud = useMemo(() => ({
    burstLabel: ride ? 'RIDE' : format === 'raid' ? 'RAID' : `BURST ${burstIdx + 1}/${totalBursts}`,
    ride,
    feverOn: !!tl?.fever,
    boss: !!tl?.boss,
    notches: RIDE_WIN_NOTCHES,
  }), [ride, format, burstIdx, totalBursts, tl?.fever, tl?.boss]);
  useEffect(() => {
    runtime.rt.value.reducedMotion = reducedMotion;
  }, [reducedMotion, runtime.rt]);

  const rivalName = props.lineDay?.rivals?.length ? props.lineDay.rivals[props.lineDay.rivals.length - 1].name.split(' ')[0].toUpperCase() : null;
  const objective = ride
    ? `Bonk ${RIDE_WIN_NOTCHES} sharks to fill the Coin Meter. Skip anything with teeth. Bonk before the ring closes for QUICK!`
    : format === 'duel' ? `Bonk Battle vs ${duel?.rival.name ?? 'Captain Fin'}: best of 3 Bursts. Goldens send candy splats!`
      : format === 'raid' ? 'Crew Raid: bonk the tentacles, swipe the ink, take the boss down together.'
        : lineRun ? 'Line of the Day: everyone in this line today plays this board. Beat the sharks just above you!'
          : 'Bonk the sharks, skip anything with teeth. Fill the meter, then GO FEVER. Look up any time: the board waits.';
  const capacity = Math.min(Math.max(48, Math.round(140 * tierScale.particles)), thermalScale.particleCap);

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Whack-a-Shark"
      subtitle={`${formatName(format)}${ride ? '' : ` · ${hud.burstLabel}`}`}
      objective={objective}
      score={shellScore}
      fever={fever}
      personalBest={best}
      result={result}
      thresholds={ride || format === 'raid' || format === 'duel' ? undefined : RUN_STARS[difficulty]}
      resumeStyle="instant"
      pauseOnLineMove={false}
      gameId="whack"
      sessionKey={`whack:${format}:${baseSeed}:${runIndex}`}
      getSnapshot={() => ({ score: shellScore, state: { burstIdx, runIndex, banked: bankedRef.current.map((b) => b.score), carry: carryRef.current } })}
      onWrapUp={onWrapUp as never}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onRematch={!ride && format !== 'duel' ? handleRematch : undefined}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={styles.fill} onLayout={onFieldLayout}>
          {L ? (
            <GestureDetector gesture={runtime.gesture}>
              <Animated.View style={[StyleSheet.absoluteFill, camera.style]}>
                <WhackBoard L={L} sim={runtime.sim} rs={runtime.rs} tick={runtime.tick} images={images} hud={hud} theme={theme}
                  bossFx={bossFx} pace={pace} showPace={!!ghostRef.current && !ride} paceLabel={rivalName ? `VS ${rivalName}` : 'VS BEST'} />
              </Animated.View>
            </GestureDetector>
          ) : null}
          {L ? <FxStage ref={fx} width={L.w} height={L.h} timeScale={runtime.clock.fxScale} reducedMotion={reducedMotion} capacity={capacity}
            onArrive={(n) => { for (let k = 0; k < n; k++) setTimeout(() => GameAudio.playLadder(cues.coinTick, Math.min(12, k)), k * 20); }} /> : null}
          {L ? <StampLayer ref={stamps} width={L.w} height={L.h} timeScale={runtime.clock.fxScale} reducedMotion={reducedMotion} queue={{ maxLive: 1, spacingMs: 150 }} /> : null}
          {L ? <Banner text={banner.text} sub={banner.sub} color={banner.color} stamp={banner.stamp} top={L.hudH + (L.deckTop - L.hudH) * 0.18} /> : null}
          {phase === 'breather' && breather ? (
            <Breather
              burstNumber={burstIdx + 1}
              bursts={totalBursts}
              burstScore={breather.burstScore}
              runScore={breather.runScore}
              stats={breather.stats}
              nextBanner={breather.next}
              walkPct={Math.min(1, ((metersNow() - walkBaseRef.current) * WALK_PCT_PER_M) / 100)}
              walkMeters={metersNow() - walkBaseRef.current}
              boostReady={breather.boost ? 'GOLDEN START' : null}
              showWalk={walkOk(format)}
              incomingSplats={breather.incoming}
              readyEnabled={readyOn}
              goal={breather.goal}
              feverReady={breather.feverReady}
              bossNext={breather.bossNext}
              onReady={() => onReady(false)}
              onFever={() => onReady(true)}
              onBank={onBankExit}
              canBank={format !== 'duel'}
              duelLine={breather.duelLine}
            />
          ) : null}
          {__DEV__ && process.env.EXPO_PUBLIC_WHACK_PERF === '1' ? <PerfOverlay probe={perf} /> : null}
          {phase === 'breather' && reveal && reveal.me && reveal.rival ? (
            <View style={styles.revealWrap} pointerEvents="box-none">
              <DuelCard me={reveal.me.score} rival={reveal.rival.score} rivalName={duel?.rival.name ?? 'Captain Fin'} winner={reveal.winner}
                wins={reveal.wins} onEmote={net ? (id) => net.sendEmote(id) : undefined} />
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </GameShellV2>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  revealWrap: { position: 'absolute', left: 16, right: 16, bottom: 170 },
});

export default WhackAShark;
