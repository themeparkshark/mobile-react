/**
 * The set payoff, full screen: the shark wearing exactly that set (its own
 * skin plus the set's pieces, on the set's backdrop when it has one) on the
 * shop stage under slow rays. The title plate stamps in and 64 pieces of
 * confetti burst from behind it. The XP bar fills with level context.
 *
 * One main action, "Wear it all" (title and look), then a green confirmed
 * state. "Just the title" is a text link and "Awesome!" dismisses.
 * Reduce Motion: no rays, stamp or confetti, a plain fade.
 */
import * as Haptics from 'expo-haptics';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { levelProgress } from '../../helpers/shopShelves';
import { isItemWorn } from '../../helpers/wardrobe';
import { PlayerType } from '../../models/player-type';
import { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { BRAND, FONT, GameIcon } from '../../ui';
import { asWearable, previewLook } from './TryOnSheet';
import { MAX_FONT, ShopStage } from './shopUi';

const { width: W, height: H } = Dimensions.get('window');
const STAGE = Math.min(W - 40, H * 0.4);
const CARD_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: '6%' as const };

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
  const [xp, setXp] = useState<{ level: number; from: number; to: number; levelUp: boolean } | null>(null);
  const color = set?.color ?? BRAND.gold;
  const startPlayer = useRef<PlayerType | null>(player ?? null);

  const pieceIds = reward?.item_ids ?? set?.item_ids ?? [];
  const pieces = useMemo(() => (set?.pieces ?? []).filter(p => pieceIds.includes(p.id)), [set, pieceIds.join(',')]);
  // Only this set's pieces, on the shark's own skin; the set's backdrop becomes the stage.
  const stage = useMemo(() => previewLook(player?.inventory, pieces.map(asWearable), 'base'), [player?.inventory?.skin_item?.id, pieces]);

  // XP with level context, from the player after the server added it.
  useEffect(() => {
    if (!reward || reward.xp <= 0) return;
    let live = true;
    void refreshPlayer().then(fresh => {
      if (!live || !fresh) return;
      const need = Number(fresh.experience_level?.experience ?? 0) || 1;
      const after = Number(fresh.experience ?? 0);
      const level = Number(fresh.experience_level?.level ?? fresh.player_level ?? 1);
      const crossed = after < reward.xp && (startPlayer.current?.experience_level?.level ?? level) < level;
      setXp(crossed ? { level, from: 0, to: after / need, levelUp: true }
        : levelProgress(level, Math.max(0, after - reward.xp), need, reward.xp));
    }).catch(() => undefined);
    return () => { live = false; };
  }, [reward?.slug]);

  const stamp = useSharedValue(still ? 1 : 1.7);
  const stampOpacity = useSharedValue(still ? 1 : 0);
  const bar = useSharedValue(0);
  const levelPulse = useSharedValue(1);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!reward) return;
    playSound(require('../../../assets/sounds/reward.mp3'));
    if (still) return;
    stampOpacity.value = withDelay(650, withTiming(1, { duration: 80 }));
    stamp.value = withDelay(650, withSpring(1, { damping: 8, stiffness: 240 }));
    const t = setTimeout(() => { setBurst(true); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined); }, 700);
    return () => clearTimeout(t);
  }, [reward?.slug]);
  useEffect(() => {
    if (!xp) return;
    bar.value = still ? xp.to : xp.from;
    if (!still) bar.value = withDelay(400, withTiming(xp.to, { duration: 900, easing: Easing.out(Easing.cubic) }));
    if (xp.levelUp && !still) levelPulse.value = withDelay(1200, withSequence(withTiming(1.3, { duration: 160 }), withSpring(1)));
  }, [xp]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value, transform: [{ scale: stamp.value }, { rotate: '-4deg' }] }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, bar.value) }] }));
  const levelStyle = useAnimatedStyle(() => ({ transform: [{ scale: levelPulse.value }] }));

  if (!reward) return null;

  const putOnLook = async () => {
    for (const piece of pieces) {
      if (!isItemWorn(player?.inventory, piece)) await updateInventory({ id: piece.id } as never);
    }
  };

  const wearAll = async () => {
    if (all === 'done' || all === 'busy') return;
    setAll('busy');
    try {
      if (reward.title) await equipShopTitle(reward.slug);
      await putOnLook();
      await refreshPlayer();
      setAll('done');
      playSound(require('../../../assets/sounds/success.mp3'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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
        <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 16 }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>SET COMPLETE</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName}>{reward.name}</Text>
          <View style={[styles.stage, { width: STAGE, height: STAGE, borderColor: color }]}>
            <ShopStage rim={color} backdropUrl={stage?.backdrop} tone="night" rays still={still}>
              {stage && <Playercard inventory={stage.look} still={still} showBackground={false} pinAnchor="body" style={CARD_STYLE} />}
            </ShopStage>
          </View>
          <View style={styles.plateWrap}>
            {burst && !still && <Confetti color={color} />}
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
            <View style={styles.xpBlock} accessible accessibilityLabel={`Plus ${reward.xp} XP${xp ? `, level ${xp.level}` : ''}`}>
              <Animated.View style={[styles.levelBadge, levelStyle]}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.levelText}>{xp ? `LV ${xp.level}` : 'LV'}</Text>
              </Animated.View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.xpTrack}><Animated.View style={[styles.xpFill, barStyle]} /></View>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpCaption}>
                  {xp ? (xp.levelUp ? `Level up! +${reward.xp} XP` : `+${reward.xp} XP: ${Math.round(xp.from * 100)}% to ${Math.round(xp.to * 100)}%`) : `+${reward.xp} XP`}
                </Text>
              </View>
            </View>
          )}
          <View style={styles.buttons}>
            <Pressable onPress={() => void wearAll()} accessibilityRole="button"
              accessibilityLabel={all === 'done' ? 'Title and look are on' : 'Wear it all: title and look'}
              style={({ pressed }) => [styles.primary, all === 'done' && styles.primaryDone, pressed && { transform: [{ scale: 0.97 }] }]}>
              <DoneIcon done={all === 'done'} still={still} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.primaryText, all === 'done' && { color: BRAND.white }]}>
                {all === 'done' ? 'All on!' : all === 'busy' ? 'Putting it on…' : all === 'failed' ? 'Try again: wear it all' : 'Wear it all'}
              </Text>
            </Pressable>
            {reward.title && all !== 'done' && (
              <Pressable onPress={() => void justTitle()} accessibilityRole="button" hitSlop={8}>
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.link}>
                  {titleOnly === 'done' ? 'Title on!' : titleOnly === 'failed' ? 'Try again: just the title' : 'Just the title'}
                </Text>
              </Pressable>
            )}
            <Pressable onPress={onDone} accessibilityRole="button" hitSlop={8}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.dismiss}>Awesome!</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function DoneIcon({ done, still }: { done: boolean; still: boolean }) {
  const s = useSharedValue(1);
  useEffect(() => { if (done && !still) s.value = withSequence(withTiming(1.5, { duration: 120 }), withSpring(1, { damping: 6 })); }, [done]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={style}><GameIcon name={done ? 'check' : 'crown'} size={28} /></Animated.View>;
}

/** 64 pieces burst from behind the title plate, then fall (one pass, nothing keeps running). */
function Confetti({ color }: { color: string }) {
  const colors = [color, BRAND.gold, BRAND.white, '#ff4f8b', BRAND.skyDeep, '#7c4dff'];
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {Array.from({ length: 64 }, (_, i) => <Bit key={i} index={i} color={colors[i % colors.length]} />)}
    </View>
  );
}

