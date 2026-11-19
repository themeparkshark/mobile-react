/**
 * StickerButton: the puffy sticker button (replaces the flat yellow and red image buttons).
 * Gold (the one primary), blue (second), white (third), red (danger), key (the gate's keys).
 * Heights 58, 44, 36 (face) and the 42 key. Rest, pressed (the face goes down by its lip),
 * off (keeps its lip), busy (same size, three dots hop). The 4-point glint marks the primary
 * only. The white cut edge comes only when the button sits on the world or the map.
 *
 * Layers, back to front: drop, base edge, cap edge, lip, cap (face). Pressing moves the cap
 * and its edge down and the drop up, by transforms on the UI thread. Nothing re-renders.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../../gamekit/Haptics';
import { useEdge } from './StickerContext';
import StickerText from './StickerText';
import { usePress } from './motion';
import { BUTTON, DROP, EDGE, INK, LINE, RADIUS, SHADE, STROKE } from './tokens';

export type StickerButtonColor = 'gold' | 'blue' | 'white' | 'red' | 'key';
export type StickerButtonSize = 'large' | 'medium' | 'small' | 'key';

export type StickerButtonProps = {
  readonly label: string;
  /** What VoiceOver says (default: the label). */
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly color?: StickerButtonColor;
  readonly size?: StickerButtonSize;
  /** The one primary on a screen: wears the 4-point glint. */
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  /** Ask for the edge: honoured on the world, refused (dev warning) inside a page. */
  readonly edge?: boolean;
  /** Face height override (list rows use 36 on a medium button). */
  readonly faceHeight?: number;
  readonly fontSize?: number;
  readonly width?: number;
  /** A code-drawn glyph in place of the words (the gate's delete key); `label` still speaks. */
  readonly glyph?: ReactNode;
  /** Gallery only: hold the pressed look. */
  readonly showPressed?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
};

type Look = { lip: string; face: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]]; shine: string | null; ink: 'white' | 'navy' };

