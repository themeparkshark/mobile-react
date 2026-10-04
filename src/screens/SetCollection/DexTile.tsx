/**
 * A sticker slot in the book: the rarity frame and gems, the item art (or a
 * dark silhouette), the name underneath, an "x3" badge from two copies up,
 * a shimmer sweep on found
 * Legendaries, and a one-time flip from silhouette to color for a new find.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { BRAND, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GIFT, itemArt, SILHOUETTE, SpringPress } from './DexParts';
import { RarityGems, rarityLook, TilePanel } from './dexLook';
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
  const artSize = width * 0.7;
  const label = item.found
    ? `${item.name}, ${look.label}${item.caught > 1 ? `, caught ${item.caught} times` : ''}`
    : `Missing: ${item.name}, ${look.label}`;
  return (
    <SpringPress onPress={() => onPress(item)} accessibilityLabel={label} style={{ width, marginBottom: 10 }}>
      <Animated.View style={flipStyle}>
        <TilePanel key={item.id} rarity={item.rarity} found={item.found} style={{ width, height: width, justifyContent: 'center' }}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, colorStyle]}>
            <Image source={art} contentFit="contain" recyclingKey={String(item.id)} onError={() => setArtFailed(true)}
              tintColor={item.found ? undefined : SILHOUETTE}
              style={{ width: artSize, height: artSize, opacity: item.found ? 1 : 0.85 }} />
          </Animated.View>
          {flipping && (
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, shadowStyle]}>
              <Image source={art} contentFit="contain" tintColor={SILHOUETTE} style={{ width: artSize, height: artSize }} />
            </Animated.View>
          )}
          {item.rarity >= 5 && item.found && (
            <Animated.View style={[styles.shine, { height: width * 1.6, top: -width * 0.3 }, shineStyle]} pointerEvents="none">
              <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
          {item.rarity >= 5 && item.found && <Animated.View style={[styles.rim, rimStyle]} pointerEvents="none" />}
          <RarityGems rarity={item.rarity} size={Math.min(10, Math.floor((width - 16) / (Math.max(1, item.rarity) * 1.6)))} style={styles.gems} />
          {item.caught > 1 && (
            <View style={styles.count}><Text style={styles.countText} maxFontSizeMultiplier={1.2}>x{item.caught}</Text></View>
          )}
          {item.isNew && item.found && <View style={styles.newTag}><GameIcon name="new" size={30} /></View>}
        </TilePanel>
      </Animated.View>
      <Text numberOfLines={2} style={[styles.name, !item.found && styles.nameMissing]} maxFontSizeMultiplier={1.25}>{item.name}</Text>
    </SpringPress>
  );
}, (a, b) => a.item === b.item && a.width === b.width && a.onPress === b.onPress);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  gems: { position: 'absolute', top: 7, left: 6 },
  count: {
    position: 'absolute', bottom: 5, right: 4, minWidth: 30, height: 24, paddingHorizontal: 5, borderRadius: 12,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  newTag: { position: 'absolute', bottom: 2, left: 2 },
  shine: { position: 'absolute', width: 60, left: '35%' },
  rim: { ...StyleSheet.absoluteFillObject, borderRadius: 13, borderWidth: 4, borderColor: '#ffe07a' },
  name: {
    fontFamily: 'Shark', fontSize: 14, lineHeight: 15, color: BRAND.navy, textAlign: 'center', marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 8, overflow: 'hidden', paddingHorizontal: 3, paddingVertical: 2,
  },
  nameMissing: { color: '#2e4866', backgroundColor: 'rgba(225,236,247,0.94)' },
});
