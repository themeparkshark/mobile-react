/**
 * Banana Basket v2 (design rev 8, "hero first, live heats").
 *
 * Slide the shark and his picnic basket to catch the bananas spilling off
 * Finn's snack cart, and bounce the beach ball off the rim to aim it: the rim
 * has 5 zones and the zone the ball hits decides exactly where it flies. Only
 * the ball snaps down the hanging gold coins and Lucky Bunches. Keep the
 * chain going for x4 (x3 and x4 need the ball in full rules), dodge or BONK
 * the teal pufferfish, and lift your thumb to freeze the park (the line is
 * always moving, so the player is the pause).
 *
 * Architecture (studio engine):
 *   - sim.ts: integer, deterministic, worklet-safe. Steps at 60 Hz on the UI
 *     thread (useGameClock) only while time runs; frozen time logs nothing.
 *   - render/vis.ts: render-only reactions fed by sim events on the same step.
 *   - render/Field.tsx: one Skia canvas, zero React renders during play.
 *   - Sim events cross to JS once per frame (useEventBridge) for sound,
 *     haptics (engine bus, banana preset) and FxStage particles.
 *   - The result carries a replayable bb2r8 proof; the client never computes
 *     a reward.
 *
 * Public API kept for MiniGameSelector / LinePlay:
 *   <BananaBasketGame visible seed onComplete onClose />
 * Mode: explicit `mode`, else Ride Challenge context => 'ride', LinePlay
 * context => 'queue', otherwise 'ride'. Ruleset: explicit `rules` (the server
 * lookup), else ride_intro until this phone has seen the ball learned.
 */

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Dimensions, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
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
  BASKET_MAX, BASKET_MIN, CARD_SET_BASE, DRAG_GAIN_Q8, FIELD_H, FIELD_W, G_GOLD_POP, G_PERFECT, G_POP, K_BUNCH, K_COIN,
  K_LUCKY, K_PUFFER, LANE_Y, R_INTRO, R_RIDE, RULES_NAMES, TWIST_NAMES,
} from './constants';
import {
  EV_BALL_LOST, EV_BALL_POP, EV_BALL_TOSS, EV_BONK, EV_BOUNCE, EV_BREAK, EV_CARD, EV_CATCH, EV_CLOSE, EV_COIN,
  EV_COIN_SET, EV_EDGE, EV_FINALE, EV_GATE, EV_GOLD_BALL, EV_GOLDEN, EV_GULL, EV_HIT, EV_MISS, EV_PAIL, EV_PARK,
  EV_PRIZE, EV_PUFF, EV_REMIX, EV_RUSH, EV_SET, EV_SHIELD, EV_SPLAT, EV_TELL, EV_TICK, EV_TIER, EV_TIME, EV_TIPOVER,
  EV_VICTORY, MODE_HEAT, MODE_QUEUE, MODE_RIDE, ballShare, createSim, crownFor, finalScore, replay, starTargets,
  starsFor, step, type SimConfig, type SimState,
} from './sim';
import { mixSeed } from './fixed';
import { nextStarDelta, pileLine, tipLine, whyLine } from './summary';
import { botInput, createBot, BOT_EXPERT, type Bot } from './bots';
import { buildProof, decodeInput, type BananaProof } from './proof';
import { compareLine, createGhost, finnRun, ghostAdvance, ghostFinal, type Ghost } from './ghost';
import { bananaBed, bananaCues, ladderLayers, ladderNext, ladderNote, ladderReset, registerBananaAudio, type Ladder } from './audio';
import { catchHaptic, createHapticBus, due, request, resetBus, type BbPrim } from './hapticBus';
import {
  EMPTY_PROGRESS, MASTERY_NAMES, juggleKey, learnsBall, loadProgress, masteryAfter, rulesFor, saveProgress, twistForDay,
  unlockFor, type BananaProgress,
} from './progress';
import {
  advanceBots, botWhisper, buildStrip, countIn, fillBots, heatConfig, type FinnBot, type HeatRound, type HeatStripEntry,
  type HeatTransport,
} from './heat';
import { BananaField, fieldLayout, toPx, useFieldImages } from './render/Field';
import { createVis, notchPass, visEvents, visFrame, type Vis } from './render/vis';
import { TeachCard, cardInfo, type CardInfo } from './render/TeachCard';

registerBananaAudio();

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Synthetic bridge events (not sim events).
const EVX_FREEZE = 200;
const EVX_THAW = 201;
const EVX_NOTCH = 202;

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
  /** 'ride' (one 44.8 s run), 'queue' (3 x 11-bar sets) or 'heat' (Line Heat). Inferred when omitted. */
  mode?: 'ride' | 'queue' | 'heat';
  /** Ride ruleset from the server attempt (WS7 lookup); else the local fallback. */
  rules?: 'ride_intro' | 'ride';
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
  /** Wide Basket assist (unranked queue runs only). */
  assist?: boolean;
  /** Dev/lab override of the queue unlock gate (1-3); normally from local progress. */
  unlock?: number;
  /** Dev/lab override of the Park Twist (queue unlock 3+, heats). */
  twist?: number;
  /** Line Heat (mode 'heat'): the scheduled round and its transport. */
  heat?: { round: HeatRound; transport: HeatTransport } | null;
}

