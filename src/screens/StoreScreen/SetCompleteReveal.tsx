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
 * hops the shark when done, a "Just the title" link, and "Awesome!" to dismiss.
 * Reduce Motion: no rays, stamp or confetti, a plain fade.
 */
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import { equipShopTitle } from '../../api/endpoints/me/shop-sets';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { stageCard, xpBar } from '../../helpers/shopShelves';
import { isItemWorn, slotForItem } from '../../helpers/wardrobe';
import { getLook, putLook } from '../../api/endpoints/me/look';
import { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { BRAND, FONT, GameIcon } from '../../ui';
import { asWearable, previewLook } from './TryOnSheet';
import { MAX_FONT, ShopCta, ShopStage } from './shopUi';

const { width: W, height: H } = Dimensions.get('window');
const STAGE = Math.min(W - 40, H * 0.4);
const CARD = stageCard(STAGE - 8, STAGE - 8);
const CARD_STYLE = { position: 'absolute' as const, ...CARD.box };

type Busy = 'idle' | 'busy' | 'done' | 'failed';

export default function SetCompleteReveal({ reward, set, still, onDone }: {
  readonly reward: ShopSetReward | null;
  readonly set: ShopSetSummary | null;
  readonly still: boolean;
  readonly onDone: () => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<Busy>('idle');
  const [titleOnly, setTitleOnly] = useState<Busy>('idle');
  const color = set?.color ?? BRAND.gold;
  const xp = reward ? xpBar(reward.xp_before, reward.xp_after, reward.xp) : null;

  const pieceIds = reward?.item_ids ?? set?.item_ids ?? [];
  const pieces = useMemo(() => (set?.pieces ?? []).filter(p => pieceIds.includes(p.id)), [set, pieceIds.join(',')]);
  // Only this set's pieces, on the shark's own skin; the set's backdrop becomes the stage.
  const stage = useMemo(() => previewLook(player?.inventory, pieces.map(asWearable), 'base'), [player?.inventory?.skin_item?.id, pieces]);

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
    if (still) { setShownLevel(xp?.level ?? null); return; }
    stampOpacity.value = withDelay(500, withTiming(1, { duration: 80 }));
    stamp.value = withDelay(500, withSpring(1, { damping: 8, stiffness: 240 }));
    const timers = [
      setTimeout(() => { setBurst(true); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined); }, 560),
    ];
    if (xp) {
      bar.value = withDelay(900, withTiming(xp.levelUp ? 1 : xp.to, { duration: 700, easing: Easing.out(Easing.cubic) }));
      if (xp.levelUp) {
        // Fill to the top, roll to the new level with a pop, then fill to where the player is now.
        timers.push(setTimeout(() => {
          setShownLevel(xp.level);
          playSound(require('../../../assets/sounds/firework_pop.mp3'));
          levelPulse.value = withSequence(withTiming(1.45, { duration: 160 }), withSpring(1, { damping: 6 }));
          bar.value = 0;
          bar.value = withTiming(xp.to, { duration: 500, easing: Easing.out(Easing.cubic) });
        }, 1650));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [reward?.slug]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value, transform: [{ scale: stamp.value }, { rotate: '-4deg' }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, bar.value) }] }));
  const levelStyle = useAnimatedStyle(() => ({ transform: [{ scale: levelPulse.value }] }));
  const hopStyle = useAnimatedStyle(() => ({ transform: [
    { translateY: -24 * Math.sin(Math.PI * Math.min(1, hop.value)) },
    { rotate: `${Math.sin(hop.value * Math.PI * 4) * 8 * (1 - hop.value)}deg` },
  ] }));

  if (!reward) return null;

  // Optimistic: the hop and NOW WEARING play on tap; one look save (all slots) and the title go in
  // parallel; a failure rolls back to "Try again".
  const wearAll = async () => {
    if (all === 'done' || all === 'busy') return;
    setAll('done');
    playSound(require('../../../assets/sounds/whoosh.mp3'));
    if (!still) { hop.value = 0; hop.value = withTiming(1, { duration: 640, easing: Easing.out(Easing.quad) }); }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const slots: Record<string, number> = {};
      for (const piece of pieces) {
        const slot = slotForItem({ item_type: { id: piece.item_type_id } } as never);
        if (slot && !isItemWorn(player?.inventory, piece)) slots[slot] = piece.id;
      }
      const look = Object.keys(slots).length
        ? getLook().then(current => putLook(current.version, slots)).then(async result => {
          if (result.kind === 'unsupported') {
            await Promise.all(pieces.filter(p => !isItemWorn(player?.inventory, p)).map(p => updateInventory({ id: p.id } as never)));
          } else if (result.kind !== 'saved') throw new Error(result.kind);
        })
        : Promise.resolve();
      await Promise.all([reward.title ? equipShopTitle(reward.slug) : Promise.resolve(null), look]);
      void refreshPlayer();
    } catch { setAll('failed'); }
  };

  const justTitle = async () => {
    if (titleOnly === 'busy' || !reward.title) return;
    setTitleOnly('busy');
    try { await equipShopTitle(reward.slug); await refreshPlayer(); setTitleOnly('done'); }
    catch { setTitleOnly('failed'); }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      {/* Opaque layers only (no translucent colour over navy), so the fade never mixes to mud. */}
      <Animated.View entering={FadeIn.duration(still ? 120 : 260)} style={styles.fill}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a2350' }]} />
        <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 12 }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>SET COMPLETE</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName}>{reward.name}</Text>
          <View style={[styles.stage, { width: STAGE, height: STAGE, borderColor: color }]}>
            <ShopStage rim={color} backdropUrl={stage?.backdrop} tone="night" rays still={still}>
              <Animated.View style={[StyleSheet.absoluteFill, hopStyle]}>
                {stage && <Playercard inventory={stage.look} still={still} showBackground={false} pinAnchor="body" shadow shadowAt={CARD.shadow} style={CARD_STYLE} />}
              </Animated.View>
            </ShopStage>
            {all === 'done' && (
              <Animated.View entering={still ? undefined : FadeIn.duration(160)} style={styles.wearing}>
                <Text style={styles.wearingText}>NOW WEARING</Text>
              </Animated.View>
            )}
          </View>
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
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpCaption}>
                  {xp?.levelUp && shownLevel === xp.level ? xp.caption : `+${reward.xp} XP`}</Text>
              </View>
            </View>
          )}
          <View style={styles.buttons}>
            <ShopCta label={all === 'done' ? 'All on!' : all === 'failed' ? 'Try again' : 'Wear it all'} icon="crown" width={Math.min(320, W - 48)}
              onPress={() => void wearAll()} loading={all === 'busy'} done={all === 'done'} still={still}
              accessibilityHint="Puts on the title and every piece of the set" />
            {reward.title && all !== 'done' && (
              <Pressable onPress={() => void justTitle()} accessibilityRole="button" style={styles.textButton}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.link}>
                  {titleOnly === 'done' ? 'Title on!' : titleOnly === 'failed' ? 'Try again: just the title' : 'Just the title'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={onDone} accessibilityRole="button" style={styles.textButton}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.dismiss}>Awesome!</Text>
            </Pressable>
          </View>
        </View>
        {/* Above everything (never clipped by the stage), bursting from the title plate. */}
        {burst && !still && <Confetti color={color} originY={insets.top + 20 + 90 + STAGE + 40} />}
      </Animated.View>
    </Modal>
  );
}

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
  kicker: { fontFamily: FONT.display, fontSize: 16, letterSpacing: 2, color: BRAND.goldLight },
  setName: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, textAlign: 'center' },
  stage: { borderRadius: 28, overflow: 'hidden', borderWidth: 4 },
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
  buttons: { width: '100%', alignItems: 'center', gap: 2, marginTop: 'auto' },
  textButton: { minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: FONT.display, fontSize: 16, color: BRAND.goldLight, textDecorationLine: 'underline' },
  dismiss: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white },
  bit: { position: 'absolute', top: 0, left: 0, height: 12, borderRadius: 2 },
});
