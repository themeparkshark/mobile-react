import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { playSfx } from '../gamekit/SFX';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import type { ShelfArrivalTarget } from '../hooks/useEarnedShelfArrival';

/** The same collectible settles into its measured, server-confirmed park slot. */
export default function CoinShelfArrival({ target, coinUrl, rideName, firstCollection, onLand, onInspect, onClose }: {
  target: ShelfArrivalTarget; coinUrl: string; rideName: string; firstCollection: boolean;
  onLand: () => void; onInspect: () => void; onClose: () => void;
}) {
  const reduced = useReducedGameMotion();
  const progress = useSharedValue(0);
  const [landed, setLanded] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const alive = useRef(true), completed = useRef(false);
  const callbacks = useRef({ onLand, onInspect, onClose });
  callbacks.current = { onLand, onInspect, onClose };
  const finish = () => {
    if (!alive.current || completed.current) return;
    completed.current = true; cancelAnimation(progress); progress.value = 1;
    setLanded(true); callbacks.current.onLand();
    playSfx('coin', 0.7);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelAnimation(progress); };
  }, [progress]);
  useEffect(() => {
    if (completed.current) return;
    if (reduced) { finish(); return; }
    progress.value = withTiming(1, { duration: firstCollection ? 720 : 360,
      easing: Easing.out(Easing.cubic) }, ok => { if (ok) runOnJS(finish)(); });
    const fallback = setTimeout(finish, firstCollection ? 1050 : 650);
    return () => { clearTimeout(fallback); cancelAnimation(progress); };
  }, [reduced, firstCollection, progress]);

  const size = Math.min(176, target.frameWidth * 0.46);
  const startX = (target.frameWidth - size) / 2;
  const startY = Math.min(target.frameHeight * 0.4, target.frameHeight - size - 170);
  const dx = target.x + target.width / 2 - (startX + size / 2);
  const dy = target.y + target.height / 2 - (startY + size / 2);
  const coinStyle = useAnimatedStyle(() => ({ transform: [
    { translateX: dx * progress.value },
    { translateY: dy * progress.value - (reduced ? 0 : Math.sin(progress.value * Math.PI) * 28) },
    { scale: 1 + (target.width / size - 1) * progress.value },
  ], opacity: landed ? 0 : 1 }));

  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {!landed && <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={finish}
      accessibilityRole="button" accessibilityLabel={`Place ${rideName} coin on its shelf now`} />}
    {!landed && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: startX, top: startY, width: size, height: size }, coinStyle]}>
      {!artFailed && <Image source={coinUrl} contentFit="contain" onError={() => { setArtFailed(true); finish(); }}
        style={{ width: size, height: size }} />}
    </Animated.View>}
    {landed && <View pointerEvents="none" style={[styles.slotRing, {
      left: target.x - 5, top: target.y - 5, width: target.width + 10, height: target.height + 10,
    }]} />}
    <View style={styles.caption} accessibilityLiveRegion="polite">
      <Text style={styles.eyebrow}>{landed ? 'ON YOUR PARK SHELF' : 'YOUR SOUVENIR HAS A HOME'}</Text>
      <Text style={styles.title} numberOfLines={2}>{rideName}</Text>
      <Pressable accessibilityRole="button" style={styles.primary}
        onPress={() => { finish(); callbacks.current.onInspect(); }}>
        <Text style={styles.primaryText}>View coin mastery</Text>
      </Pressable>
      <Pressable accessibilityRole="button" style={styles.secondary}
        onPress={() => { finish(); callbacks.current.onClose(); }}>
        <Text style={styles.secondaryText}>Keep exploring this shelf</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  dim: { backgroundColor: 'rgba(3,28,59,0.35)' },
  slotRing: { position: 'absolute', borderRadius: 50, borderWidth: 3, borderColor: '#FFD64B', backgroundColor: 'rgba(255,214,75,0.1)' },
  caption: { position: 'absolute', bottom: 52, left: 20, right: 20, padding: 16,
    borderRadius: 20, borderWidth: 2, borderColor: '#A6DFF5', backgroundColor: '#075083', alignItems: 'center' },
  eyebrow: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1, color: '#FFDF66', textAlign: 'center' },
  title: { fontFamily: 'Shark', fontSize: 23, color: '#FFF', textAlign: 'center', marginTop: 5, marginBottom: 12 },
  primary: { alignSelf: 'stretch', minHeight: 48, justifyContent: 'center', padding: 10,
    borderRadius: 14, backgroundColor: '#FFD34B', alignItems: 'center' },
  primaryText: { fontFamily: 'Shark', fontSize: 18, color: '#075083', textAlign: 'center' },
  secondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  secondaryText: { fontFamily: 'Knockout', fontSize: 15, color: '#DFF6FF', textAlign: 'center' },
});
