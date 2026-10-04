import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { FxPart, RigProps } from '../FxStage';
import { FX_GEOMETRY, phaseOf, windowOf } from '../registry';

const G = FX_GEOMETRY.rigs.midway_fireworks;
export const BACKDROP = require('../../../assets/fx/backdrop.jpg');
const ART: Record<string, number> = {
  'burst-gold.png': require('../../../assets/fx/burst-gold.png'),
  'burst-pink.png': require('../../../assets/fx/burst-pink.png'),
};

/** Shell timing: launch, burst, fade. Phase windows of each shell's own period. */
const LAUNCH = 0.18;
const BURST = 0.42;
export const FINALE_PERIOD = 9000;

type Shell = { file: string; cx: number; cy: number; w: number; period: number; offset: number; finale?: boolean };

/** The steady shells (geometry.json bursts) plus a 3-shell finale every 9 s. */
export const SHELLS: Shell[] = [
  ...G.bursts.map((b, i) => ({ ...b, period: [3100, 3700, 4300, 5200][i] ?? 4000, offset: [0.55, 0.1, 0.8, 0.35][i] ?? 0 })),
  { file: 'burst-pink.png', cx: 0.32, cy: 0.07, w: 0.16, period: FINALE_PERIOD, offset: 0.7, finale: true },
  { file: 'burst-gold.png', cx: 0.7, cy: 0.27, w: 0.14, period: FINALE_PERIOD, offset: 0.66, finale: true },
  { file: 'burst-gold.png', cx: 0.92, cy: 0.33, w: 0.12, period: FINALE_PERIOD, offset: 0.62, finale: true },
];

/** Where a shell is in its life at time t: launch progress, burst progress, or idle (-1, -1). */
export function shellAt(t: number, period: number, offset: number, finale: boolean): { launch: number; burst: number } {
  'worklet';
  const p = phaseOf(t, period, offset);
  // Finale shells use only the first part of their 9 s period.
  const scale = finale ? 0.33 : 1;
  const launch = windowOf(p, 0, LAUNCH * scale);
  const burst = windowOf(p, LAUNCH * scale, BURST * scale);
  return { launch, burst };
}

function ShellView({ t, box, i, lod }: RigProps & { i: number }) {
  const s = SHELLS[i];
  const source = ART[s.file];
  const rocketSize = Math.max(4, box.w * 0.008);
  const burst = useAnimatedStyle(() => {
    const { burst: b } = shellAt(t.value, s.period, s.offset, !!s.finale);
    if (b < 0) return { opacity: 0, transform: [{ scale: 0.1 }] };
    const grow = 1 - Math.pow(1 - Math.min(1, b / 0.45), 3);
    return {
      opacity: b < 0.55 ? 1 : 1 - (b - 0.55) / 0.45,
      transform: [{ translateY: b * box.h * 0.02 }, { scale: 0.15 + 0.85 * grow }, { rotate: `${b * 14}deg` }],
    };
  });
  const flash = useAnimatedStyle(() => {
    const { burst: b } = shellAt(t.value, s.period, s.offset, !!s.finale);
    return { opacity: b < 0 ? 0 : Math.max(0, 0.7 - b * 1.4), transform: [{ scale: 1.15 }] };
  });
  const rocket = useAnimatedStyle(() => {
    const { launch } = shellAt(t.value, s.period, s.offset, !!s.finale);
    if (launch < 0) return { opacity: 0 };
    const y = 0.92 + (s.cy - 0.92) * (1 - Math.pow(1 - launch, 2));
    return { opacity: 1 - launch * 0.3, transform: [{ translateY: (y - s.cy) * box.h }, { scaleY: 2.4 - launch }] };
  });
  const spec = { cx: s.cx, cy: s.cy, w: s.w };
  return (
    <>
      {lod === 'full' && (
        <Animated.View style={[styles.rocket, { left: box.x + s.cx * box.w - rocketSize / 2, top: box.y + s.cy * box.h,
          width: rocketSize, height: rocketSize * 2, borderRadius: rocketSize }, rocket]} />
      )}
      {lod === 'full' && <FxPart source={source} box={box} spec={spec} tint="#fff1c2" blur={14} style={flash} />}
      <FxPart source={source} box={box} spec={spec} style={burst} />
    </>
  );
}

/**
 * The scene, drawn where the backdrop goes: the midway at night (cover-fitted,
 * like every backdrop) and fireworks over it. Lite plays the 4 steady shells only.
 */
export function MidwayFireworksScene({ t, box, lod }: RigProps) {
  const shells = lod === 'full' ? SHELLS.map((_, i) => i) : lod === 'lite' ? [0, 1, 2, 3] : [];
  return (
    <>
      <Image source={BACKDROP} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}
        contentFit="cover" cachePolicy="memory" />
      {shells.map(i => <ShellView key={i} t={t} box={box} lod={lod} i={i} />)}
      {/* Still: the rest frame, two bursts frozen mid-bloom (compose.py draws the same). */}
      {lod === 'still' && G.bursts.slice(0, 2).map((b, i) => (
        <FxPart key={i} source={ART[b.file]} box={box} spec={{ cx: b.cx, cy: b.cy, w: b.w }} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  rocket: { position: 'absolute', backgroundColor: '#fff3c4', shadowColor: '#ffd36b', shadowOpacity: 1, shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 } },
});
