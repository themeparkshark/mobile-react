import { Image, ImageSource } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { PrepItemType } from '../../models/prep-item-type';
import config from '../../config';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND, GameIcon } from '../../ui';
import { useMapAlive } from '../../components/map/alive/MapAliveContext';
import { formatFindDistance, formatLeavesIn, msUntilLeavesInChanges } from './homeFindCopy';

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

interface Props {
  prepItem: PrepItemType;
  onExpire: () => void;
  inRange?: boolean;
  /** Metres from the player, for the out-of-range label. */
  distanceMeters?: number | null;
}

/**
 * The find circle sits at the exact centre of the marker box, so the find is
 * drawn on its real spot whether or not the native MarkerView honours an
 * off-centre anchor (on device it ignored one, which put every find about
 * 19 points north of where the grab-zone math measured it).
 */
export const PREP_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

const RARITY: Record<number, string> = {
  1: '#4CAF50', 2: config.secondary, 3: '#9C27B0', 4: '#FF9800', 5: '#FFD700',
};

/** "leaves in 21m": re-renders when the label changes, and only while the map is on screen. */
function useLeavesIn(activeTo: string | null | undefined, onExpire: () => void, live: boolean): string | null {
  const endsAt = activeTo ? Date.parse(activeTo) : NaN;
  const [label, setLabel] = useState(() => Number.isFinite(endsAt) ? formatLeavesIn(endsAt - Date.now()) : null);
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;
  useEffect(() => {
    if (!Number.isFinite(endsAt) || !live) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const left = endsAt - Date.now();
      setLabel(formatLeavesIn(left));
      if (left <= 0) { expireRef.current(); return; }
      timer = setTimeout(tick, msUntilLeavesInChanges(left));
    };
    tick();
    return () => clearTimeout(timer);
  }, [endsAt, live]);
  return label;
}

/**
 * A home find on the map. In pickup range it bounces with a bright gold ring
 * and says TAP TO GRAB; out of range it sits a little dimmer and says how far
 * it is. Motion rides the map's shared ambient clock on the UI thread, so it
 * stops with the map (off screen, backgrounded, Reduce Motion).
 */
function PrepItem({ prepItem, onExpire, inRange = false, distanceMeters = null }: Props) {
  const { clock, active } = useMapAlive();
  const leavesIn = useLeavesIn(prepItem.active_to, onExpire, active);

  const localImage = useMemo(
    () => prepItemImage(prepItem.variant_slug) || getChurroImage(prepItem.name),
    [prepItem.variant_slug, prepItem.name]
  );
  const imageSource = localImage || (prepItem.icon_url ? { uri: prepItem.icon_url } : null);
  const rarityColor = RARITY[prepItem.rarity] ?? RARITY[1];

  const bounce = useAnimatedStyle(() => {
    if (!inRange) return { transform: [{ translateY: 0 }] };
    const hop = Math.abs(Math.sin(clock.value * Math.PI * 1.4));
    return { transform: [{ translateY: -7 * hop }, { scale: 1 + 0.04 * hop }] };
  }, [inRange]);
  const ringPulse = useAnimatedStyle(() => {
    if (!inRange) return { opacity: 0, transform: [{ scale: 1 }] };
    const wave = 0.5 + 0.5 * Math.sin(clock.value * Math.PI * 2);
    return { opacity: 0.55 + 0.45 * wave, transform: [{ scale: 1 + 0.12 * wave }] };
  }, [inRange]);

  const distance = distanceMeters != null && Number.isFinite(distanceMeters) ? formatFindDistance(distanceMeters) : '';

  return (
    <View style={styles.box}>
      <Animated.View style={[styles.findGroup, bounce]}>
        <Animated.View style={[styles.rangeRing, ringPulse]} />
        <View style={[styles.glow, { backgroundColor: inRange ? BRAND.gold : rarityColor },
          inRange ? styles.glowInRange : styles.glowFar]} />
        <View style={[styles.circle, inRange ? styles.circleInRange : styles.circleFar]}>
          {imageSource ? (
            <Image source={imageSource} style={styles.image} contentFit="contain" />
          ) : (
            <View style={[styles.fallback, { backgroundColor: rarityColor }]}>
              <GameIcon name="gift" size={28} />
            </View>
          )}
        </View>
        {prepItem.is_new_variant && (
          <View style={styles.newBadge}><Text style={styles.newText}>NEW</Text></View>
        )}
        <View style={[styles.rarityDot, { backgroundColor: rarityColor }]} />
      </Animated.View>

      <View style={[styles.label, inRange ? styles.labelInRange : styles.labelFar]}>
        <Text style={[styles.labelTitle, inRange && styles.labelTitleInRange]} numberOfLines={1}>
          {inRange ? 'TAP TO GRAB' : distance || 'WALK CLOSER'}
        </Text>
        {leavesIn && <Text style={[styles.labelTime, inRange && styles.labelTimeInRange]} numberOfLines={1}>{leavesIn}</Text>}
      </View>
    </View>
  );
}

export default memo(PrepItem);

const styles = StyleSheet.create({
  box: { width: 128, height: 124, alignItems: 'center' },
  findGroup: { position: 'absolute', top: 31, width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  rangeRing: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: BRAND.gold },
  glow: { position: 'absolute', width: 70, height: 70, borderRadius: 35 },
  glowInRange: { opacity: 0.55 },
  glowFar: { opacity: 0.25 },
  circle: { width: 60, height: 60, borderRadius: 30, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND.shadow, shadowOffset: { width: 0, height: 2 }, shadowRadius: 2, shadowOpacity: 0.3 },
  circleInRange: { borderColor: BRAND.gold, backgroundColor: BRAND.white },
  circleFar: { borderColor: BRAND.white, backgroundColor: 'rgba(255,255,255,0.82)', opacity: 0.78 },
  image: { width: 45, height: 45 },
  fallback: { width: 45, height: 45, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  newBadge: { position: 'absolute', top: -6, left: -10, backgroundColor: BRAND.gold, borderWidth: 2,
    borderColor: BRAND.white, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 },
  newText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 10 },
  rarityDot: { position: 'absolute', top: 0, right: 0, width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: BRAND.white },
  label: { position: 'absolute', top: 91, alignItems: 'center', borderRadius: 10, borderWidth: 2,
    borderColor: BRAND.white, paddingHorizontal: 7, paddingVertical: 2, maxWidth: 128,
    shadowColor: BRAND.shadow, shadowOffset: { width: 0, height: 2 }, shadowRadius: 0, shadowOpacity: 0.3 },
  labelInRange: { backgroundColor: BRAND.gold },
  labelFar: { backgroundColor: BRAND.blue },
  labelTitle: { fontFamily: 'Shark', fontSize: 12, color: BRAND.white },
  labelTitleInRange: { color: BRAND.navy },
  labelTime: { fontFamily: 'Knockout', fontSize: 10, color: '#d6efff', marginTop: -1 },
  labelTimeInRange: { color: BRAND.navySoft },
});
