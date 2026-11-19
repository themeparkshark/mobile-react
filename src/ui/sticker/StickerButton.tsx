/**
 * StickerButton: the puffy sticker button (replaces the flat yellow and red image buttons and,
 * in step 2, GameButton's body: its props are a superset of GameButtonProps with the same names).
 *
 * Variants: primary (gold with the 4-point glint: gold exists only as the primary, one per screen,
 * a dev warning fires on a second), second (blue), third (white), danger (red), key (the gate's
 * cream keys), ghost (words, no box). GameButton's 'secondary' is the blue second here.
 * Sizes: large 58, medium 44, small 36, row 36 (a list row's action) and key 42 face heights; no
 * height or font overrides. GameButton's 'regular' is large and 'compact' is medium.
 * States: rest, pressed (the face goes down by its lip), off (a cool sky paper that keeps its lip),
 * busy (same size, three dots hop). The white cut edge comes only on the one primary, and only when
 * it sits on the world, the map or in a wave foot (level rule, edgeFor).
 *
 * Layers, back to front: drop, base edge, cap edge, lip, cap (face). Pressing moves the cap and its
 * edge down and the drop up, by transforms on the UI thread. Nothing re-renders.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Busy from './Busy';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../../gamekit/Haptics';
import type { GameIconName } from '../iconNames';
import GhostButton from './GhostButton';
import { useCountPrimary, useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { buttonFace, buttonLip, type ButtonSize } from './layout';
import { edgeFor, warnOnce } from './level';
import { usePress } from './motion';
import { BUTTON_TEXT } from './textRoles';
import { BUTTON, DROP, EDGE, INK, LINE, RADIUS, SHADE } from './tokens';

export type StickerVariant = 'primary' | 'second' | 'third' | 'danger' | 'key' | 'ghost';
/** GameButton's names, accepted so its body can become a StickerButton without editing call sites. */
export type StickerButtonVariant = StickerVariant | 'secondary';
export type StickerButtonSize = ButtonSize | 'regular' | 'compact';

export type StickerButtonProps = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: StickerButtonVariant;
  readonly size?: StickerButtonSize;
  /** GameButton's icon names are accepted for type parity only: the kit draws no vector icons (pass `image`). */
  readonly icon?: GameIconName;
  /** Alex's art before the words (bundled). */
  readonly image?: number;
  readonly disabled?: boolean;
  /** Busy: same size, three dots hop, presses ignored. `loading` is GameButton's name for it. */
  readonly busy?: boolean;
  readonly loading?: boolean;
  /** Ghost only: which surface it sits on (GameButton parity; the kit reads its place instead). */
  readonly tone?: 'onLight' | 'onBlue';
  /** Stretch to the parent's width. */
  readonly fullWidth?: boolean;
  readonly width?: number;
  readonly haptics?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  /** A code-drawn glyph in place of the words (the gate's delete key); `label` still speaks. */
  readonly glyph?: ReactNode;
  /** One-line label that shrinks to fit a narrow width (off by default). */
  readonly fit?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

type Look = { lip: string; face: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]]; shine: string | null; ink: 'white' | 'navy' | 'soft' };

