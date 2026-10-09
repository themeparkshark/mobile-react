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
import { ModalLayerContext, useModalLayer } from '../../ui/modalLayers';
import * as Haptics from 'expo-haptics';
import { openMembership } from '../../components/GrownUpGate';
import { FxSceneBackdrop } from '../../fx/FxSolo';
import { FX_BLURB, FX_SCENES, FxKey, fxKeyOf, isSecretItem } from '../../fx/registry';
import { SECRET_THEME } from '../../fx/secretTheme';
import { UnlockBeat } from './SecretShopUi';
import { Image } from 'expo-image';
import { PEARLS, leavingIcon, lifeLines, pearlFor, retiringWishHint, sentence } from '../../helpers/shopLifecycle';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing, FadeIn, Keyframe, SlideInDown, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import purchase from '../../api/endpoints/me/inventory/purchase-item';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  afterBuyError, completesSet, stageCard, formatCoins, lastChanceLine, pieceState, recoveredSetOutcome, revealHoldMs, setProgressText, settleBuyError,
  MEMBER_KEEP, MEMBER_PROMISE, shortfall as shortBy, slotLine, tryOnCta, tryOnLayout, wearingIds, wishHintCopy, type TryOnPhase,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, slotForItem, wearableBadge } from '../../helpers/wardrobe';
import { InventoryType } from '../../models/inventory-type';
import { ShopItem, ShopSetPiece, ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, GameIcon, SHADOW } from '../../ui';
import { CoinArc, LandFlash, MAX_FONT, PieceChip, REVEAL_NAVY, SHOP_SURFACE, Sheen, ShopCta, ShopStage, WishHeart } from './shopUi';
import { wearItem } from './inventoryQueue';
import { isMemberWearItem, memberWearLocked, useMemberWearLock } from '../../services/memberLook';
import { TileArt } from './ShopTile';
import { useWished, wishStore } from './wishStore';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_H = Math.min(SCREEN_H * 0.9, 780);
// Short sheets give the stage less so the set strip and switch stay above the fold.
const STAGE_H = Math.round(Math.min(300, SHEET_H * (SHEET_H < 760 ? 0.34 : 0.38)));
const STAGE_TOP = 52;
const CTA_ROW = SCREEN_W - 32;
const PRIMARY_W = Math.min(300, Math.round(CTA_ROW * 0.62));
// The tail rests on the plinth face (stageCard measures the art and the plinth). The wear hop
// lifts the shark HOP pt and the absorb pop scales the stage 4% about its centre: the card leaves
// that much room above the tallest hat, so the head never clips.
const HOP = 18;
const CARD = stageCard(SCREEN_W - 28 - 6, STAGE_H - 6, HOP + 0.04 * (STAGE_H / 2) + 4);
const PLAYERCARD_STYLE = { position: 'absolute' as const, ...CARD.box };
// The Secret Shop try-on: the piece is the point, so the stage takes about half the sheet (panel round 1).
const SECRET_STAGE_H = Math.round(Math.min(430, SHEET_H * 0.52));
const SECRET_CARD = stageCard(SCREEN_W - 28 - 6, SECRET_STAGE_H - 6, HOP + 0.04 * (SECRET_STAGE_H / 2) + 4);
const SECRET_PLAYERCARD_STYLE = { position: 'absolute' as const, ...SECRET_CARD.box };
// A piece with no set strip (most classic-catalog gear) gets the room the strip would use: a bigger stage,
// no dead gap above the buttons (art director, Oct 8 round 1).
const SOLO_STAGE_H = Math.round(Math.min(440, SHEET_H * 0.56));
const SOLO_CARD = stageCard(SCREEN_W - 28 - 6, SOLO_STAGE_H - 6, HOP + 0.04 * (SOLO_STAGE_H / 2) + 4);
const SOLO_PLAYERCARD_STYLE = { position: 'absolute' as const, ...SOLO_CARD.box };
/** The sheet's spring has settled by about now: moments wait for it, so every open shows a whole moment. */
const SHEET_SETTLE_MS = 300;

type Phase = TryOnPhase;
type WearState = 'idle' | 'busy' | 'spinning' | 'failed';

export type Wearable = { id: number; name: string; icon_url: string | null; paper_url: string | null; no_eye_url?: string | null;
  item_type: { id: number; name?: string };
  /** Secret Shop rig (animated piece). */
  fx_key?: string | null };

export const asWearable = (piece: ShopSetPiece): Wearable => ({ id: piece.id, name: piece.name, icon_url: piece.icon_url,
  paper_url: piece.paper_url, no_eye_url: piece.no_eye_url, item_type: { id: piece.item_type_id } });

