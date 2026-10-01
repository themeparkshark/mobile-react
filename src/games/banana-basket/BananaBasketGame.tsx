/**
 * Banana Basket v2 (design rev 4, "earn every catch").
 *
 * Slide the shark's picnic basket to catch bananas spilling off the snack
 * cart, keep a beach ball bouncing for Ball Boost, grab Alex's gold shark-fin
 * coins to light up Golden Hour and dodge the teal pufferfish. Lift your
 * thumb and the whole park freezes mid-air; touch again and it springs back
 * to life in 200 ms (the line is always moving, so the player is the pause).
 *
 * Architecture (studio engine):
 *   - sim.ts: integer, deterministic, worklet-safe. Steps at 60 Hz on the UI
 *     thread (useGameClock) only while time runs; frozen time logs nothing.
 *   - render/vis.ts: render-only reactions fed by sim events on the same step.
 *   - render/Field.tsx: one Skia canvas, zero React renders during play.
 *   - Sim events cross to JS once per frame (useEventBridge) for sound,
 *     haptics (HapticBus) and FxStage particles, all on the same flush.
 *   - The result carries a replayable proof (proof.ts); the client never
 *     computes a reward.
 *
 * Public API kept for MiniGameSelector / LinePlay:
 *   <BananaBasketGame visible seed onComplete onClose />
 * Mode: explicit `mode`, else Ride Challenge context => 'ride', LinePlay
 * context => 'queue', otherwise 'ride'.
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Dimensions, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS, runOnUI, useSharedValue } from 'react-native-reanimated';

import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { RideChallengeContext } from '../../gamekit/RideChallengeContext';
import { useGameClock } from '../../gamekit/useGameClock';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { EMITTERS, FX_SPRITE, type EmitterDef } from '../../gamekit/core/particles';
import { useCamera } from '../../gamekit/fx/useCamera';
import { useEventBridge } from '../../gamekit/fx/useEventBridge';
import { forEachEvent, pushEvent } from '../../gamekit/core/eventRing';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { useGameMusic } from '../../gamekit/audio/useGameMusic';
import { firePrimitive } from '../../gamekit/Haptics';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { deckIdForRideName } from '../../services/rideTheme';

import {
  CARD_SET_BASE, G_GREAT, G_PERFECT, G_POP, K_BUNCH, K_COIN, K_FINGER, K_GIFT, K_LUCKY, K_PUFFER, K_WATCH, LANE_Y,
  BASKET_MAX, BASKET_MIN, DRAG_GAIN_Q8, CARD_BEACH, CARD_BREEZY, CARD_SPLASH, TWIST_BEACH, TWIST_BREEZY, TWIST_SPLASH,
  FIELD_W,
} from './constants';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BALL_TOSS, EV_BANK, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CARD, EV_CATCH, EV_CLOSE, EV_COIN,
  EV_DOWNWELL, EV_FINALE, EV_GOLD_BALL, EV_GOLDEN, EV_GRAZE, EV_HIT, EV_MISS, EV_POWER, EV_PUFF, EV_RIM, EV_RUSH,
  EV_SAVE, EV_SET, EV_SPLASH, EV_SPLAT, EV_TELL, EV_TICK, EV_TIER, EV_TIME, EV_TIPOVER, MODE_QUEUE, MODE_RIDE,
  EV_GATE, EV_GULL, EV_MULTI,
  createSim, finalScore, replay, starTargets, starsFor, step, tierOf, type SimConfig, type SimState,
} from './sim';
import { mixSeed } from './fixed';
import { botInput, createBot, BOT_EXPERT, type Bot } from './bots';
import { buildProof, decodeInput, type BananaProof } from './proof';
import { compareLine, createGhost, finnRun, ghostAdvance, type Ghost } from './ghost';
import { bananaBed, bananaCues, ladderNext, ladderNote, ladderReset, registerBananaAudio, type Ladder } from './audio';
import {
  createHapticBus, firePending, request, resetBus, HB_BOUNCE, HB_CATCH, HB_COIN, HB_HIT, HB_PERFECT, HB_POP, HB_TELL,
  HB_TIER, type BbPrim,
} from './hapticBus';
import { EMPTY_PROGRESS, loadProgress, saveProgress, twistForDay, unlockFor, type BananaProgress } from './progress';
import { hashDay } from './day';
import { BananaField, fieldLayout, toPx, useFieldImages } from './render/Field';
import { createVis, visEvents, visFrame, type Vis } from './render/vis';
import { TeachCard, cardInfo, type CardInfo } from './render/TeachCard';

registerBananaAudio();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Synthetic bridge events (not sim events).
const EVX_FREEZE = 200;
const EVX_THAW = 201;

export interface BananaGhostInput {
  name: string;
  proof: BananaProof;
}

export interface BananaBasketGameProps {
  visible: boolean;
  /** 1-3, chosen by session context. Defaults to 2. */
  difficulty?: 1 | 2 | 3;
  /** Deterministic seed (server attempt seed for the Ride Challenge). */
  seed?: number;
  /** Preserved external contract used by MiniGameSelector. */
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  /** Ref so the host can wrap up on a real queue event. */
  shellRef?: React.Ref<GameShellV2Handle>;
  /** 'ride' (one 45 s run) or 'queue' (3 x 20 s sets). Inferred when omitted. */
  mode?: 'ride' | 'queue';
  /** Ride deck (theme); derived from rideName when omitted. */
  deck?: string;
  rideName?: string;
  rideId?: number | string;
  /** Async Ghost Challenge: race this verified run on the same seed. */
  ghost?: BananaGhostInput | null;
  /** Race the staff ghost "Finn" (Expert bot on this seed). */
  staffGhost?: boolean;
  /** Share this run as a challenge (WS7 ghost endpoints); falls back to "race your ghost". */
  onChallenge?: (proof: BananaProof) => void;
  /** Dev: the Expert bot plays (tester video, perf runs). */
  autoplay?: boolean;
  /** Queue Easy Basket assist (excluded from boards, never in Ride). */
  assist?: boolean;
}

