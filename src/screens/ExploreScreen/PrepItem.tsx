import { Image, ImageSource } from 'expo-image';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import { BAND_FADE_MS, BAND_LOOK, SPAWN, bookSpawn, findBand, hopAt, newSpawnClock, ringAt } from '../../components/map/alive/mapWow';
import { EASE, SPRING } from '../../ui/motionEasing';
import { GOLD_FX } from '../../ui/motion';
import { queueHaptic } from '../../gamekit/Haptics';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { PrepItemType } from '../../models/prep-item-type';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND, GameIcon } from '../../ui';
import { catchStyleFor } from './ridePhoto';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { formatFindDistance, msUntilLeavesInChanges } from './homeFindCopy';
import { findImageOrder, findLook, mapGlowColor } from './findPresentation';
import { catchDim, catchHidePivot, tapPivot, tapSquash } from './catchPresence';

/**
 * A tinted glow or sparkle. React Native's own Image applies tintColor every time; expo-image sometimes drew
 * the cached glow texture untinted (its natural blue) after a relaunch, so gold halos showed up blue.
 */
function Tinted({ source, tint, fit = 'stretch' }: { source: number; tint: string; fit?: 'stretch' | 'contain' }) {
  return <RNImage source={source} style={[styles.fill, { tintColor: tint }]} resizeMode={fit} fadeDuration={0} />;
}

// Local churro images map - React Native requires static imports
const CHURRO_IMAGES: Record<string, ImageSource> = {
  'classic cinnamon': require('../../../assets/images/prep-items/churros/churro_01.png'),
  'sugar dusted': require('../../../assets/images/prep-items/churros/churro_02.png'),
  'honey glazed': require('../../../assets/images/prep-items/churros/churro_03.png'),
  'brown sugar': require('../../../assets/images/prep-items/churros/churro_04.png'),
  'maple swirl': require('../../../assets/images/prep-items/churros/churro_05.png'),
  'vanilla bean': require('../../../assets/images/prep-items/churros/churro_06.png'),
  'caramel drizzle': require('../../../assets/images/prep-items/churros/churro_07.png'),
  'dulce de leche': require('../../../assets/images/prep-items/churros/churro_08.png'),
  'butterscotch': require('../../../assets/images/prep-items/churros/churro_09.png'),
  'toasted coconut': require('../../../assets/images/prep-items/churros/churro_10.png'),
  'churro original': require('../../../assets/images/prep-items/churros/churro_11.png'),
  'cinnamon toast': require('../../../assets/images/prep-items/churros/churro_12.png'),
  'golden crisp': require('../../../assets/images/prep-items/churros/churro_13.png'),
  'sweet cream': require('../../../assets/images/prep-items/churros/churro_14.png'),
  'salted caramel': require('../../../assets/images/prep-items/churros/churro_15.png'),
  'toffee crunch': require('../../../assets/images/prep-items/churros/churro_16.png'),
  'praline': require('../../../assets/images/prep-items/churros/churro_17.png'),
  'snickerdoodle': require('../../../assets/images/prep-items/churros/churro_18.png'),
  'biscoff': require('../../../assets/images/prep-items/churros/churro_19.png'),
  'cookie butter': require('../../../assets/images/prep-items/churros/churro_20.png'),
  'chocolate dipped': require('../../../assets/images/prep-items/churros/churro_21.png'),
  'strawberry frosted': require('../../../assets/images/prep-items/churros/churro_22.png'),
  'blueberry bliss': require('../../../assets/images/prep-items/churros/churro_23.png'),
  'matcha green tea': require('../../../assets/images/prep-items/churros/churro_24.png'),
  'ube purple yam': require('../../../assets/images/prep-items/churros/churro_25.png'),
  'red velvet': require('../../../assets/images/prep-items/churros/churro_26.png'),
  'orange creamsicle': require('../../../assets/images/prep-items/churros/churro_27.png'),
  'lemon zest': require('../../../assets/images/prep-items/churros/churro_28.png'),
  'mint chocolate': require('../../../assets/images/prep-items/churros/churro_29.png'),
  'cookies & cream': require('../../../assets/images/prep-items/churros/churro_30.png'),
  'pumpkin spice': require('../../../assets/images/prep-items/churros/churro_31.png'),
  'birthday cake': require('../../../assets/images/prep-items/churros/churro_32.png'),
  'cotton candy': require('../../../assets/images/prep-items/churros/churro_33.png'),
  'tropical mango': require('../../../assets/images/prep-items/churros/churro_34.png'),
  'galaxy swirl': require('../../../assets/images/prep-items/churros/churro_35.png'),
  'electric blue': require('../../../assets/images/prep-items/churros/churro_36.png'),
  'watermelon wave': require('../../../assets/images/prep-items/churros/churro_37.png'),
  'sunset orange': require('../../../assets/images/prep-items/churros/churro_38.png'),
  'golden churro': require('../../../assets/images/prep-items/churros/churro_39.png'),
  'rainbow galaxy': require('../../../assets/images/prep-items/churros/churro_40.png'),
  // Fallback base churro
  'classic': require('../../../assets/images/prep-items/churros/churro_01.png'),
  'default': require('../../../assets/images/prep-items/churros/base_churro.png'),
};

