/**
 * Try before you buy, and buy without leaving.
 *
 * The item is shown on the player's own shark (the Playercard overlay) on the
 * shop stage, already wearing the set pieces they own, with "Try the full
 * look" one tap away. A tried backdrop becomes the stage, and pins sit on the
 * chest.
 *
 * The buy: the button asks once ("Yes, buy it!") with the coin math on the
 * stage. Coins arc from the balance into the stage, the number ticks down on
 * the UI thread, and the piece drops onto the shark with a rarity flash. A
 * NEW! ribbon replaces TRY-ON. "Wear it now" spins the shark, shows "Now
 * wearing" and closes. A wear failure has its own message and retry and never
 * offers to buy again.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, SlideInDown, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import purchase from '../../api/endpoints/me/inventory/purchase-item';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  completesSet, formatCoins, lastChanceLine, pieceState, setProgressText, shortfall as shortBy, wearingIds, wishHintCopy,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, slotForItem, wearableBadge } from '../../helpers/wardrobe';
import { InventoryType } from '../../models/inventory-type';
import { ShopItem, ShopSetPiece, ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameButton, GameIcon, SHADOW } from '../../ui';
import { showToast } from '../../utils/toast';
import { CoinArc, LandFlash, MAX_FONT, PieceChip, Sheen, ShopStage, WishHeart } from './shopUi';
import { TileArt } from './ShopTile';
import { useWished, wishStore } from './wishStore';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.88, 760);
const STAGE_H = Math.round(Math.min(310, SHEET_H * 0.42));
const STAGE_TOP = 52;
const PLAYERCARD_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: '6%' as const };

type Phase = 'idle' | 'confirm' | 'buying' | 'bought' | 'failed';
type WearState = 'idle' | 'busy' | 'spinning' | 'failed';

export type Wearable = { id: number; name: string; icon_url: string | null; paper_url: string | null; no_eye_url?: string | null;
  item_type: { id: number; name?: string } };

export const asWearable = (piece: ShopSetPiece): Wearable => ({ id: piece.id, name: piece.name, icon_url: piece.icon_url,
  paper_url: piece.paper_url, no_eye_url: piece.no_eye_url, item_type: { id: piece.item_type_id } });

/**
 * A look for the stage. 'player' starts from the player's outfit; 'base' starts
 * from their shark skin only (the hero and the set reveal show exactly the
 * pieces asked for). Returns the backdrop piece separately: the stage draws it.
 */
export function previewLook(base: InventoryType | undefined, items: Wearable[], from: 'player' | 'base' = 'player'):
  { look: InventoryType; backdrop: string | null } | null {
  if (!base?.skin_item?.no_eye_url) return null;
  const look: Record<string, unknown> = from === 'player' ? { ...base } : { skin_item: base.skin_item, id: base.id };
  let backdrop: string | null = null;
  for (const item of items) {
    const slot = slotForItem(item as never);
    if (!slot) continue;
    if (slot === 'background_item') { backdrop = item.paper_url ?? item.icon_url; continue; }
    look[slot] = { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type };
  }
  return { look: look as unknown as InventoryType, backdrop };
}

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** The balance, counted on the UI thread (no React render per frame). */
function CoinTicker({ value, still }: { value: number; still: boolean }) {
  const shown = useSharedValue(value);
  useEffect(() => {
    shown.value = still ? value : withTiming(value, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [value, still]);
  const props = useAnimatedProps(() => {
    const n = Math.max(0, Math.round(shown.value));
    let s = String(n);
    let out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return { text: s + out, defaultValue: s + out } as never;
  });
  return <AnimatedInput editable={false} underlineColorAndroid="transparent" animatedProps={props}
    defaultValue={formatCoins(value)} style={styles.balanceText} />;
}

/** A real switch: the knob travels and shows a check when on. */
function LookSwitch({ on, still, onPress }: { on: boolean; still: boolean; onPress: () => void }) {
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => { x.value = still ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 120 }); }, [on, still]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * 22 }] }));
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel="Try the full look"
      style={styles.switchRow} hitSlop={8}>
      <View style={[styles.track, on && styles.trackOn]}>
        <Animated.View style={[styles.knob, knob]}>{on && <GameIcon name="check" size={20} />}</Animated.View>
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.switchText}>Try the full look</Text>
    </Pressable>
  );
}

