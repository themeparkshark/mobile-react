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
  Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { GIFT, itemArt, SpringPress } from './DexParts';
import { SLOT_COLORS } from './BookParts';
import { SHEEN, sweepAt } from './bookClock';
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
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function markSeen(id: number) {
  void seenIds().then(set => {
    if (set.has(id)) return;
    set.add(id);
    // One write per batch of new finds, not one per tile.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-400))).catch(() => undefined);
    }, 400);
  });
}
// Several new finds on one page flip one after another (120 ms apart) with one pop and one haptic for the group.
let flipQueue = 0;
let lastFlipAt = 0;
function nextFlipDelay(): { delay: number; lead: boolean } {
  const now = Date.now();
  if (now - lastFlipAt > 900) flipQueue = 0;
  lastFlipAt = now;
  const slot = flipQueue;
  flipQueue += 1;
  return { delay: 250 + slot * 120, lead: slot === 0 };
}

/** Height of a tile row: the sticker plus its one-line name. */
export const tileHeight = (width: number) => width + NAME_H;
const NAME_H = 40;

export const ItemTile = memo(function ItemTile({ item, width, onPress, active = true, slot = 0 }: {
  readonly item: DexItem; readonly width: number; readonly onPress: (item: DexItem) => void;
  /** False while the screen is covered: the sheen loops stop. */
  readonly active?: boolean;
  /** The find's number in its set (shown on a missing slot's plate: "#14"). */
  readonly slot?: number;
}) {
  const reduced = useUiReducedMotion();
  const look = rarityLook(item.rarity);
  const [artFailed, setArtFailed] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const turn = useSharedValue(0);

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
    let flipTimer: ReturnType<typeof setTimeout> | null = null;
    void seenIds().then(set => {
      if (!live || set.has(item.id)) return;
      setFlipping(true);
      const { delay, lead } = nextFlipDelay();
      turn.value = 0;
      turn.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.4)) }));
      // The pop lands as the first sticker turns its face (about the 90 degree point).
      if (lead) {
        flipTimer = setTimeout(() => {
          if (!live) return;
          playSfx('ui.select', 0.55);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        }, delay + 230);
      }
      timer = setTimeout(() => { if (live) setFlipping(false); }, delay + 760);
      markSeen(item.id);
    });
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      if (flipTimer) clearTimeout(flipTimer);
      setFlipping(false);
    };
  }, [item.id, item.isNew, item.found, reduced, turn]);

  // A sheen that says "rare": Rare every ~7 s, Epic every ~5 s, Legendary every 3 s with its gold rim pulse.
  // Off while the screen is covered, and with Reduce Motion.
  // One page clock drives every sweep (bookClock.SHEEN); each sticker reads it at its own phase, so a row of
  // rare finds never flashes in sync. Legendary sweeps twice per period.
  const sheen = item.found && item.rarity >= 3 && active && !reduced;
  const phase = ((item.id * 397) % 1000) / 1000;
  const twice = item.rarity >= 5;

  // Always returns the transform (0 deg when idle), so a recycled cell never keeps a half-turned tilt.
  const flipStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateY: `${flipping ? interpolate(turn.value, [0, 0.5, 1], [0, 90, 0]) : 0}deg` }],
  }));
  const colorStyle = useAnimatedStyle(() => ({ opacity: flipping ? (turn.value >= 0.5 ? 1 : 0) : 1 }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: flipping && turn.value < 0.5 ? 1 : 0 }));
  const shineStyle = useAnimatedStyle(() => {
    const x = sheen ? sweepAt(SHEEN.value, phase, twice) : -1;
    return { transform: [{ translateX: x * width * 1.4 }, { rotate: '20deg' }] };
  }, [sheen, phase, twice, width]);
  const rimStyle = useAnimatedStyle(() => {
    const x = sheen ? sweepAt(SHEEN.value, phase, twice) : -1;
    return { opacity: Math.max(0, 1 - Math.abs(x) * 1.4) };
  }, [sheen, phase, twice]);

  const art = artFailed ? GIFT : itemArt(item);
  const artSize = width * (item.found ? 0.72 : 0.66);
  const label = item.found
    ? `${item.name}, ${look.label}, found${item.spares > 0 ? `, ${item.spares} extra` : ''}${item.isNew ? ', new' : ''}`
    : `${item.name}, ${look.label}, still to find`;
  // A die-cut sticker sits a hair off straight (from its id, so it never changes): an album, not a spreadsheet.
  const tilt = item.found && !reduced ? (((item.id * 7) % 5) - 2) * 1.5 : 0;
  return (
    <SpringPress onPress={() => onPress(item)} accessibilityLabel={label} accessibilityHint="Double-tap to see it." style={{ width, height: tileHeight(width) }}>
      <Animated.View style={flipStyle}>
        {item.found ? (
          <View style={[styles.sticker, { width, height: width, transform: [{ rotate: `${tilt}deg` }] }]}>
            <View style={[styles.stickerFace, { borderColor: look.frame }, sheen && styles.clip]}>
              <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(5,52,110,0.07)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <Animated.View style={[StyleSheet.absoluteFill, styles.center, colorStyle]}>
                <Image source={art} contentFit="contain" allowDownscaling recyclingKey={String(item.id)} onError={() => setArtFailed(true)}
                  style={{ width: artSize, height: artSize }} />
              </Animated.View>
              {flipping && (
                <Animated.View style={[StyleSheet.absoluteFill, styles.center, shadowStyle]}>
                  <Image source={art} contentFit="contain" allowDownscaling tintColor={SLOT_COLORS.ink} style={{ width: artSize, height: artSize, opacity: 0.35 }} />
                </Animated.View>
              )}
              {sheen && (
                <Animated.View style={[styles.shine, { height: width * 1.6, top: -width * 0.3 }, shineStyle]} pointerEvents="none">
                  <LinearGradient start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
                    colors={['rgba(255,255,255,0)', item.rarity >= 5 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
                </Animated.View>
              )}
            </View>
            {item.rarity >= 5 && sheen && <Animated.View style={[styles.rim, rimStyle]} pointerEvents="none" />}
            {item.spares > 0 && (
              <View style={styles.count}><Text style={styles.countText} maxFontSizeMultiplier={1.2}>+{item.spares}</Text></View>
            )}
            {item.isNew && <View style={styles.newTag}><GameIcon name="new" size={32} /></View>}
            {/* A still foil star on Rare and up, so rarity shows even when nothing moves. */}
            {item.rarity >= 3 && <View style={styles.foil} pointerEvents="none"><GameIcon name="sparkle" size={item.rarity >= 5 ? 22 : 18} /></View>}
          </View>
        ) : (
          <View key={item.id} style={[styles.slot, { width, height: width }]}>
            <Image source={art} contentFit="contain" allowDownscaling recyclingKey={String(item.id)} onError={() => setArtFailed(true)}
              tintColor={SLOT_COLORS.ink} style={{ width: artSize, height: artSize, opacity: SLOT_COLORS.inkOpacity }} />
          </View>
        )}
      </Animated.View>
      {/* Every tile keeps the same label height (tileHeight), so the grid stays even; a missing find leaves it blank. */}
      {item.found
        ? <Text numberOfLines={2} style={styles.name} maxFontSizeMultiplier={1.15}>{item.name}</Text>
        : <View style={styles.plate}><Text style={styles.plateText} maxFontSizeMultiplier={1.15} importantForAccessibility="no">#{slot}</Text></View>}
    </SpringPress>
  );
}, (a, b) => a.item === b.item && a.width === b.width && a.onPress === b.onPress && a.active === b.active && a.slot === b.slot);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  // A found sticker: a rarity-colored die-cut edge, a thick white border, a lip and a soft lift off the page.
  // One sticker: a thick even rarity frame on a white face, a soft navy shadow under it, a slight tilt.
  sticker: { borderRadius: 18, ...SHADOW.card, shadowOpacity: 0.22, shadowRadius: 2, shadowOffset: { width: 0, height: 3 } },
  stickerFace: { flex: 1, borderRadius: 18, backgroundColor: BRAND.white, borderWidth: 4 },
  // Only a sticker with a moving sheen needs the mask (the art already fits inside).
  clip: { overflow: 'hidden' },
  // An empty slot pressed into the album page: dashed edge, the shape faded in navy.
  slot: {
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: SLOT_COLORS.edge, backgroundColor: SLOT_COLORS.fill,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  count: {
    position: 'absolute', bottom: -4, right: -4, minWidth: 34, height: 26, paddingHorizontal: 5, borderRadius: 13,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  newTag: { position: 'absolute', top: -6, left: -6 },
  shine: { position: 'absolute', width: 60, left: '35%' },
  rim: { ...StyleSheet.absoluteFillObject, borderRadius: 18, borderWidth: 4, borderColor: '#ffe07a' },
  plate: { alignSelf: 'center', marginTop: 4, paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: '#f3e7c6', justifyContent: 'center' },
  plateText: { fontFamily: 'Knockout', fontSize: 14, color: '#a8925c' },
  name: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 17, color: BRAND.navy, textAlign: 'center', marginTop: 4 },
  foil: { position: 'absolute', top: 4, right: 4 },
});
