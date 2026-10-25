/**
 * The set payoff, full screen.
 *
 * - The shark wears exactly that set (its own skin plus the set's pieces), on
 *   the set's backdrop when it has one, on the shop stage under slow rays.
 * - The title plate stamps in, and 64 pieces of confetti burst from behind it
 *   (drawn above everything, falling for about three seconds).
 * - The XP bar uses the server's exact before and after, so claim-all reveals
 *   chain and a level-up pops the LV badge.
 *
 * Buttons: one chunky "WEAR IT ALL" (title and look) that turns green and
 * hops the shark when done, a "Just the title" link, and a clear second
 * button to leave without wearing anything: "Not now" (it reads "Done" once
 * something is on). Leaving is easy every way: the X in the corner, "Not now",
 * a swipe down, or Android back. The reveal fills the screen, so there is no
 * "outside" to tap: a tap in a gap between its parts never closes it (panel r1).
 * "Not now" (where the buy button was) and the swipe wait out REVEAL_GUARD_MS so
 * the buy tap carrying over never skips the reveal. Leaving while a wear is
 * saving waits for the save: it closes on success and stays open on a failure,
 * so "Try again" is seen.
 * The celebration follows the shared motion language (ui/motion.ts,
 * momentBeats 'setComplete'): the stage pops up while gold gathers behind it,
 * the shark drops onto the plinth, then the gold blooms around the stage,
 * sparkles fly, the confetti bursts, the title stamps and the XP counts up.
 * The stage is never empty: no wearable look falls back to the player's own
 * shark, and no shark at all falls back to the gold crown medal.
 * Reduce Motion: no rays, stamp or confetti, a plain fade (the gold glow
 * stays, still).
 */
