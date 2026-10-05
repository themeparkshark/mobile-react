import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type TextInputProps } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Canvas, Image as SkImageNode, type SkImage } from '@shopify/react-native-skia';
import Animated, {
  Easing, cancelAnimation, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { BRAND, GameButton, GameIcon } from '../../../ui';
import type { GameIconName } from '../../../ui/iconNames';
import StrokedText from '../../../components/StrokedText';
import { ShareGlyph } from '../../../share/FlexShareButton';
import { rarityColor, rarityLabel } from '../findPresentation';
import { GRADE_STARS } from '../ridePhoto';
import StampPlate from './StampPlate';
import { catchHaptic, catchMark, catchSound } from './catchAudio';
import {
  BONUS_MS, COMPACT_TALLY_MS, NEW_BEST_SWAP_MS, GRADE_BONUS_LABEL, PENDING_WOBBLE_CAP_MS, WOBBLES, WOBBLE_MS, autoContinueMs, rowMs, wobblesFor, bookPage, canSkip, isCompact, revealPlan, revealStart,
  revealStep, revealTitle, tallyRows, tallyValue, xpSplit,
  type BeatSlot, type RevealBeat, type RevealGrade, type RevealInput, type RevealRewards, type RevealState,
} from './revealRules';
import { BLANK_IMAGE, PRINT_FRAME_FILL, PRINT_STAGE_FOR, printHero } from './RidePhotoCatch';
import type { RideKind } from './rides';

/** The ride's vehicle, for the rides-left row on an escape. */
const VEHICLE: Partial<Record<RideKind, number>> = {
  coaster: require('../../../../assets/images/ride-photo/car-back.webp'),
  flume: require('../../../../assets/images/ride-photo/log-boat.webp'),
  teacups: require('../../../../assets/images/ride-photo/teacup-back.webp'),
};
const LEGENDARY_RIDES = 3;

/** A Legendary that rode by: rides left (the server's), whether RIDE AGAIN is offered, and its vehicle. */
export interface RevealEscape {
  readonly ridesLeft: number | null;
  readonly canRetry: boolean;
  readonly vehicle: RideKind | null;
}

/**
 * Ride Photo v2: the catch reveal. It starts the moment the print is ready, picking the developed print
 * up where the viewfinder held it, while the server decides. The print shivers (more for rarer finds)
 * until the answer lands: a catch bursts the find out into its medallion; a Legendary that rides by
 * shakes free instead. Beats and timing come from revealRules.ts (tested); this file only draws them.
 * House art throughout: the reveal scrim, Alex's rarity medallions, the gold ribbon, the blue prize
 * plaques and the yellow button.
 *
 * Always mounted, and every child is always mounted (hidden by opacity): a reveal never mounts views,
 * Skia nodes or images mid-catch. Every hook runs before any branch. React commits only on a reveal's
 * start, its buttons, and a skip; beats run on refs and shared values.
 */

const SCRIM = require('../../../../assets/images/reveal/scrim.webp');
const GLOW = require('../../../../assets/images/reveal/glow.webp');
/** A soft white disc (alpha only): the spotlight and the burst bloom, tinted. */
const SOFT = require('../../../../assets/images/reveal/soft-spot.webp');
/** White ray fans with a soft falloff (alpha only), tinted per rarity. */
const RAYS_TINT = require('../../../../assets/images/reveal/rays-tint.webp');
const RAYS_TINT_18 = require('../../../../assets/images/reveal/rays-tint-18.webp');
const RIBBON = require('../../../../assets/images/ribbon.png');
/** Alex's rarity medallions: Uncommon blue, Rare purple, Epic amber, Legendary the gold medal. */
const MEDAL: Readonly<Record<2 | 3 | 4 | 5, number>> = {
  2: require('../../../../assets/images/alex-ui/round-blue.webp'),
  3: require('../../../../assets/images/alex-ui/round-purple.webp'),
  4: require('../../../../assets/images/alex-ui/round-gold.webp'),
  5: require('../../../../assets/images/alex-ui/medal-gold.webp'),
};
const SHARE_ROUND = require('../../../../assets/images/alex-ui/round-blue.webp');
const INK = '#0b2f5c';
/** Title fill per tier: white, then the rarity in a light tint (outlined in navy). */
const TITLE_FILL: Readonly<Record<2 | 3 | 4 | 5, string>> = { 2: '#ffffff', 3: '#efd2ff', 4: '#ffd2a3', 5: '#ffe07a' };
const RAY_COLOR: Readonly<Record<2 | 3 | 4 | 5, string>> = { 2: '#38b6ff', 3: '#b65cff', 4: '#ff9a2e', 5: '#ffd23f' };

const SEEN_KEY = 'ride_photo_reveal_seen_v1';
let seenTiers: Set<number> = new Set();
void AsyncStorage.getItem(SEEN_KEY).then(raw => {
  try { const list = JSON.parse(raw ?? '[]'); if (Array.isArray(list)) seenTiers = new Set(list.map(Number)); } catch { /* fresh */ }
}).catch(() => undefined);
function markSeen(tier: number) {
  if (seenTiers.has(tier)) return;
  seenTiers = new Set([...seenTiers, tier]);
  void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenTiers])).catch(() => undefined);
}
/** Development recordings: show every tier's first, unskippable reveal again. */
export function resetRevealSeenForPreview(): void {
  seenTiers = new Set();
  void AsyncStorage.removeItem(SEEN_KEY).catch(() => undefined);
}

export interface RevealSlot {
  readonly id: number;
  readonly art: ImageSource | null;
  readonly owned: boolean;
  readonly isNew: boolean;
  /** The find just caught (new or a repeat): its slot carries the NEW! stamp or the times-caught bubble. */
  readonly caught?: boolean;
  /** R6: the best photo grade's stars (0 to 3) after this catch, and before it (the caught slot steps up). */
  readonly stars?: number;
  readonly prevStars?: number;
  /** R6: the caught slot of a repeat that beat its best photo: it flips to gold (NEW BEST!). */
  readonly newBest?: boolean;
}

export interface CatchRevealData {
  /** A fresh key per catch. */
  readonly key: number;
  readonly name: string;
  readonly art: ImageSource | null;
  readonly rarity: number;
  readonly tier: 2 | 3 | 4 | 5;
  readonly grade: RevealGrade;
  readonly golden: boolean;
  /** New to the book (the server's answer once it lands; the find's own flag before). */
  readonly isNew: boolean;
  /** R6: a repeat whose photo beat the stored best (the server's answer). */
  readonly newBest?: boolean;
  /** R6: a gull photobombed the catching photo (it is capped at Good). */
  readonly photobombed?: boolean;
  /** The server's rewards (zeros until the answer lands). */
  readonly rewards: RevealRewards;
  readonly setName: string | null;
  readonly setColor: string;
  readonly collected: number | null;
  readonly total: number | null;
  readonly caughtCount: number | null;
  /** The set's page in the book, when it is known: every item's art, owned or a silhouette. */
  readonly slots: readonly RevealSlot[] | null;
  readonly photo: SkImage | null;
  readonly rideName: string;
  readonly date: string;
}

/** Still waiting for the server, caught, or (a Legendary that rode by, or a failed call) escaped. */
export type RevealOutcome = 'pending' | 'caught' | 'escaped';

const MAX_ROWS = 4;
const MAX_SLOTS = 15;
const ROW_ICON: Readonly<Record<'xp' | 'coins' | 'energy' | 'ticket', GameIconName>> = { xp: 'xp', coins: 'coin', energy: 'energy', ticket: 'ticket' };

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** Confetti in the house reveal's colours (DexReveal), plus white. */
const CONFETTI = [BRAND.gold, BRAND.red, '#3cb85c', '#38b6ff', '#b65cff', BRAND.white];
const VOLLEY = 22;

/**
 * One confetti volley: always-mounted pieces flung from a point, all driven by one shared value (0 to 1
 * over the volley's life), so a burst is a single animation, not dozens.
 */
const Volley = memo(function Volley({ x, y, progress, seed, spread = 1, stars = false, streamers = false }: {
  readonly x: number; readonly y: number; readonly progress: SharedValue<number>; readonly seed: number; readonly spread?: number; readonly stars?: boolean;
  /** Legendary: long gold ribbon streamers instead of confetti. */
  readonly streamers?: boolean;
}) {
  const pieces = useMemo(() => Array.from({ length: stars ? 10 : streamers ? 10 : VOLLEY }, (_, i) => {
    const r = (k: number) => { const v = Math.sin((i + 1) * 12.9898 * (seed + k) + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
    const angle = -Math.PI / 2 + (r(1) - 0.5) * Math.PI * (stars ? 2 : 1.25) * spread;
    const speed = (stars ? 260 : 420) + r(2) * (stars ? 160 : 420);
    return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (r(3) - 0.5) * (streamers ? 540 : 1440),
      color: streamers ? (i % 2 ? BRAND.gold : '#fff1b8') : CONFETTI[i % CONFETTI.length],
      w: stars ? 18 : streamers ? 10 : 8 + r(4) * 5, h: stars ? 18 : streamers ? 46 + r(5) * 20 : 12 + r(5) * 6 };
  }), [seed, spread, stars, streamers]);
  return (
    <>
      {pieces.map((piece, i) => <Piece key={i} piece={piece} x={x} y={y} progress={progress} stars={stars} />)}
    </>
  );
});

/** A firework: a bright core and 12 spokes that burst out, trail and fade. One shared value drives it. */
/** R6: a firework 70 to 90 pt across: a tinted gold core, 12 gold and white spokes, and 8 glitter stars that hang. */
const Firework = memo(function Firework({ x, y, progress, size = 84 }: { readonly x: number; readonly y: number; readonly progress: SharedValue<number>; readonly size?: number }) {
  const core = useAnimatedStyle(() => {
    const p = progress.value;
    return { opacity: p <= 0 || p >= 1 ? 0 : (1 - p) * 0.95, transform: [{ scale: 0.3 + 1.1 * Math.min(1, p * 3.2) }] };
  });
  const r = size / 2;
  return (
    <View pointerEvents="none" style={[styles.firework, { left: x - 90, top: y - 90 }]}>
      <Animated.View style={[styles.fireCore, core]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#ffc93b" />
      </Animated.View>
      {Array.from({ length: 12 }, (_, i) => <Spoke key={i} angle={(i / 12) * 360} progress={progress} long={i % 2 === 0} reach={r} />)}
      {Array.from({ length: 8 }, (_, i) => <Glitter key={i} angle={(i / 8) * 360 + 22.5} progress={progress} reach={r} />)}
    </View>
  );
});
const Spoke = memo(function Spoke({ angle, progress, long, reach }: { readonly angle: number; readonly progress: SharedValue<number>; readonly long: boolean; readonly reach: number }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const out = 1 - (1 - Math.min(1, p * 1.7)) ** 3;
    return {
      opacity: p <= 0 || p >= 1 ? 0 : p > 0.55 ? (1 - p) / 0.45 : 1,
      transform: [{ rotate: `${angle}deg` }, { translateY: -(8 + out * (long ? reach - 10 : reach - 18)) }, { scaleY: 0.5 + 0.7 * (1 - p) }],
    };
  });
  return <Animated.View style={[styles.spoke, long && styles.spokeLong, style]} />;
});
const Glitter = memo(function Glitter({ angle, progress, reach }: { readonly angle: number; readonly progress: SharedValue<number>; readonly reach: number }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const out = 1 - (1 - Math.min(1, p * 1.4)) ** 2;
    const a = (angle * Math.PI) / 180;
    const d = 6 + out * (reach + 4);
    return {
      opacity: p <= 0.12 || p >= 1 ? 0 : p > 0.7 ? (1 - p) / 0.3 : 1,
      transform: [{ translateX: Math.sin(a) * d }, { translateY: -Math.cos(a) * d + p * p * 14 }, { scale: 0.6 + 0.5 * Math.sin(p * 18) ** 2 }],
    };
  });
  return <Animated.View style={[styles.glitter, style]}><GameIcon name="star" size={13} /></Animated.View>;
});