/**
 * Get local churro image based on item name
 */
function getChurroImage(name: string): ImageSource | null {
  const lowerName = name.toLowerCase().replace(' churro', '').trim();
  
  // Direct match
  if (CHURRO_IMAGES[lowerName]) {
    return CHURRO_IMAGES[lowerName];
  }
  
  // Partial match - find the best match
  for (const key of Object.keys(CHURRO_IMAGES)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return CHURRO_IMAGES[key];
    }
  }
  
  // Default churro if name contains "churro"
  if (name.toLowerCase().includes('churro')) {
    return CHURRO_IMAGES['default'];
  }
  
  return null;
}

/** The find's art: server art first (v3 catalog), then bundled art. */
export function findImageSource(prepItem: Pick<PrepItemType, 'icon_url' | 'variant_slug' | 'name'>): ImageSource | null {
  return findImageOrder<ImageSource>(prepItem.icon_url, prepItemImage(prepItem.variant_slug) ?? null,
    getChurroImage(prepItem.name)) as ImageSource | null;
}

export type FingerSide = 'left' | 'right' | 'below-left' | 'below-right';

interface Props {
  prepItem: PrepItemType;
  onExpire: () => void;
  inRange?: boolean;
  /** Hidden while the catch moment flies its own copy of the art. */
  hidden?: boolean;
  /** Full motion only for finds in range and the nearest few (battery); the rest sit still. */
  animated?: boolean;
  /** Which side the finger cue hovers on: away from the player's shark, so it never points at the player. */
  fingerSide?: FingerSide;
  count?: number;
  /** Only one find on the map shows the pointing finger at a time (the nearest in range). */
  showFinger?: boolean;
  pulseKey?: number | null;
  chromeless?: boolean;
  /** Metres to the find: out of range it shows as a small tag under the art (with the timer when it is leaving). */
  distance?: number | null;
  /** A brand new player's first hunt: a far find shows only its footsteps (walk to it), no '35 m' number to read. */
  plainDistance?: boolean;
}

/** The find sits at the exact centre of the marker box, so its art is on its real spot. */
export const PREP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };
/** The marker box; the art (58 pt at full size) is centred in it. */
export const FIND_MARKER_BOX = 112;
export const FIND_ART_SIZE = 58;
/** Only the last few minutes earn a timer pill. */
const LEAVING_SOON_MS = 5 * 60_000;

const GLOW = require('../../../assets/images/ride-photo/glow.webp');
const SPARKLE = require('../../../assets/images/ride-photo/sparkle.webp');
const FOOTSTEPS = require('../../../assets/images/ride-photo/footsteps.webp');
const FINGER = require('../../../assets/images/ride-photo/tap-hand.webp');
const MAP_SPARKLE = require('../../../assets/images/map/fx/sparkle.png');
/** One spawn wave for every find on the map: finds that arrive together pop 90 ms apart (at most 5 pop). */
const spawnClock = newSpawnClock();
/** Spawn sparkles fling up and out from the ground (angle in degrees from straight up). */
const SPAWN_SPARKS = [-50, -18, 18, 50] as const;

