/**
 * The mystery box opening (and the Pin of the Day catch): the best 3 seconds
 * on the Pins page.
 *
 * Box: it drops in and waits for your tap (you open it, like tearing a pack).
 * Tap: it shakes harder and harder while a glow builds; the glow is the
 * rarity tell (sky for a regular pin, gold with turning rays for the chaser).
 * The chaser also gets a held breath: the screen dims, two heartbeats, a heavy
 * buzz, then the pop punches the whole stage. Pop: flash, a white ring burst,
 * the lid flies off, the pin flips up out of the box with confetti and settles
 * big and shiny on a spotlight. One tag: NEW! or "Extra! Trade it". The
 * chaser gets its banner and its serial number stamped in (#3), plus
 * "Guaranteed!" when the meter made it happen.
 *
 * Catch: no box. A gold seal spins in and rumbles, then bursts into the park
 * pin, the seal stamps onto it, and a ticket banner says where and when
 * (and how many found it before you). Rare pins get the gold treatment.
 *
 * Tap anywhere to speed up: the payoff (sound, haptic, flash, confetti) still
 * plays once per pin; nothing can skip into a broken state, the server has
 * granted everything before this plays. No buy button lives in here.
 * Bundles: new pins first, extras next, the chaser last; one tap per box
 * (Next drops the next box and opens it), then everything on a cork board.
 *
 * Cheap: UI-thread animation (Reanimated), the pop starts from the shake's
 * own completion on the UI thread, confetti is capped at 22 pieces on one
 * shared value, rays only for gold moments. Reduce Motion: no shake, flip or
 * confetti; the pin fades in with the same sounds.
 */
import { useAmbient } from '../../services/money/useAmbient';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, ZoomIn, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { queueHaptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon } from '../../ui';
import EnamelPin from '../pinTrading/EnamelPin';
import { BOX_ART, PIN_ART, type BoxTone } from './PinArt';
import { PINS_COPY, revealOrder, serialLabel, type Pull } from './pinsModel';

type Phase = 'drop' | 'ready' | 'shake' | 'hold' | 'pop' | 'show' | 'summary';

export type RevealPull = Pull & {
  /** Catch only: rare park pin. */
  readonly rare?: boolean;
};

type Props = {
  readonly pulls: readonly RevealPull[];
  readonly tone: BoxTone;
  readonly still: boolean;
  readonly onDone: (shown: readonly RevealPull[]) => void;
  /** 'catch': Pin of the Day, no box: the pin bursts up out of a gold seal. */
  readonly variant?: 'box' | 'catch' | 'pick';
  /** Override the tag under the pin (default NEW! / Extra! Trade it). */
  readonly tagFor?: (pull: RevealPull) => { text: string; tone: 'new' | 'trader' | 'gold' };
  /** A small line under the name ("Shark Tales · 2 of 6", "Universal Studios Hollywood · Oct 8"). */
  readonly subtitleFor?: (pull: RevealPull) => string | null;
  /** Offer "Wear it" for this pull (chaser, park pin): puts it on the lanyard. */
  /** Puts the pin on the lanyard; resolves true once saved (a full lanyard swaps out its last pin). */
  readonly onWear?: (pull: RevealPull) => Promise<{ ok: boolean; removed?: string | null }>;
  readonly canWear?: (pull: RevealPull) => boolean;
  /** The box is on stage while the server answers; a tap waits for it, then opens. */
  readonly waiting?: boolean;
  /** Coins this open cost: a few coins drop from the top bar into the box as it lands. */
  readonly spend?: number;
};

export const REVEAL_CUES = ['fx.whoosh', 'fx.whooshRev', 'fx.coinTick', 'fx.reveal', 'fx.reward', 'fx.firework', 'fx.hit', 'ui.tap', 'ui.complete'] as const;

let preloaded: Promise<void> | null = null;
export function preloadRevealAudio(): void {
  preloaded ??= GameAudio.preload([...REVEAL_CUES]).catch(() => undefined);
}
function play(cue: typeof REVEAL_CUES[number], opts: { volume?: number; pitch?: number } = {}) {
  try { GameAudio.play(cue, opts); } catch { /* audio is decoration */ }
}

const CONFETTI = 22;
const CONFETTI_COLORS = ['#ffcf3b', '#ffffff', '#7cc6f5', '#ffe07a', '#ef4a3c', '#3cb85c'];
const GOLD_COLORS = ['#ffcf3b', '#ffe07a', '#ffffff', '#f2a900'];

/** Seeded so a reveal looks the same frame to frame (no Math.random in worklets). */
function pieces(seed: number, gold: boolean) {
  let s = seed || 1;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  return Array.from({ length: CONFETTI }, (_, i) => {
    const angle = -Math.PI / 2 + (rnd() - 0.5) * Math.PI * 1.5;
    const speed = 170 + rnd() * 190;
    const colors = gold ? GOLD_COLORS : CONFETTI_COLORS;
    return {
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (rnd() - 0.5) * 720,
      w: 7 + rnd() * 6, h: 10 + rnd() * 8, color: colors[i % colors.length], round: rnd() > 0.6,
    };
  });
}