import { ModalLayerContext, useModalLayer } from '../../ui/modalLayers';
import { InlineBackContext } from './inlineBack';
import FadeInOnMount from '../../ui/FadeInOnMount';
import * as Haptics from 'expo-haptics';
import { memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { equipShopTitle } from '../../api/endpoints/me/shop-sets';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { stageCard, wearAllCopy, wearAllNext, wearAllSlots, xpBar, type WearAllState } from '../../helpers/shopShelves';
import { isItemWorn, slotForItem } from '../../helpers/wardrobe';
import { getLook, putLook } from '../../api/endpoints/me/look';
import { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { BRAND, FONT, GameIcon } from '../../ui';
import { asWearable, previewLook } from './TryOnSheet';
import { MAX_FONT, REVEAL_NAVY, SHOP_SURFACE, ShopCta, ShopStage } from './shopUi';
import { wearItem } from './inventoryQueue';
import { Image } from 'expo-image';
import { GoldBurst, SparkleBurst } from '../../ui/GoldBurst';
import { DURATION, EASE, GOLD_FX, PARTICLES, SPRING, momentBeats, momentParticles, pieceSnapTimes } from '../../ui/motionEasing';
import { usePowerBudget } from '../../power';

const MEDAL = require('../../../assets/images/alex-ui/medal-gold.webp');

const { width: W, height: H } = Dimensions.get('window');
const STAGE = Math.min(W - 40, H * 0.4);
// The WEAR IT ALL hop lifts the shark HOP pt (and tilts it): the card leaves room above the
// tallest hat so the head never clips at the top of the hop.
const HOP = 24;
const CARD = stageCard(STAGE - 8, STAGE - 8, HOP + 6);
const CARD_STYLE = { position: 'absolute' as const, ...CARD.box };

type Busy = 'idle' | 'busy' | 'done' | 'failed';

/** The XP bar and its count start this long after the burst (together). */
const XP_AFTER_BURST = 150;

/** A tap or swipe this soon after the reveal opens is the buy tap carrying over: ignored. */
export const REVEAL_GUARD_MS = 900;
/** A downward swipe this long (or a fast flick) closes the reveal. */
export const SWIPE_CLOSE_DY = 140;
/** A flick this fast (pt/ms) closes too, but only after at least SWIPE_MIN_DY. */
export const SWIPE_FLICK_VY = 1.4;
export const SWIPE_MIN_DY = 60;

/** Does this downward drag close the reveal? Mostly vertical, long enough or a real flick. */
export function swipeCloses(dy: number, dx: number, vy: number): boolean {
  if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 2) return false;
  return dy > SWIPE_CLOSE_DY || (vy > SWIPE_FLICK_VY && dy > SWIPE_MIN_DY);
}

/** The leave button: "Not now" until something is on, then "Done". */
export function leaveLabel(wornAll: boolean, titleOn: boolean): string {
  return wornAll || titleOn ? 'Done' : 'Not now';
}


export default function SetCompleteReveal({ reward, set, still, onDone, onShown, bridged = false, inline = false }: {
  readonly reward: ShopSetReward | null;
  readonly set: ShopSetSummary | null;
  readonly still: boolean;
  readonly onDone: () => void;
  /** The reveal is on screen (the shelf drops its hand-off cover). */
  readonly onShown?: () => void;
  /** Coming straight from the buy over a navy cover: show at once, no fade. */
  readonly bridged?: boolean;
  /** Drawn inside the try-on's own modal (TryOnSheet handOff), not a modal of its own: no modal swap. */
  readonly inline?: boolean;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  // A sheet layer: dialogs and the grown-up gate wait until it is gone (ui/modalLayers.ts).
  useModalLayer(true, 'show');
  const [all, setAll] = useState<WearAllState>('idle');
  const allCopy = wearAllCopy(all);
  const [titleOnly, setTitleOnly] = useState<Busy>('idle');
  const color = set?.color ?? BRAND.gold;
  const xp = reward ? xpBar(reward.xp_before, reward.xp_after, reward.xp) : null;

  const pieceIds = reward?.item_ids ?? set?.item_ids ?? [];
  const pieces = useMemo(() => (set?.pieces ?? []).filter(p => pieceIds.includes(p.id)), [set, pieceIds.join(',')]);
  const beats = momentBeats('setComplete', { reduced: still });
  // The backdrop lands first, then each piece snaps onto the shark, one beat each, before the bloom.
  const snapOrder = useMemo(() => [...pieces].sort((a, b) => Number(isBackdrop(b)) - Number(isBackdrop(a))), [pieces]);
  const snapTimes = useMemo(() => pieceSnapTimes(snapOrder.length, beats), [snapOrder.length, beats.fx]);
  const [snapped, setSnapped] = useState(() => (snapTimes.length ? 0 : snapOrder.length));
  // Only this set's pieces, on the shark's own skin; the set's backdrop becomes the stage.
  // Never an empty plinth: no set look (no skin art yet) falls back to the player's own look.
  const stage = useMemo(() => previewLook(player?.inventory, snapOrder.slice(0, snapped).map(asWearable), 'base')
    ?? previewLook(player?.inventory, [], 'player'), [player?.inventory?.skin_item?.id, snapOrder, snapped]);
  const budget = usePowerBudget();
  const snap = useSharedValue(1);
  const gold = useSharedValue(still ? 1 : 0);
  const bloom = useSharedValue(0);
  const sparkle = useSharedValue(0);
  const pop = useSharedValue(still ? 1 : 0.82);
  const drop = useSharedValue(still ? 1 : 0);

  const stamp = useSharedValue(still ? 1 : 1.7);
  const stampOpacity = useSharedValue(still ? 1 : 0);
  const bar = useSharedValue(still && xp ? xp.to : xp?.from ?? 0);
  const levelPulse = useSharedValue(1);
  const hop = useSharedValue(0);
  const [burst, setBurst] = useState(false);
  const [shownLevel, setShownLevel] = useState(xp ? (xp.levelUp ? xp.level - 1 : xp.level) : null);

  useEffect(() => {
    if (!reward) return;
    playSound(require('../../../assets/sounds/reward.mp3'));
    if (still) { setShownLevel(xp?.level ?? null); setSnapped(snapOrder.length); return; }
    // 1. Anticipation: the stage pops up and the gold gathers behind it; the shark drops in.
    pop.value = withSpring(1, SPRING.pop);
    gold.value = withSequence(withTiming(0.4, { duration: beats.anticipation, easing: EASE.charge }),
      withDelay(DURATION.hitStop, withTiming(1, { duration: 200, easing: EASE.out })));
    drop.value = withDelay(120, withSpring(1, SPRING.land));
    // 2-3. Burst: bloom, sparkles, confetti and the heavy haptic on one frame; the title stamps.
    bloom.value = withDelay(beats.burstAt, withSequence(withTiming(1, { duration: 140, easing: EASE.out }),
      withTiming(0, { duration: DURATION.bloom, easing: EASE.out })));
    sparkle.value = withDelay(beats.burstAt, withTiming(1, { duration: DURATION.sparkle }));
    stampOpacity.value = withDelay(beats.labelAt, withTiming(1, { duration: 80 }));
    stamp.value = withDelay(beats.labelAt, withSpring(1, SPRING.stamp));
    const timers = [
      setTimeout(() => { setBurst(true); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined); }, beats.burstAt),
    ];
    // Each piece snaps on with a squash and a light tap (the last one a medium tap).
    snapTimes.forEach((ms, i) => timers.push(setTimeout(() => {
      setSnapped(i + 1);
      snap.value = withSequence(withTiming(1.07, { duration: 70, easing: EASE.out }), withSpring(1, SPRING.stamp));
      void Haptics.impactAsync(i === snapTimes.length - 1 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light)
        .catch(() => undefined);
    }, ms)));
    // 4. The XP counts up with the bar on the UI thread (XpCount), so nothing re-renders on the burst frame.
    if (xp) {
      bar.value = withDelay(beats.burstAt + XP_AFTER_BURST, withTiming(xp.levelUp ? 1 : xp.to, { duration: 700, easing: Easing.out(Easing.cubic) }));
      if (xp.levelUp) {
        // Fill to the top, roll to the new level with a pop, then fill to where the player is now.
        timers.push(setTimeout(() => {
          setShownLevel(xp.level);
          playSound(require('../../../assets/sounds/firework_pop.mp3'));
          levelPulse.value = withSequence(withTiming(1.45, { duration: 160 }), withSpring(1, { damping: 6 }));
          bar.value = 0;
          bar.value = withTiming(xp.to, { duration: 500, easing: Easing.out(Easing.cubic) });
        }, beats.burstAt + XP_AFTER_BURST + 750));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [reward?.slug]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value, transform: [{ scale: stamp.value }, { rotate: '-4deg' }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, bar.value) }] }));
  const levelStyle = useAnimatedStyle(() => ({ transform: [{ scale: levelPulse.value }] }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const snapStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 2 - snap.value }, { scaleY: snap.value }] }));
  const dropStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 3),
    transform: [{ translateY: (1 - drop.value) * -60 }, { scaleY: 0.9 + 0.1 * Math.min(1, drop.value) }],
  }));
  const hopStyle = useAnimatedStyle(() => ({ transform: [
    { translateY: -HOP * Math.sin(Math.PI * Math.min(1, hop.value)) },
    { rotate: `${Math.sin(hop.value * Math.PI * 4) * 8 * (1 - hop.value)}deg` },
  ] }));

  // Close paths share one guard: the X, Not now and Android back always work; a stray
  // backdrop tap or swipe in the first REVEAL_GUARD_MS is the buy tap carrying over.
  const openedAt = useRef(Date.now());
  useEffect(() => { openedAt.current = Date.now(); }, [reward?.slug]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // Saves in flight (WEAR IT ALL, Just the title). Leaving waits for them (see the header).
  const saving = useRef(0);
  const leaveAfterSave = useRef(false);
  const [waiting, setWaiting] = useState(false);
  const leave = (guarded: boolean) => {
    if (guarded && Date.now() - openedAt.current < REVEAL_GUARD_MS) return;
    void Haptics.selectionAsync().catch(() => undefined);
    if (saving.current > 0) { leaveAfterSave.current = true; setWaiting(true); return; }
    doneRef.current();
  };
  const settle = (ok: boolean) => {
    saving.current = Math.max(0, saving.current - 1);
    if (saving.current > 0) return;
    if (ok && leaveAfterSave.current) { doneRef.current(); return; }
    leaveAfterSave.current = false;
    setWaiting(false);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 16 && Math.abs(g.dy) > Math.abs(g.dx) * 2,
    onPanResponderRelease: (_e, g) => { if (swipeCloses(g.dy, g.dx, g.vy)) leaveRef.current(true); },
  })).current;

  if (!reward) return null;

  // Optimistic: the hop and NOW WEARING play on tap; one look save (all slots) and the title go in
  // parallel; a failure rolls back to "Try again".
  const wearAll = async () => {
    if (all === 'done') return;
    setAll(s => wearAllNext(s, 'tap'));
    playSound(require('../../../assets/sounds/whoosh.mp3'));
    if (!still) { hop.value = 0; hop.value = withTiming(1, { duration: 640, easing: Easing.out(Easing.quad) }); }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    saving.current += 1;
    try {
      const slots = wearAllSlots(pieces.map(p => ({ id: p.id, worn: isItemWorn(player?.inventory, p),
        slot: slotForItem({ item_type: { id: p.item_type_id } } as never) })));
      const look = Object.keys(slots).length
        ? getLook().then(current => putLook(current.version, slots)).then(async result => {
          if (result.kind === 'unsupported') {
            // Older servers: one piece at a time, in order (inventory writes race otherwise).
            for (const id of Object.values(slots)) await wearItem({ id });
          } else if (result.kind !== 'saved') throw new Error(result.kind);
        })
        : Promise.resolve();
      await Promise.all([reward.title ? equipShopTitle(reward.slug) : Promise.resolve(null), look]);
      void refreshPlayer();
      settle(true);
    } catch { setAll(s => wearAllNext(s, 'fail')); settle(false); }
  };

  const justTitle = async () => {
    if (titleOnly === 'busy' || !reward.title) return;
    setTitleOnly('busy');
    saving.current += 1;
    try { await equipShopTitle(reward.slug); await refreshPlayer(); setTitleOnly('done'); settle(true); }
    catch { setTitleOnly('failed'); settle(false); }
  };

  return (
    <RevealLayer inline={inline} onClose={() => leave(false)} onShown={onShown}>
      {/* Opaque layers only (no translucent colour over navy), so the fade never mixes to mud. */}
      {/* Inline (over the try-on) and queued or recovered (over the shop): the same quick cross-fade. Bridged (over the navy cover): at once. */}
      <FadeInOnMount duration={DURATION.base} instant={still || bridged} style={styles.fill} {...swipe.panHandlers}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: REVEAL_NAVY }]} />
        <Pressable onPress={() => leave(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"
          style={[styles.close, { top: insets.top + 10 }]}>
          <GameIcon name="close" size={40} />
        </Pressable>
        <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 12 }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>SET COMPLETE</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName}>{reward.name}</Text>
          <Animated.View style={[{ width: STAGE, height: STAGE, alignItems: 'center', justifyContent: 'center' }, popStyle]}>
          {/* The gold blooms around the stage frame (behind it). */}
          <View pointerEvents="none" style={styles.burstWrap}>
            <GoldBurst size={STAGE * 2.3} amount={gold} bloom={bloom} reduced={still} />
          </View>
          <View style={[styles.stage, { width: STAGE, height: STAGE, borderColor: color }]}>
            <ShopStage rim={color} backdropUrl={stage?.backdrop} tone="night" rays={GOLD_FX.rays} still={still}>
              <Animated.View style={[StyleSheet.absoluteFill, dropStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, snapStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, hopStyle]}>
                {stage
                  ? <Playercard inventory={stage.look} still={still} showBackground={false} pinAnchor="body" shadow shadowAt={CARD.shadow} liftRoom={CARD.box.top} style={CARD_STYLE} />
                  : (
                    <View style={styles.medalWrap} accessible accessibilityLabel={`${reward.name} set badge`}>
                      <Image source={MEDAL} style={{ width: STAGE * 0.5, height: STAGE * 0.5 }} contentFit="contain" transition={0} />
                      <View style={styles.medalCrown}><GameIcon name="crown" size={STAGE * 0.2} /></View>
                    </View>
                  )}
              </Animated.View>
              </Animated.View>
              </Animated.View>
            </ShopStage>
            {allCopy.wearing && (
              <FadeInOnMount duration={160} instant={still} style={styles.wearing}>
                <Text style={styles.wearingText}>NOW WEARING</Text>
              </FadeInOnMount>
            )}
          </View>
          {!still && <SparkleBurst progress={sparkle} radius={STAGE * 0.72} count={momentParticles(PARTICLES.sparkles, budget, still)} />}
          </Animated.View>
          {/* Inside the content and before the plate: it bursts from behind the title, never over it. */}
          {burst && !still && <Confetti color={color} originY={insets.top + 20 + 90 + STAGE + 40} />}
          <View style={styles.plateWrap}>
            {reward.title && (
              <Animated.View style={stampStyle} accessible accessibilityLabel={`New title: ${reward.title}`}>
                <View style={styles.plate}>
                  <GameIcon name="crown" size={22} />
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.plateText}>{reward.title}</Text>
                </View>
              </Animated.View>
            )}
          </View>
          {reward.xp > 0 && (
            <View style={styles.xpBlock} accessible accessibilityLabel={xp ? (xp.levelUp ? `Level up! Level ${xp.level}. Plus ${reward.xp} XP` : `Plus ${reward.xp} XP, level ${xp.level}`) : `Plus ${reward.xp} XP`}>
              <Animated.View style={[styles.levelBadge, levelStyle, xp?.levelUp && shownLevel === xp.level && styles.levelBadgeUp]}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.levelText}>{shownLevel ? `LV ${shownLevel}` : 'LV'}</Text>
              </Animated.View>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={styles.xpTrack}><Animated.View style={[styles.xpFill, barStyle]} /></View>
                {/* The caption follows the badge: "+160 XP" until the level rolls, then "Level up!". */}
                {xp?.levelUp && shownLevel === xp.level
                  ? <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpCaption}>{xp.caption}</Text>
                  : <XpCount xp={reward.xp} still={still} delay={beats.burstAt + XP_AFTER_BURST} />}
              </View>
            </View>
          )}
          <View style={styles.buttons}>
            {allCopy.note && (
              <View style={styles.alert} accessibilityLiveRegion="polite"><Text maxFontSizeMultiplier={MAX_FONT} style={styles.alertText}>{allCopy.note}</Text></View>
            )}
            <ShopCta label={allCopy.label} icon="crown" width={Math.min(320, W - 48)}
              onPress={() => void wearAll()} done={all === 'done'} still={still}
              accessibilityHint="Puts on the title and every piece of the set" />
            {reward.title && all !== 'done' && (
              <Pressable onPress={() => void justTitle()} accessibilityRole="button" style={styles.textButton}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.link}>
                  {titleOnly === 'done' ? 'Title on!' : titleOnly === 'failed' ? 'Try again: just the title' : 'Just the title'}
                </Text>
              </Pressable>
            )}
            {/* Leave without wearing anything: a real button, not a link (Dustin: "tap off easier"). */}
            <Pressable onPress={() => leave(true)} disabled={waiting} accessibilityRole="button"
              accessibilityHint={all === 'done' || titleOnly === 'done' ? 'Closes the reveal' : 'Closes without wearing anything'}
              style={({ pressed }) => [styles.leave, { width: Math.min(320, W - 48) }, pressed && styles.leavePressed]}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.leaveText}>{waiting ? 'Saving...' : leaveLabel(all === 'done', titleOnly === 'done')}</Text>
            </Pressable>
          </View>
        </View>
      </FadeInOnMount>
    </RevealLayer>
  );
}

