/**
 * Try before you buy, and buy without leaving.
 *
 * The item is shown on the player's own shark (the Playercard overlay) on the
 * shop stage, already wearing the set pieces they own, with "Try the full
 * look" one tap away. A tried backdrop becomes the stage, and pins sit on the
 * chest.
 *
 * The buy:
 * - The button asks once ("Yes, buy it!"), and the coin math shows under the stage.
 * - Coins pour from the balance into the stage, and the number ticks on the UI thread.
 * - The slot goes empty, then the piece falls onto the shark with a rarity flash.
 * - NEW! replaces TRY-ON. The set reward goes to the shelf at once (it is never
 *   lost to an early close).
 *
 * "Wear it now" hops the shark, shows NOW WEARING, waits for the player to
 * update (so the hero and the toast agree) and closes. Only the button's label
 * ever changes, so there is no blank button frame.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, SlideInDown, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import purchase from '../../api/endpoints/me/inventory/purchase-item';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  afterBuyError, completesSet, formatCoins, lastChanceLine, pieceState, setProgressText, shortfall as shortBy, tryOnCta, wearingIds, wishHintCopy,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, slotForItem, wearableBadge } from '../../helpers/wardrobe';
import { InventoryType } from '../../models/inventory-type';
import { ShopItem, ShopSetPiece, ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { CoinArc, LandFlash, MAX_FONT, PieceChip, Sheen, ShopCta, ShopStage, WishHeart } from './shopUi';
import { TileArt } from './ShopTile';
import { useWished, wishStore } from './wishStore';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.9, 780);
// Short sheets give the stage less so the set strip and switch stay above the fold.
const STAGE_H = Math.round(Math.min(300, SHEET_H * (SHEET_H < 760 ? 0.34 : 0.38)));
const STAGE_TOP = 52;
const CTA_ROW = SCREEN_W - 32;
const PRIMARY_W = Math.min(300, Math.round(CTA_ROW * 0.62));
// The art box has air under the tail: drop it so the tail meets the plinth.
const PLAYERCARD_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: '-2%' as const, bottom: '6%' as const };

type Phase = 'idle' | 'confirm' | 'buying' | 'bought' | 'failed' | 'unknown';
type WearState = 'idle' | 'busy' | 'spinning' | 'failed';

export type Wearable = { id: number; name: string; icon_url: string | null; paper_url: string | null; no_eye_url?: string | null;
  item_type: { id: number; name?: string } };

export const asWearable = (piece: ShopSetPiece): Wearable => ({ id: piece.id, name: piece.name, icon_url: piece.icon_url,
  paper_url: piece.paper_url, no_eye_url: piece.no_eye_url, item_type: { id: piece.item_type_id } });

/**
 * A look for the stage. 'player' starts from the player's outfit; 'base' starts
 * from their shark skin only (the hero and the set reveal show exactly the
 * pieces asked for). `empty` slots are cleared (the bought slot while its piece
 * is falling in). The backdrop piece is returned separately: the stage draws it.
 */
