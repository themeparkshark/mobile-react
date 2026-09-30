/**
 * WhackAShark: "Bonk Rush" (design: tps-prime-time-audit/studio/design/whack.md).
 *
 * A glance-safe arcade whack built from short authored Bursts:
 *   - Queue Run: 5 Bursts of 12-18s with open breathers (bank any time).
 *   - Ride Challenge: one 30s Burst with a Coin Meter; the proof replays.
 *   - Daily / weekly shared seeds with ghosts, Bonk Battle duels, Crew Raids.
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
import { useCamera } from '../../gamekit/fx/useCamera';
import { useFeel, type FeelDef } from '../../gamekit/feel';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { playHaptic } from '../../gamekit/Haptics';
import { forEachEvent } from '../../gamekit/core/eventRing';
import { createFlurry, flurryHit, flurryResolve, FLURRY_GROW, FLURRY_START, starsFor, nextStarGoal } from '../../gamekit/core/scoring';
import { deriveRunSeed, mixSeed } from '../../gamekit/core/rng';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { usePerfProbe } from '../../gamekit/perf/PerfOverlay';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { ART_BOX, BOSS_ART, THEMED_SHARK_FRAMES, THEME_BOX, type WhackTheme } from './assets';
import { buildBurst, walkOk, type Timeline, type WalkBoost } from './timeline';
import {
  E_ATTACK, E_BLOCKED, E_BOSS_DMG, E_BOSS_DOWN, E_BREAK, E_BRUISER, E_BUTTER, E_COIN_BUBBLE, E_DECOY, E_DOUBLE, E_END,
  E_ESCAPE, E_FEVER, E_FREEZE, E_HELMET, E_HIT, E_PUFF, E_RESUME, E_SPLAT, E_SPLAT_CLEAR, E_TELL, E_TIER, E_WHIFF, E_WIN,
  NO_CARRY, createSim, type BurstCarry, type BurstResult,
} from './sim';
import { buildProof, type WhackProofV2 } from './proof';
import {
  G_CRIT, G_GOOD, G_QUICK, K_ANGLER, K_BRUISER, K_GOLDEN,
  RIDE_WIN_NOTCHES, RUN_STARS, TIER_AT, WALK_PCT_PER_M, burstCount, type Difficulty, type WhackFormat,
} from './waves';
import { A_CANDY, A_FADE, A_INK, A_SCAN, BOSS_NAMES } from './timeline';
import { computeLayout, type BoardLayout } from './render/layout';
import { F_ANGLER, F_BRUISER, F_BRUISER_DAZED, F_DAZED, F_GOLDEN, F_PEEK, F_POP, F_PUFFED, F_PUFFER } from './render/renderState';
import { WhackBoard, useBoardImages } from './render/WhackBoard';
import { useWhackRuntime } from './useWhackRuntime';
import { Banner, Breather, DuelCard } from './ui/Overlays';
import { duelTimeline } from './net/duel';
import { ghostFromRun, paceAt, pbGhostKey } from './net/ghost';
import { createLocalNetAdapter } from './net/localAdapter';
import type { DuelReveal, WhackDuelConfig, WhackGhost, WhackNetAdapter, WhackRaidConfig } from './net/types';

registerStudioAudio(['whack', 'boss']);

export type { WhackTheme };

export interface BurstBanked {
  index: number;
  score: number;
  result: BurstResult;
  proof: WhackProofV2;
}

export interface WhackASharkProps {
  visible: boolean;
  /** 'ride' = paid Ride Challenge (one 30s Burst); 'queue' = LinePlay Run. */
  format?: WhackFormat;
  /** Resolved ride theme (queue passes it); otherwise derived from taskName. */
  theme?: WhackTheme;
  taskName?: string;
  difficulty?: Difficulty;
  /** Server-issued seed (ride attempt seed). */
  seed?: number;
  /** Lifetime Bursts from the server profile (local cache when absent). */
  unlockLevel?: number;
  /** WS5: meters walked in line (GPS + pedometer). Falls back to local step sense. */
  walkMeters?: SharedValue<number> | number;
  ghost?: WhackGhost | null;
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
const PB_KEY = '@whack_a_shark/best';
const pbKeyFor = (f: WhackFormat) => (f === 'ride' ? '@whack_a_shark/ride_best' : f === 'queue' ? PB_KEY : `@whack_a_shark/best_${f}`);
const GOLD = '#ffcf3b';
const CORAL = '#ff6b5c';

type Phase = 'play' | 'finish' | 'breather' | 'done';

