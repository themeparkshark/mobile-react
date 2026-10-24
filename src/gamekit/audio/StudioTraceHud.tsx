/**
 * StudioTraceHud.tsx: dev-only beat lights for the silent studio trace (wow-sound lane).
 *
 * Mounted only when studioTrace.ts is on (dev build + EXPO_PUBLIC_STUDIO_TRACE=1).
 * Three lights flash on the frame their event happens: SND (gold) when a sound
 * would start (call + delay + output latency), HAP (blue) when a haptic pulse
 * fires, MARK (white) on a choreography mark. A screen recording then shows the
 * sound, the buzz and the visual burst on the same frames, without one sound.
 * Opacity runs on the UI thread (one shared-value write per event, no per-frame JS).
 *
 * The PerfOverlay frame graph sits under the lights, and every UI-thread frame
 * time since the last reset is kept (sent to JS 4 times a second, about 15
 * numbers each), so a capture can read p5 fps over a whole run of catches:
 * globalThis.__studioTrace.perf() and .perfReset() over CDP.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { onTrace, type TraceEvent } from './studioTrace';
import { PerfOverlay, usePerfProbe } from '../perf/PerfOverlay';

/** Frame times (ms) since the last perfReset, capped at about 9 minutes of 60 fps. */
const FRAMES_CAP = 32_000;
const frames: number[] = [];
function addFrames(batch: number[]): void {
  for (const f of batch) if (frames.length < FRAMES_CAP) frames.push(f);
}
/** p5 fps (the slowest 5 percent of frames), average fps and the worst frame over the window. */
export function perfWindow(list: readonly number[] = frames): { frames: number; fpsP5: number; fpsAvg: number; worstMs: number; jankPct: number } {
  if (list.length === 0) return { frames: 0, fpsP5: 0, fpsAvg: 0, worstMs: 0, jankPct: 0 };
  const sorted = list.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const sum = list.reduce((a, b) => a + b, 0);
  const over = list.filter((f) => f > 25).length; // a missed 60 Hz frame
  return {
    frames: list.length,
    fpsP5: Math.round((1000 / p95) * 10) / 10,
    fpsAvg: Math.round((1000 * list.length / sum) * 10) / 10,
    worstMs: Math.round(sorted[sorted.length - 1]),
    jankPct: Math.round((over / list.length) * 1000) / 10,
  };
}
{
  const g = globalThis as unknown as { __studioTrace?: Record<string, unknown> };
  g.__studioTrace = { ...(g.__studioTrace ?? {}), perf: () => perfWindow(), perfReset: () => { frames.length = 0; return true; } };
}

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
  const probe = usePerfProbe();
  const batch = useSharedValue<number[]>([]);
  const acc = useSharedValue(0);
  useFrameCallback((info) => {
    'worklet';
    const dt = info.timeSincePreviousFrame;
    if (dt == null) return;
    batch.value.push(dt);
    acc.value += dt;
    if (acc.value >= 250) {
      acc.value = 0;
      const out = batch.value;
      batch.value = [];
      runOnJS(addFrames)(out);
    }
  });
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
      <PerfOverlay probe={probe} style={styles.perf} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Top left, under the header chips: clear of the map buttons and the footer.
  wrap: { position: 'absolute', left: 6, top: 250, width: 150, zIndex: 99999, elevation: 99999 },
  lights: { flexDirection: 'row', gap: 4, marginBottom: 3 },
  light: { width: 40, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0b2a4a' },
  lightText: { color: '#0b2a4a', fontSize: 10, fontWeight: '800' },
  line: { color: '#ffffff', fontSize: 9, backgroundColor: 'rgba(11,42,74,0.72)', paddingHorizontal: 3, marginTop: 1, borderRadius: 3, overflow: 'hidden' },
  lineNew: { backgroundColor: 'rgba(11,42,74,0.92)' },
  perf: { position: 'relative', top: 0, right: 0, marginTop: 4 },
});
