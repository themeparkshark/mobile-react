/**
 * Boss Brawl v7 (design: studio/design/boss.md v7). The Kraken, three short
 * bouts locked to the music, two verbs:
 *
 *   tap a lane   the buoy under the rising tentacle as it lands (counter),
 *                then the glowing sucker on the pinned limb each beat (POP)
 *   hold float   Easy Slam: hold through an opening, it fires on the last slot
 *
 * The boss can hurt you: a landed tell pops a Grit fin; at 0 fins you are
 * knocked down (8 taps in 1.5 s to get up); a 2nd Knockdown is a TKO. Breaks
 * knock the hat off as a bouncing part whose material flies to the HUD. Bout 3
 * ends on the Final Pop, then the KO or the drawn Retreat with the catch.
 *
 * QUEUE REALITY: every input sits in the bottom 40%; every tell reads with the
 * sound off (limb + shadow + lime ring); walking never pauses anything (it
 * only adds a step of wind-up and a 2-beat look-ahead); intermissions never
 * time out; backgrounding holds the bout and resumes with a 400 ms ramp.
 *
 * The integer sim (sim/encounter.ts) decides everything; this component only
 * feeds it stamped inputs and presents what it publishes. Damage goes to the
 * live raid endpoint through the legacy encoding (sim/round.ts); the v7 bout
 * proofs ride along in meta for the replay endpoint (WS6, sim-runner).
 */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Image, LogBox, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, runOnJS, runOnUI, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BossId } from '../../api/endpoints/parks/raid';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { GameShellV2, type GameResult, type GameShellV2Handle } from '../../gamekit/GameShellV2';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import { useGameClock } from '../../gamekit/useGameClock';
import { FxStage, type FxStageHandle } from '../../gamekit/fx/FxStage';
import { useCamera } from '../../gamekit/fx/useCamera';
import { PerfOverlay, usePerfProbe } from '../../gamekit/perf/PerfOverlay';
import { usePerfTier } from '../../gamekit/perf/usePerfTier';
import { TIER_SCALES } from '../../gamekit/core/perfTier';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { configureHaptics, playHaptic, playPattern, HP } from '../../gamekit/Haptics';
import { useWalkSense } from '../../gamekit/motion/useWalkSense';
import { loadCalibration } from '../../gamekit/session/calibrationStore';
import { mixSeed, hashString } from '../../gamekit/core/rng';
import { BossArena, emptyPres, partRestMs, worldCamAt, type ArenaAnim, type ArenaImages, type Pres } from './BossArena';
import { CalloutLayer, type CalloutLayerHandle } from './CalloutLayer';
import { BossResults, type BossResultsExtras } from './BossResults';
import { applyRound, dayKey, parseMeta } from './localMeta';
import { TIER_BREAK, TIER_COUNTER, TIER_FINAL, TIER_HIT, TIER_KO, TIER_POP, TIER_PUNISH, calloutZones, type Wordmark } from './callouts';
import { EMITTERS, packHex } from '../../gamekit/core/particles';
import { bossBeds, bossSfx } from './bossAudio';
import { arenaLayout, buildView, emptyView, hitRegion, rootSide, BOSS_INDEX, REGION_FLOAT, type BossView } from './view';
import {
  advance, carryOut, createBout, freshCarry, input, P_DONE,
  E_BOON, E_BREAK, E_BREAK_END, E_BUBBLE, E_BUBBLE_POP, E_CLANK, E_CLOSE, E_EARLY, E_END, E_FAKE, E_FAKE_TAP, E_FINAL,
  E_FINAL_READY, E_GAUGE_HOT, E_GETUP, E_GETUP_TAP, E_GOOD, E_GREY, E_GRIT, E_GUARD_COUNTER, E_GUARD_WARN, E_HIT,
  E_KNOCKDOWN, E_LOCK, E_OPEN, E_PERFECT, E_POP, E_POP_PERFECT, E_PUNISH, E_SAFE_MISS, E_SHOW, E_SHUFFLE, E_SKILL_STAR,
  E_SLAM, E_SLAM_CANCEL, E_STAR, E_STAR_OUT, E_TELL, E_TIER, E_TKO, E_DECAY, END_GOT_UP, END_TKO,
  scoreBout, type Bout, type Carry, type InputEvent, type SimEvent,
} from './sim/encounter';
import {
  BOON_FIN, BOON_LOOK, BOON_POLISH, BOON_TIDE, IN_BOON, IN_END, IN_GETUP, IN_PAD_DOWN, IN_PAD_UP, IN_PAUSE, IN_RESUME,
  IN_TARGET, SIM_VERSION, STAR_POINTS, STEP,
} from './sim/constants';
import { boonOffer, pickVariant } from './sim/patterns';
import { boutProof, legacyDamage, summarize, timingReadout, toLegacyProof, type RoundSummary } from './sim/round';
import { tauntFor } from './taunts';
import { useArenaImages } from './useArenaImages';
import { CrewLayer, type CrewLayerHandle, type CrewMate } from './multiplayer/CrewLayer';
import {
  CREW_CAUGHT, CREW_LUNGE, CREW_STRIKE, TogetherCrew, ghostAt, ghostTimeline, type GhostTimeline,
} from './multiplayer/crew';
import { mergeTeamStrike, TEAM_STRIKE_ATTACK, type StrikeWhisper } from './multiplayer/teamStrike';
import { loadGhost, saveGhostIfBest } from './multiplayer/ghostStore';

export const BOSS_ART: Record<BossId, number> = {
  kraken: require('../../../assets/images/boss/kraken.png'),
  robo_shark: require('../../../assets/images/boss/robo_shark-clean-v2.png'),
  ghost_squid: require('../../../assets/images/boss/ghost_squid.png'),
};
// The cleanup keeps transparent safety padding; match the original visible character size in UI.
export const BOSS_ART_SCALE: Record<BossId, number> = { kraken: 1, robo_shark: 1.4, ghost_squid: 1 };

const ART = {
  sky: require('../../assets/games/boss/k1_sky.jpg'),
  mid: require('../../assets/games/boss/k1_mid.png'),
  fore: require('../../assets/games/boss/k1_fore.png'),
  body: require('../../assets/games/boss/kraken_body.png'),
  hat: require('../../assets/games/boss/kraken_hat.png'),
  strip: require('../../assets/games/boss/tentacle_strip.png'),
  buoy: require('../../assets/games/boss/ring_buoy.png'),
  lantern: require('../../assets/games/boss/paper_lantern.png'),
  plate: require('../../../assets/images/yellow_button.png'),
  float: require('../../assets/games/boss/prop_swim_ring.png'),
  shark: require('../../../assets/images/screens/welcome/shark.png'),
  sharkStrike: require('../../assets/games/boss/shark_fist_pump.png'),
  sharkBonk: require('../../assets/games/boss/shark_bonked.png'),
  sharkDizzy: require('../../assets/games/boss/shark_dizzy.png'),
  sharkCheer: require('../../assets/games/boss/shark_cheer.png'),
  fin: require('../../assets/games/boss/grit_fin.png'),
  anchor: require('../../assets/games/boss/anchor_stars.png'),
  star: require('../../assets/games/boss/fx_small_dizzy_star.png'),
  starburst: require('../../../assets/images/screens/explore/starburst.png'),
  cloud: require('../../../assets/images/screens/explore/cloud.png'),
  ribbon: require('../../../assets/images/ribbon.png'),
  fxImpact: require('../../assets/games/boss/bo_fx_00.png'),
  fxCrown: require('../../assets/games/boss/bo_fx_02.png'),
  fxPuff: require('../../assets/games/boss/bo_fx_08.png'),
  fxSwirl: require('../../assets/games/boss/bo_fx_09.png'),
  fxSparkle: require('../../assets/games/boss/bo_fx_11.png'),
  fxBubble: require('../../assets/games/boss/bo_fx_12.png'),
  fxGull: require('../../assets/games/boss/bo_fx_13.png'),
  matFeather: require('../../assets/games/boss/mat_feather.png'),
  matBarnacle: require('../../assets/games/boss/mat_barnacle.png'),
  matPearl: require('../../assets/games/boss/mat_pearl.png'),
  matScale: require('../../assets/games/boss/mat_scale.png'),
  chest: require('../../../assets/images/screens/redeem/chest_opened.png'),
  // K9 HUD glyphs and the K4 pre-blurred foreground (pipeline art, Codex route).
  finFull: require('../../assets/games/boss/hud/fin_full.png'),
  finPop: require('../../assets/games/boss/hud/fin_popping.png'),
  finEmpty: require('../../assets/games/boss/hud/fin_empty.png'),
  boutPip: require('../../assets/games/boss/hud/bout_pip.png'),
  slotFrame: require('../../assets/games/boss/hud/slot_frame.png'),
  pillFrame: require('../../assets/games/boss/hud/pill_frame.png'),
  foreRope: require('../../assets/games/boss/fore_rope_blur.png'),
  forePlank: require('../../assets/games/boss/fore_plank_blur.png'),
};

const MATERIALS = [
  { name: "Captain's Feather", art: ART.matFeather },
  { name: 'Barnacle', art: ART.matBarnacle },
  { name: 'Ink Pearl', art: ART.matPearl },
];
const SCALE_MAT = { name: 'Kraken Scale', art: ART.matScale };

const BOONS: Record<number, { title: string; body: string }> = {
  [BOON_TIDE]: { title: 'RISING TIDE', body: 'Start with 30% Break' },
  [BOON_FIN]: { title: 'EXTRA FIN', body: 'Start with 4 fins' },
  [BOON_LOOK]: { title: 'LONG LOOK', body: 'See the next sucker sooner' },
  [BOON_POLISH]: { title: 'ANCHOR POLISH', body: 'Start with 1 Anchor Star' },
};

const THRESHOLDS = { one: STAR_POINTS.one, two: STAR_POINTS.two, three: STAR_POINTS.three };
const SIM_LAG_MS = 50;
const BEAT_MS = 464;
const PUNISH_WORD: Record<BossId, string> = { kraken: 'SPLASHED!', robo_shark: 'ZAPPED!', ghost_squid: 'SPOOKED!' };
const BOUT_RIBBON = ['ROUND 1', 'ROUND 2', 'FURY'];
const FIGHT_NAME: Record<BossId, string> = { kraken: 'TENTACLE TANGO', robo_shark: 'CIRCUIT BREAKER', ghost_squid: 'NOW YOU SEE ME' };
const COUNTER_HINT: Record<BossId, string> = {
  kraken: 'Tap the buoy under the shadow as it lands',
  robo_shark: 'Tap the sockets in the order they flash',
  ghost_squid: 'Tap the lantern under the real squid',
};
const OBJECTIVE: Record<BossId, string> = {
  kraken: 'Tap the buoy under the tentacle as it lands, then pop the glowing suckers. Hold the float for an Easy Slam.',
  robo_shark: 'Tap the sockets in the order they flash, then pop the glowing vents. Hold the float for an Easy Slam.',
  ghost_squid: 'Tap the lantern under the real squid, then pop the glowing pearls. Hold the float for an Easy Slam.',
};
/** G minor pentatonic ladder index for the n-th POP of an opening (tier lifts the start). */
const LADDER_MAX = 7;
/** Beat snap: an early tap waits at most this long for the ring-close frame. */
const SNAP_MAX_MS = 110;
/** The shark's hop reaches the sucker this long after it starts (hop contact frame on the ring close). */
const HOP_CONTACT_MS = 60;
const WHITE_ARGB = packHex('#FFFFFF');
const LIME_ARGB = packHex('#7BD94A');
/** KO and Break confetti: coral, sky, white, lime (never gold, 11.4). */
const KO_CONFETTI = [packHex('#FF6B5C'), packHex('#8FD3FF'), packHex('#FFFFFF'), packHex('#7BD94A')];
const comboOf = (chain: number) => (chain >= 10 ? 200 : chain >= 6 ? 150 : chain >= 3 ? 120 : 100);

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
  /** Mastery rank 0-5 (rank 2 unlocks bout-3 variant B). */
  readonly rank?: number;
  /** Dev: a bot plays (MiniGameTester / capture). */
  readonly autoplay?: boolean;
  /** Race a ghost on the same seed and variant: 'auto' = this week's local best. */
  readonly ghost?: 'auto' | { name: string; log: import('./sim/round').RoundLog } | null;
  /**
   * Live co-op (tier 2): 'house' starts every bout together with the labelled
   * house crew (TEAM STRIKE on attack #2). A Reverb presence adapter (netcode
   * stream) plugs into the same TogetherCrew event shape. Null = solo.
   */
  readonly crew?: 'house' | null;
}

