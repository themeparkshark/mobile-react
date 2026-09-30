/**
 * Boss Brawl v4 (design: studio/design/boss.md). Three short bouts against a
 * raid boss, locked to the music:
 *
 *   read the tell  ->  counter on the in-world target at the impact frame
 *                  ->  punish the opening on the STRIKE float (ring crits or a Heavy)
 *
 * Walk-first (QUEUE REALITY): every input sits in the bottom 40% of the field,
 * every tell is readable by eye, ear (lane pitch + pan) and haptic count, the
 * line moving never pauses anything, and intermissions between bouts are free
 * and never time out (walking fills the Tide meter for the next bout).
 *
 * The integer sim (sim/encounter.ts) decides everything; this component only
 * feeds it stamped inputs and presents what it publishes. The round's damage
 * is encoded for the live raid endpoint so the server's own formula gives the
 * same number (sim/round.ts); the v4 bout proofs ride along in meta for the
 * WS6 replay endpoint.
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, LogBox, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import type { BossId } from '../../api/endpoints/parks/raid';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { useGameClock } from '../../gamekit/useGameClock';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { playHaptic, scheduleHaptics, HP } from '../../gamekit/Haptics';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { loadCalibration } from '../../gamekit/session/calibrationStore';
import { mixSeed, hashString } from '../../gamekit/core/rng';
import { BossArena, type ArenaAnim, type ArenaImages } from './BossArena';
import { bossBeds, bossSfx } from './bossAudio';
import { arenaLayout, buildView, emptyView, hitRegion, BOSS_INDEX, type BossView } from './view';
import {
  advance, carryOut, createBout, freshCarry, input, P_DONE,
  E_ALLY_ARRIVE, E_BREAK, E_BREAK_END, E_CLANK, E_CLOSE, E_CRIT, E_EARLY, E_END, E_FEINT, E_FINISH, E_FINISHER,
  E_GAUGE_HOT, E_GOOD, E_GREY, E_GUARD_COUNTER, E_HAZARD, E_HEAVY, E_HEAVY_MISS, E_HIT, E_LOCK, E_OPEN, E_PERFECT,
  E_POP, E_PUNISH, E_SAFE_MISS, E_SHOW, E_SHUFFLE, E_SURGE, E_TELL, E_TIER,
  scoreBout, type Bout, type Carry, type SimEvent,
} from './sim/encounter';
import { IN_END, IN_PAD_DOWN, IN_PAD_UP, IN_PAUSE, IN_RESUME, IN_TARGET, STAR_POINTS } from './sim/constants';
import { pickVariant } from './sim/patterns';
import { boutProof, legacyDamage, summarize, timingReadout, toLegacyProof } from './sim/round';
import { tauntFor } from './taunts';
import { useArenaImages } from './useArenaImages';
import { CrewLayer, type CrewLayerHandle } from './multiplayer/CrewLayer';
import {
  CREW_BREAK, CREW_BREAK_END, CREW_CAUGHT, CREW_LUNGE, CREW_PERFECT, HouseCrew, ghostAt, ghostTimeline,
  type CrewTransport, type GhostTimeline,
} from './multiplayer/crew';
import { createSurge, surgeLevel, surgePip, SYNC_START_MS } from './multiplayer/strikeTeam';
import { loadGhost, saveGhostIfBest } from './multiplayer/ghostStore';
import { IN_ALLY, IN_SURGE } from './sim/constants';

export const BOSS_ART: Record<BossId, number> = {
  kraken: require('../../../assets/images/boss/kraken.png'),
  robo_shark: require('../../../assets/images/boss/robo_shark-clean-v2.png'),
  ghost_squid: require('../../../assets/images/boss/ghost_squid.png'),
};
// The cleanup keeps transparent safety padding; match the original visible character size in UI.
export const BOSS_ART_SCALE: Record<BossId, number> = { kraken: 1, robo_shark: 1.4, ghost_squid: 1 };

const ART = {
  bg: require('../../assets/games/boss/bg_lagoon.jpg'),
  buoy: require('../../assets/games/boss/ring_buoy.png'),
  lantern: require('../../assets/games/boss/paper_lantern.png'),
  plate: require('../../../assets/images/yellow_button.png'),
  float: require('../../assets/games/boss/prop_swim_ring.png'),
  shark: require('../../../assets/images/screens/welcome/shark.png'),
  sharkStrike: require('../../assets/games/boss/shark_fist_pump.png'),
  sharkBonk: require('../../assets/games/boss/shark_bonked.png'),
  sharkDizzy: require('../../assets/games/boss/shark_dizzy.png'),
  sharkCheer: require('../../assets/games/boss/shark_cheer.png'),
  anchor: require('../../assets/games/boss/prop_anchor.png'),
  splash: require('../../assets/games/boss/fx_splash_l.png'),
  impact: require('../../assets/games/boss/fx_impact_l.png'),
  star: require('../../assets/games/boss/fx_small_dizzy_star.png'),
  starburst: require('../../../assets/images/screens/explore/starburst.png'),
  cloud: require('../../../assets/images/screens/explore/cloud.png'),
  ribbon: require('../../../assets/images/ribbon.png'),
};

const THRESHOLDS = { one: STAR_POINTS.one, two: STAR_POINTS.two, three: STAR_POINTS.three };
const SIM_LAG_MS = 50;
const TIDE_STEPS = 20;
const PUNISH_WORD: Record<BossId, string> = { kraken: 'SPLASHED!', robo_shark: 'ZAPPED!', ghost_squid: 'SPOOKED!' };
const BOUT_RIBBON = ['ROUND 1', 'ROUND 2', 'FURY'];
const COUNTER_HINT: Record<BossId, string> = {
  kraken: 'Tap the buoy under the tentacle',
  robo_shark: 'Tap the sockets in the order they flash',
  ghost_squid: 'Tap the lantern under the real squid',
};
const OBJECTIVE: Record<BossId, string> = {
  kraken: 'Listen for the bell, tap its buoy as the tentacle lands, then hit the float on the gold rings.',
  robo_shark: 'Watch the circuit, tap the sockets in order, then hit the float on the gold rings.',
  ghost_squid: 'Find the real squid, tap its lantern as it lunges, then hit the float on the gold rings.',
};

type Stage = 'idle' | 'intro' | 'bout' | 'inter' | 'outro' | 'done';

export interface BossBrawlProps {
  readonly visible: boolean;
  readonly boss: BossId;
  readonly bossName: string;
  readonly hpLeft: number;
  readonly hpMax: number;
  /** Fighting from home deals a fraction of the damage (the server applies the same rate). */
  readonly damageRate?: number;
  readonly onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  readonly onClose: () => void;
  readonly onQuit?: (resume: () => void) => void;
  /** Server round seed when WS6 issues one; otherwise a local seed is derived and sent in meta. */
  readonly seed?: number;
  /** Mastery rank 0-5 (gates bout-3 variants B and C). */
  readonly rank?: number;
  /** Dev: a bot plays (MiniGameTester / capture). */
  readonly autoplay?: boolean;
  /**
   * Strike Team: a live transport (WS6 raid poll / Reverb presence) or 'house'
   * for the house-crew fill. Teammates share the seed, Team Surge, the Lure's
   * Ally Openings and Sync Strikes; nobody waits for anyone.
   */
  readonly crew?: 'house' | CrewTransport | null;
  /** Race a ghost on the same seed and variant: 'auto' = this week's local best. */
  readonly ghost?: 'auto' | { name: string; log: import('./sim/round').RoundLog } | null;
}

