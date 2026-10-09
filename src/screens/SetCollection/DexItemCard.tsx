/**
 * The big item card in Alex's popup frame: a gold ribbon with the name, a
 * glossy blue body, the red X close in the corner. Shows the art (or the
 * Ride Photo), the rarity chip with gems, how many caught, the flavor line,
 * where and when it spawns. A missing item is earned on the map only: no
 * swaps (retired Oct 4). Items swapped in before that keep a "Swapped in" chip.
 *
 * VoiceOver: the backdrop is a separate "Dismiss" control and the card is a
 * modal view, so every control inside is reachable.
 */
import { shareFileExternal } from '../../services/external';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Modal, PixelRatio, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { captureRef } from 'react-native-view-shot';
import { parkDayCaptureSize } from '../../components/parkDayShareMetrics';
import { playSfx } from '../../gamekit/SFX';
import { BRAND, GameButton, GameIcon, gameAlert } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { HuntSwitch, SLOT_COLORS } from './BookParts';
import { CLOSE_X, itemArt, RIBBON, StarBurst } from './DexParts';
import { RarityGems, rarityLook } from './dexLook';
import { caughtLine, spawnIcon, type DexItem, type DexSet } from './dexModel';
import { Offscreen, RidePhoto, RidePhotoShareCard } from './RidePhoto';