export default function TryOnSheet({ item, set, todayIds, still, accent, startFullLook = false, startBought = false,
  onClose, onWish, onPurchased, onSetComplete }: {
  readonly item: ShopItem | null;
  readonly set: ShopSetSummary | null;
  readonly todayIds: number[];
  readonly still: boolean;
  /** The section colour (event colour for last-chance copy). */
  readonly accent?: string | null;
  readonly startFullLook?: boolean;
  /** Opened from an owned hero: skip straight to the bought state ("Wear it"). */
  readonly startBought?: boolean;
  readonly onClose: () => void;
  readonly onWish: (item: ShopItem) => void;
  readonly onPurchased: (item: ShopItem, reward: ShopSetReward | null) => void;
  readonly onSetComplete: (reward: ShopSetReward) => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const wished = useWished(item?.id ?? -1);
  const [fullLook, setFullLook] = useState(startFullLook);
  const [extras, setExtras] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>(startBought ? 'bought' : 'idle');
  const [wear, setWear] = useState<WearState>('idle');
  const [dropping, setDropping] = useState(false);
  const [landed, setLanded] = useState(0);
  const [coins, setCoins] = useState(0);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const reward = useRef<ShopSetReward | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    setExtras([]); setPhase(startBought ? 'bought' : 'idle'); setWear('idle'); setBalanceAfter(null);
    setFullLook(startFullLook); reward.current = null;
  }, [item?.id, startFullLook, startBought]);

  const pieces = set?.pieces ?? [];
  const balance = Number(player?.coins ?? 0);
  const ids = useMemo(() => (item ? wearingIds(item.id, pieces, fullLook, extras) : []), [item?.id, pieces, fullLook, extras]);
  const stage = useMemo(() => {
    if (!item) return null;
    const byId = new Map<number, Wearable>(pieces.map(p => [p.id, asWearable(p)]));
    byId.set(item.id, { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type });
    // While the bought piece is dropping in, leave it off so Playercard pops it on.
    const wearing = ids.filter(id => !(dropping && id === item.id)).map(id => byId.get(id)).filter((w): w is Wearable => !!w);
    return previewLook(player?.inventory, wearing);
  }, [player?.inventory, ids.join(','), item?.id, dropping]);

  // Stage reactions: a wiggle when a piece goes on, a spin when you wear it.
  const stageScale = useSharedValue(1);
  const spin = useSharedValue(0);
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ perspective: 600 }, { scale: stageScale.value }, { rotateY: `${spin.value}deg` }] }));
  const wiggle = () => { if (!still) stageScale.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, { damping: 7 })); };

  // Pan down to dismiss; a release past the line slides the sheet away first.
  const drag = useSharedValue(0);
  const pan = Gesture.Pan().activeOffsetY(8)
    .onUpdate(e => { drag.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 900) drag.value = withTiming(SHEET_H, { duration: 180 }, () => runOnJS(onClose)());
      else drag.value = withSpring(0, { damping: 18 });
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }));

  const togglePiece = useCallback((piece: ShopSetPiece) => {
    if (!item || piece.owned || piece.id === item.id) return;
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    wiggle();
    setExtras(list => (list.includes(piece.id) ? list.filter(id => id !== piece.id) : [...list, piece.id]));
  }, [item?.id, still]);

  if (!item) return null;
  const badge = wearableBadge(item);
  const owned = !!(item.shop?.is_owned ?? item.has_purchased) || phase === 'bought';
  const vipLocked = !!item.is_member_item && !player?.is_subscribed;
  const name = itemDisplayName(item);
  const short = shortBy(balance, item.cost);
  const finishes = !!set && completesSet(item.id, pieces);
  const worn = isItemWorn(player?.inventory, item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;

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
      setBalanceAfter(balance - item.cost);
      onPurchased(item, reward.current);
      if (still) {
        setLanded(l => l + 1);
        playSound(require('../../../assets/sounds/purchase_item_success.mp3'));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        // Coins fly from the balance into the stage, then the piece lands.
        setDropping(true);
        setCoins(c => c + 1);
        playSound(require('../../../assets/sounds/coin.mp3'));
        later(() => {
          setDropping(false);
          setLanded(l => l + 1);
          playSound(require('../../../assets/sounds/purchase_item_success.mp3'));
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        }, 560);
      }
      void refreshPlayer();
      if (reward.current) {
        const done = reward.current;
        later(() => onSetComplete(done), still ? 400 : 1500);
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
    setWear('busy');
    try {
      await updateInventory(item);
      void refreshPlayer();
      playSound(require('../../../assets/sounds/whoosh.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setWear('spinning');
      if (!still) spin.value = withTiming(360, { duration: 520, easing: Easing.out(Easing.back(1.4)) });
      later(() => { onClose(); showToast(`Now wearing ${name}!`, 'success', 2000); }, still ? 500 : 1200);
    } catch {
      setWear('failed');
    }
  };

  const earn = () => { onClose(); RootNavigation.navigate('Explore'); };

  const phaseKey = owned ? `owned-${wear}` : vipLocked ? 'vip' : phase === 'failed' ? 'failed' : short > 0 ? 'short'
    : phase === 'confirm' || phase === 'buying' ? 'confirm' : 'idle';

  const actions = (() => {
    if (owned) {
      return (
        <>
          {wear === 'failed' && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.failed}>Couldn’t put it on. Try again.</Text>}
          <View style={styles.row}>
            <View style={{ flex: 1.4 }}>
              <GameButton label={worn ? 'Wearing it' : wear === 'failed' ? 'Try again' : 'Wear it now'} icon="shark"
                onPress={() => void wearNow()} loading={wear === 'busy'} disabled={worn || wear === 'spinning'} />
            </View>
            <View style={{ flex: 1 }}><GameButton label="Keep shopping" variant="ghost" onPress={onClose} /></View>
          </View>
        </>
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
        <View style={styles.row}>
          <View style={{ flex: 1.4 }}><GameButton label="Yes, buy it!" onPress={() => void buy()} loading={phase === 'buying'} /></View>
          <View style={{ flex: 1 }}><GameButton label="Not now" variant="ghost" onPress={() => setPhase('idle')} /></View>
        </View>
      );
    }
    return (
      <View style={styles.row}>
        <Pressable onPress={() => onWish(item)} style={[styles.wish, wished && styles.wishOn]} accessibilityRole="button"
          accessibilityState={{ selected: wished }} accessibilityLabel={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
          <WishHeart on={wished} size={26} />
        </Pressable>
        <View style={{ flex: 1, overflow: 'hidden', borderRadius: 18 }}>
          <GameButton label={finishes ? `Complete the look: ${formatCoins(item.cost)}` : `Buy for ${formatCoins(item.cost)}`} icon="coins" onPress={askToBuy} />
          {finishes && <Sheen still={still} delay={500} width={360} />}
        </View>
      </View>
    );
  })();

  const stageW = SCREEN_W - 28;
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
                  <View style={styles.balance} accessible accessibilityLabel={`${formatCoins(balanceAfter ?? balance)} Shark Coins`}>
                    <GameIcon name="coins" size={20} />
                    <CoinTicker value={balanceAfter ?? balance} still={still} />
                  </View>
                  <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                    <GameIcon name="close" size={30} />
                  </Pressable>
                </View>
                <View style={[styles.stage, { height: STAGE_H }]}>
                  <ShopStage rim={glow} backdropUrl={stage?.backdrop} still={still}>
                    <LandFlash color={glow} still={still} trigger={landed} />
                    <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
                      {stage ? (
                        <Playercard inventory={stage.look} popLayers still={still} showBackground={false} pinAnchor="body"
                          popFrom={landed ? 1.45 : 1.18} style={PLAYERCARD_STYLE} />
                      ) : (
                        <View style={styles.flatArt}><TileArt item={item} size={170} torso={false} thumb={false} /></View>
                      )}
                    </Animated.View>
                  </ShopStage>
                  {owned ? (
                    landed > 0 || phase === 'bought' ? (
                      <Animated.View entering={still ? undefined : FadeIn.duration(160)} style={[styles.tag, styles.newTag]} pointerEvents="none">
                        <Text style={styles.newTagText}>{wear === 'spinning' ? 'NOW WEARING' : 'NEW!'}</Text>
                      </Animated.View>
                    ) : null
                  ) : (
                    <View style={styles.tag} pointerEvents="none"><Text style={styles.tagText}>TRY-ON</Text></View>
                  )}
                  {(phase === 'confirm' || phase === 'buying') && (
                    <Animated.View entering={still ? undefined : FadeIn.duration(140)} style={styles.equation} accessible
                      accessibilityLabel={`You have ${formatCoins(balance)} Shark Coins. This costs ${formatCoins(item.cost)}. You will have ${formatCoins(balance - item.cost)} left.`}>
                      <CoinAmount n={balance} />
                      <Text style={styles.op}>−</Text>
                      <CoinAmount n={item.cost} />
                      <Text style={styles.op}>=</Text>
                      <CoinAmount n={balance - item.cost} label="left" />
                    </Animated.View>
                  )}
                </View>
              </View>
            </GestureDetector>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <View style={styles.titleRow}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title} numberOfLines={2}>{name}</Text>
                {badge.label && <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.rarityText}>{badge.label}</Text></View>}
              </View>
              {item.shop?.last_chance && <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.leaving, { color: accent ?? BRAND.navy }]}>
                {lastChanceLine(item.shop?.season)}</Text>}
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
                      <PieceChip key={piece.id} piece={piece.id === item.id ? { ...piece, owned } : piece}
                        state={piece.id === item.id ? (owned ? 'owned' : 'in_shop') : pieceState(piece, todayIds)}
                        selected={ids.includes(piece.id)} trying={piece.id === item.id && !owned} onPress={togglePiece} />
                    ))}
                  </ScrollView>
                  {set.reward_state !== 'claimed' && pieces.some(p => !p.owned && p.id !== item.id) && (
                    <LookSwitch on={fullLook} still={still} onPress={toggleFull} />
                  )}
                </View>
              )}
              {!owned && phase === 'idle' && (
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.wishHint}>{wishHintCopy(wished, wishStore.alerts())}</Text>
              )}
            </ScrollView>

            <Animated.View key={phaseKey} entering={still ? undefined : FadeIn.duration(140)} style={styles.actions}>{actions}</Animated.View>
            <CoinArc from={{ x: 60, y: 44 }} to={{ x: stageW / 2 + 14, y: STAGE_TOP + STAGE_H * 0.45 }} still={still} trigger={coins} />
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
  balanceText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, padding: 0, minWidth: 54 },
  stage: { marginHorizontal: 14, marginTop: 8, borderRadius: 22, overflow: 'hidden', borderWidth: 3, borderColor: BRAND.white },
  flatArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: '-6deg' }] },
  tagText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, letterSpacing: 1 },
  newTag: { backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white },
  newTagText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, letterSpacing: 1 },
  equation: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, paddingVertical: 7, borderWidth: 2, borderColor: '#efe3bd' },
  body: { paddingHorizontal: 18, paddingTop: 10, gap: 8, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  rarity: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  leaving: { fontFamily: FONT.display, fontSize: 16 },
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
  pieces: { gap: 10, paddingVertical: 8, paddingRight: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  track: { width: 54, height: 32, borderRadius: 16, backgroundColor: '#c9d7e6', padding: 3, borderWidth: 2, borderColor: '#aebfd2' },
  trackOn: { backgroundColor: BRAND.green, borderColor: BRAND.greenLip },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  switchText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  wishHint: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  actions: { paddingHorizontal: 16, paddingTop: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wish: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ff9bbf' },
  wishOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  op: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navySoft },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amountText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  amountLabel: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft },
  failed: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: BRAND.red },
  earnHint: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
});