/** Its own modal, or (inline) a full-screen layer inside the modal it was handed off from. */
function RevealLayer({ inline, onClose, onShown, children }: {
  readonly inline: boolean; readonly onClose: () => void; readonly onShown?: () => void; readonly children: ReactNode;
}) {
  const shown = useRef(onShown);
  shown.current = onShown;
  useEffect(() => { if (inline) shown.current?.(); }, [inline]);
  // Inline: Android back reaches the host modal, which routes it here (see InlineBackContext).
  const back = useContext(InlineBackContext);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!inline || !back) return undefined;
    const fn = () => close.current();
    back.current = fn;
    return () => { if (back.current === fn) back.current = null; };
  }, [inline, back]);
  if (inline) return <View style={StyleSheet.absoluteFill}>{children}</View>;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} onShow={onShown} statusBarTranslucent>
      <ModalLayerContext.Provider value>{children}</ModalLayerContext.Provider>
    </Modal>
  );
}

function isBackdrop(piece: { item_type_id?: number | null }): boolean {
  return slotForItem({ item_type: { id: piece.item_type_id } } as never) === 'background_item';
}

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/**
 * "+160 XP", counted up on the UI thread from the moment the bar starts (no React render per
 * step, so the burst frame stays free). Starts a little above zero: never "+0 XP".
 */
