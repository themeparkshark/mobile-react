/**
 * StudioTraceHud.tsx: dev-only beat lights for the silent studio trace (wow-sound lane).
 *
 * Mounted only when studioTrace.ts is on (dev build + EXPO_PUBLIC_STUDIO_TRACE=1).
 * Three lights flash on the frame their event happens: SND (gold) when a sound
 * would start (call + delay + output latency), HAP (blue) when a haptic pulse
 * fires, MARK (white) on a choreography mark. A screen recording then shows the
 * sound, the buzz and the visual burst on the same frames, without one sound.
 * Opacity runs on the UI thread (one shared-value write per event, no per-frame JS).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { onTrace, type TraceEvent } from './studioTrace';

const FADE_MS = 180;

function Light({ v, label, color }: { v: SharedValue<number>; label: string; color: string }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.18 + v.value * 0.82, transform: [{ scale: 1 + v.value * 0.25 }] }));
  return (
    <Animated.View style={[styles.light, { backgroundColor: color }, style]}>
      <Text style={styles.lightText} allowFontScaling={false}>{label}</Text>
    </Animated.View>
  );
}

function short(e: TraceEvent): string {
  const n = e.name.replace(/^moment:/, '').replace(/#.*$/, '');
  return `${e.kind === 'sound' ? 'SND' : e.kind === 'haptic' ? 'HAP' : e.kind === 'mark' ? 'MRK' : e.kind.toUpperCase().slice(0, 3)} ${n}`.slice(0, 34);
}

export default function StudioTraceHud() {
  const snd = useSharedValue(0);
  const hap = useSharedValue(0);
  const mrk = useSharedValue(0);
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => onTrace((e) => {
    const v = e.kind === 'sound' ? snd : e.kind === 'haptic' ? hap : e.kind === 'mark' ? mrk : null;
    if (!v) return;
    v.value = 1;
    v.value = withTiming(0, { duration: FADE_MS });
    setLines((prev) => [short(e), ...prev].slice(0, 5));
  }), [snd, hap, mrk]);
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.lights}>
        <Light v={snd} label="SND" color="#f2b705" />
        <Light v={hap} label="HAP" color="#2f7fd8" />
        <Light v={mrk} label="MRK" color="#ffffff" />
      </View>
      {lines.map((l, i) => (
        <Text key={`${i}-${l}`} style={[styles.line, i === 0 && styles.lineNew]} numberOfLines={1} allowFontScaling={false}>{l}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 6, bottom: 118, width: 150, zIndex: 99999, elevation: 99999 },
  lights: { flexDirection: 'row', gap: 4, marginBottom: 3 },
  light: { width: 40, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0b2a4a' },
  lightText: { color: '#0b2a4a', fontSize: 10, fontWeight: '800' },
  line: { color: '#ffffff', fontSize: 9, backgroundColor: 'rgba(11,42,74,0.72)', paddingHorizontal: 3, marginTop: 1, borderRadius: 3, overflow: 'hidden' },
  lineNew: { backgroundColor: 'rgba(11,42,74,0.92)' },
});
