/**
 * The set payoff: full screen, the player's shark wearing the whole set on a
 * lit stage, the title nameplate stamping in, the XP bar filling and confetti
 * in the set colour. "Wear my title" and "Wear the whole look" act in place
 * and say so. Reduce Motion: no confetti, no stamp, a plain fade.
 */
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import updateInventory from '../../api/endpoints/me/inventory/update-inventory';
import { equipShopTitle } from '../../api/endpoints/me/shop-sets';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { isItemWorn } from '../../helpers/wardrobe';
import { ShopSetReward, ShopSetSummary } from '../../models/shop-today';
import { BRAND, FONT, GameButton, GameIcon } from '../../ui';
import { previewLook } from './TryOnSheet';
import { MAX_FONT } from './shopUi';

const { width: W, height: H } = Dimensions.get('window');
const STAGE = Math.min(W - 40, H * 0.42);

export default function SetCompleteReveal({ reward, set, still, onDone }: {
  readonly reward: ShopSetReward | null;
  readonly set: ShopSetSummary | null;
  readonly still: boolean;
  readonly onDone: () => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [lookState, setLookState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const color = set?.color ?? BRAND.gold;

  const pieces = useMemo(() => (set?.pieces ?? []).filter(p => (reward?.item_ids ?? set?.item_ids ?? []).includes(p.id)), [set, reward]);
  const look = useMemo(() => previewLook(player?.inventory, pieces.map(p => ({ id: p.id, name: p.name, icon_url: p.icon_url,
    paper_url: p.paper_url, no_eye_url: p.no_eye_url, item_type: { id: p.item_type_id } }))), [player?.inventory, pieces]);

  const stamp = useSharedValue(still ? 1 : 1.7);
  const stampOpacity = useSharedValue(still ? 1 : 0);
  const xp = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!reward) return;
    playSound(require('../../../assets/sounds/reward.mp3'));
    if (still) return;
    stampOpacity.value = withDelay(650, withTiming(1, { duration: 80 }));
    stamp.value = withDelay(650, withSpring(1, { damping: 8, stiffness: 240 }));
    xp.value = withDelay(1100, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    const thump = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined), 720);
    return () => clearTimeout(thump);
  }, [reward?.slug]);
  const stampStyle = useAnimatedStyle(() => ({ opacity: stampOpacity.value, transform: [{ scale: stamp.value }, { rotate: '-4deg' }] }));
  const xpStyle = useAnimatedStyle(() => ({ width: `${Math.round(xp.value * 100)}%` }));

  if (!reward) return null;

  const wearTitle = async () => {
    setTitle('busy');
    try {
      await equipShopTitle(reward.slug);
      await refreshPlayer();
      setTitle('done');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch { setTitle('failed'); }
  };

  const wearLook = async () => {
    setLookState('busy');
    try {
      // Put on every piece that isn't already worn (PUT /me/inventory toggles one item).
      for (const piece of pieces) {
        if (!isItemWorn(player?.inventory, piece)) await updateInventory({ id: piece.id } as never);
      }
      await refreshPlayer();
      setLookState('done');
      playSound(require('../../../assets/sounds/whoosh.mp3'));
    } catch { setLookState('failed'); }
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(still ? 120 : 260)} style={styles.fill}>
        <LinearGradient colors={['#0b2a5e', '#05346e', '#0a1d3f']} style={StyleSheet.absoluteFill} />
        <View pointerEvents="none" style={styles.beam} />
        {!still && <Confetti color={color} />}
        <View style={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.kicker}>SET COMPLETE</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setName}>{reward.name}</Text>
          <View style={[styles.stage, { width: STAGE, height: STAGE }]}>
            <View style={[styles.spot, { backgroundColor: color }]} />
            <View style={styles.floor} />
            {look && <Playercard inventory={look} still={still} popLayers showBackground={false} style={{ position: 'absolute', width: '100%', height: '100%' }} />}
          </View>
          {reward.title && (
            <Animated.View style={stampStyle} accessible accessibilityLabel={`New title: ${reward.title}`}>
              <View style={styles.plate}>
                <GameIcon name="crown" size={22} />
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.plateText}>{reward.title}</Text>
              </View>
            </Animated.View>
          )}
          {reward.xp > 0 && (
            <View style={styles.xpRow} accessible accessibilityLabel={`Plus ${reward.xp} XP`}>
              <GameIcon name="xp" size={22} />
              <View style={styles.xpTrack}><Animated.View style={[styles.xpFill, xpStyle]} /></View>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpText}>+{reward.xp} XP</Text>
            </View>
          )}
          <View style={styles.buttons}>
            {reward.title && (
              <GameButton label={title === 'done' ? 'Title on!' : title === 'failed' ? 'Try again: wear my title' : 'Wear my title'}
                icon={title === 'done' ? 'check' : 'crown'} onPress={() => { if (title !== 'done') void wearTitle(); }} loading={title === 'busy'} />
            )}
            {pieces.length > 0 && (
              <GameButton label={lookState === 'done' ? 'Look on!' : lookState === 'failed' ? 'Try again: wear the look' : 'Wear the whole look'}
                icon={lookState === 'done' ? 'check' : 'shark'} variant="secondary" onPress={() => { if (lookState !== 'done') void wearLook(); }} loading={lookState === 'busy'} />
            )}
            <GameButton label="Awesome!" variant="ghost" tone="onBlue" onPress={onDone} />
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** 28 pieces of confetti, one fall each (no loop, nothing left running). */
function Confetti({ color }: { color: string }) {
  const colors = [color, BRAND.gold, BRAND.white, '#ff4f8b', BRAND.skyDeep];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 28 }, (_, i) => <Bit key={i} index={i} color={colors[i % colors.length]} />)}
    </View>
  );
}