export const XpCount = memo(function XpCount({ xp, still, delay }: { readonly xp: number; readonly still: boolean; readonly delay: number }) {
  const floor = Math.max(1, Math.round(xp * 0.1));
  const shown = useSharedValue(still ? xp : floor);
  useEffect(() => {
    shown.value = still ? xp : withDelay(delay, withTiming(xp, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [xp, still, delay]);
  const props = useAnimatedProps(() => {
    const text = `+${Math.max(1, Math.round(shown.value))} XP`;
    return { text, defaultValue: text } as never;
  });
  return <AnimatedInput editable={false} underlineColorAndroid="transparent" animatedProps={props} pointerEvents="none"
    defaultValue={`+${still ? xp : floor} XP`} maxFontSizeMultiplier={MAX_FONT} style={[styles.xpCaption, styles.xpInput]} />;
});

/** 64 pieces burst from behind the title plate, then fall (one pass, nothing keeps running). */
function Confetti({ color, originY }: { color: string; originY: number }) {
  const colors = [color, BRAND.gold, BRAND.white, '#ff4f8b', BRAND.skyDeep, '#7c4dff'];
  return (
    <View pointerEvents="none" style={[styles.confetti, { top: originY }]}>
      {Array.from({ length: 64 }, (_, i) => <Bit key={i} index={i} color={colors[i % colors.length]} />)}
    </View>
  );
}

function Bit({ index, color }: { index: number; color: string }) {
  const t = useSharedValue(0);
  const angle = -Math.PI / 2 + ((index / 64) - 0.5) * Math.PI * 1.6;
  const speed = 160 + (index % 7) * 34;
  useEffect(() => { t.value = withTiming(1, { duration: 2600 + (index % 6) * 160, easing: Easing.out(Easing.quad) }); }, []);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: k < 0.85 ? 1 : (1 - k) * 6.6,
      transform: [
        { translateX: Math.cos(angle) * speed * k },
        { translateY: Math.sin(angle) * speed * 1.6 * k + 520 * k * k },
        { rotate: `${k * 900 * (index % 2 ? 1 : -1)}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.bit, { backgroundColor: color, width: 8 + (index % 3) * 4 }, style]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 20, gap: 10 },
  kicker: { fontFamily: FONT.display, fontSize: 16, letterSpacing: 2, color: BRAND.goldLight, zIndex: 2 },
  setName: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, textAlign: 'center', zIndex: 2 },
  stage: { borderRadius: 28, overflow: 'hidden', borderWidth: 4 },
  burstWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  medalWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: '12%' },
  medalCrown: { position: 'absolute', alignItems: 'center', justifyContent: 'center', top: 0, bottom: '12%', left: 0, right: 0 },
  wearing: { position: 'absolute', left: 12, top: 12, backgroundColor: BRAND.green, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 2, borderColor: BRAND.white, transform: [{ rotate: '-6deg' }] },
  wearingText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.white, letterSpacing: 1 },
  plateWrap: { alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  confetti: { position: 'absolute', left: '50%', width: 1, height: 1 },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 8, borderWidth: 3, borderColor: BRAND.white,
    shadowColor: BRAND.goldLip, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 } },
  plateText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  xpBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '86%' },
  levelBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  levelBadgeUp: { backgroundColor: BRAND.gold },
  levelText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  xpTrack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  xpFill: { height: 14, width: '100%', borderRadius: 7, backgroundColor: BRAND.gold, transformOrigin: 'left' },
  xpCaption: { fontFamily: FONT.display, fontSize: 16, color: BRAND.white },
  xpInput: { padding: 0, margin: 0 },
  alert: { backgroundColor: SHOP_SURFACE.alert, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 2, borderColor: BRAND.white, marginBottom: 6 },
  alertText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white, textAlign: 'center' },
  buttons: { width: '100%', alignItems: 'center', gap: 4, marginTop: 'auto' },
  close: { position: 'absolute', right: 14, zIndex: 3 },
  leave: { minHeight: 52, borderRadius: 18, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center',
    justifyContent: 'center', marginTop: 4 },
  leavePressed: { transform: [{ scale: 0.97 }], backgroundColor: 'rgba(255,255,255,0.08)' },
  leaveText: { fontFamily: FONT.display, fontSize: 20, color: BRAND.white, letterSpacing: 0.5 },
  textButton: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: FONT.display, fontSize: 16, color: BRAND.goldLight, textDecorationLine: 'underline' },
  bit: { position: 'absolute', top: 0, left: 0, height: 12, borderRadius: 2 },
});