const LOOKS: Record<StickerButtonColor | 'off', Look> = {
  gold: { lip: INK.goldLip, face: [INK.goldLight, INK.gold, SHADE.goldFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine80, ink: 'white' },
  blue: { lip: INK.blueLip, face: [SHADE.blueFaceTop, INK.blueBright, SHADE.blueFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine50, ink: 'white' },
  white: { lip: INK.skyLip, face: [INK.white, SHADE.whiteFaceLow], shine: null, ink: 'navy' },
  key: { lip: INK.creamLip, face: [SHADE.creamTop, INK.cream], shine: INK.white, ink: 'navy' },
  red: { lip: INK.redLip, face: [SHADE.redFaceTop, INK.red, SHADE.redFaceLow], locations: [0, 0.6, 1], shine: SHADE.shine45, ink: 'white' },
  off: { lip: SHADE.offLip, face: [SHADE.offFaceTop, SHADE.offFaceLow], shine: SHADE.shine50, ink: 'white' },
};
const PRESSED_GOLD = [SHADE.goldPressedTop, SHADE.goldPressedLow] as const;

const GEOMETRY: Record<StickerButtonSize, { face: number; font: number; radius: number; lip: number; stroke: number; drop: number; spacing: number }> = {
  large: { face: BUTTON.heightLarge, font: BUTTON.fontLarge, radius: RADIUS.buttonLarge, lip: BUTTON.lip, stroke: 2.75, drop: STROKE.dropTitle, spacing: 0.06 },
  medium: { face: BUTTON.height, font: BUTTON.font, radius: RADIUS.button, lip: BUTTON.lip, stroke: STROKE.button, drop: STROKE.drop, spacing: 0.06 },
  small: { face: BUTTON.heightSmall, font: BUTTON.fontSmall, radius: RADIUS.buttonSmall, lip: BUTTON.lipSmall, stroke: STROKE.button, drop: STROKE.drop, spacing: 0.06 },
  key: { face: BUTTON.heightKey, font: BUTTON.fontKey, radius: RADIUS.key, lip: BUTTON.lip, stroke: STROKE.button, drop: STROKE.drop, spacing: 0.06 },
};

/** The 4-point glint (code-drawn, primary only). Fixed size, no measuring. */
const Glint = memo(function Glint({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path d="M7 0Q7.9 6.1 14 7 7.9 7.9 7 14 6.1 7.9 0 7 6.1 6.1 7 0z" fill={INK.white} />
    </Svg>
  );
});

/** Busy: three dots hop, one after the other (UI thread). Reduce Motion: they breathe instead. */
function Dot({ index, reduced }: { index: number; reduced: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    const step = reduced ? 150 : 220;
    t.value = withDelay(index * 120, withRepeat(withSequence(
      withTiming(1, { duration: step, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: step, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: step }),
    ), -1));
    return () => cancelAnimation(t);
  }, [index, reduced, t]);
  const style = useAnimatedStyle(() => reduced
    ? { opacity: 0.55 + 0.45 * t.value }
    : { transform: [{ translateY: -6 * t.value }] });
  return <Animated.View style={[styles.dot, style]} />;
}

function Busy({ reduced }: { reduced: boolean }) {
  return <View style={styles.dots}>{[0, 1, 2].map(i => <Dot key={i} index={i} reduced={reduced} />)}</View>;
}

function StickerButtonImpl({
  label, accessibilityLabel, accessibilityHint, color = 'gold', size = 'medium', primary = false, disabled = false, busy = false,
  edge: asked, faceHeight, fontSize, width, glyph, showPressed = false, onPress, style,
}: StickerButtonProps) {
  const { edge, place } = useEdge('StickerButton', asked);
  const onMap = place.level === 'map';
  const g = GEOMETRY[size];
  const look = LOOKS[disabled ? 'off' : color];
  const line = onMap && edge ? LINE.map : LINE.button;
  const face = faceHeight ?? g.face;
  const lip = g.lip;
  const height = face + lip + line * 2;
  const capHeight = face + line;
  const e = edge ? EDGE.button : 0;
  const dropOff = onMap ? 5 : DROP.button;
  const travel = lip - 1;
  const { p, pressIn, pressOut, reduced } = usePress();
  const held = useSharedValue(showPressed ? 1 : 0);
  useEffect(() => { held.value = showPressed ? 1 : 0; }, [held, showPressed]);

  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: travel * Math.max(p.value, held.value) }] }));
  const dropStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dropOff - (dropOff - 1) * Math.max(p.value, held.value) }] }));
  const shineStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, Math.min(1, Math.max(p.value, held.value))) }));
  const pressedFace = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, Math.max(p.value, held.value))) }));

  const inert = disabled || busy;
  const ink = look.ink;
  const font = fontSize ?? g.font;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      disabled={inert}
      onPressIn={inert ? undefined : pressIn}
      onPressOut={inert ? undefined : pressOut}
      onPress={inert ? undefined : () => { haptic('tapLight'); onPress?.(); }}
      hitSlop={height < BUTTON.minTouch ? { top: (BUTTON.minTouch - height) / 2, bottom: (BUTTON.minTouch - height) / 2 } : undefined}
      style={[{ height, width, minWidth: BUTTON.minTouch }, style]}>
      {e > 0 ? (
        <>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: g.radius + e,
            backgroundColor: onMap ? DROP.map : DROP.color }, dropStyle]} />
          <View pointerEvents="none" style={{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: g.radius + e, backgroundColor: INK.white }} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: -e, height: capHeight + line + e * 2,
            borderRadius: g.radius + e, backgroundColor: INK.white }, capStyle]} />
        </>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: lip, bottom: 0, borderRadius: g.radius,
        borderWidth: line, borderColor: INK.navy, backgroundColor: look.lip }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: capHeight, borderTopLeftRadius: g.radius, borderTopRightRadius: g.radius,
        borderBottomLeftRadius: g.radius, borderBottomRightRadius: g.radius, borderTopWidth: line, borderLeftWidth: line, borderRightWidth: line, borderBottomWidth: 0,
        borderColor: INK.navy, overflow: 'hidden' }, capStyle]}>
        <LinearGradient colors={look.face} locations={look.locations} style={StyleSheet.absoluteFill} />
        {color === 'gold' && !disabled ? (
          <Animated.View style={[StyleSheet.absoluteFill, pressedFace]}><LinearGradient colors={PRESSED_GOLD} style={StyleSheet.absoluteFill} /></Animated.View>
        ) : null}
        {look.shine ? (
          <Animated.View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: g.radius - line, borderTopRightRadius: g.radius - line,
            borderTopWidth: BUTTON.shine, borderColor: look.shine }, shineStyle]} />
        ) : null}
        <View style={styles.center}>
          {busy ? <Busy reduced={reduced} /> : glyph ? glyph : (
            <View style={styles.lbl}>
              {ink === 'navy'
                ? <StickerText size={font} tone="navy" stroke={0} spacing={g.spacing} lineHeight={Math.round(font * 1.15)} role="none" maxScale={1.2}>{label}</StickerText>
                : <StickerText size={font} stroke={g.stroke} drop={disabled ? 0 : g.drop} strokeColor={disabled ? SHADE.offStroke : INK.navy}
                    fill={disabled ? SHADE.offInk : undefined} spacing={g.spacing} lineHeight={Math.round(font * 1.15)} role="none" maxScale={1.2}>{label}</StickerText>}
            </View>
          )}
        </View>
        {primary && !disabled && !busy ? (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: size === 'large' ? 16 : face < 42 ? 8 : 12, top: size === 'large' ? 8 : face < 42 ? 4 : 6, opacity: 0.95 }, shineStyle]}>
            <Glint size={size === 'large' ? 13 : face < 42 ? 9 : 11} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  lbl: { paddingTop: 2 },
  dots: { flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: INK.white, borderWidth: 1.5, borderColor: INK.navy },
});

const StickerButton = memo(StickerButtonImpl);
export default StickerButton;