/**
 * A look for the stage. 'player' starts from the player's outfit; 'base' starts
 * from their shark skin only (the hero and the set reveal show exactly the
 * pieces asked for). `empty` slots are cleared (the bought slot while its piece
 * is falling in). The backdrop piece is returned separately: the stage draws it.
 */
export function previewLook(base: InventoryType | undefined, items: Wearable[], from: 'player' | 'base' = 'player', empty: string[] = []):
  { look: InventoryType; backdrop: string | null; scene: FxKey | null } | null {
  if (!base?.skin_item?.no_eye_url) return null;
  const look: Record<string, unknown> = from === 'player' ? { ...base } : { skin_item: base.skin_item, id: base.id };
  let backdrop: string | null = null;
  // An animated backdrop plays behind the stage instead of its still paper (secret-shop/DESIGN.md 8.2).
  let scene: FxKey | null = null;
  for (const item of items) {
    const slot = slotForItem(item as never);
    if (!slot) continue;
    if (slot === 'background_item') { backdrop = item.paper_url ?? item.icon_url; scene = fxKeyOf(item); continue; }
    look[slot] = { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type, fx_key: item.fx_key ?? null };
  }
  // The player's own worn scene keeps playing on a 'player' stage.
  if (from === 'player' && !backdrop) scene = fxKeyOf(base.background_item);
  for (const slot of empty) look[slot] = null;
  return { look: look as unknown as InventoryType, backdrop, scene: scene && FX_SCENES.includes(scene) ? scene : null };
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

export default function TryOnSheet({ item, set, todayIds, still, accent, startFullLook = false, startBought = false, startConfirm = false,
  onClose, onLeaving, onWish, onPurchased, onWorn, checkOwned, buyPaused = false, rewardPending = false, secret = false }: {
  readonly item: ShopItem | null;
  readonly set: ShopSetSummary | null;
  readonly todayIds: number[];
  readonly still: boolean;
  /** The section colour (event colour for last-chance copy). */
  readonly accent?: string | null;
  readonly startFullLook?: boolean;
  /** Opened from an owned hero: the item is already yours ("Wear it now"). */
  readonly startBought?: boolean;
  /**
   * Opened from a Buy button (the Secret Shop's "Get it"): the sheet opens on the confirm step, so a
   * buy is that tap plus "Yes, buy it!". Owned, VIP-locked, short and paused still win (tryOnCta).
   */
  readonly startConfirm?: boolean;
  readonly onClose: () => void;
  /** The sheet has slid away and its modal is about to hide (onClose follows once it is gone). */
  readonly onLeaving?: () => void;
  readonly onWish: (item: ShopItem) => void;
  /**
   * Called the moment the server confirms the buy, with the set reward (the shelf owns the reveal).
   * A buy recovered by the check that finished a set passes 'set_complete' when no reward is known.
   */
  readonly onPurchased: (item: ShopItem, reward: ShopSetReward | null, recovered?: 'set_complete') => void;
  /** Called once the player's look is refreshed with the item on (the shelf shows the toast). */
  readonly onWorn: (item: ShopItem) => void;
  /** Asks the server whether this player now owns the item (refetches the shop), with that item's fresh set. null if unreachable. */
  readonly checkOwned: (itemId: number) => Promise<{ owns: boolean; set: ShopSetSummary | null } | null>;
  /** Today's shop is still building (fallback): buying waits a moment. */
  readonly buyPaused?: boolean;
  /** A set reward is waiting: close after the landing beat. */
  readonly rewardPending?: boolean;
  /** Opened from the Secret Shop: midnight sheet, "Unlock with VIP" for non-members. */
  readonly secret?: boolean;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  // A sheet layer: dialogs and the grown-up gate wait until it is gone (ui/modalLayers.ts).
  useModalLayer(!!item, 'show');
  const memberLockOn = useMemberWearLock();
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const wished = useWished(item?.id ?? -1);
  const [fullLook, setFullLook] = useState(startFullLook);
  const [extras, setExtras] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [wear, setWear] = useState<WearState>('idle');
  const [dropping, setDropping] = useState(false);
  const [landed, setLanded] = useState(0);
  // VIP lapsed mid-sheet (a members_only 403): a kind note, and a short hold so a double tap can't open the paywall.
  const [lapsed, setLapsed] = useState(false);
  // A worn scene plays behind the stage, outside the Playercard: taps and the unlock reach it through here.
  const [scenePlay, setScenePlay] = useState<{ n: number; kind: 'tap' | 'unlock' } | null>(null);
  const onFxPlay = useCallback((kind: 'tap' | 'unlock') => setScenePlay(p => ({ n: (p?.n ?? 0) + 1, kind })), []);
  const [hold, setHold] = useState(false);
  const [coins, setCoins] = useState(0);
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  // A set reward is waiting: let the landing breathe (~1.2 s), then slide away so the reveal can play.
  useEffect(() => {
    const hold = revealHoldMs(rewardPending, landed, still);
    if (hold == null) return;
    const t = setTimeout(() => closeRef.current(), hold);
    return () => clearTimeout(t);
  }, [rewardPending, landed]);

  useEffect(() => {
    setExtras([]); setPhase(startConfirm && !startBought ? 'confirm' : 'idle'); setWear('idle'); setBalanceAfter(null); setLanded(0);
    setFullLook(startFullLook);
  }, [item?.id, startFullLook, startBought, startConfirm]);

  const pieces = set?.pieces ?? [];
  const balance = Number(player?.coins ?? 0);
  const ids = useMemo(() => (item ? wearingIds(item.id, pieces, fullLook, extras) : []), [item?.id, pieces, fullLook, extras]);
  const itemSlot = item ? slotForItem(item) : null;
  const stage = useMemo(() => {
    if (!item) return null;
    const byId = new Map<number, Wearable>(pieces.map(p => [p.id, asWearable(p)]));
    byId.set(item.id, { id: item.id, name: item.name, icon_url: item.icon_url, paper_url: item.paper_url,
      no_eye_url: item.no_eye_url, item_type: item.item_type, fx_key: item.fx_key ?? null });
    // While the bought piece falls in, its slot is empty (never a flash of the old hat). A Secret piece
    // was already on the shark in the try-on: it stays on through the buy (art panel round 4).
    const empties = dropping && !secret;
    const wearing = ids.filter(id => !(empties && id === item.id)).map(id => byId.get(id)).filter((w): w is Wearable => !!w);
    return previewLook(player?.inventory, wearing, 'player', empties && itemSlot ? [itemSlot] : []);
  }, [player?.inventory, ids.join(','), item?.id, dropping]);

  // Stage reactions: a wiggle when a piece goes on, a hop with an absorb pop when coins land, a hop on wear.
  const stageScale = useSharedValue(1);
  const hop = useSharedValue(0);
  const stageStyle = useAnimatedStyle(() => {
    const k = hop.value;
    return { transform: [
      { translateY: -HOP * Math.sin(Math.PI * Math.min(1, k)) },
      { rotate: `${Math.sin(k * Math.PI * 4) * 7 * (1 - k)}deg` },
      { scale: stageScale.value * (1 + 0.04 * Math.sin(Math.PI * Math.min(1, k))) },
    ] };
  });
  const wiggle = () => { if (!still) stageScale.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, { damping: 7 })); };

  // Every exit slides the sheet away first (close, scrim, Keep shopping, swipe), then hides the
  // modal and reports closed only once iOS has finished dismissing it (onDismiss), so the shelf
  // can present the Set Complete reveal at once instead of waiting on a fixed timer.
  const drag = useSharedValue(0);
  const [leaving, setLeaving] = useState(false);
  const rewardPendingRef = useRef(rewardPending);
  rewardPendingRef.current = rewardPending;
  const closedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onLeavingRef = useRef(onLeaving);
  onLeavingRef.current = onLeaving;
  // Something to do once the sheet is fully gone (the VIP gate: one modal never opens over another).
  const afterHiddenRef = useRef<(() => void) | null>(null);
  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onCloseRef.current();
    const after = afterHiddenRef.current;
    afterHiddenRef.current = null;
    after?.();
  }, []);
  const leave = useCallback(() => {
    // Tell the shelf first, so its cover is up before this modal hides.
    onLeavingRef.current?.();
    setLeaving(true);
    // Android has no onDismiss; on iOS this is only a guard in case it never fires.
    setTimeout(finishClose, Platform.OS === 'ios' ? 200 : 0);
  }, [finishClose]);
  // With a Set Complete reveal waiting, the scrim deepens to the reveal's navy as the sheet slides
  // away, so the kid goes from the landing straight into the payoff (no idle shelf).
  const dusk = useSharedValue(0);
  const duskStyle = useAnimatedStyle(() => ({ opacity: dusk.value }));
  const closeAnimated = useCallback(() => {
    if (rewardPendingRef.current) dusk.value = withTiming(1, { duration: still ? 0 : 200 });
    if (still) { leave(); return; }
    drag.value = withTiming(SHEET_H, { duration: 200, easing: Easing.in(Easing.quad) }, done => { if (done) runOnJS(leave)(); });
  }, [still, leave]);
  const closeRef = useRef(closeAnimated);
  closeRef.current = closeAnimated;
  const pan = Gesture.Pan().activeOffsetY(8)
    .onUpdate(e => { drag.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 900) drag.value = withTiming(SHEET_H, { duration: 180 }, () => runOnJS(leave)());
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
  const vipLocked = !!item.is_member_item && !player?.is_subscribed;
  const secretItem = secret || isSecretItem(item);
  // While the piece is in flight the server's "owned" is ignored: the row holds still until it lands.
  // Wishing is free: non-members can heart a Secret piece too (kids UX round 1).
  const row = tryOnLayout({ phase, startBought, vipLocked: vipLocked && !secretItem,
    serverOwned: !!(item.shop?.is_owned ?? item.has_purchased) || !!pieces.find(p => p.id === item.id)?.owned });
  const owned = row.owned;
  const name = itemDisplayName(item);
  // Items come and go (cp-catalogs): the lines and what VoiceOver says are the same strings.
  const fxKey = fxKeyOf(item);
  const { goingAway, rarity, leaveText, keepText, lifeSay } = lifeLines(item.shop, { secret: secretItem, vipLocked, owned });
  const short = shortBy(balance, item.cost);
  const finishes = !!set && completesSet(item.id, pieces);
  const worn = isItemWorn(player?.inventory, item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;
  // Member pieces are worn only while a member (DESIGN.md 4.3); the server enforces it too.
  const memberItem = isMemberWearItem(item);
  const wearLocked = memberWearLocked(item, player?.is_subscribed === true, memberLockOn);
  const baseCta = tryOnCta({ owned, worn, vipLocked, short, phase, wear, finishes, cost: item.cost, paused: buyPaused, secret: secretItem, wearLocked });
  // VIP ran out while the sheet was open: say so kindly, coins untouched.
  const lapsedCta = lapsed && vipLocked ? { ...baseCta, note: 'Your VIP ended, so this one is locked. Your coins are safe.' } : baseCta;
  // The buy confirmation says the member rule out loud before any coins move (DESIGN.md 4.3).
  // A Secret piece already says it in its card above (no second copy at the moment of buying, monetization round 1).
  const cta = !lapsedCta.note && phase === 'confirm' && memberItem && !fxKey ? { ...lapsedCta, note: MEMBER_PROMISE } : lapsedCta;
  // No set strip under the stage: the stage takes that room.
  const solo = !secret && !(set && pieces.length > 1);
  const stageH = secret ? SECRET_STAGE_H : solo ? SOLO_STAGE_H : STAGE_H;
  // The kid-fair promise, in a 7-year-old's words (kids UX round 1).
  // A member already is one: the promise alone. Guests hear the VIP rule (kids UX round 2).
  const keepLine = player?.is_subscribed ? MEMBER_KEEP : MEMBER_PROMISE;
  const card = secret ? SECRET_CARD : solo ? SOLO_CARD : CARD;
  const boughtNow = landed > 0;

  const toggleFull = () => {
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    wiggle();
    setFullLook(v => !v);
  };

  // NEW! and WEAR IT NOW appear when the piece lands, not when the server answers.
  const land = () => {
    setDropping(false);
    setLanded(l => l + 1);
    setPhase('bought');
    playSound(require('../../../assets/sounds/purchase_item_success.mp3'));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const buy = async () => {
    if (phase !== 'confirm') return;
    setPhase('buying');
    try {
      const result = await purchase(item);
      const reward = result?.set_reward ?? null;
      setPhase('landing');
      setBalanceAfter(balance - item.cost);
      // The NEW! frame shows what you own, never unowned full-look pieces.
      setFullLook(false); setExtras([]);
      onPurchased(item, reward);
      if (still) land();
      else {
        setDropping(true);
        setCoins(c => c + 1);
        playSound(require('../../../assets/sounds/coin.mp3'));
        // The stage pops as the first coins hit and the piece lands with them: one beat inside 400 ms.
        later(() => { stageScale.value = withSequence(withTiming(1.06, { duration: 80 }), withSpring(1, { damping: 8 })); }, 340);
        later(land, 390);
      }
      void refreshPlayer();
    } catch (error: unknown) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      const data = (error as { response?: { data?: { code?: string } } })?.response?.data;
      if (data?.code === 'not_enough_currency') { void refreshPlayer(); setPhase('idle'); return; }
      // Membership ran out while the sheet was open: the server said no (403) and nothing was charged.
      // The fresh player flips the button to "Unlock with VIP".
      if (data?.code === 'members_only') {
        setLapsed(true); setPhase('idle'); setHold(true);
        later(() => setHold(false), 600);
        void refreshPlayer();
        return;
      }
      await settleUnknown('buy');
    }
  };

  // Never claim "you weren't charged" without asking the server: owned (from a fresh shop) or coins gone.
  // The first error confirmed not charged says so (Try again goes back to confirm); only a
  // "Check again" that finds nothing returns quietly to the normal two-tap buy.
  const settleUnknown = async (source: 'buy' | 'recheck') => {
    setPhase('checking');
    const [fresh, check] = await Promise.all([refreshPlayer().catch(() => null), checkOwned(item.id).catch(() => null)]);
    const outcome = afterBuyError(balance, item.cost, fresh && check ? { coins: Number(fresh.coins ?? 0), owns: check.owns } : null);
    const next = settleBuyError(outcome, source);
    if (next === 'bought') {
      setBalanceAfter(Number(fresh?.coins ?? balance));
      setFullLook(false); setExtras([]);
      // The reply with the set reward was lost: play the reveal from the fresh set, or at least say so.
      const set = recoveredSetOutcome(finishes, check?.set);
      if (set?.kind === 'reveal') onPurchased(item, set.reward);
      else onPurchased(item, null, set?.kind === 'toast' ? 'set_complete' : undefined);
      land();
    } else setPhase(next);
  };

  const wearNow = async () => {
    if (worn) { closeAnimated(); return; }
    setWear('busy');
    try {
      await wearItem(item);
      playSound(require('../../../assets/sounds/whoosh.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setWear('spinning');
      if (!still) { hop.value = 0; hop.value = withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) }); }
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
      // The grown-up gate opens only after the sheet has slid away and its modal is gone.
      case 'vip': afterHiddenRef.current = () => { void openMembership(); }; closeAnimated(); break;
      case 'recheck': void settleUnknown('recheck'); break;
      case 'none': break;
      case 'earn': onClose(); RootNavigation.navigate('Explore'); break;
      case 'buy': void buy(); break;
      case 'ask':
        playSound(require('../../../assets/sounds/purchase_item_prompt.mp3'));
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        setPhase('confirm');
        break;
    }
  };

  const secondary = row.secondary === 'keep_shopping' ? { label: 'Keep shopping', onPress: closeAnimated }
    : row.secondary === 'not_now' ? { label: 'Not now', onPress: () => setPhase('idle') } : null;
  const confirming = phase === 'confirm' || phase === 'buying';

  return (
    <Modal visible={!leaving} transparent animationType="none" onRequestClose={closeAnimated} onDismiss={finishClose} statusBarTranslucent>
      <ModalLayerContext.Provider value>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View entering={still ? undefined : FadeIn.duration(160)} style={styles.scrim}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: REVEAL_NAVY }, duskStyle]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} accessibilityLabel="Close try-on" />
          <Animated.View entering={still ? undefined : SlideInDown.springify().damping(18).stiffness(180)}
            style={[styles.sheet, secret && { backgroundColor: SECRET_THEME.panel, borderColor: SECRET_THEME.border },
              { height: SHEET_H, paddingBottom: Math.max(16, insets.bottom + 8) }, sheetStyle]}>
            <GestureDetector gesture={pan}>
              <View>
                <View style={styles.grabber} />
                <View style={styles.topRow}>
                  <View style={[styles.balance, secret && { backgroundColor: SECRET_THEME.well, borderColor: SECRET_THEME.accent }]} accessible accessibilityLabel={`${formatCoins(balanceAfter ?? balance)} coins`}>
                    <GameIcon name="coins" size={20} />
                    <CoinTicker value={balanceAfter ?? balance} still={still} />
                  </View>
                  <Pressable onPress={closeAnimated} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
                    <GameIcon name="close" size={30} />
                  </Pressable>
                </View>
                <View style={[styles.stage, { height: stageH }]}>
                  <ShopStage rim={glow} backdropUrl={stage?.scene ? null : stage?.backdrop} tone={secret ? 'night' : 'sky'} still={still}
                    backdrop={stage?.scene ? <FxSceneBackdrop fxKey={stage.scene} still={still} sound={secret} play={scenePlay} startDelay={SHEET_SETTLE_MS} /> : undefined}
                    sky={secret ? SECRET_THEME.sky : undefined} plinth={stage?.scene ? 'none' : secret ? 'secret' : 'house'}>
                    {!secret && <LandFlash color={glow} still={still} trigger={landed} />}
                    {secret && <UnlockBeat trigger={landed} still={still} />}
                    <Animated.View style={[StyleSheet.absoluteFill, stageStyle]}>
                      {stage ? (
                        <Playercard inventory={stage.look} popLayers still={still} showBackground={false} pinAnchor="body" shadow shadowAt={card.shadow} liftRoom={card.box.top}
                          popFrom={landed || dropping ? 1.3 : 1.18} dropIn={landed > 0 || dropping}
                          style={secret ? SECRET_PLAYERCARD_STYLE : solo ? SOLO_PLAYERCARD_STYLE : PLAYERCARD_STYLE} sceneGround={!!stage.scene}
                          fxPlay={secret ? landed : 0} fxHold={secret && HOLD_PHASES.has(phase)} fxTapToPlay fxStartDelay={secret ? SHEET_SETTLE_MS : 0}
                          onFxPlay={stage.scene ? onFxPlay : undefined} />
                      ) : (
                        <View style={styles.flatArt}><TileArt item={item} size={170} thumb={false} /></View>
                      )}
                    </Animated.View>
                  </ShopStage>
                  {boughtNow ? (
                    <Animated.View entering={still ? undefined : secret ? NEW_POP : FadeIn.duration(160)} style={[styles.tag, styles.newTag]} pointerEvents="none">
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.newTagText}>{wear === 'spinning' ? 'NOW WEARING' : goingAway?.forever ? 'YOURS FOREVER!' : 'NEW!'}</Text>
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
                    accessibilityLabel={`It costs ${formatCoins(item.cost)} coins. You have ${formatCoins(balance)}. After, you’ll have ${formatCoins(balance - item.cost)} left.`}>
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
                {/* What it is, in a kid's words (kids UX round 1): Secret pieces say what they do in their card. */}
                {!fxKey && slotLine(item.item_type?.id) && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.slotLine}>{slotLine(item.item_type?.id)}</Text>}
                {/* Non-members see the price too, with the lock (one marker everywhere). */}
                {secretItem && vipLocked && !owned && (
                  <View style={[styles.lockPrice, { alignSelf: 'flex-start', marginTop: -2 }]} accessible accessibilityLabel={`${formatCoins(item.cost)} coins, VIP members can buy`}>
                    <GameIcon name="coins" size={16} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.lockPriceText}>{formatCoins(item.cost)}</Text>
                    <GameIcon name="lock" size={16} />
                  </View>
                )}
                {item.shop?.last_chance && !owned && !goingAway && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.leaving}>
                  {lastChanceLine(item.shop?.season)}</Text>}
                {item.shop?.returning && !owned && !goingAway && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.back}>Back again by popular demand.</Text>}
                {/* Items come and go: when it leaves, honestly whether it comes back, the forever promise, and (owned or retiring) how few sharks have it. */}
                {!fxKey && (goingAway || rarity) && (
                  <View style={styles.lifeCard} accessible accessibilityLabel={lifeSay}>
                    {goingAway && <View style={styles.lifeRow}><View style={styles.lifeIcon}><GameIcon name={leavingIcon(goingAway)} size={22} /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.lifeText}>{leaveText}</Text></View>}
                    {goingAway && <View style={styles.lifeRow}><View style={styles.lifeIcon}><GameIcon name="check" size={20} /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.lifeText}>{keepText}</Text></View>}
                    {rarity && <View style={styles.lifeRow}><View style={styles.lifeIcon}><Image source={PEARLS[pearlFor(rarity.tier)]} style={styles.lifePearl} contentFit="contain" /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.lifeText}>{sentence(rarity.label)}</Text></View>}
                  </View>
                )}
                {fxKey && (
                  // Secret pieces: what it does, and the kid-fair promise (secret-shop/DESIGN.md 4.3). Leaving and rarity join this one card.
                  <View style={styles.fxCard} accessible accessibilityLabel={`${leaveText ? `${leaveText} ` : ''}${FX_BLURB[fxKey]} ${keepLine}${rarity ? ` ${sentence(rarity.label)}` : ''}`}>
                    {goingAway && <View style={styles.fxRow}><View style={styles.lifeIcon}><GameIcon name={leavingIcon(goingAway)} size={22} /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fxText}>{leaveText}</Text></View>}
                    <View style={styles.fxRow}><View style={styles.lifeIcon}><GameIcon name="sparkle" size={22} /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fxText}>{FX_BLURB[fxKey]}</Text></View>
                    <View style={styles.fxRow}><View style={styles.lifeIcon}><GameIcon name="check" size={20} /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={goingAway || rarity ? styles.fxText : styles.fxKeep}>{keepLine}</Text></View>
                    {rarity && <View style={styles.fxRow}><View style={styles.lifeIcon}><Image source={PEARLS[pearlFor(rarity.tier)]} style={styles.lifePearl} contentFit="contain" /></View>
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fxText}>{sentence(rarity.label)}</Text></View>}
                  </View>
                )}

                {!fxKeyOf(item) && memberItem && (
                  // VIP gear without a rig: the same member promise as the Secret pieces.
                  <View style={styles.fxCard} accessible accessibilityLabel={MEMBER_PROMISE}>
                    <View style={styles.fxRow}><GameIcon name="member" size={20} />
                      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fxKeep}>{MEMBER_PROMISE}</Text></View>
                  </View>
                )}
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
                {/* A Secret piece with a leaving line fills the body: the heart button speaks for itself there, so no hint rests under the fade. */}
                {!owned && phase === 'idle' && !solo && (!vipLocked || secretItem) && !(lapsed && vipLocked) && !(fxKey && goingAway) && (
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.wishHint}>{goingAway?.forever ? retiringWishHint(wished) : wishHintCopy(wished, wishStore.alerts())}</Text>
                )}
              </ScrollView>
              {/* Nothing reads half-cut against the buttons. */}
              <LinearGradient pointerEvents="none" colors={secret ? ['rgba(18,48,108,0)', SECRET_THEME.panel] : ['rgba(10,79,150,0)', SHOP_SURFACE.panel]} style={styles.bodyFade} />
            </View>

            <View style={styles.actions}>
              {cta.note && (phase === 'failed' || phase === 'unknown' || wear === 'failed' ? (
                <View style={styles.alert}><Text maxFontSizeMultiplier={MAX_FONT} style={styles.alertText}>{cta.note}</Text></View>
              ) : <Text maxFontSizeMultiplier={MAX_FONT} style={styles.note}>{cta.note}</Text>)}
              <View style={styles.row}>
                {row.showWish && (
                  <Pressable onPress={() => onWish(item)} style={[styles.wish, wished && styles.wishOn]} accessibilityRole="button"
                    accessibilityState={{ selected: wished }} accessibilityLabel={wished ? 'Remove from Favorites' : 'Save to Favorites'}>
                    <WishHeart on={wished} size={26} />
                  </Pressable>
                )}
                {cta.action === 'vip' && secretItem ? (
                  // Not the gold Buy face: this door leads to a grown-up, not to buying (kids UX round 2).
                  <Pressable onPress={press} disabled={hold} style={({ pressed }) => [styles.grownUp, { width: PRIMARY_W }, pressed && { opacity: 0.8 }]}
                    accessibilityRole="button" accessibilityLabel="Ask a grown-up about VIP">
                    <GameIcon name="lock" size={24} />
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.grownUpText}>{cta.label.toUpperCase()}</Text>
                  </Pressable>
                ) : (
                <View style={{ overflow: 'hidden', borderRadius: 18 }}>
                  <ShopCta label={cta.label} icon={owned ? 'shark' : cta.action === 'earn' ? 'coins' : cta.action === 'vip' ? (secretItem ? 'lock' : 'member') : 'coins'}
                    width={PRIMARY_W} onPress={press} still={still}
                    loading={cta.look === 'busy' || cta.look === 'checking'} muted={cta.look === 'paused' || cta.look === 'checking'}
                    disabled={hold || wear === 'spinning' || cta.look === 'paused' || cta.look === 'checking'} />
                  {cta.action === 'ask' && finishes && <Sheen still={still} delay={500} width={360} />}
                </View>
                )}
                {secondary && (
                  <Pressable onPress={secondary.onPress} disabled={!row.secondaryEnabled} accessibilityState={{ disabled: !row.secondaryEnabled }}
                    style={[styles.secondary, !row.secondaryEnabled && { opacity: 0.45 }]} accessibilityRole="button" hitSlop={6}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.secondaryText}>{secondary.label}</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <CoinArc from={{ x: 60, y: 44 }} to={{ x: (SCREEN_W - 28) / 2 + 14, y: STAGE_TOP + stageH * 0.5 }} still={still} trigger={coins} />
          </Animated.View>
        </Animated.View>
      </GestureHandlerRootView>
      </ModalLayerContext.Provider>
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

const S = SHOP_SURFACE;
/**
 * Secret NEW!: hidden through the dim, then it pops in at full colour with the burst
 * (0 to 1.15 to 1), never fading up grey under the dim (art panel round 5).
 */
/** From the confirm tap to the landing, no timer moment competes with the buy (game feel round 6). */
const HOLD_PHASES = new Set(['checking', 'confirm', 'buying', 'landing']);

const NEW_POP = new Keyframe({
  // Full colour from the first frame: it grows from nothing, it never fades up grey.
  0: { opacity: 1, transform: [{ scale: 0 }] },
  60: { opacity: 1, transform: [{ scale: 1.15 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
}).duration(260).delay(300);

const styles = StyleSheet.create({
  // One card, one face, a solid gold keyline (the fxCard's radius and padding).
  lifeCard: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: 'rgba(5,52,110,0.55)', borderWidth: 2, borderColor: BRAND.gold },
  lifeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lifeText: { flex: 1, fontFamily: FONT.display, fontSize: 17, color: '#ffffff' },
  lifePearl: { width: 22, height: 22 },
  // One 24 pt icon slot, so every line's text starts on the same vertical.
  lifeIcon: { width: 24, alignItems: 'center' },
  scrim: { flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: S.panel, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 3, borderColor: S.border, ...SHADOW.card },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)', marginTop: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: S.well, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 4, borderWidth: 2, borderColor: S.line },
  balanceText: { fontFamily: FONT.display, fontSize: 17, color: S.ink, padding: 0, minWidth: 54 },
  stage: { marginHorizontal: 14, marginTop: 8, borderRadius: 22, overflow: 'hidden', borderWidth: 3, borderColor: S.border },
  flatArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', left: 12, top: 12, backgroundColor: 'rgba(5,52,110,0.82)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, transform: [{ rotate: '-6deg' }] },
  tagText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.white, letterSpacing: 1 },
  newTag: { backgroundColor: BRAND.gold, borderWidth: 2, borderColor: BRAND.white },
  newTagText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy, letterSpacing: 1 },
  wearTag: { backgroundColor: BRAND.green, borderWidth: 2, borderColor: BRAND.white },
  wearTagText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.white, letterSpacing: 1 },
  equation: { marginHorizontal: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: S.well, borderRadius: 999, paddingVertical: 6, borderWidth: 2, borderColor: S.line },
  // The last row (the heart hint) always rests fully above the fade: fade height + 12.
  body: { paddingHorizontal: 18, paddingTop: 10, gap: 8, paddingBottom: 36 },
  bodyFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: FONT.display, fontSize: 24, color: S.ink },
  rarity: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1.5, borderColor: BRAND.white },
  rarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  leaving: { fontFamily: FONT.display, fontSize: 16, color: S.inkGold },
  back: { fontFamily: FONT.display, fontSize: 16, color: S.inkSoft },
  setCard: { backgroundColor: S.card, borderRadius: 16, borderWidth: 3, padding: 12, gap: 8 },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setName: { flexShrink: 1, fontFamily: FONT.display, fontSize: 18, color: S.ink },
  setCount: { fontFamily: FONT.display, fontSize: 16, color: S.inkGold },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  titleChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLight },
  xpChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  xpChipText: { fontFamily: FONT.display, fontSize: 13, color: S.inkSoft },
  pieces: { gap: 10, paddingVertical: 8, paddingRight: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start' },
  track: { width: 54, height: 32, borderRadius: 16, backgroundColor: '#c9d7e6', padding: 3, borderWidth: 2, borderColor: '#aebfd2' },
  trackOn: { backgroundColor: BRAND.green, borderColor: BRAND.greenLip },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  switchText: { fontFamily: FONT.display, fontSize: 15, color: S.ink },
  wishHint: { fontFamily: FONT.body, fontSize: 15, color: S.inkSoft },
  grownUp: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18,
    backgroundColor: SECRET_THEME.accent, borderWidth: 3, borderColor: SECRET_THEME.border },
  grownUpText: { fontFamily: FONT.display, fontSize: 20, color: '#ffffff' },
  lockPrice: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    backgroundColor: SECRET_THEME.well, borderWidth: 2, borderColor: SECRET_THEME.accent },
  lockPriceText: { fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  // One soft card, no second outline inside the sheet's gold rim (art director round 2).
  fxCard: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: SECRET_THEME.card },
  fxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fxText: { flex: 1, fontFamily: FONT.display, fontSize: 17, lineHeight: 21, color: SECRET_THEME.ink },
  fxKeep: { flex: 1, fontFamily: FONT.body, fontSize: 15, color: SECRET_THEME.inkSoft },
  actions: { paddingHorizontal: 16, paddingTop: 6, gap: 6 },
  note: { textAlign: 'center', fontFamily: FONT.body, fontSize: 15, color: S.inkSoft },
  alert: { alignSelf: 'center', backgroundColor: S.alert, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2, borderColor: S.border },
  alertText: { textAlign: 'center', fontFamily: FONT.display, fontSize: 15, color: S.ink },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 },
  wish: { width: 54, height: 54, borderRadius: 27, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#ff9bbf' },
  wishOn: { borderColor: '#ff4f8b', backgroundColor: '#fff0f5' },
  // An outlined pill, so a kid sees it is a button (kids UX round 1).
  secondary: { minHeight: 48, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 24,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.75)' },
  slotLine: { fontFamily: FONT.body, fontSize: 17, lineHeight: 21, color: S.inkSoft, marginTop: -2 },
  secondaryText: { fontFamily: FONT.display, fontSize: 16, color: S.ink, textTransform: 'uppercase' },
  op: { fontFamily: FONT.display, fontSize: 22, color: S.inkSoft },
  amount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  amountText: { fontFamily: FONT.display, fontSize: 18, color: S.ink },
  amountLabel: { fontFamily: FONT.body, fontSize: 14, color: S.inkSoft },
});
