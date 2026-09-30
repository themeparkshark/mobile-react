/**
 * EmoteBar: eight of Alex's stickers, one tap each, thumb height. The server
 * allows one sticker per 1.5 s; the bar shows that as a sweeping cooldown so a
 * tap never feels ignored. EmotePop: a sticker bursting out over a racer.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '../Haptics';
import { playSfx } from '../SFX';
import { BRAND } from '../../ui/tokens';
import { EMOTES, type EmoteId } from '../net/partyTypes';
import { STICKERS, STICKER_LABEL } from './partyArt';

export const EMOTE_COOLDOWN_MS = 1500;

function StickerButton({ id, disabled, onPress }: { id: EmoteId; disabled: boolean; onPress: (id: EmoteId) => void }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={STICKER_LABEL[id]}
      disabled={disabled}
      hitSlop={4}
      onPressIn={() => { scale.value = withTiming(0.82, { duration: 60 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 8, stiffness: 400 }); }}
      onPress={() => onPress(id)}
      style={styles.slot}
    >
      <Animated.View style={[styles.slotFace, disabled && styles.slotCooling, style]}>
        <Image source={STICKERS[id]} style={styles.sticker} resizeMode="contain" />
      </Animated.View>
    </Pressable>
  );
}

function EmoteBar({ onSend }: { onSend: (id: EmoteId) => void }) {
  const [cooling, setCooling] = useState(false);
  const sweep = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const send = useCallback((id: EmoteId) => {
    if (cooling) return;
    haptic('tapLight');
    playSfx('tap', 0.6);
    onSend(id);
    setCooling(true);
    sweep.value = 1;
    sweep.value = withTiming(0, { duration: EMOTE_COOLDOWN_MS, easing: Easing.linear });
    timer.current = setTimeout(() => setCooling(false), EMOTE_COOLDOWN_MS);
  }, [cooling, onSend, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({ width: `${sweep.value * 100}%` }));

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        {EMOTES.map((id) => <StickerButton key={id} id={id} disabled={cooling} onPress={send} />)}
      </View>
      <View style={styles.track}><Animated.View style={[styles.sweep, sweepStyle]} /></View>
    </View>
  );
}

export default memo(EmoteBar);

/** A sticker that bursts out over a racer: 0 -> 1.15 -> 1, float up, fade. */
export const EmotePop = memo(function EmotePop({ emote, size = 44 }: { emote: EmoteId; size?: number }) {
  const s = useSharedValue(0);
  const y = useSharedValue(0);
  const o = useSharedValue(1);
  useEffect(() => {
    s.value = withSequence(withTiming(1.15, { duration: 140, easing: Easing.out(Easing.back(2)) }), withSpring(1, { damping: 10, stiffness: 300 }));
    y.value = withDelay(300, withTiming(-26, { duration: 1700, easing: Easing.out(Easing.cubic) }));
    o.value = withDelay(1900, withTiming(0, { duration: 350 }));
  }, [emote, o, s, y]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.pop, { width: size, height: size }, style]}>
      <Image source={STICKERS[emote]} style={{ width: size, height: size }} resizeMode="contain" />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bar: {
    backgroundColor: BRAND.blueBright,
    borderColor: BRAND.navy,
    borderWidth: 3,
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 5,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  slot: { width: '12.5%', alignItems: 'center' },
  slotFace: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND.cream,
    borderColor: BRAND.navy,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCooling: { opacity: 0.55 },
  sticker: { width: 32, height: 32 },
  track: { height: 4, marginTop: 5, marginHorizontal: 10, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  sweep: { height: 4, backgroundColor: BRAND.gold },
  pop: { position: 'absolute', top: -34, alignSelf: 'center' },
});