/**
 * R6: a curling, glossy gold ribbon unfurling from behind the medallion (Legendary): a chain of segments laid
 * along a curl, revealed one after another, then drifting down and fading. One shared value drives it.
 */
const Ribbon = memo(function Ribbon({ x, y, angle, curl, progress, count = 12 }: {
  readonly x: number; readonly y: number; readonly angle: number; readonly curl: number; readonly progress: SharedValue<number>; readonly count?: number;
}) {
  const segs = useMemo(() => {
    const out: { x: number; y: number; rot: number; i: number }[] = [];
    let px = x, py = y, th = (angle * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const step = 13;
      px += Math.cos(th) * step; py += Math.sin(th) * step;
      out.push({ x: px, y: py, rot: (th * 180) / Math.PI, i });
      th += curl * (0.7 + i * 0.08);
    }
    return out;
  }, [x, y, angle, curl, count]);
  return <>{segs.map(seg => <RibbonSeg key={seg.i} seg={seg} n={count} progress={progress} />)}</>;
});
const RibbonSeg = memo(function RibbonSeg({ seg, n, progress }: { readonly seg: { x: number; y: number; rot: number; i: number }; readonly n: number; readonly progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const show = p * 2.6 * n - seg.i; // unfurls over the first ~40%
    if (p <= 0 || p >= 1 || show <= 0) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }, { rotate: '0deg' }, { scaleX: 0 }] };
    const fall = p > 0.45 ? (p - 0.45) * (p - 0.45) * 160 : 0;
    return {
      opacity: p > 0.8 ? (1 - p) / 0.2 : 1,
      transform: [{ translateX: seg.x - 9 }, { translateY: seg.y - 5 + fall }, { rotate: `${seg.rot + Math.sin(p * 9 + seg.i) * 6}deg` },
        { scaleX: Math.min(1, show) }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.ribbonSeg, { backgroundColor: seg.i % 2 ? '#ffb800' : '#ffd23f' }, style]}>
    <View style={styles.ribbonGloss} />
  </Animated.View>;
});

const Piece = memo(function Piece({ piece, x, y, progress, stars }: {
  readonly piece: { vx: number; vy: number; spin: number; color: string; w: number; h: number };
  readonly x: number; readonly y: number; readonly progress: SharedValue<number>; readonly stars: boolean;
}) {
  const life = stars ? 0.9 : 2.0;
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ translateX: -100 }, { translateY: -100 }] };
    const t = p * life;
    // A drag-damped throw, then gravity and a little flutter.
    const k = 1 - Math.exp(-2.6 * t);
    const px = x + (piece.vx / 2.6) * k + Math.sin(t * 7 + piece.spin) * (stars ? 0 : 8);
    const py = y + (piece.vy / 2.6) * k + (stars ? 220 : 420) * t * t;
    return {
      opacity: p > 0.8 ? (1 - p) / 0.2 : 1,
      transform: [{ translateX: px - piece.w / 2 }, { translateY: py - piece.h / 2 }, { rotate: `${piece.spin * t}deg` },
        { scale: stars ? 1 - 0.6 * p : 1 }],
    };
  });
  return stars
    ? <Animated.View pointerEvents="none" style={[styles.piece, { width: piece.w, height: piece.h }, style]}><GameIcon name="star" size={piece.w} /></Animated.View>
    : <Animated.View pointerEvents="none" style={[styles.piece, { width: piece.w, height: piece.h, backgroundColor: piece.color }, style]}>
      {piece.w >= 10 && <View style={styles.gloss} />}
    </Animated.View>;
});

/** A number that counts up on the UI thread. The native text is only touched when the whole number changes. */
function CountText({ to, progress, prefix = '+', style }: {
  readonly to: number; readonly progress: SharedValue<number>; readonly prefix?: string; readonly style: TextInputProps['style'];
}) {
  // At most 12 text steps per row (each step is a native text commit): the count still lands on the exact total.
  const shown = useDerivedValue(() => tallyValue(to, progress.value >= 1 ? 1 : Math.floor(progress.value * 12) / 12));
  const props = useAnimatedProps(() => {
    const text = `${prefix}${shown.value}`;
    return { text, defaultValue: text } as unknown as TextInputProps;
  });
  return <AnimatedInput editable={false} pointerEvents="none" underlineColorAndroid="transparent" style={style} animatedProps={props}
    defaultValue={`${prefix}0`} />;
}

function BookCount({ before, after, total, fill, style }: {
  readonly before: number; readonly after: number; readonly total: number; readonly fill: SharedValue<number>; readonly style: TextInputProps['style'];
}) {
  const passed = useDerivedValue(() => fill.value >= 0.5);
  const props = useAnimatedProps(() => {
    const text = `${passed.value ? after : before}/${total}`;
    return { text, defaultValue: text } as unknown as TextInputProps;
  });
  return <AnimatedInput editable={false} pointerEvents="none" style={style} animatedProps={props} defaultValue={`${before}/${total}`} />;
}

/** One book slot, always mounted. Owned: the item's art. Missing: its silhouette. New: pops in with a gold ring. */
const Slot = memo(function Slot({ index, total, slot, filledFallback, isNewFallback, caughtFallback = false, bestFallback = false, color, art, fill, best, times }: {
  readonly index: number; readonly total: number; readonly slot: RevealSlot | null; readonly filledFallback: boolean; readonly isNewFallback: boolean;
  readonly color: string; readonly art: ImageSource | null; readonly fill: SharedValue<number>;
  /** R6 NEW BEST!: 0..1, the caught slot flips (the stars step up at the half) and lands in gold. */
  readonly best: SharedValue<number>;
  /** A repeat: how many times it is caught now (a bubble on its own slot). */
  readonly times: number | null;
  /** Plain slots (page unknown): this one carries the repeat find's own art and bubble. */
  readonly caughtFallback?: boolean;
  /** Plain slots: the repeat find's slot plays NEW BEST!. */
  readonly bestFallback?: boolean;
}) {
  const isNew = slot ? slot.isNew : isNewFallback;
  const owned = slot ? slot.owned && !slot.isNew : filledFallback;
  const style = useAnimatedStyle(() => (isNew ? {
    opacity: Math.min(1, fill.value * 2), transform: [{ scale: fill.value <= 0 ? 0.3 : 0.3 + 0.95 * Math.min(1, fill.value) }],
  } : { opacity: 0, transform: [{ scale: 1 }] }));
  const caught = slot ? !!slot.caught : caughtFallback;
  const shownArt = slot?.art ?? (isNew || (caughtFallback && !isNew) ? art : null);
  // Plain owned slots are filled set-colour tiles with a big check (never a blank white box).
  const plainOwned = !slot && owned && !shownArt;
  const newBest = slot ? !!slot.newBest : bestFallback;
  const stars = owned || isNew ? Math.max(0, Math.min(3, slot?.stars ?? 0)) : 0;
  const prevStars = newBest ? Math.max(0, Math.min(3, slot?.prevStars ?? 0)) : stars;
  const flip = useAnimatedStyle(() => (newBest ? {
    transform: [{ scaleX: Math.max(0.06, Math.abs(Math.cos(Math.PI * Math.min(1, best.value)))) },
      { scale: 1 + 0.18 * Math.sin(Math.PI * Math.min(1, best.value)) }],
  } : { transform: [{ scaleX: 1 }, { scale: 1 }] }));
  const goldOn = useAnimatedStyle(() => ({ opacity: newBest && best.value >= 0.5 ? 1 : 0 }));
  const oldStarsOn = useAnimatedStyle(() => ({ opacity: newBest && best.value >= 0.5 ? 0 : 1 }));
  return (
    <Animated.View style={[styles.slot, index >= total && styles.hidden, owned && styles.slotOwned, plainOwned && { backgroundColor: color }, flip]}>
      {/* Every slot keeps its image view mounted; only the source and the tint change between catches. */}
      {/* A missing item: its silhouette in #1b3a5c at 30% with a darker 1.5 pt outline (a darker copy just behind it) */}
      <Image source={!owned && !isNew ? shownArt ?? undefined : undefined} style={[styles.slotArt, styles.slotOutline, (owned || isNew || !shownArt) && styles.hidden]}
        tintColor="#0b1f36" contentFit="contain" transition={0} />
      <Image source={shownArt ?? undefined} style={[styles.slotArt, !owned && !isNew && styles.slotMissing, !shownArt && styles.hidden]}
        tintColor={!owned && !isNew ? '#1b3a5c' : undefined} contentFit="contain" transition={0} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.slotCheck, !plainOwned && styles.gone]}><GameIcon name="check" size={22} /></View>
      <Animated.View pointerEvents="none" style={[styles.slotNew, { borderColor: BRAND.gold }, !isNew && styles.hidden, style]}>
        <Image source={isNew ? art ?? undefined : undefined} style={styles.slotNewArt} contentFit="contain" transition={0} />
      </Animated.View>
      {/* (`color` keeps owned frames in the set colour; a missing slot gets a darker outline) */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.slotFrame, owned && { borderColor: color }, !owned && !isNew && styles.slotFrameMissing]} />
      {/* NEW BEST!: the slot lands in gold */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.slotGold, !newBest && styles.gone, goldOn]} />
      {/* Book stars: the item's best photo grade */}
      <Animated.View pointerEvents="none" style={[styles.slotStars, prevStars === 0 && styles.gone, oldStarsOn]}>
        {Array.from({ length: prevStars }, (_, k) => <GameIcon key={k} name="star" size={11} />)}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.slotStars, (!newBest || stars === 0) && styles.gone, goldOn]}>
        {Array.from({ length: stars }, (_, k) => <GameIcon key={k} name="star" size={11} />)}
      </Animated.View>
      <View pointerEvents="none" style={[styles.timesBubble, { backgroundColor: color }, !(times != null && caught) && styles.gone]}>
        <Text style={styles.timesText}>x{times ?? 0}</Text>
      </View>
    </Animated.View>
  );
});