interface InterState { bout: number; dmg: number; offer: [number, number]; picked: number }

function fxNowOf(sv: { value: number }): number {
  return sv.value;
}

export function BossBrawl(props: BossBrawlProps) {
  const { visible, boss, bossName, hpMax, damageRate = 1, onComplete, onClose, onQuit } = props;
  // Dev capture: EXPO_PUBLIC_BOSS_HP shrinks the raid's HP left so the KO plays in the practice arena.
  const hpLeft = __DEV__ && process.env.EXPO_PUBLIC_BOSS_HP ? Math.min(props.hpLeft, Number(process.env.EXPO_PUBLIC_BOSS_HP)) : props.hpLeft;
  const reduced = useReducedGameMotion();
  const movement = useContext(LinePlayMovementContext);
  const autoplay = !!props.autoplay || (__DEV__ && process.env.EXPO_PUBLIC_GAME_AUTOPLAY === '1');
  const shell = useRef<GameShellV2Handle>(null);
  const fxRef = useRef<FxStageHandle>(null);
  const crewLayer = useRef<CrewLayerHandle>(null);
  const [size, setSize] = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height - 130 });
  const L = useMemo(() => arenaLayout(size.w, size.h), [size.w, size.h]);

  const [stage, setStage] = useState<Stage>('idle');
  const stageRef = useRef<Stage>('idle');
  const [result, setResult] = useState<GameResult | null>(null);
  const [damage, setDamage] = useState(0);
  const [boutNo, setBoutNo] = useState(0);
  const [comboPct, setComboPct] = useState(100);
  const [grit, setGrit] = useState({ n: 3, max: 3 });
  const [stars, setStars] = useState(0);
  const [mats, setMats] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [ribbon, setRibbon] = useState<{ title: string; sub?: string } | null>(null);
  const [taunt, setTaunt] = useState<string | null>(null);
  const [guardWarn, setGuardWarn] = useState(false);
  const [down, setDown] = useState<{ on: boolean; taps: number }>({ on: false, taps: 0 });
  const [inter, setInter] = useState<InterState>({ bout: 1, dmg: 0, offer: [BOON_TIDE, BOON_FIN], picked: -1 });
  const [strip, setStrip] = useState<{ fell: number; perBout: number[] } | null>(null);
  const [ghostLine, setGhostLine] = useState<string | null>(null);
  const [catchOn, setCatchOn] = useState<{ lane: number; mat: number } | null>(null);
  const [chest, setChest] = useState(false);

  // Round state (JS)
  const round = useRef({
    seed: 0, variant: 1, bouts: [] as Bout[], carry: freshCarry() as Carry, offset: 0, attempt: 0, novice: false,
    cleared: false, fights: 0,
  });
  const boutRef = useRef<Bout | null>(null);
  const evIdx = useRef(0);
  const pending = useRef<SimEvent[]>([]);
  const popsInOpening = useRef(0);
  const slamSeen = useRef('');
  const pauseWall = useRef(0);
  const ghostRef = useRef<GhostTimeline | null>(null);
  const ghostHop = useRef(0);
  const crewRef = useRef<TogetherCrew | null>(null);
  const [mates, setMates] = useState<CrewMate[]>([]);
  const whispers = useRef<(StrikeWhisper & { used: boolean })[]>([]);
  const myStrike = useRef<{ at: number; bout: number; done: boolean } | null>(null);
  const boutWall = useRef(0);
  // Tell Drill (first fight vs the Kraken): an unscored practice bout, wind-ups at 0.5x that wait at the impact frame.
  const drill = useRef({ on: false, frozen: false, opens: 0, need: false, want: -1, slot: -1 });
  const [drillOn, setDrillOn] = useState(false);
  /** The attack (index and step) the sim was on before the input/advance that produced the current events. */
  const atkCtx = useRef({ no: -1, step: 0, I: 0 });
  /** The opening's ring times before the input that may close it (beat snap needs the ring of a POP). */
  const openCtx = useRef<{ rings: number[]; finalIdx: number } | null>(null);
  const noteAttack = (b: Bout) => {
    if (b.attack) atkCtx.current = { no: b.attack.no, step: b.step, I: b.attack.steps[b.step]?.I ?? 0 };
    if (b.opening) openCtx.current = { rings: b.opening.rings, finalIdx: b.opening.finalIdx };
  };
  const callouts = useRef<CalloutLayerHandle>(null);
  /** First landed real tell of the round (the 0.5x failure replay after a TKO, 8.2). */
  const missedTell = useRef<{ bout: number; t: number; log: InputEvent[]; cfg: Bout['cfg']; carry: Carry | null } | null>(null);
  const finPopAt = useRef(0);
  const resultsExtras = useRef<BossResultsExtras | null>(null);
  const [replay, setReplay] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };

  // UI-thread values
  const view = useSharedValue<BossView>(emptyView());
  const pres = useSharedValue<Pres>(emptyPres());
  const boutBase = useSharedValue(0);
  const boutT = useSharedValue(0);
  const running = useSharedValue(false);
  const padTouch = useSharedValue(-1);
  const qSv = useSharedValue(116);
  const beatOrigin = useSharedValue(0);
  const beat = useSharedValue(0);
  const fxT = useSharedValue(0);
  const downOn = useSharedValue(0);
  const catchArmed = useSharedValue(0);
  const sv = () => useSharedValue(-1); // eslint-disable-line react-hooks/rules-of-hooks
  const anim: ArenaAnim = {
    entranceAt: sv(), exitAt: sv(), exitKind: sv(), hurtAt: sv(), hurtK: useSharedValue(1), flashAt: sv(), rimAt: sv(),
    tauntAt: sv(), beadAt: sv(), beadLane: sv(), hopAt: sv(), hopLane: sv(), flinchAt: sv(), slamAt: sv(), getupAt: sv(),
    cheerAt: sv(), padHeld: useSharedValue(0), buoyAt0: sv(), buoyAt1: sv(), buoyAt2: sv(), splashAt: sv(), splashLane: sv(),
    partAt: sv(), partN: useSharedValue(0), partDir: useSharedValue(1), matAt: sv(), finalAt: sv(), finalGrade: sv(),
    catchAt: sv(), catchLane: sv(), caughtAt: sv(), phase: useSharedValue(0), phaseAt: sv(), breakAt: sv(), hatAt: sv(), shardAt: sv(),
  };
  const animMemo = useMemo(() => anim, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ribbonP = useSharedValue(0);

  const clock = useGameClock({
    onFrame: (_a, _fx, c) => {
      'worklet';
      if (running.value) {
        boutT.value = Math.floor(c.simMs - boutBase.value);
        beat.value = boutT.value / (4 * qSv.value);
      } else beat.value = (c.fxMs - beatOrigin.value) / BEAT_MS;
      fxT.value = c.fxMs;
    },
  });
  const walk = useWalkSense({ active: visible && !result });
  const walking = walk.walking || !!movement?.moving;
  const camera = useCamera({ width: L.W, height: L.H, timeScale: clock.fxScale, reducedMotion: reduced, walking });
  const camMemo = useMemo(() => ({ x: camera.x, y: camera.y, rot: camera.rot, zoom: camera.zoom }), [camera.x, camera.y, camera.rot, camera.zoom]);
  const Z = useMemo(() => calloutZones(L.W, L.H), [L.W, L.H]);
  const fxNow = () => fxNowOf(fxT);
  const perfOn = __DEV__ && process.env.EXPO_PUBLIC_BOSS_PERF === '1';
  const perf = usePerfProbe(perfOn);
  // Perf tier (full / lite / min from the first frames, step-down only): particle counts scale with it.
  const tier = usePerfTier({ active: visible && !result });
  const pScale = TIER_SCALES[tier.tierJs].particles * (walking ? 0.8 : 1);
  const flyUp = (text: string, x: number, y: number, o?: Parameters<FxStageHandle['flyUp']>[3]) => {
    fxRef.current?.flyUp(text, x, y, o);
  };
  const burst = (name: Parameters<FxStageHandle['burst']>[0], x: number, y: number, o?: Parameters<FxStageHandle['burst']>[3]) => {
    fxRef.current?.burst(name, x, y, o && o.count ? { ...o, count: Math.max(2, Math.round(o.count * pScale)) } : o);
  };

  const loaded = useArenaImages({
    sky: ART.sky, mid: ART.mid, fore: ART.fore, cloud: ART.cloud, body: ART.body, hat: ART.hat, boss: BOSS_ART[boss],
    strip: ART.strip, buoy: ART.buoy, lantern: ART.lantern, plate: ART.plate, float: ART.float, shark: ART.shark,
    sharkStrike: ART.sharkStrike, sharkBonk: ART.sharkBonk, sharkDizzy: ART.sharkDizzy, sharkCheer: ART.sharkCheer,
    fin: ART.fin, anchor: ART.anchor, star: ART.star, starburst: ART.starburst, fxImpact: ART.fxImpact, fxCrown: ART.fxCrown,
    fxPuff: ART.fxPuff, fxSwirl: ART.fxSwirl, fxSparkle: ART.fxSparkle, fxBubble: ART.fxBubble, fxGull: ART.fxGull,
    matFeather: ART.matFeather, matBarnacle: ART.matBarnacle, matPearl: ART.matPearl, matScale: ART.matScale,
    finFull: ART.finFull, finPop: ART.finPop, finEmpty: ART.finEmpty, foreRope: ART.foreRope, forePlank: ART.forePlank,
  });
  const imgMemo: ArenaImages = useMemo(() => loaded, [loaded]);

  const beds = useMemo(() => bossBeds(boss), [boss]);
  useEffect(() => {
    bossSfx.init();
    bossSfx.preload(boss);
    configureHaptics('boss');
    return () => configureHaptics('default');
  }, [boss]);

  const setStageBoth = (s: Stage) => {
    stageRef.current = s;
    setStage(s);
  };
  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    GameAudio.music.stop(400);
  }, []);

  // ---- reset on open ------------------------------------------------------
  useEffect(() => {
    if (!visible) return;
    const r = round.current;
    r.attempt += 1;
    r.seed = props.seed !== undefined ? props.seed >>> 0 : mixSeed(hashString(`${boss}:${hpMax}:${hpLeft}`), (Date.now() & 0x7fffffff) + r.attempt);
    r.bouts = [];
    r.carry = freshCarry();
    boutRef.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setResult(null);
    setDamage(0);
    setBoutNo(0);
    setHint(null);
    setTaunt(null);
    setMats([]);
    setStars(0);
    setStrip(null);
    setCatchOn(null);
    setChest(false);
    setGrit({ n: 3, max: 3 });
    setDown({ on: false, taps: 0 });
    setStageBoth('idle');
    view.value = emptyView();
    pres.value = emptyPres();
    running.value = false;
    Object.values(animMemo).forEach((a) => { a.value = -1; });
    anim.hurtK.value = 1;
    anim.padHeld.value = 0;
    anim.partN.value = 0;
    anim.phase.value = 0;
    ghostRef.current = null;
    crewRef.current = null;
    whispers.current = [];
    myStrike.current = null;
    setMates([]);
    setGhostLine(null);
    missedTell.current = null;
    resultsExtras.current = null;
    setReplay(false);
    callouts.current?.clear();
    // Local history: first 3 rounds vs this boss are novice rounds (Grit floor, training wheels);
    // fakes appear only after the first 1-star clear (A0 until then, the server picks in production).
    void AsyncStorage.getItem(`boss_v7_history:${boss}`).then((raw) => {
      const h = raw ? JSON.parse(raw) as { rounds: number; cleared: boolean; lastVariant: number } : { rounds: 0, cleared: false, lastVariant: -1 };
      r.novice = h.rounds < 3;
      r.cleared = h.cleared;
      r.fights = h.rounds;
      void AsyncStorage.getItem(`boss_v7_drill:${boss}`).then((d) => {
        drill.current.need = boss === 'kraken' && (d !== '1' || (__DEV__ && process.env.EXPO_PUBLIC_BOSS_DRILL === '1')) && !autoplay;
      }).catch(() => undefined);
      r.variant = pickVariant(r.seed, props.rank ?? 0, h.lastVariant, h.cleared);
    }).catch(() => { r.variant = pickVariant(r.seed, props.rank ?? 0, -1, false); });
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

  // ---- ribbons and cards ----------------------------------------------------------
  const showRibbon = useCallback((title: string, sub?: string, ms = 1200) => {
    setRibbon({ title, sub });
    // The ribbon zone is exclusive: the small callout lane waits while a ribbon is up (11.10).
    callouts.current?.ribbon(ms);
    ribbonP.value = 0;
    ribbonP.value = withSequence(withTiming(1, { duration: 200, easing: Easing.out(Easing.back(1.6)) }),
      withDelay(ms - 380, withTiming(2, { duration: 180, easing: Easing.in(Easing.cubic) })));
    GameAudio.play('fx.whoosh', { volume: 0.5 });
  }, [ribbonP]);
  // ---- music --------------------------------------------------------------
  const playBed = useCallback((bed: string | null, fade = 60) => {
    if (!bed) return;
    void GameAudio.init().then(() => GameAudio.music.play(bed, fade, 0)).catch(() => undefined);
  }, []);

  // ---- bout lifecycle -----------------------------------------------------
  const startBout = useCallback((n: number, boon: number, practice = false) => {
    const r = round.current;
    const b = createBout(practice
      ? { boss, seed: 0x0d2111, bout: 0, walk: walking, offset: r.offset, variant: 0, novice: true }
      : { boss, seed: r.seed, bout: n, carry: r.carry, walk: walking, offset: r.offset, variant: r.variant, novice: r.novice });
    drill.current = { ...drill.current, on: practice, frozen: false, opens: 0, want: -1, slot: -1 };
    setDrillOn(practice);
    if (practice) clock.slowMo(0.5, 600000, 150, true);
    if (n > 0) input(b, { t: 0, k: IN_BOON, a: boon });
    boutRef.current = b;
    boutWall.current = Date.now();
    atkCtx.current = { no: -1, step: 0, I: 0 };
    ghostHop.current = 0;
    myStrike.current = null;
    crewRef.current?.startBout(n, boutWall.current);
    evIdx.current = 0;
    pending.current = [];
    popsInOpening.current = 0;
    slamSeen.current = '';
    view.value = buildView(b);
    pres.value = { ...emptyPres(), wheels: r.novice, breaks: r.carry.breaks, walking, team: !!crewRef.current };
    qSv.value = STEP[boss][n];
    setBoutNo(n);
    setGrit({ n: b.grit, max: b.gritMax });
    setStars(b.carry.stars);
    setComboPct(b.carry.chain >= 10 ? 200 : b.carry.chain >= 6 ? 150 : b.carry.chain >= 3 ? 120 : 100);
    setDown({ on: false, taps: 0 });
    // Bout clock origin = this frame's sim time (t = 0 is a downbeat: the bed restarts on it).
    const clk = clock.clock;
    runOnUI(() => {
      'worklet';
      boutBase.value = clk.value.simMs;
      boutT.value = 0;
      running.value = true;
    })();
    playBed(n === 2 ? (GameAudio.bed('boss_kraken_fury_loop_r3') && boss === 'kraken' ? 'boss_kraken_fury_loop_r3' : beds.fury) : beds.main, n === 0 ? 0 : 60);
    setStageBoth('bout');
    showRibbon(practice ? 'PRACTICE' : BOUT_RIBBON[n], practice ? 'WATCH THE SHADOW' : n === 0 ? FIGHT_NAME[boss] : undefined, 1300);
    if (practice) setHint('Watch the tentacle. Its shadow shows the buoy');
    else if (n === 0 && r.novice) setHint(COUNTER_HINT[boss]);
  }, [clock, boss, walking, clock.clock, boutBase, boutT, running, view, pres, qSv, beds, playBed, showRibbon]);

  const beginRound = useCallback(() => {
    // Entrance = count-in: 4 beats on the music. Lip bulges (1), ripples (2), the hat breaks the surface (3), BURST (4).
    const f = fxNow();
    anim.entranceAt.value = f;
    beatOrigin.value = f;
    const crewOn = props.crew === 'house' || (__DEV__ && process.env.EXPO_PUBLIC_BOSS_CREW === '1' && props.crew !== null);
    if (crewOn) {
      crewRef.current = new TogetherCrew(boss, round.current.seed, round.current.variant, 2);
      setMates(crewRef.current.roster().filter((m) => m.id !== 'me').map((m) => ({ id: m.id, name: m.name, house: true })));
    } else if (ghostRef.current) {
      setMates([{ id: 'ghost', name: ghostRef.current.name, ghost: true }]);
    }
    setStageBoth('intro');
    playBed(beds.main, 0);
    showRibbon(bossName.toUpperCase(), FIGHT_NAME[boss], 1700);
    for (let k = 0; k < 3; k++) {
      later(k * BEAT_MS, () => {
        GameAudio.play('ui.select', { volume: 0.6, pitch: k * 2 });
        playHaptic('tap', { priority: HP.reaction });
      });
    }
    later(3 * BEAT_MS, () => {
      bossSfx.entrance(boss);
      playHaptic('tierUp', { priority: HP.own });
      if (!reduced) camera.shake(0.5, 0, 1);
      burst('splash', L.bossX, L.lipY, { count: 24 });
      burst('splash', L.bossX - L.bossSize * 0.3, L.lipY, { count: 10 });
      burst('splash', L.bossX + L.bossSize * 0.3, L.lipY, { count: 10 });
    });
    later(4 * BEAT_MS, () => {
      if (stageRef.current === 'intro') startBout(0, -1, drill.current.need);
    });
  }, [anim.entranceAt, beatOrigin, playBed, beds.main, showRibbon, bossName, boss, reduced, camera, L, startBout]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- results --------------------------------------------------------------
  const buildResult = useCallback((reason?: string): GameResult => {
    const r = round.current;
    const bouts = r.bouts;
    const s = summarize(bouts);
    const legacy = toLegacyProof(s.damage, s.simMs);
    const score = legacyDamage(legacy, damageRate);
    const proofs = bouts.map(boutProof);
    const message = s.tko ? 'BACK FOR MORE?' : hpLeft - score <= 0 && s.damage > 0 ? 'KNOCKOUT!' : s.crown ? 'CROWNED!' : s.stars === 3 ? 'BOSS BUSTER!' : s.stars === 2 ? 'BIG DAMAGE!' : s.stars === 1 ? 'NICE HITS!' : 'WATCH THE SHADOW';
    const g = ghostRef.current;
    const rival = g ? { name: g.name, score: legacyDamage(toLegacyProof(ghostAt(g, 2, 1e9), 26000), damageRate) } : null;
    return {
      score,
      stars: s.stars,
      message,
      // Best chain within one bout (design 5.2), not a round-long count.
      maxCombo: s.maxChain,
      rival,
      thresholds: {
        one: Math.floor(THRESHOLDS.one * damageRate), two: Math.floor(THRESHOLDS.two * damageRate), three: Math.floor(THRESHOLDS.three * damageRate),
      },
      buckets: [
        { label: 'PERFECTS', value: `${s.perfect}` },
        { label: 'POPS', value: `${s.popPerfect + s.pops}` },
        { label: 'BREAKS', value: `${s.breaks}` },
      ],
      bucketValues: [s.perfect, s.popPerfect + s.pops, s.breaks],
      starStepMs: BEAT_MS,
      stats: [
        ...(s.crown ? [{ label: 'CROWN', value: 'Mastery bar' }] : []),
        ...(s.skillStar ? [{ label: 'SKILL STAR', value: 'Captain\'s Call' }] : []),
        ...(s.slams > 0 ? [{ label: 'EASY SLAMS', value: `${s.slams}` }] : []),
        ...(s.getups > 0 ? [{ label: 'GOT BACK UP', value: `${s.getups}` }] : []),
        { label: 'BEST CHAIN', value: `x${s.maxChain}` },
        ...(s.perfect + s.good > 0 ? [{ label: 'TIMING', value: timingReadout(s.medianErr) }] : []),
        ...(s.fakes > 0 ? [{ label: 'TIP', value: 'Winks are fakes. Shadows are real.' }] : []),
        ...(s.nextStar ? [{ label: 'NEXT STAR', value: s.nextStar }] : []),
      ],
      meta: {
        hits: legacy.hits, weak_hits: legacy.weak_hits, duration_ms: legacy.duration_ms,
        game: 'boss', version: SIM_VERSION, sim_version: SIM_VERSION, boss, seed: r.seed, variant: r.variant, damage_points: s.damage,
        per_bout: s.perBout, bouts: proofs, input_offset_ms: r.offset, tko: s.tko, skill_star: s.skillStar, crown: s.crown,
        breaks: s.breaks, final: s.final, best_chain: s.maxChain, ...(reason ? { reason } : {}),
      },
    };
  }, [damageRate, hpLeft, boss]);

  const saveHistory = useCallback((s: RoundSummary, ko: boolean) => {
    const r = round.current;
    const key = `boss_v7_history:${boss}`;
    void AsyncStorage.setItem(key, JSON.stringify({ rounds: r.fights + 1, cleared: r.cleared || s.stars >= 1, lastVariant: r.variant })).catch(() => undefined);
    if (r.bouts.length === 3 && s.damage > 0) {
      void saveGhostIfBest(boss, { name: 'YOUR BEST', damage: s.damage, savedAt: Date.now(),
        log: { boss, seed: r.seed, variant: r.variant, bouts: r.bouts.map(boutProof) } });
    }
    // Daily First Brawl and the sticker book (local display state; WS6 owns the real one).
    const g = ghostRef.current;
    const theirs = g ? ghostAt(g, 2, 1e9) : 0;
    const extras: BossResultsExtras = {
      summary: s, ko, daily: false, dailyPaid: false, stickers: [], freshStickers: [], beatMs: BEAT_MS,
      ghost: g ? { name: g.name, delta: s.damage - theirs } : null,
    };
    resultsExtras.current = extras;
    const mkey = `boss_v8_meta:${boss}`;
    void AsyncStorage.getItem(mkey).then((raw) => {
      const up = applyRound(parseMeta(raw), dayKey(Date.now()), s.breaks, !s.tko);
      resultsExtras.current = { ...extras, daily: up.daily, stickers: up.owned, freshStickers: up.fresh };
      return AsyncStorage.setItem(mkey, JSON.stringify(up.meta));
    }).catch(() => undefined);
  }, [boss]);

  /**
   * Failure replay (8.2): the first landed real tell replays at 0.5x with the sound off, shadow and lime ring
   * highlighted. Rebuilt from the bout's own log up to just before the tell landed. Returns its length (ms).
   */
  const playFailureReplay = (startMs: number): number => {
    const m = missedTell.current;
    const r = round.current;
    if (!m) return 0;
    const carry = m.bout === 0 ? freshCarry() : carryOut(r.bouts[m.bout - 1]);
    const b = createBout({ ...m.cfg, carry });
    for (const ev of m.log) if (ev.t < m.t) input(b, ev);
    advance(b, m.t - 1);
    const a = b.attack;
    if (!a) return 0;
    const I = a.steps[b.step].I;
    const T0 = Math.max(0, Math.max(a.T, I - a.W) - 300);
    const T1 = I + 360;
    const dur = (T1 - T0) * 2;
    const snap = buildView(b);
    later(startMs, () => {
      setStrip(null);
      setTaunt(null);
      setReplay(true);
      anim.tauntAt.value = -1;
      pres.value = { ...emptyPres(), wheels: true, breaks: r.carry.breaks };
      view.value = snap;
      boutT.value = T0;
      boutT.value = withTiming(T1, { duration: dur, easing: Easing.linear });
    });
    later(startMs + dur + 200, () => {
      setReplay(false);
      view.value = { ...snap, aOn: false };
    });
    return dur + 200;
  };

  const finishRound = useCallback(() => {
    const r = round.current;
    const s = summarize(r.bouts);
    const res = buildResult();
    const ko = hpLeft - res.score <= 0 && s.damage > 0;
    saveHistory(s, ko);
    setStageBoth('outro');
    running.value = false;
    view.value = { ...view.value, aOn: false, oOn: false };
    setHint(null);
    const f = fxNow();
    const show = (ms: number) => later(ms, () => {
      callouts.current?.clear();
      setStageBoth('done');
      setResult(res);
    });
    if (s.tko) {
      // Failure (8.2): victory taunt, the progress strip in the thumb zone, then the first landed tell replays
      // at 0.5x with the sound off. Damage dealt counts.
      anim.tauntAt.value = f;
      setTaunt(tauntFor(boss, 0, false, s.breaks) === 'Come back when you can hear the bell!' ? 'Back for more?' : tauntFor(boss, 0, false, s.breaks));
      bossSfx.zero();
      later(700, () => setStrip({ fell: r.bouts.length - 1, perBout: s.perBout }));
      const rep = playFailureReplay(2600);
      show(rep > 0 ? 2600 + rep + 300 : 3200);
      return;
    }
    if (ko) {
      // KO (11.7, never skippable): defeat pose held with spiral eyes and star.png x5 off the head, KNOCKOUT!
      // wordmark slams in, the hat flies to the sand bar, the Kraken sinks, confetti (no gold), loot rises.
      anim.exitKind.value = 1;
      anim.exitAt.value = f;
      anim.cheerAt.value = f + 300;
      playPattern('bossKo', { priority: HP.critical });
      later(400, () => {
        hero('knockout', 'KNOCKOUT!', TIER_KO, { ms: 1800, entry: 'slam' });
        bossSfx.ko(boss);
        playHaptic('bigStarSlam', { priority: HP.critical });
        if (!reduced) camera.shake(0.6, 0, 1);
      });
      if (s.breaks === 0) anim.hatAt.value = f + 600;
      later(600, () => {
        const lip = toScreen(L.bossX, L.lipY);
        burst('splash', lip.x, lip.y, { count: 48 });
        fxRef.current?.emitDef({ ...EMITTERS.confetti, colors: KO_CONFETTI }, L.W / 2, lip.y - 40, { count: Math.round(40 * pScale) });
      });
      later(900, () => {
        setChest(true);
        burst('coins', L.W / 2, L.targetY - 80, { count: 24 });
        GameAudio.play('fx.coin', { pitch: 7 });
      });
      show(2400);
      return;
    }
    // Retreat (2 400 ms): humiliated pose with the stacked damage, the catch, the dive.
    anim.exitKind.value = 2;
    anim.exitAt.value = f;
    pres.value = { ...pres.value, breaks: s.breaks };
    setTaunt(tauntFor(boss, s.stars, false, s.breaks));
    const matIdx = s.breaks > 0 ? Math.min(2, s.breaks - 1) : -1;
    const lane = r.seed % 3;
    later(500, () => {
      setCatchOn({ lane, mat: matIdx });
      anim.catchLane.value = lane;
      anim.catchAt.value = fxNow();
      catchArmed.value = 1;
      GameAudio.play('fx.whoosh', { volume: 0.6 });
    });
    later(1500, () => {
      catchArmed.value = 0;
      setCatchOn(null);
      bossSfx.retreat();
      playHaptic('goodHit', { priority: HP.own });
      const lip = toScreen(L.bossX, L.lipY);
      burst('splash', lip.x, lip.y, { count: 16 });
    });
    later(2600, () => setTaunt(null));
    show(2600);
  }, [buildResult, saveHistory, running, view, hpLeft, anim, boss, L, pres, catchArmed]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCatch = useCallback((lane: number) => {
    if (!catchOn) return;
    catchArmed.value = 0;
    anim.caughtAt.value = fxNow();
    anim.hopLane.value = lane;
    anim.hopAt.value = fxNow();
    GameAudio.play(GameAudio.hasCue('bo_catch') ? 'bo_catch' : 'fx.coin');
    playHaptic('goodHit', { priority: HP.own });
    const clean = lane === catchOn.lane;
    // The payoff plays at the float top edge and the HUD slot, not under the thumb.
    burst('sparkles', L.floatX, L.floatY - L.floatR * 2.4, { count: clean ? 14 : 6 });
    small(clean ? 'CLEAN CATCH!' : 'CAUGHT!', TIER_POP, { tone: clean ? 'lime' : 'white', ms: 900 });
    setCatchOn(null);
  }, [catchOn, catchArmed, anim, L]); // eslint-disable-line react-hooks/exhaustive-deps

  const endBoutNow = useCallback((b: Bout) => {
    const r = round.current;
    running.value = false;
    if (drill.current.on) {
      // Practice is never scored: the real bout 1 starts after a READY beat.
      drill.current = { on: false, frozen: false, opens: 0, need: false, want: -1, slot: -1 };
      setDrillOn(false);
      clock.slowMo(1, 0, 0, false);
      boutRef.current = null;
      view.value = { ...buildView(b), aOn: false, oOn: false, downOn: false };
      pres.value = emptyPres();
      setHint(null);
      setStageBoth('intro');
      void AsyncStorage.setItem(`boss_v7_drill:${boss}`, '1').catch(() => undefined);
      hero(null, 'READY?', TIER_COUNTER, { ms: 900 });
      later(1000, () => startBout(0, -1));
      return;
    }
    r.bouts.push(b);
    r.carry = carryOut(b);
    boutRef.current = null;
    view.value = { ...buildView(b), aOn: false, oOn: false, downOn: false };
    pres.value = { ...emptyPres(), breaks: r.carry.breaks };
    beatOrigin.value = fxNow();
    const total = r.bouts.reduce((sum, x) => sum + scoreBout(x), 0);
    setDamage(total);
    anim.padHeld.value = 0;
    padTouch.value = -1;
    downOn.value = 0;
    setDown({ on: false, taps: 0 });
    setHint(null);
    setGuardWarn(false);
    if (b.endReason === END_TKO || b.cfg.bout >= 2 || b.endT < 0) {
      finishRound();
      return;
    }
    // Intermission: free, never times out. Fins refill, boon pick, FIGHT.
    const n = b.cfg.bout + 1;
    setInter({ bout: n, dmg: scoreBout(b), offer: boonOffer(r.seed, n), picked: -1 });
    setStageBoth('inter');
    setGrit({ n: 3, max: 3 });
    playBed(beds.rest, 400);
    later(300, () => {
      playPattern('bossFinRefill', { priority: HP.own });
      GameAudio.play('ui.confirm', { volume: 0.5, pitch: 0 });
      later(120, () => GameAudio.play('ui.confirm', { volume: 0.5, pitch: 4 }));
      later(240, () => GameAudio.play('ui.confirm', { volume: 0.5, pitch: 7 }));
    });
  }, [running, view, pres, beatOrigin, anim.padHeld, padTouch, downOn, finishRound, playBed, beds.rest, clock, boss, startBout]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipDrill = useCallback(() => {
    const b = boutRef.current;
    if (!b || !drill.current.on) return;
    if (drill.current.frozen) clock.resume();
    drill.current.frozen = false;
    input(b, { t: boutT.value, k: IN_END });
  }, [boutT, clock]);

  const fight = useCallback((boon?: number) => {
    if (stageRef.current !== 'inter') return;
    const pick = boon ?? (inter.picked >= 0 ? inter.picked : inter.offer[0]);
    setInter((s) => ({ ...s, picked: pick }));
    bossSfx.ready();
    playHaptic('tap', { priority: HP.own });
    stageRef.current = 'intro';
    const n = inter.bout;
    // Phase intros: climbs onto the wreck (bout 2), whirlpool Fury (bout 3).
    anim.phase.value = n;
    anim.phaseAt.value = fxNow();
    if (n === 1 && GameAudio.hasCue('bo_phase_kraken') && boss === 'kraken') GameAudio.play('bo_phase_kraken');
    else bossSfx.phaseUp();
    if (!reduced) camera.punch(0.05);
    later(600, () => startBout(n, pick));
  }, [inter, anim, boss, reduced, camera, startBout]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- presentation of sim events --------------------------------------------
  const lane2x = (lane: number) => L.laneX[Math.max(0, Math.min(2, lane))];
  const buoyTap = (lane: number) => {
    const a = lane === 0 ? anim.buoyAt0 : lane === 1 ? anim.buoyAt1 : anim.buoyAt2;
    a.value = fxNow();
  };
  const bossHurt = (k: number, flash: boolean, at?: number) => {
    const f = at ?? fxNow();
    anim.hurtAt.value = f;
    anim.hurtK.value = k;
    if (flash && !reduced) anim.flashAt.value = f;
  };
  const faceY = L.bossY + L.bossSize * 0.08;
  const popTrauma = useRef(1);
  /** World point -> screen point through the arena camera (FxStage and callouts live outside it). */
  const toScreen = (x: number, y: number) => {
    const w = worldCamAt(L, view.value, pres.value, boutT.value, fxT.value, anim.breakAt.value, anim.partN.value,
      anim.finalAt.value, anim.finalGrade.value, anim.beadLane.value, reduced);
    const x1 = w.ox + (x - w.ox) * w.z;
    const y1 = w.oy + (y - w.oy) * w.z;
    const z = camera.zoom.value;
    return { x: L.W / 2 + (x1 - L.W / 2) * z + camera.x.value, y: L.H / 2 + (y1 - L.H / 2) * z + camera.y.value };
  };
  /** Beat snap (11.1): an early input inside the window waits for the ideal frame (<= 110 ms); a late one plays now. */
  const snapDelay = (ideal: number, t: number) => Math.max(0, Math.min(SNAP_MAX_MS, ideal - t));
  const snapped = (d: number, fn: () => void) => {
    if (d > 8) later(d, fn);
    else fn();
  };
  const small = (text: string, tier: number, o: { tone?: 'white' | 'coral' | 'lime'; underline?: boolean; key?: string; ms?: number } = {}) => {
    callouts.current?.show({ slot: 'small', tier, text, tone: o.tone, underline: o.underline, key: o.key, ms: o.ms ?? 700 });
  };
  const hero = (wm: Wordmark | null, text: string, tier: number, o: { ms?: number; scale?: number; entry?: 'pop' | 'slam' } = {}) => {
    callouts.current?.show({ slot: 'hero', tier, text, wordmark: wm ?? undefined, ms: o.ms ?? 900, scale: o.scale, entry: o.entry });
  };

  const teamStrike = (who: string[], mult: number) => {
    crewLayer.current?.strike(who);
    later(150, () => {
      clock.hitStop(120, { force: true });
      bossHurt(2, true);
      anim.rimAt.value = fxNow();
      GameAudio.play(GameAudio.hasCue('bo_team_strike') ? 'bo_team_strike' : 'fx.hit');
      playPattern([{ t: 0, kind: 'transient', i: 0.8, s: 0.6 }, { t: 120, kind: 'transient', i: 0.8, s: 0.6 }], { priority: HP.critical });
      const fc = toScreen(L.bossX, faceY);
      burst('stars', fc.x, fc.y, { count: 30 });
      fxRef.current?.ring(fc.x, fc.y, { color: '#FFFFFF', to: 130, ms: 320 });
      if (!reduced) camera.punch(0.08);
      // TEAM STRIKE takes the hero zone (never the name ribbon); the multiplier rides the small lane.
      hero('teamstrike', 'TEAM STRIKE', TIER_BREAK, { ms: 1000 });
      small(`x${mult} TEAM`, TIER_BREAK, { tone: 'lime', ms: 1000 });
    });
  };

  const onEvent = (e: SimEvent) => {
    const b = boutRef.current;
    const face = toScreen(L.bossX, faceY);
    const bx = face.x;
    const fy = face.y;
    switch (e.code) {
      case E_TELL: {
        if (drill.current.on) clock.slowMo(0.5, 600000, 150, true);
        bossSfx.tellLane(boss, e.a);
        playHaptic(e.a === 0 ? 'lane1' : e.a === 1 ? 'lane2' : 'lane3', { priority: HP.telegraph, tell: true });
        if (!walking && !reduced) camera.lean((lane2x(e.a) - L.bossX) * 0.04, 0);
        break;
      }
      case E_FAKE:
        bossSfx.giggle();
        break;
      case E_SHOW:
        bossSfx.icon(boss, e.a % 3, e.a % 3);
        break;
      case E_SHUFFLE:
        GameAudio.play(GameAudio.hasCue('bo_shuffle') ? 'bo_shuffle' : 'fx.whoosh');
        break;
      case E_BUBBLE:
        GameAudio.play('fx.whoosh', { volume: 0.5 });
        break;
      case E_BUBBLE_POP:
        bossSfx.pop();
        buoyTap(e.a);
        burst('bubbles', lane2x(e.a), L.targetY - 10, { count: 12 });
        small('POP!', TIER_HIT);
        break;
      case E_GREY:
        bossSfx.grey();
        small('WINK = FAKE', TIER_COUNTER, { ms: 1000 });
        break;
      case E_FAKE_TAP:
        bossSfx.punish(boss);
        playHaptic('dizzy', { priority: HP.reaction });
        anim.tauntAt.value = fxNow();
        small('FAKE!', TIER_PUNISH, { tone: 'coral' });
        break;
      case E_EARLY:
        bossSfx.early();
        break;
      case E_LOCK:
        bossSfx.lock(e.b);
        buoyTap(e.a);
        burst('sparks', lane2x(e.a), L.targetY, { count: 8, color: WHITE_ARGB });
        break;
      case E_PERFECT:
      case E_GOOD: {
        const perfect = e.code === E_PERFECT;
        const side = rootSide(e.a, atkCtx.current.no + atkCtx.current.step);
        pres.value = { ...pres.value, sLane: e.a, sSide: side, sI: e.t, sRes: 1, sAt: e.t, pinSide: side };
        // Beat snap (11.1): the counter action plays on the impact frame, not the touch frame.
        const d = snapDelay(atkCtx.current.I, e.t);
        const f = fxNow() + d;
        snapped(d, () => {
          bossSfx.snag(boss);
          if (perfect) bossSfx.clang();
          playPattern(perfect ? 'bossPerfect' : 'bossCounterPress', { priority: HP.own });
          if (perfect) clock.hitStop(60, { force: true });
          burst('sparks', lane2x(e.a), L.targetY - 20, { count: perfect ? 10 : 6, color: perfect ? LIME_ARGB : WHITE_ARGB });
          fxRef.current?.ring(lane2x(e.a), L.targetY, { color: perfect ? '#7BD94A' : '#FFFFFF', to: perfect ? 70 : 50, ms: 200 });
          burst('stars', bx, fy, { count: perfect ? 10 : 4 });
          if (perfect && !reduced) camera.punch(0.06);
        });
        buoyTap(e.a);
        bossHurt(perfect ? 1.2 : 0.7, perfect, f);
        if (perfect) anim.rimAt.value = f;
        if (perfect) hero('perfect', 'PERFECT', TIER_COUNTER, { ms: 700 });
        else small('GOOD', TIER_COUNTER);
        if (hint === COUNTER_HINT[boss]) setHint(null);
        if (perfect && crewRef.current && b && atkCtx.current.no === TEAM_STRIKE_ATTACK && !myStrike.current) {
          const n = b.cfg.bout;
          myStrike.current = { at: Date.now(), bout: n, done: false };
          later(160, () => {
            const ms = myStrike.current;
            if (!ms || ms.done) return;
            ms.done = true;
            const m = mergeTeamStrike(ms.at, ms.bout, whispers.current.filter((w) => !w.used));
            if (__DEV__) console.log(`[boss] team strike bout ${ms.bout}: merged ${m.merged.join(',') || '-'} echoes ${m.echoes.join(',') || '-'} whispers ${whispers.current.map((w) => `${w.who}@${w.at - ms.at}`).join(' ')}`);
            whispers.current.forEach((w) => { if (m.merged.indexOf(w.who) >= 0 && w.bout === ms.bout) w.used = true; });
            if (m.merged.length > 0) teamStrike(m.merged, m.multiplier);
          });
        }
        break;
      }
      case E_PUNISH:
      case E_SAFE_MISS: {
        const safe = e.code === E_SAFE_MISS;
        const side = rootSide(e.a, atkCtx.current.no + atkCtx.current.step);
        pres.value = { ...pres.value, sLane: e.a, sSide: side, sI: e.t, sRes: safe ? 3 : 2, sAt: e.t };
        if (!safe) {
          // The hit lands: the limb smacks the float, a water sheet wipes the screen, a fin pops off.
          bossSfx.punish(boss);
          playHaptic('punish', { priority: HP.critical });
          anim.tauntAt.value = fxNow();
          anim.splashLane.value = 3;
          anim.splashAt.value = fxNow() + 90;
          if (!reduced) camera.shake(0.3, 0, 1);
          small(PUNISH_WORD[boss], TIER_PUNISH, { tone: 'coral' });
          fxRef.current?.flash({ color: '#FF6B5C', peak: reduced ? 0 : 0.18, ms: 220 });
          later(90, () => burst('splash', L.floatX, L.floatY - 20, { count: 12 }));
          if (!missedTell.current && b) missedTell.current = { bout: b.cfg.bout, t: e.t, log: b.log.map((x) => ({ ...x })), cfg: { ...b.cfg }, carry: null };
        } else {
          GameAudio.play('fx.whoosh', { volume: 0.5 });
          small(e.b === 2 ? 'THAT ONE WAS A FAKE' : 'WATCH THE SHADOW', TIER_HIT, { ms: 1000 });
        }
        break;
      }
      case E_GRIT: {
        setGrit({ n: e.a, max: e.b });
        anim.flinchAt.value = fxNow();
        GameAudio.play(GameAudio.hasCue('bo_grit_loss') ? 'bo_grit_loss' : 'fx.nopeShort');
        playHaptic('hurt', { priority: HP.critical });
        const k = e.a; // the fin that just popped
        const fx = L.floatX + (k - (e.b - 1) / 2) * 26;
        burst('puff', fx, L.floatY - L.floatR * 2.2, { count: 6 });
        finPopAt.current = Date.now();
        if (e.a === 1) setHint('Last fin! Watch the shadow');
        break;
      }
      case E_KNOCKDOWN:
        GameAudio.play(GameAudio.hasCue('bo_knockdown') ? 'bo_knockdown' : 'fx.nopeShort');
        playPattern('bossKnockdown', { priority: HP.critical });
        if (!reduced) camera.shake(0.45, 0, 1);
        fxRef.current?.flash({ color: '#1B2A4A', peak: reduced ? 0 : 0.25, ms: 360 });
        downOn.value = 1;
        setDown({ on: true, taps: 0 });
        hero('getup', 'GET UP!', TIER_PUNISH, { ms: 1500 });
        small('TAP TAP TAP', TIER_PUNISH, { ms: 1500, key: 'getup' });
        break;
      case E_GETUP_TAP:
        setDown({ on: true, taps: e.a });
        GameAudio.play('ui.select', { volume: 0.5, pitch: Math.min(12, e.a * 1.5) });
        playHaptic('tap', { priority: HP.reaction });
        break;
      case E_GETUP:
        downOn.value = 0;
        setDown({ on: false, taps: 8 });
        anim.getupAt.value = fxNow();
        GameAudio.play(GameAudio.hasCue('bo_getup') ? 'bo_getup' : 'fx.reveal');
        playHaptic('win', { priority: HP.critical });
        burst('sparkles', L.floatX, L.floatY - L.floatR * 1.4, { count: 14 });
        hero(null, 'BACK UP!', TIER_PUNISH, { ms: 900 });
        break;
      case E_TKO:
        downOn.value = 0;
        setDown({ on: false, taps: 0 });
        GameAudio.play(GameAudio.hasCue('sting_zero') ? 'sting_zero' : 'fx.nopeShort');
        playPattern('bossKnockdown', { priority: HP.critical });
        hero(null, 'TKO', TIER_KO, { ms: 1400, entry: 'slam' });
        break;
      case E_OPEN: {
        popsInOpening.current = 0;
        if (drill.current.on) {
          drill.current.opens += 1;
          // The first opening runs at full speed (each sucker waits for its tap); the second at half
          // speed, so there is time to try the Easy Slam hold.
          if (drill.current.opens === 1) clock.slowMo(1, 0, 0, false);
          else clock.slowMo(0.5, 600000, 100, true);
          setHint(drill.current.opens === 1 ? 'Now tap each glowing sucker as its ring closes' : 'Too busy? Hold the float with your thumb: EASY SLAM');
        }
        popTrauma.current = 1;
        const side = pres.value.sRes === 1 ? pres.value.sSide : -1;
        const o = b?.opening;
        pres.value = { ...pres.value, pinSide: side, pinStart: e.t, pinEnd: o ? o.end : e.t + 1800, pinKind: e.a };
        if (e.a !== 3 && e.a !== 1) {
          GameAudio.play(GameAudio.hasCue('bo_pin_slam_kraken') && boss === 'kraken' ? 'bo_pin_slam_kraken' : 'bo_kraken_slam');
          playPattern('bossPinSlam', { priority: HP.own });
          // The camera pulls back hard (0.92) in the arena; a small downward shake sells the slam.
          if (!reduced) camera.shake(0.2, 0, 1);
          for (let i = 0; i < 3; i++) later(30 * i, () => burst('splash', L.laneX[i], L.targetY + 6, { count: 6 }));
        }
        if (e.a === 0 && round.current.novice && b && b.cfg.bout === 0 && b.attacksDone <= 1) setHint('Tap each glowing sucker on the beat. Or hold the float');
        break;
      }
      case E_POP_PERFECT:
      case E_POP:
      case E_HIT: {
        const pop = e.code !== E_HIT;
        const perfect = e.code === E_POP_PERFECT;
        popsInOpening.current += 1;
        const n = popsInOpening.current;
        // Beat snap: hop contact, impact pose and bead launch land on the ring-close frame (HIT is not snapped).
        const ring = openCtx.current && e.a < openCtx.current.rings.length ? openCtx.current.rings[e.a] : e.t;
        const d = pop ? snapDelay(ring, e.t) : 0;
        const f = fxNow() + d;
        anim.beadLane.value = e.b;
        anim.beadAt.value = f;
        anim.hopLane.value = e.b;
        anim.hopAt.value = pop ? fxNow() + (ring - e.t) - HOP_CONTACT_MS : fxNow();
        bossHurt(pop ? 1 : 0.45, pop, f);
        if (perfect) anim.rimAt.value = f;
        const tierLift = comboPct >= 200 ? 3 : comboPct >= 150 ? 2 : comboPct >= 120 ? 1 : 0;
        snapped(d, () => {
          if (pop) bossSfx.popLadder(Math.min(LADDER_MAX, n - 1 + tierLift), perfect);
          else bossSfx.hit(n);
          playPattern(pop ? 'bossPop' : 'bossCounterPress', { priority: HP.own });
          burst('sparks', lane2x(e.b), L.targetY - 6, { count: pop ? 6 : 4, color: WHITE_ARGB });
          if (pop) {
            later(80, () => {
              const fc = toScreen(L.bossX, faceY);
              burst('stars', fc.x, fc.y, { count: perfect ? 16 : 10 });
              fxRef.current?.ring(fc.x, fc.y, { color: '#FFFFFF', to: 90, ms: 240 });
            });
            if (!reduced) camera.shake(0.12 * popTrauma.current + (perfect ? 0.05 : 0), 0, -1);
            popTrauma.current = popTrauma.current >= 1 ? 0.6 : 0.35;
          }
        });
        if (perfect) small('PERFECT POP', TIER_POP, { underline: true, tone: 'white' });
        else if (pop) small('POP', TIER_POP);
        else small(`HIT x${n}`, TIER_HIT, { key: 'hit' });
        break;
      }
      case E_CLANK:
        bossSfx.clank();
        burst('sparks', lane2x(boutRef.current?.lastLane ?? 1), L.targetY - 4, { count: 3, color: WHITE_ARGB });
        anim.hurtAt.value = fxNow();
        anim.hurtK.value = 0.15;
        if (e.a >= 2) small('CLANK', TIER_HIT, { ms: 500 });
        break;
      case E_GUARD_WARN:
        setGuardWarn(true);
        later(1000, () => setGuardWarn(false));
        GameAudio.play(GameAudio.hasCue('bo_guard') ? 'bo_guard' : 'ui.select', { volume: 0.5 });
        playHaptic('dizzy', { priority: HP.reaction });
        setHint('Closing up! One tap per glowing sucker');
        break;
      case E_GUARD_COUNTER:
        bossSfx.guardCounter();
        playHaptic('dizzy', { priority: HP.critical });
        setGuardWarn(false);
        if (!reduced) camera.shake(0.35);
        small('DIZZY', TIER_PUNISH, { tone: 'coral' });
        burst('stars', L.floatX, L.floatY - L.floatR * 1.8, { count: 8 });
        break;
      case E_SLAM: {
        const f = fxNow();
        anim.slamAt.value = f;
        later(160, () => {
          bossHurt(1.6, true);
          bossSfx.heavy();
          playPattern('bossEasySlam', { priority: HP.own });
          const fc = toScreen(L.bossX, faceY);
          burst('stars', fc.x, fc.y, { count: 20 });
          fxRef.current?.ring(fc.x, fc.y, { color: '#FFFFFF', to: 110, ms: 300 });
          small('EASY SLAM', TIER_POP);
          if (!reduced) {
            camera.punch(0.08);
            camera.shake(0.3, 0, -1);
          }
        });
        break;
      }
      case E_SLAM_CANCEL:
        GameAudio.play('ui.tap', { volume: 0.4 });
        break;
      case E_CLOSE:
        if (drill.current.on && drill.current.opens >= 2 && b) input(b, { t: e.t, k: IN_END });
        bossSfx.close();
        if (boss === 'kraken' && GameAudio.hasCue('bo_guard_kraken')) GameAudio.play('bo_guard_kraken', { volume: 0.55 });
        playHaptic('goodHit', { priority: HP.own });
        fxRef.current?.ring(bx, fy, { color: '#FFFFFF', to: 70, ms: 220 });
        if (hint && hint.startsWith('Tap each')) setHint(null);
        break;
      case E_BREAK: {
        const nB = e.a;
        const f = fxNow();
        bossSfx.brk(boss);
        playPattern('bossBreak', { priority: HP.critical });
        clock.hitStop(120 + 20 * nB, { force: true });
        // Crown-cam push-in 1.16 / 1.19 / 1.22 on the face (arena world camera), slow-mo after the freeze.
        anim.partN.value = nB;
        anim.breakAt.value = f;
        if (!reduced) {
          camera.shake(0.6, 0, 1);
          clock.slowMo(0.3, 200, 120);
        }
        bossHurt(1.8, true);
        later(140, () => {
          const fc = toScreen(L.bossX, faceY);
          burst('stars', fc.x, fc.y, { count: [40, 56, 72][Math.min(3, nB) - 1] });
          fxRef.current?.emitDef({ ...EMITTERS.confetti, colors: KO_CONFETTI }, fc.x, fc.y, { count: Math.round((16 + 8 * nB) * pScale) });
        });
        hero('break', nB > 1 ? `BREAK x${nB}` : 'BREAK!', TIER_BREAK, { ms: 1000, scale: 1 + 0.1 * (nB - 1) });
        // The part is the hero: it leaves the rig, bounces, settles in a settle zone; its material flies to the HUD.
        if (boss === 'kraken') {
          const rest = nB === 1 || nB === 3 ? partRestMs(L, nB) : 500;
          if (nB === 1) anim.hatAt.value = f + 60;
          if (nB === 3) anim.shardAt.value = f + 60;
          anim.matAt.value = f + 60 + rest + 300;
          later(60 + Math.min(rest, 1600) * 0.35, () => GameAudio.play(GameAudio.hasCue('bo_part_bounce') ? 'bo_part_bounce' : 'ui.tap', { volume: 0.8 }));
          later(60 + rest + 300 + 420, () => {
            setMats((m) => [...m, nB - 1]);
            GameAudio.play('fx.coin', { pitch: 4 });
            playHaptic('tap', { priority: HP.reaction });
            showRibbon(`${MATERIALS[Math.min(2, nB - 1)].name}!`, undefined, 900);
          });
          pres.value = { ...pres.value, breaks: nB };
          if (nB === 1) setTaunt('My HAT!');
          later(1400, () => setTaunt(null));
        }
        break;
      }
      case E_BREAK_END:
        GameAudio.play('fx.whoosh', { volume: 0.6 });
        break;
      case E_FINAL_READY:
        bossSfx.finisherReady();
        setHint('FINAL POP!');
        break;
      case E_FINAL: {
        setHint(null);
        const ring = openCtx.current && openCtx.current.finalIdx >= 0 ? openCtx.current.rings[openCtx.current.finalIdx] : e.t;
        const d = e.a >= 2 ? snapDelay(ring, e.t) : 0;
        const f = fxNow() + d;
        anim.finalGrade.value = e.a;
        anim.beadLane.value = e.b;
        if (e.a >= 1) {
          anim.finalAt.value = f;
          if (e.a >= 2) hero('finish', 'FINISH!', TIER_FINAL, { ms: 1000, entry: 'slam' });
          else small('POP!', TIER_POP);
          later(220 + d, () => {
            bossSfx.finisherImpact(boss);
            playPattern('bossFinalPop', { priority: HP.critical });
            bossHurt(2.2, true);
            const fc = toScreen(L.bossX, faceY);
            burst('stars', fc.x, fc.y, { count: e.a >= 2 ? 60 : 20 });
            burst('splash', fc.x, toScreen(L.bossX, L.lipY).y, { count: 30 });
            if (e.a >= 2) {
              clock.hitStop(220, { force: true });
              if (!reduced) {
                camera.shake(0.5, 0, 1);
                clock.slowMo(0.3, 200, 150);
              }
            }
          });
          anim.cheerAt.value = f + 300;
        } else {
          small('SHRUGGED IT OFF', TIER_HIT, { ms: 1000 });
        }
        break;
      }
      case E_STAR:
        setStars(e.a);
        GameAudio.play('fx.reveal', { volume: 0.5, pitch: e.a * 2 });
        break;
      case E_STAR_OUT:
        setStars(e.a);
        break;
      case E_SKILL_STAR:
        GameAudio.play(GameAudio.hasCue('bo_skill_star') ? 'bo_skill_star' : 'fx.reveal');
        small('SKILL STAR!', TIER_BREAK, { tone: 'lime', ms: 1000 });
        burst('sparkles', bx, fy - L.bossSize * 0.35, { count: 16 });
        break;
      case E_TIER:
        setComboPct(e.a);
        bossSfx.tier();
        if (e.a >= 200) hero('fury', 'FURY', TIER_POP, { ms: 800 });
        break;
      case E_GAUGE_HOT:
        bossSfx.gaugeHot();
        break;
      case E_DECAY:
        setComboPct(comboOf(e.b));
        break;
      case E_BOON:
        break;
      case E_END:
        break;
      default:
    }
  };

  // ---- crew and ghost tick (wall clock; nobody ever waits for anyone) -----------
  useEffect(() => {
    if (!visible || (stage !== 'bout' && stage !== 'inter')) return undefined;
    const id = setInterval(() => {
      const crew = crewRef.current;
      if (crew) {
        for (const ev of crew.drain(Date.now())) {
          if (ev.kind === CREW_LUNGE) crewLayer.current?.hop(ev.who);
          else if (ev.kind === CREW_CAUGHT) crewLayer.current?.caught(ev.who);
          else if (ev.kind === CREW_STRIKE) {
            const w = { who: ev.who, bout: ev.a ?? 0, attack: TEAM_STRIKE_ATTACK, grade: 2, at: ev.at, used: false };
            if (__DEV__) console.log(`[boss] whisper ${w.who} bout ${w.bout} at +${ev.at - boutWall.current}`);
            whispers.current.push(w);
            // Hold it for the merge window: if your own PERFECT lands with it, it becomes one combined hit;
            // otherwise their strike still lands on your screen as a small "+ALLY" echo.
            const echo = () => {
              if (w.used) return;
              w.used = true;
              crewLayer.current?.strike([w.who]);
              later(150, () => small('+ALLY', TIER_POP, { tone: 'lime' }));
            };
            const ms = myStrike.current;
            if (ms && ms.done) echo();
            else later(420, echo);
          }
        }
      }
      const g = ghostRef.current;
      const b = boutRef.current;
      if (g && b && stageRef.current === 'bout') {
        const t = boutT.value;
        const theirs = ghostAt(g, b.cfg.bout, t);
        const mine = round.current.bouts.reduce((sum, x) => sum + scoreBout(x), 0) + scoreBout(b);
        const d = mine - theirs;
        setGhostLine(d >= 0 ? `Beating ${g.name}: +${d}` : `Beat ${g.name}: ${(-d).toLocaleString()} to go`);
        const lunges = g.bouts[b.cfg.bout]?.lunges ?? [];
        while (ghostHop.current < lunges.length && lunges[ghostHop.current] <= t) {
          ghostHop.current += 1;
          if (!crew) crewLayer.current?.hop('ghost');
        }
      }
    }, 80);
    return () => clearInterval(id);
  }, [visible, stage, boutT]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- JS sim loop: advance (with a small lag), fire due events, publish ----
  useEffect(() => {
    if (stage !== 'bout') return undefined;
    let raf = 0;
    const loop = () => {
      const b = boutRef.current;
      if (!b) return;
      const now = boutT.value;
      const before = b.events.length;
      noteAttack(b);
      advance(b, now - SIM_LAG_MS);
      if (b.events.length !== before || evIdx.current !== b.events.length) {
        for (let i = evIdx.current; i < b.events.length; i++) pending.current.push(b.events[i]);
        evIdx.current = b.events.length;
        view.value = buildView(b);
        setDamage(round.current.bouts.reduce((s, x) => s + scoreBout(x), 0) + scoreBout(b));
      }
      // Practice: the wind-up waits at the impact frame until the right buoy is tapped.
      const da = b.attack;
      const dd = drill.current;
      if (dd.on && !dd.frozen) {
        const o = b.opening;
        if (da && now >= da.steps[b.step].I - 40) {
          dd.frozen = true;
          dd.want = da.steps[b.step].lane;
          clock.pause();
          setHint('Tap the buoy under the shadow!');
        } else if (o && dd.opens === 1) {
          // First opening: each glowing sucker waits at its ring close.
          const j = o.used.findIndex((u, k) => u === 0 && now >= o.rings[k] - 30);
          if (j >= 0 && j !== dd.slot) {
            dd.frozen = true;
            dd.slot = j;
            dd.want = o.lanes[j];
            clock.pause();
            setHint('Tap the glowing sucker!');
          }
        }
      }
      // The slam lands on an unanswered buoy at the impact frame (sound and splash on time).
      const a = b.attack;
      if (a) {
        const st = a.steps[b.step];
        const key = `${b.cfg.bout}:${a.no}:${b.step}`;
        if (st && now >= st.I && slamSeen.current !== key) {
          slamSeen.current = key;
          bossSfx.slam(boss);
          anim.splashLane.value = st.lane;
          anim.splashAt.value = fxNow();
          buoyTap(st.lane);
        }
      }
      // Fire due events; tells go out one audio-latency early so they are heard on time.
      const lead = Math.min(80, Math.max(0, GameAudio.latencyMs || 0));
      const due: SimEvent[] = [];
      const rest: SimEvent[] = [];
      for (const e of pending.current) ((e.code === E_TELL || e.code === E_SHOW || e.code === E_FAKE ? e.t - lead : e.t) <= now ? due : rest).push(e);
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
    if (drill.current.on && drill.current.frozen) {
      // Practice: only the right buoy releases the freeze; anything else is a gentle nudge.
      const want = drill.current.want;
      const ok = want === -2 ? k === IN_PAD_DOWN : k === IN_TARGET && a === want;
      if (!ok) {
        if (k === IN_TARGET) { buoyTap(a); bossSfx.early(); }
        return;
      }
      drill.current.frozen = false;
      clock.resume();
      setHint(null);
    }
    const before = b.events.length;
    if (k === IN_TARGET) b.lastLane = a;
    noteAttack(b);
    input(b, k === IN_TARGET ? { t, k, a } : { t, k });
    if (k === IN_TARGET) {
      buoyTap(a);
      playHaptic('tap', { priority: HP.reaction, input: true });
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
      for (const tch of e.changedTouches) {
        const region = hitRegion(L, tch.x, tch.y);
        if (catchArmed.value > 0 && region >= 0 && region <= 2) {
          runOnJS(onCatch)(region);
          continue;
        }
        if (!running.value) continue;
        const t = boutT.value;
        if (downOn.value > 0) {
          // Knockdown: the whole thumb zone is one tap rect.
          if (region >= 0) runOnJS(onInput)(IN_GETUP, 0, t);
          continue;
        }
        if (region === REGION_FLOAT) {
          if (padTouch.value >= 0) runOnJS(onInput)(IN_PAD_UP, 0, t);
          padTouch.value = tch.id;
          anim.padHeld.value = 1;
          runOnJS(onInput)(IN_PAD_DOWN, 0, t);
        } else if (region >= 0 && region <= 2) {
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
    }), [L, onInput, onCatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accessibility / Simple controls path: same inputs, stamped on the JS side.
  const a11yTarget = (lane: number) => onInput(down.on ? IN_GETUP : IN_TARGET, lane, boutT.value);

  // ---- dev autoplay: a mastery-ish bot through the same input path ------------
  useEffect(() => {
    if (!autoplay || stage !== 'bout') return undefined;
    const tm: ReturnType<typeof setTimeout>[] = [];
    let seenA = '';
    let seenO = -1;
    let seenD = -1;
    const at = (simT: number, fn: () => void) => {
      tm.push(setTimeout(fn, Math.max(0, simT - boutT.value)));
    };
    const id = setInterval(() => {
      const b = boutRef.current;
      if (!b) return;
      const a = b.attack;
      if (a && seenA !== `${b.cfg.bout}:${a.no}`) {
        seenA = `${b.cfg.bout}:${a.no}`;
        if (a.hazardLane >= 0) at(a.hazardT0 + 320, () => onInput(IN_TARGET, a.hazardLane, boutT.value));
        a.steps.forEach((s, k) => {
          const when = s.graded ? s.I - 40 + Math.round((Math.random() - 0.5) * 60) : a.T + 300 + k * 120;
          at(when, () => {
            const cur = boutRef.current?.attack;
            if (!cur) return;
            const lane = cur.swaps.length ? (boutT.value >= cur.swaps[0] ? cur.swaps[1] : cur.lane0) : s.lane;
            onInput(IN_TARGET, lane, boutT.value);
          });
        });
      }
      const o = b.opening;
      if (o && o.id !== seenO) {
        seenO = o.id;
        // Every 4th opening: Easy Slam (shows the casual mode); otherwise pop each sucker on the beat.
        if (o.id % 4 === 3 && o.finalIdx < 0 && o.kind === 0) {
          at(o.start + 40, () => { anim.padHeld.value = 1; onInput(IN_PAD_DOWN, 0, boutT.value); });
          at(o.rings[o.rings.length - 1] + 80, () => { anim.padHeld.value = 0; onInput(IN_PAD_UP, 0, boutT.value); });
        } else {
          o.rings.forEach((r, j) => at(r - 10 + Math.round((Math.random() - 0.5) * 50), () => onInput(IN_TARGET, o.lanes[j], boutT.value)));
        }
      }
      if (b.down && b.down.start !== seenD) {
        seenD = b.down.start;
        for (let k = 0; k < 10; k++) at(b.down.open + 40 + k * 130, () => onInput(IN_GETUP, 0, boutT.value));
      }
    }, 50);
    return () => {
      clearInterval(id);
      tm.forEach(clearTimeout);
    };
  }, [autoplay, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!autoplay || stage !== 'inter') return undefined;
    LogBox.ignoreAllLogs(true);
    const id = setTimeout(() => fight(inter.offer[1]), 2600);
    return () => clearTimeout(id);
  }, [autoplay, stage, fight, inter.offer]);

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
    timers.current.forEach(clearTimeout);
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
  const hpStart = Math.max(0, Math.min(1, hpLeft / Math.max(1, hpMax)));
  const ribbonStyle = useAnimatedStyle(() => {
    const p = ribbonP.value;
    const s = p <= 1 ? 0.6 + 0.4 * p : 1 - (p - 1) * 0.3;
    return { opacity: p <= 1 ? p : 2 - p, transform: [{ scale: s }] };
  });
  const comboStyle = useAnimatedStyle(() => {
    const f = beat.value - Math.floor(beat.value);
    const pulse = comboPct >= 200 && f < 0.3 ? 1 + 0.04 * (1 - f / 0.3) : 1;
    return { transform: [{ scale: pulse }] };
  });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };
  const inBout = stage === 'bout';

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
      renderResults={(args) => (resultsExtras.current ? (
        <BossResults result={args.result} extras={resultsExtras.current} reducedMotion={args.reducedMotion} claim={args.claim} rematch={args.rematch} />
      ) : null)}
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
          {/* The camera lives inside the arena: only the world layers move; the row, float and HUD never do. */}
          <View style={StyleSheet.absoluteFill}>
            <BossArena L={L} view={view} t={boutT} fx={fxT} beat={beat} anim={animMemo} pres={pres} img={imgMemo}
              bossKind={BOSS_INDEX[boss]} reduced={reduced} bossArtScale={BOSS_ART_SCALE[boss]} cam={camMemo} />
          </View>
        </GestureDetector>

        {/* HUD band: never shakes. Shared raid HP, Grit fins, materials, bout pips, combo pill (K9 art), Anchor Stars. */}
        <View style={styles.hud} pointerEvents="none">
          <View style={styles.hpRow}>
            <Text style={styles.hpLabel}>{bossName.toUpperCase()}</Text>
            <Text style={styles.hpText}>{`${preview.toLocaleString()} HP`}</Text>
          </View>
          <View style={styles.hpTrack}>
            <View style={[styles.hpChunk, { width: `${hpStart * 100}%` }]} />
            <View style={[styles.hpFill, { width: `${hpPct * 100}%` }]} />
          </View>
          <View style={styles.hudRow}>
            <View style={styles.leftCluster}>
              <View style={styles.finRow}>
                {Array.from({ length: grit.max }, (_, i) => (
                  <Image key={i} source={i < grit.n ? ART.finFull : ART.finEmpty}
                    style={[styles.finPip, grit.n === 1 && i === 0 && styles.finLast]} />
                ))}
              </View>
              <View style={styles.matSlot}>
                <Image source={ART.slotFrame} style={styles.slotFrame} />
                {mats.length === 0 ? null : <Image source={MATERIALS[Math.min(2, mats[mats.length - 1])].art} style={styles.matIcon} />}
                {mats.length > 1 ? <Text style={styles.matCount}>{`x${mats.length}`}</Text> : null}
              </View>
            </View>
            <View style={styles.pips}>
              {[0, 1, 2].map((i) => {
                const done = i < round.current.bouts.length;
                const now = i === boutNo && inBout;
                return (
                  <View key={i} style={styles.pipWrap}>
                    <Image source={ART.boutPip} style={[styles.pipImg, !done && !now && styles.pipTodo]} />
                    {done ? <View style={styles.pipDot} /> : null}
                    {now ? <View style={styles.pipNow} /> : null}
                  </View>
                );
              })}
            </View>
            <Animated.View style={[styles.combo, comboStyle]}>
              <Image source={ART.pillFrame} style={styles.comboFrame} resizeMode="stretch" />
              {comboPct >= 200 ? <View style={styles.comboFury} /> : null}
              <Text style={styles.comboText}>{`x${(comboPct / 100).toFixed(1)}`}</Text>
            </Animated.View>
          </View>
          {boutNo === 2 && inBout && (
            <View style={styles.anchorRow}>
              {[0, 1, 2].map((i) => <View key={i} style={[styles.anchorPip, i < stars && styles.anchorOn]} />)}
            </View>
          )}
          {ghostLine && <Text style={styles.ghostText}>{ghostLine}</Text>}
        </View>

        {guardWarn && (
          <View style={[styles.guard, { top: L.bossY - L.bossSize * 0.78 }]} pointerEvents="none">
            <Text style={styles.guardText}>!</Text>
          </View>
        )}

        {hint && inBout && (
          <View style={[styles.hintWrap, { top: L.targetY - L.targetH / 2 - 62 }]} pointerEvents="none">
            <Text style={styles.hint}>{hint}</Text>
          </View>
        )}

        {ribbon && (
          <Animated.View style={[styles.ribbonWrap, { top: Z.ribbonY - 40 }, ribbonStyle]} pointerEvents="none">
            <Image source={ART.ribbon} style={styles.ribbonImg} resizeMode="contain" />
            <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit>{ribbon.title}</Text>
            {ribbon.sub ? <Text style={styles.ribbonSub}>{ribbon.sub}</Text> : null}
          </Animated.View>
        )}

        <CalloutLayer ref={callouts} width={L.W} height={L.H} fx={fxT} cx={L.bossX} />

        {taunt && (
          <View style={[styles.taunt, { top: Math.max(Z.heroY + 40, L.bossY - L.bossSize * 0.1) , left: L.W * 0.56 }]} pointerEvents="none">
            <Text style={styles.tauntText}>{taunt}</Text>
          </View>
        )}

        {replay && (
          <View style={[styles.replay, { top: L.thumbTop + 20 }]} pointerEvents="none">
            <Text style={styles.replayKicker}>REPLAY 0.5x</Text>
            <Text style={styles.replayText}>Watch the shadow, tap its buoy</Text>
          </View>
        )}

        {drillOn && (
          <Pressable accessibilityRole="button" accessibilityLabel="Skip practice" onPress={skipDrill}
            style={[styles.skip, { top: 84 }]}>
            <Text style={styles.skipText}>SKIP PRACTICE</Text>
          </Pressable>
        )}

        {down.on && (
          <View style={[styles.getup, { top: L.targetY - 20 }]} pointerEvents="none">
            {Array.from({ length: 8 }, (_, i) => (
              <Image key={i} source={i < down.taps ? ART.finFull : ART.finEmpty} style={styles.getupPip} />
            ))}
          </View>
        )}

        {catchOn && (
          <View style={[styles.catchWrap, { left: L.laneX[catchOn.lane] - 34, top: L.targetY - 110 }]} pointerEvents="none">
            <Image source={catchOn.mat >= 0 ? MATERIALS[catchOn.mat].art : SCALE_MAT.art} style={styles.catchIcon} />
            <Text style={styles.catchText}>CATCH!</Text>
          </View>
        )}

        {chest && (
          <View style={[styles.chestWrap, { top: L.targetY - 150 }]} pointerEvents="none">
            <Image source={ART.chest} style={styles.chestImg} />
          </View>
        )}

        {strip && (
          <View style={[styles.strip, { top: L.thumbTop + 10 }]} pointerEvents="none">
            <Text style={styles.stripTitle}>YOUR FIGHT</Text>
            <View style={styles.stripBar}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.stripSeg, i <= strip.fell && styles.stripSegDone, i === strip.fell && styles.stripSegFell]}>
                  <Text style={styles.stripSegText}>{i < strip.perBout.length ? `+${strip.perBout[i]}` : ''}</Text>
                  {i === strip.fell && <Image source={ART.shark} style={styles.stripShark} />}
                </View>
              ))}
            </View>
            <Text style={styles.stripTip}>Watch the shadow, tap its buoy</Text>
          </View>
        )}

        {stage === 'inter' && (
          <View style={[styles.inter, { top: L.thumbTop - 120 }]}>
            <Text style={styles.interKicker}>{`ROUND ${inter.bout} DAMAGE`}</Text>
            <Text style={styles.interDmg}>{`+${Math.floor(inter.dmg * damageRate).toLocaleString()}`}</Text>
            {mats.length > 0 && (
              <View style={styles.interMats}>
                {mats.map((m, i) => <Image key={i} source={MATERIALS[Math.min(2, m)].art} style={styles.interMat} />)}
              </View>
            )}
            <Text style={styles.interPick}>PICK A BOON</Text>
            <View style={styles.boonRow}>
              {inter.offer.map((id) => (
                <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${BOONS[id].title}: ${BOONS[id].body}`}
                  onPress={() => fight(id)} style={[styles.boon, inter.picked === id && styles.boonPicked]}>
                  <Text style={styles.boonTitle}>{BOONS[id].title}</Text>
                  <Text style={styles.boonBody}>{BOONS[id].body}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.interNext}>{`NEXT: ${BOUT_RIBBON[inter.bout]}`}</Text>
          </View>
        )}
        {stage === 'inter' && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Fight ${BOUT_RIBBON[inter.bout]}`} onPress={() => fight()}
            style={[styles.fightBtn, { left: L.floatX - 90, top: L.floatY - 34 }]}>
            <Text style={styles.fightText}>FIGHT</Text>
          </Pressable>
        )}

        {/* Accessibility: the in-world targets and float as buttons (VoiceOver, Switch Control). */}
        {inBout && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessible={false}>
            {[0, 1, 2].map((i) => (
              <View key={i} accessible accessibilityRole="button" accessibilityLabel={`${['Left', 'Middle', 'Right'][i]} buoy`}
                onAccessibilityTap={() => a11yTarget(i)} pointerEvents="none"
                style={[styles.a11y, { left: L.laneX[i] - L.targetW / 2, top: L.targetY - L.targetH / 2, width: L.targetW, height: L.targetH }]} />
            ))}
          </View>
        )}

        {mates.length > 0 && (inBout || stage === 'inter' || stage === 'intro') && <CrewLayer ref={crewLayer} L={L} mates={mates} />}
        <FxStage ref={fxRef} width={L.W} height={L.H} timeScale={clock.fxScale} reducedMotion={reduced} capacity={160} />
        {perfOn ? <PerfOverlay probe={perf} style={{ top: 120, left: 8 }} /> : null}
      </GestureHandlerRootView>
    </GameShellV2>
  );
}

const SHADOW = { textShadowColor: '#1B2A4A', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 };

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#9FF0F5' },
  hud: { position: 'absolute', top: 6, left: 12, right: 12 },
  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  hpLabel: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF', ...SHADOW },
  hpText: { fontFamily: 'Knockout', fontSize: 14, color: '#FFFFFF', ...SHADOW },
  hpTrack: { marginTop: 2, height: 16, borderRadius: 8, backgroundColor: '#DDF6FF', borderWidth: 2, borderColor: '#FFFFFF', overflow: 'hidden' },
  hpChunk: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#FFB3AB' },
  hpFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#EF4444' },
  hudRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leftCluster: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 110 },
  finRow: { flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 12, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 2, borderColor: '#1B2A4A' },
  finPip: { width: 21, height: 20, resizeMode: 'contain' },
  finLast: { transform: [{ scale: 1.15 }] },
  matSlot: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  slotFrame: { position: 'absolute', width: 32, height: 32, resizeMode: 'contain' },
  matIcon: { width: 22, height: 22, resizeMode: 'contain' },
  matCount: { position: 'absolute', right: -8, bottom: -4, fontFamily: 'Shark', fontSize: 12, color: '#FFFFFF', ...SHADOW },
  pips: { flexDirection: 'row', gap: 4 },
  pipWrap: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  pipImg: { position: 'absolute', width: 20, height: 20, resizeMode: 'contain' },
  pipTodo: { opacity: 0.6 },
  pipDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#3FA9FF' },
  pipNow: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF6B5C' },
  combo: { width: 66, height: 34, alignItems: 'center', justifyContent: 'center' },
  comboFrame: { position: 'absolute', width: 66, height: 34 },
  comboFury: { position: 'absolute', left: 5, right: 5, top: 5, bottom: 5, borderRadius: 12, borderWidth: 3, borderColor: '#7BD94A' },
  comboText: { fontFamily: 'Shark', fontSize: 18, color: '#1B2A4A' },
  anchorRow: { flexDirection: 'row', alignSelf: 'flex-end', marginTop: 3, gap: 4 },
  anchorPip: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#1B2A4A', backgroundColor: 'rgba(255,255,255,0.5)' },
  anchorOn: { backgroundColor: '#FFFFFF', borderColor: '#7BD94A', borderWidth: 3 },
  ghostText: { alignSelf: 'center', marginTop: 3, fontFamily: 'Shark', fontSize: 14, color: '#1B2A4A', backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 10, paddingHorizontal: 8, overflow: 'hidden' },
  guard: { position: 'absolute', alignSelf: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF8A1F', borderWidth: 3,
    borderColor: '#1B2A4A', alignItems: 'center', justifyContent: 'center' },
  guardText: { fontFamily: 'Shark', fontSize: 26, color: '#FFFFFF' },
  hintWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  hint: { fontFamily: 'Shark', fontSize: 16, color: '#1B2A4A', backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden', textAlign: 'center' },
  ribbonWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', height: 80 },
  ribbonImg: { position: 'absolute', width: 290, height: 72 },
  ribbonText: { fontFamily: 'Shark', fontSize: 28, maxWidth: 220, color: '#FFFFFF', marginTop: -8, textShadowColor: '#7A3D00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  ribbonSub: { position: 'absolute', bottom: -10, fontFamily: 'Shark', fontSize: 16, color: '#1B2A4A', backgroundColor: '#FFFFFF', borderRadius: 10,
    paddingHorizontal: 10, overflow: 'hidden' },
  taunt: { position: 'absolute', maxWidth: '42%', backgroundColor: '#FFFFFF', borderRadius: 18,
    borderWidth: 3, borderColor: '#1B2A4A', paddingHorizontal: 14, paddingVertical: 8 },
  tauntText: { fontFamily: 'Shark', fontSize: 18, color: '#1B2A4A', textAlign: 'center' },
  getup: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 3, borderColor: '#1B2A4A' },
  getupPip: { width: 22, height: 21, resizeMode: 'contain' },
  catchWrap: { position: 'absolute', width: 68, alignItems: 'center' },
  catchIcon: { width: 56, height: 56, resizeMode: 'contain' },
  catchText: { fontFamily: 'Shark', fontSize: 14, color: '#1B2A4A', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 2, borderColor: '#1B2A4A', paddingHorizontal: 6, overflow: 'hidden' },
  replay: { position: 'absolute', left: 18, right: 18, padding: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 3, borderColor: '#1B2A4A', alignItems: 'center' },
  replayKicker: { fontFamily: 'Knockout', fontSize: 13, color: '#0768B9', letterSpacing: 1 },
  replayText: { fontFamily: 'Shark', fontSize: 17, color: '#1B2A4A' },
  strip: { position: 'absolute', left: 18, right: 18, padding: 10, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.95)', borderWidth: 3, borderColor: '#1B2A4A', alignItems: 'center' },
  stripTitle: { fontFamily: 'Knockout', fontSize: 14, color: '#0768B9', letterSpacing: 1 },
  stripBar: { flexDirection: 'row', width: '100%', marginTop: 6, gap: 4 },
  stripSeg: { flex: 1, height: 40, borderRadius: 10, backgroundColor: '#DDF6FF', borderWidth: 2, borderColor: '#1B2A4A', alignItems: 'center', justifyContent: 'center' },
  stripSegDone: { backgroundColor: '#3FD0E8' },
  stripSegFell: { backgroundColor: '#FF6B5C' },
  stripSegText: { fontFamily: 'Shark', fontSize: 16, color: '#FFFFFF', ...SHADOW },
  stripShark: { position: 'absolute', right: -6, top: -18, width: 30, height: 34, resizeMode: 'contain' },
  stripTip: { marginTop: 6, fontFamily: 'Shark', fontSize: 15, color: '#1B2A4A' },
  inter: { position: 'absolute', left: 18, right: 18, padding: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 3, borderColor: '#1B2A4A', alignItems: 'center' },
  interKicker: { fontFamily: 'Knockout', fontSize: 13, color: '#0768B9', letterSpacing: 1 },
  interDmg: { fontFamily: 'Shark', fontSize: 34, color: '#1B2A4A' },
  interMats: { flexDirection: 'row', gap: 4 },
  interMat: { width: 30, height: 30, resizeMode: 'contain' },
  interPick: { marginTop: 4, fontFamily: 'Knockout', fontSize: 13, color: '#0768B9', letterSpacing: 1 },
  boonRow: { flexDirection: 'row', gap: 8, marginTop: 4, width: '100%' },
  boon: { flex: 1, minHeight: 58, borderRadius: 14, backgroundColor: '#E8F8FF', borderWidth: 3, borderColor: '#1B2A4A', padding: 6, alignItems: 'center', justifyContent: 'center' },
  boonPicked: { backgroundColor: '#E8FBD9', borderColor: '#7BD94A' },
  boonTitle: { fontFamily: 'Shark', fontSize: 16, color: '#1B2A4A' },
  boonBody: { fontFamily: 'Knockout', fontSize: 12, color: '#0768B9', textAlign: 'center' },
  interNext: { marginTop: 6, fontFamily: 'Shark', fontSize: 18, color: '#FF6B5C' },
  fightBtn: { position: 'absolute', width: 180, height: 68, borderRadius: 34, backgroundColor: '#EF4444', borderWidth: 4,
    borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  fightText: { fontFamily: 'Shark', fontSize: 32, color: '#FFFFFF', textShadowColor: '#7A1010', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  a11y: { position: 'absolute' },
  chestWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  chestImg: { width: 130, height: 110, resizeMode: 'contain' },
  skip: { position: 'absolute', right: 12, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 12, borderWidth: 2, borderColor: '#1B2A4A',
    paddingHorizontal: 10, paddingVertical: 4 },
  skipText: { fontFamily: 'Shark', fontSize: 14, color: '#1B2A4A' },
});

export default BossBrawl;
