/**
 * The lanyard: the flex. A navy strap with gold stitching, hung in a soft U,
 * with up to 6 pins clipped along it, like a real park pin trader's lanyard.
 * Chasers shine and in-person pins wear their seal, so whoever sees it knows
 * what they're looking at without reading.
 *
 * Motion is cheap: one UI-thread sway value for the whole strap, off with
 * Reduce Motion and while the screen is not focused.
 */
import { useAmbient } from '../../services/money/useAmbient';
import { memo, useEffect, useMemo } from 'react';
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
  /** Long-press a pin: move it to the middle of the strap (the star spot). */
  readonly onLongPressSlot?: (index: number, pin: LanyardPin) => void;
  readonly still?: boolean;
  readonly active?: boolean;
  readonly shine?: SharedValue<number>;
};

/** Point on the strap's curve at t (quadratic, ends at the top corners). */
export function strapPoint(t: number, w: number, h: number): { x: number; y: number } {
  const p0 = { x: w * 0.03, y: h * 0.06 };
  const p1 = { x: w * 0.5, y: h * 1.1 };
  const p2 = { x: w * 0.97, y: h * 0.06 };
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y };
}

/** Where the 6 pins sit along the strap (even spacing, clear of the ends). */
export const SLOT_T = [0.14, 0.285, 0.43, 0.57, 0.715, 0.86] as const;

/**
 * Slot positions spaced evenly by distance along the strap (not by curve
 * parameter), so pins never bunch in the bottom of the U and never overlap.
 */
export function slotPoints(count: number, w: number, h: number, from = 0.1, to = 0.9): { x: number; y: number }[] {
  const steps = 200;
  const pts = Array.from({ length: steps + 1 }, (_, i) => strapPoint(i / steps, w, h));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  return Array.from({ length: count }, (_, k) => {
    const target = total * (from + (to - from) * (count === 1 ? 0.5 : k / (count - 1)));
    const j = Math.max(1, cum.findIndex(c => c >= target));
    const f = (target - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]);
    return { x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * f, y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * f };
  });
}