function CatchReveal({ data, outcome, escape = null, flags = null, width, height, insets, reducedMotion, onContinue, onShare, onEscaped, onActions, autoContinue = null, autoSkipMs = null, autoEscape = 'map' }: {
  readonly data: CatchRevealData | null;
  readonly outcome: RevealOutcome;
  /** A ride-by: what the escape shows (null for a failed call). */
  readonly escape?: RevealEscape | null;
  /** Flags the viewfinder reads on the UI thread: `covered` (stop the scene clock) and `hidden` (CONTINUE). */
  readonly flags?: { readonly covered: SharedValue<boolean>; readonly hidden: SharedValue<boolean> } | null;
  readonly width: number;
  readonly height: number;
  readonly insets: { top: number; bottom: number };
  readonly reducedMotion: boolean;
  /** CONTINUE: the reveal has started its fade; hand off to the badge. */
  readonly onContinue: () => void;
  readonly onShare: () => void;
  /** The buttons are up (`compact`: a repeat that continues on its own). SHARE's JPEG is prepared only now. */
  readonly onActions?: (compact: boolean) => void;
  /** The escape has played: back to the map, or RIDE AGAIN (the same find's next ride). */
  readonly onEscaped: (choice: 'map' | 'again') => void;
  /** Development recordings only: press CONTINUE this long after the buttons arrive. */
  readonly autoContinue?: number | null;
  /** Development recordings only: what the escape picks on its own (after `autoContinue`). */
  readonly autoEscape?: 'map' | 'again';
  /** Development recordings only: tap to skip this long into the reveal. */
  readonly autoSkipMs?: number | null;
}) {
  // The last reveal keeps drawing while it fades out, so it never blanks to empty fields.
  const lastData = useRef<CatchRevealData | null>(data);
  if (data) lastData.current = data;
  const view = data ?? lastData.current;
  const tier = view?.tier ?? 2;
  const color = rarityColor(view?.rarity ?? 2);
  const rows = useMemo(() => (view ? tallyRows(view.rewards) : []), [view]);
  const book = useMemo(() => bookPage(view?.collected ?? null, view?.total ?? null, view?.isNew ?? false), [view]);
  const hero = useMemo(() => printHero({ width, height }, insets), [width, height, insets]);
  const xp = useMemo(() => xpSplit(view?.rewards.experience ?? 0, view?.rewards.bonusXp ?? 0), [view]);

  // ── Layout: one column, designed at 780 pt of safe height, squeezed (never cut) on short phones ──
  const safeH = Math.max(1, height - insets.top - insets.bottom);
  const u = Math.max(0.74, Math.min(1, safeH / 780));
  const cx = width / 2;
  const L = useMemo(() => {
    const top = insets.top;
    return {
      title: top + 8 * u, medal: top + 178 * u, ribbon: top + 290 * u, chips: top + 362 * u, tally: top + 408 * u,
      book: top + 532 * u, actions: top + 680 * u, lift: top + safeH * 0.4,
    };
  }, [insets.top, u, safeH]);
  const medalSize = 188 * u;
  const raysSize = Math.max(width, height) * 1.2;
  const tuck = useMemo(() => ({ x: cx + medalSize * 0.72, y: L.medal - medalSize * 0.36 + 12, scale: 0.36, rot: 8 }), [cx, medalSize, L.medal]);
  const rowCount = Math.min(MAX_ROWS, Math.max(1, rows.length));
  const plaqueW = rowCount >= 4 ? 82 : 100;
  const plaqueH = (rowCount >= 4 ? 100 : 108) * u;
  const xpIndex = rows.findIndex(row => row.key === 'xp');
  const plaqueX = (i: number) => cx + (i - (rowCount - 1) / 2) * (plaqueW + 10);

  // ── Shared values (all mounted, all reset per reveal) ──
  const shown = useSharedValue(0);
  const bg = useSharedValue(0);
  const spot = useSharedValue(0);
  const charge = useSharedValue(0);
  const flash = useSharedValue(0);
  const printPos = useSharedValue(0);
  const printTuck = useSharedValue(0);
  const printGone = useSharedValue(0);
  const wobble = useSharedValue(0);
  const printFlash = useSharedValue(0);
  const rays = useSharedValue(0);
  const spin = useSharedValue(0);
  const medal = useSharedValue(0);
  const item = useSharedValue(0);
  const float = useSharedValue(0);
  const title = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const chips = useSharedValue(0);
  const tally = useSharedValue(0);
  const row0 = useSharedValue(0), row1 = useSharedValue(0), row2 = useSharedValue(0), row3 = useSharedValue(0);
  const rowIn0 = useSharedValue(0), rowIn1 = useSharedValue(0), rowIn2 = useSharedValue(0), rowIn3 = useSharedValue(0);
  const bump0 = useSharedValue(1), bump1 = useSharedValue(1), bump2 = useSharedValue(1), bump3 = useSharedValue(1);
  const rowP = [row0, row1, row2, row3];
  const rowIn = [rowIn0, rowIn1, rowIn2, rowIn3];
  const bump = [bump0, bump1, bump2, bump3];
  const bonusFly = useSharedValue(0);
  const page = useSharedValue(0);
  const fill = useSharedValue(0);
  const stamp = useSharedValue(0);
  const best = useSharedValue(0);
  const actions = useSharedValue(0);
  const flee = useSharedValue(0);
  const punch = useSharedValue(0);
  const whiteout = useSharedValue(0);
  const starFlash = useSharedValue(0);
  const fireA = useSharedValue(0), fireB = useSharedValue(0), streamV = useSharedValue(0);
  const escapeIn = useSharedValue(0);
  const crack = useSharedValue(0);
  const againGo = useSharedValue(0);
  const exit = useSharedValue(0);
  const volleyA = useSharedValue(0), volleyB = useSharedValue(0), volleyC = useSharedValue(0), sparkleV = useSharedValue(0);
  const ring = useSharedValue(0);
  const tapSpark = useSharedValue(0);
  const tapAt = useSharedValue({ x: 0, y: 0 });

  // React state: only the phase the buttons need. Beats live on a ref.
  const [phase, setPhaseState] = useState<'idle' | 'playing' | 'actions' | 'escape' | 'leaving'>('idle');
  const phaseRef = useRef<'idle' | 'playing' | 'actions' | 'escape' | 'leaving'>('idle');
  const setPhase = useCallback((next: 'idle' | 'playing' | 'actions' | 'escape' | 'leaving') => { phaseRef.current = next; setPhaseState(next); }, []);
  const stateRef = useRef<RevealState>(revealStart(false));
  const planRef = useRef<BeatSlot[]>([]);
  const inputRef = useRef<RevealInput | null>(null);
  const outcomeRef = useRef<RevealOutcome>(outcome);
  outcomeRef.current = outcome;
  const waiting = useRef<null | (() => void)>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, run: () => void) => { timers.current.push(setTimeout(run, ms)); }, []);
  const clearTimers = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const dataRef = useRef(view);
  dataRef.current = view;

  const allValues = [bg, spot, charge, flash, printPos, printTuck, printGone, wobble, printFlash, rays, medal, item, title, ribbon, chips, tally,
    ...rowP, ...rowIn, bonusFly, page, fill, stamp, best, actions, flee, volleyA, volleyB, volleyC, sparkleV, ring,
    printGone, punch, whiteout, starFlash, fireA, fireB, streamV, escapeIn, exit, crack, againGo];

  const dispatch = useCallback((event: Parameters<typeof revealStep>[1]) => {
    const next = revealStep(stateRef.current, event, planRef.current);
    stateRef.current = next;
    return next;
  }, []);

  /** Every value at its end state: the skip, and the landing of a skip on the actions. */
  const settle = useCallback((ms: number, keepBook = false) => {
    const to = (v: SharedValue<number>, value: number) => { cancelAnimation(v); v.value = ms <= 0 ? value : withTiming(value, { duration: ms }); };
    to(bg, 1); to(spot, 0); to(charge, 0); to(flash, 0); to(printPos, 1); to(printTuck, 1); to(wobble, 0); to(printFlash, 0);
    to(rays, reducedMotion ? 0 : 1); to(medal, 1); to(item, 1); to(title, 1); to(ribbon, 1); to(chips, 1); to(tally, 1);
    rowP.forEach(v => to(v, 1)); rowIn.forEach(v => to(v, 1)); to(bonusFly, 1);
    to(printGone, 0); to(punch, 0); to(whiteout, 0); to(starFlash, 0);
    if (!keepBook) { to(page, 1); to(fill, 1); to(stamp, dataRef.current?.isNew || dataRef.current?.newBest ? 1 : 0); to(best, 1); to(actions, 1); }
  }, [reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── The beats ──
  const runBeat = useCallback((beat: RevealBeat) => {
    const d = dataRef.current;
    if (!d) return;
    const rm = reducedMotion;
    const compact = !!inputRef.current?.compact;
    dispatch({ type: 'advance', beat });
    catchMark(`reveal-beat ${beat}`);
    const t = d.tier;
    if (beat === 'lift') {
      // The stage: the scrim fades in, the print rises to centre on a soft rarity spotlight.
      bg.value = withTiming(1, { duration: rm ? 160 : 240 });
      spot.value = withTiming(rm ? 0 : 1, { duration: 300 });
      printPos.value = rm ? withTiming(1, { duration: 160 }) : withSpring(1, { damping: 16, stiffness: 170 });
      catchSound('whoosh', { volume: 0.55 });
      return;
    }
    if (beat === 'charge') {
      // Legendary: the lights go down, the spotlight pulses three times with a riser, the print rumbles.
      charge.value = withTiming(1, { duration: 300 }); // near-black: only the print and its pulsing light
      spot.value = withSequence(withTiming(0.35, { duration: 200 }), withTiming(1, { duration: 120 }), withTiming(0.4, { duration: 160 }),
        withTiming(1, { duration: 120 }), withTiming(0.45, { duration: 140 }), withTiming(1.2, { duration: 160 }));
      catchSound('riser', { volume: 0.9 });
      for (let i = 0; i < 4; i++) later(i * 210, () => catchHaptic(i < 3 ? 'tickSelection' : 'hitMedium', 2));
      wobble.value = withRepeat(withSequence(withTiming(0.3, { duration: 45 }), withTiming(-0.3, { duration: 45 })), 9, true);
      return;
    }
    if (beat === 'wobble') {
      // The shiver: 1 to 3 wobbles (rarer = more), each a rising tick. Will it pop?
      const n = compact ? 1 : wobblesFor(t, d.grade);
      for (let i = 0; i < n; i++) later(i * WOBBLE_MS, () => shiver(i, n));
      return;
    }
    if (beat === 'burst') {
      // The pop: the print flashes and tucks away as a polaroid; the find bursts out into its medallion in
      // rarity rays. Rarer finds hold the light longer and get more of everything.
      charge.value = withTiming(0, { duration: 220 });
      spot.value = withTiming(0, { duration: 260 });
      cancelAnimation(wobble); wobble.value = withTiming(0, { duration: 80 });
      // The print goes opaque white and swells (60 ms), then collapses to nothing (80 ms) as the find bursts
      // out; it comes back later as the tucked polaroid (title beat). Never two half-faded layers at once.
      if (rm) { printGone.value = withTiming(1, { duration: 120 }); printTuck.value = 1; }
      else {
        printFlash.value = withTiming(0.6, { duration: 60 });
        punch.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 80 }));
        printGone.value = withDelay(60, withTiming(1, { duration: 80, easing: Easing.in(Easing.quad) }));
        later(150, () => { printTuck.value = 1; printFlash.value = 0; });
      }
      if (t === 5 && !rm) {
        // Legendary: a warm gold radial bloom on the medallion (60% peak, clear at the edges, gone in under
        // 200 ms), an 8-point star flash behind the medallion, and a punch-in on the whole stage.
        whiteout.value = withSequence(withTiming(0.6, { duration: 40 }), withTiming(0, { duration: 150, easing: Easing.out(Easing.quad) }));
        starFlash.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
        exit.value = -0.15;
        exit.value = withDelay(120, withSpring(0, { damping: 12, stiffness: 160 }));
      }
      medal.value = rm ? withTiming(1, { duration: 200 }) : withSequence(withTiming(1.2, { duration: 170, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 8, stiffness: 200 }));
      item.value = rm ? withTiming(1, { duration: 200 }) : withDelay(40, withSequence(withTiming(1.24, { duration: 230, easing: Easing.out(Easing.back(2)) }),
        withSpring(1, { damping: 7, stiffness: 190 })));
      rays.value = rm ? 0 : withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) });
      // A centred bloom (bright core, clear by half the screen), never a full-screen white wash.
      if (!rm) flash.value = withSequence(withTiming(t >= 4 ? 0.7 : 0.55, { duration: 60 }), withTiming(0, { duration: t >= 4 ? 300 : 220 }));
      if (t === 5 && !rm) {
        streamV.value = withTiming(1, { duration: 1700, easing: Easing.linear });
      }
      catchSound('pop', { volume: 0.9, pitch: 3 });
      catchSound('sparkle');
      if (!rm && t >= 3 && !compact) later(60, () => catchSound('cheer'));
      catchHaptic(t >= 4 ? 'comboHeavy' : 'success', 4);
      if (!rm) {
        // A ring wave, stars from the medallion, and confetti from Epic up (Legendary: a firework and more).
        ring.value = withTiming(1, { duration: t >= 4 ? 620 : 480, easing: Easing.out(Easing.cubic) });
        sparkleV.value = withTiming(1, { duration: 900, easing: Easing.linear });
        if (t >= 4) volleyA.value = withTiming(1, { duration: 2000, easing: Easing.linear });
        if (t === 5) catchSound('firework', { volume: 0.9 });
      }
      return;
    }
    if (beat === 'title') {
      title.value = rm ? withTiming(1, { duration: 200 }) : t === 5
        ? withSequence(withTiming(1.4, { duration: 1 }), withTiming(1, { duration: 160, easing: Easing.in(Easing.cubic) }), withSpring(1, { damping: 7, stiffness: 260 }))
        : withSequence(withTiming(1.16, { duration: 160 }), withSpring(1, { damping: 8, stiffness: 240 }));
      // The print comes back as the tucked polaroid.
      printGone.value = rm ? withTiming(0, { duration: 200 }) : withDelay(240, withSpring(0, { damping: 11, stiffness: 200 }));
      if (t === 5 && !rm) {
        // The Legendary signature: two gold firework bursts in the upper third.
        fireA.value = withTiming(1, { duration: 900, easing: Easing.linear });
        fireB.value = withDelay(220, withTiming(1, { duration: 900, easing: Easing.linear }));
        later(0, () => catchSound('firework', { volume: 0.8 }));
        later(220, () => { catchSound('firework', { volume: 0.7, pitch: 3 }); catchHaptic('hitMedium', 2); });
      }
      ribbon.value = rm ? withTiming(1, { duration: 200 }) : withDelay(110, withSpring(1, { damping: 11, stiffness: 170 }));
      chips.value = rm ? withTiming(1, { duration: 200 }) : withDelay(230, withSpring(1, { damping: 12, stiffness: 220 }));
      later(rm ? 0 : 110, () => catchSound('stamp', { volume: 0.7 }));
      const set = d.setName && d.total ? ` ${d.setName}, ${Math.max(0, d.collected ?? 0)} of ${d.total}${d.isNew ? ', new' : ''}.` : '';
      AccessibilityInfo.announceForAccessibility(`${revealTitle(t)} ${d.name}, ${rarityLabel(d.rarity)}. ${GRADE_BONUS_LABEL[d.grade]}`
        + `${d.rewards.experience > 0 ? ` Plus ${d.rewards.experience} XP.` : ''}${set}`);
      return;
    }
    if (beat === 'tally') {
      tally.value = withTiming(1, { duration: rm ? 120 : 180 });
      const rowList = tallyRows(d.rewards).slice(0, MAX_ROWS);
      // One rising pitch across every row (the shaker climbs the whole way), and a bigger number counts longer.
      let at = rm ? 0 : 100, pitch = 0;
      rowList.forEach((row, i) => {
        // A repeat counts every row at once, straight to the total (the bonus folded in).
        const ms = compact ? COMPACT_TALLY_MS : rowMs(row.to);
        if (compact && !rm) at = 100;
        // The plaques deal in together (a centred group, 60 ms apart); the counts run one after another.
        rowIn[i].value = rm ? withTiming(1, { duration: 150 }) : withDelay(100 + i * 60, withSpring(1, { damping: 9, stiffness: 230 }));
        // XP counts its own XP first; the photo bonus flies in after the rows (below).
        const target = row.key === 'xp' && !compact ? xp.baseProgress : 1;
        rowP[i].value = rm ? withTiming(target, { duration: 1 }) : withDelay(at + 60, withTiming(target, { duration: ms, easing: Easing.linear }));
        if (!rm) {
          const ticks = Math.max(2, Math.min(Math.round(ms / 125), 12)); // 8 ticks a second at most
          for (let k = 0; k < (compact && i > 0 ? 0 : ticks); k++) { const p = pitch++; later(at + 60 + (k * ms) / ticks, () => catchSound('coinTick', { volume: 0.7, pitch: p * 0.5 })); }
          later(at + 60 + ms, () => catchHaptic('tapLight', 1));
          if (!compact) at += 60 + ms + 40;
        } else if (i === 0) catchSound('coinTick', { volume: 0.7 });
      });
      if (xp.bonus > 0 && xpIndex >= 0 && !compact) {
        // The grade's stars fly from the grade chip into the XP number; the count jumps on with a chime.
        bonusFly.value = rm ? 1 : withDelay(at, withTiming(1, { duration: BONUS_MS - 260, easing: Easing.inOut(Easing.cubic) }));
        later(rm ? 0 : at + BONUS_MS - 260, () => {
          rowP[xpIndex].value = rm ? 1 : withTiming(1, { duration: 260, easing: Easing.linear });
          bump[xpIndex].value = rm ? 1 : withSequence(withTiming(1.18, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 260 }));
          catchSound('chime', { volume: 0.8 });
          catchHaptic('hitSoft', 2); // one climax haptic per reveal: the burst
        });
      }
      return;
    }
    if (beat === 'book') {
      // The Collection Book page slides up, the slot pops in with the find, the count ticks, and a new find
      // gets the NEW! stamp slammed onto its slot.
      page.value = rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 14, stiffness: 160 });
      if (!rm) catchSound('whoosh', { volume: 0.45 });
      fill.value = rm ? withTiming(1, { duration: 200 }) : withDelay(compact ? 120 : 300, withSpring(1, { damping: 9, stiffness: 220 }));
      later(rm ? 0 : compact ? 130 : 310, () => { catchSound('pop', { volume: 0.75, pitch: 7 }); catchHaptic('hitSoft', 2); });
      if (d.isNew) {
        stamp.value = rm ? withTiming(1, { duration: 200 }) : withDelay(600, withSequence(withTiming(1, { duration: 110, easing: Easing.in(Easing.quad) }),
          withSpring(1, { damping: 10, stiffness: 300 })));
        later(rm ? 0 : 710, () => { catchSound('stamp', { volume: 1 }); catchHaptic('hitRigid', 4); });
      } else if (d.newBest) {
        // NEW BEST!: the caught slot flips to gold over 600 ms (its stars step up at the half), then the gold stamp.
        const at0 = compact ? 160 : 340;
        best.value = rm ? withTiming(1, { duration: 1 }) : withDelay(at0, withTiming(1, { duration: NEW_BEST_SWAP_MS, easing: Easing.inOut(Easing.cubic) }));
        later(rm ? 0 : at0 + NEW_BEST_SWAP_MS / 2, () => { catchSound('chime', { volume: 0.9 }); catchSound('sparkle', { volume: 0.7 }); });
        stamp.value = rm ? withTiming(1, { duration: 200 }) : withDelay(at0 + NEW_BEST_SWAP_MS - 120, withSequence(withTiming(1, { duration: 110, easing: Easing.in(Easing.quad) }),
          withSpring(1, { damping: 10, stiffness: 300 })));
        later(rm ? 0 : at0 + NEW_BEST_SWAP_MS - 10, () => { catchSound('stamp', { volume: 1 }); catchHaptic('hitRigid', 4); });
      }
      return;
    }
    if (beat === 'actions') {
      actions.value = rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 12, stiffness: 180 });
      if (!stateRef.current.skipped) markSeen(d.tier);
      if (d.tier === 5 && !rm && !compact) {
        // The Legendary finale: two more confetti volleys from both sides as the buttons arrive.
        volleyB.value = withTiming(1, { duration: 2000, easing: Easing.linear });
        volleyC.value = withDelay(120, withTiming(1, { duration: 2000, easing: Easing.linear }));
        catchSound('reward', { volume: 0.6 });
      }
      // The light settles: the rays stop turning 4 s after the buttons (no idle animation left running).
      later(4000, () => { cancelAnimation(spin); cancelAnimation(float); });
      setPhase('actions');
      onActionsRef.current?.(compact);
      const auto = inputRef.current ? autoContinueMs(inputRef.current) : null;
      if (auto != null) later(auto, () => { if (!shareTapped.current) onContinuePressRef.current(); });
    }
  }, [reducedMotion, dispatch, later, L.medal, cx, width, xp, xpIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beats always run with the latest render's values (the reveal's data changes when the server answers).
  const runBeatRef = useRef(runBeat);
  runBeatRef.current = runBeat;
  /** One wobble: the print shivers, a rising tick, a selection haptic (the last one heavier). */
  const shiver = useCallback((i: number, n: number) => {
    const amp = 0.55 + 0.22 * Math.min(i, 3);
    wobble.value = withSequence(withTiming(amp, { duration: 70 }), withTiming(-amp, { duration: 110 }),
      withTiming(amp * 0.4, { duration: 90 }), withTiming(0, { duration: 90 }));
    catchSound('tick', { pitch: 3 + Math.min(i, 4) * 4, volume: 0.85 });
    catchHaptic(i === n - 1 ? 'hitMedium' : 'tickSelection', 2);
  }, [wobble]);

  /** Phase B: from the burst on, timed from the final plan (the server's rewards are in). */
  const runFromBurst = useCallback(() => {
    const d = dataRef.current;
    if (!d) return;
    const finalInput: RevealInput = { ...(inputRef.current as RevealInput), isNew: d.isNew, rewards: d.rewards,
      compact: isCompact(seenTiers, d.tier, d.isNew), newBest: !!d.newBest };
    inputRef.current = finalInput;
    const plan = revealPlan(finalInput);
    planRef.current = plan;
    // A tap-skip never jumps past NEW! or NEW BEST! (both land on the book).
    stateRef.current = { ...stateRef.current, isNew: d.isNew || !!d.newBest };
    const start = plan.find(slot => slot.beat === 'burst')?.at ?? 0;
    for (const slot of plan) if (slot.at >= start) later(slot.at - start, () => runBeatRef.current(slot.beat));
  }, [later, runBeat]);

  /**
   * The find rode by (or the call failed): the print shakes free and slides off with a tilt; SO CLOSE! in gold,
   * the rides left as vehicles (used ones dim) and, when another ride is possible, RIDE AGAIN right here.
   */
  const runEscape = useCallback(() => {
    catchMark('reveal-escape');
    cancelAnimation(wobble);
    const rm = reducedMotion;
    if (!rm) wobble.value = withSequence(withTiming(1.3, { duration: 60 }), withTiming(-1.3, { duration: 80 }), withTiming(0, { duration: 80 }));
    charge.value = withTiming(0, { duration: 200 });
    spot.value = withTiming(0, { duration: 300 });
    if (!rm) rays.value = withTiming(0.3, { duration: 500 });
    flee.value = withDelay(rm ? 0 : 220, withTiming(1, { duration: rm ? 200 : 300, easing: Easing.in(Easing.cubic) }));
    title.value = withDelay(rm ? 0 : 300, rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 9, stiffness: 220 }));
    escapeIn.value = withDelay(rm ? 0 : 520, rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 12, stiffness: 180 }));
    // What got away: its medallion as a dark silhouette with a gold "?", bobbing where the find would have burst.
    medal.value = withDelay(rm ? 0 : 380, rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 10, stiffness: 200 }));
    item.value = withDelay(rm ? 0 : 420, rm ? withTiming(1, { duration: 200 }) : withSpring(1, { damping: 9, stiffness: 200 }));
    // The ride just used cracks and dims, with a thunk.
    crack.value = withDelay(rm ? 0 : 900, withTiming(1, { duration: rm ? 1 : 420, easing: Easing.out(Easing.quad) }));
    later(rm ? 0 : 900, () => { catchSound('pop', { volume: 0.8, pitch: -5 }); catchHaptic('hitSoft', 2); });
    later(240, () => { catchSound('aww'); catchHaptic('softBump', 2); later(90, () => catchHaptic('softBump', 1)); });
    later(rm ? 300 : 700, () => { catchSound('stamp', { volume: 0.6 }); catchHaptic('tickSelection', 1); });
    const retry = !!escapeRef.current?.canRetry;
    setPhase('escape');
    // With no ride left (or nothing to retry) it returns to the map on its own.
    if (!retry) later(rm ? 1400 : 2200, () => leaveEscape('map'));
  }, [reducedMotion, later]); // eslint-disable-line react-hooks/exhaustive-deps
  const escapeRef = useRef(escape);
  escapeRef.current = escape;
  const [againPressed, setAgainPressed] = useState(false);
  const leaveEscape = useCallback((choice: 'map' | 'again') => {
    if (phaseRef.current !== 'escape') return;
    clearTimers();
    // Nothing keeps turning under the held card (the next viewfinder opens under it); the rays go first.
    cancelAnimation(spin); cancelAnimation(float);
    rays.value = withTiming(0, { duration: 160 });
    if (flags) flags.hidden.value = true; // the held print leaves with the card, never ghosts over the map
    setPhase('leaving');
    // RIDE AGAIN: the card stays up, covering, until the next ride's viewfinder is open (the map never flashes).
    if (choice === 'map') shown.value = withTiming(0, { duration: 260 });
    onEscapedRef.current(choice);
  }, [clearTimers, flags]); // eslint-disable-line react-hooks/exhaustive-deps
  const onEscapedRef = useRef(onEscaped);
  onEscapedRef.current = onEscaped;
  const onActionsRef = useRef(onActions);
  onActionsRef.current = onActions;
  /** RIDE AGAIN answers the tap at once: the button reads "Here it comes!" and the car slides off toward the ride. */
  const onAgainPress = useCallback(() => {
    if (phaseRef.current !== 'escape') return;
    setAgainPressed(true);
    catchSound('pop', { volume: 0.7, pitch: 4 }); catchHaptic('tapLight', 3);
    againGo.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.cubic) });
    requestAnimationFrame(() => leaveEscape('again'));
  }, [leaveEscape]); // eslint-disable-line react-hooks/exhaustive-deps

  /** At the burst's time: go on if the server has answered, or keep shivering (Legendary's roll) until it does. */
  const atBurst = useCallback((startedWaiting: number, i = 0) => {
    const result = outcomeRef.current;
    if (result === 'caught') { waiting.current = null; runFromBurst(); return; }
    if (result === 'escaped') { waiting.current = null; runEscape(); return; }
    if (Date.now() - startedWaiting > PENDING_WOBBLE_CAP_MS) { waiting.current = null; runEscape(); return; }
    // Still rolling: one more shiver, and listen for the answer.
    waiting.current = () => atBurst(startedWaiting, i + 1);
    if (!reducedMotion) shiver(WOBBLES[dataRef.current?.tier ?? 2] + i, 99);
    later(WOBBLE_MS, () => { const next = waiting.current; if (next) next(); });
  }, [runFromBurst, runEscape, shiver, later, reducedMotion]);

  // The answer lands while the print is shivering: act on it at once (no waiting out the shiver).
  useEffect(() => {
    if (outcome === 'pending' || !waiting.current) return;
    const next = waiting.current;
    waiting.current = null;
    clearTimers();
    next();
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start (or reset) per reveal key.
  useEffect(() => {
    clearTimers();
    waiting.current = null;
    allValues.forEach(v => { cancelAnimation(v); v.value = 0; });
    bump.forEach(v => { v.value = 1; });
    if (!data) { shown.value = withTiming(0, { duration: 220 }); setPhase('idle'); return; }
    const compact = isCompact(seenTiers, data.tier, data.isNew);
    const input: RevealInput = { tier: data.tier, grade: data.grade, isNew: data.isNew, golden: data.golden, reducedMotion, rewards: data.rewards, compact,
      newBest: !!data.newBest };
    inputRef.current = input;
    const plan = revealPlan(input);
    planRef.current = plan;
    stateRef.current = revealStart(canSkip(seenTiers, data.tier), data.isNew || !!data.newBest);
    shareTapped.current = false;
    setAgainPressed(false);
    if (flags) flags.hidden.value = false;
    shown.value = 1;
    setPhase('playing');
    catchMark(`reveal-start tier=${data.tier} grade=${data.grade} new=${data.isNew} compact=${compact}`);
    spin.value = 0;
    if (!reducedMotion) spin.value = withRepeat(withTiming(1, { duration: data.tier === 5 ? 20_000 : 14_000, easing: Easing.linear }), -1, false);
    if (!reducedMotion) float.value = withRepeat(withSequence(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 1300, easing: Easing.inOut(Easing.quad) })), -1, false);
    const burstAt = plan.find(slot => slot.beat === 'burst')?.at ?? 0;
    for (const slot of plan) if (slot.at < burstAt) later(slot.at, () => runBeatRef.current(slot.beat));
    later(burstAt, () => atBurst(Date.now()));
    return () => { cancelAnimation(spin); cancelAnimation(float); };
  }, [data?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareTapped = useRef(false);
  const skip = useCallback((event?: GestureResponderEvent) => {
    if (!dataRef.current || phaseRef.current !== 'playing') return;
    // Before the answer is in, a tap only sparkles (the roll is real; nothing to skip to yet).
    const pos = event?.nativeEvent ? { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY } : null;
    if (pos && !reducedMotion) { tapAt.value = pos; tapSpark.value = 0; tapSpark.value = withTiming(1, { duration: 420 }); }
    if (waiting.current || outcomeRef.current !== 'caught') return;
    const before = stateRef.current;
    const next = dispatch({ type: 'tap' });
    if (next === before) {
      // First viewing: the tap is never wasted. The counts that are running finish at once.
      rowP.forEach((v, i) => { if (v.value > 0 && v.value < 1 && !(i === xpIndex && xp.bonus > 0)) { cancelAnimation(v); v.value = withTiming(1, { duration: 90 }); } });
      catchSound('tick', { pitch: 9, volume: 0.6 });
      return;
    }
    clearTimers();
    catchMark(`reveal-skip to=${next.beat}`);
    if (next.beat === 'book') {
      settle(160, true);
      later(170, () => runBeatRef.current('book'));
      const plan = planRef.current;
      const book = plan.find(slot => slot.beat === 'book');
      const actionsSlot = plan.find(slot => slot.beat === 'actions');
      later(170 + (book && actionsSlot ? actionsSlot.at - book.at : 800), () => runBeatRef.current('actions'));
    } else {
        settle(160);
      later(170, () => runBeatRef.current('actions'));
    }
    catchSound('pop', { volume: 0.6, pitch: 5 });
  }, [dispatch, clearTimers, settle, later, runBeat, reducedMotion, xpIndex, xp.bonus]); // eslint-disable-line react-hooks/exhaustive-deps

  const onContinuePress = useCallback(() => {
    const next = dispatch({ type: 'continue' });
    if (!next.done) return;
    clearTimers();
    catchMark('reveal-continue');
    // On this frame (UI thread): the viewfinder under the reveal hides, the light stops turning, and the card
    // shrinks to 0.92 as it fades onto the map. The hand-off (React state) starts on the next frame.
    if (flags) flags.hidden.value = true;
    cancelAnimation(spin); cancelAnimation(float);
    shown.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.quad) });
    exit.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
    setPhase('leaving');
    requestAnimationFrame(() => onContinue());
  }, [dispatch, clearTimers, onContinue, flags]); // eslint-disable-line react-hooks/exhaustive-deps
  const onContinuePressRef = useRef(onContinuePress);
  onContinuePressRef.current = onContinuePress;
  const onSharePress = useCallback(() => { shareTapped.current = true; onShare(); }, [onShare]);
  // The scrim is fully opaque: the viewfinder under it may stop redrawing (a UI-thread flag, no React).
  const noFlag = useSharedValue(false);
  const coveredFlag = flags?.covered ?? noFlag;
  useAnimatedReaction(() => bg.value >= 0.99 && shown.value >= 0.99, (on, was) => { if (on !== was) coveredFlag.value = on; });


  // Development recordings: CONTINUE presses itself once the buttons are up; a scripted skip.
  useEffect(() => {
    if (!__DEV__ || autoContinue == null || (phase !== 'actions' && phase !== 'escape') || !data) return;
    const timer = setTimeout(() => (phase === 'escape' ? leaveEscape(autoEscape) : onContinuePress()), autoContinue);
    return () => clearTimeout(timer);
  }, [phase, data?.key, autoContinue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!__DEV__ || autoSkipMs == null || !data) return;
    const timer = setTimeout(() => skip(), autoSkipMs);
    return () => clearTimeout(timer);
  }, [data?.key, autoSkipMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Styles ──
  const rootStyle = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: 1 - 0.08 * exit.value }] }));
  const whiteStyle = useAnimatedStyle(() => ({ opacity: whiteout.value, transform: [{ scale: 0.7 + 0.5 * (1 - whiteout.value / 0.6) }] }));
  const starFlashStyle = useAnimatedStyle(() => {
    const f = starFlash.value;
    return { opacity: f <= 0 || f >= 1 ? 0 : f < 0.25 ? 1 : (1 - f) / 0.75, transform: [{ scale: 0.4 + 0.9 * f }, { rotate: `${f * 30}deg` }] };
  });
  const bgStyle = useAnimatedStyle(() => ({ opacity: bg.value }));
  const chargeStyle = useAnimatedStyle(() => ({ opacity: charge.value * 0.9 }));
  const spotStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, spot.value) * 0.9, transform: [{ scale: 0.85 + 0.25 * spot.value }] }));
  // The print's contact shadow on the stage (gone once it tucks away).
  const shadowStyle = useAnimatedStyle(() => ({ opacity: 0.5 * Math.min(1, printPos.value) * (1 - printTuck.value) * (1 - flee.value) }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ scale: 1 + 1.6 * (1 - flash.value) }] }));
  const rayStyle = useAnimatedStyle(() => ({
    opacity: rays.value * (tier >= 4 ? 0.95 : 0.8), transform: [{ rotate: `${-spin.value * 360}deg` }, { scale: 0.5 + 0.5 * rays.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, medal.value) * (0.85 + 0.15 * float.value), transform: [{ scale: 0.8 + 0.25 * medal.value }] }));
  const printStyle = useAnimatedStyle(() => {
    const p = printPos.value, k = printTuck.value, g = flee.value;
    // Held spot -> centre stage (lift) -> collapses at the burst -> back as a tucked polaroid; or slides off (escape).
    // Reduce Motion: the print stays at its held spot at full size (no lift, no scale), and cross-fades.
    const liftY = reducedMotion ? hero.cy : hero.cy + (L.lift - hero.cy) * p;
    const liftScale = reducedMotion ? 1 : 1 + 0.06 * p;
    const gm = reducedMotion ? 0 : g; // Reduce Motion: the escaping print fades in place
    const x = cx + (tuck.x - cx) * k + gm * width * 0.9;
    const y = liftY + (tuck.y - liftY) * k - gm * 40;
    const gone = printGone.value;
    const scale = (liftScale + (tuck.scale - liftScale) * k) * (1 + 0.08 * punch.value) * (reducedMotion ? 1 : 1 - gone);
    const rot = (reducedMotion ? 0 : wobble.value * 10) + tuck.rot * k + gm * 15;
    return { opacity: (1 - g) * (reducedMotion ? 1 - gone : 1), transform: [{ translateX: x - hero.w / 2 }, { translateY: y - hero.h / 2 }, { scale }, { rotate: `${rot}deg` }] };
  });
  const tapeStyle = useAnimatedStyle(() => ({ opacity: printTuck.value }));
  const printFlashStyle = useAnimatedStyle(() => ({ opacity: printFlash.value }));
  // Reduce Motion: the medallion and the find fade in at full size (no zoom).
  const medalStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, medal.value * 2), transform: [{ scale: reducedMotion ? 1 : medal.value }] }));
  const itemStyle = useAnimatedStyle(() => {
    // The find leaves the photo's centre and lands in the medallion.
    const k = Math.min(1, item.value);
    return {
      opacity: reducedMotion ? k : item.value > 0 ? 1 : 0,
      transform: reducedMotion ? [{ translateY: 0 }, { scale: 1 }]
        : [{ translateY: (1 - k) * (L.lift - L.medal) - 5 * float.value }, { scale: item.value <= 0 ? 0.2 : 0.2 + 0.8 * item.value }],
    };
  });
  // Reduce Motion: every piece cross-fades in place (no scale, no slide).
  const rmOn = reducedMotion;
  const titleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, title.value * 1.6), transform: [{ scale: rmOn ? 1 : title.value <= 0 ? 0.5 : title.value }] }));
  const ribbonStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, ribbon.value * 1.5), transform: [{ scaleX: rmOn ? 1 : 0.25 + 0.75 * ribbon.value }] }));
  const chipsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, chips.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - chips.value) * 12 }] }));
  const tallyStyle = useAnimatedStyle(() => ({ opacity: tally.value }));
  const rowStyle0 = useAnimatedStyle(() => ({ opacity: Math.min(1, rowIn0.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - rowIn0.value) * 26 }, { scale: rmOn ? 1 : (0.6 + 0.4 * rowIn0.value) * bump0.value }] }));
  const rowStyle1 = useAnimatedStyle(() => ({ opacity: Math.min(1, rowIn1.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - rowIn1.value) * 26 }, { scale: rmOn ? 1 : (0.6 + 0.4 * rowIn1.value) * bump1.value }] }));
  const rowStyle2 = useAnimatedStyle(() => ({ opacity: Math.min(1, rowIn2.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - rowIn2.value) * 26 }, { scale: rmOn ? 1 : (0.6 + 0.4 * rowIn2.value) * bump2.value }] }));
  const rowStyle3 = useAnimatedStyle(() => ({ opacity: Math.min(1, rowIn3.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - rowIn3.value) * 26 }, { scale: rmOn ? 1 : (0.6 + 0.4 * rowIn3.value) * bump3.value }] }));
  const rowStyles = [rowStyle0, rowStyle1, rowStyle2, rowStyle3];
  // From the grade chip into the XP plaque's number (not its icon); it shrinks and fades as it lands.
  const fromX = cx + 70, fromY = L.chips + 16;
  const toX = plaqueX(Math.max(0, xpIndex)), toY = L.tally + plaqueH * 0.74;
  const bonusStyle = useAnimatedStyle(() => {
    const f = bonusFly.value;
    const x = fromX + (toX - fromX) * f;
    const y = fromY + (toY - fromY) * f - Math.sin(f * Math.PI) * 50;
    return { opacity: f <= 0 || f >= 1 ? 0 : f > 0.8 ? (1 - f) / 0.2 : 1, transform: [{ translateX: x - 46 }, { translateY: y - 16 }, { scale: 1 - 0.45 * f }] };
  });
  const crackStyle = useAnimatedStyle(() => {
    const c = crack.value;
    const shake = rmOn || c <= 0 || c >= 0.3 ? 0 : Math.sin(c * Math.PI * 20) * 4;
    return { opacity: 1 - 0.55 * c, transform: [{ translateX: shake }, { rotate: `${rmOn ? 0 : Math.sin(c * Math.PI * 4) * 8 * (1 - c)}deg` }, { scale: rmOn ? 1 : 1 - 0.1 * c }] };
  });
  const greyStyle = useAnimatedStyle(() => ({ opacity: 0.55 * crack.value }));
  // RIDE AGAIN: the next ride's vehicle lights up and rolls forward on the tap.
  const nextRideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: rmOn ? 0 : againGo.value * 14 }, { scale: 1 + 0.12 * againGo.value }],
    borderColor: againGo.value > 0 ? '#ffffff' : BRAND.gold }));
  const crackLineStyle = useAnimatedStyle(() => ({ opacity: crack.value > 0.15 ? 1 : 0, transform: [{ rotate: '-28deg' }, { scaleX: Math.min(1, crack.value * 2) }] }));
  const escapeStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, escapeIn.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - escapeIn.value) * 30 }] }));
  const pageStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, page.value * 1.4), transform: [{ translateY: rmOn ? 0 : (1 - page.value) * 90 }] }));
  const stampNew = !!view?.isNew || !!view?.newBest;
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampNew && stamp.value > 0 ? (rmOn ? Math.min(1, stamp.value) : 1) : 0,
    transform: [{ rotate: '-12deg' }, { scale: rmOn ? 1 : stamp.value <= 0 ? 2.4 : 2.4 - 1.4 * Math.min(1, stamp.value) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value <= 0 || ring.value >= 1 ? 0 : 1 - ring.value,
    transform: [{ scale: 0.6 + (width / 60) * 0.75 * ring.value }],
  }));
  const tapStyle = useAnimatedStyle(() => ({
    opacity: tapSpark.value <= 0 || tapSpark.value >= 1 ? 0 : 1 - tapSpark.value,
    transform: [{ translateX: tapAt.value.x - 18 }, { translateY: tapAt.value.y - 18 }, { scale: 0.6 + 0.8 * tapSpark.value }, { rotate: `${tapSpark.value * 90}deg` }],
  }));
  const actionsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, actions.value * 1.5), transform: [{ translateY: rmOn ? 0 : (1 - actions.value) * 40 }] }));

  const d = view;
  const active = !!data && phase !== 'leaving';
  const plate = d ? PRINT_STAGE_FOR[d.grade] : 'white';
  const frame = PRINT_FRAME_FILL[plate];
  const inActions = phase === 'actions';
  const rarityText = d ? rarityLabel(d.rarity).toUpperCase() : '';
  const escaped = outcome === 'escaped';
  // The NEW! stamp sits on the new slot when the grid shows it, else on the page corner.
  const slotsShown = Math.min(MAX_SLOTS, book.total);
  const newIndex = d?.slots ? d.slots.findIndex(slot => slot.isNew || !!slot.newBest)
    : !d?.isNew && d?.newBest && book.after > 0 ? 0 : book.newIndex ?? -1;
  const perRow = 8;
  const pageW = width - 40;
  const cell = 38 + 4;
  const gridW = Math.min(perRow, Math.max(1, slotsShown)) * cell - 4;
  // The stamp sits on the slot's lower half, overhanging only toward the panel's middle, never past a 6 pt inset.
  const stampW = !d?.isNew && d?.newBest ? 92 : 54;
  const slotLeft = (pageW - 6 - gridW) / 2 + (newIndex % perRow) * cell;
  const towardMiddle = slotLeft + 19 < (pageW - 6) / 2 ? slotLeft - 4 : slotLeft + 42 - stampW;
  const stampAt = book.grid && newIndex >= 0 && newIndex < slotsShown
    ? { left: Math.min(pageW - 6 - 6 - stampW, Math.max(6, towardMiddle)), top: 34 + 10 + Math.floor(newIndex / perRow) * cell + 22 }
    : { left: -14, top: -22 };
  // CONTINUE keeps 12 pt clear of the book panel's bottom edge (its border included).
  const bookRows = book.grid ? Math.ceil(Math.max(1, slotsShown) / perRow) : 0;
  const bookH = Math.max(112 * u, 34 + 20 + (book.grid ? bookRows * cell - 4 : 24) + 9);
  const actionsTop = Math.max(L.actions, L.book + bookH + 12);
  const ridesLeft = escape?.ridesLeft ?? null;
  const vehicleArt = escape?.vehicle ? VEHICLE[escape.vehicle] ?? VEHICLE.coaster : VEHICLE.coaster;

  return (
    <Animated.View pointerEvents={active ? 'box-none' : 'none'} style={[StyleSheet.absoluteFill, rootStyle]}
      accessibilityElementsHidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      {/* The stage: the house reveal scrim, deep navy, over the frozen viewfinder */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrimBase, bgStyle]}>
        <Image source={SCRIM} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
        {/* Rarity light: a white ray fan tinted to the rarity, spun by a native transform (one small texture);
            both fans stay mounted so the first Epic never decodes mid-reveal */}
        <Animated.View style={[styles.abs, { width: raysSize, height: raysSize, left: cx - raysSize / 2, top: L.medal - raysSize / 2 }, rayStyle]}>
          <Image source={RAYS_TINT} style={[StyleSheet.absoluteFill, tier >= 4 && styles.hidden]} contentFit="fill" transition={0} tintColor={RAY_COLOR[tier]} />
          <Image source={RAYS_TINT_18} style={[StyleSheet.absoluteFill, tier < 4 && styles.hidden]} contentFit="fill" transition={0} tintColor={RAY_COLOR[tier]} />
        </Animated.View>
        <Animated.View style={[styles.abs, { width: medalSize * 2.2, height: medalSize * 2.2, left: cx - medalSize * 1.1, top: L.medal - medalSize * 1.1 }, glowStyle]}>
          <Image source={GLOW} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
        </Animated.View>
        {/* The spotlight the print rises onto, and its contact shadow */}
        <Animated.View style={[styles.abs, { width: 560, height: 560, left: cx - 280, top: L.lift - 280 }, spotStyle]}>
          <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor={RAY_COLOR[tier]} />
        </Animated.View>
        <Animated.View style={[styles.abs, { width: hero.w * 1.1, height: 46, left: cx - hero.w * 0.55, top: L.lift + hero.h * 0.5 - 4 }, shadowStyle]}>
          <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#000814" />
        </Animated.View>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.charge, chargeStyle]} />

      {/* Tap anywhere: sparkles; once this tier's reveal was seen in full, skips ahead */}
      <Pressable accessibilityRole="button" accessibilityLabel="Skip" accessibilityElementsHidden={!active || inActions}
        importantForAccessibility={active && !inActions ? 'auto' : 'no-hide-descendants'}
        disabled={!active || inActions} onPress={skip} style={StyleSheet.absoluteFill} />

      {/* Title (a catch) or SO CLOSE! (it rode by) */}
      <Animated.View pointerEvents="none" style={[styles.titleWrap, { top: L.title, width }, titleStyle]}>
        <View style={[styles.crown, !(tier === 5 && !escaped) && styles.hidden]}><GameIcon name="crown" size={40} /></View>
        <StrokedText style={{ ...styles.title, fontSize: 46 * u, color: escaped ? '#ffe07a' : TITLE_FILL[tier] }} strokeColor={INK} numberOfLines={1}
          adjustsFontSizeToFit>{escaped ? 'SO CLOSE!' : revealTitle(tier)}</StrokedText>
      </Animated.View>

      {/* Legendary: an 8-point star flash behind the medallion (two crossed gold squares) */}
      <Animated.View pointerEvents="none" style={[styles.abs, styles.starFlash, { width: medalSize * 1.3, height: medalSize * 1.3, left: cx - medalSize * 0.65, top: L.medal - medalSize * 0.65 }, starFlashStyle]}>
        <View style={[StyleSheet.absoluteFill, styles.starRay]} />
        <View style={[StyleSheet.absoluteFill, styles.starRay, { transform: [{ rotate: '45deg' }] }]} />
      </Animated.View>
      {/* The medallion and the find */}
      <Animated.View pointerEvents="none" style={[styles.medal, { width: medalSize, height: medalSize, left: cx - medalSize / 2, top: L.medal - medalSize / 2 }, medalStyle]}>
        {/* All four medallions stay mounted (decoded once), the current tier shows */}
        {([2, 3, 4, 5] as const).map(k => <Image key={k} source={MEDAL[k]} style={[StyleSheet.absoluteFill, { opacity: k === tier ? 1 : 0 }]}
          contentFit="contain" transition={0} />)}
        <View style={[styles.medalFace, { width: medalSize * 0.7, height: medalSize * 0.7, borderRadius: medalSize * 0.35, marginTop: -medalSize * 0.04 }]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.item, { width: medalSize * 0.66, height: medalSize * 0.66, left: cx - medalSize * 0.33, top: L.medal - medalSize * 0.37 }, itemStyle]}>
        <Image source={d?.art ?? undefined} style={StyleSheet.absoluteFill} contentFit="contain" transition={0}
          tintColor={escaped ? '#1b3a5c' : undefined} />
        <Text style={[styles.mystery, !escaped && styles.gone]}>?</Text>
      </Animated.View>

      {/* The print: picked up where the viewfinder held it, then tucked beside the medallion as a taped polaroid */}
      <Animated.View pointerEvents="none" style={[styles.print, { width: hero.w, height: hero.h, paddingBottom: hero.strip }, printStyle]}>
        <LinearGradient colors={frame} style={[StyleSheet.absoluteFill, styles.printFill]} />
        <View style={[styles.photo, { width: hero.photoW, height: hero.photoH }]}>
          <Canvas style={{ width: hero.photoW, height: hero.photoH }}>
            {/* Bound only while a reveal is live: the photo is freed after the moment ends (never drawn after). */}
            <SkImageNode image={data?.photo ?? BLANK_IMAGE} x={0} y={0} width={hero.photoW} height={hero.photoH} fit="fill" />
          </Canvas>
          <View style={[styles.bombTag, !d?.photobombed && styles.gone]} accessibilityLabel="Photobombed">
            <Text style={styles.bombText}>Photobombed!</Text>
          </View>
        </View>
        <View style={[styles.caption, { height: hero.strip - 14 }]}>
          <Text style={styles.captionName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{d?.name ?? ''}</Text>
          <Text style={styles.captionDate} numberOfLines={1}>on the {d?.rideName ?? ''}  ·  {d?.date ?? ''}</Text>
        </View>
        <View style={[styles.printStamp, { bottom: hero.strip + 2 }]}><StampPlate grade={d?.grade ?? 'good'} size={1} /></View>
        <Animated.View style={[styles.tape, tapeStyle]} />
        {/* The burst flash lights the photo (the gold frame stays), tinted to the rarity */}
        <Animated.View style={[styles.printFlash, { left: 12, top: 12, width: hero.photoW, height: hero.photoH }, printFlashStyle]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff', borderRadius: 5 }]} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: RAY_COLOR[tier], opacity: 0.35, borderRadius: 5 }]} />
        </Animated.View>
      </Animated.View>

      {/* Name ribbon, then the rarity chip, the photo grade and Golden Hour */}
      <Animated.View pointerEvents="none" style={[styles.ribbon, { top: L.ribbon, left: (width - width * 0.86) / 2, width: width * 0.86, height: 70 * u }, ribbonStyle]}>
        <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
        <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{d?.name ?? ''}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.chips, { top: L.chips, width }, chipsStyle]}>
        <View style={[styles.rarityChip, { backgroundColor: color }]}>
          {tier >= 4 ? <Text style={styles.glyph}>{tier === 5 ? '♛' : '◆'}</Text>
            : Array.from({ length: tier - 1 }, (_, i) => <View key={i} style={styles.pip} />)}
          <Text style={styles.chipText}>{rarityText}</Text>
        </View>
        <View style={[styles.gradeChip, d?.grade === 'frame_it' && styles.gold]}>
          {Array.from({ length: GRADE_STARS[d?.grade ?? 'good'] }, (_, i) => <GameIcon key={i} name="star" size={17} />)}
          <Text style={styles.gradeText}>{GRADE_BONUS_LABEL[d?.grade ?? 'good']}</Text>
        </View>
        <View style={[styles.gradeChip, styles.gold, !d?.golden && styles.gone]}><GameIcon name="sparkle" size={17} /><Text style={styles.gradeText}>Golden Hour</Text></View>
      </Animated.View>

      {/* The tally: four plaques always mounted; XP, coins, Energy and Tickets count up from 0 */}
      <Animated.View pointerEvents="none" style={[styles.tally, { top: L.tally, width }, tallyStyle]}>
        {Array.from({ length: MAX_ROWS }, (_, i) => {
          const row = rows[i];
          return (
            <Animated.View key={i} style={[rowStyles[i], !row && styles.gone]}>
              <View style={[styles.plaque, { width: plaqueW, height: plaqueH }]}>
                <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.plaqueGloss} />
                <GameIcon name={ROW_ICON[row?.key ?? 'xp']} size={40 * u} />
                <CountText to={row?.to ?? 0} progress={rowP[i]} style={[styles.plaqueText, { minWidth: plaqueW - 8 }]} />
              </View>
            </Animated.View>
          );
        })}
      </Animated.View>
      {/* The photo bonus: the grade's stars fly into the XP plaque */}
      <Animated.View pointerEvents="none" style={[styles.bonusChip, d?.grade === 'frame_it' && styles.gold, bonusStyle]}>
        {Array.from({ length: GRADE_STARS[d?.grade ?? 'good'] }, (_, i) => <GameIcon key={i} name="star" size={14} />)}
        <Text style={styles.bonusText}>+{xp.bonus}</Text>
      </Animated.View>

      {/* The Collection Book page */}
      <Animated.View pointerEvents="none" style={[styles.page, { top: L.book, left: 20, width: pageW, minHeight: 112 * u }, pageStyle]}
        accessible accessibilityLabel={`${d?.setName ?? 'Collection Book'}${book.total > 0 ? `, ${book.after} of ${book.total}` : ''}. ${d?.isNew ? 'Added to your Collection Book' : d?.caughtCount && d.caughtCount > 1 ? `Caught ${d.caughtCount} times` : 'Already in your book'}${d?.newBest ? '. New best photo' : ''}`}>
        <View style={[styles.pageHead, { backgroundColor: d?.setColor ?? BRAND.gold }]}>
          <GameIcon name="chest" size={20} />
          <Text style={styles.pageTitle} numberOfLines={1}>{d?.setName ?? 'Collection Book'}</Text>
          <View style={book.total > 0 ? null : styles.hidden}>
            <BookCount before={book.before} after={book.after} total={book.total} fill={fill} style={styles.pageCount} />
          </View>
        </View>
        <View style={styles.pageBody}>
          <View style={[styles.slots, { width: gridW }, !book.grid && styles.gone]}>
            {Array.from({ length: MAX_SLOTS }, (_, i) => (
              <Slot key={i} index={i} total={slotsShown} slot={d?.slots?.[i] ?? null} filledFallback={i < book.before}
                isNewFallback={i === book.newIndex} caughtFallback={!d?.isNew && i === 0 && book.after > 0}
                bestFallback={!d?.isNew && !!d?.newBest && i === 0 && book.after > 0}
                color={d?.setColor ?? BRAND.gold} art={d?.art ?? null} fill={fill} best={best}
                times={!d?.isNew && d?.caughtCount && d.caughtCount > 1 ? d.caughtCount : null} />
            ))}
          </View>
          <Text style={[styles.pageLine, book.grid && styles.gone]} numberOfLines={1}>
            {d?.isNew ? 'Added to your Collection Book' : d?.caughtCount && d.caughtCount > 1 ? `Caught ${d.caughtCount} times` : 'Already in your book'}
          </Text>
        </View>
        <Animated.View style={[styles.newStampWrap, stampAt, !(d?.isNew || d?.newBest) && styles.hidden, stampStyle]}>
          <View style={[styles.newStamp, !d?.isNew && d?.newBest && styles.bestStamp]}>
            <Text style={styles.newText}>{!d?.isNew && d?.newBest ? 'NEW BEST!' : 'NEW!'}</Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* The escape: the rides left as vehicles (used ones dim), then RIDE AGAIN or back to the map */}
      <Animated.View pointerEvents={phase === 'escape' ? 'box-none' : 'none'} style={[styles.escape, { top: L.ribbon + 34 * u, width }, escapeStyle, !escaped && styles.gone]}>
        <View style={[styles.escapeRides, ridesLeft == null && styles.gone]} accessible
          accessibilityLabel={ridesLeft != null ? `${ridesLeft} ${ridesLeft === 1 ? 'ride' : 'rides'} left` : undefined}>
          {Array.from({ length: LEGENDARY_RIDES }, (_, i) => (
            <Animated.View key={i} style={[styles.escapeRide, i < LEGENDARY_RIDES - (ridesLeft ?? 0) - 1 && styles.escapeRideUsed,
              i === LEGENDARY_RIDES - (ridesLeft ?? 0) - 1 && crackStyle, i === LEGENDARY_RIDES - (ridesLeft ?? 0) && nextRideStyle]}>
              <Image source={vehicleArt} style={styles.escapeRideArt} contentFit="contain" transition={0} />
              {i === LEGENDARY_RIDES - (ridesLeft ?? 0) - 1 && <>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.rideGrey, greyStyle]} />
                <Animated.View pointerEvents="none" style={[styles.crackLine, crackLineStyle]} />
                <Animated.View pointerEvents="none" style={[styles.crackLine, styles.crackLineB, crackLineStyle]} />
              </>}
            </Animated.View>))}
        </View>
        <View style={[styles.escapePlate, ridesLeft == null && styles.gone]}>
          <Text style={styles.escapePlateText}>{ridesLeft === 0 ? 'It rode off for today' : `${ridesLeft} ${ridesLeft === 1 ? 'ride' : 'rides'} left`}</Text>
        </View>
        <View style={[styles.escapeActions, !escape?.canRetry && styles.gone]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to the map" onPress={() => leaveEscape('map')} hitSlop={8} style={styles.escapeBack}>
            <GameIcon name="pin" size={30} />
          </Pressable>
          <View style={styles.actionMain}><GameButton label={againPressed ? 'Here it comes!' : 'Ride again'} icon="camera"
            onPress={onAgainPress} loading={againPressed} fullWidth /></View>
        </View>
        {/* A tip for the next ride: the Legendary is read from the car */}
        <View style={[styles.escapeTip, !escape?.canRetry && styles.gone]}>
          <GameIcon name="camera" size={22} />
          <Text style={styles.escapeTipText}>Tip: watch the car, not the lamp</Text>
        </View>
      </Animated.View>

      {/* SHARE (a round icon) and CONTINUE (full width) */}
      <Animated.View pointerEvents={inActions ? 'box-none' : 'none'} style={[styles.actions, { top: actionsTop, width }, actionsStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Share your ride photo" onPress={onSharePress} hitSlop={8} style={styles.share}>
          <Image source={SHARE_ROUND} style={StyleSheet.absoluteFill} contentFit="contain" transition={0} />
          <ShareGlyph size={26} />
        </Pressable>
        <View style={styles.actionMain}><GameButton label="Continue" icon="check" onPress={onContinuePress} fullWidth /></View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.abs, { width: width * 1.2, height: width * 1.2, left: cx - width * 0.6, top: L.medal - width * 0.6 }, flashStyle]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} />
      </Animated.View>
      {/* Burst FX, all always mounted: the ring wave, the stars, three confetti volleys (Epic and Legendary) */}
      <Animated.View pointerEvents="none" style={[styles.ring, { left: cx - 60, top: L.medal - 60, borderColor: RAY_COLOR[tier] }, ringStyle]} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Volley x={cx} y={L.medal} progress={sparkleV} seed={3} stars />
        <Volley x={cx} y={L.medal} progress={volleyA} seed={7} />
        <Volley x={width * 0.12} y={L.medal + 60} progress={volleyB} seed={11} spread={0.7} />
        <Volley x={width * 0.88} y={L.medal + 60} progress={volleyC} seed={19} spread={0.7} />
        {/* Legendary only: gold streamers from the medallion and two firework bursts in the upper third */}
        <Ribbon x={cx - medalSize * 0.3} y={L.medal - medalSize * 0.2} angle={-150} curl={0.32} progress={streamV} />
        <Ribbon x={cx + medalSize * 0.3} y={L.medal - medalSize * 0.2} angle={-30} curl={-0.32} progress={streamV} />
        <Ribbon x={cx} y={L.medal + medalSize * 0.3} angle={100} curl={0.28} progress={streamV} count={10} />
        <Firework x={width * 0.2} y={L.title + 96} progress={fireA} size={88} />
        <Firework x={width * 0.8} y={L.title + 74} progress={fireB} size={76} />
      </View>
      {/* Legendary: the gold bloom, centred on the medallion, clear at the edges */}
      <Animated.View pointerEvents="none" style={[styles.abs, { width: width * 1.5, height: width * 1.5, left: cx - width * 0.75, top: L.medal - width * 0.75 }, whiteStyle]}>
        <Image source={SOFT} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} tintColor="#FFE27A" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.tapSpark, tapStyle]}><GameIcon name="sparkle" size={36} /></Animated.View>
    </Animated.View>
  );
}

