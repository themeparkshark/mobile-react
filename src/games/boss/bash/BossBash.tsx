/**
 * Boss Bash: the raid round (replaces the v1 buoy brawl).
 *
 *   BONK the tentacles -> the fins fill -> the boss gets DIZZY -> SMASH its head.
 *   Never bonk the spiky pufferfish.
 *
 * Rules live in rules.ts (pure, tested, mirrors the server proof). This file is
 * the stage: a lagoon, the boss rising out of the water, pop-ups in six spots,
 * the fin meter and every bit of juice (squash, hit-stop, shake, particles,
 * wordmarks, haptics and sound on the same frame). Damage on screen is the
 * server's formula with the raid's weights and the round's home rate.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring,
  withTiming, type SharedValue,
} from 'react-native-reanimated';
import GameIcon from '../../../ui/GameIcon';
import type { BossId, RaidDamageWeights } from '../../../api/endpoints/parks/raid';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND } from '../../../ui/tokens';
import {
  GameShellV2, ParticleField, haptic, useFlash, useShake, type GameResult, type GameShellV2Handle, type ParticleHandle,
  type ShellResultsArgs,
} from '../../../gamekit';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../../gamekit/audio/studioLibrary';
import { useGameMusic } from '../../../gamekit/audio/useGameMusic';
import { BASH_ART, BOSS_SKINS } from './art';
import WaterFront from './WaterFront';
import {
  Bubble, Burst, CountBeat, DamageNumber, DizzyStars, DizzyTarget, FinMeter, InkSplat, PopupActor, TapHand, Wordmark, type ActorExit,
  type WordmarkId,
} from './BashParts';
import BashResults, { type BashNext, type BashRewards } from './BashResults';
import {
  DEFAULT_WEIGHTS, INKED_MS, ROUND_MS, bashScore, bashStars, createBash, finsNeeded, phaseAt, tapBoss, tapPopup, tapWater, tick,
  type BashEvent, type BashState, type PhaseId, type Popup,
} from './rules';

const SEEN_KEY = 'boss_bash_seen_v1';
/** Hit-stop on a smash: the whole stage holds this long. */
const SMASH_STOP_MS = 85;
const LANES = [0.2, 0.5, 0.8] as const;

type SharkPose = 'idle' | 'cheer' | 'bonked' | 'dizzy';
type Face = 'angry' | 'dizzy' | 'hurt' | 'laugh' | 'roar';
type Fx =
  | { id: number; t: 'num'; text: string; x: number; y: number; big: boolean }
  | { id: number; t: 'burst'; src: number; x: number; y: number; size: number; spin?: boolean }
  | { id: number; t: 'wm'; wm: WordmarkId }
  | { id: number; t: 'bubble'; text: string; x: number; y: number; tone: 'white' | 'gold' | 'red' }
  | { id: number; t: 'ink'; x: number; y: number; size: number; rot: number }
  | { id: number; t: 'count'; text: string };
type FxIn = Fx extends infer F ? (F extends Fx ? Omit<F, 'id'> : never) : never;
type FxLive = Fx & { until: number };

/** Studio cue when it exists, else the shipped Chris sound. */
function cue(id: string, fallback: string): string {
  return GameAudio.hasCue(id) ? id : fallback;
}
function sfx(id: string, fallback: string, opts?: { pitch?: number; volume?: number; pan?: number }) {
  GameAudio.play(cue(id, fallback), opts);
}
/** G minor pentatonic steps for the bonk ladder. */
const LADDER = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

export interface BossBashProps {
  readonly visible: boolean;
  readonly boss: BossId;
  readonly bossName: string;
  readonly rideName?: string | null;
  readonly hpLeft: number;
  readonly hpMax: number;
  readonly fighters?: number;
  /** Raid end time (ISO), for the clock on the result. */
  readonly endsAt?: string;
  /** Fighting from home deals a fraction of the damage (the server applies the same rate). */
  readonly damageRate?: number;
  readonly damage?: Pick<RaidDamageWeights, 'per_hit' | 'per_weak_hit'>;
  /** This round's hit cap from the server round (round.max_hits). */
  readonly maxHits?: number;
  /** What the next attack costs and what you have (result screen). */
  readonly next?: BashNext;
  readonly rewards?: BashRewards;
  /** Damage this player can still add to this raid (server per-player cap). */
  readonly capLeft?: number;
  readonly onComplete: (multiplier: number, meta?: Record<string, unknown>) => void;
  readonly onClose: () => void;
  /** Result screen "Attack again": submit this round, then start the next. */
  readonly onAgain?: (meta: Record<string, unknown>) => void;
  readonly onQuit?: (resume: () => void) => void;
  /** Dev capture: autoplay with this skill (0 = off). */
  readonly autoplay?: number;
  /** Dev capture: force the first-time intro. */
  readonly forceIntro?: boolean;
}

