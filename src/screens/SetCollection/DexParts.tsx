/**
 * Collection book pieces: springy press, progress ring, set tabs, item tiles,
 * the reward banner, a star burst and the big item card. Logic lives in
 * dexModel.ts; these only draw it. All motion runs on the UI thread
 * (Reanimated) and only while something is on screen.
 */
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Modal, PixelRatio, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { RARITY_TONES } from '../../constants/coinTiers';
import { parkDayCaptureSize } from '../../components/parkDayShareMetrics';
import { playSfx } from '../../gamekit/SFX';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND, GameButton, GameIcon, gameAlert, RADIUS, SHADOW } from '../../ui';
import { Offscreen, RidePhoto, RidePhotoShareCard } from './RidePhoto';
import {
  caughtLine, exchangeLine, progressFraction, setStatusLine, tileCaption,
  type DexItem, type DexReward, type DexSet,
} from './dexModel';

const GIFT = require('../../../assets/images/screens/player/gift.png');

/** Bundled badge art for the legacy sets that never had a server badge. */
const LEGACY_BADGES: Readonly<Record<string, string>> = {
  churro_collection: 'churro_01', pretzel_collection: 'pretzel_01', night_lights: 'flashlight_40',
  rain_parade: 'umbrella_40', camera_crew: 'camera_40',
};

export function setBadge(set: Pick<DexSet, 'slug' | 'badgeUrl'>): ImageSource {
  if (set.badgeUrl) return { uri: set.badgeUrl };
  const local = LEGACY_BADGES[set.slug] ? prepItemImage(LEGACY_BADGES[set.slug]) : null;
  return local ?? GIFT;
}

export function itemArt(item: Pick<DexItem, 'variantSlug' | 'iconUrl'>): ImageSource {
  return (item.variantSlug ? prepItemImage(item.variantSlug) : null)
    ?? (item.iconUrl ? { uri: item.iconUrl } : null)
    ?? GIFT;
}

export const rarityColor = (rarity: number): string =>
  (RARITY_TONES[rarity as 1 | 2 | 3 | 4 | 5] ?? RARITY_TONES[1]).color;

/** The silhouette ink for missing items. */
export const SILHOUETTE = '#1b3a5c';