export default memo(CatchReveal);

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  hidden: { opacity: 0 },
  gone: { display: 'none' },
  scrimBase: { backgroundColor: '#031C3F' },
  charge: { backgroundColor: '#000814' },
  titleWrap: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  crown: { marginTop: -6 },
  title: {
    fontFamily: 'Shark', letterSpacing: 1,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0,
  },
  medal: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  medalFace: { backgroundColor: '#fff6d6', borderWidth: 4, borderColor: 'rgba(5,52,110,0.35)' },
  item: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  print: { position: 'absolute', left: 0, top: 0, borderRadius: 10, padding: 12 },
  printFill: { borderRadius: 10, borderWidth: 2, borderColor: 'rgba(5,52,110,0.25)' },
  photo: { borderRadius: 5, overflow: 'hidden', backgroundColor: '#2f5560' },
  caption: { position: 'absolute', left: 16, right: 16, bottom: 8, justifyContent: 'center' },
  captionName: { color: INK, fontFamily: 'Knockout', fontSize: 20 },
  captionDate: { color: '#4a6a90', fontFamily: 'Knockout', fontSize: 15 },
  printStamp: { position: 'absolute', right: -6 },
  printFlash: { position: 'absolute', borderRadius: 5 },
  bombTag: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, borderWidth: 2.5,
    borderColor: BRAND.white, backgroundColor: '#ff5a4e', transform: [{ rotate: '-6deg' }] },
  bombText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, letterSpacing: 0.4,
    textShadowColor: '#7a1309', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  tape: { position: 'absolute', top: -14, left: '38%', width: 74, height: 30, borderRadius: 3, backgroundColor: 'rgba(255,246,214,0.85)',
    transform: [{ rotate: '-4deg' }] },
  ribbon: { position: 'absolute', justifyContent: 'center', paddingHorizontal: 48 },
  ribbonText: { fontFamily: 'Shark', fontSize: 25, color: '#7a3d00', textAlign: 'center', marginTop: -6 },
  chips: { position: 'absolute', left: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  rarityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 15, height: 32, paddingHorizontal: 13,
    borderWidth: 2, borderColor: BRAND.white,
  },
  pip: { width: 9, height: 9, borderRadius: 5, backgroundColor: BRAND.white },
  glyph: { color: BRAND.white, fontSize: 16, lineHeight: 19 },
  chipText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, letterSpacing: 0.6 },
  gradeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 15, height: 32, paddingHorizontal: 11,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: INK,
  },
  gold: { backgroundColor: BRAND.gold },
  gradeText: { fontFamily: 'Shark', fontSize: 17, color: INK, marginLeft: 3 },
  tally: { position: 'absolute', left: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 },
  plaque: {
    alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#1a8fe3',
    borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 7, borderBottomColor: '#0b5aa0', overflow: 'hidden',
  },
  plaqueGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  plaqueText: {
    fontFamily: 'Shark', fontSize: 25, color: BRAND.gold, marginTop: 2, padding: 0, textAlign: 'center',
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  bonusChip: {
    position: 'absolute', left: 0, top: 0, width: 92, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 1,
    borderRadius: 16, backgroundColor: BRAND.white, borderWidth: 2, borderColor: INK,
  },
  bonusText: { fontFamily: 'Shark', fontSize: 17, color: INK, marginLeft: 3 },
  page: {
    position: 'absolute', borderRadius: 16, backgroundColor: BRAND.cream, borderWidth: 3, borderColor: INK,
    borderBottomWidth: 6, overflow: 'visible',
  },
  pageHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34,
    borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomWidth: 2, borderBottomColor: INK,
  },
  pageTitle: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.white, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  pageCount: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white, padding: 0, minWidth: 58, textAlign: 'right',
    textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  pageBody: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 6 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  slot: { width: 38, height: 38, borderRadius: 9, backgroundColor: 'rgba(5,52,110,0.07)', alignItems: 'center', justifyContent: 'center' },
  slotFrameMissing: { borderColor: 'rgba(27,58,92,0.55)', borderWidth: 1.5 },
  timesBubble: { position: 'absolute', right: -10, top: -12, minWidth: 30, height: 28, borderRadius: 14, paddingHorizontal: 5, zIndex: 3,
    backgroundColor: INK, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  timesText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white, textShadowColor: INK, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  firework: { position: 'absolute', width: 180, height: 180, alignItems: 'center', justifyContent: 'center' },
  fireCore: { position: 'absolute', width: 70, height: 70 },
  spoke: { position: 'absolute', width: 7, height: 20, borderRadius: 4, backgroundColor: '#ffd23f', borderWidth: 1, borderColor: '#fff1b8' },
  spokeLong: { width: 7, height: 26, backgroundColor: '#ffffff', borderColor: '#ffe07a' },
  escape: { position: 'absolute', left: 0, alignItems: 'center', gap: 14, paddingHorizontal: 20 },
  escapeRides: { flexDirection: 'row', gap: 12 },
  escapeRide: { width: 76, height: 60, borderRadius: 14, backgroundColor: '#0b2f5c', borderWidth: 3, borderColor: BRAND.gold,
    alignItems: 'center', justifyContent: 'center' },
  escapeRideUsed: { opacity: 0.35, borderColor: 'rgba(255,255,255,0.45)' },
  escapeRideArt: { width: 60, height: 40 },
  crackLine: { position: 'absolute', width: 66, height: 3, borderRadius: 2, backgroundColor: '#0b1730', borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.85)' },
  crackLineB: { width: 30, left: 30, top: 22, transform: [{ rotate: '34deg' }] },
  rideGrey: { borderRadius: 11, backgroundColor: '#7c8796' },
  escapePlate: { paddingHorizontal: 18, height: 40, borderRadius: 20, justifyContent: 'center', backgroundColor: BRAND.white, borderWidth: 3, borderColor: INK },
  escapePlateText: { fontFamily: 'Shark', fontSize: 19, color: INK },
  escapeActions: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', marginTop: 24 },
  escapeTip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 16, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  escapeTipText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, letterSpacing: 0.3 },
  starFlash: { alignItems: 'center', justifyContent: 'center' },
  starRay: { margin: '15%', backgroundColor: '#ffd23f', borderRadius: 6, borderWidth: 3, borderColor: '#fff1b8' },
  glitter: { position: 'absolute', left: 83, top: 83, width: 14, height: 14 },
  ribbonSeg: { position: 'absolute', left: 0, top: 0, width: 18, height: 10, borderRadius: 3, overflow: 'hidden', borderWidth: 1, borderColor: '#c27a00' },
  ribbonGloss: { position: 'absolute', left: 0, right: 0, top: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  mystery: { position: 'absolute', fontFamily: 'Shark', fontSize: 64, color: BRAND.gold, textShadowColor: INK,
    textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  escapeBack: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b5aa0',
    borderWidth: 3, borderColor: BRAND.white },
  slotOwned: { backgroundColor: BRAND.white },
  slotFrame: { borderRadius: 8, borderWidth: 2, borderColor: 'rgba(5,52,110,0.22)' },
  slotArt: { width: 34, height: 34 },
  slotMissing: { opacity: 0.3 },
  slotOutline: { position: 'absolute', opacity: 0.6, transform: [{ scale: 1.09 }] },
  slotCheck: { alignItems: 'center', justifyContent: 'center' },
  slotNew: {
    position: 'absolute', left: -4, top: -4, width: 46, height: 46, borderRadius: 11, borderWidth: 3, zIndex: 2,
    backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  slotNewArt: { width: 38, height: 38 },
  pageLine: { fontFamily: 'Shark', fontSize: 16, color: INK, marginTop: 4 },
  newStampWrap: { position: 'absolute', minWidth: 54, height: 24, zIndex: 3 },
  bestStamp: { width: 92, backgroundColor: '#f0a800', borderColor: BRAND.white },
  slotGold: { borderRadius: 8, borderWidth: 3, borderColor: '#ffcf3b', backgroundColor: 'rgba(255,214,90,0.28)' },
  slotStars: { position: 'absolute', bottom: -6, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', zIndex: 2 },
  newStamp: {
    width: 54, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 7,
    backgroundColor: BRAND.red, borderWidth: 2.5, borderColor: BRAND.white,
  },
  newText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, letterSpacing: 1, textShadowColor: '#7a1309', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  actions: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  piece: { position: 'absolute', left: 0, top: 0, borderRadius: 2, overflow: 'hidden' },
  gloss: { position: 'absolute', left: 2, top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 6 },
  tapSpark: { position: 'absolute', left: 0, top: 0, width: 36, height: 36 },
  share: { width: 58, height: 61, alignItems: 'center', justifyContent: 'center', paddingBottom: 4 },
  actionMain: { flex: 1 },
});
