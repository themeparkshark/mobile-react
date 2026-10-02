/**
 * Try before you buy, and buy without leaving: the item on the player's own
 * shark (the Playercard overlay) on a lit stage, already wearing the set
 * pieces they own, with "Try the full look" one tap away. The purchase
 * happens here: the button asks once ("Buy for 750?"), shows the coin math,
 * then the coins tick down, the piece pops on the shark and the button
 * becomes "Wear it now". Preview only until then: a TRY-ON stamp sits on the
 * stage and nothing is saved to the look.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, SlideInDown, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import purchase from '../../api/endpoints/me/inventory/purchase-item';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  completesSet, formatCoins, pieceState, setProgressText, shortfall as shortBy, wearingIds,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, slotForItem, wearableBadge } from '../../helpers/wardrobe';
import { InventoryType } from '../../models/inventory-type';
import { ShopItem, ShopSetPiece, ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameButton, GameIcon, SHADOW } from '../../ui';
import { Burst, MAX_FONT, PieceChip, Sheen } from './shopUi';
import { TileArt } from './ShopTile';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.88, 760);
const STAGE_H = Math.round(Math.min(310, SHEET_H * 0.42));

type Phase = 'idle' | 'confirm' | 'buying' | 'bought' | 'failed';

type Wearable = { id: number; name: string; icon_url: string | null; paper_url: string | null; no_eye_url?: string | null;
  item_type: { id: number; name?: string } };

const asWearable = (piece: ShopSetPiece): Wearable => ({ id: piece.id, name: piece.name, icon_url: piece.icon_url,
  paper_url: piece.paper_url, no_eye_url: piece.no_eye_url, item_type: { id: piece.item_type_id } });

/** The player's look with these items put on (pins, backdrops and skins included). */
export function previewLook(base: InventoryType | undefined, items: Wearable[]): InventoryType | null {
  if (!base?.skin_item?.no_eye_url) return null;
  const look: Record<string, unknown> = { ...base };
  for (const item of items) {
    const slot = slotForItem(item as never);
    if (!slot) continue;
    look[slot] = { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type };
  }
  return look as unknown as InventoryType;
}

