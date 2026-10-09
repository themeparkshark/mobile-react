/**
 * A sticker in the album. Found: a bright white sticker in its rarity frame,
 * the art in full color, a "+2" badge for extra copies, a shimmer sweep on
 * Legendaries, and a one-time flip from shape to color for a new find.
 * Still to find: an empty slot printed in the album (dashed edge, faded
 * shape), so found and missing read apart at arm's length. The rarity lives
 * on the group heading above the row, so tiles carry no gems and no names
 * (the name is on the card a tap opens and in the VoiceOver label).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GIFT, itemArt, SpringPress } from './DexParts';
import { SLOT_COLORS } from './BookParts';
import { rarityLook } from './dexLook';
import type { DexItem } from './dexModel';

// New finds flip once per device; the ids are remembered here.
const SEEN_KEY = 'dex_new_seen_v1';
let seen: Set<number> | null = null;
let loading: Promise<Set<number>> | null = null;
function seenIds(): Promise<Set<number>> {
  if (seen) return Promise.resolve(seen);
  loading ??= AsyncStorage.getItem(SEEN_KEY)
    .then(raw => new Set<number>(raw ? (JSON.parse(raw) as number[]).filter(Number.isFinite) : []))
    .catch(() => new Set<number>())
    .then(set => { seen = set; return set; });
  return loading;
}
function markSeen(id: number) {
  void seenIds().then(set => {
    if (set.has(id)) return;
    set.add(id);
    void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-400))).catch(() => undefined);
  });
}

export const ItemTile = memo(function ItemTile({ item, width, onPress }: {
  readonly item: DexItem; readonly width: number; readonly onPress: (item: DexItem) => void;
}) {
  const reduced = useUiReducedMotion();
  const look = rarityLook(item.rarity);
  const [artFailed, setArtFailed] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const turn = useSharedValue(0);
  const shine = useSharedValue(-1);

  // FlashList recycles this cell for other items: drop every per-item state on a new id.
  useEffect(() => {
    setArtFailed(false);
    setFlipping(false);
    turn.value = 0;
  }, [item.id, turn]);

  // First time a NEW find is on screen: flip from silhouette to color.
  useEffect(() => {
    if (!item.isNew || !item.found || reduced) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void seenIds().then(set => {
      if (!live || set.has(item.id)) return;
      setFlipping(true);
      turn.value = 0;
      turn.value = withDelay(250, withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) }));
      timer = setTimeout(() => { if (live) setFlipping(false); }, 1000);
      markSeen(item.id);
    });
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      setFlipping(false);
    };
  }, [item.id, item.isNew, item.found, reduced, turn]);

  // Legendary shimmer every ~3.5 s while the tile is mounted (the list unmounts off-screen tiles).
  useEffect(() => {
    if (item.rarity < 5 || !item.found || reduced) { cancelAnimation(shine); shine.value = -1; return; }
    // Every 3 s: a wide bright sweep, and the gold rim pulses with it.
    shine.value = withRepeat(withSequence(withTiming(-1, { duration: 0 }), withDelay(2100, withTiming(1, { duration: 900 }))), -1, false);
    return () => cancelAnimation(shine);
  }, [item.rarity, item.found, reduced, shine]);

  const flipStyle = useAnimatedStyle(() => (flipping ? {
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(turn.value, [0, 0.5, 1], [0, 90, 0])}deg` }],
  } : {}));
  const colorStyle = useAnimatedStyle(() => ({ opacity: flipping ? (turn.value >= 0.5 ? 1 : 0) : 1 }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: flipping && turn.value < 0.5 ? 1 : 0 }));
  const shineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shine.value * width * 1.4 }, { rotate: '20deg' }] }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - Math.abs(shine.value) * 1.4) }));

  const art = artFailed ? GIFT : itemArt(item);
  const artSize = width * (item.found ? 0.76 : 0.66);
  const label = item.found
    ? `${item.name}, ${look.label}, found${item.spares > 0 ? `, ${item.spares} extra` : ''}${item.isNew ? ', new' : ''}`
    : `${item.name}, ${look.label}, still to find`;
  const panel = item.found
    ? [styles.sticker, { borderColor: look.frame, width, height: width }]
    : [styles.slot, { width, height: width }];
  return (
    <SpringPress onPress={() => onPress(item)} accessibilityLabel={label} style={{ width }}>
      <Animated.View style={flipStyle}>
        <View key={item.id} style={panel}>
          {item.found && <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(5,52,110,0.06)']} style={StyleSheet.absoluteFill} pointerEvents="none" />}
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, colorStyle]}>
            <Image source={art} contentFit="contain" allowDownscaling recyclingKey={String(item.id)} onError={() => setArtFailed(true)}
              tintColor={item.found ? undefined : SLOT_COLORS.ink}
              style={{ width: artSize, height: artSize, opacity: item.found ? 1 : 0.75 }} />
          </Animated.View>
          {flipping && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, shadowStyle]}>
              <Image source={art} contentFit="contain" allowDownscaling tintColor={SLOT_COLORS.ink} style={{ width: artSize, height: artSize }} />
            </Animated.View>
          )}
          {item.rarity >= 5 && item.found && (
            <Animated.View style={[styles.shine, { height: width * 1.6, top: -width * 0.3 }, shineStyle]} pointerEvents="none">
              <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
          {item.rarity >= 5 && item.found && <Animated.View style={[styles.rim, rimStyle]} pointerEvents="none" />}
          {item.found && item.spares > 0 && (
            <View style={styles.count}><Text style={styles.countText} maxFontSizeMultiplier={1.2}>+{item.spares}</Text></View>
          )}
          {item.isNew && item.found && <View style={styles.newTag}><GameIcon name="new" size={30} /></View>}
        </View>
      </Animated.View>
    </SpringPress>
  );
}, (a, b) => a.item === b.item && a.width === b.width && a.onPress === b.onPress);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  // A found sticker: white, its rarity frame, a lip and a soft lift off the cream page.
  sticker: {
    borderRadius: 16, borderWidth: 3, borderBottomWidth: 6, backgroundColor: BRAND.white, overflow: 'hidden', ...SHADOW.card,
    shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  // An empty slot printed in the album.
  slot: {
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: SLOT_COLORS.edge, backgroundColor: SLOT_COLORS.fill, overflow: 'hidden',
  },
  count: {
    position: 'absolute', bottom: 4, right: 4, minWidth: 30, height: 22, paddingHorizontal: 5, borderRadius: 11,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  newTag: { position: 'absolute', top: 0, left: 0 },
  shine: { position: 'absolute', width: 60, left: '35%' },
  rim: { ...StyleSheet.absoluteFillObject, borderRadius: 13, borderWidth: 4, borderColor: '#ffe07a' },
});