export function BossBrawl(props: BossBrawlProps) {
  const { visible, boss, bossName, hpLeft, hpMax, damageRate = 1, onComplete, onClose, onQuit } = props;
  const reduced = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const autoplay = !!props.autoplay || (__DEV__ && process.env.EXPO_PUBLIC_GAME_AUTOPLAY === '1');
  const shell = useRef<GameShellV2Handle>(null);
  const fxRef = useRef<FxStageHandle>(null);
  const [size, setSize] = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height - 130 });
  const L = useMemo(() => arenaLayout(size.w, size.h), [size.w, size.h]);

  const [stage, setStage] = useState<Stage>('idle');
  const stageRef = useRef<Stage>('idle');
  const [result, setResult] = useState<GameResult | null>(null);
  const [damage, setDamage] = useState(0);
  const [boutNo, setBoutNo] = useState(0);
  const [comboPct, setComboPct] = useState(100);
  const [hint, setHint] = useState<string | null>(null);
  const [ribbon, setRibbon] = useState<string | null>(null);
  const [taunt, setTaunt] = useState<string | null>(null);
  const [inter, setInter] = useState({ bout: 0, dmg: 0, steps: 0, tide: false });
  // Crew / ghost
  const crewOn = props.crew === 'house' || (!!props.crew && typeof props.crew === 'object') ||
    (__DEV__ && process.env.EXPO_PUBLIC_BOSS_CREW === '1' && props.crew !== null);
  const crewRef = useRef<CrewTransport | null>(null);
  const crewLayer = useRef<CrewLayerHandle>(null);
  const roundWall = useRef(0);
  const surge = useRef(createSurge());
  const crewBreaks = useRef(new Map<string, number>());
  const myBreakAt = useRef(-1e12);
  const ghostRef = useRef<GhostTimeline | null>(null);
  const ghostLunge = useRef(0);
  const [mates, setMates] = useState<{ id: string; name: string; lure: boolean; inBreak: boolean; ghost?: boolean }[]>([]);
  const [surgeN, setSurgeN] = useState(0);
  const [surgeOn, setSurgeOn] = useState(false);
  const [meLure, setMeLure] = useState(false);
  const [ghostLine, setGhostLine] = useState<string | null>(null);

  // Round state (JS)
  const round = useRef({ seed: 0, variant: 0, bouts: [] as Bout[], carry: freshCarry() as Carry, offset: 0, attempt: 0 });
  const boutRef = useRef<Bout | null>(null);
  const evIdx = useRef(0);
  const pending = useRef<SimEvent[]>([]);
  const openingHits = useRef(0);
  const stackTotal = useRef(0);
  const slamSeen = useRef('');
  const pauseWall = useRef(0);
  const interSteps = useRef(0);
  const stepBase = useRef(0);

  // UI-thread values
  const view = useSharedValue<BossView>(emptyView());
  const boutBase = useSharedValue(0);
  const boutT = useSharedValue(0);
  const running = useSharedValue(false);
  const padTouch = useSharedValue(-1);
  const anim: ArenaAnim = {
    flash: useSharedValue(0), squash: useSharedValue(1), knockX: useSharedValue(0), knockY: useSharedValue(0),
    lunge: useSharedValue(0), pose: useSharedValue(0), buoy0: useSharedValue(1), buoy1: useSharedValue(1),
    buoy2: useSharedValue(1), splashLane: useSharedValue(-1), splashP: useSharedValue(0), impactP: useSharedValue(0),
    impactX: useSharedValue(0), impactY: useSharedValue(0), frame: useSharedValue(0), exit: useSharedValue(0),
    exitKind: useSharedValue(0), entrance: useSharedValue(0), anchorDrop: useSharedValue(0), padHeld: useSharedValue(0),
    intermission: useSharedValue(0),
  };
  const ribbonP = useSharedValue(0);

  const fxT = useSharedValue(0);
  const clock = useGameClock({
    onFrame: (_a, _fx, c) => {
      'worklet';
      if (running.value) boutT.value = Math.floor(c.simMs - boutBase.value);
      fxT.value = c.fxMs;
    },
  });
  const walk = useWalkSense({ active: visible && !result });
  const walking = walk.walking || !!movement?.moving;
  const camera = useCamera({ width: L.W, height: L.H, timeScale: clock.fxScale, reducedMotion: reduced, walking });

  // Images (Skia)
  const loaded = useArenaImages({
    bg: ART.bg, boss: BOSS_ART[boss], buoy: ART.buoy, lantern: ART.lantern, plate: ART.plate, float: ART.float,
    shark: ART.shark, sharkStrike: ART.sharkStrike, sharkBonk: ART.sharkBonk, sharkDizzy: ART.sharkDizzy,
    sharkCheer: ART.sharkCheer, anchor: ART.anchor, splash: ART.splash, impact: ART.impact, star: ART.star,
    starburst: ART.starburst, cloud: ART.cloud,
  });
  const imgMemo: ArenaImages = useMemo(() => loaded, [loaded]);
  const animMemo = useMemo(() => anim, []); // eslint-disable-line react-hooks/exhaustive-deps

  const beds = useMemo(() => bossBeds(boss), [boss]);
  useEffect(() => {
    bossSfx.init();
    bossSfx.preload(boss);
  }, [boss]);

  const setStageBoth = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };

  // ---- music --------------------------------------------------------------
  const musicFor = useCallback((s: Stage, bout: number) => {
    if (s === 'bout') return bout === 2 ? beds.fury : beds.main;
    if (s === 'inter') return beds.rest;
    if (s === 'intro') return beds.main;
    return null;
  }, [beds]);
  useEffect(() => {
    if (!visible) return undefined;
    const bed = musicFor(stage, boutNo);
    if (!bed) return undefined;
    // Re-seek to the grid at every bout start: t=0 of the bout is a downbeat.
    void GameAudio.init().then(() => GameAudio.music.play(bed, stage === 'bout' ? 60 : 400, 0)).catch(() => undefined);
    return undefined;
  }, [visible, stage, boutNo, musicFor]);
  useEffect(() => () => GameAudio.music.stop(400), []);

  // ---- reset on open ------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const r = round.current;
    r.attempt += 1;
    r.seed = props.seed !== undefined ? props.seed >>> 0 : mixSeed(hashString(`${boss}:${hpMax}:${hpLeft}`), (Date.now() & 0x7fffffff) + r.attempt);
    r.variant = pickVariant(r.seed, props.rank ?? 0, -1);
    r.bouts = [];
    r.carry = freshCarry();
    boutRef.current = null;
    setResult(null);
    setDamage(0);
    setBoutNo(0);
    setHint(null);
    setTaunt(null);
    setStageBoth('idle');
    view.value = emptyView();
    running.value = false;
    anim.entrance.value = 0;
    anim.exit.value = 0;
    anim.pose.value = 0;
    crewRef.current = null;
    ghostRef.current = null;
    setMates([]);
    setGhostLine(null);
    surge.current = createSurge();
    crewBreaks.current.clear();
    const g = props.ghost ?? (__DEV__ && process.env.EXPO_PUBLIC_BOSS_GHOST === '1' ? 'auto' : null);
    if (g === 'auto') {
      void loadGhost(boss).then((stored) => {
        if (!stored || stageRef.current !== 'idle') return;
        // A ghost race is forced onto the ghost's seed and variant.
        round.current.seed = stored.log.seed >>> 0;
        round.current.variant = stored.log.variant;
        ghostRef.current = ghostTimeline(stored.log, 'YOUR BEST');
      });
    } else if (g && typeof g === 'object') {
      r.seed = g.log.seed >>> 0;
      r.variant = g.log.variant;
      ghostRef.current = ghostTimeline(g.log, g.name);
    }
    void loadCalibration().then((cal) => { round.current.offset = Math.max(-120, Math.min(120, Math.round(cal.inputOffsetMs || 0))); }).catch(() => undefined);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- bout lifecycle -----------------------------------------------------
  const showRibbon = useCallback((text: string, ms = 1100) => {
    setRibbon(text);
    ribbonP.value = 0;
    ribbonP.value = withSequence(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withDelay(ms - 400, withTiming(2, { duration: 180, easing: Easing.in(Easing.cubic) })));
  }, [ribbonP]);

  const startBout = useCallback((n: number, tide: boolean) => {
    const r = round.current;
    const b = createBout({
      boss, seed: r.seed, bout: n, carry: r.carry, walk: walking, tide, offset: r.offset, variant: r.variant,
      team: !!crewRef.current,
    });
    boutRef.current = b;
    evIdx.current = 0;
    ghostLunge.current = 0;
    pending.current = [];
    openingHits.current = 0;
    slamSeen.current = '';
    view.value = buildView(b);
    setBoutNo(n);
    // Bout clock origin = this frame's sim time, set on the UI thread.
    const clk = clock.clock;
    runOnUI(() => {
      'worklet';
      boutBase.value = clk.value.simMs;
      boutT.value = 0;
      running.value = true;
    })();
    setStageBoth('bout');
    if (n === 0 && r.bouts.length === 0) setHint(COUNTER_HINT[boss]);
  }, [boss, walking, clock.clock, boutBase, boutT, running, view]);

  const introThen = useCallback((n: number, tide: boolean) => {
    // Bout intro (1.2 s): ribbon, roar, push-in. Then simT starts.
    setStageBoth('intro');
    showRibbon(BOUT_RIBBON[n]);
    if (n > 0) bossSfx.phaseUp();
    else bossSfx.go();
    if (!reduced) {
      camera.punch(0.05);
      camera.shake(0.3, 0, 1);
    }
    anim.squash.value = withSequence(withTiming(1.12, { duration: 250, easing: Easing.out(Easing.back(2)) }), withTiming(1, { duration: 300 }));
    setTimeout(() => {
      if (stageRef.current === 'intro') startBout(n, tide);
    }, 1200);
  }, [anim.squash, camera, reduced, showRibbon, startBout]);

  const beginRound = useCallback(() => {
    // Entrance: the boss bursts through the water lip.
    roundWall.current = Date.now();
    if (crewOn) {
      crewRef.current = typeof props.crew === 'object' && props.crew ? props.crew : new HouseCrew(boss, round.current.seed, 2);
      setMates(crewRef.current.roster().filter((m) => m.id !== 'me').map((m) => ({ id: m.id, name: m.name, lure: false, inBreak: false })));
    } else if (ghostRef.current) {
      setMates([{ id: 'ghost', name: ghostRef.current.name, lure: false, inBreak: false, ghost: true }]);
    }
    setStageBoth('intro');
    bossSfx.entrance(boss);
    playHaptic('tierUp', { priority: HP.own });
    anim.entrance.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.6)) });
    setTimeout(() => {
      fxRef.current?.burst('splash', L.bossX, L.bossY + L.bossSize * 0.25, { count: 24 });
    }, 250);
    setTimeout(() => introThen(0, false), 900);
  }, [boss, anim.entrance, L, introThen, crewOn, props.crew]);

  // ---- results --------------------------------------------------------------
  const buildResult = useCallback((reason?: string): GameResult => {
    const r = round.current;
    const bouts = r.bouts;
    const s = summarize(bouts);
    const legacy = toLegacyProof(s.damage, s.simMs);
    const score = legacyDamage(legacy, damageRate);
    const proofs = bouts.map(boutProof);
    const message = s.stars === 3 ? (hpLeft - score <= 0 ? 'KNOCKOUT!' : 'BOSS BUSTER!') : s.stars === 2 ? 'BIG DAMAGE!' : s.stars === 1 ? 'NICE HITS!' : 'LISTEN FOR THE BELL';
    return {
      score,
      stars: s.stars,
      message,
      maxCombo: s.maxChain,
      thresholds: {
        one: Math.floor(THRESHOLDS.one * damageRate), two: Math.floor(THRESHOLDS.two * damageRate), three: Math.floor(THRESHOLDS.three * damageRate),
      },
      stats: [
        { label: 'PERFECTS', value: `${s.perfect}` },
        { label: 'BREAKS', value: `${s.breaks}` },
        { label: 'RING CRITS', value: `${s.crits}` },
        { label: 'TIMING', value: timingReadout(s.medianErr) },
        ...(s.nextStar ? [{ label: 'NEXT STAR', value: s.nextStar }] : []),
      ],
      meta: {
        hits: legacy.hits, weak_hits: legacy.weak_hits, duration_ms: legacy.duration_ms,
        game: 'boss', version: 4, boss, seed: r.seed, variant: r.variant, damage_points: s.damage, per_bout: s.perBout,
        bouts: proofs, input_offset_ms: r.offset, ...(reason ? { reason } : {}),
      },
    };
  }, [damageRate, hpLeft]);

  const finishRound = useCallback(() => {
    const r = round.current;
    const s = summarize(r.bouts);
    const res = buildResult();
    if (r.bouts.length === 3 && s.damage > 0) {
      void saveGhostIfBest(boss, { name: 'YOUR BEST', damage: s.damage, savedAt: Date.now(),
        log: { boss, seed: r.seed, variant: r.variant, bouts: r.bouts.map(boutProof) } });
    }
    setStageBoth('outro');
    running.value = false;
    const ko = hpLeft - res.score <= 0 && s.damage > 0;
    setTaunt(tauntFor(boss, s.stars, ko, s.breaks));
    anim.exitKind.value = ko ? 1 : 0;
    anim.exit.value = withDelay(300, withTiming(1, { duration: ko ? 1100 : 800, easing: Easing.in(Easing.quad) }));
    if (ko) {
      bossSfx.ko(boss);
      scheduleHaptics([{ at: 0, p: 'heavy' }, { at: 150, p: 'medium' }, { at: 280, p: 'light' }, { at: 400, p: 'soft' }, { at: 650, p: 'success' }]);
      anim.pose.value = 4;
      setTimeout(() => fxRef.current?.burst('confetti', L.W / 2, L.bossY, { count: 48 }), 500);
      setTimeout(() => fxRef.current?.burst('splash', L.bossX, L.bossY + L.bossSize * 0.3, { count: 48 }), 900);
    } else if (s.stars === 0) {
      bossSfx.zero();
    } else {
      bossSfx.retreat();
      scheduleHaptics([{ at: 0, p: 'medium' }, { at: 300, p: 'success' }]);
      if (s.stars >= 2) anim.pose.value = 4;
      setTimeout(() => fxRef.current?.burst('splash', L.bossX, L.bossY + L.bossSize * 0.3, { count: 16 }), 700);
    }
    setTimeout(() => {
      setTaunt(null);
      setStageBoth('done');
      setResult(res);
    }, ko ? 2300 : 1800);
  }, [anim.exit, anim.exitKind, anim.pose, boss, buildResult, hpLeft, L, running]);

  const endBoutNow = useCallback((b: Bout) => {
    const r = round.current;
    running.value = false;
    r.bouts.push(b);
    r.carry = carryOut(b);
    boutRef.current = null;
    view.value = { ...buildView(b), aOn: false, oOn: false, finOn: false };
    const total = r.bouts.reduce((sum, x) => sum + scoreBout(x), 0);
    setDamage(total);
    anim.padHeld.value = 0;
    padTouch.value = -1;
    setHint(null);
    if (b.cfg.bout >= 2 || b.endT < 0) {
      finishRound();
      return;
    }
    // Intermission: free, never times out; steps fill the Tide meter.
    stepBase.current = walk.state.current.steps;
    interSteps.current = 0;
    setInter({ bout: b.cfg.bout + 1, dmg: scoreBout(b), steps: 0, tide: false });
    setStageBoth('inter');
    anim.squash.value = withSequence(withTiming(0.9, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 200 }));
  }, [anim.padHeld, anim.squash, finishRound, padTouch, running, view, walk.state]);

  // Intermission Tide meter (walking feeds the next bout).
  useEffect(() => {
    if (stage !== 'inter') return undefined;
    const id = setInterval(() => {
      const steps = Math.max(0, walk.state.current.steps - stepBase.current);
      if (steps !== interSteps.current) {
        if (steps > interSteps.current && steps <= TIDE_STEPS) bossSfx.tideTick(steps);
        interSteps.current = steps;
        setInter((s) => ({ ...s, steps, tide: steps >= TIDE_STEPS }));
      }
    }, 200);
    return () => clearInterval(id);
  }, [stage, walk.state]);

  const fight = useCallback(() => {
    if (stageRef.current !== 'inter') return;
    bossSfx.ready();
    playHaptic('tap', { priority: HP.own });
    const n = inter.bout;
    introThen(n, inter.tide);
  }, [inter.bout, inter.tide, introThen]);

  // ---- presentation of sim events --------------------------------------------
  const lane2x = (lane: number) => L.laneX[Math.max(0, Math.min(2, lane))];
  const buoySq = (lane: number, s = 0.7) => {
    const sv = lane === 0 ? anim.buoy0 : lane === 1 ? anim.buoy1 : anim.buoy2;
    sv.value = withSequence(withTiming(s, { duration: 80 }), withTiming(1.08, { duration: 120 }), withTiming(1, { duration: 100 }));
  };
  const bossHit = (px: number, strength: number) => {
    // Squash + directional flinch away from the contact, spring back.
    anim.squash.value = withSequence(withTiming(1 - 0.05 * strength, { duration: 50 }), withTiming(1, { duration: 140 }));
    const kx = (L.bossX - px) * 0.05 * strength;
    anim.knockX.value = withSequence(withTiming(kx, { duration: 50 }), withSpring(0, { damping: 12, stiffness: 220 }));
    anim.knockY.value = withSequence(withTiming(-6 * strength, { duration: 50 }), withSpring(0, { damping: 12, stiffness: 220 }));
    anim.flash.value = withSequence(withTiming(0.3 * Math.min(1, strength), { duration: 30 }), withTiming(0, { duration: 120 }));
  };
  const sharkLunge = () => {
    anim.lunge.value = withSequence(withTiming(1, { duration: 60, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 140 }));
  };
  const impactAt = (x: number, y: number) => {
    anim.impactX.value = x;
    anim.impactY.value = y;
    anim.impactP.value = 0;
    anim.impactP.value = withTiming(1, { duration: 320 });
  };
  const impactFrame = () => {
    if (reduced) return;
    anim.frame.value = withSequence(withTiming(2, { duration: 0 }), withDelay(17, withTiming(1, { duration: 0 })), withDelay(17, withTiming(0, { duration: 0 })));
  };
  const pose = (p: number, ms: number) => {
    anim.pose.value = p;
    anim.pose.value = withDelay(ms, withTiming(0, { duration: 0 }));
  };
  const stack = (v: number, crit: boolean) => {
    stackTotal.current += v;
    const n = openingHits.current;
    fxRef.current?.flyUp(`${Math.round(stackTotal.current / 10000)}`, L.bossX + L.bossSize * 0.36, L.bossY - L.bossSize * 0.18 - n * 2,
      { key: 'stack', size: crit ? 'xl' : 'lg', color: crit ? '#FFCF3B' : '#FFFFFF', rise: 6, ms: 700 });
  };

  const teamPerfect = () => {
    const now = Date.now() - roundWall.current;
    const full = surgePip(surge.current, now);
    setSurgeN(surgeLevel(surge.current, now));
    if (full) {
      setSurgeOn(true);
      setTimeout(() => setSurgeOn(false), 1600);
      bossSfx.surge();
      scheduleHaptics([{ at: 0, p: 'medium' }, { at: 100, p: 'medium' }], { priority: HP.own });
      fxRef.current?.flyUp('TEAM SURGE!', L.W / 2, L.bossY - L.bossSize * 0.2, { size: 'xl', color: '#FFCF3B' });
      const b = boutRef.current;
      if (b && stageRef.current === 'bout') {
        input(b, { t: boutT.value, k: IN_SURGE });
        view.value = buildView(b);
      }
    }
  };
  const syncStrike = () => {
    crewLayer.current?.sync();
    bossSfx.sync();
    clock.hitStop(120, { force: true });
    scheduleHaptics([{ at: 0, p: 'medium' }, { at: 100, p: 'medium' }], { priority: HP.own });
  };

  const onEvent = (e: SimEvent) => {
    const bx = L.bossX;
    const by = L.bossY;
    switch (e.code) {
      case E_TELL:
        bossSfx.tell(boss, e.a);
        playHaptic(e.a === 0 ? 'lane1' : e.a === 1 ? 'lane2' : 'lane3', { priority: HP.telegraph, tell: true });
        if (!walking && !reduced) camera.lean((lane2x(e.a) - bx) * 0.05, 0);
        break;
      case E_FEINT:
        bossSfx.feint();
        break;
      case E_SHOW:
        bossSfx.icon(boss, e.a % 3, e.a % 3);
        break;
      case E_SHUFFLE:
        GameAudio.play(GameAudio.hasCue('bo_shuffle') ? 'bo_shuffle' : 'fx.whoosh');
        break;
      case E_HAZARD:
        GameAudio.play(GameAudio.hasCue('sh_puff_inflate') ? 'sh_puff_inflate' : 'fx.whoosh', { volume: 0.6 });
        break;
      case E_POP:
        bossSfx.pop();
        buoySq(e.a, 0.8);
        fxRef.current?.burst('bubbles', lane2x(e.a), L.targetY - 10, { count: 10 });
        fxRef.current?.flyUp('POP!', lane2x(e.a), L.targetY - 50, { size: 'md', color: '#FFFFFF' });
        break;
      case E_GREY:
        bossSfx.grey();
        fxRef.current?.flyUp(e.b === 1 ? 'FAKE!' : 'FAKE', lane2x(e.a), L.targetY - 60, { size: 'md', color: '#FFFFFF' });
        break;
      case E_EARLY:
        bossSfx.early();
        break;
      case E_LOCK:
        bossSfx.lock(e.b);
        buoySq(e.a, 0.8);
        fxRef.current?.burst('sparks', lane2x(e.a), L.targetY, { count: 8 });
        break;
      case E_PERFECT:
      case E_GOOD: {
        const perfect = e.code === E_PERFECT;
        bossSfx.snag(boss);
        if (perfect) bossSfx.perfect();
        scheduleHaptics(perfect ? [{ at: 0, p: 'medium' }, { at: 60, p: 'light' }] : [{ at: 0, p: 'medium' }], { priority: HP.own });
        clock.hitStop(perfect ? 70 : 30);
        buoySq(e.a);
        const x = lane2x(e.a);
        fxRef.current?.burst(perfect ? 'stars' : 'sparks', x, L.targetY - 20, { count: perfect ? 10 : 6 });
        fxRef.current?.ring(x, L.targetY, { color: perfect ? '#FFCF3B' : '#FFFFFF', to: perfect ? 70 : 50, ms: 200 });
        fxRef.current?.flyUp(perfect ? 'PERFECT' : 'GOOD', x, L.targetY - 70, { size: perfect ? 'lg' : 'md', color: perfect ? '#FFCF3B' : '#FFFFFF' });
        if (perfect && !reduced) {
          camera.punch(0.06);
          // Stagger: knocked back along the counter vector.
          anim.knockX.value = withSequence(withTiming((bx - x) * 0.12, { duration: 70 }), withSpring(0, { damping: 10, stiffness: 160 }));
          anim.knockY.value = withSequence(withTiming(-14, { duration: 70 }), withSpring(0, { damping: 10, stiffness: 160 }));
          anim.flash.value = withSequence(withTiming(0.4, { duration: 30 }), withTiming(0, { duration: 160 }));
        }
        setHint(null);
        if (perfect && crewRef.current) {
          crewRef.current.publish({ kind: CREW_PERFECT, who: 'me', at: Date.now() - roundWall.current });
          teamPerfect();
        }
        break;
      }
      case E_PUNISH:
      case E_SAFE_MISS: {
        const safe = e.code === E_SAFE_MISS;
        if (!safe) {
          bossSfx.punish(boss);
          playHaptic('punish', { priority: HP.critical });
          pose(2, 800);
          if (!reduced) camera.shake(0.3, 0, 1);
          fxRef.current?.flash({ color: '#BFF6FF', peak: 0.3, ms: 280 });
          fxRef.current?.flyUp(PUNISH_WORD[boss], L.floatX, L.floatY - L.floatR * 2.2, { size: 'lg', color: '#FF6B5C' });
        } else {
          fxRef.current?.flyUp(e.b === 2 ? 'THAT ONE WAS FAKE' : 'WATCH THE TELL', lane2x(e.a), L.targetY - 70, { size: 'sm', color: '#FFFFFF' });
        }
        break;
      }
      case E_OPEN:
        openingHits.current = 0;
        stackTotal.current = 0;
        if (e.a === 2) {
          bossSfx.ally();
          fxRef.current?.flyUp('ALLY OPENING!', bx, by - L.bossSize * 0.62, { size: 'md', color: '#FFCF3B' });
        }
        break;
      case E_HIT:
      case E_HEAVY_MISS:
      case E_CRIT: {
        const crit = e.code === E_CRIT;
        openingHits.current += 1;
        const n = openingHits.current;
        if (crit) bossSfx.crit(n);
        else bossSfx.hit(n);
        playHaptic(crit ? 'crit' : 'tap', { priority: HP.own });
        clock.hitStop(crit ? 55 : 20, { force: !crit });
        sharkLunge();
        bossHit(L.floatX, crit ? 1.6 : 1);
        const cy = by + L.bossSize * 0.12;
        if (crit) impactAt(bx + (Math.random() - 0.5) * 40, cy);
        fxRef.current?.burst(crit ? 'stars' : 'sparks', bx, cy, { count: Math.min(12, 4 + 2 * n) + (crit ? 6 : 0) });
        if (crit) fxRef.current?.ring(bx, cy, { color: '#FFCF3B', to: 90, ms: 260 });
        if (crit && !reduced) camera.shake(0.25, 0, -1);
        stack(e.v, crit);
        break;
      }
      case E_HEAVY:
        bossSfx.heavy();
        scheduleHaptics([{ at: 0, p: 'rigid' }, { at: 50, p: 'heavy' }], { priority: HP.own });
        clock.hitStop(70, { force: true });
        anim.lunge.value = withSequence(withTiming(1.6, { duration: 90 }), withTiming(0, { duration: 180 }));
        bossHit(L.floatX, 3);
        impactAt(bx, by + L.bossSize * 0.1);
        fxRef.current?.burst('stars', bx, by, { count: 20 });
        fxRef.current?.ring(bx, by, { color: '#FFCF3B', to: 110, ms: 300 });
        fxRef.current?.flyUp('HEAVY!', bx, by - L.bossSize * 0.35, { size: 'xl', color: '#FFCF3B' });
        if (!reduced) {
          camera.punch(0.08);
          camera.shake(0.3, 0, -1);
        }
        stack(e.v, true);
        break;
      case E_CLANK:
        bossSfx.clank();
        fxRef.current?.burst('sparks', L.floatX, L.floatY - L.floatR, { count: 3, color: 0xffffffff });
        if (e.a >= 3) fxRef.current?.flyUp('CLANK', L.floatX, L.floatY - L.floatR * 1.9, { size: 'sm', color: '#FFFFFF', key: 'clank' });
        break;
      case E_GUARD_COUNTER:
        bossSfx.guardCounter();
        playHaptic('dizzy', { priority: HP.critical });
        pose(3, 1150);
        if (!reduced) camera.shake(0.35);
        fxRef.current?.flyUp('DIZZY', L.floatX, L.floatY - L.floatR * 2.2, { size: 'lg', color: '#FF6B5C' });
        fxRef.current?.burst('stars', L.floatX, L.floatY - L.floatR * 1.4, { count: 8 });
        setHint('One tap per gold ring');
        break;
      case E_CLOSE:
        bossSfx.close();
        playHaptic('goodHit', { priority: HP.own });
        bossHit(L.floatX, 1.4);
        fxRef.current?.ring(bx, by, { color: '#FFFFFF', to: 70, ms: 220 });
        if (stackTotal.current > 0) {
          fxRef.current?.flyUp(`${Math.round(stackTotal.current / 10000)}`, bx + L.bossSize * 0.36, by - L.bossSize * 0.18, { key: 'stack', size: 'xl', color: '#FFCF3B', rise: 26, ms: 700 });
        }
        break;
      case E_BREAK: {
        impactFrame();
        bossSfx.brk(boss);
        const extra = Math.max(0, e.a - 1);
        const steps = [{ at: 0, p: 'heavy' as const }, { at: 70, p: 'rigid' as const }, { at: 140, p: 'rigid' as const }];
        for (let k = 0; k < extra; k++) steps.push({ at: 210 + 70 * k, p: 'rigid' });
        scheduleHaptics(steps, { priority: HP.critical });
        clock.hitStop(120 + 20 * e.a, { force: true });
        if (!reduced) {
          camera.punch(0.07 + 0.03 * e.a);
          camera.shake(0.6, 0, 1);
        }
        fxRef.current?.burst('stars', bx, by, { count: 24 + 8 * e.a });
        fxRef.current?.burst('confetti', bx, by, { count: 16 + 8 * e.a });
        fxRef.current?.flyUp(e.a > 1 ? `BREAK x${e.a}` : 'BREAK!', bx, by - L.bossSize * 0.55, { size: 'xl', color: '#FFCF3B' });
        fxRef.current?.vignette({ color: '#FFCF3B', peak: 0.3, inMs: 60, holdMs: 2200, outMs: 400 });
        openingHits.current = 0;
        stackTotal.current = e.v;
        setHint('BREAK! Hit the float on every gold ring');
        myBreakAt.current = Date.now() - roundWall.current;
        if (crewRef.current) {
          crewRef.current.publish({ kind: CREW_BREAK, who: 'me', at: myBreakAt.current });
          for (const at of crewBreaks.current.values()) if (Math.abs(at - myBreakAt.current) <= SYNC_START_MS) syncStrike();
        }
        break;
      }
      case E_BREAK_END:
        GameAudio.play('fx.whoosh', { volume: 0.7 });
        setHint(null);
        break;
      case E_FINISHER:
        bossSfx.finisherReady();
        setHint('FINISHER: hold the float, release on the ring');
        break;
      case E_FINISH:
        setHint(null);
        if (e.a > 0) {
          anim.anchorDrop.value = 0;
          anim.anchorDrop.value = withSequence(withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 0 }));
          setTimeout(() => {
            impactFrame();
            bossSfx.finisherImpact(boss);
            scheduleHaptics([{ at: 0, p: 'light' }, { at: 90, p: 'medium' }, { at: 180, p: 'heavy' }], { priority: HP.critical });
            bossHit(bx, 3);
            impactAt(bx, by);
            fxRef.current?.burst('stars', bx, by, { count: 40 });
            fxRef.current?.burst('splash', bx, by + L.bossSize * 0.2, { count: 30 });
            fxRef.current?.flyUp(e.a === 2 ? 'PERFECT FINISHER!' : 'FINISHER!', bx, by - L.bossSize * 0.5, { size: 'xl', color: '#FFCF3B' });
            if (!reduced) {
              camera.punch(0.12);
              camera.shake(0.8, 0, 1);
            }
          }, 220);
        } else {
          fxRef.current?.flyUp('SHRUGGED IT OFF', bx, by - L.bossSize * 0.5, { size: 'md', color: '#FFFFFF' });
        }
        break;
      case E_TIER:
        setComboPct(e.a);
        bossSfx.tier();
        if (e.a >= 200) fxRef.current?.flyUp('FURY!', L.W - 70, 40, { size: 'lg', color: '#FFCF3B' });
        break;
      case E_GAUGE_HOT:
        bossSfx.gaugeHot();
        playHaptic('dizzy', { priority: HP.reaction });
        break;
      case E_SURGE:
        bossSfx.surge();
        break;
      case E_ALLY_ARRIVE:
        break;
      case E_END:
        break;
      default:
    }
  };

  // ---- crew / ghost tick (wall clock; nothing here ever pauses anyone) -------
  useEffect(() => {
    if (!visible || stage === 'idle' || stage === 'done') return undefined;
    const id = setInterval(() => {
      const now = Date.now() - roundWall.current;
      const crew = crewRef.current;
      if (crew) {
        const lure = crew instanceof HouseCrew ? crew.lure(boutNo, stageRef.current === 'bout') : null;
        for (const ev of crew.drain(now)) {
          if (ev.kind === CREW_LUNGE) {
            crewLayer.current?.lunge(ev.who);
            GameAudio.play(GameAudio.hasCue('bo_hit') ? 'bo_hit' : 'fx.hit', { volume: 0.3, pitch: 2 });
            fxRef.current?.burst('sparks', L.bossX + (Math.random() - 0.5) * 60, L.bossY, { count: 5 });
          } else if (ev.kind === CREW_PERFECT) {
            teamPerfect();
            const b = boutRef.current;
            if (ev.who === lure && b && stageRef.current === 'bout' && b.pendingAlly === 0) {
              // The Lure's PERFECT exposes the boss's back in my fight: an Ally Opening at my next recover.
              input(b, { t: boutT.value, k: IN_ALLY });
              playHaptic('incoming', { priority: HP.own });
              crewLayer.current?.lunge(ev.who);
            }
          } else if (ev.kind === CREW_BREAK) {
            crewBreaks.current.set(ev.who, ev.at);
            if (Math.abs(ev.at - myBreakAt.current) <= SYNC_START_MS) syncStrike();
          } else if (ev.kind === CREW_BREAK_END) {
            crewBreaks.current.delete(ev.who);
          } else if (ev.kind === CREW_CAUGHT) {
            crewLayer.current?.caught(ev.who);
          }
        }
        setMeLure(lure === 'me');
        setSurgeN(surgeLevel(surge.current, now));
        setMates((ms) => {
          const next = ms.map((m) => ({ ...m, lure: m.id === lure, inBreak: crewBreaks.current.has(m.id) }));
          return next.some((m, i) => m.lure !== ms[i].lure || m.inBreak !== ms[i].inBreak) ? next : ms;
        });
      }
      const g = ghostRef.current;
      const b = boutRef.current;
      if (g && b && stageRef.current === 'bout') {
        const t = boutT.value;
        const theirs = ghostAt(g, b.cfg.bout, t);
        const mine = round.current.bouts.reduce((sum, x) => sum + scoreBout(x), 0) + scoreBout(b);
        const d = mine - theirs;
        setGhostLine(`vs ${g.name}: ${d >= 0 ? '+' : ''}${d}`);
        const lunges = g.bouts[b.cfg.bout]?.lunges ?? [];
        while (ghostLunge.current < lunges.length && lunges[ghostLunge.current] <= t) {
          ghostLunge.current += 1;
          if (!crew) crewLayer.current?.lunge('ghost');
        }
      }
    }, 100);
    return () => clearInterval(id);
  }, [visible, stage, boutNo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- JS sim loop: advance (with a small lag), fire due events, publish ----
  useEffect(() => {
    if (stage !== 'bout') return undefined;
    let raf = 0;
    const loop = () => {
      const b = boutRef.current;
      if (!b) return;
      const now = boutT.value;
      const before = b.events.length;
      advance(b, now - SIM_LAG_MS);
      if (b.events.length !== before || evIdx.current !== b.events.length) {
        for (let i = evIdx.current; i < b.events.length; i++) pending.current.push(b.events[i]);
        evIdx.current = b.events.length;
        view.value = buildView(b);
        setComboPct(100 * 0 + (b.carry.chain >= 10 ? 200 : b.carry.chain >= 6 ? 150 : b.carry.chain >= 3 ? 120 : 100));
        setDamage(round.current.bouts.reduce((s, x) => s + scoreBout(x), 0) + scoreBout(b));
      }
      // Slam lands on an unanswered target at the impact frame (sound + splash on time).
      const a = b.attack;
      if (a) {
        const st = a.steps[b.step];
        const key = `${b.cfg.bout}:${a.no}:${b.step}`;
        if (st && now >= st.I && slamSeen.current !== key) {
          slamSeen.current = key;
          bossSfx.slam(boss);
          anim.splashLane.value = st.lane;
          anim.splashP.value = 0;
          anim.splashP.value = withTiming(1, { duration: 520 });
          buoySq(st.lane, 0.6);
        }
      }
      // Fire due events; tells go out one audio-latency early so they are heard on time.
      const lead = Math.min(80, Math.max(0, GameAudio.latencyMs || 0));
      const due: SimEvent[] = [];
      const rest: SimEvent[] = [];
      for (const e of pending.current) ((e.code === E_TELL || e.code === E_SHOW || e.code === E_FEINT ? e.t - lead : e.t) <= now ? due : rest).push(e);
      pending.current = rest;
      due.sort((x, y) => x.t - y.t);
      for (const e of due) onEvent(e);
      if (b.phase === P_DONE && now >= b.endT && rest.length === 0) {
        endBoutNow(b);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- input ------------------------------------------------------------------
  const onInput = useCallback((k: number, a: number, t: number) => {
    const b = boutRef.current;
    if (!b || stageRef.current !== 'bout' || b.phase === P_DONE) return;
    const before = b.events.length;
    input(b, k === IN_TARGET ? { t, k, a } : { t, k });
    if (k === IN_TARGET) {
      buoySq(a, 0.82);
      playHaptic('tap', { priority: HP.reaction });
      GameAudio.play('ui.press', { volume: 0.35 });
    }
    if (b.events.length !== before) {
      for (let i = evIdx.current; i < b.events.length; i++) pending.current.push(b.events[i]);
      evIdx.current = b.events.length;
      // Input results are due now: fire immediately for zero added latency.
      const now = Math.max(t, boutT.value);
      const due = pending.current.filter((e) => e.t <= now);
      pending.current = pending.current.filter((e) => e.t > now);
      due.forEach(onEvent);
    }
    view.value = buildView(b);
    setDamage(round.current.bouts.reduce((sum, x) => sum + scoreBout(x), 0) + scoreBout(b));
  }, [boutT, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => Gesture.Manual()
    .onTouchesDown((e) => {
      'worklet';
      if (!running.value) return;
      for (const tch of e.changedTouches) {
        const region = hitRegion(L, tch.x, tch.y);
        const t = boutT.value;
        if (region === 3) {
          if (padTouch.value >= 0) runOnJS(onInput)(IN_PAD_UP, 0, t);
          padTouch.value = tch.id;
          anim.padHeld.value = 1;
          runOnJS(onInput)(IN_PAD_DOWN, 0, t);
        } else if (region >= 0) {
          runOnJS(onInput)(IN_TARGET, region, t);
        }
      }
    })
    .onTouchesUp((e) => {
      'worklet';
      for (const tch of e.changedTouches) {
        if (tch.id === padTouch.value) {
          padTouch.value = -1;
          anim.padHeld.value = 0;
          if (running.value) runOnJS(onInput)(IN_PAD_UP, 0, boutT.value);
        }
      }
    })
    .onTouchesCancelled((e) => {
      'worklet';
      for (const tch of e.changedTouches) {
        if (tch.id === padTouch.value) {
          padTouch.value = -1;
          anim.padHeld.value = 0;
          if (running.value) runOnJS(onInput)(IN_PAD_UP, 0, boutT.value);
        }
      }
    }), [L, onInput]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accessibility / Simple controls path: same inputs, stamped on the JS side.
  const a11yTarget = (lane: number) => onInput(IN_TARGET, lane, boutT.value);
  const a11yStrike = () => {
    const t = boutT.value;
    onInput(IN_PAD_DOWN, 0, t);
    onInput(IN_PAD_UP, 0, t + 40);
  };

  // ---- dev autoplay: a mastery-ish bot through the same input path ------------
  useEffect(() => {
    if (!autoplay || stage !== 'bout') return undefined;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let seenA = '';
    let seenO = -1;
    let seenF = false;
    const at = (simT: number, fn: () => void) => {
      const ms = Math.max(0, simT - boutT.value);
      timers.push(setTimeout(fn, ms));
    };
    const id = setInterval(() => {
      const b = boutRef.current;
      if (!b) return;
      const a = b.attack;
      if (a && seenA !== `${b.cfg.bout}:${a.no}`) {
        seenA = `${b.cfg.bout}:${a.no}`;
        if (a.hazardLane >= 0) at(a.hazardT0 + 200, () => onInput(IN_TARGET, a.hazardLane, boutT.value));
        a.steps.forEach((s, k) => {
          const when = s.graded ? s.I - 40 + Math.round((Math.random() - 0.5) * 60) : a.T + 80 + k * 120;
          at(when, () => {
            const cur = boutRef.current?.attack;
            if (!cur) return;
            const lane = cur.swaps.length ? (cur.swaps.length && boutT.value >= cur.swaps[0] ? cur.swaps[1] : cur.lane0) : s.lane;
            onInput(IN_TARGET, lane, boutT.value);
          });
        });
      }
      const o = b.opening;
      if (o && o.id !== seenO) {
        seenO = o.id;
        o.rings.forEach((r) => at(r - 10 + Math.round((Math.random() - 0.5) * 50), () => {
          anim.padHeld.value = 1;
          onInput(IN_PAD_DOWN, 0, boutT.value);
          setTimeout(() => {
            anim.padHeld.value = 0;
            onInput(IN_PAD_UP, 0, boutT.value);
          }, 45);
        }));
      }
      const f = b.finisher;
      if (f && !seenF) {
        seenF = true;
        at(f.start + 400, () => {
          anim.padHeld.value = 1;
          onInput(IN_PAD_DOWN, 0, boutT.value);
        });
        at(f.ring - 20, () => {
          anim.padHeld.value = 0;
          onInput(IN_PAD_UP, 0, boutT.value);
        });
      }
    }, 50);
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
    };
  }, [autoplay, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoplay || stage !== 'inter') return undefined;
    LogBox.ignoreAllLogs(true);
    const id = setTimeout(fight, 2200);
    return () => clearTimeout(id);
  }, [autoplay, stage, fight]);

  // ---- shell hooks ---------------------------------------------------------------
  const onStart = useCallback(() => {
    if (stageRef.current === 'idle') beginRound();
  }, [beginRound]);
  const onPause = useCallback(() => {
    clock.pause();
    pauseWall.current = Date.now();
    GameAudio.music.pause(200);
    const b = boutRef.current;
    if (b && stageRef.current === 'bout') {
      input(b, { t: boutT.value, k: IN_PAUSE });
      view.value = buildView(b);
    }
  }, [boutT, clock, view]);
  const onResume = useCallback(() => {
    const away = Date.now() - pauseWall.current;
    const b = boutRef.current;
    if (b && stageRef.current === 'bout') {
      // Backgrounded longer than 30 s paintballs the bout (its damage still counts).
      input(b, { t: boutT.value, k: away > 30000 ? IN_END : IN_RESUME });
      view.value = buildView(b);
    }
    clock.resume();
    // No countdown: resume exactly where it was with a 400 ms ramp.
    clock.slowMo(0.3, 0, 400, true);
    void GameAudio.music.resume(200);
  }, [boutT, clock, view]);
  const onWrapUp = useCallback((reason: string) => {
    const b = boutRef.current;
    if (b && b.phase !== P_DONE) {
      input(b, { t: boutT.value, k: IN_END });
      round.current.bouts.push(b);
      boutRef.current = null;
    }
    running.value = false;
    setStageBoth('done');
    return buildResult(reason);
  }, [boutT, buildResult, running]);
  const getSnapshot = useCallback(() => ({
    score: damage,
    state: { boss, seed: round.current.seed, bouts: round.current.bouts.map(boutProof), current: boutRef.current ? boutProof(boutRef.current) : null },
  }), [boss, damage]);

  // ---- HUD values ---------------------------------------------------------------
  // What the live endpoint will credit: capped by its 26 s x 7 hits/s encoding, then the remote rate.
  const shownDamage = legacyDamage(toLegacyProof(damage, 26000), damageRate);
  const preview = Math.max(0, hpLeft - shownDamage);
  const hpPct = Math.max(0, Math.min(1, preview / Math.max(1, hpMax)));
  const ribbonStyle = useAnimatedStyle(() => {
    const p = ribbonP.value;
    const s = p <= 1 ? 0.6 + 0.4 * p : 1 - (p - 1) * 0.3;
    return { opacity: p <= 1 ? p : 2 - p, transform: [{ scale: s }] };
  });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  return (
    <GameShellV2
      ref={shell}
      visible={visible}
      title="Boss Brawl"
      subtitle={bossName}
      objective={OBJECTIVE[boss]}
      score={shownDamage}
      multiplier={comboPct / 100}
      fever={comboPct >= 200}
      result={result}
      thresholds={THRESHOLDS}
      starMultipliers={{ 0: 0, 1: 1, 2: 1, 3: 1 }}
      movementPolicy="playThrough"
      resumeStyle="instant"
      gameId="boss"
      sessionKey={`boss:${boss}:${round.current.seed}`}
      getSnapshot={getSnapshot}
      onWrapUp={onWrapUp}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <GestureHandlerRootView style={styles.fill} onLayout={onLayout}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[StyleSheet.absoluteFill, camera.style]}>
            <BossArena L={L} view={view} t={boutT} fx={fxT} anim={animMemo} img={imgMemo} bossKind={BOSS_INDEX[boss]}
              reduced={reduced} bossArtScale={BOSS_ART_SCALE[boss]} />
          </Animated.View>
        </GestureDetector>

        {/* HUD: never shakes. Shared raid HP, bout pips, combo. */}
        <View style={styles.hud} pointerEvents="none">
          <Text style={styles.hpLabel}>{bossName.toUpperCase()}</Text>
          <View style={styles.hpTrack}>
            <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
          </View>
          <View style={styles.hudRow}>
            <View style={styles.pips}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.pip, i < round.current.bouts.length && styles.pipDone, i === boutNo && stage === 'bout' && styles.pipNow]} />
              ))}
            </View>
            <Text style={styles.hpText}>{preview.toLocaleString()} HP</Text>
            <View style={[styles.combo, comboPct >= 200 && styles.comboFury]}>
              <Text style={styles.comboText}>{`x${(comboPct / 100).toFixed(1)}`}</Text>
            </View>
          </View>
        </View>

        {hint && stage === 'bout' && (
          <View style={[styles.hintWrap, { top: L.targetY - L.targetH / 2 - 44 }]} pointerEvents="none">
            <Text style={styles.hint}>{hint}</Text>
          </View>
        )}

        {ribbon && (
          <Animated.View style={[styles.ribbonWrap, { top: L.bossY - 40 }, ribbonStyle]} pointerEvents="none">
            <Image source={ART.ribbon} style={styles.ribbonImg} resizeMode="contain" />
            <Text style={styles.ribbonText}>{ribbon}</Text>
          </Animated.View>
        )}

        {taunt && (
          <View style={[styles.taunt, { top: Math.max(70, L.bossY - L.bossSize * 0.75) }]} pointerEvents="none">
            <Text style={styles.tauntText}>{taunt}</Text>
          </View>
        )}

        {stage === 'inter' && (
          <View style={[styles.inter, { top: L.targetY - L.targetH / 2 - 150 }]}>
            <Text style={styles.interKicker}>{`BOUT ${inter.bout} DAMAGE`}</Text>
            <Text style={styles.interDmg}>{`+${Math.floor(inter.dmg * damageRate).toLocaleString()}`}</Text>
            <View style={styles.tideRow}>
              <Text style={styles.tideLabel}>{inter.tide ? 'TIDE READY' : 'WALK TO FILL THE TIDE'}</Text>
              <View style={styles.tideTrack}>
                <View style={[styles.tideFill, { width: `${Math.min(1, inter.steps / TIDE_STEPS) * 100}%` }]} />
              </View>
            </View>
            <Text style={styles.interNext}>{`NEXT: ${BOUT_RIBBON[inter.bout]}`}</Text>
          </View>
        )}
        {stage === 'inter' && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Fight ${BOUT_RIBBON[inter.bout]}`} onPress={fight}
            style={[styles.fightBtn, { left: L.floatX - 90, top: L.floatY - 34 }]}>
            <Text style={styles.fightText}>FIGHT</Text>
          </Pressable>
        )}

        {/* Accessibility: the in-world targets and float as buttons (VoiceOver, Switch Control). */}
        {stage === 'bout' && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessible={false}>
            {[0, 1, 2].map((i) => (
              <View key={i} accessible accessibilityRole="button" accessibilityLabel={`${['Left', 'Middle', 'Right'][i]} target`}
                onAccessibilityTap={() => a11yTarget(i)} pointerEvents="none"
                style={[styles.a11y, { left: L.laneX[i] - L.targetW / 2, top: L.targetY - L.targetH / 2, width: L.targetW, height: L.targetH }]} />
            ))}
            <View accessible accessibilityRole="button" accessibilityLabel="Strike" onAccessibilityTap={a11yStrike} pointerEvents="none"
              style={[styles.a11y, { left: L.floatX - L.floatR, top: L.floatY - L.floatR, width: L.floatR * 2, height: L.floatR * 2 }]} />
          </View>
        )}

        {(mates.length > 0 || ghostLine) && (
          <CrewLayer ref={crewLayer} L={L} mates={mates} surge={surgeN} surgeOn={surgeOn} meLure={meLure && stage === 'bout'} ghostLine={ghostLine} />
        )}
        <FxStage ref={fxRef} width={L.W} height={L.H} timeScale={clock.fxScale} reducedMotion={reduced} />
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#9FF0F5' },
  hud: { position: 'absolute', top: 8, left: 14, right: 14 },
  hpLabel: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF', textAlign: 'center',
    textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  hpTrack: { marginTop: 3, height: 16, borderRadius: 8, backgroundColor: '#DDF6FF', borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#EF4444' },
  hudRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pips: { flexDirection: 'row', gap: 6 },
  pip: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#1B2A4A', backgroundColor: '#FFFFFF' },
  pipDone: { backgroundColor: '#3FD0E8' },
  pipNow: { backgroundColor: '#FFCF3B' },
  hpText: { fontFamily: 'Knockout', fontSize: 14, color: '#FFFFFF', textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  combo: { minWidth: 58, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 14, backgroundColor: '#00A5F5', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center' },
  comboFury: { backgroundColor: '#FFCF3B' },
  comboText: { fontFamily: 'Shark', fontSize: 20, color: '#FFFFFF', textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  hintWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 17, color: '#1B2A4A', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden', textAlign: 'center' },
  ribbonWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', height: 90 },
  ribbonImg: { position: 'absolute', width: 300, height: 80 },
  ribbonText: { fontFamily: 'Shark', fontSize: 34, color: '#FFFFFF', marginTop: -8,
    textShadowColor: '#7A3D00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  taunt: { position: 'absolute', alignSelf: 'center', maxWidth: '82%', backgroundColor: '#FFFFFF', borderRadius: 18,
    borderWidth: 3, borderColor: '#1B2A4A', paddingHorizontal: 14, paddingVertical: 8 },
  tauntText: { fontFamily: 'Shark', fontSize: 18, color: '#1B2A4A', textAlign: 'center' },
  inter: { position: 'absolute', left: 24, right: 24, padding: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 3, borderColor: '#1B2A4A', alignItems: 'center' },
  interKicker: { fontFamily: 'Knockout', fontSize: 14, color: '#0768B9', letterSpacing: 1 },
  interDmg: { fontFamily: 'Shark', fontSize: 38, color: '#1B2A4A' },
  interNext: { marginTop: 6, fontFamily: 'Shark', fontSize: 20, color: '#FF6B5C' },
  tideRow: { width: '100%', marginTop: 4 },
  tideLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#0768B9', textAlign: 'center', marginBottom: 3 },
  tideTrack: { height: 14, borderRadius: 7, backgroundColor: '#DDF6FF', borderWidth: 2, borderColor: '#1B2A4A', overflow: 'hidden' },
  tideFill: { height: '100%', backgroundColor: '#3FD0E8' },
  fightBtn: { position: 'absolute', width: 180, height: 68, borderRadius: 34, backgroundColor: '#EF4444', borderWidth: 4,
    borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  fightText: { fontFamily: 'Shark', fontSize: 32, color: '#FFFFFF', textShadowColor: '#7A1010', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  a11y: { position: 'absolute' },
});

export default BossBrawl;