function pick(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

function boxesFor(theme: WhackTheme): number[][] {
  const t = THEME_BOX[theme];
  const b: number[][] = [];
  b[F_PEEK] = [...t[0]];
  b[F_POP] = [...t[1]];
  b[F_DAZED] = [...t[2]];
  b[F_GOLDEN] = [...ART_BOX.golden];
  b[F_ANGLER] = [...ART_BOX.angler];
  b[F_BRUISER] = [...ART_BOX.bruiser];
  b[F_BRUISER_DAZED] = [...ART_BOX.bruiserDazed];
  b[F_PUFFER] = [...ART_BOX.puffer];
  b[F_PUFFED] = [...ART_BOX.pufferPuffed];
  return b;
}

function formatName(f: WhackFormat): string {
  return f === 'ride' ? 'Ride Challenge' : f === 'duel' ? 'Bonk Battle' : f === 'raid' ? 'Crew Raid' : f === 'daily' ? 'Daily Bonk' : f === 'weekly' ? 'Weekly Ride Seed' : 'Bonk Rush';
}

export const WhackAShark = forwardRef<WhackHandle, WhackASharkProps>(function WhackAShark(props, ref) {
  const {
    visible, taskName, onComplete, onClose, onQuit, onBurstBanked, walkMeters, ghost: ghostProp, duel, raid,
  } = props;
  const format: WhackFormat = props.format ?? 'queue';
  const ride = format === 'ride';
  const devAuto = __DEV__ && process.env.EXPO_PUBLIC_GAME_AUTOPLAY === '1';
  const autoplay = !!props.autoplay || devAuto;
  const difficulty: Difficulty = props.difficulty ?? 2;
  const theme: WhackTheme = useMemo(() => {
    if (props.theme) return props.theme;
    const deck = deckIdForRideName(taskName);
    return (deck in THEMED_SHARK_FRAMES ? deck : 'park') as WhackTheme;
  }, [props.theme, taskName]);
  const reducedMotion = useReducedGameMotion();
  const shellRef = useRef<GameShellV2Handle>(null);
  const fx = useRef<FxStageHandle>(null);
  const perf = usePerfProbe(visible);
  const net = useMemo(() => props.net ?? ((format === 'duel' || format === 'raid') ? createLocalNetAdapter({ rivalName: duel?.rival.name ?? 'Captain Fin' }) : null), [props.net, format, duel?.rival.name]);

  // ---------------------------------------------------------------- layout
  const [field, setField] = useState<{ w: number; h: number } | null>(null);
  const L: BoardLayout | null = useMemo(() => (field ? computeLayout(field.w, field.h, theme) : null), [field, theme]);
  const geo = useSharedValue<BoardLayout>(computeLayout(390, 700, theme));
  const boxes = useSharedValue<number[][]>(boxesFor(theme));
  useEffect(() => {
    if (L) geo.value = L;
  }, [L, geo]);
  useEffect(() => {
    boxes.value = boxesFor(theme);
  }, [theme, boxes]);
  const onFieldLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setField((f) => (f && Math.abs(f.w - width) < 1 && Math.abs(f.h - height) < 1 ? f : { w: width, h: height }));
  }, []);
  const Lref = useRef<BoardLayout | null>(null);
  Lref.current = L;

  // ---------------------------------------------------------------- run state
  const [phase, setPhase] = useState<Phase>('play');
  const [burstIdx, setBurstIdx] = useState(0);
  const [runIndex, setRunIndex] = useState(0);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [fever, setFever] = useState(false);
  const [shellScore, setShellScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [banner, setBanner] = useState<{ text: string | null; sub?: string | null; color?: string; stamp: number }>({ text: null, stamp: 0 });
  const [breather, setBreather] = useState<null | {
    burstScore: number; runScore: number; stats: { label: string; value: string }[]; next: string; readyAt: number; goal: string | null;
    duelLine: string | null; incoming: number;
  }>(null);
  const [readyOn, setReadyOn] = useState(false);
  const [reveal, setReveal] = useState<DuelReveal | null>(null);
  const [lifetime, setLifetime] = useState<number | null>(props.unlockLevel ?? null);
  const [best, setBest] = useState(0);
  const [bossIntro, setBossIntro] = useState(false);

  const runSeedRef = useRef(0);
  const bankedRef = useRef<BurstBanked[]>([]);
  const carryRef = useRef<BurstCarry>(NO_CARRY);
  const liveScoreRef = useRef(0);
  const streakRef = useRef(0);
  const tierRef = useRef(0);
  const flurry = useRef(createFlurry(900, 3));
  const interrupts = useRef<[number, number, string][]>([]);
  const pauseAt = useRef<{ wall: number; gt: number; reason: string } | null>(null);
  const tlRef = useRef<Timeline | null>(null);
  const incomingRef = useRef<number[]>(duel?.incomingSplats ?? []);
  const duelWinsRef = useRef<[number, number]>(duel?.wins ?? [0, 0]);
  const walkBaseRef = useRef(0);
  const lastBoostRef = useRef(-9);
  const boostAltRef = useRef<WalkBoost>('golden');
  const pendingBoost = useRef<WalkBoost>(null);
  const startWall = useRef(Date.now());
  const ghostRef = useRef<WhackGhost | null>(ghostProp ?? null);
  const finishing = useRef(false);
  const raidRef = useRef<{ hpNow: number; hpMax: number; defeated: boolean } | null>(null);

  // Lifetime Bursts (unlock ladder), personal best.
  useEffect(() => {
    let alive = true;
    if (props.unlockLevel == null) {
      AsyncStorage.getItem(LIFETIME_KEY).then((v) => { if (alive) setLifetime(v ? parseInt(v, 10) || 0 : 0); }).catch(() => alive && setLifetime(0));
    }
    AsyncStorage.getItem(pbKeyFor(format)).then((v) => { if (alive && v) setBest(parseInt(v, 10) || 0); }).catch(() => undefined);
    return () => { alive = false; };
  }, [props.unlockLevel, ride]);

  const totalBursts = burstCount(format);
  const baseSeed = props.seed ?? 20260930;

  const buildTimeline = useCallback((bi: number, runIdx: number): Timeline => {
    if (format === 'duel' && duel) return duelTimeline(duel.matchSeed, bi, difficulty, theme, lifetime ?? 0, incomingRef.current);
    if (format === 'duel') return duelTimeline(baseSeed, bi, difficulty, theme, lifetime ?? 0, incomingRef.current);
    const seed = ride || format === 'daily' || format === 'weekly' || format === 'raid' ? (raid ? raid.raidSeed : baseSeed) : deriveRunSeed(baseSeed, runIdx);
    runSeedRef.current = seed;
    return buildBurst({
      seed, burstIndex: bi, format, difficulty, theme, unlockLevel: lifetime ?? 0,
      xform: format === 'weekly' ? mixSeed(seed, 0x57ee) % 8 : 0,
      walkBoost: walkOk(format) ? pendingBoost.current : null,
    });
  }, [format, duel, difficulty, theme, lifetime, baseSeed, ride, raid]);

  // ---------------------------------------------------------------- audio
  const cues = useMemo(() => ({
    bonk: pick('wh_bonk', 'fx.hit'), crit: pick('wh_crit', 'fx.hit'), whiff: pick('wh_whiff', 'ui.tap'), duck: pick('wh_duck', 'fx.whoosh'),
    golden: pick('wh_golden_hit', 'fx.coin'), coinLayer: 'fx.coin', chomp: pick('sh_chomp', 'fx.nopeShort'), nope: 'fx.nopeShort',
    helmet: pick('wh_helmet_clank', 'ui.confirm'), double: pick('wh_double', 'fx.reveal'), puff: pick('sh_puff_inflate', 'fx.whoosh'),
    tier: pick('wh_tier', 'fx.reveal'), breakCue: pick('sh_combo_break', 'fx.nopeShort'), tally: pick('sh_tally', 'fx.coin'),
    feverStart: pick('sh_fever_start', 'fx.reveal'), feverEnd: pick('sh_fever_end', 'fx.whoosh'), lookup: pick('sh_slide_up', 'ui.select'),
    resume: pick('resume_tick', 'ui.select'), whistle: pick('sh_whistle', 'fx.whoosh'), tick: pick('ui_tick', 'ui.select'),
    start: 'fx.reveal', pip: 'ui.select', coinTick: pick('coin_tick', 'fx.coin'), splat: pick('wh_ink_splat', 'fx.hit'),
    inkWhistle: pick('wh_ink_whistle', 'fx.whoosh'), squeegee: pick('wh_squeegee', 'fx.whoosh'), fade: pick('wh_poof', 'fx.whoosh'),
    scan: pick('wh_scan', 'ui.select'), bossHit: pick('bo_hit', 'fx.hit'), stingWin: pick('sting_whack_win', 'fx.reward'),
    stingLose: pick('sting_whack_lose', 'fx.nope'), stingBoss: pick('sting_whack_boss_win', 'fx.reward'), blocked: pick('sh_shield_pop', 'fx.reveal'),
    tells: [pick('wh_tell_finn', 'ui.select'), pick('wh_tell_golden', 'fx.reveal'), pick('wh_tell_angler', 'ui.select'), pick('wh_tell_helmet', 'ui.select'),
      pick('wh_tell_twins', 'ui.select'), pick('wh_tell_sprinter', 'fx.whoosh'), pick('wh_tell_finn', 'ui.select'), pick('wh_tell_tentacle', 'ui.select'),
      pick('wh_tell_bruiser', 'fx.hit')],
    bossRoar: [pick('bo_enter_kraken', 'fx.reveal'), pick('bo_enter_ghost', 'fx.reveal'), pick('bo_enter_robo', 'fx.reveal')],
    bossKo: [pick('bo_ko_kraken', 'fx.reward'), pick('bo_ko_ghost', 'fx.reward'), pick('bo_ko_robo', 'fx.reward')],
  }), []);
  useEffect(() => {
    if (!visible) return;
    if (__DEV__) GameAudio.setSfxEnabled(true);
    void GameAudio.init().then(() => GameAudio.preload([
      cues.bonk, cues.crit, cues.whiff, cues.duck, cues.golden, cues.chomp, cues.tier, ...cues.tells, cues.helmet, cues.double, cues.tally,
      cues.feverStart, cues.lookup, cues.splat, cues.squeegee, cues.bossHit,
    ])).catch(() => undefined);
  }, [visible, cues]);

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

  // ---------------------------------------------------------------- feel table
  const table = useMemo<Record<string, FeelDef>>(() => ({
    late: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'lateHit', localStop: 45, burst: [{ emitter: 'bubbles', count: 3 }],
      ring: { from: 8, to: 40, ms: 150 }, flyUp: { size: 'sm' } },
    good: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'goodHit', localStop: 45, burst: [{ emitter: 'stars', count: 6 }],
      ring: { from: 10, to: 70, ms: 180 }, flyUp: { size: 'md' } },
    quick: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'quickHit', localStop: 65,
      burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 10 }], ring: { color: GOLD, from: 12, to: 80, ms: 200 },
      bloom: { radius: 80, peak: 0.6, ms: 160 }, flyUp: { size: 'lg', color: GOLD } },
    crit: { sfx: cues.crit, spatial: true, haptic: 'crit', localStop: 90,
      burst: [{ emitter: 'impact', size: 1.4 }, { emitter: 'sparks' }, { emitter: 'splash', count: 8 }],
      ring: { color: GOLD, from: 14, to: 110, ms: 240 }, bloom: { radius: 110, peak: 0.85, ms: 220 }, flyUp: { size: 'lg', color: '#ffe07a' } },
    golden: { sfx: cues.golden, haptic: 'golden', hitStop: 110, hitStopSim: true, forceStop: true, slowMo: [0.35, 280, 120], punch: 0.03,
      burst: [{ emitter: 'speedLines', count: 12 }, { emitter: 'coins', count: 16, magnet: true }, { emitter: 'sparkles' }],
      vignette: { color: GOLD, peak: 0.35, inMs: 40, holdMs: 60, outMs: 260 }, flyUp: { size: 'xl', color: GOLD }, duckDb: 6 },
    angler: { sfx: cues.chomp, haptic: 'punish', localStop: 90, shake: 0.25, burst: [{ emitter: 'bubbles', count: 8, color: 0xffff6b5c }],
      vignette: { color: CORAL, peak: 0.3, inMs: 20, holdMs: 0, outMs: 200 }, flyUp: { size: 'md', color: CORAL } },
    helmet: { sfx: cues.helmet, haptic: 'quickHit', localStop: 60, burst: [{ emitter: 'sparks', count: 4 }], flyUp: { size: 'sm' } },
    double: { sfx: cues.double, haptic: 'crit', localStop: 80, burst: [{ emitter: 'bubbles', count: 8 }, { emitter: 'stars', count: 6 }],
      flyUp: { size: 'lg', color: '#7fd6ff' } },
    whiff: { sfx: cues.whiff, volume: 0.35, burst: [{ emitter: 'puff', count: 4 }] },
    butter: { sfx: cues.breakCue, haptic: 'comboBreak', flyUp: { size: 'md', color: CORAL } },
    escape: { sfx: cues.duck, volume: 0.55, spatial: true, burst: [{ emitter: 'bubbles', count: 4 }] },
    tierUp: { sfx: cues.tier, ladder: true, haptic: 'tierUp', burst: [{ emitter: 'confetti', count: 16 }] },
    comboBreak: { sfx: cues.breakCue, haptic: 'comboBreak' },
    fever: { sfx: cues.feverStart, haptic: 'feverStart', hitStop: 80, hitStopSim: true, forceStop: true, flash: { color: '#ffffff', peak: 0.4, ms: 160 },
      burst: [{ emitter: 'speedLines', count: 16 }, { emitter: 'confetti', count: 26 }],
      vignette: { color: GOLD, peak: 0.28, inMs: 120, holdMs: 6600, outMs: 300 }, flyUp: { size: 'xl', color: GOLD } },
    feverEnd: { sfx: cues.feverEnd },
    bossHit: { sfx: cues.bossHit, haptic: 'quickHit', shake: 0.3 },
    bossDown: { haptic: 'ko', hitStop: 160, hitStopSim: true, forceStop: true, slowMo: [0.3, 500, 200], shake: 0.8, punch: 0.05,
      burst: [{ emitter: 'confetti', count: 60 }, { emitter: 'coins', count: 24, magnet: true }], flash: { color: '#ffffff', peak: 0.35, ms: 200 },
      flyUp: { size: 'xl', color: GOLD } },
    splat: { sfx: cues.splat, haptic: 'lateHit', burst: [{ emitter: 'ink', count: 8 }] },
    squeegee: { sfx: cues.squeegee, haptic: 'tick', burst: [{ emitter: 'splash', count: 6 }] },
    coinBubble: { sfx: cues.coinLayer, haptic: 'tick', burst: [{ emitter: 'coins', count: 4, magnet: true }], flyUp: { size: 'sm', color: GOLD } },
    tellGolden: { sfx: cues.tells[1], volume: 0.8, spatial: true, haptic: 'goldenTell', tell: true, burst: [{ emitter: 'sparkles', count: 6 }] },
    tellAngler: { sfx: cues.tells[2], volume: 0.8, spatial: true, haptic: 'anglerTell', tell: true },
  }), [cues]);
  const clockRef = useRef<ReturnType<typeof useWhackRuntime>['clock'] | null>(null);
  const feel = useFeel(table, { fx, camera, clock: null, width: field?.w ?? 390, calm: reducedMotion || walk.walking });

  // ---------------------------------------------------------------- sim events (JS)
  const onEventsRef = useRef<(batch: number[]) => void>(() => undefined);
  const onEvents = useCallback((batch: number[]) => onEventsRef.current(batch), []);
  const runtime = useWhackRuntime({ geo, boxes, onEvents });
  clockRef.current = runtime.clock;
  const bossFx = useSharedValue({ rise: 0, flinch: 0, flash: 0, ghost: 1, sink: 0 });
  const pace = useSharedValue(0);

  const holeXY = (h: number) => {
    const G = Lref.current;
    if (!G) return { x: 0, y: 0 };
    return { x: G.cx[h], y: G.my[h] - G.spriteH[h] * 0.7 };
  };
  const HUD = useMemo(() => ({ x: (field?.w ?? 390) - 50, y: 40 }), [field?.w]);

  const fireHitFeel = (name: string, h: number, text: string | undefined, step: number, extra: Record<string, unknown> = {}) => {
    const p = holeXY(h);
    const clock = clockRef.current;
    const def = table[name];
    feel(name, { ...p, slot: h, step, text, magnetTo: HUD, dx: 0, dy: -1, ...extra });
    // Local hit-stop and global freezes go straight to the Bonk Rush clock.
    if (clock && def) {
      if (def.localStop) clock.localStop(h, reducedMotion ? Math.min(40, def.localStop) : def.localStop);
      if (def.hitStop) clock.hitStop(reducedMotion ? Math.min(60, def.hitStop) : def.hitStop, { holdSim: def.hitStopSim, force: def.forceStop });
      if (def.slowMo && !reducedMotion) clock.slowMo(def.slowMo[0], def.slowMo[1], def.slowMo[2]);
    }
  };

  const bumpShellScore = useRef(0);
  onEventsRef.current = (batch) => {
    const G = Lref.current;
    const now = Date.now();
    forEachEvent(batch, (kind, a, b, c) => {
      switch (kind) {
        case E_TELL: {
          const h = a;
          const k = b;
          const col = h % 3;
          const row = Math.floor(h / 3);
          const pan = (col - 1) * 0.6;
          const pitch = row === 0 ? 4 : row === 2 ? -3 : 0;
          if (k === K_GOLDEN) feel('tellGolden', { ...holeXY(h) });
          else if (k === K_ANGLER) feel('tellAngler', { ...holeXY(h) });
          else GameAudio.play(cues.tells[k] ?? cues.tells[0], { pan, pitch, volume: 0.55 });
          if (k === K_BRUISER) playHaptic('lateHit', { tell: true });
          break;
        }
        case E_HIT: {
          const h = a;
          const grade = b % 10;
          const k = Math.floor(b / 10);
          const pts = c;
          liveScoreRef.current += pts;
          streakRef.current += 1;
          const step = Math.max(0, streakRef.current - TIER_AT[tierRef.current]) % 8;
          const fl = flurryHit(flurry.current, now, pts);
          const quiet = fl === FLURRY_GROW || (fl === FLURRY_START && flurry.current.hits > 2);
          if (k === K_GOLDEN) {
            fireHitFeel('golden', h, `GOLDEN! +${pts}`, step);
            GameAudio.play(cues.coinLayer, { volume: 0.8 });
          } else if (grade === G_CRIT) {
            fireHitFeel('crit', h, quiet ? undefined : `CRIT! +${pts}`, step);
            GameAudio.play(cues.bonk, { volume: 0.7 });
          } else if (grade === G_QUICK) fireHitFeel('quick', h, quiet ? undefined : `QUICK +${pts}`, step);
          else if (grade === G_GOOD) fireHitFeel('good', h, quiet ? undefined : `+${pts}`, step);
          else fireHitFeel('late', h, quiet ? undefined : `+${pts}`, step);
          if (quiet && G) fx.current?.flyUp(`${flurry.current.hits} HITS +${flurry.current.points}`, G.w / 2, G.topH * 0.62, { size: 'md', color: '#ffe07a', key: 'flurry' });
          break;
        }
        case E_BRUISER: {
          liveScoreRef.current += c;
          streakRef.current += 1;
          fireHitFeel(b <= 0 ? 'crit' : 'good', a, b <= 0 ? `KNOCKOUT! +${c}` : `+${c}`, streakRef.current % 8);
          break;
        }
        case E_WHIFF:
          feel('whiff', { ...holeXY(a) });
          break;
        case E_BUTTER:
          feel('butter', { ...holeXY(a), text: 'BUTTERFINGERS!' });
          break;
        case E_DECOY:
          liveScoreRef.current += c;
          fireHitFeel('angler', a, `${c}`, 0);
          GameAudio.play(cues.nope, { volume: 0.7 });
          break;
        case E_COIN_BUBBLE:
          liveScoreRef.current += b;
          fireHitFeel('coinBubble', a, `+${b}`, 0);
          break;
        case E_ESCAPE:
          feel('escape', { ...holeXY(a) });
          if (c === 1 && streakRef.current >= 3) fx.current?.flyUp('MISS', holeXY(a).x, holeXY(a).y, { size: 'sm', color: '#dbe6f0' });
          break;
        case E_HELMET:
          liveScoreRef.current += b;
          fireHitFeel('helmet', a, `+${b}`, 0);
          break;
        case E_DOUBLE: {
          liveScoreRef.current += c;
          const p1 = holeXY(a);
          const p2 = holeXY(b);
          feel('double', { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, text: 'DOUBLE BONK!' });
          break;
        }
        case E_TIER:
          tierRef.current = a;
          if (G) feel('tierUp', { x: G.w / 2, y: 48, step: a - 1 });
          break;
        case E_BREAK:
          if (a >= 5) feel('comboBreak');
          streakRef.current = 0;
          tierRef.current = 0;
          break;
        case E_FEVER:
          if (a === 1) {
            setFever(true);
            if (G) feel('fever', { x: G.w / 2, y: G.topH + (G.h - G.topH) * 0.35, text: 'FEVER!' });
          } else {
            setFever(false);
            feel('feverEnd');
          }
          break;
        case E_FREEZE:
          GameAudio.play(cues.lookup, { volume: 0.5 });
          GameAudio.music.setState('muffled', 200);
          break;
        case E_RESUME:
          playHaptic('tick');
          GameAudio.play(cues.resume, { volume: 0.6 });
          GameAudio.music.setState('open', 300);
          break;
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
          if (G) fx.current?.flyUp('BLOCKED!', G.w / 2, G.topH * 0.8, { size: 'lg', color: '#7fd6ff' });
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
          if (G) feel('bossHit', { x: G.w * 0.72, y: G.topH * 0.5 });
          break;
        }
        case E_BOSS_DOWN: {
          liveScoreRef.current += a;
          const s = tlRef.current;
          if (G) {
            feel('bossDown', { x: G.w * 0.72, y: G.topH * 0.5, text: 'BOSS BONKED!', magnetTo: HUD });
            runtime.clock.hitStop(160, { holdSim: true, force: true });
            if (!reducedMotion) runtime.clock.slowMo(0.3, 500, 200);
          }
          GameAudio.play(cues.bossKo[s?.bossKind ?? 0]);
          setTimeout(() => GameAudio.play(cues.stingBoss), 300);
          bossFx.value = { ...bossFx.value, sink: 0 };
          const t0 = Date.now();
          const sinkIv = setInterval(() => {
            const k = Math.min(1, (Date.now() - t0) / 700);
            bossFx.value = { ...bossFx.value, sink: k * k };
            if (k >= 1) clearInterval(sinkIv);
          }, 16);
          flash('BOSS BONKED!', 'VICTORY LAP!', GOLD, 1600);
          break;
        }
        case E_PUFF:
          feel('whiff', { ...holeXY(a) });
          GameAudio.play(cues.puff, { volume: 0.7 });
          playHaptic('lateHit');
          break;
        case E_WIN:
          GameAudio.play('fx.reward');
          break;
        case E_END:
          void onBurstEnd(a === 1);
          break;
        default:
          break;
      }
    });
    // Throttled header score (the board itself never re-renders).
    if (now - bumpShellScore.current > 250) {
      bumpShellScore.current = now;
      setShellScore(bankedRef.current.reduce((s, x) => s + x.score, 0) + Math.max(0, liveScoreRef.current));
    }
  };
  const splatHint = useRef(false);

  // Flurry resolve + pace line + last-3s pips (4 Hz, JS).
  useEffect(() => {
    if (!visible) return undefined;
    let lastPip = -1;
    const iv = setInterval(() => {
      const now = Date.now();
      if (flurryResolve(flurry.current, now)) GameAudio.play(cues.tally, { volume: 0.8 });
      if (phase !== 'play') return;
      void runtime.mirror().then((m) => {
        const t = tlRef.current;
        if (!t || m.ended) return;
        const left = Math.ceil((t.lengthMs - m.t) / 1000);
        if (left <= 3 && left >= 1 && left !== lastPip && !m.frozen) {
          lastPip = left;
          GameAudio.play(cues.tick, { volume: 0.6 });
          playHaptic('tick');
        }
        const g = ghostRef.current;
        if (g) pace.value = m.score - paceAt(g, m.t);
      });
    }, 250);
    return () => clearInterval(iv);
  }, [visible, phase, runtime, cues, pace]);

  // ---------------------------------------------------------------- flow
  const flash = useCallback((text: string, sub: string | null = null, color = '#ffffff', ms = 1100) => {
    setBanner({ text, sub, color, stamp: Date.now() });
    setTimeout(() => setBanner((b) => (b.text === text ? { ...b, text: null, sub: null } : b)), ms);
  }, []);

  const startBurst = useCallback((bi: number, runIdx: number, withSlam: boolean) => {
    const t = buildTimeline(bi, runIdx);
    tlRef.current = t;
    setTl(t);
    setBurstIdx(bi);
    liveScoreRef.current = 0;
    flurry.current = createFlurry(900, 3);
    splatHint.current = false;
    const sim = createSim(t, carryRef.current);
    streakRef.current = carryRef.current.streak;
    setFever(carryRef.current.feverLeft > 0 && t.fever);
    bossFx.value = { rise: 0, flinch: 0, flash: 0, ghost: 1, sink: 0 };
    setPhase('play');
    const go = () => {
      runtime.start(sim, autoplay);
      startWall.current = Date.now();
      interrupts.current = [];
      if (t.boss) {
        setBossIntro(true);
        const roar = cues.bossRoar[t.bossKind] ?? cues.bossRoar[0];
        GameAudio.play(roar);
        playHaptic('tierUp');
        setTimeout(() => playHaptic('tierUp'), 180);
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
        flash('GO!', null, GOLD, 450);
        GameAudio.play(cues.pip, { pitch: 7 });
        playHaptic('tick');
      }, 450);
      setTimeout(go, 900);
    } else {
      go();
    }
  }, [buildTimeline, runtime, autoplay, cues, flash, bossFx]);

  const finishRun = useCallback((reason?: string) => {
    if (finishing.current) return;
    finishing.current = true;
    const banked = bankedRef.current;
    const total = banked.reduce((s, b) => s + b.score, 0);
    const last = banked[banked.length - 1];
    const allResults = banked.map((b) => b.result);
    const maxStreak = Math.max(0, ...allResults.map((r) => r.maxStreak));
    const hits = allResults.reduce((s, r) => s + r.legacyHits, 0);
    const quick = allResults.reduce((s, r) => s + r.quick, 0);
    const judged = allResults.reduce((s, r) => s + r.quick + r.good + r.late, 0);
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
    const isNewBest = total > best;
    if (isNewBest) {
      setBest(total);
      AsyncStorage.setItem(pbKeyFor(format), String(total)).catch(() => undefined);
    }
    const goal = ride ? null : nextStarGoal(total, thresholds);
    GameAudio.play(stars > 0 ? cues.stingWin : cues.stingLose);
    const meta: Record<string, unknown> = {
      game: 'tap',
      v: 2,
      score: total,
      seed: runSeedRef.current >>> 0,
      hits,
      maxCombo: maxStreak,
      duration: (Date.now() - startWall.current) / 1000,
      difficulty,
      format,
      theme,
      isNewBest,
      bursts: banked.length,
      proof: ride ? last?.proof : banked.map((b) => b.proof),
      fps_p5: perf.summary().fpsP5,
      ...(reason ? { reason } : {}),
    };
    setResult({
      score: total,
      stars,
      message,
      maxCombo: maxStreak,
      thresholds: ride || format === 'raid' || format === 'duel' ? undefined : thresholds,
      stats: [
        { label: 'QUICK', value: `${judged ? Math.round((100 * quick) / judged) : 0}%` },
        { label: 'BEST STREAK', value: `${maxStreak}` },
        ...(ride ? [{ label: 'COIN', value: `${last?.result.coin ?? 0}%` }]
          : format === 'raid' ? [{ label: 'BOSS DAMAGE', value: `${last?.result.bossDamage ?? 0}` }]
            : [{ label: 'BURSTS', value: `${banked.length}/${totalBursts}` }]),
        ...(goal && goal.remaining > 0 && format !== 'raid' && format !== 'duel' ? [{ label: 'NEXT STAR', value: `+${goal.remaining}` }] : []),
      ],
      meta,
    });
    setPhase('done');
  }, [best, cues, difficulty, format, perf, ride, theme, totalBursts]);

  const bankBurst = useCallback(async (): Promise<BurstBanked | null> => {
    const t = tlRef.current;
    if (!t) return null;
    const { result: res, taps, wallMs } = await runtime.final();
    const proof = buildProof(t, carryRef.current, taps, res, {
      wallMs: Math.max(wallMs, Date.now() - startWall.current), interrupts: interrupts.current, build: 'dev',
      fpsP5: perf.summary().fpsP5, walking: walk.walking,
    });
    const banked: BurstBanked = { index: t.input.burstIndex, score: res.score, result: res, proof };
    bankedRef.current = [...bankedRef.current, banked];
    carryRef.current = res.carry;
    onBurstBanked?.(banked);
    // Lifetime Bursts (local cache of the server profile) and the pace ghost.
    if (!ride && format !== 'duel') {
      const lt = (lifetime ?? 0) + 1;
      AsyncStorage.setItem(LIFETIME_KEY, String(lt)).catch(() => undefined);
    }
    try {
      const key = pbGhostKey(format, t.input.burstIndex, format === 'daily' || format === 'weekly' ? t.input.seed : undefined);
      const prev = await AsyncStorage.getItem(key);
      const prevScore = prev ? (JSON.parse(prev) as WhackGhost).score : -1;
      if (res.score > prevScore) {
        const triples: number[][] = [];
        for (let i = 0; i + 2 < taps.length; i += 3) triples.push([taps[i], taps[i + 1], taps[i + 2]]);
        const g = ghostFromRun(t, triples, 'Your best', res.elapsedMs);
        await AsyncStorage.setItem(key, JSON.stringify(g));
      }
    } catch {
      // Ghost storage is a convenience; never block the run.
    }
    return banked;
  }, [runtime, perf, walk.walking, onBurstBanked, ride, format, lifetime]);

  const onBurstEnd = useCallback(async (bankedEarly: boolean) => {
    const t = tlRef.current;
    if (!t) return;
    setPhase('finish');
    GameAudio.play(cues.whistle, { volume: 0.8 });
    const b = await bankBurst();
    if (!b) return;
    const won = b.result.win;
    if (ride) {
      flash(won ? 'COIN CAUGHT!' : 'TIME!', won ? null : `SO CLOSE! ${Math.max(1, 100 - b.result.coin)}% TO GO`, won ? GOLD : '#ffffff', 1200);
      setTimeout(() => finishRun(), 1100);
      return;
    }
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
      setTimeout(() => finishRun(), 900);
      return;
    }
    // Walk Charge: +2.5%/m, full at 40m, at most one boost per 3 Bursts.
    const m = metersNow() - walkBaseRef.current;
    const pct = Math.min(1, (m * WALK_PCT_PER_M) / 100);
    if (walkOk(format) && pct >= 1 && next - lastBoostRef.current >= 3) {
      pendingBoost.current = boostAltRef.current;
      boostAltRef.current = boostAltRef.current === 'golden' ? 'meter' : 'golden';
      lastBoostRef.current = next;
      walkBaseRef.current = metersNow();
    } else {
      pendingBoost.current = null;
    }
    const total = bankedRef.current.reduce((s, x) => s + x.score, 0);
    const nextTl = buildTimeline(next, runIndex);
    const g = nextStarGoal(total, RUN_STARS[difficulty]);
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
      });
      setReadyOn(false);
      setPhase('breather');
      setTimeout(() => setReadyOn(true), 1200);
      if (autoplay) setTimeout(() => onReadyRef.current(), 3500);
    }, 800);
  }, [bankBurst, cues, flash, ride, finishRun, net, totalBursts, metersNow, format, buildTimeline, runIndex, difficulty, autoplay]);

  const onReady = useCallback(() => {
    if (phase !== 'breather') return;
    setBreather(null);
    setReveal(null);
    startBurst(burstIdx + 1, runIndex, true);
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
    walkBaseRef.current = metersNow();
    setResult(null);
    setShellScore(0);
    startWall.current = Date.now();
    if (autoplay) LogBox.ignoreAllLogs(true);
    startBurst(0, runIndex, false);
  }, [metersNow, autoplay, startBurst, runIndex]);

  const handlePause = useCallback((reason?: string) => {
    runtime.setRunning(false);
    runtime.clock.pause();
    void runtime.mirror().then((m) => { pauseAt.current = { wall: Date.now(), gt: m.t, reason: reason ?? 'pause' }; });
  }, [runtime]);

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
    setResult(null);
    setShellScore(0);
    setBreather(null);
    startBurst(0, nextRun, true);
  }, [runIndex, startBurst]);

  // Wrap-up (boarding / left the queue): bank the live Burst from a coherent snapshot.
  const wrapMirror = useRef<{ score: number } | null>(null);
  useEffect(() => {
    if (!visible || phase !== 'play') return undefined;
    const iv = setInterval(() => { void runtime.mirror().then((m) => { wrapMirror.current = { score: m.score }; }); }, 500);
    return () => clearInterval(iv);
  }, [visible, phase, runtime]);
  const onWrapUp = useCallback((reason: string): GameResult | null => {
    runtime.bank();
    const live = phase === 'play' ? wrapMirror.current?.score ?? Math.max(0, liveScoreRef.current) : 0;
    const total = bankedRef.current.reduce((s, b) => s + b.score, 0) + live;
    const thresholds = RUN_STARS[difficulty];
    return {
      score: total,
      stars: ride ? 0 : starsFor(total, thresholds),
      thresholds: ride ? undefined : thresholds,
      maxCombo: Math.max(0, ...bankedRef.current.map((b) => b.result.maxStreak)),
      meta: { game: 'tap', v: 2, score: total, seed: runSeedRef.current >>> 0, format, reason, proof: bankedRef.current.map((b) => b.proof) },
    };
  }, [runtime, phase, difficulty, ride, format]);

  useImperativeHandle(ref, () => ({
    bankAndExit: () => {
      if (phase === 'play') runtime.bank();
      else if (phase === 'breather') onBankExit();
    },
  }), [phase, runtime, onBankExit]);

  // Ghost for shared seeds (PB by default).
  useEffect(() => {
    if (ghostProp) { ghostRef.current = ghostProp; return; }
    if (!tl || ride) return;
    const key = pbGhostKey(format, tl.input.burstIndex, format === 'daily' || format === 'weekly' ? tl.input.seed : undefined);
    AsyncStorage.getItem(key).then((v) => { ghostRef.current = v ? (JSON.parse(v) as WhackGhost) : null; }).catch(() => undefined);
  }, [tl, ghostProp, ride, format]);

  // ---------------------------------------------------------------- render
  const bossSrc = tl?.boss ? BOSS_ART[tl.bossKind].src : null;
  const images = useBoardImages(theme, bossSrc);
  const hud = useMemo(() => ({
    burstLabel: ride ? 'RIDE CHALLENGE' : format === 'raid' ? 'CREW RAID' : `BURST ${burstIdx + 1}/${totalBursts}`,
    ride,
    feverOn: !!tl?.fever,
    boss: !!tl?.boss,
    notches: RIDE_WIN_NOTCHES,
  }), [ride, format, burstIdx, totalBursts, tl?.fever, tl?.boss]);
  useEffect(() => {
    runtime.rt.value.reducedMotion = reducedMotion;
  }, [reducedMotion, runtime.rt]);

  const objective = ride
    ? `Bonk ${RIDE_WIN_NOTCHES} sharks to fill the Coin Meter. Skip the anglerfish. Bonk before the ring closes for QUICK!`
    : format === 'duel' ? `Bonk Battle vs ${duel?.rival.name ?? 'Captain Fin'}: best of 3 Bursts. Goldens send candy splats!`
      : format === 'raid' ? 'Crew Raid: bonk the tentacles, swipe the ink, take the boss down together.'
        : 'Bonk the sharks, skip the anglerfish. Look up at the line any time: the board waits for you.';

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
                <WhackBoard L={L} sim={runtime.sim} rs={runtime.rs} tick={runtime.tick} images={images} hud={hud}
                  bossFx={bossFx} pace={pace} showPace={!!ghostRef.current && !ride} />
              </Animated.View>
            </GestureDetector>
          ) : null}
          {L ? <FxStage ref={fx} width={L.w} height={L.h} timeScale={runtime.clock.fxScale} reducedMotion={reducedMotion} capacity={140}
            onArrive={(n) => { for (let k = 0; k < n; k++) setTimeout(() => GameAudio.playLadder(cues.coinTick, Math.min(12, k)), k * 20); playHaptic('tick'); }} /> : null}
          {L ? <Banner text={banner.text} sub={banner.sub} color={banner.color} stamp={banner.stamp} top={L.topH + (L.h - L.topH) * 0.18} /> : null}
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
              boostReady={pendingBoost.current === 'golden' ? 'GOLDEN START' : pendingBoost.current === 'meter' ? 'METER START' : null}
              incomingSplats={breather.incoming}
              readyEnabled={readyOn}
              goal={breather.goal}
              onReady={onReady}
              onBank={onBankExit}
              canBank={format !== 'duel'}
              duelLine={breather.duelLine}
            />
          ) : null}
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