export function ItemCard({ item, set, onClose, onShare, onFind, error, hunt = null }: {
  readonly item: DexItem | null; readonly set: DexSet | null;
  /** The set's Hunt switch, offered on a missing find (null when the set cannot be hunted). */
  readonly hunt?: { readonly on: boolean; readonly busy: boolean; readonly onPress: () => void } | null;
  readonly onClose: () => void;
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
  const found = item?.found ?? false;
  // Pop in once per item.
  useEffect(() => {
    setShareMount(false);
    setShareReady(false);
    if (itemId == null) return;
    scale.value = reduced ? 1 : 0.6;
    if (!reduced) scale.value = withSpring(1, { damping: 11, stiffness: 200 });
  }, [itemId, reduced, scale]);

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
          gameAlert('Can’t share right now', 'This phone can’t share right now. Try again later.');
          return;
        }
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!live || !shareRef.current) return;
        const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, ...parkDayCaptureSize(Platform.OS, PixelRatio.get()) });
        await shareFileExternal(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your Ride Photo' });
      } catch {
        gameAlert('Your card didn’t get made', 'Your Ride Photo is still saved. Tap Share to try again.', undefined, { icon: 'retry' });
      } finally {
        if (live) { setSharing(false); setShareMount(false); setShareReady(false); }
      }
    })();
    return () => { live = false; };
  }, [shareMount, shareReady, sharing]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: Math.min(1, scale.value * 1.6 - 0.6) }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.45 * glow.value, transform: [{ scale: 0.9 + 0.12 * glow.value }] }));
  const look = item ? rarityLook(item.rarity) : null;

  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={StyleSheet.absoluteFill} />
        {item && look && (
          <Animated.View style={[styles.cardWrap, cardStyle]} accessibilityViewIsModal>
            <View style={styles.ribbon}>
              <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
              <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
                {item.name}
              </Text>
            </View>
            <View style={styles.body}>
              <ScrollView style={{ maxHeight: height * 0.78 }} contentContainerStyle={styles.bodyInner} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={[styles.hero, { height: Math.min(photo ? 262 : 230, Math.round(height * (photo ? 0.31 : 0.27))) },
                photo && styles.heroPhoto, !item.found && styles.heroSlot, item.found && !photo && { borderColor: look.frame },
                item.goldenHour && !photo && styles.heroGolden]}>
                {!item.found && <Animated.View style={[styles.halo, { backgroundColor: 'rgba(255,255,255,0.5)' }, glowStyle]} />}
                {item.found && !photo && <View style={[styles.halo, { backgroundColor: look.chip }]} />}
                {/* The burst sits behind the art, never over it. */}
                {item.found && item.isNew && <StarBurst key={item.id} color={look.frame} />}
                {photo ? (
                  <RidePhoto grade={photo} art={itemArt(item)} photoUrl={item.photoUrl} width={Math.min(300, width - 110)} />
                ) : (
                  <Image source={itemArt(item)} contentFit="contain" tintColor={item.found ? undefined : SLOT_COLORS.ink}
                    style={{ width: Math.min(190, height * 0.22), height: Math.min(190, height * 0.22), opacity: 1 }} />
                )}
                {item.goldenHour && <View style={styles.goldenTag}><GameIcon name="sparkle" size={18} /><Text style={styles.goldenText}>Golden Hour</Text></View>}
              </View>
              <View style={styles.facts}>
                <View style={[styles.rarityChip, { backgroundColor: look.chip, borderColor: look.frame }]}>
                  <RarityGems rarity={item.rarity} size={9} />
                  <Text style={[styles.rarityText, { color: look.ink }]}>{look.label}</Text>
                </View>
                <View style={[styles.caughtChip, item.found && item.foundInWorld !== false ? styles.caughtYes : null]}
                  accessible accessibilityLabel={caughtLine(item)}>
                  <GameIcon name={item.found ? 'check' : 'lock'} size={20} />
                  <Text style={styles.caughtText}>{item.found && item.foundInWorld === false ? 'Swapped in' : caughtLine(item)}</Text>
                </View>
              </View>
              {!!item.flavor && <Text style={styles.flavor}>{item.flavor}</Text>}
              <View style={styles.where} accessible accessibilityLabel={`When to look: ${item.spawnHint}`}>
                <GameIcon name={spawnIcon(item.spawnHint)} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.whereLabel}>When to look</Text>
                  <Text style={styles.whereText}>{item.spawnHint}</Text>
                </View>
              </View>
              {!item.found && hunt && (
                <View style={{ marginTop: 10, alignItems: 'stretch' }}>
                  <HuntSwitch on={hunt.on} busy={hunt.busy} onPress={hunt.onPress} reduced={reduced} />
                </View>
              )}
              {/* A missing find is earned on the map: one big, obvious way there. A swapped-in one points there too. */}
              {(!item.found || item.foundInWorld === false) && (
                <GameButton label={item.found ? 'Catch one on the map' : 'Find it on the map'} icon="map" onPress={onFind} fullWidth
                  style={{ marginTop: 10 }} accessibilityLabel={`${item.found ? 'Catch' : 'Find'} ${item.name} on the map`} />
              )}

              {photo && (
                <GameButton label={sharing ? 'Making your card...' : 'Share my Ride Photo'} icon="camera" loading={sharing}
                  onPress={() => { playSfx('ui.tap', 0.6); setSharing(true); setShareMount(true); }} fullWidth style={{ marginTop: 10 }} />
              )}
              {item.found && onShare && item.spares > 0 && (
                <GameButton label="Give to a friend" icon="heart" onPress={onShare} fullWidth style={{ marginTop: 10 }} />
              )}
              {!!error && <Text style={styles.error}>{error}</Text>}
              </ScrollView>
            </View>
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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.86)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  cardWrap: { width: '100%', maxWidth: 390, paddingTop: 26 },
  ribbon: { position: 'absolute', top: 0, left: 24, right: 24, height: 62, zIndex: 3, justifyContent: 'center', paddingHorizontal: 34 },
  ribbonText: { fontFamily: 'Shark', fontSize: 24, color: '#7a3d00', textAlign: 'center', marginTop: -6 },
  // The cream album page (same as the Collections sheet and the extras sheet).
  body: {
    paddingTop: 34, backgroundColor: BRAND.cream, borderRadius: 22, borderWidth: 4, borderColor: BRAND.white, borderBottomWidth: 8,
    borderBottomColor: '#e3d3a3', overflow: 'hidden',
  },
  bodyInner: { paddingHorizontal: 14, paddingBottom: 16 },
  hero: {
    borderRadius: 18, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: '#efe1b8', overflow: 'hidden',
  },
  heroSlot: { backgroundColor: SLOT_COLORS.fill, borderColor: SLOT_COLORS.edge, borderWidth: 3, borderStyle: 'dashed' },
  heroPhoto: { backgroundColor: 'transparent', borderWidth: 0 },
  heroGolden: { backgroundColor: '#ffd66b', borderColor: BRAND.gold, borderWidth: 3 },
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
    fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: BRAND.navy, textAlign: 'center', marginTop: 10,
  },
  where: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, marginTop: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#efe1b8',
  },
  whereLabel: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  whereText: { fontFamily: 'Shark', fontSize: 17, lineHeight: 20, color: BRAND.navy },
  error: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.red, marginTop: 8, textAlign: 'center' },
  close: { position: 'absolute', top: 14, right: -6, width: 50, height: 50, zIndex: 4 },
});