export default function TryOnSheet({ item, set, todayIds, wished, still, startFullLook = false, onClose, onWish, onPurchased, onSetComplete }: {
  readonly item: ShopItem | null;
  readonly set: ShopSetSummary | null;
  readonly todayIds: number[];
  readonly wished: boolean;
  readonly still: boolean;
  readonly startFullLook?: boolean;
  readonly onClose: () => void;
  readonly onWish: (item: ShopItem) => void;
  readonly onPurchased: (item: ShopItem, reward: ShopSetReward | null) => void;
  readonly onSetComplete: (reward: ShopSetReward) => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const [fullLook, setFullLook] = useState(startFullLook);
  const [extras, setExtras] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shownBalance, setShownBalance] = useState<number | null>(null);
  const [burst, setBurst] = useState(0);
  const [wearing, setWearing] = useState(false);
  const reward = useRef<ShopSetReward | null>(null);

  useEffect(() => { setExtras([]); setPhase('idle'); setShownBalance(null); setFullLook(startFullLook); reward.current = null; }, [item?.id, startFullLook]);

  const pieces = set?.pieces ?? [];
  const balance = Number(player?.coins ?? 0);
  const ids = useMemo(() => (item ? wearingIds(item.id, pieces, fullLook, extras) : []), [item?.id, pieces, fullLook, extras]);
  const look = useMemo(() => {
    if (!item) return null;
    const byId = new Map<number, Wearable>(pieces.map(p => [p.id, asWearable(p)]));
    byId.set(item.id, { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: (item as { no_eye_url?: string }).no_eye_url, item_type: item.item_type });
    return previewLook(player?.inventory, ids.map(id => byId.get(id)).filter((w): w is Wearable => !!w));
  }, [player?.inventory, ids.join(','), item?.id]);

  // Stage reactions: a wiggle when a piece goes on, a squash and stretch when the buy lands.
  const stageScale = useSharedValue(1);
  const stageSquash = useSharedValue(1);
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: stageScale.value }, { scaleY: stageSquash.value }] }));
  const wiggle = () => { if (!still) stageScale.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, { damping: 7 })); };

  // Pan down to dismiss (the grabber is a promise).
  const drag = useSharedValue(0);
  const pan = Gesture.Pan().activeOffsetY(8)
    .onUpdate(e => { drag.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(onClose)();
      else drag.value = withSpring(0, { damping: 18 });
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));

  // Coins tick down from the old balance to the new one.
  const tickTo = useCallback((from: number, to: number) => {
    if (still) { setShownBalance(to); return; }
    const start = Date.now();
    const timer = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / 700);
      setShownBalance(Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))));
      if (t >= 1) clearInterval(timer);
    }, 30);
  }, [still]);

  if (!item) return null;
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased) || phase === 'bought';
  const vipLocked = !!item.is_member_item && !player?.is_subscribed;
  const name = itemDisplayName(item);
  const short = shortBy(balance, item.cost);
  const finishes = !!set && completesSet(item.id, pieces);
  const worn = isItemWorn(player?.inventory, item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;

  const togglePiece = (piece: ShopSetPiece) => {
    if (piece.owned || piece.id === item.id) return;
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    wiggle();
    setExtras(list => (list.includes(piece.id) ? list.filter(id => id !== piece.id) : [...list, piece.id]));
  };

  const toggleFull = () => {
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    wiggle();
    setFullLook(v => !v);
  };

  const askToBuy = () => {
    playSound(require('../../../assets/sounds/purchase_item_prompt.mp3'));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setPhase('confirm');
  };

  const buy = async () => {
    if (phase === 'buying') return;
    setPhase('buying');
    try {
      const result = await purchase(item);
      reward.current = result?.set_reward ?? null;
      setPhase('bought');
      tickTo(balance, balance - item.cost);
      setBurst(b => b + 1);
      if (!still) stageSquash.value = withSequence(withTiming(0.9, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 240 }));
      playSound(require('../../../assets/sounds/purchase_item_success.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onPurchased(item, reward.current);
      void refreshPlayer();
      if (reward.current) {
        const done = reward.current;
        setTimeout(() => onSetComplete(done), still ? 300 : 1100);
      }
    } catch (error: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      const data = (error as { response?: { data?: { code?: string } } })?.response?.data;
      if (data?.code === 'not_enough_currency') { void refreshPlayer(); setPhase('idle'); return; }
      setPhase('failed');
    }
  };

  const wearNow = async () => {
    if (worn) { onClose(); return; }
    setWearing(true);
    try {
      await updateInventory(item);
      await refreshPlayer();
      playSound(require('../../../assets/sounds/whoosh.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onClose();
    } catch {
      setWearing(false);
      setPhase('failed');
    }
  };

  const earn = () => { onClose(); RootNavigation.navigate('Explore'); };

  const actions = (() => {
    if (phase === 'bought' || (owned && phase !== 'failed')) {
      return (
        <View style={styles.row}>
          <View style={{ flex: 1.4 }}>
            <GameButton label={worn ? 'Wearing it' : 'Wear it now'} icon="shark" onPress={wearNow} loading={wearing} disabled={worn} />
          </View>
          <View style={{ flex: 1 }}><GameButton label="Keep shopping" variant="ghost" onPress={onClose} /></View>
        </View>
      );
    }
    if (vipLocked) {
      return <GameButton label="VIP only: see VIP" icon="member" variant="secondary"
        onPress={() => { onClose(); RootNavigation.navigate('Membership'); }} />;
    }
    if (phase === 'failed') {
      return (
        <>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.failed}>That didn’t go through. You weren’t charged.</Text>
          <GameButton label="Try again" onPress={() => void buy()} />
        </>
      );
    }
    if (short > 0) {
      return (
        <>
          <GameButton label={`Need ${formatCoins(short)} more coins`} icon="coins" variant="secondary" onPress={earn}
            accessibilityHint="Opens the map where you earn Shark Coins" />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.earnHint}>Catch ride coins or open your daily chest to earn more.</Text>
        </>
      );
    }
    if (phase === 'confirm' || phase === 'buying') {
      return (
        <>
          <View style={styles.equation} accessible
            accessibilityLabel={`You have ${formatCoins(balance)} Shark Coins. This costs ${formatCoins(item.cost)}. You will have ${formatCoins(balance - item.cost)} left.`}>
            <CoinAmount n={balance} />
            <Text style={styles.op}>−</Text>
            <CoinAmount n={item.cost} />
            <Text style={styles.op}>=</Text>
            <CoinAmount n={balance - item.cost} label="left" />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1.4 }}><GameButton label="Yes, buy it!" onPress={() => void buy()} loading={phase === 'buying'} /></View>
            <View style={{ flex: 1 }}><GameButton label="Not now" variant="ghost" onPress={() => setPhase('idle')} /></View>
          </View>
        </>
      );
    }
    return (
      <View style={styles.row}>
        <Pressable onPress={() => onWish(item)} style={[styles.wish, wished && styles.wishOn]} accessibilityRole="button"
          accessibilityState={{ selected: wished }} accessibilityLabel={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
          <GameIcon name="heart" size={22} mono={wished ? BRAND.white : '#ff7aa6'} />
        </Pressable>
        <View style={{ flex: 1, overflow: 'hidden', borderRadius: 18 }}>
          <GameButton label={finishes ? 'Buy and complete the look' : `Buy for ${formatCoins(item.cost)}`} icon="coins" onPress={askToBuy} />
          {finishes && <Sheen still={still} delay={500} width={360} />}
        </View>
      </View>
    );
  })();

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(still ? 120 : 160)} style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close try-on" />
          <Animated.View entering={still ? FadeIn.duration(120) : SlideInDown.springify().damping(18).stiffness(180)}
            style={[styles.sheet, { height: SHEET_H, paddingBottom: Math.max(16, insets.bottom + 8) }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabber} />
                <View style={styles.topRow}>
                  <View style={styles.balance} accessible accessibilityLabel={`${formatCoins(shownBalance ?? balance)} Shark Coins`}>
                    <GameIcon name="coins" size={20} />
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.balanceText}>{formatCoins(shownBalance ?? balance)}</Text>
                  </View>
                  <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                    <GameIcon name="close" size={30} />
                  </Pressable>
                </View>
                <Animated.View style={[styles.stage, { height: STAGE_H }, stageStyle]}>
                  <LinearGradient colors={['#bfe5ff', '#7cc6f5']} style={StyleSheet.absoluteFill} />
                  <View pointerEvents="none" style={[styles.spot, { backgroundColor: glow }]} />
                  <View pointerEvents="none" style={styles.floor} />
                  {look ? (
                    <Playercard inventory={look} popLayers still={still}
                      style={{ position: 'absolute', width: '100%', height: STAGE_H - 12 }} />
                  ) : (
                    <View style={styles.flatArt}><TileArt item={item} size={170} torso={false} /></View>
                  )}
                  <Burst color={glow} still={still} trigger={burst} size={220} count={18} />
                  {phase !== 'bought' && !owned && (
                    <View style={styles.stamp} pointerEvents="none"><Text style={styles.stampText}>TRY-ON</Text></View>
                  )}
                </Animated.View>
              </View>
            </GestureDetector>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <View style={styles.titleRow}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title} numberOfLines={2}>{name}</Text>
                {badge.label && <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.rarityText}>{badge.label}</Text></View>}
              </View>
              {item.shop?.last_chance && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.leaving}>Last chance! It comes back next season.</Text>}
              {item.shop?.returning && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.back}>Back again by popular demand.</Text>}

              {set && pieces.length > 1 && (
                <View style={[styles.setCard, { borderColor: set.color ?? BRAND.gold }]}>
                  <View style={styles.setHead}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName} numberOfLines={1}>{set.name}</Text>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setCount}>{setProgressText(set)}</Text>
                  </View>
                  <View style={styles.chips}>
                    {set.title && <View style={styles.titleChip}><GameIcon name="crown" size={16} />
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
                    {set.xp_reward > 0 && <View style={styles.xpChip}><GameIcon name="xp" size={16} />
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpChipText}>+{set.xp_reward} XP</Text></View>}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pieces}>
                    {pieces.map(piece => (
                      <PieceChip key={piece.id} piece={piece.id === item.id ? { ...piece, owned: owned } : piece}
                        state={piece.id === item.id ? (owned ? 'owned' : 'in_shop') : pieceState(piece, todayIds)}
                        selected={ids.includes(piece.id)} onPress={togglePiece} />
                    ))}
                  </ScrollView>
                  {set.reward_state !== 'claimed' && pieces.some(p => !p.owned && p.id !== item.id) && (
                    <Pressable onPress={toggleFull} style={[styles.fullToggle, fullLook && styles.fullToggleOn]} accessibilityRole="switch"
                      accessibilityState={{ checked: fullLook }} accessibilityLabel="Try the full look">
                      <View style={[styles.knob, fullLook && styles.knobOn]} />
                      <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.fullText, fullLook && { color: BRAND.navy }]}>Try the full look</Text>
                    </Pressable>
                  )}
                </View>
              )}
              {!owned && phase === 'idle' && (
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.wishHint}>
                  {wished ? 'Saved! We will tell you when it is back.' : 'Heart it to save it for later. We will tell you when it is back.'}
                </Text>
              )}
            </ScrollView>

            <View style={styles.actions}>{actions}</View>
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function CoinAmount({ n, label }: { n: number; label?: string }) {
  return (
    <View style={styles.amount}>
      <GameIcon name="coins" size={18} />
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.amountText}>{formatCoins(n)}</Text>
      {label && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.amountLabel}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: BRAND.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#d9cfae', marginTop: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.white, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 2, borderColor: '#efe3bd' },
  balanceText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy },
  stage: { marginHorizontal: 14, marginTop: 8, borderRadius: 22, overflow: 'hidden', borderWidth: 3, borderColor: BRAND.white },
  spot: { position: 'absolute', alignSelf: 'center', top: -60, width: 300, height: 260, borderRadius: 150, opacity: 0.28 },
  floor: { position: 'absolute', alignSelf: 'center', bottom: 16, width: 180, height: 26, borderRadius: 90, backgroundColor: 'rgba(5,52,110,0.18)' },
  flatArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stamp: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: '-6deg' }] },
  stampText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, letterSpacing: 1 },
  body: { paddingHorizontal: 18, paddingTop: 10, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  rarity: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  leaving: { fontFamily: FONT.display, fontSize: 16, color: BRAND.red },
  back: { fontFamily: FONT.display, fontSize: 16, color: '#7c4dff' },
  setCard: { backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 3, padding: 12, gap: 8 },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setName: { flexShrink: 1, fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  setCount: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navySoft },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  titleChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLight },
  xpChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  xpChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.blue },
  pieces: { gap: 10, paddingVertical: 6, paddingRight: 8 },
  fullToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999,
    backgroundColor: BRAND.blue, paddingLeft: 4, paddingRight: 14, paddingVertical: 4 },
  fullToggleOn: { backgroundColor: BRAND.gold },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.55)' },
  knobOn: { backgroundColor: BRAND.white },
  fullText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  wishHint: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  actions: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wish: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ff9bbf' },
  wishOn: { borderColor: BRAND.white, backgroundColor: '#ff4f8b' },
  equation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: BRAND.white,
    borderRadius: 14, paddingVertical: 8, borderWidth: 2, borderColor: '#efe3bd' },
  op: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navySoft },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amountText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  amountLabel: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft },
  failed: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: BRAND.red },
  earnHint: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
});
