/**
 * Shared Shark Shop v2 pieces: the per-pill clock, timer pills, rarity
 * backplates, set piece chips, the stage kit, the buy payoff (coin arc, land
 * flash), the shop CTA whose label cross-fades, and the docked shop toast.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { FxPauseContext } from '../../fx/FxStage';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeOut, FadeOutDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import type { Pill, PieceState } from '../../helpers/shopShelves';
import type { ShopSetPiece } from '../../models/shop-today';
import { BRAND, BUTTON, BUTTON_ART, FONT, GameIcon, type GameIconName } from '../../ui';
import { artButtonFontSize } from '../../ui/artButtonText';

/** Max Dynamic Type growth inside tiles and pills, so a big font never breaks a tile. */
export const MAX_FONT = 1.3;

/**
 * Shop surfaces in the house look (UI kit: blue panels, white ink, gold accents), never white
 * sheets. Every ink here is AA on every surface here (tools/tests checks the pairs).
 */
export const SHOP_SURFACE = {
  /** Shelf panels and the try-on and wishlist sheets. */
  panel: '#0a4f96',
  /** Cards raised inside a panel (set callouts, the set card, the ready card). */
  card: '#1a5c9e',
  /** Pills on a panel (balance, coin math). */
  well: '#08427f',
  ink: '#ffffff',
  inkSoft: '#e2f6ff',
  /** Section accents on blue (set counts, titles). */
  inkGold: '#ffe07a',
  line: 'rgba(255,255,255,0.22)',
  border: '#ffffff',
  /** Error notes: white on the red lip (never red text on blue). */
  alert: '#b3261b',
} as const;

/** The Set Complete reveal's backdrop; the buy hand-off bridges into it. */
export const REVEAL_NAVY = '#0a2350';

/** The night stage sky (reveal, hero). The hero card uses it too, so its stage has no seam. */
export const NIGHT_SKY = ['#123f80', '#0a2a5c'] as const;

/** A per-instance SVG id, so two stages on one screen never share a gradient. */
let svgIds = 0;
export function useSvgId(prefix: string): string {
  const id = useRef<string | null>(null);
  if (!id.current) id.current = `${prefix}-${++svgIds}`;
  return id.current;
}

/**
 * Server-clock "now" that ticks on the minute boundary. Each pill owns its
 * own tick, so a tick re-renders one pill, never the shelf.
 */
export function useShopNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(Date.now() + offsetMs);
    tick();
    const toBoundary = 60_000 - ((Date.now() + offsetMs) % 60_000) + 50;
    const timeout = setTimeout(() => { tick(); interval = setInterval(tick, 60_000); }, toBoundary);
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, [offsetMs]);
  return now;
}

/** Rarity backplates (top to bottom), Fortnite-style but in Alex's palette. */
export const RARITY_PLATE: Record<number, [string, string]> = {
  // Common is a soft blue, never white on the blue shelves.
  1: ['#e3eef9', '#bcd3ea'],
  2: ['#dcf2ff', '#a3dbfa'],
  3: ['#f6e8fb', '#dcb6ec'],
  4: ['#fff1e2', '#ffc58f'],
  5: ['#fff7cf', '#ffd94a'],
};

export function plateFor(rarity: number | undefined): [string, string] {
  return RARITY_PLATE[rarity && rarity >= 1 && rarity <= 5 ? rarity : 1];
}

export const TimerPill = memo(function TimerPill({ pill, still, icon = 'timer', light = false }: {
  pill: Pill; still: boolean; icon?: GameIconName; light?: boolean;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!pill.urgent || still) { pulse.value = 1; return; }
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false);
    return () => { pulse.value = 1; };
  }, [pill.urgent, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View accessible accessibilityRole="timer" accessibilityLabel={pill.a11y}
      style={[styles.pill, { backgroundColor: pill.urgent ? BRAND.red : light ? 'rgba(255,255,255,0.92)' : 'rgba(5,52,110,0.84)' }, style]}>
      <GameIcon name={icon} size={15} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.pillText, { color: pill.urgent ? BRAND.white : light ? BRAND.navy : BRAND.white }]}>
        {pill.label}
      </Text>
    </Animated.View>
  );
});