/** A spawn sparkle: flung up 18 pt and out, fading over 600 ms (driven by the find's spawn clock). */
function SpawnSparkle({ angle, t }: { angle: number; t: ReturnType<typeof useSharedValue<number>> }) {
  const rad = (angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const p = t.value;
    if (p <= 0 || p >= 1) return { opacity: 0, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 0 }] };
    const out = 1 - (1 - p) * (1 - p);
    return { opacity: 1 - p, transform: [{ translateX: Math.sin(rad) * 26 * out }, { translateY: -Math.cos(rad) * 18 * out - 6 * out }, { scale: 0.6 + 0.5 * (1 - p) }] };
  });
  // Tint on a plain image inside the animated view: an animated style on the image itself can drop its tint.
  return <Animated.View style={[styles.spawnSpark, style]}><Tinted source={MAP_SPARKLE} tint={GOLD_FX.raysSoft} fit="contain" /></Animated.View>;
}

/** "2 min" in the final five minutes, null before; calls onExpire once it is gone. Only ticks while the map is live. */
function useLeavingSoon(activeTo: string | null | undefined, onExpire: () => void, live: boolean): string | null {
  const endsAt = activeTo ? Date.parse(activeTo) : NaN;
  const label = (left: number) => (left > 0 && left <= LEAVING_SOON_MS
    ? left < 60_000 ? `${Math.ceil(left / 1000)}s` : `${Math.ceil(left / 60_000)} min` : null);
  const [text, setText] = useState(() => Number.isFinite(endsAt) ? label(endsAt - Date.now()) : null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  useEffect(() => {
    if (!Number.isFinite(endsAt) || !live) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const left = endsAt - Date.now();
      setText(label(left));
      if (left <= 0) { expireRef.current(); return; }
      timer = setTimeout(tick, left > LEAVING_SOON_MS ? left - LEAVING_SOON_MS + 50 : msUntilLeavesInChanges(left));
    };
    tick();
    return () => clearTimeout(timer);
  }, [endsAt, live]);
  return text;
}

/** Where the 4-point star sparkles twinkle around the art (offsets from centre) and their phase. */
const SPARKLES = [
  { x: -30, y: -26, size: 13, phase: 0 },
  { x: 31, y: -14, size: 10, phase: 0.33 },
  { x: -24, y: 22, size: 9, phase: 0.6 },
  { x: 27, y: 25, size: 12, phase: 0.85 },
] as const;

function Sparkle({ x, y, size, phase, color, animated }: { x: number; y: number; size: number; phase: number; color: string; animated: boolean }) {
  const { clock } = useMapAlive();
  const twinkle = useAnimatedStyle(() => {
    if (!animated) return { opacity: 0.8, transform: [{ scale: 0.9 }] };
    const t = (clock.value * 0.8 + phase) % 1;
    const on = Math.max(0, Math.sin(t * Math.PI));
    return { opacity: on, transform: [{ scale: 0.5 + 0.7 * on }] };
  }, [animated]);
  const half = FIND_MARKER_BOX / 2;
  return <Animated.Image source={SPARKLE}
    style={[styles.sparkle, { tintColor: color, left: half + x - size / 2, top: half + y - size / 2, width: size, height: size }, twinkle]} />;
}

/** Colour-blind safe rarity mark: Uncommon 1 pip, Rare 2, Epic a gem, Legendary a crown. */
function RarityMark({ tier }: { tier: number }) {
  if (tier <= 1) return null;
  return tier >= 4 ? <GameIcon name={tier === 5 ? 'crown' : 'star'} size={14} />
    : <>{Array.from({ length: tier - 1 }, (_, i) => <View key={i} style={styles.pip} />)}</>;
}

/**
 * A home find on the map, as the item itself. In range it hops on a pulsing
 * rarity-colour ground glow with a finger cue; far away it is small and faded
 * with a footsteps cue. Ride Photo finds wear a camera badge. Rare and better
 * twinkle with 4-point stars. One shared glow image, no iOS shadows, and motion
 * only when `animated` (in range or among the nearest), on the map's clock.
 */