interface RunSetup {
  cfg: SimConfig;
  ghost: BananaGhostInput | null;
  ghostLabel: string;
}

function modeOf(m: 'ride' | 'queue' | 'heat'): number {
  return m === 'queue' ? MODE_QUEUE : m === 'heat' ? MODE_HEAT : MODE_RIDE;
}

export function BananaBasketGame(props: BananaBasketGameProps) {
  const {
    visible, difficulty = 2, seed: seedProp, onComplete, onClose, shellRef, deck: deckProp, rideName, rideId,
    ghost: ghostProp, staffGhost, onChallenge, autoplay = false, heat,
  } = props;
  const linePlay = useContext(LinePlayMovementContext);
  const rideChallenge = useContext(RideChallengeContext);
  const mode: 'ride' | 'queue' | 'heat' = props.mode ?? (rideChallenge ? 'ride' : linePlay ? 'queue' : 'ride');
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
    if (mode === 'heat' && heat) {
      return { cfg: heatConfig(heat.round, difficulty, deck, progress.cards), ghost: null, ghostLabel: '' };
    }
    const queue = mode === 'queue';
    const seed = runIndex === 0 || raceSelf ? baseSeed : mixSeed(baseSeed, runIndex);
    const unlock = queue ? (props.unlock ?? unlockFor(progress.queueRuns)) : 3;
    const rules = mode === 'ride' ? (props.rules ? (props.rules === 'ride_intro' ? R_INTRO : R_RIDE) : rulesFor(progress)) : R_RIDE;
    const cfg: SimConfig = {
      seed,
      difficulty,
      mode: modeOf(mode),
      rules,
      deck,
      unlock,
      cards: progress.cards,
      assist: queue && unlock <= 2 && (props.assist ?? progress.wideBasket),
      twist: props.twist ?? (queue && unlock >= 3 ? twistForDay(new Date(), rideId) : 0),
    };
    const g = raceSelf ?? ghostProp ?? null;
    return { cfg, ghost: g, ghostLabel: g ? g.name : staffGhost ? 'FINN' : '' };
    // progress is read once per run (cards/unlock snapshot at run start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress !== null, runIndex, baseSeed, mode, difficulty, deck, ghostProp, raceSelf, staffGhost, props.unlock, props.rules, props.twist, props.assist, heat]);

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
      heat={heat ?? null}
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
  mode: 'ride' | 'queue' | 'heat';
  reducedMotion: boolean;
  progress: BananaProgress;
  setProgress: (p: BananaProgress) => void;
  shellRef?: React.Ref<GameShellV2Handle>;
  staffGhost: boolean;
  autoplay: boolean;
  rideId?: number | string;
  heat: { round: HeatRound; transport: HeatTransport } | null;
  onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  onClose: () => void;
  onChallenge?: (proof: BananaProof) => void;
  onRematch?: () => void;
  onRaceSelf: (g: BananaGhostInput) => void;
}