/** Squishes on press, springs back on release. */
export function SpringPress({ onPress, children, style, disabled, accessibilityLabel, accessibilityState, scaleTo = 0.92 }: {
  readonly onPress?: () => void;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityState?: { selected?: boolean; disabled?: boolean };
  readonly scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState}
      disabled={disabled} onPress={onPress}
      onPressIn={() => { scale.value = withSpring(scaleTo, { damping: 15, stiffness: 420 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 8, stiffness: 260 }); }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A ring that fills with the set's color. Gold when the set is done. */
export function ProgressRing({ progress, size, stroke, color, track = 'rgba(255,255,255,0.35)', children }: {
  readonly progress: number; readonly size: number; readonly stroke: number; readonly color: string;
  readonly track?: string; readonly children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        {clamped > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
        )}
      </Svg>
      {children}
    </View>
  );
}

/** One colored set card in the picker: badge inside a progress ring, name, count. */
export const SetTab = memo(function SetTab({ set, selected, onPress }: {
  readonly set: DexSet; readonly selected: boolean; readonly onPress: () => void;
}) {
  const done = set.isComplete;
  const claim = set.reward.status === 'claimable' || set.steps.some(step => step.status === 'claimable');
  const dim = set.status === 'retired' || set.status === 'upcoming';
  return (
    <SpringPress onPress={onPress} accessibilityLabel={`${set.name}, ${set.found} of ${set.total}`}
      accessibilityState={{ selected }} style={[styles.tab, { opacity: dim && !selected ? 0.75 : 1 }]}>
      <LinearGradient colors={[set.color, shade(set.color)]} style={[styles.tabFace, selected && styles.tabSelected]}>
        <ProgressRing progress={progressFraction(set)} size={74} stroke={7} color={done ? BRAND.gold : BRAND.white}>
          <View style={styles.tabBadgeWell}>
            <Image source={setBadge(set)} style={styles.tabBadge} contentFit="contain" />
          </View>
        </ProgressRing>
        <Text numberOfLines={1} style={styles.tabName}>{set.name}</Text>
        <Text style={styles.tabCount}>{set.found}/{set.total}</Text>
        {claim && <View style={styles.tabDot}><GameIcon name="gift" size={20} /></View>}
        {done && !claim && <View style={styles.tabDot}><GameIcon name="star" size={20} /></View>}
        {set.status === 'upcoming' && <View style={styles.tabSoon}><Text style={styles.tabSoonText}>Soon</Text></View>}
      </LinearGradient>
    </SpringPress>
  );
});

/** A grid tile: full color when found (with a caught count), a dark silhouette with a rarity ring when missing. */
export const ItemTile = memo(function ItemTile({ item, size, color, onPress, index }: {
  readonly item: DexItem; readonly size: number; readonly color: string; readonly onPress: (item: DexItem) => void;
  readonly index: number;
}) {
  const tone = rarityColor(item.rarity);
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = withDelay(Math.min(index, 12) * 28, withSpring(1, { damping: 12, stiffness: 180 }));
  }, [appear, index]);
  const pop = useAnimatedStyle(() => ({ opacity: appear.value, transform: [{ scale: 0.6 + 0.4 * appear.value }] }));
  return (
    <Animated.View style={pop}>
      <SpringPress onPress={() => onPress(item)} accessibilityLabel={item.found
        ? `${item.name}, ${item.rarityLabel}, caught ${item.caught}` : `Missing ${item.rarityLabel} find`}
        style={[styles.tile, { width: size, height: size + 22 },
          item.found ? { backgroundColor: BRAND.white, borderColor: tone } : { backgroundColor: '#dfeaf5', borderColor: '#c6d8ea' }]}>
        {item.found && <View style={[styles.tileGlow, { backgroundColor: color }]} />}
        <Image source={itemArt(item)} contentFit="contain" recyclingKey={String(item.id)}
          tintColor={item.found ? undefined : SILHOUETTE}
          style={{ width: size * 0.72, height: size * 0.72, opacity: item.found ? 1 : 0.82 }} />
        <View style={[styles.tileFoot, { backgroundColor: item.found ? tone : 'transparent' }]}>
          <Text numberOfLines={1} style={[styles.tileCaption, !item.found && { color: tone }]}>{tileCaption(item)}</Text>
        </View>
        {item.isNew && <View style={styles.tileNew}><GameIcon name="new" size={34} /></View>}
        {!item.found && item.rarity >= 4 && <View style={styles.tileStar}><GameIcon name="star" size={18} /></View>}
      </SpringPress>
    </Animated.View>
  );
});