/** Wishlist heart: a full-opacity pink outline when off, solid pink when on. */
export function WishHeart({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 21.2s-7.6-4.6-9.6-9.3C1 8.6 3 4.8 6.6 4.8c2.1 0 3.5 1.2 4.4 2.5.9-1.3 2.3-2.5 4.4-2.5 3.6 0 5.6 3.8 4.2 7.1-2 4.7-9.6 9.3-9.6 9.3z"
        fill={on ? '#ff4f8b' : '#ffffff'} stroke={on ? '#c2185b' : '#ff4f8b'} strokeWidth={2.4} strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * A set piece chip: owned (full colour + tick), on the shelf today (tap),
 * away (silhouette, LATER). Labels are a 12pt ribbon inside the chip.
 */
export const PieceChip = memo(function PieceChip({ piece, state, size = 58, selected = false, trying = false, onPress }: {
  piece: ShopSetPiece; state: PieceState; size?: number; selected?: boolean;
  trying?: boolean; onPress?: (piece: ShopSetPiece) => void;
}) {
  const away = state === 'away';
  const label = `${piece.name}, ${trying ? 'trying it on' : state === 'owned' ? 'owned' : state === 'in_shop' ? 'in the shop today' : 'comes back later'}`;
  const ribbon = trying ? 'TRYING' : away ? 'LATER' : null;
  return (
    <Pressable disabled={!onPress} onPress={() => onPress?.(piece)} accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={label} accessibilityState={{ selected }} hitSlop={4}
      style={[styles.piece, { width: size, height: size },
        state === 'owned' && styles.pieceOwned, selected && styles.pieceOn, away && styles.pieceAway, trying && styles.pieceTrying]}>
      {piece.icon_url ? (
        <Image source={piece.icon_thumb_url ?? piece.icon_url} recyclingKey={`piece-${piece.id}`} cachePolicy="memory-disk"
          style={{ width: size * 0.72, height: size * (ribbon ? 0.6 : 0.72), opacity: away ? 0.55 : 1 }} contentFit="contain"
          tintColor={away ? '#8aa0b8' : undefined} />
      ) : null}
      {state === 'owned' && !trying && <View style={styles.pieceBadge}><GameIcon name="check" size={18} /></View>}
      {ribbon && size >= 44 && (
        <View style={[styles.pieceRibbon, trying && { backgroundColor: BRAND.gold }]}>
          <Text maxFontSizeMultiplier={1} style={[styles.pieceRibbonText, trying && { color: BRAND.navy }]}>{ribbon}</Text>
        </View>
      )}
    </Pressable>
  );
});

/** One diagonal sheen sweep (Epic tiles, the "complete the look" CTA). Runs once, never loops off screen. */
export function Sheen({ still, delay = 300, width = 140, every }: { still: boolean; delay?: number; width?: number;
  /** Sweep again every this many ms (Secret tiles: a slow shimmer along the gold), paused with the shelf. */
  every?: number }) {
  const x = useSharedValue(-1);
  const paused = useContext(FxPauseContext);
  useEffect(() => {
    // Paused or still: the band rests off the tile, never frozen across it.
    if (still || (every && paused)) { cancelAnimation(x); x.value = -1; return; }
    const sweep = withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) });
    x.value = -1;
    x.value = every
      ? withDelay(delay, withRepeat(withSequence(sweep, withTiming(1, { duration: every - 900 }), withTiming(-1, { duration: 0 })), -1))
      : withDelay(delay, sweep);
    return () => cancelAnimation(x);
  }, [still, paused]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }, { rotate: '20deg' }] }));
  if (still) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.sheen, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/**
 * The shop's primary button (Dustin's yellow art with the 3D lip). The face
 * mounts once and stays; only the label cross-fades between states, so there
 * is never a frame with the face but no label. Width is known up front, so the
 * label size never waits for a layout pass.
 */
