/**
 * The lanyard: the flex. A navy strap with gold stitching, hung in a soft U,
 * with up to 6 pins clipped along it, like a real park pin trader's lanyard.
 * Chasers shine and in-person pins wear their seal, so whoever sees it knows
 * what they're looking at without reading.
 *
 * Motion is cheap: one UI-thread sway value for the whole strap, off with
 * Reduce Motion and while the screen is not focused.
 */
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { BRAND, FONT } from '../../ui';
import { PinTile } from './PinArt';
import type { LanyardPin } from './pinsModel';

type Props = {
  readonly pins: readonly LanyardPin[];
  readonly width: number;
  readonly max?: number;
  readonly height?: number;
  /** Show empty "+" slots (your own lanyard, editable). */
  readonly showEmpty?: boolean;
  readonly onPressSlot?: (index: number, pin: LanyardPin | null) => void;
  readonly still?: boolean;
  readonly active?: boolean;
  readonly shine?: SharedValue<number>;
};

/** Point on the strap's curve at t (quadratic, ends at the top corners). */
export function strapPoint(t: number, w: number, h: number): { x: number; y: number } {
  const p0 = { x: w * 0.03, y: -h * 0.05 };
  const p1 = { x: w * 0.5, y: h * 1.02 };
  const p2 = { x: w * 0.97, y: -h * 0.05 };
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/** Where the 6 pins sit along the strap (even spacing, clear of the ends). */
export const SLOT_T = [0.14, 0.285, 0.43, 0.57, 0.715, 0.86] as const;

function LanyardBase({ pins, width, max = 6, height = 150, showEmpty = false, onPressSlot, still = false, active = true, shine }: Props) {
  const sway = useSharedValue(0);
  useEffect(() => {
    if (still || !active) {
      cancelAnimation(sway);
      sway.value = withTiming(0, { duration: 200 });
      return;
    }
    sway.value = withRepeat(withSequence(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      withTiming(-1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    return () => cancelAnimation(sway);
  }, [still, active, sway]);

  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.value * 0.9}deg` }] }));
  const pinSize = Math.min(64, Math.round(width / 6.4));
  const strapW = 22;
  // The strap path: two parallel curves (a ribbon), drawn once.
  const steps = 24;
  const outer: string[] = [];
  const inner: string[] = [];
  const stitch: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = strapPoint(t, width, height * 0.62);
    const q = strapPoint(Math.min(1, t + 0.001), width, height * 0.62);
    const dx = q.x - p.x; const dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    outer.push(`${i === 0 ? 'M' : 'L'}${(p.x + nx * strapW / 2).toFixed(1)},${(p.y + ny * strapW / 2).toFixed(1)}`);
    inner.unshift(`L${(p.x - nx * strapW / 2).toFixed(1)},${(p.y - ny * strapW / 2).toFixed(1)}`);
    stitch.push(`${i === 0 ? 'M' : 'L'}${(p.x + nx * (strapW / 2 - 4)).toFixed(1)},${(p.y + ny * (strapW / 2 - 4)).toFixed(1)}`);
  }
  const stitch2: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = strapPoint(t, width, height * 0.62);
    const q = strapPoint(Math.min(1, t + 0.001), width, height * 0.62);
    const dx = q.x - p.x; const dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len; const ny = dx / len;
    stitch2.push(`${i === 0 ? 'M' : 'L'}${(p.x - nx * (strapW / 2 - 4)).toFixed(1)},${(p.y - ny * (strapW / 2 - 4)).toFixed(1)}`);
  }
  const ribbon = `${outer.join(' ')} ${inner.join(' ')} Z`;

  const slots = Array.from({ length: max }, (_, i) => pins[i] ?? null);
  return (
    <Animated.View style={[{ width, height, transformOrigin: 'top' } as object, swayStyle]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={ribbon} fill="#0b4c9c" stroke={BRAND.navy} strokeWidth={3} strokeLinejoin="round" />
        <Path d={stitch.join(' ')} stroke={BRAND.gold} strokeWidth={1.6} strokeDasharray="5 5" fill="none" />
        <Path d={stitch2.join(' ')} stroke={BRAND.gold} strokeWidth={1.6} strokeDasharray="5 5" fill="none" />
      </Svg>
      {slots.map((pin, i) => {
        const p = strapPoint(SLOT_T[i] ?? 0.5, width, height * 0.62);
        const tilt = ((i * 37) % 11) - 5;
        if (!pin && !showEmpty) return null;
        return (
          <Pressable key={pin ? `p${pin.item_id}` : `e${i}`} disabled={!onPressSlot}
            onPress={() => onPressSlot?.(i, pin)}
            accessibilityRole={onPressSlot ? 'button' : 'image'}
            accessibilityLabel={pin ? `${pin.name}${pin.is_chaser ? ', chaser' : ''}` : 'Empty spot. Add a pin'}
            hitSlop={6}
            style={{ position: 'absolute', left: p.x - pinSize / 2, top: p.y - pinSize * 0.42, width: pinSize, height: pinSize }}>
            {pin ? (
              <PinTile uri={pin.icon_url} size={pinSize} owned kind={pin.kind} tradable={pin.tradable}
                chaser={pin.is_chaser} tilt={tilt} shine={pin.is_chaser || i % 2 === 0 ? shine : undefined}
                lag={i * 0.12} lagSpan={0.6} surface="panel" />
            ) : (
              <View style={[styles.empty, { width: pinSize - 8, height: pinSize - 8, borderRadius: (pinSize - 8) / 2 }]}>
                <Text maxFontSizeMultiplier={1} style={styles.plus}>+</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

export const Lanyard = memo(LanyardBase);

const styles = StyleSheet.create({
  empty: {
    margin: 4, borderWidth: 3, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(5,52,110,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  plus: { fontFamily: FONT.display, fontSize: 24, color: BRAND.white, paddingTop: 3 },
});