function BananaRun({
  visible, setup, mode, reducedMotion, progress, setProgress, shellRef, staffGhost, autoplay, rideId, heat, onComplete,
  onClose, onChallenge, onRematch, onRaceSelf,
}: RunProps) {
  const { cfg } = setup;
  const targets = useMemo(() => starTargets(cfg.mode, cfg.difficulty, cfg.rules ?? R_RIDE), [cfg.mode, cfg.difficulty, cfg.rules]);
  const thresholds = useMemo(() => ({ one: targets[0], two: targets[1], three: targets[2] }), [targets]);

  const internalShell = useRef<GameShellV2Handle>(null);
  const shell = (shellRef as React.RefObject<GameShellV2Handle>) ?? internalShell;
  const fx = useRef<FxStageHandle>(null);
  const [size, setSize] = useState({ w: SCREEN_W, h: SCREEN_H - 130 });
  const layout = useMemo(() => fieldLayout(size.w, size.h), [size.w, size.h]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [score, setScore] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [extras, setExtras] = useState<ResultsExtras | null>(null);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [cardReady, setCardReady] = useState(false);
  const [bed, setBed] = useState<'calm' | 'rush' | 'fever'>('calm');
  const [ghostName, setGhostName] = useState(setup.ghostLabel);
  const [heatCount, setHeatCount] = useState<number | null>(null);

  // -- UI-thread state ---------------------------------------------------------------------
  const sim = useSharedValue<SimState>(createSim(cfg));
  const vis = useSharedValue<Vis>(createVis());
  const tick = useSharedValue(0);
  const touch = useSharedValue(0);
  const target = useSharedValue(200);
  const thumb = useSharedValue({ x: 200, y: LANE_Y + 120 });
  const dragFrom = useSharedValue(0);
  const dragBase = useSharedValue(200);
  const running = useSharedValue(false);
  const cardGate = useSharedValue(0);
  const worldScale = useSharedValue(1);
  const wasFrozen = useSharedValue(true);
  const bot = useSharedValue<Bot | null>(autoplay ? createBot(BOT_EXPERT, cfg.seed) : null);
  const ghost = useSharedValue<Ghost | null>(null);
  const strip = useSharedValue<HeatStripEntry[] | null>(null);

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
  const setScoreAt = useRef(0);
  const ladder = useRef<Ladder>({ i: -1 });
  const startedAt = useRef(0);
  const frozenAt = useRef(0);
  const freezes = useRef<number[][]>([]);
  const frozenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tambTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);
  const bus = useRef(createHapticBus());
  const cues = useMemo(() => bananaCues(), []);
  const finns = useRef<FinnBot[]>([]);

  useEffect(() => {
    if (!visible) return undefined;
    void GameAudio.init().then(() => GameAudio.preload(Object.values(cues)));
    return undefined;
  }, [visible, cues]);

  useGameMusic(visible && !result ? bananaBed(bed) : null, { at: 'bar' });

  const walk = useWalkSense({ active: visible && !result });
  const camera = useCamera({ width: layout.width, height: layout.height, timeScale: worldScale, reducedMotion, walking: walk.walking });

  // -- haptics through the engine bus (banana preset, design 9.1) -----------------------------------
  const buzz = useCallback((p: BbPrim | null, after: BbPrim[] = [], gapMs = 120) => {
    if (!p) return;
    const d = request(bus.current, Date.now(), p);
    if (d.kind === 'now') firePrimitive(p);
    else if (d.kind === 'later') {
      setTimeout(() => {
        const q = due(bus.current, Date.now());
        if (q) firePrimitive(q);
      }, Math.max(0, d.at - Date.now()) + 1);
    }
    after.forEach((a, i) => setTimeout(() => {
      const r = request(bus.current, Date.now(), a);
      if (r.kind === 'now') firePrimitive(a);
    }, gapMs * (i + 1)));
  }, []);

  // -- sim events on JS: sound, haptic, particles (one flush per frame) ------------------------
  const px = (x: number, y: number) => toPx(layoutRef.current, x, y);
  const burst = (name: Parameters<FxStageHandle['burst']>[0], x: number, y: number, count?: number, color?: number) => {
    const p = px(x, y);
    const c = color ?? (name === 'confetti' || name === 'ribbons' ? 0xffffffff : undefined);
    fx.current?.burst(name, p.x, p.y, count || c ? { count, color: c } : undefined);
  };
  const emitFx = (def: EmitterDef, x: number, y: number, count?: number) => {
    const p = px(x, y);
    fx.current?.emitDef(def, p.x, p.y, count ? { count } : undefined);
  };
  const pan = (x: number) => Math.max(-1, Math.min(1, (x - 200) / 200)) * 0.6;

  const finishRun = useRef<() => void>(() => undefined);

  const onEvent = (kind: number, a: number, b: number, c: number) => {
    const reduced = reducedMotion;
    switch (kind) {
      case EV_CATCH: {
        const k = b & 15;
        const grade = (b >> 4) & 15;
        const tier = (b >> 8) & 7;
        const onBeat = ((b >> 13) & 1) === 1;
        const pts = c & 0xffff;
        scoreRef.current += pts;
        chainRef.current = c >> 16;
        const p = pan(a);
        if (grade >= G_POP) {
          // POP (ball): bubble pop + pluck; Lucky Bunch is a bigger POP.
          GameAudio.play(cues.pop, { pan: p });
          GameAudio.play(cues.pluck, { pan: p, volume: 0.7 });
          if (k === K_LUCKY) {
            GameAudio.play(cues.combo, { pan: p });
            buzz('medium', ['light'], 90);
            burst('coins', a, LANE_Y - 120, 20);
            if (!reduced) camera.kick(0, 3);
          } else {
            buzz('medium');
            if (!reduced) camera.kick(0, 2);
          }
          burst('stars', a, LANE_Y - 140, 10);
          if (grade === G_GOLD_POP) burst('sparkles', a, LANE_Y - 140, 6);
        } else {
          GameAudio.play(k === K_BUNCH ? cues.bunch : cues.plop, { pan: p });
          emitFx(JUICE, a, LANE_Y - 8, 2);
          burst('puff', a, LANE_Y - 4, 1);
          if (k === K_BUNCH) {
            emitFx(JUICE, a, LANE_Y - 8, 2);
            burst('puff', a, LANE_Y, 3);
            buzz('medium');
          } else if (grade === G_PERFECT) {
            GameAudio.play(cues.sparkle, { pan: p, volume: 0.8 });
            buzz('light');
            emitFx(GOLD_GLINT, a, LANE_Y - 12, 6);
            if (!reduced) camera.kick(0, 2);
          } else buzz(catchHaptic(tier, onBeat, false));
        }
        if (k === K_COIN) {
          GameAudio.play(cues.coinReward, { pan: p, volume: 0.5 });
          emitFx(GOLD_GLINT, a, LANE_Y - 40, 4);
        }
        // Ladder by timbre (8.3): max 2 layers; on-beat at x3+ swaps the top layer for the bright set.
        const note = ladderNote(ladder.current);
        ladderNext(ladder.current, false);
        for (const layer of ladderLayers(tier, onBeat)) {
          const cue = layer === 'glock' ? cues.glock : layer === 'chime' ? cues.chimeL : layer === 'bell' ? cues.bellL : layer === 'stab' ? cues.stabL : cues.bright;
          GameAudio.playLadder(cue, note, { pan: p, volume: layer === 'stab' ? 0.7 : 0.9 });
        }
        if (tier >= 3) GameAudio.duck(1.5, 10, 60, 50);
        break;
      }
      case EV_EDGE:
        GameAudio.play(cues.clack, { pan: pan(a), volume: 0.8 });
        break;
      case EV_COIN:
        GameAudio.playLadder(cues.meter, Math.max(0, Math.min(2, b - 1)));
        buzz('medium');
        break;
      case EV_COIN_SET:
        GameAudio.play(cues.ding);
        burst('coins', a, LANE_Y - 60, 14);
        break;
      case EV_MISS:
        if (c === 1) ladderReset(ladder.current);
        break;
      case EV_SPLAT:
        GameAudio.play(cues.splat, { pan: pan(a), volume: 0.8 });
        emitFx(JUICE, a, LANE_Y + 110, 4);
        break;
      case EV_BREAK:
        GameAudio.play(cues.wah, { volume: 0.55 });
        break;
      case EV_TIER: {
        ladderNext(ladder.current, true);
        GameAudio.play(cues.tierUp);
        GameAudio.playLadder(cues.bellL, 0, { volume: 0.8 });
        buzz('success');
        const bx = sim.value.bx / 256;
        burst('confetti', bx, LANE_Y - 170, 12);
        if (!reduced) camera.punch(0.04, 90);
        break;
      }
      case EV_GATE:
        if (a === 1) GameAudio.play(cues.deflate, { volume: 0.5 });
        break;
      case EV_GULL:
        if (a === 1) {
          GameAudio.play(cues.squawk, { pan: pan(c) });
          buzz('selection', ['selection'], 60);
        } else if (a === 2) GameAudio.play(cues.flap, { volume: 0.8 });
        else if (a === 3) {
          GameAudio.play(cues.squawk);
          GameAudio.play(cues.wah, { volume: 0.5 });
          buzz('warning');
          emitFx(FEATHERS, b, LANE_Y - 30, 10);
        } else if (a === 6) GameAudio.play(cues.whoosh);
        break;
      case EV_TELL:
        if (b === K_PUFFER) {
          GameAudio.play(cues.creak, { pan: pan(a) });
          buzz('light');
        } else if (b === 102) {
          GameAudio.play(cues.whistle, { volume: 0.35 });
        }
        break;
      case EV_PUFF:
        GameAudio.play(cues.creak, { volume: 0.3, pan: pan(a) });
        break;
      case EV_HIT: {
        GameAudio.play(cues.bonk);
        GameAudio.play(cues.impact, { volume: 0.8 });
        GameAudio.play(cues.heart, { volume: 0.7 });
        GameAudio.duck(3, 30, 250, 200);
        buzz('error');
        emitFx(DIZZY_STARS, a, LANE_Y - 60, 5);
        emitFx(SPLINTERS, a, LANE_Y - 4, 6);
        const p = px(a, LANE_Y - 40);
        fx.current?.vignette({ color: '#ff5a4e', peak: 0.2, inMs: 30, holdMs: 120, outMs: 110 });
        if (!reduced) {
          fx.current?.ring(p.x, p.y, { color: '#ffffff', from: 12, to: 220 * layoutRef.current.k, ms: 300 });
          camera.shake(0.6, 0, -0.3);
          camera.kick(0, 4);
        }
        break;
      }
      case EV_SHIELD:
        GameAudio.play(cues.pop, { volume: 0.4 });
        buzz('selection');
        break;
      case EV_CLOSE:
        GameAudio.play(cues.close);
        buzz('light');
        break;
      case EV_BOUNCE: {
        const n = b;
        const gold = c & 1;
        GameAudio.playLadder(cues.boing, gold ? 3 : Math.min(3, (n - 1) % 4), { pan: pan(a) });
        if (n <= 3 || gold) buzz('selection');
        burst('puff', a, LANE_Y - 4, 3);
        break;
      }
      case EV_GOLD_BALL:
        GameAudio.play(cues.sparkle);
        burst('stars', a, LANE_Y - 60, 12);
        break;
      case EV_BALL_POP:
        break;
      case EV_PRIZE:
        if (a === 1) GameAudio.play(cues.pluck, { volume: 0.4, pan: pan(c >> 4) });
        break;
      case EV_BONK:
        GameAudio.play(cues.bonk, { volume: 0.85 });
        GameAudio.play(cues.deflate, { volume: 0.6 });
        buzz('medium');
        burst('stars', a, c === 2 ? LANE_Y - 60 : LANE_Y - 150, 8);
        if (!reduced) camera.kick(0, 2);
        break;
      case EV_BALL_LOST:
        GameAudio.play(cues.deflate, { volume: 0.7 });
        burst('confetti', a, PLAZA_FX_Y, 8);
        break;
      case EV_BALL_TOSS:
        if (b === 1) GameAudio.play(cues.boing, { volume: 0.8 });
        else GameAudio.play(cues.roll, { volume: 0.4 });
        break;
      case EV_PAIL:
        if (b === 1) {
          GameAudio.play(cues.sparkle);
          GameAudio.play(cues.whistle, { volume: 0.5 });
          buzz('light');
          burst('sparkles', a, PLAZA_FX_Y - 20, 8);
        }
        break;
      case EV_GOLDEN:
        if (a === 4) {
          GameAudio.play(cues.riser, { volume: 0.9 });
        } else if (a === 1) {
          GameAudio.duck(3, 30, 250, 250);
          buzz('heavy', ['light', 'light'], 120);
          burst('confetti', 200, CHIP_FX_Y, 40);
          if (!reduced) {
            camera.punch(0.05, 120);
            camera.frame(1.02);
            camera.shake(0.3);
          }
          setBed('fever');
          startTamb();
        } else if (a === 2) {
          GameAudio.play(cues.feverEnd, { volume: 0.6 });
        } else {
          stopTamb();
          camera.frame(1);
          setBed((cur) => (cur === 'fever' ? 'calm' : cur));
        }
        break;
      case EV_RUSH:
        if (a === 1) GameAudio.play(cues.rushBell);
        else {
          fx.current?.vignette({ color: '#ffffff', peak: 0.12, inMs: 200, holdMs: 9000, outMs: 300 });
          if (!reduced) {
            camera.punch(0.04, 100);
            camera.frame(1.02);
          }
          setBed('rush');
        }
        break;
      case EV_TICK:
        GameAudio.play(cues.tick5, { volume: 0.7 });
        if (a <= 2 && !reduced) camera.frame(1.04);
        break;
      case EV_FINALE:
        GameAudio.play(cues.roll);
        if (!reduced) camera.punch(0.12, 250);
        break;
      case EV_VICTORY:
        GameAudio.play(cues.combo);
        break;
      case EV_TIME:
        buzz('heavy');
        GameAudio.play(cues.whistle);
        GameAudio.duck(3, 30, 250, 250);
        stopTamb();
        if (!reduced) camera.shake(0.4);
        burst('confetti', 200, 250, 60);
        finishRun.current();
        break;
      case EV_TIPOVER:
        GameAudio.play(cues.rushBell);
        buzz('medium');
        if (!reduced) camera.shake(0.25);
        break;
      case EV_REMIX:
        GameAudio.play(cues.ding, { volume: 0.7 });
        break;
      case EV_SET:
        buzz('medium');
        GameAudio.play(cues.whistle, { volume: 0.7 });
        stopTamb();
        setBed('calm');
        resetBus(bus.current);
        break;
      case EV_PARK:
        break;
      case EVX_NOTCH:
        GameAudio.playLadder(cues.bellL, 0, { volume: 0.8 });
        buzz('light');
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

  // Golden Hour tambourine on 8th notes (from the sim clock pace: 14 steps).
  const startTamb = () => {
    stopTamb();
    tambTimer.current = setInterval(() => {
      const s = sim.value;
      if (s.holdTs > 0 && s.ghQ > 0) GameAudio.play(cues.tamb, { volume: 0.45 });
    }, 233);
  };
  const stopTamb = () => {
    if (tambTimer.current) clearInterval(tambTimer.current);
    tambTimer.current = null;
  };
  useEffect(() => () => stopTamb(), []);

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
    if (mode !== 'heat') {
      savedTimer.current = setTimeout(() => {
        // Solo: 10 minutes frozen ends the run as "Saved".
        if (!endedRef.current) shell.current?.wrapUp?.('saved' as never);
      }, 10 * 60 * 1000);
    }
  };
  const onThaw = () => {
    if (frozenTimer.current) clearTimeout(frozenTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    const frozenMs = frozenAt.current ? Date.now() - frozenAt.current : 0;
    if (frozenAt.current && frozenMs > 150) {
      void GameAudio.music.resume(200);
      GameAudio.play(cues.resume, { volume: 0.5 });
      freezes.current.push([sim.value.clock, frozenMs]);
    }
    frozenAt.current = 0;
    resetBus(bus.current);
  };

  // -- cards --------------------------------------------------------------------------------------
  const openCard = useCallback((id: number) => {
    let info: CardInfo;
    if (id >= CARD_SET_BASE) {
      info = cardInfo(id, { setScore: scoreRef.current, chain: chainRef.current, gullSet: cfg.unlock >= 2 });
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
  const tgt = targets;
  useGameClock({
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
      if (notchPass(vis.value, s.score + s.bonus, tgt) >= 0) pushEvent(r, EVX_NOTCH, 0, 0, 0, s.clock);
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
  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      'worklet';
      touch.value = 1;
      dragFrom.value = e.absoluteX;
      // A re-grip starts from the basket's current x: it never jumps.
      dragBase.value = sim.value.bx / 256;
      target.value = dragBase.value;
      thumb.value = { x: e.x / layout.k, y: (e.y - layout.oy) / layout.k };
    })
    .onUpdate((e) => {
      'worklet';
      const dx = ((e.absoluteX - dragFrom.value) / layout.k) * (DRAG_GAIN_Q8 / 256);
      let t = dragBase.value + dx;
      if (t < BASKET_MIN) {
        dragBase.value += BASKET_MIN - t;
        t = BASKET_MIN;
      } else if (t > BASKET_MAX) {
        dragBase.value -= t - BASKET_MAX;
        t = BASKET_MAX;
      }
      target.value = t;
      thumb.value = { x: e.x / layout.k, y: (e.y - layout.oy) / layout.k };
    })
    .onFinalize(() => {
      'worklet';
      touch.value = 0;
    }), [touch, dragFrom, dragBase, target, sim, layout.k, layout.oy, thumb]);

  // Backgrounding forces the thumb up (the park freezes) and the shell runs its 3-2-1.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') touch.value = 0;
    });
    return () => sub.remove();
  }, [touch]);

  // -- Line Heat: synced count-in, Finn fill bots, the live strip at 4 Hz ---------------------------
  useEffect(() => {
    if (mode !== 'heat' || !heat || !visible) return undefined;
    finns.current = fillBots(cfg, 1);
    const rivals = new Map<string, { player: { id: string; name: string; known: boolean; team: string; bot: boolean }; score: number; frozen: boolean }>();
    const unsub = heat.transport.onWhisper(heat.round, (w, p) => rivals.set(p.id, { player: p, score: w.score, frozen: w.frozen }));
    const id = setInterval(() => {
      const now = Date.now() + heat.transport.offsetMs();
      const ci = countIn(now, heat.round.startAt);
      setHeatCount(ci);
      if (now >= heat.round.startAt) {
        running.value = true;
        advanceBots(finns.current, now - heat.round.startAt);
      }
      const s = sim.value;
      const frozenMe = s.holdTs === 0;
      heat.transport.whisper(heat.round, {
        clockStep: s.clock, x: s.bx >> 8, score: s.score, chain: s.chain, tier: s.tier, hearts: s.hearts, ballLive: s.bN > 0, frozen: frozenMe,
      });
      const list = [
        ...Array.from(rivals.values()),
        ...finns.current.map((f) => ({ player: f.player, ...botWhisper(f) })),
      ];
      strip.value = buildStrip({ id: 'me', score: s.score, frozen: frozenMe, team: 'blue' }, list);
    }, 250);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [mode, heat, visible, cfg, running, sim, strip]);

  // -- finish -----------------------------------------------------------------------------------
  const deliver = useCallback((s: SimState) => {
    if (endedRef.current) return;
    endedRef.current = true;
    running.value = false;
    stopTamb();
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
    const stars = starsFor(final, targets);
    const crown = crownFor(final, targets);
    const facts = { misses: s.misses, heartsLeft: s.hearts, ballLiveSteps: s.ballLive, clockSteps: s.clock, bestLife: s.bestLife };
    const g = ghost.value;
    const cmp = g ? compareLine(s, ghostFinal({ ...cfg, cards: 0xffff }, g.log), g.name) : null;
    const share = ballShare(s);
    const next = nextStarDelta(final, targets);
    const jKey = juggleKey(new Date(), rideId);
    const prevJuggle = progress.juggle[jKey] ?? 0;
    const rideKey = String(rideId ?? 'park');
    const mastery = mode === 'ride' ? masteryAfter(progress.mastery[rideKey] ?? 0, stars) : progress.mastery[rideKey] ?? 0;
    const firstWin = mode === 'ride' && stars >= 1 && !progress.firstWins[jKey];
    const out = s.endReason === 2;
    const res: GameResult = {
      score: final,
      stars,
      maxCombo: s.maxChain,
      thresholds,
      message: out ? 'OUT OF HEARTS' : stars >= 1
        ? (mode === 'ride' ? 'RIDE COIN EARNED!' : stars === 3 ? 'BASKET MASTER!' : 'NICE HAUL!')
        : 'SO CLOSE!',
      note: stars === 0 ? `${whyLine(facts)} ${tipLine(facts)}`.trim() : cmp ? cmp.line : next ? `+${next.delta} TO ${next.label}` : undefined,
      rival: g ? { name: g.name, score: g.final } : null,
      stats: [
        { label: 'BALL SHARE', value: `${share}%` },
        { label: 'BEST JUGGLE', value: `${s.bestLife}` },
        { label: 'PERFECT', value: `${s.perfects}` },
      ],
      meta: {
        game: 'banana-basket',
        score: final,
        seed: cfg.seed,
        difficulty: cfg.difficulty,
        mode,
        rules: RULES_NAMES[s.rules],
        rideId,
        maxCombo: s.maxChain,
        durationMs: Math.round(s.clock * (1000 / 60)),
        proof,
        verifiedLocally: verified,
        ghost: g ? { name: g.name, score: g.final, line: cmp?.line } : undefined,
      },
    };
    setExtras({
      share, juggle: s.bestLife, prevJuggle, pile: pileLine(s.catches), starBonus: mode === 'ride' && stars >= 2, crown,
      mastery: mode === 'ride' && stars >= 2 ? MASTERY_NAMES[mastery] : '', firstWin,
    });
    // Progress: cards seen, queue runs (unlock gate), best, PB ghost, juggle, mastery, ball learned.
    const nextP: BananaProgress = {
      ...progress,
      cards: progress.cards | s.cardsSeen,
      queueRuns: mode === 'queue' ? progress.queueRuns + 1 : progress.queueRuns,
      bestRide: mode === 'ride' ? Math.max(progress.bestRide, final) : progress.bestRide,
      bestQueue: mode === 'queue' ? Math.max(progress.bestQueue, final) : progress.bestQueue,
      ballLearned: progress.ballLearned || learnsBall(s.bestLife, s.pops),
      mastery: { ...progress.mastery, [rideKey]: mastery },
      juggle: { ...progress.juggle, [jKey]: Math.max(prevJuggle, s.bestLife) },
      firstWins: firstWin ? { ...progress.firstWins, [jKey]: true } : progress.firstWins,
      ghosts: { ...progress.ghosts },
    };
    const key = `${mode}:${cfg.seed}`;
    if (!nextP.ghosts[key] || nextP.ghosts[key].score < final) {
      nextP.ghosts[key] = { input: proof.input, score: final, at: Date.now(), rules: proof.rules, unlock: proof.unlock, cards: proof.cards, twist: proof.twist ?? 0 };
    }
    setProgress(nextP);
    void saveProgress(nextP);
    lastProof.current = proof;
    setTimeout(() => {
      if (stars >= 1 && mode === 'ride') {
        GameAudio.play('fx.coin');
        setTimeout(() => GameAudio.play('fx.reward'), 350);
        buzz('success');
      } else if (stars === 0) GameAudio.play(cues.wah);
      else GameAudio.play(cues.finale, { volume: 0.8 });
      setResult(res);
    }, reducedMotion ? 500 : 1100);
  }, [cfg, targets, thresholds, mode, rideId, progress, setProgress, running, ghost, cues, reducedMotion, buzz]);
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
    stopTamb();
    const sc = scoreRef.current;
    return {
      score: sc,
      stars: starsFor(sc, targets),
      maxCombo: chainRef.current,
      thresholds,
      stats: [],
      meta: { game: 'banana-basket', score: sc, seed: cfg.seed, mode, partial: true },
    };
  }, [running, targets, thresholds, cfg.seed, mode]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const images = useFieldImages();
  const twistName = cfg.twist && (mode === 'heat' || (mode === 'queue' && cfg.unlock >= 3)) ? TWIST_NAMES[cfg.twist] : '';
  const objective = mode === 'ride'
    ? 'CATCH! AIM! DODGE! Lift your thumb any time: the park freezes with you.'
    : mode === 'heat'
      ? `Same line, same race. ${twistName ? `Today: ${twistName}.` : ''}`
      : `Three quick sets. Lift your thumb any time.${twistName ? ` Park Twist: ${twistName}.` : ''}`;
  const subtitle = mode === 'queue'
    ? (cfg.unlock >= 3 ? `Queue${twistName ? `: ${twistName}` : ''}` : cfg.unlock === 2 ? 'Queue: Gull Set run' : 'Queue run 1')
    : mode === 'heat' ? 'Line Heat' : cfg.rules === R_INTRO ? 'Ride Challenge: first ride' : 'Ride Challenge';

  return (
    <GameShellV2
      ref={shell}
      visible={visible}
      title="Banana Basket"
      subtitle={subtitle}
      score={score}
      hideHeaderScore
      personalBest={mode === 'ride' ? progress.bestRide || undefined : progress.bestQueue || undefined}
      objective={objective}
      result={result}
      thresholds={thresholds}
      gameId="banana"
      sessionKey={`banana:${rideId ?? 'x'}:${cfg.seed}`}
      getSnapshot={() => ({ score: scoreRef.current, state: { seed: cfg.seed, mode } })}
      onWrapUp={onWrapUp}
      resumeStyle="countdown"
      countdownStyle={mode === 'heat' ? 'none' : undefined}
      resultExtras={extras ? <ResultsRows x={extras} /> : undefined}
      onStart={() => {
        if (mode !== 'heat') running.value = true;
        startedAt.current = Date.now();
      }}
      onPause={() => {
        if (mode === 'heat') {
          touch.value = 0;
          return;
        }
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
        <GestureDetector gesture={gesture}>
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
              targets={targets}
              thumb={thumb}
              strip={mode === 'heat' ? strip : undefined}
            />
            <FxStage ref={fx} width={layout.width} height={layout.height} timeScale={worldScale} reducedMotion={reducedMotion} atlasImage={images.fxSheet} />
            {card ? <TeachCard card={card} ready={cardReady} /> : null}
            {mode === 'heat' && heatCount !== null ? (
              <View style={styles.countWrap} pointerEvents="none">
                <Text style={styles.count}>{heatCount === 0 ? 'GO!' : `${heatCount}`}</Text>
              </View>
            ) : null}
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

interface ResultsExtras {
  share: number;
  juggle: number;
  prevJuggle: number;
  pile: string;
  starBonus: boolean;
  crown: boolean;
  mastery: string;
  firstWin: boolean;
}

/** Results rows (7.7): BALL SHARE bar, BEST JUGGLE, PILE, ribbons. */
function ResultsRows({ x }: { x: ResultsExtras }) {
  return (
    <View style={styles.rows}>
      <View style={styles.shareRow}>
        <Text style={styles.rowLabel}>BALL {x.share}%</Text>
        <View style={styles.shareBar}>
          <View style={[styles.shareFill, { width: `${Math.max(2, Math.min(100, x.share))}%` }]} />
        </View>
      </View>
      <Text style={styles.rowText}>
        JUGGLE {x.juggle}{x.juggle > x.prevJuggle && x.prevJuggle > 0 ? '  NEW BEST!' : ''}   {x.pile}
      </Text>
      <View style={styles.ribbons}>
        {x.starBonus ? <Text style={[styles.ribbon, styles.ribbonGold]}>STAR BONUS</Text> : null}
        {x.crown ? <Text style={[styles.ribbon, styles.ribbonGold]}>GOLD CROWN</Text> : null}
        {x.firstWin ? <Text style={[styles.ribbon, styles.ribbonBlue]}>FIRST WIN</Text> : null}
        {x.mastery ? <Text style={[styles.ribbon, styles.ribbonBlue]}>{x.mastery}</Text> : null}
      </View>
    </View>
  );
}

const PLAZA_FX_Y = 600;
const CHIP_FX_Y = LANE_Y - 168;

// Banana particle defs on the Banana FX sheet (outlined art).
const SPLINTERS: EmitterDef = { ...EMITTERS.shards, sprite: FX_SPRITE.shard, size: [6, 9], speed: [200, 380], spread: 140 };
const GOLD_GLINT: EmitterDef = { ...EMITTERS.shards, sprite: FX_SPRITE.starArt, size: [7, 11], speed: [220, 420], spread: 160, colors: [0xffffffff] };
const JUICE: EmitterDef = { ...EMITTERS.splash, sprite: FX_SPRITE.droplet, size: [6, 9], count: [2, 2], colors: [0xfffff4c8] };
const FEATHERS: EmitterDef = {
  ...EMITTERS.ribbons, sprite: FX_SPRITE.ribbon + 2, frames: 2, count: [10, 10], speed: [120, 300], gravity: 160,
  drag: 2.2, life: [0.8, 0.95], size: [8, 11], colors: [0xffffffff],
};
const DIZZY_STARS: EmitterDef = { ...EMITTERS.stars, sprite: FX_SPRITE.starArt, count: [5, 5] };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#bfeaff' },
  countWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: 'Shark', fontSize: 96, color: '#ffffff', textShadowColor: '#23263a', textShadowRadius: 6, textShadowOffset: { width: 0, height: 3 } },
  rows: { width: '100%', paddingHorizontal: 8, marginTop: 6 },
  shareRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  rowLabel: { fontFamily: 'Shark', fontSize: 16, color: '#23263a', width: 92 },
  shareBar: { flex: 1, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#23263a', backgroundColor: '#ffffff', overflow: 'hidden' },
  shareFill: { height: '100%', backgroundColor: '#2d9cff' },
  rowText: { fontFamily: 'Shark', fontSize: 15, color: '#23263a', marginBottom: 4 },
  ribbons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ribbon: { fontFamily: 'Shark', fontSize: 14, color: '#23263a', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, borderWidth: 2, borderColor: '#23263a', overflow: 'hidden' },
  ribbonGold: { backgroundColor: '#fec90e' },
  ribbonBlue: { backgroundColor: '#dff3ff' },
});

export default BananaBasketGame;
export { FIELD_W, FIELD_H, K_BUNCH };