/** "Finish the set: get X" with its progress bar and the claim state. */
export function RewardBanner({ set, reward, busy, onClaim, titleWorn, titleBusy, onTitle, popKey }: {
  readonly set: DexSet; readonly reward: DexReward; readonly busy: boolean; readonly onClaim: () => void;
  readonly titleWorn: boolean; readonly titleBusy: boolean; readonly onTitle: (() => void) | null; readonly popKey: number;
}) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (popKey === 0) return;
    pop.value = withSequence(withTiming(1.08, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 220 }));
  }, [popKey, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const fill = useSharedValue(0);
  const fraction = progressFraction(set);
  useEffect(() => { fill.value = withTiming(fraction, { duration: 650, easing: Easing.out(Easing.cubic) }); }, [fraction, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 1000) / 10}%` }));
  const claimed = reward.status === 'claimed';
  return (
    <Animated.View style={[styles.reward, claimed && styles.rewardDone, popStyle]}>
      <View style={styles.rewardRow}>
        <View style={styles.rewardIcon}><GameIcon name={claimed ? 'check' : 'trophy'} size={40} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rewardKicker}>{claimed ? 'Set finished!' : reward.status === 'claimable' ? 'You did it!' : `${set.found} of ${set.total} found`}</Text>
          <Text style={styles.rewardLine}>{reward.label}</Text>
        </View>
      </View>
      {!claimed && (
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { backgroundColor: set.color }, fillStyle]} />
        </View>
      )}
      {reward.status === 'claimable' && (
        <GameButton label={busy ? 'Claiming...' : reward.needsPick ? 'Pick and claim' : 'Claim reward'} icon="gift"
          loading={busy} onPress={onClaim} style={{ marginTop: 10 }} />
      )}
      {reward.status === 'pending' && <Text style={styles.rewardNote}>Your shark item is on the way.</Text>}
      {claimed && onTitle && (
        <GameButton label={titleBusy ? 'Saving...' : titleWorn ? 'Take off title' : `Wear title: ${reward.title}`}
          variant="secondary" size="compact" loading={titleBusy} onPress={onTitle} style={{ marginTop: 8 }} />
      )}
    </Animated.View>
  );
}

/** A small burst of stars. Mount with a new key to fire; it cleans itself up visually. */
export function StarBurst({ color = BRAND.gold, size = 160 }: { readonly color?: string; readonly size?: number }) {
  const parts = useMemo(() => Array.from({ length: 8 }, (_, index) => (index / 8) * Math.PI * 2), []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {parts.map((angle, index) => <Spark key={index} angle={angle} distance={size / 2} color={color} delay={index * 12} />)}
    </View>
  );
}

function Spark({ angle, distance, color, delay }: { angle: number; distance: number; color: string; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) })); }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value },
      { scale: 0.4 + t.value * 0.8 },
    ],
  }));
  return <Animated.View style={[styles.spark, { backgroundColor: color }, style]} />;
}

/** The big item card: art, name, rarity, flavor, caught count and where or when it spawns. */
export function ItemCard({ item, set, spares, onClose, onExchange, exchanging, onShare, error, sharkName }: {
  readonly item: DexItem | null; readonly set: DexSet | null; readonly spares: number;
  readonly onClose: () => void; readonly onExchange: (() => void) | null; readonly exchanging: boolean;
  readonly onShare: (() => void) | null; readonly error: string | null; readonly sharkName?: string | null;
}) {
  const { width } = useWindowDimensions();
  const shareRef = useRef<View>(null);
  const [shareReady, setShareReady] = useState(false);
  const [sharing, setSharing] = useState(false);
  const photo = item?.found && item.photoGrade ? item.photoGrade : null;
  useEffect(() => { setShareReady(false); }, [item?.id]);
  const sharePhoto = async () => {
    if (sharing || !shareRef.current || !shareReady) return;
    setSharing(true);
    playSfx('ui.tap', 0.6);
    try {
      if (!await Sharing.isAvailableAsync()) {
        gameAlert('Sharing unavailable', 'This device cannot open a share sheet right now.');
        return;
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, ...parkDayCaptureSize(Platform.OS, PixelRatio.get()) });
      await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your Ride Photo' });
    } catch {
      gameAlert('Card not made', 'Your Ride Photo is saved. Try sharing again.', undefined, { icon: 'retry' });
    } finally {
      setSharing(false);
    }
  };
  const scale = useSharedValue(0.6);
  useEffect(() => {
    if (!item) return;
    scale.value = 0.6;
    scale.value = withSpring(1, { damping: 11, stiffness: 200 });
  }, [item?.id, scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: Math.min(1, scale.value * 1.6 - 0.6) }));
  const tone = item ? rarityColor(item.rarity) : BRAND.sky;
  const color = set?.color ?? BRAND.blue;
  return (
    <Modal visible={item != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.modalOverlay}>
        {item && (
          <Animated.View style={[styles.itemCard, cardStyle]}>
            <Pressable onPress={() => undefined} style={{ alignItems: 'center' }}>
              <LinearGradient colors={item.found ? [color, shade(color)] : ['#3b5675', '#1b3a5c']}
                style={[styles.itemHero, photo && styles.itemHeroPhoto]}>
                <View style={styles.itemHalo} />
                <View style={styles.heroGloss} pointerEvents="none" />
                {photo ? (
                  <RidePhoto grade={photo} art={itemArt(item)} photoUrl={item.photoUrl} width={Math.min(320, width - 96)} />
                ) : (
                  <Image source={itemArt(item)} contentFit="contain" tintColor={item.found ? undefined : '#0d2440'}
                    style={styles.itemArt} />
                )}
                {item.found && item.isNew && <StarBurst key={item.id} />}
                <View style={[styles.rarityPill, photo && styles.rarityPillPhoto, { backgroundColor: tone }]}>
                  {item.rarity >= 4 && <GameIcon name="star" size={18} />}
                  <Text style={styles.rarityText}>{item.rarityLabel}</Text>
                </View>
              </LinearGradient>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={[styles.itemCaught, { color: item.found ? BRAND.greenLip : BRAND.navySoft }]}>{caughtLine(item)}</Text>
              {!!item.flavor && <Text style={styles.itemFlavor}>{item.flavor}</Text>}
              <View style={styles.whereRow}>
                <GameIcon name={item.spawningNow === false ? 'timer' : 'map'} size={26} />
                <Text style={styles.whereText}>{item.spawnHint}</Text>
              </View>
              {!item.found && onExchange && (
                <GameButton label={exchanging ? 'Swapping...' : exchangeLine(item, spares)} icon="retry"
                  disabled={!item.canExchange} loading={exchanging} onPress={onExchange} fullWidth style={{ marginTop: 10 }} />
              )}
              {photo && (
                <GameButton label={sharing ? 'Making your card...' : 'Share my Ride Photo'} icon="camera"
                  loading={sharing} disabled={!shareReady} onPress={() => { void sharePhoto(); }} fullWidth style={{ marginTop: 10 }} />
              )}
              {item.found && onShare && item.spares > 0 && (
                <GameButton label="Share a spare with a friend" icon="heart" variant="secondary" onPress={onShare}
                  fullWidth style={{ marginTop: 10 }} />
              )}
              {!!error && <Text style={styles.itemError}>{error}</Text>}
              <GameButton label="Close" variant="ghost" onPress={onClose} fullWidth style={{ marginTop: 4 }} />
            </Pressable>
            {photo && (
              <Offscreen>
                <RidePhotoShareCard ref={shareRef} grade={photo} art={itemArt(item)} photoUrl={item.photoUrl}
                  itemName={item.name} setName={set?.name ?? ''} sharkName={sharkName} onReadyChange={setShareReady} />
              </Offscreen>
            )}
          </Animated.View>
        )}
      </Pressable>
    </Modal>
  );
}

/** Small chips under the set header: live status, spares, the hunt focus toggle. */
export function SetChips({ set, onFocus, focusBusy, onOdds }: {
  readonly set: DexSet; readonly onFocus: (() => void) | null; readonly focusBusy: boolean; readonly onOdds: () => void;
}) {
  const status = setStatusLine(set);
  return (
    <View style={styles.chips}>
      {!!status && (
        <View style={styles.chip}>
          <GameIcon name={set.spawningNow === false ? 'timer' : 'map'} size={20} />
          <Text numberOfLines={1} style={styles.chipText}>{status}</Text>
        </View>
      )}
      <View style={styles.chip}>
        <GameIcon name="gift" size={20} />
        <Text style={styles.chipText}>{set.spares === 1 ? '1 spare' : `${set.spares} spares`}</Text>
      </View>
      {onFocus && (
        <SpringPress onPress={onFocus} disabled={focusBusy} accessibilityLabel={set.focused ? 'Stop hunting this set first' : 'Hunt this set first'}
          style={[styles.chip, set.focused && styles.chipOn]}>
          <GameIcon name={set.focused ? 'check' : 'search'} size={20} />
          <Text style={[styles.chipText, set.focused && { color: BRAND.white }]}>{focusBusy ? 'Saving...' : set.focused ? 'Hunting this set' : 'Hunt this set'}</Text>
        </SpringPress>
      )}
      <SpringPress onPress={onOdds} accessibilityLabel="Drop odds" style={styles.chip}>
        <GameIcon name="info" size={20} />
        <Text style={styles.chipText}>Odds</Text>
      </SpringPress>
    </View>
  );
}

/** A slim step row: "Find 8: get 2 Tickets" with a claim button when ready. */
export function StepRow({ step, busy, onClaim }: { readonly step: DexReward; readonly busy: boolean; readonly onClaim: () => void }) {
  const ready = step.status === 'claimable';
  return (
    <View style={[styles.step, ready && styles.stepReady]}>
      <GameIcon name={ready ? 'gift' : 'lock'} size={28} />
      <Text style={styles.stepText} numberOfLines={2}>{step.label}</Text>
      {ready && <GameButton label={busy ? '...' : step.needsPick ? 'Pick' : 'Claim'} size="compact" loading={busy} onPress={onClaim} />}
    </View>
  );
}

/** Darker shade of a #RRGGBB color for gradients. */
export function shade(hex: string, amount = 0.28): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount)));
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  tab: { marginRight: 10 },
  tabFace: {
    width: 116, height: 150, borderRadius: 22, alignItems: 'center', paddingTop: 10, borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.65)', ...SHADOW.card, shadowOpacity: 0.18,
  },
  tabSelected: { borderColor: BRAND.white, borderWidth: 4, transform: [{ translateY: -2 }] },
  tabBadgeWell: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  tabBadge: { width: 44, height: 44 },
  tabName: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, marginTop: 6, paddingHorizontal: 6, textAlign: 'center' },
  tabCount: { fontFamily: 'Knockout', fontSize: 15, color: 'rgba(255,255,255,0.92)' },
  tabDot: {
    position: 'absolute', top: -6, right: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.gold,
  },
  tabSoon: { position: 'absolute', top: 6, left: 6, backgroundColor: BRAND.navy, borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 1 },
  tabSoonText: { fontFamily: 'Shark', fontSize: 11, color: BRAND.white },
  tile: {
    borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: 4,
  },
  tileGlow: { position: 'absolute', top: 8, width: '78%', aspectRatio: 1, borderRadius: 999, opacity: 0.16 },
  tileFoot: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, alignItems: 'center', justifyContent: 'center' },
  tileCaption: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  tileNew: { position: 'absolute', top: 0, left: 2 },
  tileStar: { position: 'absolute', top: 4, right: 4 },
  reward: {
    marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: RADIUS.lg, backgroundColor: BRAND.cream,
    borderWidth: 3, borderColor: BRAND.gold, ...SHADOW.card, shadowOpacity: 0.14,
  },
  rewardDone: { borderColor: BRAND.green, backgroundColor: '#eefbf1' },
  rewardRow: { flexDirection: 'row', alignItems: 'center' },
  rewardIcon: { width: 50, alignItems: 'center', marginRight: 8 },
  rewardKicker: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft, textTransform: 'uppercase' },
  rewardLine: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: BRAND.navy },
  rewardNote: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.blue, marginTop: 8 },
  barTrack: { height: 12, borderRadius: 6, backgroundColor: '#e3eef8', overflow: 'hidden', marginTop: 10 },
  barFill: { height: '100%', borderRadius: 6 },
  spark: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  itemCard: {
    width: '100%', maxWidth: 380, borderRadius: 28, backgroundColor: BRAND.white, borderWidth: 4, borderColor: BRAND.white,
    paddingBottom: 14, paddingHorizontal: 14, overflow: 'hidden', ...SHADOW.card,
  },
  itemHero: {
    alignSelf: 'stretch', marginHorizontal: -14, height: 250, alignItems: 'center', justifyContent: 'center',
  },
  itemHeroPhoto: { height: 300 },
  heroGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '42%', backgroundColor: 'rgba(255,255,255,0.12)' },
  rarityPillPhoto: { top: 12, bottom: undefined },
  itemHalo: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.22)' },
  itemArt: { width: 190, height: 190 },
  rarityPill: {
    position: 'absolute', bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14,
    paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 3, borderColor: BRAND.white,
  },
  rarityText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textTransform: 'uppercase' },
  itemName: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy, textAlign: 'center', marginTop: 12 },
  itemCaught: { fontFamily: 'Knockout', fontSize: 18, marginTop: 2 },
  itemFlavor: { fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navy, textAlign: 'center', marginTop: 8 },
  whereRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 12, padding: 10,
    borderRadius: RADIUS.md, backgroundColor: '#eef7ff',
  },
  whereText: { flex: 1, fontFamily: 'Knockout', fontSize: 17, lineHeight: 21, color: BRAND.navy },
  itemError: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.redLip, marginTop: 8, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginTop: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#cfe8fb', maxWidth: '100%',
  },
  chipOn: { backgroundColor: BRAND.blue, borderColor: BRAND.blue },
  chipText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, flexShrink: 1 },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12,
    paddingVertical: 8, borderRadius: RADIUS.md, backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#cfe8fb',
  },
  stepReady: { borderColor: BRAND.gold, backgroundColor: '#fff6d6' },
  stepText: { flex: 1, fontFamily: 'Knockout', fontSize: 16, lineHeight: 20, color: BRAND.navy },
});