function ConfettiPiece({ p, burst }: { p: ReturnType<typeof pieces>[number]; burst: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const b = burst.value;
    if (b <= 0 || b >= 1) return { opacity: 0 };
    return {
      opacity: 1 - b * b * b,
      transform: [{ translateX: p.vx * b }, { translateY: p.vy * b + 420 * b * b }, { rotate: `${p.spin * b}deg` }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{
      position: 'absolute', width: p.w, height: p.round ? p.w : p.h, borderRadius: p.round ? p.w / 2 : 2, backgroundColor: p.color,
      borderWidth: 1, borderColor: 'rgba(5,52,110,0.35)',
    }, style]} />
  );
}

/** Gold rays behind gold moments (one small SVG, turned on the UI thread). */
function Rays({ size: full, spin, on }: { size: number; spin: SharedValue<number>; on: SharedValue<number> }) {
  const size = Math.round(full / LOWRES);
  const style = useAnimatedStyle(() => ({ opacity: on.value, transform: [{ rotate: `${spin.value}deg` }, { scale: (0.8 + on.value * 0.2) * LOWRES }] }));
  const r = size / 2;
  const wedges = Array.from({ length: 12 }, (_, i) => {
    const a0 = (i / 12) * Math.PI * 2; const a1 = a0 + Math.PI / 18;
    return `M${r},${r} L${r + Math.cos(a0) * r},${r + Math.sin(a0) * r} L${r + Math.cos(a1) * r},${r + Math.sin(a1) * r} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="rayfade" cx="50%" cy="50%" r="50%">
            <Stop offset="0.15" stopColor="#ffe07a" stopOpacity="0.85" />
            <Stop offset="1" stopColor="#ffcf3b" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <G><Path d={wedges} fill="url(#rayfade)" /></G>
      </Svg>
    </Animated.View>
  );
}

/** Soft gradients are drawn at a third of their size and scaled up: same look, a ninth of the memory. */
const LOWRES = 3;

function Glow({ size: full, color, amount, id }: { size: number; color: string; amount: SharedValue<number>; id: string }) {
  const size = Math.round(full / LOWRES);
  const style = useAnimatedStyle(() => ({ opacity: amount.value, transform: [{ scale: (0.7 + amount.value * 0.45) * LOWRES }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="0.95" />
            <Stop offset="0.45" stopColor={color} stopOpacity="0.4" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** One spent coin: falls from the coin counter (top right) into the box, then is gone. */
function SpentCoin({ from, to, delay, onLand }: { from: { x: number; y: number }; to: { x: number; y: number }; delay: number; onLand: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(onLand)(); }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : 1,
    transform: [
      { translateX: from.x + (to.x - from.x) * t.value },
      // An arc: up a little, then down into the box.
      { translateY: from.y + (to.y - from.y) * t.value - Math.sin(t.value * Math.PI) * 60 },
      { scale: 1.2 - t.value * 0.5 },
      { rotate: `${t.value * 300}deg` },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0 }, style]}><GameIcon name="coin" size={30} /></Animated.View>;
}

/** The white ring that bursts out on the pop. */
function Ring({ size, t }: { size: number; t: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: t.value <= 0 || t.value >= 1 ? 0 : 1 - t.value,
    transform: [{ scale: 0.3 + t.value * 1.4 }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 10, borderColor: '#ffffff' }, style]} />;
}

export default function BoxReveal({ pulls: rawPulls, tone, still, onDone, variant = 'box', tagFor, subtitleFor, onWear, canWear, waiting = false, spend = 0 }: Props) {
  const wantOpen = useRef(false);
  const waitingRef = useRef(waiting);
  waitingRef.current = waiting;
  const isCatch = variant === 'catch';
  /** Catch and pick have no box: the pin comes straight up. */
  const noBox = variant !== 'box';
  const pulls = useMemo(() => revealOrder(rawPulls), [rawPulls]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [phase, setPhaseState] = useState<Phase>('drop');
  const phaseRef = useRef<Phase>('drop');
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const [worn, setWorn] = useState<Set<number>>(new Set());
  const ambient = useAmbient();
  const [swappedOut, setSwappedOut] = useState<string | null>(null);
  // Paid opens: the coins visibly go into the box (3 for one box, 5 for a bundle).
  const [spending, setSpending] = useState(() => (spend > 0 && !still && variant === 'box' ? (rawPulls.length > 1 || spend >= 1000 ? 5 : 3) : 0));
  const landed = useRef(0);
  const pull = pulls[Math.min(index, pulls.length - 1)];
  // Gold moments: the chaser, rare park pins, and every in-person catch.
  const gold = !!pull?.is_chaser || !!pull?.rare || isCatch;
  const art = BOX_ART[tone];
  const boxSize = Math.min(240, width * 0.58);
  const pinSize = Math.min(210, width * 0.52);
  const centerY = height * 0.45;

  const drop = useSharedValue(0);
  const shake = useSharedValue(0);
  const glow = useSharedValue(0);
  const rays = useSharedValue(0);
  const raySpin = useSharedValue(0);
  const opened = useSharedValue(0);
  const lid = useSharedValue(0);
  const flash = useSharedValue(0);
  const ring = useSharedValue(0);
  const dim = useSharedValue(0);
  const punch = useSharedValue(1);
  const foil = useSharedValue(0);
  const lift = useSharedValue(0);
  const rise = useSharedValue(0);
  const flip = useSharedValue(0);
  const settle = useSharedValue(0);
  const burst = useSharedValue(0);
  const shine = useSharedValue(0);
  const hint = useSharedValue(0);
  const seal = useSharedValue(0);
  const stamp = useSharedValue(0);
  const plusOne = useSharedValue(0);
  const wearFly = useSharedValue(0);
  const popped = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const confetti = useMemo(() => pieces((pull?.id ?? 1) * 7919, gold), [pull?.id, gold]);

  const shownAt = useRef(0);
  const showPin = useCallback(() => {
    clearTimers();
    shownAt.current = Date.now();
    setPhase('show');
    const p = pulls[index];
    if (!still) {
      shine.value = 0;
      shine.value = withDelay(450, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }));
      // The gold-foil card catches the light once, just after the pin lands on it.
      foil.value = 0;
      if (p?.is_chaser) foil.value = withDelay(650, withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }));
      if (p?.is_chaser || isCatch) {
        stamp.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 220 }));
        // The stamp lands with a thud you feel: the number is the flex.
        later(330, () => { play('fx.hit', { pitch: 0.8 }); queueHaptic('hitMedium', 2); });
        punch.value = withDelay(330, withSequence(withTiming(1.025, { duration: 50 }), withSpring(1, { damping: 10 })));
      }
      // An extra: a "+1" token rises toward the traders count.
      if (p?.duplicate && !isCatch) {
        plusOne.value = 0;
        plusOne.value = withDelay(500, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
        later(520, () => play('fx.coinTick', { pitch: 1.3 }));
      }
    } else {
      stamp.value = 1;
    }
    if (p) {
      AccessibilityInfo.announceForAccessibility(`You got ${p.name}. ${p.is_chaser ? 'The gold chaser! ' : ''}${p.duplicate ? 'An extra to trade.' : 'New!'}`);
    }
  }, [index, pulls, still, isCatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The payoff: plays exactly once per pin, whether you waited or tapped through. */
  const pop = useCallback(() => {
    if (popped.current) return;
    popped.current = true;
    clearTimers();
    setPhase('pop');
    const p = pulls[index];
    const isGold = !!p?.is_chaser || !!p?.rare || isCatch;
    cancelAnimation(shake); shake.value = 0;
    lift.value = withTiming(0, { duration: 160 });
    dim.value = withTiming(0, { duration: 200 });
    flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 260 }));
    ring.value = 0; ring.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    opened.value = 1;
    if (still) {
      lid.value = 1; rise.value = 1; flip.value = 1; settle.value = withTiming(1, { duration: 220 });
      glow.value = withTiming(isGold ? 0.9 : 0.6, { duration: 200 });
    } else {
      if (isGold) punch.value = withSequence(withTiming(1.07, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 260 }));
      lid.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
      rise.value = withSpring(1, { damping: 12, stiffness: 140, mass: 0.9 });
      flip.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) });
      settle.value = withDelay(380, withSpring(1, { damping: 14, stiffness: 180 }));
      burst.value = 0; burst.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
      glow.value = withTiming(isGold ? 1 : 0.65, { duration: 200 });
      if (isGold) rays.value = withTiming(1, { duration: 300 });
    }
    seal.value = withTiming(0, { duration: 160 });
    if (isGold) {
      play('fx.reward'); later(110, () => play('fx.firework'));
      queueHaptic('comboHeavy', 2); later(260, () => queueHaptic('success', 2));
    } else {
      if (p?.duplicate) {
        // An extra: a softer, lower pop (the +1 tick follows).
        play('fx.hit', { pitch: 0.75, volume: 0.9 });
        queueHaptic('tapLight', 2);
      } else {
        // A new pin: the bright reveal plus a rising sparkle.
        play('fx.reveal');
        later(200, () => play('fx.coinTick', { pitch: 1.6, volume: 0.8 }));
        queueHaptic('hitMedium', 2);
        later(240, () => queueHaptic('success', 1));
      }
    }
    later(still ? 240 : 620, showPin);
  }, [index, pulls, showPin, still]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The chaser's held breath: dim, two heartbeats, a heavy buzz, then pop. */
  const holdBreath = useCallback(() => {
    if (popped.current) return;
    setPhase('hold');
    dim.value = withTiming(1, { duration: 180 });
    glow.value = withTiming(1, { duration: 300 });
    lift.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    shake.value = withRepeat(withSequence(withTiming(-2.5, { duration: 45 }), withTiming(2.5, { duration: 45 })), -1, true);
    play('fx.hit', { pitch: 0.55, volume: 1 }); queueHaptic('hitMedium', 2);
    later(230, () => { play('fx.hit', { pitch: 0.5, volume: 1 }); queueHaptic('comboHeavy', 2); });
    later(470, pop);
  }, [pop]); // eslint-disable-line react-hooks/exhaustive-deps

  const afterShake = useCallback(() => {
    const p = pulls[index];
    if (p?.is_chaser || p?.rare) holdBreath(); else pop();
  }, [index, pulls, holdBreath, pop]);

  const open = useCallback(() => {
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'drop') return;
    // Still waiting for the server: remember the tap and open the moment it answers.
    if (waitingRef.current) { wantOpen.current = true; queueHaptic('tapLight', 1); return; }
    const p = pulls[index];
    const isGold = !!p?.is_chaser || !!p?.rare;
    if (still) { play('fx.whooshRev', { volume: 0.6 }); pop(); return; }
    setPhase('shake');
    play('fx.whooshRev', { volume: 0.9 });
    const beats = isGold ? [6, 8, 10, 12, 15] : [5, 7, 10];
    const step = isGold ? 190 : 175;
    const seq = beats.flatMap((deg, i) => [
      withTiming(-deg, { duration: step / 2 - i * 6 }), withTiming(deg, { duration: step / 2 - i * 6 }),
    ]);
    // The pop starts from the shake's own end, on the UI thread (no JS-timer drift).
    shake.value = withSequence(...seq, withTiming(0, { duration: 60 }, done => { if (done) runOnJS(afterShake)(); }));
    glow.value = withTiming(isGold ? 0.95 : 0.6, { duration: beats.length * step });
    if (isGold) rays.value = withDelay(beats.length * step * 0.5, withTiming(0.7, { duration: beats.length * step * 0.5 }));
    if (isCatch) seal.value = withSequence(withTiming(1.15, { duration: beats.length * step * 0.8 }), withTiming(1, { duration: 120 }));
    beats.forEach((_, i) => later(i * step, () => {
      play('fx.coinTick', { pitch: 1 + i * 0.12, volume: 0.8 });
      queueHaptic(i === beats.length - 1 ? 'hitMedium' : 'tickSelection', 1);
    }));
  }, [phase, pulls, index, still, pop, afterShake, isCatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new box (or a catch) arrives: reset and bring it in.
  useEffect(() => {
    if (!pull) return;
    clearTimers();
    popped.current = false;
    [shake, glow, rays, opened, lid, flash, ring, dim, rise, flip, settle, burst, shine, stamp, lift, plusOne, wearFly, foil].forEach(v => { cancelAnimation(v); v.value = 0; });
    punch.value = 1;
    setPhase('drop');
    if (noBox) {
      drop.value = 1;
      seal.value = 0;
      if (isCatch) seal.value = still ? 1 : withSpring(1, { damping: 10, stiffness: 140 });
      play('fx.whoosh', { volume: 0.7 });
      later(still ? 120 : 380, open);
      return;
    }
    drop.value = 0;
    play('fx.whoosh', { volume: 0.7 });
    drop.value = still ? withTiming(1, { duration: 180 }) : withSpring(1, { damping: 11, stiffness: 170, mass: 0.9 });
    // The first box waits for your tap; in a bundle, "Next box" already was the tap.
    later(still ? 200 : 520, () => { if (index > 0) open(); else setPhase('ready'); });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!waiting && wantOpen.current) { wantOpen.current = false; open(); }
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  // When an auto-opened box reaches 'drop' -> open, `open` needs the current phase; re-run once ready.
  useEffect(() => {
    if (phase === 'ready' && !still && ambient) {
      hint.value = withRepeat(withSequence(withTiming(1, { duration: 520 }), withTiming(0, { duration: 520 })), -1, false);
    } else { cancelAnimation(hint); hint.value = 0; }
  }, [phase, still, ambient, hint]);

  // Gold rays keep turning slowly while a gold moment is on screen.
  useEffect(() => {
    if (gold && !still && ambient && phase !== 'summary' && phase !== 'drop' && phase !== 'ready') {
      raySpin.value = withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1, false);
    } else { cancelAnimation(raySpin); }
    return () => cancelAnimation(raySpin);
  }, [gold, still, ambient, phase, raySpin]);

  const next = useCallback(() => {
    play('ui.tap');
    if (index < pulls.length - 1) { setIndex(i => i + 1); return; }
    if (pulls.length > 1 && phase !== 'summary') {
      setPhase('summary'); play('ui.complete', { volume: 0.7 });
      // A tick per pin as it lands on the board, pitch rising.
      if (!still) pulls.forEach((_, i) => later(120 + i * 110, () => play('fx.coinTick', { pitch: 1 + i * 0.1, volume: 0.7 })));
      return;
    }
    onDone(pulls);
  }, [index, pulls, phase, onDone]);

  const onBackdrop = () => {
    const phase = phaseRef.current;
    const p = pulls[index];
    const isGold = !!p?.is_chaser || !!p?.rare || isCatch;
    if (phase === 'ready') {
      // Waiting for the server: the box answers the tap with a wiggle.
      if (waitingRef.current) { shake.value = withSequence(withTiming(-5, { duration: 50 }), withTiming(5, { duration: 60 }), withTiming(0, { duration: 50 })); }
      open();
    }
    // Tapping through speeds it up but never mutes it. A gold pull still gets its held breath.
    else if (phase === 'shake') { if (isGold) holdBreath(); else pop(); }
    else if (phase === 'hold') { /* the breath is short; let it land */ }
    // The result screen ignores stray taps for a moment; gold pins and catches close only with a button.
    else if (phase === 'show' && !isGold && Date.now() - shownAt.current > 700) next();
  };

  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: punch.value }] }));
  const boxStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drop.value, [0, 1], [-height * 0.6, 0]) + settle.value * 70 - lift.value * 14 },
      { rotate: `${shake.value}deg` },
      { scale: 1 + Math.abs(shake.value) * 0.004 + interpolate(settle.value, [0, 1], [0, -0.18]) },
    ],
    opacity: 1 - settle.value,
  }));
  const closedStyle = useAnimatedStyle(() => ({ opacity: opened.value > 0 ? 0 : 1 }));
  const baseStyle = useAnimatedStyle(() => ({ opacity: opened.value > 0 ? 1 : 0 }));
  const lidStyle = useAnimatedStyle(() => ({
    opacity: opened.value > 0 ? 1 - lid.value * lid.value : 0,
    transform: [{ translateX: lid.value * boxSize * 0.55 }, { translateY: -lid.value * boxSize * 1.1 }, { rotate: `${lid.value * 38}deg` }],
  }));
  const sealStyle = useAnimatedStyle(() => ({
    opacity: seal.value <= 0 ? 0 : Math.min(1, seal.value) * (1 - rise.value),
    transform: [{ scale: seal.value }, { rotate: `${shake.value * 1.5}deg` }],
  }));
  const pinStyle = useAnimatedStyle(() => ({
    opacity: still ? settle.value : Math.min(1, rise.value * 3),
    transform: [
      { translateY: interpolate(rise.value, [0, 1], [boxSize * 0.15, -boxSize * 0.5]) + settle.value * -8 },
      { perspective: 600 },
      { rotateY: `${(1 - flip.value) * 540}deg` },
      { scale: (still ? 1 : interpolate(rise.value, [0, 1], [0.35, 1])) * (1 - wearFly.value * 0.75) },
      { translateY: -wearFly.value * height * 0.9 },
    ],
  }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: stamp.value > 0 ? 1 : 0, transform: [{ scale: interpolate(stamp.value, [0, 1], [2.4, 1]) }, { rotate: '-8deg' }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const foilStyle = useAnimatedStyle(() => ({ opacity: foil.value <= 0 || foil.value >= 1 ? 0 : 0.85, transform: [{ translateX: -pinSize * 0.9 + foil.value * pinSize * 2.4 }, { rotate: '20deg' }] }));
  const backerStyle = useAnimatedStyle(() => ({ opacity: settle.value * (1 - wearFly.value), transform: [{ scale: 0.9 + settle.value * 0.1 }] }));
  // rotateY = (1 - flip) * 540: the front faces you when cos(angle) > 0.
  const frontStyle = useAnimatedStyle(() => ({ opacity: Math.cos(((1 - flip.value) * 540 * Math.PI) / 180) >= 0 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: Math.cos(((1 - flip.value) * 540 * Math.PI) / 180) < 0 ? 1 : 0 }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: 1 - rise.value, transform: [{ rotate: `${shake.value}deg` }, { scale: 0.85 + glow.value * 0.1 }] }));
  const ghostFillStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9 }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plusOne.value <= 0 || plusOne.value >= 1 ? 0 : 1 - plusOne.value * plusOne.value,
    transform: [{ translateY: -plusOne.value * 120 }, { scale: 0.8 + plusOne.value * 0.4 }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value * 0.55 }));
  const infoStyle = useAnimatedStyle(() => ({ opacity: settle.value, transform: [{ translateY: (1 - settle.value) * 16 }] }));
  const hintStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hint.value * 8 }, { scale: 1 + hint.value * 0.05 }] }));
  const spotStyle = useAnimatedStyle(() => ({ opacity: 0.55 + settle.value * 0.45, transform: [{ scale: LOWRES }] }));

  if (!pull) return null;
  const glowColor = gold ? '#ffcf3b' : '#bfe5ff';
  const tag = tagFor ? tagFor(pull) : pull.duplicate
    ? { text: 'Extra! Trade it', tone: 'trader' as const }
    : { text: PINS_COPY.newPin, tone: 'new' as const };
  const subtitle = subtitleFor?.(pull) ?? null;
  const wearable = !!onWear && !!canWear?.(pull) && !worn.has(pull.item_id);
  const summarySize = Math.min(104, (width - 100) / 3.3);

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => (phase === 'show' || phase === 'summary') && next()}>
      <Pressable style={styles.scrim} onPress={onBackdrop} accessibilityRole="button"
        accessibilityLabel={phase === 'ready' ? 'Open the box' : 'Mystery box'}>
        {/* A soft spotlight: the stage reads as a stage, not the page behind. */}
        <Animated.View pointerEvents="none" style={[styles.spot, { top: centerY - width * 0.25, left: width * 0.25, width: width * 0.5, height: width * 0.5 }, spotStyle]}>
          <Svg width={width * 0.5} height={width * 0.5}>
            <Defs>
              <RadialGradient id="spot" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#2f86d8" stopOpacity="0.85" />
                <Stop offset="0.6" stopColor="#0b4f9a" stopOpacity="0.35" />
                <Stop offset="1" stopColor="#03204f" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={width * 0.25} cy={width * 0.25} r={width * 0.25} fill="url(#spot)" />
          </Svg>
        </Animated.View>

        {/* The held breath dims everything except the box. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
        <Animated.View pointerEvents="none" style={[styles.stage, { top: centerY - boxSize / 2, width, height: boxSize }, stageStyle]}>
          <Glow size={boxSize * 2.3} color={glowColor} amount={glow} id={gold ? 'glowGold' : 'glowSky'} />
          {gold && !still && <Rays size={boxSize * 2.6} spin={raySpin} on={rays} />}
          <Ring size={boxSize * 1.2} t={ring} />
          {!noBox && (
            <Animated.View style={[{ width: boxSize, height: boxSize }, boxStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, closedStyle]}>
                <Image source={art.closed} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, baseStyle]}>
                <Image source={art.base} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
              </Animated.View>
              <Animated.View style={[{ position: 'absolute', left: boxSize * 0.044, top: -boxSize * 0.146, width: boxSize * 0.915, height: boxSize * 0.915 }, lidStyle]}>
                <Image source={art.lid} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
              </Animated.View>
            </Animated.View>
          )}
          {variant === 'pick' && pull.icon_url && (
            // Pick / Completer: the pin's own shape trembles and fills with colour before it pops.
            <Animated.View style={[{ position: 'absolute', width: pinSize, height: pinSize }, ghostStyle]}>
              <Image source={pull.icon_url} style={StyleSheet.absoluteFill} contentFit="contain" tintColor="#7cc6f5" transition={0} />
              <Animated.View style={[StyleSheet.absoluteFill, ghostFillStyle]}>
                <Image source={pull.icon_url} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
              </Animated.View>
            </Animated.View>
          )}
          {isCatch && (
            <Animated.View style={[{ position: 'absolute', width: boxSize * 0.8, height: boxSize * 0.8 }, sealStyle]}>
              <Image source={PIN_ART.seal} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
            </Animated.View>
          )}
          {/* A Disney-style pin card behind a regular pin once it lands (gold moments keep their rays). */}
          {(!gold || pull.is_chaser) && (phase === 'show' || phase === 'pop') && (
            <Animated.View style={[styles.backer, pull.is_chaser && styles.backerGold, { width: pinSize * 1.25, height: pinSize * 1.3, top: (boxSize - pinSize) / 2 - boxSize * 0.5 - pinSize * 0.14 }, backerStyle]}>
              <View style={styles.backerHole} />
              {/* The best pin gets the best card: gold foil, limited edition, its number. */}
              {pull.is_chaser && <Animated.View pointerEvents="none" style={[styles.foilSheen, { height: pinSize * 1.8, top: -pinSize * 0.25 }, foilStyle]} />}
              {pull.is_chaser && <Text maxFontSizeMultiplier={1} style={styles.backerFoilText}>{pull.serial ? `LIMITED \u00b7 #${pull.serial}` : 'LIMITED'}</Text>}
            </Animated.View>
          )}
          {/* The pin is mounted (and its art decoding) from the start, hidden until it rises. */}
          <Animated.View style={[styles.pin, { width: pinSize, height: pinSize, top: (boxSize - pinSize) / 2 }, pinStyle]}>
            <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
              {pull.icon_url && <EnamelPin uri={pull.icon_url} size={pinSize} shine={still ? undefined : shine} lag={0} lagSpan={0} surface="panel" />}
            </Animated.View>
            {/* The back of the pin (a silver back stamp) shows while it turns, never a mirrored front. */}
            <Animated.View style={[styles.pinBack, { width: pinSize * 0.7, height: pinSize * 0.7, borderRadius: pinSize * 0.35, left: pinSize * 0.15, top: pinSize * 0.15 }, backStyle]}>
              <View style={[styles.pinBackPost, { width: pinSize * 0.16, height: pinSize * 0.16, borderRadius: pinSize * 0.08 }]} />
            </Animated.View>
            {(pull.is_chaser || isCatch) && (
              <Animated.View style={[styles.stamp, stampStyle]}>
                {pull.is_chaser
                  ? <View style={styles.serialStamp}><Text maxFontSizeMultiplier={1} style={styles.serialStampText}>{serialLabel(pull.serial)}</Text></View>
                  : <Image source={PIN_ART.seal} style={{ width: 64, height: 64 }} contentFit="contain" />}
              </Animated.View>
            )}
          </Animated.View>
          <View style={[styles.confettiOrigin, { top: boxSize * 0.2 }]}>
            {!still && phase !== 'summary' && confetti.map((p, i) => <ConfettiPiece key={i} p={p} burst={burst} />)}
          </View>
        </Animated.View>

        {spending > 0 && Array.from({ length: spending }, (_, i) => (
          <SpentCoin key={i} delay={i * 90} from={{ x: width - 96, y: insets.top + 34 }} to={{ x: width / 2 - 15 + (i - (spending - 1) / 2) * 10, y: centerY - boxSize * 0.3 }}
            onLand={() => {
              play('fx.coinTick', { pitch: 1 + i * 0.1, volume: 0.7 });
              queueHaptic('tickSelection', 1);
              punch.value = withSequence(withTiming(1.05, { duration: 60 }), withTiming(1, { duration: 140 }));
              landed.current += 1;
              if (landed.current >= spending) setSpending(0);
            }} />
        ))}
        {phase === 'ready' && (
          <Animated.View pointerEvents="none" style={[styles.tapHint, { top: centerY + boxSize / 2 + 18 }, hintStyle]}>
            <Text maxFontSizeMultiplier={1.35} style={styles.tapText}>Tap to open!</Text>
          </Animated.View>
        )}

        {phase === 'show' && (
          <Animated.View style={[styles.info, { top: centerY + pinSize * 0.15 }, infoStyle]} pointerEvents="box-none">
            {pull.is_chaser && (
              <View style={styles.chaserBanner}>
                <Image source={PIN_ART.chaser} style={{ width: 30, height: 30 }} contentFit="contain" />
                <Text maxFontSizeMultiplier={1.1} style={styles.chaserText}>GOLD CHASER {serialLabel(pull.serial)}</Text>
              </View>
            )}
            {pull.is_chaser && pull.by_pity && <View style={styles.guaranteedPill}><Text maxFontSizeMultiplier={1.1} style={styles.guaranteed}>Guaranteed!</Text></View>}
            <Text maxFontSizeMultiplier={1.35} style={styles.name} numberOfLines={2}>{pull.name}</Text>
            {subtitle && (isCatch
              ? <View style={styles.ticket}><Image source={PIN_ART.seal} style={{ width: 22, height: 22 }} contentFit="contain" /><Text maxFontSizeMultiplier={1.3} style={styles.ticketText} numberOfLines={1}>{subtitle}</Text></View>
              : <Text maxFontSizeMultiplier={1.35} style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>)}
            {pull.duplicate && !isCatch && (
              <Animated.View pointerEvents="none" style={[styles.plusOne, plusStyle]}>
                <Image source={PIN_ART.trade} style={{ width: 26, height: 26 }} contentFit="contain" />
                <Text maxFontSizeMultiplier={1} style={styles.plusText}>+1</Text>
              </Animated.View>
            )}
            <View style={[styles.tag, tag.tone === 'trader' ? styles.tagTrader : tag.tone === 'gold' ? styles.tagGold : styles.tagNew]}>
              {tag.tone === 'trader' && <Image source={PIN_ART.trade} style={{ width: 22, height: 22 }} contentFit="contain" />}
              {isCatch && <Image source={PIN_ART.seal} style={{ width: 24, height: 24 }} contentFit="contain" />}
              <Text maxFontSizeMultiplier={1.1} style={[styles.tagText, tag.tone === 'trader' && { color: BRAND.white }]}>{tag.text}</Text>
            </View>
          </Animated.View>
        )}

        {phase === 'summary' && (
          <View style={[styles.summary, { top: height * 0.16 }]}>
            <Text maxFontSizeMultiplier={1.35} style={styles.summaryTitle}>
              {(() => { const n = pulls.filter(p => !p.duplicate).length; return n > 0 ? `${n} new!` : 'You got'; })()}
            </Text>
            <View style={styles.summaryBoard}>
              {pulls.map((p, i) => (
                <Animated.View key={p.id} entering={still ? undefined : ZoomIn.springify().damping(10).delay(i * 110)} style={styles.summaryItem}>
                  {p.icon_url && <EnamelPin uri={p.icon_url} size={summarySize} surface="board" tilt={((i * 37) % 13) - 6} flat />}
                  {p.is_chaser && <Image source={PIN_ART.chaser} style={styles.summaryStar} contentFit="contain" />}
                  <View style={[styles.miniTag, p.duplicate ? styles.tagTrader : styles.tagNew]}>
                    <Text maxFontSizeMultiplier={1} style={[styles.miniTagText, p.duplicate && { color: BRAND.white }]}>{p.duplicate ? 'EXTRA' : 'NEW'}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
            {(() => {
              const extras = pulls.filter(p => p.duplicate).length;
              return extras > 0 ? (
                <View style={styles.extrasRow}>
                  <Image source={PIN_ART.trade} style={{ width: 26, height: 26 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.3} style={styles.extrasText}>+{extras} toward a Pick</Text>
                </View>
              ) : null;
            })()}
          </View>
        )}

        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />

        {(phase === 'show' || phase === 'summary') && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 18 }]}>
            {pulls.length > 1 && phase === 'show' && (
              <View style={styles.pips} accessible accessibilityLabel={`Box ${index + 1} of ${pulls.length}`}>
                {pulls.map((p, i) => <View key={p.id} style={[styles.pip, i <= index && styles.pipOn, p.is_chaser && i <= index && styles.pipGold]} />)}
              </View>
            )}
            {phase === 'show' && wearable && (
              <Pressable onPress={() => {
                void onWear?.(pull).then(({ ok, removed }) => {
                  if (!ok) return;
                  setSwappedOut(removed ?? null);
                  queueHaptic('success', 1); play('fx.whoosh', { volume: 0.6 }); later(380, () => play('fx.hit', { pitch: 1.4 }));
                  // The pin flies up to your lanyard, then comes back to rest.
                  if (!still) wearFly.value = withSequence(withTiming(1, { duration: 380, easing: Easing.in(Easing.quad) }), withDelay(250, withTiming(0, { duration: 1 })), withSpring(0));
                  setWorn(w => new Set(w).add(pull.item_id));
                });
              }}
                style={({ pressed }) => [styles.wear, pressed && { transform: [{ scale: 0.96 }] }]} accessibilityRole="button" accessibilityLabel="Wear it on your lanyard">
                <Text maxFontSizeMultiplier={1.1} style={styles.wearText}>Wear it</Text>
              </Pressable>
            )}
            {phase === 'show' && worn.has(pull.item_id) && (
              <View style={styles.wornChip}>
                <Text maxFontSizeMultiplier={1.2} style={styles.wornText}>On your lanyard!{swappedOut ? ` ${swappedOut} came off.` : ''}</Text>
              </View>
            )}
            <GameButton label={index < pulls.length - 1 ? 'Next box' : pulls.length > 1 && phase === 'show' ? 'See all' : 'Done'}
              icon={index < pulls.length - 1 ? 'gift' : 'check'} onPress={next} />
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#021a45' },
  spot: { position: 'absolute' },
  stage: { position: 'absolute', left: 0, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', alignSelf: 'center' },
  stamp: { position: 'absolute', right: -6, bottom: 4 },
  pinBack: { position: 'absolute', backgroundColor: '#c9d3df', borderWidth: 5, borderColor: '#8b98a8', alignItems: 'center', justifyContent: 'center' },
  pinBackPost: { backgroundColor: '#e8edf3', borderWidth: 3, borderColor: '#8b98a8' },
  serialStamp: { backgroundColor: '#3b2a05', borderColor: BRAND.gold, borderWidth: 3, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2 },
  serialStampText: { fontFamily: FONT.display, fontSize: 26, color: BRAND.gold, paddingTop: 3 },
  confettiOrigin: { position: 'absolute', alignSelf: 'center', width: 1, height: 1 },
  flash: { backgroundColor: '#ffffff' },
  dim: { backgroundColor: '#000814' },
  tapHint: { position: 'absolute', alignSelf: 'center', backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 6 },
  tapText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, paddingTop: 3 },
  info: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8 },
  chaserBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4, transform: [{ rotate: '-3deg' }],
  },
  chaserText: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, letterSpacing: 1, paddingTop: 3 },
  guaranteedPill: { backgroundColor: BRAND.navy, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 2, borderWidth: 2, borderColor: BRAND.gold, marginTop: 4 },
  guaranteed: { fontFamily: FONT.display, fontSize: 20, color: BRAND.gold, paddingTop: 2 },
  name: { fontFamily: FONT.display, fontSize: 32, color: BRAND.white, textAlign: 'center', textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  subtitle: { fontFamily: FONT.body, fontSize: 18, color: '#cfeaff' },
  ticket: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderColor: BRAND.goldLip, borderWidth: 3, borderStyle: 'dashed',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, maxWidth: '96%',
  },
  ticketText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, paddingTop: 3, flexShrink: 1 },
  backer: { position: 'absolute', alignSelf: 'center', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 4, borderColor: BRAND.navy, alignItems: 'center' },
  backerGold: { backgroundColor: '#f6d77a', borderColor: '#8a5a12', justifyContent: 'space-between', paddingBottom: 8, overflow: 'hidden' },
  foilSheen: { position: 'absolute', left: 0, width: 26, backgroundColor: 'rgba(255,255,255,0.75)' },
  backerFoilText: { fontFamily: FONT.display, fontSize: 14, color: '#5a3a08', letterSpacing: 1 },
  backerHole: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#021a45', marginTop: 10 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 3, paddingHorizontal: 14, paddingVertical: 4 },
  tagNew: { backgroundColor: BRAND.gold, borderColor: BRAND.navy },
  tagGold: { backgroundColor: BRAND.goldLight, borderColor: BRAND.navy },
  tagTrader: { backgroundColor: BRAND.blueBright, borderColor: BRAND.white },
  tagText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.navy, paddingTop: 2 },
  summary: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  summaryTitle: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, marginBottom: 14, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  // A cork board drawn once in code: cork fill, one wood frame, even gutters.
  summaryBoard: {
    width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignContent: 'center', gap: 18, paddingVertical: 22, paddingHorizontal: 12,
    borderRadius: 16, borderWidth: 6, borderColor: '#8a5a2b', backgroundColor: '#d9a866', minHeight: 300,
  },
  summaryItem: { alignItems: 'center' },
  extrasRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, backgroundColor: BRAND.blueBright, borderRadius: 999, borderWidth: 3, borderColor: BRAND.white, paddingHorizontal: 14, paddingVertical: 4 },
  extrasText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white, paddingTop: 3 },
  summaryStar: { position: 'absolute', left: -8, top: -8, width: 30, height: 30 },
  miniTag: { marginTop: 6, borderRadius: 999, borderWidth: 2, paddingHorizontal: 9, paddingVertical: 1 },
  miniTagText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navy, paddingTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', gap: 10 },
  pips: { flexDirection: 'row', gap: 8 },
  pip: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  pipOn: { backgroundColor: BRAND.white },
  pipGold: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  plusOne: { position: 'absolute', top: -10, right: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  plusText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.goldLight, paddingTop: 3, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  wear: { minHeight: 44, paddingHorizontal: 22, borderRadius: 999, borderWidth: 3, borderColor: BRAND.white, backgroundColor: BRAND.blueBright, alignItems: 'center', justifyContent: 'center' },
  wearText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.white, paddingTop: 3 },
  wornChip: { backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4 },
  wornText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, paddingTop: 2 },
});