export function ShopCta({ label, icon, width, onPress, loading = false, disabled = false, done = false, muted = false, still, accessibilityHint }: {
  label: string; icon?: GameIconName; width: number; onPress: () => void; loading?: boolean; disabled?: boolean;
  /** "Opening soon": a quiet blue face that reads as waiting, not broken. */
  muted?: boolean;
  /** A green confirmed state with a check (no washed-out disabled look). */
  done?: boolean; still: boolean; accessibilityHint?: string;
}) {
  const height = width / BUTTON.aspectRatio;
  const fontSize = Math.min(26, artButtonFontSize(width / BUTTON.labelAspectRatio));
  const press = useSharedValue(1);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (loading && !still) pulse.value = withRepeat(withSequence(withTiming(0.5, { duration: 480 }), withTiming(1, { duration: 480 })), -1, false);
    else pulse.value = 1;
  }, [loading, still]);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const content = (
    <Animated.View key={`${done ? 'done' : muted ? 'muted' : 'go'}:${label}`} entering={still ? undefined : FadeIn.duration(160)} exiting={still ? undefined : FadeOut.duration(120)}
      style={StyleSheet.absoluteFill}>
    <Animated.View style={[StyleSheet.absoluteFill, styles.ctaLabel, labelStyle]}>
      {(done || muted || icon) && <GameIcon name={done ? 'check' : muted ? 'timer' : icon!} size={Math.round(fontSize * 1.2)} style={{ marginRight: Math.round(fontSize * 0.3) }} />}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={1.2}
        style={[styles.ctaText, { fontSize }]}>{label}</Text>
    </Animated.View>
    </Animated.View>
  );
  return (
    <Pressable onPress={() => { if (!loading && !disabled) onPress(); }} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ disabled, busy: loading }}
      onPressIn={() => { if (!still) press.value = withTiming(0.97, { duration: 65 }); }}
      onPressOut={() => { press.value = withTiming(1, { duration: 95 }); }}>
      <Animated.View style={[{ width, height }, pressStyle]}>
        {done ? (
          <View style={[styles.ctaDone, { borderRadius: height / 2.4 }]}>{content}</View>
        ) : muted ? (
          <View style={[styles.ctaMuted, { borderRadius: height / 2.4 }]}>{content}</View>
        ) : (
          <ImageBackground source={BUTTON_ART.yellow} resizeMode="contain" style={{ width, height }}>{content}</ImageBackground>
        )}
      </Animated.View>
    </Pressable>
  );
}

/**
 * The shop's compact toast: one line, docked just above the home indicator,
 * never over tile names or headers. Max 48pt tall.
 */
export function ShopToast({ message, icon = 'check', still }: { message: string | null; icon?: GameIconName; still: boolean }) {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  return (
    <Animated.View key={message} entering={still ? undefined : FadeInDown.duration(180)} exiting={still ? undefined : FadeOutDown.duration(160)}
      pointerEvents="none" style={[styles.toast, { bottom: Math.max(8, insets.bottom - 6) }]} accessibilityLiveRegion="polite">
      <GameIcon name={icon} size={20} />
      <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={2} style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

/** A toast message that clears itself (one at a time). */
export function useShopToast(ms = 2200): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), ms);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

/**
 * One stage kit for the hero, try-on and reveal (Alex style):
 * - the sky, or the worn backdrop, behind everything
 * - a soft white light (rarity colour lives only in the plinth rim, so commons never go olive)
 * - a cel-shaded round plinth with a top-left highlight band and a gloss tick
 * Children (the Playercard, which draws its own bobbing contact shadow) sit on top.
 */
/** Plinth fills: the house blue-and-ice, or the Secret Shop's violet-and-lilac. */
const PLINTH = {
  house: { side: '#2b679e', line: '#123a63', band: '#3f84bf', top: '#d6ecfb' },
  // The vault plinth: navy drum, gold band, a cool white top (no purple).
  secret: { side: '#163e86', line: '#06102e', band: '#ffcf3b', top: '#eaf3ff' },
  // A worn scene is the ground: no plinth floating on the plaza (art panel round 1).
  none: { side: '', line: '', band: '', top: '' },
} as const;