export function BossBash({ visible, boss, bossName, rideName, hpLeft, hpMax, fighters = 0, endsAt, damageRate = 1,
  damage: weightsIn, maxHits, next, rewards, capLeft, onComplete, onClose, onAgain, onQuit, autoplay = 0, forceIntro = false }: BossBashProps) {
  const weights = weightsIn ?? DEFAULT_WEIGHTS;
  const skin = BOSS_SKINS[boss];
  const reduced = useReducedGameMotion();
  const shellRef = useRef<GameShellV2Handle>(null);
  const particles = useRef<ParticleHandle>(null);
  const cap = maxHits && maxHits > 0 ? maxHits : Number.POSITIVE_INFINITY;
  const [field, setField] = useState({ w: 0, h: 0 });
  const [intro, setIntro] = useState<'off' | 'rise' | 'teach' | 'go'>('off');
  const [firstTime, setFirstTime] = useState(false);
  const [actors, setActors] = useState<{ popup: Popup; exit: ActorExit }[]>([]);
  const [fx, setFx] = useState<FxLive[]>([]);
  const [held, setHeld] = useState(false);
  const [inkTell, setInkTell] = useState(false);
  const [hud, setHud] = useState({ power: 0, need: 3, headStart: 0, popKey: 0, damage: 0, phase: 'warm' as PhaseId });
  const [dizzy, setDizzy] = useState<{ from: number; until: number } | null>(null);
  const [pose, setPose] = useState<SharkPose>('idle');
  const [face, setFace] = useState<Face>('angry');
  const [hint, setHintState] = useState<'none' | 'tentacle' | 'head' | 'ink'>('none');
  const setHint = (h: 'none' | 'tentacle' | 'head' | 'ink') => { hintRef.current = h; setHintState(h); };
  const [result, setResult] = useState<GameResult | null>(null);
  const [ending, setEnding] = useState(false);
  const [teamHit, setTeamHit] = useState<number | null>(null);

  const engine = useRef<BashState>(createBash(1));
  const seedRef = useRef(Date.now() % 100000);
  const playing = useRef(false), finished = useRef(false);
  const played = useRef(0), lastFrame = useRef(0), frozenUntil = useRef(0), raf = useRef<number | null>(null);
  const fxId = useRef(0), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const firstBlocked = useRef(false);
  const firstBonked = useRef(false), firstSmashed = useRef(false), idleSince = useRef(0), blocks = useRef(0);
  const startHp = useRef(hpLeft), seenHp = useRef(hpLeft);
  const introDone = useRef(false);
  const clock = useSharedValue(0);
  const bossFlinch = useSharedValue(0);
  const bossDrop = useSharedValue(0), bossHit = useSharedValue(0), bossRise = useSharedValue(0), bossShake = useSharedValue(0);
  const cam = useSharedValue(1), fury = useSharedValue(0), hatPop = useSharedValue(0), bossPuff = useSharedValue(0);
  const countdown = useRef(4);
  const hintRef = useRef<'none' | 'tentacle' | 'head' | 'ink'>('none');
  const shake = useShake(), flash = useFlash();

  const addFx = useCallback((item: FxIn, life = 900) => {
    const id = ++fxId.current;
    // One hero wordmark at a time: a new one replaces the old, never stacks. Expiry is one sweeper, not a timer each.
    setFx(list => [...list.filter(f => !(item.t === 'wm' && f.t === 'wm') && !(item.t === 'count' && f.t === 'count')).slice(-12),
      { ...item, id, until: Date.now() + life } as FxLive]);
  }, []);
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setFx(list => {
      const now = Date.now();
      return list.some(f => f.until <= now) ? list.filter(f => f.until > now) : list;
    }), 200);
    return () => clearInterval(id);
  }, [visible]);
  /** Sweep finished timers so the list never grows during a round. */
  const later = (ms: number, f: () => void) => {
    const t = setTimeout(() => { timers.current = timers.current.filter(x => x !== t); f(); }, ms);
    timers.current.push(t);
  };

  // Layout.
  const L = useMemo(() => {
    const { w, h } = field;
    const bossSize = Math.min(w * 0.8, h * 0.42);
    const bossTop = h * 0.11;
    const waterY = h * 0.45;
    const rows = [h * 0.645, h * 0.83];
    const limbH = [h * 0.22, h * 0.27];
    const head = { x: w / 2 + (skin.head[0] - 0.5) * bossSize, y: bossTop + skin.head[1] * bossSize };
    // Dizzy: the boss flops forward onto the water so its head lands in the thumb zone (~57% down).
    return { w, h, bossSize, bossTop, waterY, rows, limbH, head, dropBy: Math.max(0, h * 0.57 - head.y) };
  }, [field, skin.head]);
  const spotXY = (spot: number) => ({ x: L.w * LANES[spot % 3], y: L.rows[spot < 3 ? 0 : 1], h: L.limbH[spot < 3 ? 0 : 1] });
  const scoreTarget = { x: L.w - 46, y: -30 };

  // Audio.
  useEffect(() => { registerStudioAudio('boss'); }, []);
  useGameMusic(visible && !result ? (hud.phase === 'fury' ? 'chris.track1' : 'chris.inventory') : null, { at: 'bar' });

  const syncHud = (s: BashState, popKey?: number) => {
    setHud(h => ({ power: s.power, need: finsNeeded(s, s.ms), headStart: s.headStart, popKey: popKey ?? h.popKey,
      damage: bashScore(s, damageRate, weights), phase: phaseAt(s.ms).id }));
  };

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null; playing.current = false; finished.current = false; played.current = 0;
    seedRef.current = (seedRef.current * 7919 + 17) % 1000003;
    engine.current = createBash(seedRef.current);
    shownTotal.current = 0;
    firstBonked.current = false; firstSmashed.current = false; blocks.current = 0; idleSince.current = 0; introDone.current = false;
    startHp.current = hpLeft; seenHp.current = hpLeft;
    setActors([]); setFx([]); setDizzy(null); setPose('idle'); setFace('angry'); setHint('none'); setResult(null); setEnding(false);
    setTeamHit(null);
    setHud({ power: 0, need: 3, headStart: 0, popKey: 0, damage: 0, phase: 'warm' });
    cancelAnimation(bossShake); cancelAnimation(bossPuff);
    clock.value = 0; bossDrop.value = 0; bossHit.value = 0; bossRise.value = 0; fury.value = 0; cam.value = 1; hatPop.value = 0;
    bossShake.value = 0; bossPuff.value = 0; setInkTell(false); setHeld(false); countdown.current = 4;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpLeft]);

  useEffect(() => {
    if (visible) reset();
    return () => { timers.current.forEach(clearTimeout); if (raf.current !== null) cancelAnimationFrame(raf.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Teammates' damage arriving while you fight (the raid poll lowers hpLeft).
  useEffect(() => {
    if (!visible || finished.current) { seenHp.current = hpLeft; return; }
    const drop = seenHp.current - hpLeft;
    seenHp.current = hpLeft;
    if (drop > 0 && playing.current) {
      setTeamHit(drop);
      later(1800, () => setTeamHit(null));
      if (L.w) addFx({ t: 'burst', src: BASH_ART.sparkle, x: L.w * 0.86, y: L.bossTop + 30, size: 60 }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpLeft, visible]);

  // --- Event -> juice ---------------------------------------------------------
  const shownTotal = useRef(0);
  /** The exact server total moved by this hit (the home rate rounds once, on the total). */
  const dealt = () => {
    const total = bashScore(engine.current, damageRate, weights);
    const d = total - shownTotal.current;
    shownTotal.current = total;
    return d;
  };
  const apply = (events: BashEvent[]) => {
    const s = engine.current;
    for (const e of events) {
      switch (e.type) {
        case 'spawn':
          setActors(list => [...list.filter(a => a.popup.id !== e.popup.id), { popup: e.popup, exit: null }]);
          if (e.popup.kind === 'puffer') sfx('bo_feint_trill', 'fx.whoosh', { volume: 0.35, pitch: 7 });
          break;
        case 'sink': case 'bonk': case 'ouch': {
          const exit: ActorExit = e.type === 'bonk' ? 'bonk' : e.type === 'ouch' ? 'ouch' : s.dizzy ? 'dive' : 'sink';
          const id = e.popup.id;
          setActors(list => list.map(a => (a.popup.id === id ? { ...a, exit } : a)));
          later(exit === 'ouch' ? 700 : 420, () => setActors(list => list.filter(a => a.popup.id !== id)));
          if (e.type === 'bonk') onBonk(e);
          if (e.type === 'ouch') onOuch(e.popup);
          break;
        }
        case 'dizzy': onDizzy(e.from, e.until); break;
        case 'smash': onSmash(e); break;
        case 'shakeOff': onShakeOff(); break;
        case 'clank': onClank(); break;
        case 'inkTell': onInkTell(); break;
        case 'inkBlock': onInkBlock(e); break;
        case 'inked': onInked(); break;
        case 'splash': onSplash(e.lane); break;
        case 'phase': onPhase(e.phase); break;
      }
    }
    syncHud(engine.current, events.some(e => e.type === 'ouch' && e.lostFins > 0) ? Date.now() : undefined);
  };

  /** Show a face for a moment, then go back to angry (never over a dizzy head). */
  const flashFace = (f: Face, ms: number) => {
    setFace(f);
    later(ms, () => setFace(cur => (cur === f ? (engine.current.dizzy ? 'dizzy' : 'angry') : cur)));
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const onBonk = (e: Extract<BashEvent, { type: 'bonk' }>) => {
    const p = spotXY(e.popup.spot);
    const tipY = p.y - p.h * 0.78;
    firstBonked.current = true; idleSince.current = played.current;
    if (hintRef.current === 'tentacle') setHint('none');
    addFx({ t: 'burst', src: BASH_ART.impact, x: p.x, y: tipY, size: p.h * 0.55, spin: true }, 420);
    addFx({ t: 'burst', src: BASH_ART.splash, x: p.x, y: p.y - 18, size: p.h * 0.5 }, 420);
    const d = dealt();
    addFx({ t: 'num', text: e.counted ? `+${d}` : 'MAX', x: p.x, y: tipY - 20, big: false }, 900);
    if (!reduced) {
      particles.current?.burst({ x: p.x, y: tipY, preset: 'burst', count: 6, colors: [BRAND.white, BRAND.goldLight, '#a0edff'], speed: 0.8 });
      bossFlinch.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 160 }));
    }
    const step = LADDER[Math.min(LADDER.length - 1, e.streak - 1)];
    sfx('bo_hit', 'fx.hit', { pitch: step, volume: 0.95, pan: (LANES[e.popup.spot % 3] - 0.5) * 1.2 });
    haptic('tapLight');
    if (e.streak === 6 || e.streak === 12 || e.streak === 20) {
      addFx({ t: 'wm', wm: e.streak === 6 ? 'nice' : e.streak === 12 ? 'great' : 'superb' }, 900);
      setPose('cheer'); later(700, () => setPose(cur => (cur === 'cheer' ? 'idle' : cur)));
    }
  };

  const onOuch = (popup: Popup) => {
    const p = spotXY(popup.spot);
    addFx({ t: 'burst', src: BASH_ART.puff, x: p.x, y: p.y - p.h * 0.35, size: p.h * 0.7 }, 420);
    addFx({ t: 'bubble', text: 'OUCH!', x: p.x, y: p.y - p.h * 0.85, tone: 'red' }, 800);
    if (!reduced) shake.shake(5, 160);
    setPose('bonked'); later(950, () => setPose('idle'));
    flashFace('laugh', 900);
    sfx('bo_feint_giggle', 'fx.nopeShort', { volume: 0.9 });
    haptic('failBuzz');
  };

  const onDizzy = (from: number, until: number) => {
    setDizzy({ from, until });
    setFace('dizzy');
    setInkTell(false); cancelAnimation(bossPuff); bossPuff.value = withTiming(0, { duration: 100 });
    bossDrop.value = reduced ? withTiming(1, { duration: 120 }) : withTiming(1, { duration: 150, easing: Easing.in(Easing.quad) });
    if (!reduced) {
      later(150, () => {
        addFx({ t: 'burst', src: BASH_ART.splash, x: L.w * 0.3, y: L.waterY + 30, size: L.w * 0.3 }, 420);
        addFx({ t: 'burst', src: BASH_ART.splash, x: L.w * 0.7, y: L.waterY + 30, size: L.w * 0.3 }, 420);
        shake.shake(6, 160);
      });
      bossShake.value = withDelay(160, withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(-1, { duration: 260 })), -1, true));
    }
    addFx({ t: 'bubble', text: 'SMASH IT!', x: L.w / 2, y: Math.min(L.h * 0.8, L.head.y + L.dropBy + L.bossSize * 0.3), tone: 'gold' }, 1000);
    if (!firstSmashed.current) setHint('head');
    sfx('bo_finisher_ready', 'fx.whooshRev', { volume: 0.9 });
    later(150, () => sfx('bo_pin_slam_kraken', 'fx.hit', { pitch: -5, volume: 1 }));
    haptic('hitMedium');
  };

  const endDizzy = () => {
    setDizzy(null);
    setFace('angry');
    cancelAnimation(bossShake); bossShake.value = withTiming(0, { duration: 120 });
    bossDrop.value = reduced ? withTiming(0, { duration: 120 }) : withSpring(0, { damping: 12, stiffness: 160 });
  };

  const onSmash = (e: Extract<BashEvent, { type: 'smash' }>) => {
    firstSmashed.current = true; setHint('none');
    endDizzy();
    flashFace('hurt', 650);
    const x = L.head.x, y = L.head.y + L.dropBy;
    frozenUntil.current = Date.now() + SMASH_STOP_MS;
    addFx({ t: 'burst', src: BASH_ART.impact, x, y, size: L.bossSize * 0.7, spin: true }, 500);
    addFx({ t: 'num', text: `+${dealt()}`, x, y: y - 10, big: true }, 1300);
    addFx({ t: 'wm', wm: e.perfect ? 'perfect' : e.final ? 'superb' : 'great' }, 1000);
    if (!reduced) {
      particles.current?.burst({ x, y, preset: 'burst', count: 16, colors: [BRAND.gold, BRAND.white, BRAND.goldLight], speed: 1.3 });
      shake.shake(e.perfect ? 10 : 7, 200);
      if (e.perfect) flash.flash(0.18, 120);
      cam.value = withSequence(withTiming(1.07, { duration: 60 }), withSpring(1, { damping: 10, stiffness: 180 }));
      bossHit.value = withSequence(withTiming(1, { duration: 30 }), withDelay(SMASH_STOP_MS, withTiming(0, { duration: 150 })));
      if (skin.hat) { hatPop.value = 0; hatPop.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }); }
    }
    setPose('cheer'); later(900, () => setPose(cur => (cur === 'cheer' ? 'idle' : cur)));
    sfx('bo_crit', 'fx.hit', { pitch: e.perfect ? 7 : 2, volume: 1 });
    sfx('bo_kraken_slam', 'fx.firework', { volume: 0.8 });
    haptic(e.perfect ? 'comboHeavy' : 'hitMedium');
    // Knocked out by your own hit: the shared HP is gone.
    const total = bashScore(engine.current, damageRate, weights);
    if (hpLeft > 0 && total >= hpLeft) addFx({ t: 'wm', wm: 'knockout' }, 1400);
  };

  const onShakeOff = () => {
    endDizzy();
    flashFace('laugh', 800);
    addFx({ t: 'bubble', text: 'TOO SLOW!', x: L.w / 2, y: L.head.y - 10, tone: 'white' }, 900);
    if (!reduced) bossRise.value = withSequence(withTiming(-1, { duration: 120 }), withSpring(0, { damping: 8 }));
    sfx('bo_opening_close', 'fx.nopeShort', { volume: 0.8 });
    haptic('warning');
  };

  const onClank = () => {
    blocks.current += 1;
    if (!reduced) bossRise.value = withSequence(withTiming(-0.3, { duration: 60 }), withSpring(0, { damping: 9 }));
    sfx('bo_guard_kraken', 'ui.tap', { volume: 0.5 });
    haptic('hitSoft');
    if (blocks.current % 3 === 1) {
      addFx({ t: 'bubble', text: `Bonk the ${skin.limbWord}!`, x: L.w / 2, y: L.waterY + 6, tone: 'white' }, 1100);
      setHint('tentacle');
    }
  };

  const onInkTell = () => {
    setInkTell(true);
    flashFace('roar', 1150);
    if (!reduced) bossPuff.value = withRepeat(withSequence(withTiming(1, { duration: 280 }), withTiming(0.6, { duration: 200 })), -1, false);
    addFx({ t: 'bubble', text: 'BLOCK IT!', x: L.w / 2, y: L.waterY - 26, tone: 'red' }, 1150);
    if (!firstBlocked.current) setHint('ink');
    sfx('bo_laser_charge', 'fx.whooshRev', { volume: 0.9 });
    haptic('warning');
  };
  const endInkTell = () => {
    setInkTell(false);
    cancelAnimation(bossPuff); bossPuff.value = withTiming(0, { duration: 140 });
    if (hintRef.current === 'ink') setHint('none');
  };
  const onInkBlock = (e: Extract<BashEvent, { type: 'inkBlock' }>) => {
    firstBlocked.current = true;
    endInkTell();
    const x = L.head.x, y = L.head.y + L.bossSize * 0.22;
    addFx({ t: 'burst', src: BASH_ART.impact, x, y, size: L.bossSize * 0.5, spin: true }, 420);
    addFx({ t: 'bubble', text: 'BLOCKED!', x, y: y + 40, tone: 'gold' }, 900);
    addFx({ t: 'num', text: e.counted ? `+${dealt()}` : 'MAX', x, y: y - 30, big: false }, 900);
    flashFace('hurt', 500);
    if (!reduced) bossRise.value = withSequence(withTiming(-0.5, { duration: 70 }), withSpring(0, { damping: 9 }));
    sfx('bo_perfect_clang', 'ui.confirm', { volume: 1 });
    haptic('hitMedium');
  };
  const onInked = () => {
    endInkTell();
    flashFace('laugh', 900);
    const spots = [[0.25, 0.62], [0.68, 0.7], [0.45, 0.86]];
    spots.forEach(([fx0, fy0], i) => later(i * 70, () => addFx({ t: 'ink', x: L.w * fx0, y: L.h * fy0, size: L.w * 0.42, rot: (i - 1) * 20 }, INKED_MS)));
    if (!reduced) shake.shake(5, 160);
    sfx('bo_feint_giggle', 'fx.nopeShort', { volume: 0.9 });
    haptic('failBuzz');
  };
  const onSplash = (lane: number) => {
    const p = spotXY(lane + 3);
    addFx({ t: 'burst', src: BASH_ART.splash, x: p.x, y: p.y - 12, size: 46 }, 380);
  };

  const onPhase = (phase: PhaseId) => {
    flashFace('roar', 900);
    if (phase === 'angry') {
      if (!reduced) { shake.shake(6, 220); bossRise.value = withSequence(withTiming(-1.4, { duration: 160 }), withSpring(0, { damping: 9 })); }
      addFx({ t: 'bubble', text: 'FASTER!', x: L.w / 2, y: L.waterY - 30, tone: 'gold' }, 1000);
      sfx('bo_phase_kraken', 'fx.whoosh', { volume: 0.9 });
    } else if (phase === 'fury') {
      addFx({ t: 'wm', wm: 'fury' }, 1100);
      fury.value = withTiming(1, { duration: 500 });
      if (!reduced) shake.shake(8, 260);
      sfx('bo_phase_up', 'fx.reveal', { volume: 1 });
      haptic('warning');
    }
  };

  // --- The loop ----------------------------------------------------------------
  const buildResult = (s: BashState): GameResult => {
    const total = bashScore(s, damageRate, weights);
    return {
      score: total,
      stars: bashStars(s, weights),
      message: total > 0 ? 'NICE HIT!' : 'TRY AGAIN',
      meta: { hits: s.hits, weak_hits: s.weak, duration_ms: Math.round(Math.min(ROUND_MS, Math.max(12000, played.current))),
        stars: bashStars(s, weights), bonks: s.bonks, smashes: s.smashes, perfects: s.perfects, ouches: s.ouches, blocks: s.blocks,
        best_streak: s.bestStreak, game: 'boss_bash_v2' },
    };
  };
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    playing.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    const s = engine.current;
    setEnding(true);
    setActors(list => list.map(a => ({ ...a, exit: 'sink' as ActorExit })));
    // Always settle: read the live engine, never a stale render (round 1 left the ring up after the bell).
    endDizzy(); endInkTell(); setHint('none');
    cancelAnimation(bossShake); bossShake.value = 0;
    setFx(list => list.filter(f => f.t === 'num'));
    addFx({ t: 'wm', wm: 'finish' }, 1000);
    bossRise.value = reduced ? withTiming(2.2, { duration: 200 }) : withDelay(250, withTiming(2.2, { duration: 550, easing: Easing.in(Easing.back(1.4)) }));
    sfx('bo_ko_kraken', 'fx.reveal', { volume: 0.9 });
    haptic('success');
    later(reduced ? 400 : 1000, () => setResult(buildResult(s)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damageRate, weights, reduced]);

  const frame = useCallback(() => {
    if (!playing.current) return;
    const now = Date.now();
    const dt = Math.min(250, Math.max(0, now - lastFrame.current));
    lastFrame.current = now;
    if (now >= frozenUntil.current) played.current = Math.min(ROUND_MS, played.current + dt);
    clock.value = played.current;
    const r = tick(engine.current, played.current);
    engine.current = r.state;
    if (r.events.length) applyRef.current(r.events);
    // A first-timer who has not bonked yet gets the pointing hand.
    if (!firstBonked.current && played.current > 900 && hintRef.current === 'none' && engine.current.up.length) setHint('tentacle');
    // The last three seconds count down out loud (FINISH! only at the bell).
    const left = Math.ceil((ROUND_MS - played.current) / 1000);
    if (left <= 3 && left >= 1 && left < countdown.current) {
      countdown.current = left;
      addFx({ t: 'count', text: String(left) }, 900);
      GameAudio.play('ui.select', { volume: 0.9, pitch: (3 - left) * 2 });
      haptic('tickSelection');
    }
    if (played.current >= ROUND_MS) { finishRef.current(); return; }
    raf.current = requestAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const run = useCallback(() => {
    if (!visible || playing.current || finished.current || intro !== 'off' || !introDone.current) return;
    playing.current = true;
    lastFrame.current = Date.now();
    raf.current = requestAnimationFrame(frame);
  }, [visible, frame, intro]);
  const halt = useCallback(() => {
    playing.current = false;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);
  // Keep the loop's closure fresh (the hint state changes).
  useEffect(() => {
    if (playing.current && raf.current !== null) { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(frame); }
  }, [frame]);

  // --- Intro: the boss rises, a 3-picture lesson the first time, GO --------------
  const startIntro = useCallback(() => {
    if (finished.current) return;
    void AsyncStorage.getItem(SEEN_KEY).catch(() => null).then(seen => {
      const first = forceIntro || !seen;
      setFirstTime(first);
      setIntro('rise');
      bossRise.value = 2.2;
      bossRise.value = reduced ? withTiming(0, { duration: 150 }) : withSpring(0, { damping: 10, stiffness: 90 });
      flashFace('roar', 1100);
      sfx(`bo_enter_${boss === 'kraken' ? 'kraken' : boss === 'robo_shark' ? 'robo' : 'ghost'}`, 'fx.whoosh', { volume: 1 });
      if (!reduced) later(380, () => { shake.shake(7, 260); haptic('hitMedium'); });
      later(reduced ? 150 : first ? 600 : 350, () => setIntro('teach'));
      if (!first) later(reduced ? 700 : 1100, goNow);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, boss, forceIntro]);
  const goNow = useCallback(() => {
    setIntro(cur => {
      if (cur === 'off' || cur === 'go') return cur;
      void AsyncStorage.setItem(SEEN_KEY, '1').catch(() => undefined);
      later(380, () => { introDone.current = true; setIntro('off'); });
      sfx('sh_go_horn', 'ui.confirm', { volume: 0.9 });
      haptic('tickSelection');
      return 'go';
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (intro === 'off' && introDone.current && visible && !finished.current && !playing.current) run(); }, [intro, run, visible]);

  // --- Input ---------------------------------------------------------------------
  const tapLane = (lane: number) => {
    if (!playing.current) return;
    const s = engine.current;
    // Dizzy (flopped on the water) or puffed up for ink: the boss is the target, anywhere you tap.
    if (s.dizzy || s.ink) { tapHead(); return; }
    const popup = s.up.find(p => p.spot % 3 === lane);
    const r = popup ? tapPopup(s, popup.id, played.current, cap, weights) : tapWater(s, lane, played.current);
    engine.current = r.state;
    apply(r.events);
  };
  const tapHead = () => {
    if (!playing.current) return;
    const r = tapBoss(engine.current, played.current, cap, weights);
    engine.current = r.state;
    apply(r.events);
  };

  // Dev autoplay for captures: reads the same state a player sees.
  useEffect(() => {
    if (!__DEV__ || !autoplay || !visible) return;
    const plan = new Map<number, number>();
    const id = setInterval(() => {
      if (!playing.current) return;
      const s = engine.current, ms = played.current;
      if (s.dizzy) { if (ms > s.dizzy.from + 300 + (1 - autoplay) * 500) tapHead(); return; }
      if (s.ink) { if (autoplay > 0.6 && ms > s.ink.from + 350) tapHead(); }
      for (const p of s.up) {
        if (!plan.has(p.id)) plan.set(p.id, p.kind === 'puffer' ? (Math.random() < (1 - autoplay) * 0.6 ? p.at + 500 : Infinity) : p.at + 260 + (1 - autoplay) * 500);
        if (ms >= (plan.get(p.id) ?? Infinity)) { tapLane(p.spot % 3); break; }
      }
    }, 60);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, visible]);

  // --- Styles ----------------------------------------------------------------------
  const bossStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: bossDrop.value * L.dropBy + bossRise.value * L.bossSize * 0.32 },
      { rotate: `${bossShake.value * 6 * bossDrop.value}deg` },
      { scaleX: 1 + bossHit.value * 0.05 + bossFlinch.value * 0.025 + bossPuff.value * 0.09 },
      { scaleY: 1 - bossHit.value * 0.07 - bossFlinch.value * 0.03 + bossPuff.value * 0.06 },
    ],
  }));
  const bossFlash = useAnimatedStyle(() => ({ opacity: bossHit.value * 0.6 }));
  const camStyle = useAnimatedStyle(() => ({ transform: [{ scale: cam.value }] }));
  const furyStyle = useAnimatedStyle(() => ({ opacity: fury.value * 0.22 }));
  const timerStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, 1 - clock.value / ROUND_MS) * 100}%` as `${number}%`,
    backgroundColor: clock.value > ROUND_MS - 3000 ? BRAND.red : BRAND.gold }));
  const hatStyle = useAnimatedStyle(() => {
    // A hop and a wobble in place: the hat never leaves the head (round 1 flew it into the HUD).
    const v = hatPop.value;
    const up = v < 1 && v > 0 ? Math.sin(v * Math.PI) : 0;
    return { transform: [{ translateY: -up * L.bossSize * 0.06 }, { rotate: `${up * 14 * Math.sin(v * 9)}deg` }] };
  });

  const hpNow = Math.max(0, hpLeft - hud.damage);
  // Every face is mounted once and cross-cut by opacity: no decode hitch on a swap.
  const faces = ([['angry', skin.body], ['dizzy', skin.dizzy], ['hurt', skin.hurt], ['laugh', skin.laugh], ['roar', skin.roar]] as const)
    .filter((f): f is readonly [Face, number] => f[1] !== null);
  const shownFace: Face = faces.some(f => f[0] === face) ? face : 'angry';
  const bodySrc = faces.find(f => f[0] === shownFace)?.[1] ?? skin.body;
  const sharkSrc = BASH_ART.shark[pose];
  const finSize = Math.min(54, L.w * 0.13);

  const renderResults = (args: ShellResultsArgs) => (
    <BashResults args={args} bossName={bossName} boss={boss} rideName={rideName ?? null} startHp={hpLeft} capLeft={capLeft}
      hpMax={hpMax} damage={args.result.score} rate={damageRate} meta={args.result.meta ?? {}} fighters={fighters}
      endsAt={endsAt} next={next} rewards={rewards}
      onAgain={onAgain && args.result.meta ? () => onAgain(args.result.meta!) : undefined} />
  );

  return (
    <GameShellV2
      ref={shellRef}
      visible={visible}
      title="Boss Fight"
      subtitle={rideName ? `${bossName} at ${rideName}` : bossName}
      score={hud.damage}
      result={result}
      starMultipliers={{ 0: 0, 1: 1, 2: 1, 3: 1 }}
      countdownStyle="none"
      resultsScrim="light"
      renderResults={renderResults}
      gameId="boss_bash"
      onStart={startIntro}
      onPause={() => { halt(); setHeld(true); }}
      onResume={() => { setHeld(false); if (introDone.current) run(); }}
      hideHeaderScore={!!result}
      onWrapUp={() => {
        // Boarding the ride mid-round keeps what you earned (the server needs at least 12 s since FIGHT, which the intro covers).
        halt();
        if (played.current < 9000 || engine.current.hits <= 0) return null;
        finished.current = true;
        return buildResult(engine.current);
      }}
      onComplete={onComplete}
      onClose={onClose}
      onQuit={onQuit}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, shake.style]}
        onLayout={(e: LayoutChangeEvent) => { setField({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }); }}>
        {L.w > 0 && <Animated.View style={[StyleSheet.absoluteFill, camStyle]}>
          <Image source={BASH_ART.lagoon} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />

          {/* The boss, rising out of the lagoon. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: (L.w - L.bossSize) / 2, top: L.bossTop, width: L.bossSize, height: L.bossSize,
            zIndex: dizzy ? 3 : 1 }}>
            <Animated.View style={[StyleSheet.absoluteFill, bossStyle]}>
              {faces.map(([id, src]) => <Image key={id} source={src} contentFit="contain"
                style={[StyleSheet.absoluteFill, { opacity: id === shownFace ? (skin.ghostly ? 0.92 : 1) : 0 }]} />)}
              <Animated.View style={[StyleSheet.absoluteFill, bossFlash]}>
                <Image source={bodySrc} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#ffffff" />
              </Animated.View>
              {skin.hat && <Animated.View style={[{ position: 'absolute', left: L.bossSize * 0.22, top: -L.bossSize * 0.02,
                width: L.bossSize * 0.56, height: L.bossSize * 0.42 }, hatStyle]}>
                <Image source={BASH_ART.hat} style={StyleSheet.absoluteFill} contentFit="contain" />
              </Animated.View>}
              {dizzy && <DizzyStars x={L.bossSize * skin.head[0]} y={L.bossSize * 0.08} r={L.bossSize * 0.24} reduced={reduced} />}
            </Animated.View>
          </View>

          {/* The water in front of the boss (hides its lower half). */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 2 }]}>
            <WaterFront width={L.w} height={L.h} top={L.waterY} reduced={reduced} running={visible && !result && !held} />
          </View>
          <Image source={BASH_ART.beach} pointerEvents="none" contentFit="cover" contentPosition="bottom"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: L.w * 0.66, zIndex: 2 }} />
          <Animated.View pointerEvents="none" style={[styles.fury, { height: L.waterY }, furyStyle]} />

          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 4 }]}>
          {/* Pop-ups. */}
          {actors.map(({ popup, exit }) => {
            const p = spotXY(popup.spot);
            return <PopupActor key={popup.id} kind={popup.kind} x={p.x} baseY={p.y} height={p.h} limb={skin.limb}
              limbAspect={skin.limbAspect} exit={exit} reduced={reduced} ghostly={skin.ghostly}
              hint={hint === 'tentacle' && !exit && popup.kind === 'tentacle' && actors.find(a => !a.exit && a.popup.kind === 'tentacle')?.popup.id === popup.id} />;
          })}

          {dizzy && <DizzyTarget x={L.head.x} y={L.head.y + L.dropBy} size={L.bossSize * 0.34} from={dizzy.from} until={dizzy.until}
            clock={clock} reduced={reduced} />}
          {dizzy && hint === 'head' && <TapHand x={L.head.x + 18} y={L.head.y + L.dropBy + 4} reduced={reduced} size={72} />}
          {inkTell && hint === 'ink' && <TapHand x={L.head.x + 18} y={L.head.y + L.bossSize * 0.18} reduced={reduced} size={72} />}

          {/* Input: the boss on top, three lanes of water below. Dizzy or puffed up, every tap goes to the boss. */}
          <Pressable accessibilityRole="button"
            accessibilityLabel={dizzy ? `Smash ${bossName} now` : inkTell ? `Block the ink: tap ${bossName}` : `${bossName}. Bonk the ${skin.limbWord} first`}
            onPressIn={tapHead} style={{ position: 'absolute', left: L.w * 0.1, width: L.w * 0.8, top: L.bossTop, height: L.waterY - L.bossTop }} />
          {[0, 1, 2].map(lane => <Pressable key={lane} accessibilityRole="button"
            accessibilityLabel={`${['Left', 'Middle', 'Right'][lane]} water. Bonk what pops up here, never the pufferfish`}
            onPressIn={() => tapLane(lane)}
            style={{ position: 'absolute', left: (L.w / 3) * lane, width: L.w / 3, top: L.waterY, bottom: 0 }} />)}

          {/* Shark cheerleader on the beach. */}
          <View pointerEvents="none" style={[styles.shark, { width: L.h * 0.13, height: L.h * 0.16 }]}>
            <Image source={sharkSrc} style={StyleSheet.absoluteFill} contentFit="contain" />
          </View>

          {/* Effects. */}
          {fx.map(f => f.t === 'num' ? <DamageNumber key={f.id} text={f.text} x={f.x} y={f.y} big={f.big} toX={scoreTarget.x} toY={scoreTarget.y} reduced={reduced} />
            : f.t === 'burst' ? (reduced ? null : <Burst key={f.id} src={f.src} x={f.x} y={f.y} size={f.size} spin={f.spin} reduced={reduced} />)
              : f.t === 'wm' ? <Wordmark key={f.id} id={f.wm} x={L.w / 2} y={L.h * 0.2} width={L.w * 0.7} reduced={reduced} />
                : f.t === 'ink' ? <InkSplat key={f.id} x={f.x} y={f.y} size={f.size} rot={f.rot} life={INKED_MS} reduced={reduced} />
                  : f.t === 'count' ? <CountBeat key={f.id} text={f.text} x={L.w / 2} y={L.h * 0.33} reduced={reduced} />
                    : <Bubble key={f.id} text={f.text} x={f.x} y={f.y} tone={f.tone} reduced={reduced} />)}
          {!reduced && <ParticleField ref={particles} width={L.w} height={L.h} paused={held} />}
          </View>
        </Animated.View>}

        {/* HUD: shared HP, seconds left and the round bar on top; the fins at the bottom. */}
        {L.w > 0 && <View pointerEvents="none" style={styles.hud}>
          <View style={styles.hpRow}>
            <Text style={styles.hpName} numberOfLines={1}>{bossName.toUpperCase()}</Text>
            <Text style={styles.hpCount} numberOfLines={1}>{hpNow.toLocaleString()} HP left{fighters > 0 ? `  ·  ${fighters} fighting` : ''}</Text>
          </View>
          <View style={styles.hpTrack}>
            <View style={[styles.hpYours, { width: `${Math.min(100, (Math.max(0, hpLeft) / Math.max(1, hpMax)) * 100)}%` }]} />
            <View style={[styles.hpFill, { width: `${Math.min(100, (hpNow / Math.max(1, hpMax)) * 100)}%` }]} />
          </View>
          <View style={styles.clockRow}>
            <View style={styles.timerTrack}><Animated.View style={[styles.timerFill, timerStyle]} /></View>
            <SecondsLeft clock={clock} />
          </View>
          <View style={styles.chipRow}>
            {damageRate < 1 ? <View style={styles.homeChip}><Text style={styles.homeText}>From home: {Math.round(damageRate * 100)}% power</Text></View> : <View />}
            {teamHit !== null && <View style={styles.teamChip}><Text style={styles.teamText}>Your team hit it! -{teamHit.toLocaleString()}</Text></View>}
          </View>
        </View>}
        {L.w > 0 && !result && <View pointerEvents="none" style={styles.finDock}>
          <FinMeter power={hud.power} need={hud.need} headStart={hud.headStart} popKey={hud.popKey} ready={!!dizzy} size={finSize} reduced={reduced} />
        </View>}
        {!reduced && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, flash.style]} />}

        {intro !== 'off' && L.w > 0 && <IntroCard phase={intro} firstTime={firstTime} skin={skin} limbWord={skin.limbWord}
          reduced={reduced} onGo={goNow} />}
        {ending && null}
      </Animated.View>
    </GameShellV2>
  );
}

/** Three pictures, one word each. First time: wait for GO. After that: auto. */
function IntroCard({ phase, firstTime, skin, limbWord, reduced, onGo }: {
  phase: 'rise' | 'teach' | 'go'; firstTime: boolean; skin: (typeof BOSS_SKINS)[BossId]; limbWord: string; reduced: boolean; onGo: () => void;
}) {
  const p = useSharedValue(0);
  const go = useSharedValue(0);
  useEffect(() => {
    if (phase === 'teach') p.value = reduced ? withTiming(1, { duration: 120 }) : withSpring(1, { damping: 12, stiffness: 160 });
    if (phase === 'go') {
      p.value = withTiming(0, { duration: 220 });
      go.value = reduced ? withTiming(1, { duration: 80 }) : withSequence(withSpring(1, { damping: 7, stiffness: 300 }), withTiming(1.4, { duration: 220 }));
    }
  }, [phase, p, go, reduced]);
  const card = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 60 }] }));
  const goStyle = useAnimatedStyle(() => ({ opacity: go.value > 1 ? 2.4 - go.value * 1.7 : go.value, transform: [{ scale: 0.5 + go.value * 0.6 }] }));
  return (
    <Pressable style={[StyleSheet.absoluteFill, styles.introWrap]} onPress={onGo} accessibilityRole="button"
      accessibilityLabel={`How to win: bonk the ${limbWord}, fill 3 fins, then smash the dizzy head. Not the pufferfish. Tap to start.`}>
      <Animated.View style={[styles.introCard, card]}>
        <View style={styles.steps}>
          <Step label="BONK" n={1}><Image source={skin.limb} style={{ width: 30, height: 68 }} contentFit="contain" />
            <Image source={BASH_ART.tapHand} style={styles.stepHand} contentFit="contain" /></Step>
          <Arrow />
          <Step label="FILL" n={2}><View style={{ flexDirection: 'row', gap: 2 }}>{[0, 1, 2].map(i =>
            <View key={i} style={styles.miniFin}><Image source={BASH_ART.finFull} style={{ width: 15, height: 15 }} contentFit="contain" /></View>)}</View></Step>
          <Arrow />
          <Step label="SMASH" n={3}><Image source={skin.dizzy ?? skin.body} style={{ width: 66, height: 66 }} contentFit="contain" />
            <View style={styles.stepTarget} /></Step>
        </View>
        <View style={styles.noPuffer}>
          <Image source={BASH_ART.puffer} style={{ width: 40, height: 36 }} contentFit="contain" />
          <View style={styles.noSlash} />
          <Text style={styles.noText}>Not the spiky fish!</Text>
        </View>
        <View style={[styles.goBtn, !firstTime && styles.goBtnQuiet]}>
          <Text style={styles.goText}>{firstTime ? 'TAP TO START' : 'GET READY...'}</Text>
        </View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.goWord, goStyle]}>
        <Text style={styles.goWordText}>GO!</Text>
      </Animated.View>
    </Pressable>
  );
}
function Step({ label, n, children }: { label: string; n: number; children: React.ReactNode }) {
  return <View style={styles.step}>
    <View style={styles.stepPic}>{children}</View>
    <View style={styles.stepLabelRow}><View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepLabel}>{label}</Text></View>
  </View>;
}
function Arrow() {
  return <View style={styles.arrow}><View style={styles.arrowHead} /></View>;
}

const styles = StyleSheet.create({
  fury: { position: 'absolute', left: 0, right: 0, top: 0, backgroundColor: BRAND.navy },
  shark: { position: 'absolute', left: 8, bottom: 6 },
  hud: { position: 'absolute', top: 8, left: 12, right: 12 },
  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 2 },
  hpName: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  hpCount: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  hpTrack: { marginTop: 3, height: 18, borderRadius: 9, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.sky, overflow: 'hidden' },
  hpYours: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.gold },
  hpFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.red },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  chipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  secs: { minWidth: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: BRAND.white, borderRadius: 12,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 6, paddingVertical: 1 },
  secsText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, padding: 0, minWidth: 22, textAlign: 'center' },
  timerTrack: { flex: 1, height: 10, borderRadius: 4, borderWidth: 2, borderColor: BRAND.navy, backgroundColor: 'rgba(255,255,255,0.7)', overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 2 },
  teamChip: { marginTop: 6, backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 2 },
  teamText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  homeChip: { marginTop: 6, backgroundColor: 'rgba(5,52,110,0.75)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  homeText: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.white },
  finDock: { position: 'absolute', bottom: 14, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 3, borderColor: BRAND.navy },
  introWrap: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 26, backgroundColor: 'rgba(8,56,128,0.18)' },
  introCard: { width: '92%', backgroundColor: BRAND.cream, borderRadius: 26, borderWidth: 4, borderColor: BRAND.navy, padding: 14, alignItems: 'center' },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  step: { alignItems: 'center', width: 88 },
  stepPic: { width: 84, height: 84, borderRadius: 20, backgroundColor: BRAND.sky, borderWidth: 3, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  miniFin: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center' },
  stepHand: { position: 'absolute', width: 34, height: 44, right: 6, bottom: 2 },
  stepTarget: { position: 'absolute', width: 34, height: 34, borderRadius: 17, borderWidth: 4, borderColor: BRAND.gold, top: 12 },
  stepLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.white },
  stepLabel: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  arrow: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 26 },
  arrowHead: { width: 0, height: 0, borderTopWidth: 8, borderBottomWidth: 8, borderLeftWidth: 11, borderTopColor: 'transparent',
    borderBottomColor: 'transparent', borderLeftColor: BRAND.navy },
  noPuffer: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8, backgroundColor: BRAND.white, borderRadius: 16,
    borderWidth: 2, borderColor: BRAND.red, paddingVertical: 4, paddingHorizontal: 10 },
  noSlash: { position: 'absolute', left: 8, width: 44, height: 5, borderRadius: 3, backgroundColor: BRAND.red, transform: [{ rotate: '-35deg' }] },
  noText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.red },
  goBtn: { marginTop: 12, minHeight: 56, alignSelf: 'stretch', borderRadius: 18, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.navy,
    borderBottomWidth: 6, borderBottomColor: BRAND.goldLip, alignItems: 'center', justifyContent: 'center' },
  goBtnQuiet: { backgroundColor: BRAND.sky, borderBottomColor: BRAND.skyDeep },
  goText: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, letterSpacing: 0.5 },
  goWord: { position: 'absolute', top: '30%', alignSelf: 'center' },
  goWordText: { fontFamily: 'Shark', fontSize: 92, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 6 }, textShadowRadius: 0 },
});

/** Seconds left, as a number kids can read (the bar alone is too subtle). */
function SecondsLeft({ clock }: { clock: SharedValue<number> }) {
  const [secs, setSecs] = useState(Math.ceil(ROUND_MS / 1000));
  useAnimatedReaction(() => Math.max(0, Math.ceil((ROUND_MS - clock.value) / 1000)), (v, prev) => {
    if (v !== prev) runOnJS(setSecs)(v);
  });
  return <View style={[styles.secs, secs <= 3 && { backgroundColor: BRAND.gold }]} accessibilityLabel={`${secs} seconds left`}>
    <GameIcon name="timer" size={16} /><Text style={styles.secsText}>{secs}</Text>
  </View>;
}