interface RunSetup {
  cfg: SimConfig;
  ghost: BananaGhostInput | null;
  ghostLabel: string;
}

export function BananaBasketGame(props: BananaBasketGameProps) {
  const {
    visible, difficulty = 2, seed: seedProp, onComplete, onClose, shellRef, deck: deckProp, rideName, rideId,
    ghost: ghostProp, staffGhost, onChallenge, autoplay = false, assist = false,
  } = props;
  const linePlay = useContext(LinePlayMovementContext);
  const rideChallenge = useContext(RideChallengeContext);
  const mode: 'ride' | 'queue' = props.mode ?? (rideChallenge ? 'ride' : linePlay ? 'queue' : 'ride');
  const reducedMotion = useReducedGameMotion();
  const deck = deckProp ?? deckIdForRideName(rideName);

  const [progress, setProgress] = useState<BananaProgress | null>(null);
  useEffect(() => {
    let alive = true;
    loadProgress().then((p) => alive && setProgress(p)).catch(() => alive && setProgress({ ...EMPTY_PROGRESS, ghosts: {} }));
    return () => {
      alive = false;
    };
  }, []);

  const baseSeed = useMemo(() => (seedProp ?? (Date.now() ^ 0x5bd1e995)) >>> 0, [seedProp]);
  const [runIndex, setRunIndex] = useState(0);
  const [raceSelf, setRaceSelf] = useState<BananaGhostInput | null>(null);

  const setup = useMemo<RunSetup | null>(() => {
    if (!progress) return null;
    const queue = mode === 'queue';
    const seed = runIndex === 0 || raceSelf ? baseSeed : mixSeed(baseSeed, runIndex);
    const cfg: SimConfig = {
      seed,
      difficulty,
      mode: queue ? MODE_QUEUE : MODE_RIDE,
      deck,
      unlock: queue ? unlockFor(progress.queueRuns) : 5,
      cards: progress.cards,
      assist: queue && assist,
      twist: twistForDay(new Date()),
    };
    const g = raceSelf ?? ghostProp ?? null;
    return { cfg, ghost: g, ghostLabel: g ? g.name : staffGhost ? 'FINN' : '' };
    // progress is read once per run (cards/unlock snapshot at run start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress !== null, runIndex, baseSeed, mode, difficulty, deck, assist, ghostProp, raceSelf, staffGhost]);

  if (!setup) return <View style={styles.fill} />;
  return (
    <BananaRun
      key={`${runIndex}:${setup.cfg.seed}`}
      visible={visible}
      setup={setup}
      mode={mode}
      reducedMotion={reducedMotion}
      progress={progress as BananaProgress}
      setProgress={setProgress}
      shellRef={shellRef}
      staffGhost={!!staffGhost}
      autoplay={autoplay}
      rideId={rideId}
      onComplete={onComplete}
      onClose={onClose}
      onChallenge={onChallenge}
      onRematch={mode === 'queue' ? () => {
        setRaceSelf(null);
        setRunIndex((n) => n + 1);
      } : undefined}
      onRaceSelf={(g) => {
        setRaceSelf(g);
        setRunIndex((n) => n + 1);
      }}
    />
  );
}

interface RunProps {
  visible: boolean;
  setup: RunSetup;
  mode: 'ride' | 'queue';
  reducedMotion: boolean;
  progress: BananaProgress;
  setProgress: (p: BananaProgress) => void;
  shellRef?: React.Ref<GameShellV2Handle>;
  staffGhost: boolean;
  autoplay: boolean;
  rideId?: number | string;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onChallenge?: (proof: BananaProof) => void;
  onRematch?: () => void;
  onRaceSelf: (g: BananaGhostInput) => void;
}

function BananaRun({
  visible, setup, mode, reducedMotion, progress, setProgress, shellRef, staffGhost, autoplay, rideId, onComplete, onClose,
  onChallenge, onRematch, onRaceSelf,
}: RunProps) {
  const { cfg } = setup;
  const thresholds = useMemo(() => {
    const t = starTargets(cfg.mode, cfg.difficulty);
    return { one: t[0], two: t[1], three: t[2] };
  }, [cfg.mode, cfg.difficulty]);

  const internalShell = useRef<GameShellV2Handle>(null);
  const shell = (shellRef as React.RefObject<GameShellV2Handle>) ?? internalShell;
  const fx = useRef<FxStageHandle>(null);
  const [size, setSize] = useState({ w: SCREEN_W, h: SCREEN_H - 130 });
  const layout = useMemo(() => fieldLayout(size.w, size.h), [size.w, size.h]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [score, setScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [bed, setBed] = useState<'calm' | 'rush' | 'fever'>('calm');
  const [ghostName, setGhostName] = useState(setup.ghostLabel);

  // -- UI-thread state ---------------------------------------------------------------------
  const sim = useSharedValue<SimState>(createSim(cfg));
  const vis = useSharedValue<Vis>(createVis());
  const tick = useSharedValue(0);
  const touch = useSharedValue(0);
  const target = useSharedValue(200);
  const dragFrom = useSharedValue(0);
  const dragBase = useSharedValue(200);
  const running = useSharedValue(false);
  const cardGate = useSharedValue(0);
  const worldScale = useSharedValue(1);
  const wasFrozen = useSharedValue(true);
  const bot = useSharedValue<Bot | null>(autoplay ? createBot(BOT_EXPERT, cfg.seed) : null);
  const ghost = useSharedValue<Ghost | null>(null);

  // Ghost (async challenge / staff ghost Finn): the real sim on the same seed.
  useEffect(() => {
    let g: Ghost | null = null;
    if (setup.ghost) {
      try {
        const log = decodeInput(setup.ghost.proof.input);
        g = createGhost({ ...cfg, cards: setup.ghost.proof.cards, unlock: setup.ghost.proof.unlock }, log, setup.ghost.name, setup.ghost.proof.score);
      } catch {
        g = null;
      }
    } else if (staffGhost) {
      const f = finnRun(cfg);
      g = createGhost({ ...cfg, cards: 0xffff }, f.log, 'FINN', f.score);
    }
    ghost.value = g;
    setGhostName(g ? g.name : '');
  }, [setup, staffGhost, cfg, ghost]);

  // -- JS mirrors ----------------------------------------------------------------------------
  const scoreRef = useRef(0);
  const chainRef = useRef(0);
  const statsRef = useRef({ catches: 0, perfects: 0, maxChain: 0, bounces: 0, fevers: 0, hearts: 3 });
  const setScoreAt = useRef(0);
  const ladder = useRef<Ladder>({ i: -1 });
  const bounceLadder = useRef(0);
  const goldenRef = useRef(false);
  const startedAt = useRef(0);
  const frozenAt = useRef(0);
  const freezes = useRef<number[][]>([]);
  const frozenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endedRef = useRef(false);
  const bus = useRef(createHapticBus());
  const cues = useMemo(() => bananaCues(), []);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init().then(() => GameAudio.preload(Object.values(cues)));
    return undefined;
  }, [visible, cues]);

  useGameMusic(visible && !result ? bananaBed(bed) : null, { at: 'bar' });

  const walk = useWalkSense({ active: visible && !result });
  const camera = useCamera({ width: layout.width, height: layout.height, timeScale: worldScale, reducedMotion, walking: walk.walking });

  // -- haptics through the bus ------------------------------------------------------------------
  const buzz = useCallback((pri: number, pulses: BbPrim[] | BbPrim, gapMs = 0) => {
    const list = Array.isArray(pulses) ? pulses : [pulses];
    const span = gapMs * (list.length - 1);
    const d = request(bus.current, Date.now(), pri, span);
    const play = () => list.forEach((p, i) => (i === 0 ? firePrimitive(p) : setTimeout(() => firePrimitive(p), gapMs * i)));
    if (d.kind === 'now') play();
    else if (d.kind === 'later') {
      const token = d.token;
      setTimeout(() => {
        if (firePending(bus.current, token, Date.now(), span)) play();
      }, Math.max(0, d.at - Date.now()));
    }
  }, []);

  // -- sim events on JS: sound, haptic, particles (one flush per frame) ------------------------
  const px = (x: number, y: number) => toPx(layoutRef.current, x, y);
  const burst = (name: Parameters<FxStageHandle['burst']>[0], x: number, y: number, count?: number, color?: number) => {
    const p = px(x, y);
    // Banana's FX sheet is Alex-style colour art: confetti plays as drawn (white tint).
    const c = color ?? (name === 'confetti' || name === 'ribbons' ? 0xffffffff : undefined);
    fx.current?.burst(name, p.x, p.y, count || c ? { count, color: c } : undefined);
  };
  const emit = (def: EmitterDef, x: number, y: number, count?: number) => {
    const p = px(x, y);
    fx.current?.emitDef(def, p.x, p.y, count ? { count } : undefined);
  };

  const finishRun = useRef<() => void>(() => undefined);

  const onEvent = (kind: number, a: number, b: number, c: number) => {
    const reduced = reducedMotion;
    switch (kind) {
      case EV_CATCH: {
        const k = b & 15;
        const grade = (b >> 4) & 15;
        const pts = c & 0xffff;
        const chain = c >> 16;
        scoreRef.current += pts;
        chainRef.current = chain;
        const st = statsRef.current;
        st.catches += 1;
        if (grade === G_PERFECT) st.perfects += 1;
        if (chain > st.maxChain) st.maxChain = chain;
        if (k === K_FINGER || k === K_WATCH || k === K_GIFT) break;
        const note = ladderNote(ladder.current, goldenRef.current);
        ladderNext(ladder.current, false);
        const tier = (b >> 8) & 15;
        const pan = (a - 200) / 200;
        if (k === K_COIN) {
          buzz(HB_COIN, 'heavy');
          GameAudio.playLadder(cues.note, note, { pan });
          burst('coins', a, LANE_Y - 10, 12);
          burst('sparkles', a, LANE_Y - 20, 8);
          camera.kick(0, 2);
          fx.current?.ring(px(a, LANE_Y).x, px(a, LANE_Y).y, { color: '#fec90e', from: 10, to: 60, ms: 240 });
          break;
        }
        GameAudio.play(k === K_BUNCH || k === K_LUCKY ? cues.bunch : cues.plop, { pan });
        // Ladder by timbre (design 8.3): x1 glock, x2 + chime, x3 + bell, x4 + brass stab.
        GameAudio.playLadder(cues.note, note, { pan });
        if (tier >= 2) GameAudio.play(cues.chime, { pan, volume: 0.55 });
        if (tier >= 3) GameAudio.playLadder(cues.bell, note, { pan, volume: 0.75 });
        if (tier >= 4) GameAudio.play(cues.stab, { pan, volume: 0.6 });
        // Wicker splinters on every catch.
        emit(SPLINTERS, a, LANE_Y - 4, grade >= G_PERFECT ? 8 : 6);
        if (grade >= G_POP) {
          GameAudio.play(cues.pop, { pan });
        } else if (grade === G_PERFECT) {
          GameAudio.play(cues.sparkle, { pan, volume: 0.8 });
          buzz(HB_PERFECT, 'light');
          emit(GOLD_CHIPS, a, LANE_Y - 10, 10);
          burst('stars', a, LANE_Y - 12, 4);
          fx.current?.ring(px(a, LANE_Y).x, px(a, LANE_Y).y, { color: '#fec90e', from: 10, to: 56, ms: 220 });
          if (!reduced) camera.kick((a - 200) / 200 * 3, 3);
        } else {
          if (grade === G_GREAT) burst('sparkles', a, LANE_Y - 14, 2);
          if (tier <= 2) buzz(HB_CATCH, 'selection');
          fx.current?.ring(px(a, LANE_Y).x, px(a, LANE_Y).y, { color: '#ffffff', from: 10, to: 46, ms: 220 });
          if (!reduced) camera.kick((a - 200) / 200 * 2, 2);
        }
        if (k === K_BUNCH || k === K_LUCKY) {
          buzz(HB_POP, k === K_LUCKY && grade === G_PERFECT ? ['medium', 'light'] : 'medium', 90);
          if (k === K_LUCKY && grade === G_PERFECT) burst('coins', a, LANE_Y - 30, 20);
        }
        break;
      }
      case EV_COIN: {
        GameAudio.playLadder(cues.meter, Math.max(0, Math.min(2, b - 1)));
        scoreRef.current += 0;
        break;
      }
      case EV_SAVE:
        GameAudio.play(cues.chime);
        buzz(HB_PERFECT, 'light');
        burst('coins', a, LANE_Y - 10, 8);
        scoreRef.current += c;
        break;
      case EV_RIM:
        GameAudio.play(cues.clack);
        [0, 1, 2].forEach((n) => setTimeout(() => GameAudio.playLadder(cues.rimTick, n, { volume: 0.7 }), 45 * n));
        break;
      case EV_MISS:
        if (c === 1) {
          ladderReset(ladder.current);
        }
        break;
      case EV_SPLAT:
        GameAudio.play(cues.splat, { pan: (a - 200) / 200, volume: 0.8 });
        emit(JUICE, a, LANE_Y + 110, 5);
        break;
      case EV_BREAK:
        GameAudio.play(cues.wah, { volume: 0.6 });
        break;
      case EV_TIER: {
        ladder.current.i = 7;
        GameAudio.play(cues.tierUp);
        buzz(HB_TIER, 'success');
        const bx = sim.value.bx / 256;
        burst('confetti', bx, LANE_Y - 10, 12);
        if (!reduced) camera.punch(0.04, 90);
        break;
      }
      case EV_GATE:
        if (a === 1) GameAudio.play(cues.deflate, { volume: 0.5 });
        break;
      case EV_MULTI:
        GameAudio.play(cues.combo, { volume: 0.9 });
        buzz(HB_PERFECT, 'light');
        burst('sparkles', a, LANE_Y - 40, 6);
        break;
      case EV_GULL:
        if (a === 1) GameAudio.play(cues.squawk, { pan: (b - 200) / 200 });
        else if (a === 2) GameAudio.play(cues.flap, { volume: 0.8 });
        else if (a === 3) {
          GameAudio.play(cues.squawk);
          GameAudio.play(cues.wah, { volume: 0.5 });
          buzz(HB_HIT, 'warning' as BbPrim);
          emit(FEATHERS, b, LANE_Y - 30, 10);
          if (!reduced) camera.kick((200 - b) / 200 * 4, 2);
        } else if (a === 5) GameAudio.play(cues.chime);
        break;
      case EV_TELL:
        if (b === K_PUFFER) {
          GameAudio.play(cues.creak, { pan: (a - 200) / 200 });
          buzz(HB_TELL, 'light');
        } else if (b === 101) {
          GameAudio.play(cues.splashTell, { pan: (a - 200) / 200 });
          buzz(HB_TELL, 'light');
        } else if (b === 100) {
          buzz(HB_TELL, ['selection', 'selection'], 60);
        }
        break;
      case EV_PUFF:
        GameAudio.play(cues.creak, { volume: 0.35, pan: (a - 200) / 200 });
        break;
      case EV_HIT: {
        statsRef.current.hearts = b;
        GameAudio.play(cues.bonk);
        GameAudio.play(cues.heart, { volume: 0.8 });
        GameAudio.duck(3, 30, 250, 200);
        buzz(HB_HIT, 'error');
        emit(DIZZY_STARS, a, LANE_Y - 60, 5);
        const p = px(a, LANE_Y);
        fx.current?.vignette({ color: '#ff6b5c', peak: 0.3, inMs: 30, holdMs: 120, outMs: 110 });
        fx.current?.ring(p.x, p.y, { color: '#ff6b5c', from: 12, to: 90, ms: 260 });
        if (!reduced) camera.shake(0.6, (200 - a) / 200, -0.3);
        break;
      }
      case EV_CLOSE:
        GameAudio.play(cues.close);
        buzz(HB_POP, 'light');
        burst('speedLines', a, LANE_Y - 40, 6);
        break;
      case EV_GRAZE:
        GameAudio.play(cues.sparkle);
        buzz(HB_POP, 'medium');
        burst('coins', a, LANE_Y - 30, 16);
        break;
      case EV_BOUNCE: {
        const n = b;
        const gold = c & 1;
        bounceLadder.current = Math.min(3, n - 1);
        GameAudio.playLadder(cues.boing, gold ? 3 : Math.min(3, (n - 1) % 4), { pan: (a - 200) / 200 });
        if (n <= 3 || gold) buzz(HB_BOUNCE, 'selection');
        burst('puff', a, LANE_Y - 10, 4);
        statsRef.current.bounces += 1;
        scoreRef.current += c >> 1;
        break;
      }
      case EV_GOLD_BALL:
        GameAudio.play(cues.pop);
        buzz(HB_TIER, 'medium');
        burst('stars', a, LANE_Y - 60, 12);
        if (!reduced) camera.kick(0, -3);
        break;
      case EV_BALL_POP:
        GameAudio.play(cues.pop, { pan: (a - 200) / 200 });
        buzz(HB_POP, 'medium');
        burst('stars', a, LANE_Y - 120, 12);
        break;
      case EV_BONK:
        GameAudio.play(cues.bonk, { volume: 0.8 });
        GameAudio.play(cues.deflate, { volume: 0.7 });
        buzz(HB_POP, 'medium');
        emit(GOLD_CHIPS, a, LANE_Y - 150, 8);
        scoreRef.current += b;
        break;
      case EV_BALL_LOST:
        GameAudio.play(cues.deflate, { volume: 0.7 });
        burst('puff', a, LANE_Y + 50, 6);
        break;
      case EV_BALL_TOSS:
        GameAudio.play(cues.whistle, { volume: 0.45 });
        GameAudio.play(cues.boing, { volume: 0.6 });
        break;
      case EV_DOWNWELL:
        GameAudio.playLadder(cues.meter, Math.max(0, Math.min(2, b - 1)));
        break;
      case EV_GOLDEN:
        if (a === 1) {
          goldenRef.current = true;
          statsRef.current.fevers += 1;
          GameAudio.play(cues.feverStart);
          GameAudio.duck(3, 30, 250, 250);
          buzz(HB_COIN, ['heavy', 'light', 'light'], 120);
          fx.current?.vignette({ color: '#fff1c4', peak: 0.35, inMs: 300, holdMs: 5400, outMs: 300 });
          burst('confetti', 200, 300, 40);
          if (!reduced) {
            camera.punch(0.05, 120);
            camera.frame(1.02);
            camera.shake(0.3);
          }
          setBed('fever');
        } else if (a === 2) {
          GameAudio.play(cues.sparkle, { volume: 0.6 });
        } else {
          goldenRef.current = false;
          GameAudio.play(cues.feverEnd, { volume: 0.7 });
          camera.frame(1);
          setBed((cur) => (cur === 'fever' ? 'calm' : cur));
        }
        break;
      case EV_BANK:
        GameAudio.play(cues.meter, { volume: 0.8 });
        break;
      case EV_RUSH:
        if (a === 1) GameAudio.play(cues.rushBell);
        else {
          GameAudio.play(cues.whistle, { volume: 0.7 });
          if (!reduced) {
            camera.punch(0.04, 100);
            camera.frame(1.02);
          }
          setBed('rush');
        }
        break;
      case EV_TICK:
        GameAudio.play(cues.tick, { volume: 0.7 });
        break;
      case EV_FINALE:
        GameAudio.play(cues.roll);
        if (!reduced) camera.punch(0.12, 250);
        break;
      case EV_TIME:
        buzz(HB_HIT, 'heavy');
        GameAudio.play(cues.whistle);
        GameAudio.duck(3, 30, 250, 250);
        if (!reduced) camera.shake(0.4);
        burst('confetti', 200, 250, 60);
        finishRun.current();
        break;
      case EV_TIPOVER:
        GameAudio.play(cues.rushBell);
        buzz(HB_TIER, 'medium');
        if (!reduced) camera.shake(0.25);
        break;
      case EV_SPLASH:
        if (a === 2) {
          GameAudio.play(cues.splash);
          buzz(HB_HIT, ['medium', 'medium'], 80);
          burst('splash', b, LANE_Y + 40, 16);
        } else if (a === 3) GameAudio.play(cues.splash, { volume: 0.5 });
        break;
      case EV_POWER:
        GameAudio.play(cues.power);
        buzz(HB_TIER, 'medium');
        break;
      case EV_SET:
        buzz(HB_TIER, 'medium');
        GameAudio.play(cues.whistle, { volume: 0.7 });
        setBed('calm');
        resetBus(bus.current);
        break;
      case EV_CARD:
        break;
      case EVX_FREEZE:
        onFreeze();
        break;
      case EVX_THAW:
        onThaw();
        break;
      default:
        break;
    }
  };
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const bridge = useEventBridge((batch) => {
    forEachEvent(batch, (kind, a, b, c) => onEventRef.current(kind, a, b, c));
    const now = Date.now();
    if (now - setScoreAt.current > 120) {
      setScoreAt.current = now;
      setScore(scoreRef.current);
    }
  });
  const ring = bridge.ring;

  // -- freeze / thaw (music fades on a real freeze, resume tick on thaw) ----------------------
  const onFreeze = () => {
    frozenAt.current = Date.now();
    if (frozenTimer.current) clearTimeout(frozenTimer.current);
    frozenTimer.current = setTimeout(() => {
      void GameAudio.music.pause(150);
    }, 150);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      // Solo: 10 minutes frozen ends the run as "Saved".
      if (!endedRef.current) shell.current?.wrapUp?.('saved' as never);
    }, 10 * 60 * 1000);
  };
  const onThaw = () => {
    if (frozenTimer.current) clearTimeout(frozenTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    const frozenMs = frozenAt.current ? Date.now() - frozenAt.current : 0;
    if (frozenAt.current && frozenMs > 150) {
      void GameAudio.music.resume(200);
      GameAudio.play(cues.resume, { volume: 0.5 });
      freezes.current.push([0, frozenMs]);
    }
    frozenAt.current = 0;
    resetBus(bus.current);
  };

  // -- cards --------------------------------------------------------------------------------------
  const openCard = useCallback((id: number) => {
    let info: CardInfo;
    if (id >= CARD_SET_BASE) {
      const twistCard = cfg.twist === TWIST_BREEZY ? CARD_BREEZY : cfg.twist === TWIST_BEACH ? CARD_BEACH : 0;
      const splash = cfg.deck === 'ocean' || cfg.deck === 'pirates';
      const unlockTwist = cfg.unlock >= 3;
      info = cardInfo(id, {
        setScore: scoreRef.current,
        chain: chainRef.current,
        twistCard: unlockTwist || splash ? (splash ? CARD_SPLASH : twistCard) : 0,
      });
    } else info = cardInfo(id);
    setCard(info);
    setCardReady(false);
    setTimeout(() => {
      setCardReady(true);
      cardGate.value = 2;
    }, info.minMs);
  }, [cfg, cardGate]);

  const closeCard = useCallback(() => {
    setCard(null);
    setCardReady(false);
  }, []);

  // -- the loop -------------------------------------------------------------------------------
  const clock = useGameClock({
    onStep: () => {
      'worklet';
      const s = sim.value;
      if (!running.value || s.done) return;
      if (cardGate.value === 1) return;
      if (cardGate.value === 2) {
        if (touch.value === 0 && bot.value === null) return;
        cardGate.value = 0;
        runOnJS(closeCard)();
      }
      let t = touch.value;
      let q4 = Math.round(target.value * 16);
      const b = bot.value;
      if (b !== null) {
        q4 = botInput(s, b);
        t = 1;
        target.value = q4 / 16;
      }
      if (!t && s.holdTs === 0) {
        if (!wasFrozen.value) {
          wasFrozen.value = true;
          pushEvent(ring.value, EVX_FREEZE, 0, 0, 0, s.clock);
        }
        return;
      }
      if (wasFrozen.value && t) {
        wasFrozen.value = false;
        pushEvent(ring.value, EVX_THAW, 0, 0, 0, s.clock);
      }
      step(s, t, q4);
      visEvents(vis.value, s, reducedMotion);
      const r = ring.value;
      for (let e = 0; e < s.evN; e++) pushEvent(r, s.evK[e], s.evA[e], s.evB[e], s.evC[e], s.clock);
      const g = ghost.value;
      if (g !== null) ghostAdvance(g, s.clock);
      if (s.cardPending) {
        cardGate.value = 1;
        runOnJS(openCard)(s.cardPending);
      }
    },
    onFrame: (_alpha, fxDtMs) => {
      'worklet';
      const s = sim.value;
      visFrame(vis.value, s, fxDtMs, running.value);
      const sc = s.done ? 1 : (s.holdTs * s.fxTs) / 65536;
      if (worldScale.value !== sc) worldScale.value = sc;
      tick.value = tick.value + 1;
      bridge.flush();
    },
  });

  // -- input: relative drag anywhere, touch flag drives time --------------------------------------
  const pan = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      'worklet';
      touch.value = 1;
      dragFrom.value = e.absoluteX;
      // A re-grip starts from the basket's current x: it never jumps.
      dragBase.value = sim.value.bx / 256;
      target.value = dragBase.value;
    })
    .onUpdate((e) => {
      'worklet';
      const kScale = layout.k;
      const dx = ((e.absoluteX - dragFrom.value) / kScale) * (DRAG_GAIN_Q8 / 256);
      let t = dragBase.value + dx;
      if (t < BASKET_MIN) {
        dragBase.value += BASKET_MIN - t;
        t = BASKET_MIN;
      } else if (t > BASKET_MAX) {
        dragBase.value -= t - BASKET_MAX;
        t = BASKET_MAX;
      }
      target.value = t;
    })
    .onFinalize(() => {
      'worklet';
      touch.value = 0;
    }), [touch, dragFrom, dragBase, target, sim, layout.k]);

  // Backgrounding forces the thumb up (the park freezes) and the shell runs its 3-2-1.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') touch.value = 0;
    });
    return () => sub.remove();
  }, [touch]);

  // -- finish -----------------------------------------------------------------------------------
  const deliver = useCallback((s: SimState) => {
    if (endedRef.current) return;
    endedRef.current = true;
    running.value = false;
    const elapsed = Date.now() - (startedAt.current || Date.now());
    const final = finalScore(s);
    let verified = true;
    if (__DEV__) {
      // Determinism check: the JS replay of the UI-thread log must match exactly.
      const r = replay(cfg, s.log);
      verified = finalScore(r) === final;
      if (!verified) console.warn('[banana] replay mismatch', finalScore(r), final);
    }
    const proof = buildProof(cfg, s, Math.max(elapsed, s.steps * 17), freezes.current);
    const stars = starsFor(final, [thresholds.one, thresholds.two, thresholds.three]);
    const st = statsRef.current;
    const g = ghost.value;
    const cmp = g ? compareLine(s, (() => {
      const rs = createSim({ ...cfg, cards: 0xffff });
      for (let i = 0; i < g.log.length && !rs.done; i++) step(rs, g.log[i] & 1, g.log[i] >> 1);
      return rs;
    })(), g.name) : null;
    const res: GameResult = {
      score: final,
      stars,
      maxCombo: s.maxChain,
      thresholds,
      message: cmp ? cmp.line : stars >= 1 ? (mode === 'ride' ? 'RIDE COIN EARNED!' : stars === 3 ? 'BASKET MASTER!' : 'NICE HAUL!') : 'SO CLOSE!',
      stats: [
        { label: 'CATCHES', value: `${s.catches}` },
        { label: 'PERFECT', value: `${s.perfects}` },
        { label: 'BEST CHAIN', value: `${s.maxChain}` },
        { label: 'BOUNCES', value: `${s.bounces}` },
        ...(s.bonus > 0 ? [{ label: 'BONUS', value: `+${s.bonus}` }] : []),
      ],
      meta: {
        game: 'banana-basket',
        score: final,
        seed: cfg.seed,
        difficulty: cfg.difficulty,
        mode,
        rideId,
        maxCombo: s.maxChain,
        durationMs: Math.round(s.clock * (1000 / 60)),
        proof,
        verifiedLocally: verified,
        ghost: g ? { name: g.name, score: g.final, line: cmp?.line } : undefined,
      },
    };
    void st;
    // Progress: cards seen, queue runs (unlock gate), best, PB ghost.
    const next: BananaProgress = {
      ...progress,
      cards: progress.cards | s.cardsSeen,
      queueRuns: mode === 'queue' ? progress.queueRuns + 1 : progress.queueRuns,
      bestRide: mode === 'ride' ? Math.max(progress.bestRide, final) : progress.bestRide,
      bestQueue: mode === 'queue' ? Math.max(progress.bestQueue, final) : progress.bestQueue,
      ghosts: { ...progress.ghosts },
    };
    const key = `${mode}:${cfg.seed}`;
    if (!next.ghosts[key] || next.ghosts[key].score < final) next.ghosts[key] = { input: proof.input, score: final, at: Date.now() };
    setProgress(next);
    void saveProgress(next);
    lastProof.current = proof;
    setTimeout(() => {
      if (stars >= 1 && mode === 'ride') {
        GameAudio.play('fx.coin');
        setTimeout(() => GameAudio.play('fx.reward'), 350);
      } else if (stars === 0) GameAudio.play(cues.wah);
      setResult(res);
    }, reducedMotion ? 500 : 1100);
  }, [cfg, thresholds, mode, rideId, progress, setProgress, running, ghost, cues.wah, reducedMotion]);
  const lastProof = useRef<BananaProof | null>(null);

  finishRun.current = () => {
    runOnUI(() => {
      'worklet';
      runOnJS(deliver)(sim.value);
    })();
  };

  const onWrapUp = useCallback((): GameResult | null => {
    running.value = false;
    endedRef.current = true;
    const sc = scoreRef.current;
    const st = statsRef.current;
    return {
      score: sc,
      stars: starsFor(sc, [thresholds.one, thresholds.two, thresholds.three]),
      maxCombo: st.maxChain,
      thresholds,
      stats: [
        { label: 'CATCHES', value: `${st.catches}` },
        { label: 'PERFECT', value: `${st.perfects}` },
      ],
      meta: { game: 'banana-basket', score: sc, seed: cfg.seed, mode, partial: true },
    };
  }, [running, thresholds, cfg.seed, mode]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const images = useFieldImages();
  const objective = mode === 'ride'
    ? 'Catch bananas. Keep the ball up. Dodge puffers. Lift your thumb to freeze time.'
    : 'Three quick sets. Lift your thumb any time: the park freezes with you.';

  return (
    <GameShellV2
      ref={shell}
      visible={visible}
      title="Banana Basket"
      subtitle={mode === 'queue' ? `Queue run ${Math.min(5, progress.queueRuns + 1)}` : 'Ride Challenge'}
      score={score}
      personalBest={mode === 'ride' ? progress.bestRide || undefined : progress.bestQueue || undefined}
      objective={objective}
      result={result}
      thresholds={thresholds}
      gameId="banana"
      sessionKey={`banana:${rideId ?? 'x'}:${cfg.seed}`}
      getSnapshot={() => ({ score: scoreRef.current, state: { seed: cfg.seed, mode } })}
      onWrapUp={onWrapUp}
      resumeStyle="countdown"
      onStart={() => {
        running.value = true;
        startedAt.current = Date.now();
      }}
      onPause={() => {
        running.value = false;
        touch.value = 0;
      }}
      onResume={() => {
        if (!endedRef.current) running.value = true;
      }}
      onComplete={onComplete}
      onClose={onClose}
      onRematch={onRematch}
      onChallenge={() => {
        const p = lastProof.current;
        if (!p) return;
        if (onChallenge) onChallenge(p);
        else onRaceSelf({ name: 'YOUR GHOST', proof: p });
      }}
    >
      <GestureHandlerRootView style={styles.fill}>
        <GestureDetector gesture={pan}>
          <View style={styles.fill} onLayout={onLayout} collapsable={false}>
            <BananaField
              layout={layout}
              sim={sim}
              vis={vis}
              tick={tick}
              images={images}
              camera={camera.transform}
              cameraOrigin={camera.origin}
              ghost={ghost}
              ghostName={ghostName}
              reducedMotion={reducedMotion}
            />
            <FxStage ref={fx} width={layout.width} height={layout.height} timeScale={worldScale} reducedMotion={reducedMotion} atlasImage={images.fxSheet} />
            {card ? <TeachCard card={card} ready={cardReady} /> : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

// Banana particle defs on the Banana FX sheet (outlined art, design D-3).
const SPLINTERS: EmitterDef = { ...EMITTERS.shards, sprite: FX_SPRITE.shard, size: [6, 9], speed: [200, 380], spread: 140 };
const GOLD_CHIPS: EmitterDef = { ...EMITTERS.shards, sprite: FX_SPRITE.dot, size: [6, 9], speed: [260, 460], spread: 160, colors: [0xffffffff] };
const JUICE: EmitterDef = { ...EMITTERS.splash, sprite: FX_SPRITE.droplet, size: [6, 9], count: [5, 5] };
const FEATHERS: EmitterDef = {
  ...EMITTERS.ribbons, sprite: FX_SPRITE.ribbon + 2, frames: 2, count: [10, 10], speed: [120, 300], gravity: 160,
  drag: 2.2, life: [0.8, 0.95], size: [8, 11], colors: [0xffffffff],
};
const DIZZY_STARS: EmitterDef = { ...EMITTERS.stars, sprite: FX_SPRITE.starArt, count: [5, 5] };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#bfeaff' },
});

export default BananaBasketGame;
export { FIELD_W };