function Bit({ index, color }: { index: number; color: string }) {
  const t = useSharedValue(0);
  const angle = (index / 64) * Math.PI * 2 + (index % 5) * 0.11;
  const speed = 140 + (index % 7) * 26;
  useEffect(() => { t.value = withTiming(1, { duration: 1500 + (index % 6) * 140, easing: Easing.out(Easing.quad) }); }, []);
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: k < 0.8 ? 1 : (1 - k) * 5,
      transform: [
        { translateX: Math.cos(angle) * speed * k },
        { translateY: Math.sin(angle) * speed * k - 120 * k + 420 * k * k },
        { rotate: `${k * 720 * (index % 2 ? 1 : -1)}deg` },
      ],
    };
  });
  return <Animated.View style={[styles.bit, { backgroundColor: color, width: 7 + (index % 3) * 3 }, style]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 20, gap: 10 },
  kicker: { fontFamily: FONT.display, fontSize: 16, letterSpacing: 2, color: BRAND.goldLight },
  setName: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, textAlign: 'center' },
  stage: { borderRadius: 28, overflow: 'hidden', borderWidth: 4 },
  plateWrap: { alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  confetti: { position: 'absolute', width: 1, height: 1, left: '50%', top: '50%' },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 8, borderWidth: 3, borderColor: BRAND.white,
    shadowColor: BRAND.goldLip, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 } },
  plateText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  xpBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '86%' },
  levelBadge: { width: 50, height: 50, borderRadius: 25, backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  levelText: { fontFamily: FONT.display, fontSize: 14, color: BRAND.white },
  xpTrack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  xpFill: { height: 14, width: '100%', borderRadius: 7, backgroundColor: BRAND.gold, transformOrigin: 'left' },
  xpCaption: { fontFamily: FONT.display, fontSize: 14, color: BRAND.white },
  buttons: { width: '100%', alignItems: 'center', gap: 12, marginTop: 'auto' },
  primary: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 20,
    paddingVertical: 16, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: '#6a3b00', borderBottomWidth: 6 },
  primaryDone: { backgroundColor: BRAND.green, borderColor: BRAND.greenLip },
  primaryText: { fontFamily: FONT.display, fontSize: 24, color: '#6a3b00' },
  link: { fontFamily: FONT.display, fontSize: 16, color: BRAND.goldLight, textDecorationLine: 'underline' },
  dismiss: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white },
  bit: { position: 'absolute', top: 0, left: 0, height: 11, borderRadius: 2 },
});
