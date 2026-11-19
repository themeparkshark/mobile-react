/**
 * The sticker body every flat part shares: a hard drop (straight down, no blur), the white cut
 * edge (level 1 only), the navy line, a face (flat colour or one soft gradient) and the inset
 * highlight and lip lines. Plain views and one gradient; nothing measures itself.
 *
 * Internal: Page, Card and TitleLabel decide the numbers from the level rule.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';
import { INK } from './tokens';

export type ShellFace = {
  readonly colors: readonly [string, string, ...string[]];
  readonly locations?: readonly [number, number, ...number[]];
};

export type ShellProps = {
  readonly radius: number;
  readonly line: number;
  readonly lineColor?: string;
  readonly face: ShellFace;
  /** White cut edge width (0: none). */
  readonly edge?: number;
  /** Hard drop: offset and colour (offset 0: none). */
  readonly drop?: number;
  readonly dropColor?: string;
  /** Inset white line along the top (kit.css inset 0 2px 0). */
  readonly insetTop?: { readonly width: number; readonly color: string };
  /** Inset lip along the bottom (kit.css inset 0 -4px 0). */
  readonly insetBottom?: { readonly width: number; readonly color: string };
  /** The one soft shadow, for floating sheets and dialogs only. */
  readonly float?: { readonly color: string; readonly y: number; readonly blur: number };
  /** Drawn inside the clipped body (dots, the wave foot). */
  readonly inside?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Animated drop offset (stuck on). */
  readonly dropStyle?: AnimatedStyle<ViewStyle>;
  readonly children?: ReactNode;
};

export default function Shell({
  radius, line, lineColor = INK.navy, face, edge = 0, drop = 0, dropColor, insetTop, insetBottom, float, inside, style, dropStyle, children,
}: ShellProps) {
  const outer = radius + edge;
  return (
    <View style={style}>
      {drop > 0 && dropColor ? (
        <Animated.View pointerEvents="none" style={[{
          position: 'absolute', left: -edge, right: -edge, top: -edge + drop, bottom: -edge - drop,
          borderRadius: outer, backgroundColor: dropColor,
        }, dropStyle]} />
      ) : null}
      {edge > 0 ? (
        <View pointerEvents="none" style={[{ position: 'absolute', left: -edge, right: -edge, top: -edge, bottom: -edge, borderRadius: outer, backgroundColor: INK.white },
          float ? { shadowColor: float.color, shadowOpacity: 1, shadowRadius: float.blur / 2, shadowOffset: { width: 0, height: float.y } } : null]} />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: line, borderColor: lineColor, overflow: 'hidden' }]}>
        <LinearGradient colors={face.colors} locations={face.locations} style={StyleSheet.absoluteFill} />
        {insetTop || insetBottom ? (
          <View style={[StyleSheet.absoluteFill, {
            borderRadius: Math.max(0, radius - line),
            borderTopWidth: insetTop?.width ?? 0, borderTopColor: insetTop?.color ?? 'transparent',
            borderBottomWidth: insetBottom?.width ?? 0, borderBottomColor: insetBottom?.color ?? 'transparent',
          }]} />
        ) : null}
        {inside}
      </View>
      {children}
    </View>
  );
}