function PrepItem({ prepItem, onExpire, inRange = false, hidden = false, animated = true, fingerSide = 'right', count = 1, chromeless = false, showFinger = true, pulseKey = null, distance = null, plainDistance = false }: Props) {
  const { clock, active } = useMapAlive();
  const reduced = useReducedGameMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const leavingSoon = useLeavingSoon(prepItem.active_to, onExpire, active);
  // One small tag: "70 m", "70 m · 2 min" or just "2 min" in range. Always mounted (a marker never changes layout).
  // First hunt: no number. The footsteps alone say "walk to it" (drawn below when there is no tag).
  const far = !inRange && distance != null && !plainDistance ? formatFindDistance(distance) : '';
  const tag = [far || null, leavingSoon].filter(Boolean).join(' · ');
  const imageSource = useMemo(() => findImageSource(prepItem),
    [prepItem.icon_url, prepItem.variant_slug, prepItem.name]); // eslint-disable-line react-hooks/exhaustive-deps
  // Map glows stay in the house palette (gold and TPS blue tiers, never the neon purple of the rarity chips).
  const color = mapGlowColor(prepItem.rarity);
  const look = findLook(prepItem.rarity, inRange);
  const tier = Math.max(1, Math.min(5, Math.round(prepItem.rarity || 1)));
  const ridePhoto = catchStyleFor(prepItem.rarity) === 'ride_photo';
  const moving = animated && active;
  // Each find bobs on its own beat so a cluster never moves in lockstep.
  const phase = ((prepItem.pivot_id ?? prepItem.id) % 7) / 7;

  // ── Getting warmer (mapWow BAND_LOOK): far finds sit small and still, mid ones breathe a faint gold halo,
  // near ones glow brighter and bob, and in range the find hops every 2.4 s while two gold rings call.
  // The band changes cross-fade over 240 ms (never a snap).
  const band = findBand(distance, inRange);
  const bandLook = BAND_LOOK[band];
  const level = useSharedValue(bandLook.level);
  const firstBand = useRef(true);
  useEffect(() => {
    level.value = withTiming(bandLook.level, { duration: BAND_FADE_MS, easing: EASE.out });
    // Entering range: one small buzz, once (never repeating while the kid stands there).
    if (!firstBand.current && band === 'inRange') queueHaptic('tapLight', 1);
    firstBand.current = false;
  }, [band]); // eslint-disable-line react-hooks/exhaustive-deps
  // Round 4: a far find is still (BAND_LOOK far), so its styles read a constant instead of the map's clock and
  // stop evaluating every frame; it wakes up on the shared clock the moment it is no longer far.
  const still = useSharedValue(0);
  const live = moving && band !== 'far';
  const tick = live ? clock : still;
  const bob = useAnimatedStyle(() => {
    const lv = level.value;
    if (!live) return { transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] };
    const ms = tick.value * 1000;
    if (lv > 2.5) {
      const h = hopAt(ms, 2400, phase);
      const k = Math.min(1, (lv - 2.5) * 2);
      return { transform: [{ translateY: -10 * h.lift * k }, { scaleX: 1 + 0.08 * h.squash * k }, { scaleY: 1 - 0.08 * h.squash * k }] };
    }
    const near = Math.max(0, Math.min(1, lv - 1));
    const drift = Math.sin((ms / 1600 + phase) * Math.PI * 2);
    const sway = Math.sin((tick.value * 0.55 + phase) * Math.PI * 2);
    return { transform: [{ translateY: -4 * drift * near - 2 * sway * (1 - near) }, { scaleX: 1 }, { scaleY: 1 }] };
  }, [phase, live]);
  // Far to in range: scale 0.6, 0.7, 0.85, 1 and opacity 0.75, 0.9, 1, 1 (interpolated on the UI thread).
  const bandStyle = useAnimatedStyle(() => {
    const lv = level.value;
    const scale = lv < 1 ? 0.6 + 0.1 * lv : lv < 2 ? 0.7 + 0.15 * (lv - 1) : 0.85 + 0.15 * (lv - 2);
    const opacity = lv < 1 ? 0.75 + 0.15 * lv : Math.min(1, 0.9 + 0.1 * (lv - 1));
    return { opacity, transform: [{ scale }] };
  });
  // The gold halo breathes slower far away and faster up close.
  const halo = useAnimatedStyle(() => {
    const lv = level.value;
    const strength = lv < 1 ? 0.25 * lv : lv < 2 ? 0.25 + 0.3 * (lv - 1) : 0.55 + 0.2 * Math.min(1, lv - 2);
    const breathS = lv < 1.5 ? 1.8 : 0.9;
    const wave = live ? 0.5 + 0.5 * Math.sin((tick.value / breathS + phase) * Math.PI * 2) : 0.7;
    return { opacity: strength * (0.55 + 0.45 * wave), transform: [{ scaleY: 0.5 }, { scale: 0.85 + 0.2 * wave }] };
  }, [live, phase]);
  const ring0 = useAnimatedStyle(() => {
    const on = Math.max(0, Math.min(1, (level.value - 2.5) * 2));
    if (!live || on <= 0) return { opacity: 0, transform: [{ scaleY: 0.5 }, { scale: 1 }] };
    const r = ringAt(tick.value * 1000 + phase * 1100, 0);
    return { opacity: r.opacity * on, transform: [{ scaleY: 0.5 }, { scale: r.scale }] };
  }, [live, phase]);
  const ring1 = useAnimatedStyle(() => {
    const on = Math.max(0, Math.min(1, (level.value - 2.5) * 2));
    if (!live || on <= 0) return { opacity: 0, transform: [{ scaleY: 0.5 }, { scale: 1 }] };
    const r = ringAt(tick.value * 1000 + phase * 1100, 1);
    return { opacity: r.opacity * on, transform: [{ scaleY: 0.5 }, { scale: r.scale }] };
  }, [live, phase]);
  const pulse = useAnimatedStyle(() => {
    if (!live) return { opacity: inRange ? 0.75 : 0.45, transform: [{ scale: 1 }] };
    const wave = 0.5 + 0.5 * Math.sin((tick.value * (inRange ? 1.1 : 0.5) + phase) * Math.PI * 2);
    return { opacity: (inRange ? 0.6 : 0.35) + 0.35 * wave, transform: [{ scale: 0.9 + 0.2 * wave }] };
  }, [inRange, phase, live]);

  // ── The spawn pop (Pokemon GO / Pikmin Bloom): a water ring at the ground, the find pops up past full
  // size and settles with one overshoot, and four sparkles fling up. Finds arriving together stagger
  // 90 ms (at most 5 pop, the rest fade in). Coming back to the map plays it again. Reduce Motion: a fade.
  const spawn = useSharedValue(1);
  const spawnRise = useSharedValue(0);
  const spawnRing = useSharedValue(0);
  const spawnSpark = useSharedValue(0);
  const spawnFade = useSharedValue(1);
  const playSpawn = useCallback(() => {
    if (hidden) return;
    const { delay, pop } = bookSpawn(spawnClock, Date.now());
    if (reducedRef.current || !pop) {
      spawnFade.value = 0;
      spawnFade.value = withDelay(delay, withTiming(1, { duration: SPAWN.fadeMs, easing: EASE.out }));
      return;
    }
    spawnFade.value = 1;
    spawn.value = 0;
    spawn.value = withDelay(delay, withSequence(withTiming(SPAWN.overshoot, { duration: SPAWN.popMs, easing: EASE.out }), withSpring(1, SPRING.pop)));
    spawnRise.value = 8;
    spawnRise.value = withDelay(delay, withSequence(withTiming(-6, { duration: SPAWN.popMs, easing: EASE.out }), withSpring(0, SPRING.pop)));
    spawnRing.value = 0;
    spawnRing.value = withDelay(delay + 120, withTiming(1, { duration: 560, easing: EASE.out }));
    spawnSpark.value = 0;
    spawnSpark.value = withDelay(delay + 200, withTiming(1, { duration: 600, easing: EASE.out }));
  }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { playSpawn(); }, [playSpawn]));
  const spawnStyle = useAnimatedStyle(() => ({ opacity: spawnFade.value, transform: [{ translateY: spawnRise.value }, { scale: spawn.value }] }));
  const spawnRingStyle = useAnimatedStyle(() => {
    const p = spawnRing.value;
    return { opacity: p <= 0 || p >= 1 ? 0 : 0.6 * (1 - p), transform: [{ scaleY: 0.45 }, { scale: 0.4 + 1.2 * p }] };
  });
  const below = fingerSide === 'below-left' || fingerSide === 'below-right';
  const leftSide = fingerSide === 'left' || fingerSide === 'below-left';
  // Below the find the finger points up at it (rotated), so it stays off the player's shark.
  const tilt = below ? '210deg' : leftSide ? '-28deg' : '28deg';
  // Wave 4: the finger steps aside while a catch plays (it fades with the map's controls on the tap frame and
  // comes back only as the badge leaves), so two callouts never compete with the catch.
  const finger = useAnimatedStyle(() => {
    const away = 1 - catchDim.value;
    if (!live) return { opacity: away, transform: [{ translateY: 0 }, { rotate: tilt }] };
    // Out of phase with the item's hop.
    const tap = Math.abs(Math.sin(tick.value * Math.PI * 1.15 + phase * Math.PI + 1.4));
    return { opacity: away, transform: [{ translateY: (below ? 5 : -5) * tap }, { rotate: tilt }] };
  }, [phase, live, tilt, below]);
  // One pulse per new key: the art swells 1.35x and a ring blooms (Reduce Motion: the ring only, no swell).
  const pulseV = useSharedValue(0);
  useEffect(() => {
    if (pulseKey == null) return;
    pulseV.value = 0;
    pulseV.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 420 }));
  }, [pulseKey, pulseV]);
  // The tap squish (catchPresence.squashFind) lands on this marker on the tap's frame, before the catch layer draws.
  const myPivot = prepItem.pivot_id ?? -2;
  // The catch layer takes over on the UI thread: this pin hides on the same frame the layer's copy starts
  // moving (after its art has drawn), never a frame before (no blink) or after (no double).
  const handOff = useAnimatedStyle(() => ({ opacity: catchHidePivot.value === myPivot ? 0 : 1 }), [myPivot]);
  const pulseArt = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : 1 + 0.35 * pulseV.value },
    { scale: tapPivot.value === myPivot ? 1 - 0.14 * tapSquash.value : 1 }] }), [reduced, myPivot]);
  const pulseRing = useAnimatedStyle(() => ({ opacity: pulseV.value, transform: [{ scale: 0.8 + 0.6 * pulseV.value }] }));
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${live ? (tick.value * 24) % 360 : 0}deg` }] }), [live]);
  // The pointed-at find breathes a soft ring on the map's clock, so a kid who cannot read sees which one to tap.
  const pointed = inRange && showFinger;
  const softRing = useAnimatedStyle(() => {
    if (!pointed) return { opacity: 0 };
    if (!live) return { opacity: 0.5, transform: [{ scale: 1 }] };
    const t = (tick.value * 0.7) % 1;
    return { opacity: 0.6 * (1 - t), transform: [{ scale: 0.75 + 0.55 * t }] };
  }, [pointed, live]);

  return (
    <Animated.View style={[styles.box, hidden && styles.hidden, handOff]} pointerEvents="box-none">
      <Animated.View style={[styles.scaled, bandStyle]}>
        <Animated.View style={[styles.spawnRing, spawnRingStyle]} pointerEvents="none" />
        <Animated.View style={[styles.scaled, styles.overlay, spawnStyle]}>
        <View style={styles.groundShadow} />
        {/* Getting warmer: a gold halo that breathes faster up close, and two gold rings calling in range. */}
        <Animated.View style={[styles.groundGlow, halo]} pointerEvents="none">
          <Tinted source={GLOW} tint={GOLD_FX.glow} />
        </Animated.View>
        <Animated.View style={[styles.callRing, ring0]} pointerEvents="none" />
        <Animated.View style={[styles.callRing, ring1]} pointerEvents="none" />
        {/* Commons glow warm gold in range (never the grey that read as a loading bar). */}
        {inRange && <Animated.View style={[styles.groundGlow, pulse]} pointerEvents="none">
          <Tinted source={GLOW} tint={tier === 1 ? BRAND.gold : color} />
        </Animated.View>}
        {look.rays && <Animated.View style={[styles.rays, rays]} pointerEvents="none">
          {[0, 45, 90, 135].map(angle => <View key={angle}
            style={[styles.ray, { backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }]} />)}
        </Animated.View>}
        {look.aura && <Animated.View style={[styles.aura, pulse]} pointerEvents="none">
          <Tinted source={GLOW} tint={color} />
        </Animated.View>}
        <Animated.View style={[styles.pulseRing, { borderColor: color }, pulseRing]} pointerEvents="none" />
        {pointed && <Animated.View style={[styles.softRing, softRing]} pointerEvents="none" />}
        <Animated.View style={pulseArt}>
        <Animated.View style={[styles.art, bob]}>
          {imageSource ? (
            <Image source={imageSource} style={styles.image} contentFit="contain" transition={0} cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.fallback, { backgroundColor: color }]}>
              <GameIcon name="gift" size={30} />
            </View>
          )}
        </Animated.View>
        </Animated.View>
        {SPARKLES.slice(0, look.sparkles).map(spark => <Sparkle key={spark.phase} {...spark}
          color={look.rays ? BRAND.goldLight : color} animated={live} />)}
        </Animated.View>
        <View style={styles.spawnOrigin} pointerEvents="none">
          {SPAWN_SPARKS.map(angle => <SpawnSparkle key={angle} angle={angle} t={spawnSpark} />)}
        </View>
      </Animated.View>
      {/* Ride Photo finds wear a camera badge that also carries the rarity mark (pips, gem or crown). */}
      {ridePhoto && <View style={[styles.cameraBadge, chromeless && styles.chromeOff, { backgroundColor: color }, !inRange && styles.cameraBadgeFar]}>
        <GameIcon name="camera" size={inRange ? 16 : 12} />
        {inRange && <RarityMark tier={tier} />}
      </View>}
      {count > 1 && <View style={[styles.countBadge, chromeless && styles.chromeOff]}><Text style={styles.countText}>×{count}</Text></View>}
      {prepItem.is_new_variant && count === 1 && (inRange
        ? <View style={[styles.newBadge, chromeless && styles.chromeOff]}><Text style={styles.newText}>NEW</Text></View>
        : <View style={[styles.newDot, chromeless && styles.chromeOff]} />)}
      {inRange && showFinger && <Animated.Image source={FINGER} style={[styles.finger, chromeless && styles.chromeOff, below ? styles.fingerBelow : leftSide ? styles.fingerLeft : styles.fingerRight, finger]} />}
      {!inRange && !far && <Image source={FOOTSTEPS} style={styles.footsteps} contentFit="contain" transition={0} />}
      {/* Hangs right under its own art (and badge), so it never reads as the next find's. */}
      <View style={[styles.timePill, inRange ? styles.tagNear : styles.tagFar, (chromeless || !tag) && styles.chromeOff]}>
        {far ? <Image source={FOOTSTEPS} style={styles.tagSteps} contentFit="contain" transition={0} /> : null}
        {leavingSoon && <GameIcon name="timer" size={12} />}<Text style={styles.timeText}>{tag}</Text>
      </View>
    </Animated.View>
  );
}

export default memo(PrepItem);

const B = FIND_MARKER_BOX;
const A = FIND_ART_SIZE;
const styles = StyleSheet.create({
  box: { width: B, height: B, alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  // Chrome hides by opacity, never by unmounting: a map marker view never changes its layout (MapLibre
  // re-measures marker views on any child mount).
  chromeOff: { opacity: 0 },
  scaled: { width: B, height: B, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', left: 0, top: 0 },
  fill: { width: '100%', height: '100%' },
  // The in-range call: thin gold rings on the ground (an ellipse, scaled flat), expanding and fading.
  callRing: { position: 'absolute', top: B / 2 + A / 2 - 36, width: 60, height: 60, borderRadius: 30, borderWidth: 3, borderColor: GOLD_FX.rays },
  spawnRing: { position: 'absolute', top: B / 2 + A / 2 - 40, left: B / 2 - 32, width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: BRAND.white },
  spawnOrigin: { position: 'absolute', left: B / 2, top: B / 2 + A / 2 - 10, width: 0, height: 0 },
  spawnSpark: { position: 'absolute', left: -7, top: -7, width: 14, height: 14 },
  // Round, soft ground marks (an ellipse, never a pill that reads as a loading bar).
  groundShadow: { position: 'absolute', top: B / 2 + A / 2 - 24, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(5,52,110,0.18)', transform: [{ scaleY: 0.28 }] },
  groundGlow: { position: 'absolute', top: B / 2 + A / 2 - 42, width: 72, height: 72, transform: [{ scaleY: 0.5 }] },
  rays: { position: 'absolute', width: 96, height: 96, alignItems: 'center', justifyContent: 'center', opacity: 0.3 },
  ray: { position: 'absolute', width: 96, height: 8, borderRadius: 4 },
  aura: { position: 'absolute', width: 96, height: 96 },
  pulseRing: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 4 },
  art: { width: A, height: A, alignItems: 'center', justifyContent: 'center' },
  image: { width: A, height: A },
  fallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: BRAND.white },
  sparkle: { position: 'absolute' },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.white },
  cameraBadge: { position: 'absolute', top: B / 2 + A / 2 - 20, right: B / 2 - A / 2 - 22, height: 26, borderRadius: 13, flexDirection: 'row',
    gap: 3, paddingHorizontal: 6, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  cameraBadgeFar: { height: 16, minWidth: 16, borderRadius: 8, paddingHorizontal: 1, top: B / 2 - A / 2 + 8, right: B / 2 - A / 2 + 4 },
  newDot: { position: 'absolute', top: B / 2 - A / 2 + 10, left: B / 2 - A / 2 + 6, width: 10, height: 10, borderRadius: 5,
    backgroundColor: BRAND.gold, borderWidth: 1.5, borderColor: BRAND.white },
  newBadge: { position: 'absolute', top: B / 2 - A / 2 - 12, left: B / 2 - A / 2 - 14, backgroundColor: BRAND.gold,
    borderWidth: 2, borderColor: BRAND.white, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 0 },
  newText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 14 },
  countBadge: { position: 'absolute', top: B / 2 - A / 2 - 12, left: B / 2 - A / 2 - 14, backgroundColor: BRAND.navy,
    borderWidth: 2, borderColor: BRAND.white, borderRadius: 10, paddingHorizontal: 6 },
  countText: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 15 },
  // The fingertip (bottom centre of the 34 x 43 art, turned 28 degrees) lands on the find itself, 6 pt
  // from its centre on the side away from the player, never on the NEW tag or the badges.
  finger: { position: 'absolute', top: B / 2 - 46, width: 34, height: 43 },
  fingerRight: { left: B / 2 - 1 },
  fingerLeft: { left: B / 2 - 33 },
  // Below the find the finger points up (turned 210 degrees) at its lower half: clear of the timer pill.
  fingerBelow: { top: B / 2 + 5, left: B / 2 - 34 },
  softRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: BRAND.goldLight,
    backgroundColor: 'rgba(255,214,90,0.18)' },
  footsteps: { position: 'absolute', bottom: 18, width: 18, height: 22, opacity: 0.9 },
  // Far art is drawn at 0.6x, so its tag sits higher; near, the tag clears the camera badge.
  tagFar: { top: B / 2 + A * 0.3 + 4 },
  tagNear: { top: B / 2 + A / 2 + 7 },
  tagSteps: { width: 10, height: 12 },
  timePill: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(5,52,110,0.88)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  timeText: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 13 },
});