export const ShopStage = memo(function ShopStage({ rim, backdropUrl, backdrop, tone = 'sky', sky: paintSky = true, rays = false, still, children, plinth = 'house' }: {
  rim: string; backdropUrl?: string | null; tone?: 'sky' | 'night';
  plinth?: keyof typeof PLINTH;
  /** An animated backdrop (a Secret Shop scene); wins over backdropUrl and the sky. */
  backdrop?: ReactNode;
  /** false: no sky of its own (the hero card is already the night sky), so there is no seam. A pair of colours paints that sky. */
  sky?: boolean | readonly [string, string];
  /** Slow light rays behind the plinth; a colour tints them (the vault's are soft gold). */
  rays?: boolean | string; still: boolean; children?: ReactNode;
}) {
  const sky: readonly [string, string] = typeof paintSky === 'object' ? paintSky : tone === 'night' ? NIGHT_SKY : ['#e3f4ff', '#a4d8f8'];
  const lightId = useSvgId('stage-light');
  return (
    <View style={StyleSheet.absoluteFill}>
      {backdrop ? backdrop : backdropUrl ? (
        <Image source={backdropUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : paintSky ? (
        <LinearGradient colors={[...sky]} style={StyleSheet.absoluteFill} />
      ) : null}
      {rays && <Rays still={still} color={typeof rays === 'string' ? rays : undefined} />}
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={lightId} cx="50%" cy="44%" r="46%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={tone === 'night' ? 0.42 : 0.7} />
            <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="44" rx="46" ry="44" fill={`url(#${lightId})`} />
      </Svg>
      {plinth !== 'none' && <View pointerEvents="none" style={styles.plinthWrap}>
        <Svg width="100%" height="100%" viewBox="0 0 200 64">
          {/* Side band, then the top face. Dark slate outlines, flat cel fills. */}
          <Ellipse cx="100" cy="36" rx="94" ry="24" fill={PLINTH[plinth].side} stroke={PLINTH[plinth].line} strokeWidth={3} />
          <Path d="M8 36 A92 22 0 0 0 192 36" fill="none" stroke={PLINTH[plinth].band} strokeWidth={5} strokeOpacity={0.9} />
          <Ellipse cx="100" cy="27" rx="94" ry="22" fill={PLINTH[plinth].top} stroke={PLINTH[plinth].line} strokeWidth={3} />
          {/* Rarity rim light on the back edge only. */}
          <Path d="M12 25 A90 19 0 0 1 188 25" fill="none" stroke={rim} strokeWidth={4.5} />
          {/* Top-left cel highlight band and a gloss tick. */}
          <Path d="M30 22 A70 13 0 0 1 120 12" fill="none" stroke="#ffffff" strokeWidth={6} strokeLinecap="round" strokeOpacity={0.85} />
          <Path d="M134 13 L146 14" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" />
        </Svg>
      </View>}
      {children}
    </View>
  );
});

function Rays({ still, color = '#ffffff' }: { still: boolean; color?: string }) {
  const spin = useSharedValue(0);
  const fadeId = useSvgId('ray-fade');
  useEffect(() => {
    if (still) return;
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => { spin.value = 0; };
  }, [still]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const b = a + Math.PI / 24;
    return `M100 100 L${100 + Math.cos(a) * 140} ${100 + Math.sin(a) * 140} L${100 + Math.cos(b) * 140} ${100 + Math.sin(b) * 140} Z`;
  }).join(' ');
  return (
    <Animated.View pointerEvents="none" style={[styles.rays, style]}>
      {/* The rays fade to nothing well before any edge (a radial fill), so they never end on a straight line. */}
      <Svg width="100%" height="100%" viewBox="0 0 200 200">
        <Defs>
          <RadialGradient id={fadeId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.16} />
            <Stop offset="0.35" stopColor={color} stopOpacity={0.08} />
            <Stop offset="0.62" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d={rays} fill={`url(#${fadeId})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Coins pour from the balance pill DOWN into the stage, inside the sheet,
 * each with a sparkle trail. Lands on the stage centre for the absorb pop.
 */
export function CoinArc({ from, to, count = 7, still, trigger }: {
  from: { x: number; y: number }; to: { x: number; y: number }; count?: number; still: boolean; trigger: number;
}) {
  if (still || !trigger) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }, (_, i) => <ArcCoin key={`${trigger}-${i}`} i={i} from={from} to={to} />)}
    </View>
  );
}

function ArcCoin({ i, from, to }: { i: number; from: { x: number; y: number }; to: { x: number; y: number } }) {
  const t = useSharedValue(0);
  const trail = useSharedValue(0);
  useEffect(() => {
    // One sharp beat (game feel, Oct 8): the first coin lands at 340 ms, the last by about 580 ms.
    t.value = withDelay(i * 40, withTiming(1, { duration: 340, easing: Easing.in(Easing.quad) }));
    trail.value = withDelay(i * 40 + 50, withTiming(1, { duration: 340, easing: Easing.in(Easing.quad) }));
  }, []);
  // Bulges sideways (never up), so the pour stays inside the sheet.
  const side = (i % 2 ? 1 : -1) * (30 + (i % 3) * 14);
  const at = (k: number) => {
    'worklet';
    return { x: from.x + (to.x - from.x) * k + side * 4 * k * (1 - k), y: from.y + (to.y - from.y) * k };
  };
  const coin = useAnimatedStyle(() => {
    const p = at(t.value);
    return { opacity: t.value < 0.97 ? 1 : 0, transform: [{ translateX: p.x - 11 }, { translateY: p.y - 11 }, { scale: 1 - t.value * 0.3 }] };
  });
  const spark = useAnimatedStyle(() => {
    const p = at(trail.value);
    return { opacity: trail.value > 0 && trail.value < 0.95 ? 0.9 : 0, transform: [{ translateX: p.x - 4 }, { translateY: p.y - 4 }] };
  });
  return (
    <>
      <Animated.View style={[styles.spark, spark]} />
      <Animated.View style={[styles.arcCoin, coin]}><GameIcon name="coin" size={22} /></Animated.View>
    </>
  );
}

/**
 * When a piece lands: a white stage flash, a full-opacity starburst with a
 * white core in the rarity colour, a thick double ring, and 8 sparkles.
 */
export function LandFlash({ color, still, trigger }: { color: string; still: boolean; trigger: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (still || !trigger) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 760, easing: Easing.out(Easing.cubic) });
  }, [trigger]);
  const flash = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : Math.max(0, 0.7 - t.value * 3) }));
  const ring1 = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : 1 - t.value, transform: [{ scale: 0.35 + t.value * 1.2 }] }));
  const ring2 = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : Math.max(0, 1 - t.value * 1.3), transform: [{ scale: 0.2 + t.value * 0.95 }] }));
  const burst = useAnimatedStyle(() => ({ opacity: t.value === 0 ? 0 : Math.max(0, 1 - t.value * 1.25), transform: [{ scale: 0.55 + t.value * 0.8 }, { rotate: `${t.value * 35}deg` }] }));
  if (still || !trigger) return null;
  const star = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 === 0 ? 98 : 50;
    const a = (i / 16) * Math.PI * 2;
    return `${i === 0 ? 'M' : 'L'}${100 + Math.cos(a) * r} ${100 + Math.sin(a) * r}`;
  }).join(' ') + ' Z';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#ffffff' }, flash]} />
      <Animated.View style={[styles.flash, burst]}>
        <Svg width="100%" height="100%" viewBox="0 0 200 200">
          <Path d={star} fill={color} stroke="#ffffff" strokeWidth={3} />
          <Ellipse cx="100" cy="100" rx="34" ry="34" fill="#ffffff" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.flash, styles.ring, { borderColor: color }, ring1]} />
      <Animated.View style={[styles.flash, styles.ring, { borderColor: '#ffffff', borderWidth: 6 }, ring2]} />
      {Array.from({ length: 8 }, (_, i) => <Sparkle key={`${trigger}-${i}`} i={i} color={color} />)}
    </View>
  );
}

function Sparkle({ i, color }: { i: number; color: string }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(60, withTiming(1, { duration: 640, easing: Easing.out(Easing.quad) })); }, []);
  const a = (i / 8) * Math.PI * 2 + 0.2;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: Math.cos(a) * 130 * t.value }, { translateY: Math.sin(a) * 110 * t.value }, { rotate: '45deg' }, { scale: 1.3 - t.value * 0.7 }],
  }));
  return <Animated.View style={[styles.sparkle, { backgroundColor: i % 2 ? '#ffffff' : color }, style]} />;
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontFamily: FONT.display, fontSize: 13 },
  piece: { borderRadius: 14, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#d7e6f5', overflow: 'hidden' },
  pieceOwned: { borderColor: BRAND.green, backgroundColor: '#effbf2', overflow: 'visible' },
  pieceOn: { borderColor: BRAND.gold, backgroundColor: '#fff6d6' },
  pieceAway: { borderStyle: 'dashed', backgroundColor: '#f2f5f9' },
  pieceTrying: { borderColor: BRAND.gold, borderWidth: 3.5 },
  pieceBadge: { position: 'absolute', top: -7, right: -7 },
  pieceRibbon: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16, backgroundColor: '#8aa0b8', alignItems: 'center', justifyContent: 'center' },
  pieceRibbonText: { fontFamily: FONT.display, fontSize: 12, lineHeight: 15, color: BRAND.white, letterSpacing: 0.4 },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 46, left: -46 },
  ctaLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22, paddingBottom: 4 },
  ctaText: { flexShrink: 1, textAlign: 'center', color: 'white', fontFamily: FONT.display, textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, .5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  ctaMuted: { flex: 1, backgroundColor: '#3d6f9e', borderWidth: 3, borderColor: '#cfe6fa', borderBottomWidth: 7, borderBottomColor: '#24527d', margin: 2 },
  ctaDone: { flex: 1, backgroundColor: BRAND.green, borderWidth: 3, borderColor: '#14532d', borderBottomWidth: 7, margin: 2 },
  toast: { position: 'absolute', alignSelf: 'center', maxWidth: '92%', minHeight: 40, maxHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(5,52,110,0.94)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 2, borderColor: BRAND.white },
  toastText: { flexShrink: 1, fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  plinthWrap: { position: 'absolute', left: '14%', right: '14%', bottom: '3%', aspectRatio: 200 / 64 },
  rays: { position: 'absolute', alignSelf: 'center', top: '-25%', width: '150%', aspectRatio: 1, left: '-25%' },
  arcCoin: { position: 'absolute', left: 0, top: 0 },
  spark: { position: 'absolute', left: 0, top: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff6c2' },
  flash: { position: 'absolute', width: 240, height: 240 },
  ring: { borderRadius: 120, borderWidth: 8 },
  sparkle: { position: 'absolute', width: 12, height: 12, borderRadius: 2 },
});