export function previewLook(base: InventoryType | undefined, items: Wearable[], from: 'player' | 'base' = 'player', empty: string[] = []):
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
  for (const slot of empty) look[slot] = null;
  return { look: look as unknown as InventoryType, backdrop };
}

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** The balance, counted on the UI thread (no React render per frame). */
function CoinTicker({ value, still }: { value: number; still: boolean }) {
  const shown = useSharedValue(value);
  const initial = useRef(formatCoins(value)).current;
  useEffect(() => {
    // Starts as the pouring coins reach the stage.
    shown.value = still ? value : withDelay(380, withTiming(value, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [value, still]);
  const props = useAnimatedProps(() => {
    const n = Math.max(0, Math.round(shown.value));
    let s = String(n);
    let out = '';
    while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
    return { text: s + out, defaultValue: s + out } as never;
  });
  return <AnimatedInput editable={false} underlineColorAndroid="transparent" animatedProps={props}
    defaultValue={initial} style={styles.balanceText} />;
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
  onClose, onWish, onPurchased, onWorn }: {
  readonly item: ShopItem | null;
  readonly set: ShopSetSummary | null;
  readonly todayIds: number[];
  readonly still: boolean;
  /** The section colour (event colour for last-chance copy). */
  readonly accent?: string | null;
  readonly startFullLook?: boolean;
  /** Opened from an owned hero: the item is already yours ("Wear it now"). */
  readonly startBought?: boolean;
  readonly onClose: () => void;
  readonly onWish: (item: ShopItem) => void;
  /** Called the moment the server confirms the buy, with the set reward (the shelf owns the reveal). */
  readonly onPurchased: (item: ShopItem, reward: ShopSetReward | null) => void;
  /** Called once the player's look is refreshed with the item on (the shelf shows the toast). */
  readonly onWorn: (item: ShopItem) => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const wished = useWished(item?.id ?? -1);
  const [fullLook, setFullLook] = useState(startFullLook);
  const [extras, setExtras] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [wear, setWear] = useState<WearState>('idle');
  const [dropping, setDropping] = useState(false);
  const [landed, setLanded] = useState(0);
  const [coins, setCoins] = useState(0);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => {
    setExtras([]); setPhase('idle'); setWear('idle'); setBalanceAfter(null); setLanded(0);
    setFullLook(startFullLook);
  }, [item?.id, startFullLook, startBought]);

  const pieces = set?.pieces ?? [];
  const balance = Number(player?.coins ?? 0);
  const ids = useMemo(() => (item ? wearingIds(item.id, pieces, fullLook, extras) : []), [item?.id, pieces, fullLook, extras]);
  const itemSlot = item ? slotForItem(item) : null;
  const stage = useMemo(() => {
    if (!item) return null;
    const byId = new Map<number, Wearable>(pieces.map(p => [p.id, asWearable(p)]));
    byId.set(item.id, { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type });
    // While the bought piece falls in, its slot is empty (never a flash of the old hat).
    const wearing = ids.filter(id => !(dropping && id === item.id)).map(id => byId.get(id)).filter((w): w is Wearable => !!w);
    return previewLook(player?.inventory, wearing, 'player', dropping && itemSlot ? [itemSlot] : []);
  }, [player?.inventory, ids.join(','), item?.id, dropping]);

  // Stage reactions: a wiggle when a piece goes on, a hop with an absorb pop when coins land, a hop on wear.
  const stageScale = useSharedValue(1);
  const hop = useSharedValue(0);
  const stageStyle = useAnimatedStyle(() => {
    const k = hop.value;
    return { transform: [
      { translateY: -26 * Math.sin(Math.PI * Math.min(1, k)) },
      { rotate: `${Math.sin(k * Math.PI * 4) * 9 * (1 - k)}deg` },
      { scale: stageScale.value * (1 + 0.06 * Math.sin(Math.PI * Math.min(1, k))) },
    ] };
  });
  const wiggle = () => { if (!still) stageScale.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, { damping: 7 })); };

  // Every exit slides the sheet away first (close, scrim, Keep shopping, swipe).
  const drag = useSharedValue(0);
  const closeAnimated = useCallback(() => {
    if (still) { onClose(); return; }
    drag.value = withTiming(SHEET_H, { duration: 200, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(onClose)(); });
  }, [still, onClose]);
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
  const owned = !!(item.shop?.is_owned ?? item.has_purchased) || phase === 'bought' || startBought || !!pieces.find(p => p.id === item.id)?.owned;
  const vipLocked = !!item.is_member_item && !player?.is_subscribed;
  const name = itemDisplayName(item);
  const short = shortBy(balance, item.cost);
  const finishes = !!set && completesSet(item.id, pieces);
  const worn = isItemWorn(player?.inventory, item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;
  const cta = tryOnCta({ owned, worn, vipLocked, short, phase, wear, finishes, cost: item.cost });
  const boughtNow = landed > 0 || phase === 'bought';

  const toggleFull = () => {
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    wiggle();
    setFullLook(v => !v);
  };

  const land = () => {
    setDropping(false);
    setLanded(l => l + 1);
    playSound(require('../../../assets/sounds/purchase_item_success.mp3'));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const buy = async () => {
    if (phase === 'buying') return;
    setPhase('buying');
    try {
      const result = await purchase(item);
      const reward = result?.set_reward ?? null;
      setPhase('bought');
      setBalanceAfter(balance - item.cost);
      // The NEW! frame shows what you own, never unowned full-look pieces.
      setFullLook(false); setExtras([]);
      onPurchased(item, reward);
      if (still) land();
      else {
        setDropping(true);
        setCoins(c => c + 1);
        playSound(require('../../../assets/sounds/coin.mp3'));
        later(() => { stageScale.value = withSequence(withTiming(1.06, { duration: 80 }), withSpring(1, { damping: 8 })); }, 520);
        later(land, 600);
      }
      void refreshPlayer();
    } catch (error: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      const data = (error as { response?: { data?: { code?: string } } })?.response?.data;
      if (data?.code === 'not_enough_currency') { void refreshPlayer(); setPhase('idle'); return; }
      // Never claim "you weren't charged" without checking the server.
      const fresh = await refreshPlayer().catch(() => null);
      const outcome = afterBuyError(balance, item.cost, fresh ? {
        coins: Number(fresh.coins ?? 0),
        owns: !!fresh.inventory && Object.values(fresh.inventory).some(v => !!v && typeof v === 'object' && 'id' in v && (v as { id: number }).id === item.id),
      } : null);
      if (outcome === 'bought') { setPhase('bought'); setBalanceAfter(Number(fresh?.coins ?? balance)); onPurchased(item, null); land(); }
      else setPhase(outcome === 'not_charged' ? 'failed' : 'unknown');
    }
  };

  const wearNow = async () => {
    if (worn) { closeAnimated(); return; }
    setWear('busy');
    try {
      await updateInventory(item);
      playSound(require('../../../assets/sounds/whoosh.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setWear('spinning');
      if (!still) hop.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) });
      // The hero, tiles and toast all read the refreshed look: they agree on the same frame.
      await Promise.all([refreshPlayer().catch(() => undefined), new Promise(r => setTimeout(r, still ? 300 : 900))]);
      onWorn(item);
      closeAnimated();
    } catch {
      setWear('failed');
    }
  };

  const press = () => {
    switch (cta.action) {
      case 'wear': void wearNow(); break;
      case 'close': closeAnimated(); break;
      case 'vip': onClose(); RootNavigation.navigate('Membership'); break;
      case 'retry_buy': void buy(); break;
      case 'earn': onClose(); RootNavigation.navigate('Explore'); break;
      case 'buy': void buy(); break;
      case 'ask':
        playSound(require('../../../assets/sounds/purchase_item_prompt.mp3'));
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        setPhase('confirm');
        break;
    }
  };

  const secondary = owned ? { label: 'Keep shopping', onPress: closeAnimated }
    : phase === 'confirm' || phase === 'buying' ? { label: 'Not now', onPress: () => setPhase('idle') } : null;
  const confirming = phase === 'confirm' || phase === 'buying';

  return (
    <Modal visible transparent animationType="none" onRequestClose={closeAnimated} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(still ? 120 : 160)} style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} accessibilityLabel="Close try-on" />
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
                  <Pressable onPress={closeAnimated} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                    <GameIcon name="close" size={30} />
                  </Pressable>
                </View>
                <View style={[styles.stage, { height: STAGE_H }]}>
                  <ShopStage rim={glow} backdropUrl={stage?.backdrop} still={still}>
                    <LandFlash color={glow} still={still} trigger={landed} />
                    <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
                      {stage ? (
                        <Playercard inventory={stage.look} popLayers still={still} showBackground={false} pinAnchor="body" shadow
                          popFrom={landed || dropping ? 1.3 : 1.18} dropIn={landed > 0 || dropping} style={PLAYERCARD_STYLE} />
                      ) : (
                        <View style={styles.flatArt}><TileArt item={item} size={170} thumb={false} /></View>
                      )}
                    </Animated.View>
                  </ShopStage>
                  {boughtNow ? (
                    <Animated.View entering={still ? undefined : FadeIn.duration(160)} style={[styles.tag, styles.newTag]} pointerEvents="none">
                      <Text style={styles.newTagText}>{wear === 'spinning' ? 'NOW WEARING' : 'NEW!'}</Text>
                    </Animated.View>
                  ) : owned ? (
                    (worn || wear === 'spinning') && (
                      <View style={[styles.tag, styles.wearTag]} pointerEvents="none"><Text style={styles.wearTagText}>{wear === 'spinning' ? 'NOW WEARING' : 'WEARING'}</Text></View>
                    )
                  ) : (
                    <View style={styles.tag} pointerEvents="none"><Text style={styles.tagText}>TRY-ON</Text></View>
                  )}
                </View>
                {confirming && (
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
            </GestureDetector>

            <View style={{ flex: 1 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
                <View style={styles.titleRow}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.title} numberOfLines={2}>{name}</Text>
                  {badge.label && <View style={[styles.rarity, { backgroundColor: badge.labelColor }]}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.rarityText}>{badge.label}</Text></View>}
                </View>
                {item.shop?.last_chance && !owned && <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.leaving, { color: accent ?? BRAND.navy }]}>
                  {lastChanceLine(item.shop?.season)}</Text>}
                {item.shop?.returning && !owned && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.back}>Back again by popular demand.</Text>}

                {set && pieces.length > 1 && (
                  <View style={[styles.setCard, { borderColor: set.color ?? BRAND.gold }]}>
                    <View style={styles.setHead}>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName} numberOfLines={1}>{set.name}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setCount}>{setProgressText(set)}</Text>
                    </View>
                    {set.reward_state !== 'claimed' && pieces.some(p => !p.owned && p.id !== item.id) && (
                      <LookSwitch on={fullLook} still={still} onPress={toggleFull} />
                    )}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pieces}>
                      {pieces.map(piece => (
                        <PieceChip key={piece.id} piece={piece.id === item.id ? { ...piece, owned } : piece}
                          state={piece.id === item.id ? (owned ? 'owned' : 'in_shop') : pieceState(piece, todayIds)}
                          selected={ids.includes(piece.id)} trying={piece.id === item.id && !owned} onPress={togglePiece} />
                      ))}
                    </ScrollView>
                    <View style={styles.chips}>
                      {set.title && <View style={styles.titleChip}><GameIcon name="crown" size={16} />
                        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
                      {set.xp_reward > 0 && <View style={styles.xpChip}><GameIcon name="xp" size={16} />
                        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpChipText}>+{set.xp_reward} XP</Text></View>}
                    </View>
                  </View>
                )}
                {!owned && phase === 'idle' && (
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.wishHint}>{wishHintCopy(wished, wishStore.alerts())}</Text>
                )}
              </ScrollView>
              {/* Nothing reads half-cut against the buttons. */}
              <LinearGradient pointerEvents="none" colors={['rgba(255,248,228,0)', BRAND.cream]} style={styles.bodyFade} />
            </View>

            <View style={styles.actions}>
              {cta.note && <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.note, (phase === 'failed' || phase === 'unknown' || wear === 'failed') && { color: BRAND.red }]}>{cta.note}</Text>}
              <View style={styles.row}>
                {!owned && !confirming && !vipLocked && phase !== 'failed' && phase !== 'unknown' && (
                  <Pressable onPress={() => onWish(item)} style={[styles.wish, wished && styles.wishOn]} accessibilityRole="button"
                    accessibilityState={{ selected: wished }} accessibilityLabel={wished ? 'Remove from wishlist' : 'Add to wishlist'}>
                    <WishHeart on={wished} size={26} />
                  </Pressable>
                )}
                <View style={{ overflow: 'hidden', borderRadius: 18 }}>
                  <ShopCta label={cta.label} icon={owned ? 'shark' : cta.action === 'earn' ? 'coins' : cta.action === 'vip' ? 'member' : 'coins'}
                    width={PRIMARY_W} onPress={press} still={still}
                    loading={phase === 'buying' || wear === 'busy'} disabled={wear === 'spinning'} />
                  {cta.action === 'ask' && finishes && <Sheen still={still} delay={500} width={360} />}
                </View>
                {secondary && (
                  <Pressable onPress={secondary.onPress} style={styles.secondary} accessibilityRole="button" hitSlop={6}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.secondaryText}>{secondary.label}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <CoinArc from={{ x: 60, y: 44 }} to={{ x: (SCREEN_W - 28) / 2 + 14, y: STAGE_TOP + STAGE_H * 0.5 }} still={still} trigger={coins} />
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
  wearTag: { backgroundColor: BRAND.green, borderWidth: 2, borderColor: BRAND.white },
  wearTagText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.white, letterSpacing: 1 },
  equation: { marginHorizontal: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: BRAND.white, borderRadius: 999, paddingVertical: 6, borderWidth: 2, borderColor: '#efe3bd' },
  body: { paddingHorizontal: 18, paddingTop: 10, gap: 8, paddingBottom: 24 },
  bodyFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 },
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
  actions: { paddingHorizontal: 16, paddingTop: 6, gap: 6 },
  note: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 },
  wish: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ff9bbf' },
  wishOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  secondary: { minHeight: 48, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  secondaryText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy, textTransform: 'uppercase' },
  op: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navySoft },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amountText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  amountLabel: { fontFamily: FONT.body, fontSize: 14, color: BRAND.navySoft },
});
