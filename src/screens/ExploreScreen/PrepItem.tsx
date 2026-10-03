import { Image, ImageSource } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { PrepItemType } from '../../models/prep-item-type';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND, GameIcon } from '../../ui';
import { rideSpec } from './ridePhoto';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { msUntilLeavesInChanges } from './homeFindCopy';
import { findImageOrder, findLook, rarityColor } from './findPresentation';

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
  return tier >= 4 ? <Text style={styles.markGlyph}>{tier === 5 ? '♛' : '◆'}</Text>
    : <>{Array.from({ length: tier - 1 }, (_, i) => <View key={i} style={styles.pip} />)}</>;
}

/**
 * A home find on the map, as the item itself. In range it hops on a pulsing
 * rarity-colour ground glow with a finger cue; far away it is small and faded
 * with a footsteps cue. Ride Photo finds wear a camera badge. Rare and better
 * twinkle with 4-point stars. One shared glow image, no iOS shadows, and motion
 * only when `animated` (in range or among the nearest), on the map's clock.
 */
function PrepItem({ prepItem, onExpire, inRange = false, hidden = false, animated = true, fingerSide = 'right', count = 1, chromeless = false, showFinger = true, pulseKey = null }: Props) {
  const { clock, active } = useMapAlive();
  const leavingSoon = useLeavingSoon(prepItem.active_to, onExpire, active);
  const imageSource = useMemo(() => findImageSource(prepItem),
    [prepItem.icon_url, prepItem.variant_slug, prepItem.name]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = rarityColor(prepItem.rarity);
  const look = findLook(prepItem.rarity, inRange);
  const tier = Math.max(1, Math.min(5, Math.round(prepItem.rarity || 1)));
  const ridePhoto = rideSpec(prepItem.rarity).style === 'ride_photo';
  const moving = animated && active;
  // Each find bobs on its own beat so a cluster never moves in lockstep.
  const phase = ((prepItem.pivot_id ?? prepItem.id) % 7) / 7;

  const bob = useAnimatedStyle(() => {
    if (!moving) return { transform: [{ translateY: 0 }] };
    if (look.hop) {
      const hop = Math.abs(Math.sin(clock.value * Math.PI * 1.15 + phase * Math.PI));
      const land = 1 - hop;
      return { transform: [{ translateY: -11 * hop }, { scaleX: 1 + 0.07 * land ** 6 }, { scaleY: 1 - 0.07 * land ** 6 }] };
    }
    const drift = Math.sin((clock.value * 0.55 + phase) * Math.PI * 2);
    return { transform: [{ translateY: -3 * drift }, { rotate: `${2.5 * drift}deg` }] };
  }, [look.hop, phase, moving]);
  const pulse = useAnimatedStyle(() => {
    if (!moving) return { opacity: inRange ? 0.75 : 0.45, transform: [{ scale: 1 }] };
    const wave = 0.5 + 0.5 * Math.sin((clock.value * (inRange ? 1.1 : 0.5) + phase) * Math.PI * 2);
    return { opacity: (inRange ? 0.6 : 0.35) + 0.35 * wave, transform: [{ scale: 0.9 + 0.2 * wave }] };
  }, [inRange, phase, moving]);
  const below = fingerSide === 'below-left' || fingerSide === 'below-right';
  const leftSide = fingerSide === 'left' || fingerSide === 'below-left';
  // Below the find the finger points up at it (rotated), so it stays off the player's shark.
  const tilt = below ? '210deg' : leftSide ? '-28deg' : '28deg';
  const finger = useAnimatedStyle(() => {
    if (!moving) return { transform: [{ translateY: 0 }, { rotate: tilt }] };
    // Out of phase with the item's hop.
    const tap = Math.abs(Math.sin(clock.value * Math.PI * 1.15 + phase * Math.PI + 1.4));
    return { transform: [{ translateY: (below ? 5 : -5) * tap }, { rotate: tilt }] };
  }, [phase, moving, tilt, below]);
  // One pulse per new key: the art swells 1.35x and a ring blooms (Reduce Motion: the ring only, no swell).
  const reduced = useReducedGameMotion();
  const pulseV = useSharedValue(0);
  useEffect(() => {
    if (pulseKey == null) return;
    pulseV.value = 0;
    pulseV.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0, { duration: 420 }));
  }, [pulseKey, pulseV]);
  const pulseArt = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : 1 + 0.35 * pulseV.value }] }), [reduced]);
  const pulseRing = useAnimatedStyle(() => ({ opacity: pulseV.value, transform: [{ scale: 0.8 + 0.6 * pulseV.value }] }));
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${moving ? (clock.value * 24) % 360 : 0}deg` }] }), [moving]);

  return (
    <View style={[styles.box, hidden && styles.hidden]} pointerEvents="box-none">
      <View style={[styles.scaled, { opacity: look.opacity, transform: [{ scale: look.scale }] }]}>
        <View style={styles.groundShadow} />
        {/* Commons glow warm gold in range (never the grey that read as a loading bar). */}
        {inRange && <Animated.Image source={GLOW} style={[styles.groundGlow, { tintColor: tier === 1 ? BRAND.gold : color }, pulse]} />}
        {look.rays && <Animated.View style={[styles.rays, rays]} pointerEvents="none">
          {[0, 45, 90, 135].map(angle => <View key={angle}
            style={[styles.ray, { backgroundColor: color, transform: [{ rotate: `${angle}deg` }] }]} />)}
        </Animated.View>}
        {look.aura && <Animated.Image source={GLOW} style={[styles.aura, { tintColor: color }, pulse]} />}
        <Animated.View style={[styles.pulseRing, { borderColor: color }, pulseRing]} pointerEvents="none" />
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
          color={look.rays ? BRAND.goldLight : color} animated={moving} />)}
      </View>
      {/* Ride Photo finds wear a camera badge that also carries the rarity mark (pips, gem or crown). */}
      {ridePhoto && !chromeless && <View style={[styles.cameraBadge, { backgroundColor: color }, !inRange && styles.cameraBadgeFar]}>
        <GameIcon name="camera" size={inRange ? 16 : 12} />
        {inRange && <RarityMark tier={tier} />}
      </View>}
      {count > 1 && !chromeless && <View style={styles.countBadge}><Text style={styles.countText}>×{count}</Text></View>}
      {prepItem.is_new_variant && !chromeless && count === 1 && (inRange
        ? <View style={styles.newBadge}><Text style={styles.newText}>NEW</Text></View>
        : <View style={styles.newDot} />)}
      {inRange && !chromeless && showFinger && <Animated.Image source={FINGER} style={[styles.finger, below ? styles.fingerBelow : leftSide ? styles.fingerLeft : styles.fingerRight, finger]} />}
      {!inRange && <Image source={FOOTSTEPS} style={styles.footsteps} contentFit="contain" transition={0} />}
      {leavingSoon && !chromeless && <View style={styles.timePill}><GameIcon name="timer" size={14} /><Text style={styles.timeText}>{leavingSoon}</Text></View>}
    </View>
  );
}

export default memo(PrepItem);

const B = FIND_MARKER_BOX;
const A = FIND_ART_SIZE;
const styles = StyleSheet.create({
  box: { width: B, height: B, alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  scaled: { width: B, height: B, alignItems: 'center', justifyContent: 'center' },
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
  markGlyph: { fontSize: 12, lineHeight: 13, color: BRAND.white },
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
  // Hovers 6 pt off the art with the fingertip toward the find, on the side away from the player.
  finger: { position: 'absolute', top: B / 2 - A / 2 - 30, width: 30, height: 38 },
  fingerRight: { left: B / 2 + A / 2 - 4 },
  fingerLeft: { left: B / 2 - A / 2 - 26 },
  // Under the find's lower-left corner: clear of the camera badge (bottom right) and the timer pill.
  fingerBelow: { top: B / 2 + A / 2 - 20, left: B / 2 - A / 2 - 30 },
  footsteps: { position: 'absolute', bottom: 18, width: 18, height: 22, opacity: 0.9 },
  timePill: { position: 'absolute', bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(5,52,110,0.88)',
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  timeText: { color: BRAND.white, fontFamily: 'Knockout', fontSize: 14 },
});
