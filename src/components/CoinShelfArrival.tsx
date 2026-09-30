import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import type { ShelfArrivalTarget } from '../hooks/useEarnedShelfArrival';
import GameIcon from '../ui/GameIcon';

/**
 * The caught coin flies in an arc into its measured, server-confirmed slot.
 * On landing the slot itself ignites (squash, ring pulse, sparkles: ShelfCoin),
 * the header count ticks, and a "clink" and a light haptic land on the same
 * frame. A small caption chip replaces the old bottom-third card so the shelf
 * stays the hero. Tap anywhere to place the coin immediately.
 */
export default function CoinShelfArrival({ target, coinUrl, rideName, parkName, firstCollection, onLand, onInspect, onClose }: {
  target: ShelfArrivalTarget; coinUrl: string; rideName: string; parkName?: string | null; firstCollection: boolean;
  onLand: () => void; onInspect: () => void; onClose: () => void;
}) {
  const reduced = useReducedGameMotion();
  const progress = useSharedValue(0);
  const chip = useSharedValue(0);
  const [landed, setLanded] = useState(false);
  const alive = useRef(true), completed = useRef(false);
  const callbacks = useRef({ onLand, onInspect, onClose });
  callbacks.current = { onLand, onInspect, onClose };
  const finish = () => {
    if (!alive.current || completed.current) return;
    completed.current = true; cancelAnimation(progress); progress.value = 1;
    setLanded(true); callbacks.current.onLand();
    playSfx('coin', 0.8);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelAnimation(progress); cancelAnimation(chip); };
  }, [progress, chip]);
  useEffect(() => {
    if (completed.current) return;
    if (reduced) { chip.value = 1; finish(); return; }
    progress.value = withTiming(1, { duration: firstCollection ? 760 : 420,
      easing: Easing.inOut(Easing.cubic) }, ok => { if (ok) runOnJS(finish)(); });
    chip.value = withDelay(firstCollection ? 520 : 260, withSpring(1, { damping: 14, stiffness: 220 }));
    const fallback = setTimeout(finish, firstCollection ? 1100 : 700);
    return () => { clearTimeout(fallback); cancelAnimation(progress); };
  }, [reduced, firstCollection, progress, chip]);

  const size = Math.min(176, target.frameWidth * 0.46);
  const startX = (target.frameWidth - size) / 2;
  const startY = Math.min(target.frameHeight * 0.4, target.frameHeight - size - 170);
  const dx = target.x + target.width / 2 - (startX + size / 2);
  const dy = target.y + target.height / 2 - (startY + size / 2);
  const coinStyle = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      transform: [
        { translateX: dx * t },
        // An arc: up first, then down into the slot.
        { translateY: dy * t - (reduced ? 0 : Math.sin(t * Math.PI) * 60) },
        { rotate: `${reduced ? 0 : (1 - t) * -18}deg` },
        { scale: 1 + (target.width / size - 1) * t },
      ],
      opacity: landed ? 0 : 1,
    };
  });
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - progress.value) }));
  const chipStyle = useAnimatedStyle(() => ({
    opacity: chip.value,
    transform: [{ translateY: (1 - chip.value) * 30 }, { scale: 0.9 + chip.value * 0.1 }],
  }));

  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {!landed && <Pressable style={StyleSheet.absoluteFill} onPress={finish}
      accessibilityRole="button" accessibilityLabel={`Place ${rideName} coin on its shelf now`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
    </Pressable>}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      <Image source={coinUrl} contentFit="contain" onError={finish} style={{ width: size, height: size }} />
    </Animated.View>}
    <Animated.View style={[styles.chip, chipStyle]} accessibilityLiveRegion="polite">
      <GameIcon name="coin" size={30} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow} numberOfLines={1}>
          {landed ? 'ON YOUR SHELF' : 'YOUR SOUVENIR HAS A HOME'}
        </Text>
        <Text style={styles.title} numberOfLines={1}>{rideName}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="View coin mastery" style={styles.primary}
        onPress={() => { finish(); callbacks.current.onInspect(); }}>
        <Text style={styles.primaryText}>Mastery</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Keep exploring this shelf" hitSlop={8}
        style={styles.close} onPress={() => { finish(); callbacks.current.onClose(); }}>
        <GameIcon name="close" size={28} />
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#05346e' },
  chip: { position: 'absolute', bottom: 118, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 6, borderRadius: 18, borderWidth: 3, borderColor: '#ffffff',
    backgroundColor: '#fff8e4', shadowColor: '#05346e', shadowOpacity: 0.28, shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  eyebrow: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8, color: '#8a5a00' },
  title: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' },
  primary: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 12,
    backgroundColor: '#ffcf3b', borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  primaryText: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