function Bit({ index, color }: { index: number; color: string }) {
  const y = useSharedValue(-40);
  const spin = useSharedValue(0);
  const x = ((index * 37) % 100) / 100 * W;
  useEffect(() => {
    const delay = 500 + (index % 7) * 90;
    y.value = withDelay(delay, withTiming(H + 40, { duration: 2200 + (index % 5) * 300, easing: Easing.in(Easing.quad) }));
    spin.value = withDelay(delay, withTiming(4 + (index % 3), { duration: 2400 }));
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${spin.value * 180}deg` }] }));
  return <Animated.View style={[styles.bit, { left: x, backgroundColor: color, width: 8 + (index % 3) * 3 }, style]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  beam: { position: 'absolute', alignSelf: 'center', top: H * 0.12, width: W * 1.1, height: W * 1.1, borderRadius: W, opacity: 0.12, backgroundColor: '#ffffff' },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: 20, gap: 10 },
  kicker: { fontFamily: FONT.display, fontSize: 16, letterSpacing: 2, color: BRAND.goldLight },
  setName: { fontFamily: FONT.display, fontSize: 34, color: BRAND.white, textAlign: 'center' },
  stage: { alignItems: 'center', justifyContent: 'center' },
  spot: { position: 'absolute', top: 0, width: '90%', height: '90%', borderRadius: 999, opacity: 0.75 },
  floor: { position: 'absolute', bottom: 10, width: '55%', height: 28, borderRadius: 99, backgroundColor: 'rgba(0,0,0,0.28)' },
  plate: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 8, borderWidth: 3, borderColor: BRAND.white,
    shadowColor: BRAND.goldLip, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: 4 } },
  plateText: { fontFamily: FONT.display, fontSize: 24, color: BRAND.navy },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '80%' },
  xpTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  xpFill: { height: 12, borderRadius: 6, backgroundColor: BRAND.gold },
  xpText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white },
  buttons: { width: '100%', gap: 8, marginTop: 'auto' },
  bit: { position: 'absolute', top: 0, height: 12, borderRadius: 2 },
});