const LOOKS: Record<'primary' | 'second' | 'third' | 'danger' | 'key' | 'off', Look> = {
  primary: { lip: INK.goldLip, face: [INK.goldLight, INK.gold, SHADE.goldFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine80, ink: 'white' },
  second: { lip: INK.blueLip, face: [SHADE.blueFaceTop, INK.blueBright, SHADE.blueFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine50, ink: 'white' },
  third: { lip: INK.skyLip, face: [INK.white, SHADE.whiteFaceLow], shine: null, ink: 'navy' },
  key: { lip: INK.creamLip, face: [SHADE.creamTop, INK.cream], shine: INK.white, ink: 'navy' },
  danger: { lip: INK.redLip, face: [SHADE.redFaceTop, INK.red, SHADE.redFaceLow], locations: [0, 0.6, 1], shine: SHADE.shine45, ink: 'white' },
  // Off keeps its lip and shape in a cool sky paper, the label in navy soft, no stroke (never slate gray).
  off: { lip: INK.skyLip, face: [SHADE.skyPale, INK.sky], shine: SHADE.shine50, ink: 'soft' },
};
const PRESSED_GOLD = [SHADE.goldPressedTop, SHADE.goldPressedLow] as const;

const RADII: Record<ButtonSize, number> = { large: RADIUS.buttonLarge, medium: RADIUS.button, small: RADIUS.buttonSmall, row: RADIUS.button, key: RADIUS.key };

/** GameButton names onto kit names. Pure, so it is tested. */
export function kitVariant(variant: StickerButtonVariant): StickerVariant {
  return variant === 'secondary' ? 'second' : variant;
}
export function kitSize(size: StickerButtonSize): ButtonSize {
  return size === 'regular' ? 'large' : size === 'compact' ? 'medium' : size;
}

/** The 4-point glint (code-drawn, primary only). Fixed size, no measuring. */
const Glint = memo(function Glint({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path d="M7 0Q7.9 6.1 14 7 7.9 7.9 7 14 6.1 7.9 0 7 6.1 6.1 7 0z" fill={INK.white} />
    </Svg>
  );
});

type Inner = StickerButtonProps & { readonly held?: number };

function ButtonBody({
  label, onPress, variant: variantProp = 'primary', size: sizeProp = 'medium', icon, image, disabled = false, busy: busyProp = false, loading = false,
  fullWidth = false, width, haptics = true, accessibilityLabel, accessibilityHint, testID, glyph, fit = false, style, held = 0,
}: Inner) {
  const place = useStickerPlace();
  const variant = kitVariant(variantProp) as Exclude<StickerVariant, 'ghost'>;
  const size = kitSize(sizeProp);
  const busy = busyProp || loading;
  const primary = variant === 'primary';
  useCountPrimary(primary, label);
  if (icon) warnOnce('button-icon', __DEV__, m => console.warn(m), `StickerButton "${label}": the kit draws no vector icons; pass Alex's art as \`image\`.`);
  const onMap = place.level === 'map';
  const e = edgeFor('button', place, primary);
  const look = LOOKS[disabled ? 'off' : variant];
  const line = onMap && e ? LINE.map : LINE.button;
  const face = buttonFace(size);
  const lip = buttonLip(size);
  const height = face + lip + line * 2;
  const capHeight = face + line;
  const dropOff = onMap ? DROP.buttonOnMap : DROP.button;
  const travel = lip - 1;
  const radius = RADII[size];
  const { p, pressIn, pressOut, reduced } = usePress();
  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: travel * Math.max(p.value, held) }] }));
  const dropStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dropOff - (dropOff - 1) * Math.max(p.value, held) }] }));
  const shineStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, Math.min(1, Math.max(p.value, held))) }));
  const pressedFace = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, Math.max(p.value, held))) }));

  const inert = disabled || busy;
  const text = BUTTON_TEXT[size];
  const slop = height < BUTTON.minTouch ? (BUTTON.minTouch - height) / 2 : 0;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      disabled={inert}
      onPressIn={inert ? undefined : pressIn}
      onPressOut={inert ? undefined : pressOut}
      onPress={inert ? undefined : () => { if (haptics) haptic('tapLight'); onPress?.(); }}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      style={[{ height, width, minWidth: BUTTON.minTouch }, fullWidth ? styles.full : null, style]}>
      {e > 0 ? (
        <>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: radius + e,
            backgroundColor: onMap ? DROP.map : DROP.color }, dropStyle]} />
          <View pointerEvents="none" style={{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: radius + e, backgroundColor: INK.white }} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: -e, height: capHeight + line + e * 2,
            borderRadius: radius + e, backgroundColor: INK.white }, capStyle]} />
        </>
      ) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: lip, bottom: 0, borderRadius: radius,
        borderWidth: line, borderColor: INK.navy, backgroundColor: look.lip }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: capHeight, borderRadius: radius,
        borderTopWidth: line, borderLeftWidth: line, borderRightWidth: line, borderBottomWidth: 0, borderColor: INK.navy, overflow: 'hidden' }, capStyle]}>
        <LinearGradient colors={look.face} locations={look.locations} style={StyleSheet.absoluteFill} />
        {primary && !disabled ? (
          <Animated.View style={[StyleSheet.absoluteFill, pressedFace]}><LinearGradient colors={PRESSED_GOLD} style={StyleSheet.absoluteFill} /></Animated.View>
        ) : null}
        {look.shine ? (
          <Animated.View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radius - line, borderTopRightRadius: radius - line,
            borderTopWidth: BUTTON.shine, borderColor: look.shine }, shineStyle]} />
        ) : null}
        <View style={styles.center}>
          {busy ? <Busy reduced={reduced} /> : glyph ? glyph : (
            <View style={styles.row}>
              {image ? <Image source={image} resizeMode="contain" fadeDuration={0} style={{ height: Math.round(text.size * 1.1), width: Math.round(text.size * 1.1) }} /> : null}
              <View style={styles.lbl}>
                <StickerText spec={text} tone={look.ink === 'navy' ? 'navy' : look.ink === 'soft' ? 'soft' : 'auto'} lineHeight={Math.round(text.size * 1.15)} role="none" fit={fit}>{label}</StickerText>
              </View>
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

function StickerButtonImpl(props: StickerButtonProps) {
  if (kitVariant(props.variant ?? 'primary') === 'ghost') {
    return <GhostButton label={props.label} accessibilityLabel={props.accessibilityLabel} disabled={props.disabled} busy={props.busy || props.loading}
      onPress={props.onPress} testID={props.testID} haptics={props.haptics} style={props.style} />;
  }
  return <ButtonBody {...props} />;
}

const StickerButton = memo(StickerButtonImpl);
export default StickerButton;

/** Gallery only (not exported from the kit): the pressed look held still, for the kit sheet. */
export function PressedSample(props: StickerButtonProps) {
  return <ButtonBody {...props} held={1} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  lbl: { paddingTop: 2, flexShrink: 1 },
  full: { alignSelf: 'stretch' },
});

/** For tests: the white edge width a button gets (re-exported decision). */
export const BUTTON_EDGE = EDGE.button;