function LanyardBase({ pins, width, max = 6, height = 150, showEmpty = false, onPressSlot, onLongPressSlot, still = false, active = true, shine }: Props) {
  const sway = useSharedValue(0);
  const ambient = useAmbient();
  useEffect(() => {
    if (still || !active || !ambient) {
      cancelAnimation(sway);
      sway.value = withTiming(0, { duration: 200 });
      return;
    }
    sway.value = withRepeat(withSequence(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      withTiming(-1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
    ), -1, true);
    return () => cancelAnimation(sway);
  }, [still, active, ambient, sway]);

  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.value * 0.9}deg` }] }));
  // The strap's shapes depend only on size: built once per size, not every render.
  const { curveH, slotsAt, pinSize, ribbon, stitch, stitch2, weave, clipL, clipR } = useMemo(() => {
    const curveH = height * 0.8;
      const slotsAt = slotPoints(max, width, curveH, 0.15, 0.85);
    // Pins sized to the gap between slots so neighbours never overlap.
      const gap = slotsAt.length > 1 ? Math.hypot(slotsAt[1].x - slotsAt[0].x, slotsAt[1].y - slotsAt[0].y) : width;
      const pinSize = Math.min(62, Math.floor(gap - 16));
      const strapW = 22;
    // The strap path: two parallel curves (a ribbon), drawn once.
      const steps = 24;
      const outer: string[] = [];
      const inner: string[] = [];
      const stitch: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = strapPoint(t, width, curveH);
        const q = strapPoint(Math.min(1, t + 0.001), width, curveH);
        const dx = q.x - p.x; const dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; const ny = dx / len;
      outer.push(`${i === 0 ? 'M' : 'L'}${(p.x + nx * strapW / 2).toFixed(1)},${(p.y + ny * strapW / 2).toFixed(1)}`);
      inner.unshift(`L${(p.x - nx * strapW / 2).toFixed(1)},${(p.y - ny * strapW / 2).toFixed(1)}`);
      stitch.push(`${i === 0 ? 'M' : 'L'}${(p.x + nx * (strapW / 2 - 4)).toFixed(1)},${(p.y + ny * (strapW / 2 - 4)).toFixed(1)}`);
    }
      const stitch2: string[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = strapPoint(t, width, curveH);
        const q = strapPoint(Math.min(1, t + 0.001), width, curveH);
        const dx = q.x - p.x; const dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; const ny = dx / len;
      stitch2.push(`${i === 0 ? 'M' : 'L'}${(p.x - nx * (strapW / 2 - 4)).toFixed(1)},${(p.y - ny * (strapW / 2 - 4)).toFixed(1)}`);
    }
      const ribbon = `${outer.join(' ')} ${inner.join(' ')} Z`;
      const weave: string[] = [];
    for (let i = 1; i < 40; i++) {
        const t = i / 40;
        const p = strapPoint(t, width, curveH);
        const q = strapPoint(Math.min(1, t + 0.001), width, curveH);
        const dx = q.x - p.x; const dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len; const ny = dx / len; const tx = dx / len; const ty = dy / len;
        const a = { x: p.x + nx * 6 - tx * 3, y: p.y + ny * 6 - ty * 3 };
        const b = { x: p.x - nx * 6 + tx * 3, y: p.y - ny * 6 + ty * 3 };
      weave.push(`M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`);
    }
      const clipL = strapPoint(0.035, width, curveH);
      const clipR = strapPoint(0.965, width, curveH);

    return { curveH, slotsAt, pinSize, ribbon, stitch, stitch2, weave, clipL, clipR };
  }, [width, height, max]);
  const slots = Array.from({ length: max }, (_, i) => pins[i] ?? null);
  return (
    <Animated.View style={[{ width, height, transformOrigin: 'top' } as object, swayStyle]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={ribbon} fill="#0b4c9c" stroke={BRAND.navy} strokeWidth={3} strokeLinejoin="round" />
        <Path d={stitch.join(' ')} stroke={BRAND.gold} strokeWidth={1.6} strokeDasharray="5 5" fill="none" />
        <Path d={stitch2.join(' ')} stroke={BRAND.gold} strokeWidth={1.6} strokeDasharray="5 5" fill="none" />
        {/* Woven look: short light ticks across the strap. */}
        <Path d={weave.join(' ')} stroke="rgba(255,255,255,0.22)" strokeWidth={2} fill="none" />
        {/* Gold clips where the strap leaves the card. */}
        <Path d={`M${clipL.x - 9},${clipL.y - 4} h18 v14 h-18 Z M${clipR.x - 9},${clipR.y - 4} h18 v14 h-18 Z`} fill={BRAND.gold} stroke={BRAND.navy} strokeWidth={2.5} />
      </Svg>
      {slots.map((pin, i) => {
        const p = slotsAt[i] ?? strapPoint(0.5, width, curveH);
        const tilt = ((i * 37) % 11) - 5;
        if (!pin && !showEmpty) return null;
        return (
          <Pressable key={pin ? `p${pin.item_id}` : `e${i}`} disabled={!onPressSlot}
            onPress={() => onPressSlot?.(i, pin)}
            onLongPress={pin && onLongPressSlot ? () => onLongPressSlot(i, pin) : undefined}
            accessibilityRole={onPressSlot ? 'button' : 'image'}
            accessibilityLabel={pin ? `${pin.name}${pin.is_chaser ? ', chaser' : ''}` : 'Empty spot. Add a pin'}
            hitSlop={6}
            style={{ position: 'absolute', left: p.x - pinSize / 2, top: p.y - pinSize * 0.42, width: pinSize, height: pinSize }}>
            {pin ? (
              <PinTile uri={pin.icon_url} size={pinSize} owned kind={pin.kind} tradable={pin.tradable}
                chaser={pin.is_chaser} badge={!pin.tradable} badgeScale={0.75} serial={pin.serial} finder={pin.found?.order} tilt={tilt} shine={pin.is_chaser || i % 2 === 0 ? shine : undefined}
                lag={i * 0.12} lagSpan={0.6} surface="panel" />
            ) : (
              // An empty spot reads as a pin back waiting on the strap.
              <View style={[styles.empty, { width: pinSize * 0.62, height: pinSize * 0.62, borderRadius: pinSize * 0.31, marginTop: pinSize * 0.12, alignSelf: 'center' }]}>
                <View style={styles.pinBack} />
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
    borderWidth: 3, borderColor: BRAND.gold, backgroundColor: '#e9c157', alignItems: 'center', justifyContent: 'center',
    shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 0,
  },
  pinBack: { position: 'absolute', top: -10, width: 4, height: 12, borderRadius: 2, backgroundColor: '#b8892a' },
  plus: { fontFamily: FONT.display, fontSize: 22, color: BRAND.navy, paddingTop: 3 },
});
