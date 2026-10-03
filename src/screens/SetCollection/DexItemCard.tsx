/**
 * The big item card in Alex's popup frame: a gold ribbon with the name, a
 * glossy blue body, the red X close in the corner. Shows the art (or the
 * Ride Photo), the rarity chip with gems, how many caught, the flavor line,
 * where and when it spawns, and for a missing item a spare meter with a
 * bright "Swap!" once there are enough spares (a grey locked plate before).
 *
 * VoiceOver: the backdrop is a separate "Dismiss" control and the card is a
 * modal view, so every control inside is reachable.
 */
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { parkDayCaptureSize } from '../../components/parkDayShareMetrics';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import { BRAND, GameButton, GameIcon, gameAlert } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { BluePanel, CLOSE_X, itemArt, RIBBON, SILHOUETTE, StarBurst } from './DexParts';
import { RarityGems, rarityLook } from './dexLook';
import { caughtLine, spawnIcon, swapProgress, type DexItem, type DexSet } from './dexModel';
import { Offscreen, RidePhoto, RidePhotoShareCard } from './RidePhoto';

export function ItemCard({ item, set, spares, onClose, onExchange, exchanging, onShare, onFind, error }: {
  readonly item: DexItem | null; readonly set: DexSet | null; readonly spares: number;
  readonly onClose: () => void; readonly onExchange: (() => void) | null; readonly exchanging: boolean;
  readonly onShare: (() => void) | null; readonly onFind: () => void; readonly error: string | null;
}) {
  const { width, height } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const shareRef = useRef<View>(null);
  const [shareMount, setShareMount] = useState(false);
  const [shareReady, setShareReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const photo = item?.found && item.photoGrade ? item.photoGrade : null;
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const glow = useSharedValue(0);

  const itemId = item?.id ?? null;
  const [swappedKey, setSwappedKey] = useState(0);
  const found = item?.found ?? false;
  // Pop in once per item. A swap (found turning true on the same item) flips the art in place instead.
  useEffect(() => {
    setShareMount(false);
    setShareReady(false);
    setSwappedKey(0);
    if (itemId == null) return;
    scale.value = reduced ? 1 : 0.6;
    if (!reduced) scale.value = withSpring(1, { damping: 11, stiffness: 200 });
  }, [itemId, reduced, scale]);

  const flip = useSharedValue(1);
  const lastFound = useRef<{ id: number | null; found: boolean }>({ id: null, found: false });
  useEffect(() => {
    const before = lastFound.current;
    lastFound.current = { id: itemId, found };
    if (before.id !== itemId || before.found || !found) return;
    setSwappedKey(Date.now());
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    playSfx('fx.coinTick', 0.9);
    if (reduced) return;
    flip.value = 0;
    flip.value = withTiming(1, { duration: 520 });
  }, [itemId, found, reduced, flip]);

  useEffect(() => {
    if (itemId == null || found || reduced) { glow.value = 0; return; }
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false);
  }, [itemId, found, reduced, glow]);

  // The share card is built only when the player taps Share, then captured once its art is ready.
  useEffect(() => {
    if (!shareMount || !shareReady || !sharing) return;
    let live = true;
    void (async () => {
      try {
        if (!await Sharing.isAvailableAsync()) {
          gameAlert('Sharing unavailable', 'This device cannot open a share sheet right now.');
          return;
        }
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!live || !shareRef.current) return;
        const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, ...parkDayCaptureSize(Platform.OS, PixelRatio.get()) });
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your Ride Photo' });
      } catch {
        gameAlert('Card not made', 'Your Ride Photo is saved. Try sharing again.', undefined, { icon: 'retry' });
      } finally {
        if (live) { setSharing(false); setShareMount(false); setShareReady(false); }
      }
    })();
    return () => { live = false; };
  }, [shareMount, shareReady, sharing]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: Math.min(1, scale.value * 1.6 - 0.6) }));
  // scaleX 1 -> 0 (silhouette) then 0 -> 1 (color): a coin-flip in place.
  const flipStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.abs(1 - 2 * Math.min(1, flip.value)) * 0.98 + 0.02 }] }));
  const silhouetteStyle = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0 }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.45 * glow.value, transform: [{ scale: 0.9 + 0.12 * glow.value }] }));
  const look = item ? rarityLook(item.rarity) : null;
  const swap = item ? swapProgress(item, spares) : null;

  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onClose} style={StyleSheet.absoluteFill} />
        {item && look && swap && (
          <Animated.View style={[styles.cardWrap, cardStyle]} accessibilityViewIsModal>
            <View style={styles.ribbon}>
              <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
              <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
                {item.name}
              </Text>
            </View>
            <BluePanel style={styles.body}>
              <ScrollView style={{ maxHeight: height * 0.78 }} contentContainerStyle={styles.bodyInner} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={[styles.hero, { height: Math.min(photo ? 262 : 230, Math.round(height * (photo ? 0.31 : 0.27))) },
                photo && styles.heroPhoto, item.goldenHour && styles.heroGolden]}>
                {!item.found && <Animated.View style={[styles.halo, { backgroundColor: look.frame }, glowStyle]} />}
                {item.found && !photo && <View style={[styles.halo, { backgroundColor: 'rgba(255,255,255,0.35)' }]} />}
                {/* The burst sits behind the art, never over it. */}
                {item.found && item.isNew && <StarBurst key={`${item.id}-${swappedKey}`} color={look.frame} />}
                {photo ? (
                  <RidePhoto grade={photo} art={itemArt(item)} photoUrl={item.photoUrl} width={Math.min(300, width - 110)} />
                ) : (
                  <Animated.View style={flipStyle}>
                    <Image source={itemArt(item)} contentFit="contain" tintColor={item.found ? undefined : SILHOUETTE}
                      style={{ width: Math.min(190, height * 0.22), height: Math.min(190, height * 0.22) }} />
                    {item.found && swappedKey > 0 && (
                      <Animated.View style={[StyleSheet.absoluteFill, silhouetteStyle]}>
                        <Image source={itemArt(item)} contentFit="contain" tintColor={SILHOUETTE} style={StyleSheet.absoluteFill} />
                      </Animated.View>
                    )}
                  </Animated.View>
                )}
                {swappedKey > 0 && item.found && <View style={styles.swappedStamp}><Text style={styles.swappedText}>Swapped!</Text></View>}
                {item.goldenHour && <View style={styles.goldenTag}><GameIcon name="sparkle" size={18} /><Text style={styles.goldenText}>Golden Hour</Text></View>}
              </View>
              <View style={styles.facts}>
                <View style={[styles.rarityChip, { backgroundColor: look.chip, borderColor: look.frame }]}>
                  <RarityGems rarity={item.rarity} size={9} />
                  <Text style={[styles.rarityText, { color: look.ink }]}>{look.label}</Text>
                </View>
                <View style={[styles.caughtChip, item.found ? styles.caughtYes : null]}>
                  <GameIcon name={item.found ? 'check' : 'search'} size={20} />
                  <Text style={styles.caughtText}>{item.found && item.foundInWorld === false ? 'Swapped in' : caughtLine(item)}</Text>
                </View>
              </View>
              {!!item.flavor && <Text style={styles.flavor}>{item.flavor}</Text>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Where to find it: ${item.spawnHint}. Open the map.`}
                onPress={onFind} style={({ pressed }) => [styles.where, pressed && { opacity: 0.85 }]}>
                <GameIcon name={spawnIcon(item.spawnHint)} size={30} />
                <Text style={styles.whereText}>{item.spawnHint}</Text>
                <GameIcon name="arrow" size={24} />
              </Pressable>

              {/* One fixed slot: after a swap the button cross-fades into a chip of the same height, so nothing reflows. */}
              {item.found && swappedKey > 0 && (
                <View style={styles.swappedSlot} accessible accessibilityLabel="Swapped in. Catch one on the map too!">
                  <GameIcon name="check" size={28} />
                  <Text style={styles.swappedSlotText}>Catch one on the map too!</Text>
                </View>
              )}
              {!item.found && onExchange && (
                swap.ready ? (
                  <SwapReady cost={swap.need} busy={exchanging} reduced={reduced} onPress={onExchange} />
                ) : (
                  <View style={styles.locked} accessible accessibilityLabel={`Locked. ${swap.have} of ${swap.need} spares to swap for it.`}>
                    <GameIcon name="lock" size={28} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lockedText}>{swap.have}/{swap.need} spares to swap</Text>
                      <View style={styles.meter}>
                        {Array.from({ length: swap.need }, (_, index) => (
                          <View key={index} style={[styles.meterCell, index < swap.have && styles.meterOn]} />
                        ))}
                      </View>
                    </View>
                  </View>
                )
              )}
              {photo && (
                <GameButton label={sharing ? 'Making your card...' : 'Share my Ride Photo'} icon="camera" loading={sharing}
                  onPress={() => { playSfx('ui.tap', 0.6); setSharing(true); setShareMount(true); }} fullWidth style={{ marginTop: 10 }} />
              )}
              {item.found && swappedKey === 0 && onShare && item.spares > 0 && (
                <GameButton label="Share a spare" icon="heart" variant="secondary" onPress={onShare} fullWidth style={{ marginTop: 8 }} />
              )}
              {!!error && <Text style={styles.error}>{error}</Text>}
              </ScrollView>
            </BluePanel>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={styles.close}>
              <Image source={CLOSE_X} style={StyleSheet.absoluteFill} contentFit="contain" />
            </Pressable>
            {photo && shareMount && (
              <Offscreen>
                <RidePhotoShareCard ref={shareRef} grade={photo} art={itemArt(item)} photoUrl={item.photoUrl}
                  itemName={item.name} setName={set?.name ?? ''} rarity={item.rarity} onReadyChange={setShareReady} />
              </Offscreen>
            )}
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

function SwapReady({ cost, busy, reduced, onPress }: { readonly cost: number; readonly busy: boolean; readonly reduced: boolean; readonly onPress: () => void }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withSequence(withTiming(1.05, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
  }, [reduced, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <Animated.View style={[{ marginTop: 10, height: 58, justifyContent: 'center' }, style]}>
      <GameButton label={`Swap! (${cost} spares)`} icon="swap" loading={busy} onPress={onPress} fullWidth
        accessibilityLabel={`Swap ${cost} spares for this item`} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.86)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  cardWrap: { width: '100%', maxWidth: 390, paddingTop: 26 },
  ribbon: { position: 'absolute', top: 0, left: 24, right: 24, height: 62, zIndex: 3, justifyContent: 'center', paddingHorizontal: 34 },
  ribbonText: { fontFamily: 'Shark', fontSize: 24, color: '#7a3d00', textAlign: 'center', marginTop: -6 },
  body: { paddingTop: 34 },
  bodyInner: { paddingHorizontal: 14, paddingBottom: 16 },
  hero: {
    borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)', overflow: 'hidden',
  },
  heroPhoto: { backgroundColor: 'transparent', borderWidth: 0 },
  heroGolden: { backgroundColor: '#ffd66b', borderColor: BRAND.gold, borderWidth: 3 },
  swappedStamp: {
    position: 'absolute', top: 12, right: 10, paddingHorizontal: 12, height: 34, justifyContent: 'center', borderRadius: 8,
    backgroundColor: BRAND.green, borderWidth: 3, borderColor: BRAND.white, transform: [{ rotate: '8deg' }],
  },
  swappedSlot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, height: 58, borderRadius: 16,
    backgroundColor: '#eafbef', borderWidth: 3, borderColor: BRAND.green,
  },
  swappedSlotText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  swappedText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, textTransform: 'uppercase' },
  halo: { position: 'absolute', width: 210, height: 210, borderRadius: 105 },
  goldenTag: {
    position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10,
    height: 28, borderRadius: 14, backgroundColor: '#7a3d00', zIndex: 3,
  },
  goldenText: { fontFamily: 'Shark', fontSize: 14, color: '#ffe07a' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 },
  rarityChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 3 },
  rarityText: { fontFamily: 'Shark', fontSize: 16 },
  caughtChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: BRAND.white, borderWidth: 3, borderColor: '#bcd9f2',
  },
  caughtYes: { borderColor: BRAND.green },
  caughtText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  flavor: {
    fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: BRAND.white, textAlign: 'center', marginTop: 10,
    textShadowColor: 'rgba(5,52,110,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0,
  },
  where: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, marginTop: 12, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: BRAND.white, borderWidth: 3, borderColor: '#bcd9f2',
  },
  whereText: { flex: 1, fontFamily: 'Shark', fontSize: 16, lineHeight: 19, color: BRAND.navy },
  locked: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, height: 58, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: '#c9d3de', borderWidth: 3, borderColor: '#9aa9b9',
  },
  lockedText: { fontFamily: 'Shark', fontSize: 15, color: '#2e3f53' },
  meter: { flexDirection: 'row', gap: 4, marginTop: 5 },
  meterCell: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#e8edf2', borderWidth: 1.5, borderColor: '#9aa9b9' },
  meterOn: { backgroundColor: BRAND.blueBright, borderColor: BRAND.blue },
  error: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.white, marginTop: 8, textAlign: 'center' },
  close: { position: 'absolute', top: 14, right: -6, width: 50, height: 50, zIndex: 4 },
});
