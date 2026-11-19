/**
 * StickerButton: the puffy sticker button (replaces the flat yellow and red image buttons and,
 * in step 2, GameButton's body: its props are a superset of GameButtonProps with the same names).
 *
 * Variants: primary (gold with the 4-point glint: gold exists only as the primary, one per screen,
 * a dev warning fires on a second), second (blue, the DEFAULT, so gold is only ever chosen on
 * purpose), third (white), danger (red), key (the gate's cream keys), ghost (words, no box).
 * GameButton's 'secondary' is the blue second here. Step 2 maps GameButton's own default
 * ('primary', 129 of 171 uses) to 'second' and picks the one gold per screen by hand.
 * Sizes: large 58, medium 44, small 36, row 36 (a list row's action) and key 42 face heights; no
 * height or font overrides. GameButton's 'regular' is large and 'compact' is medium. Like
 * GameButton it stretches to its parent's width unless it is given a `width` (then the label fits).
 * States: rest, pressed (the face goes down by its lip), off (a cool sky paper, pressed in: no top
 * line, a 2 pt lip, and its `reason` as a plain line under it), busy (same size, three dots hop).
 * The white cut edge comes only on the one primary, and only when it sits on the world, the map or
 * in a wave foot (level rule, edgeFor).
 *
 * Layers, back to front: drop, base edge, cap edge, lip, cap (face). Pressing moves the cap and its
 * edge down and the drop up, by transforms on the UI thread. Nothing re-renders. The edge layers and
 * the gold's pressed face mount only on the one primary, so other buttons run one worklet.
 */
import { memo, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Busy from './Busy';
import Svg, { Path } from 'react-native-svg';
import { haptic } from '../../gamekit/Haptics';
import type { GameIconName } from '../iconNames';
import GhostButton from './GhostButton';
import { useCountEdge, useCountPrimary, useStickerPlace } from './StickerContext';
import StickerText from './StickerText';
import { iconArt } from './icons';
import { buttonFace, buttonHeight, buttonLine, buttonLip, type ButtonSize } from './layout';
import { edgeFor } from './level';
import { usePress } from './motion';
import type { LayoutStyle } from './style';
import { BUTTON_TEXT, TEXT } from './textRoles';
import { BUTTON, DROP, EDGE, INK, RADIUS, SHADE, SPACE } from './tokens';

export type StickerVariant = 'primary' | 'second' | 'third' | 'danger' | 'key' | 'ghost';
/** GameButton's names, accepted so its body can become a StickerButton without editing call sites. */
export type StickerButtonVariant = StickerVariant | 'secondary';
export type StickerButtonSize = ButtonSize | 'regular' | 'compact';

export type StickerButtonProps = {
  readonly label: string;
  readonly onPress?: () => void;
  readonly variant?: StickerButtonVariant;
  readonly size?: StickerButtonSize;
  /** GameButton's icon names: drawn as Alex's art when one of his files has that name (icons.ts), else nothing (dev warning). */
  readonly icon?: GameIconName;
  /** Alex's art before the words (bundled). */
  readonly image?: number;
  readonly disabled?: boolean;
  /** Off: why, as a plain line under the button (kit.png: off "keeps its lip, says why"). */
  readonly reason?: string;
  /** Busy: same size, three dots hop, presses ignored. `loading` is GameButton's name for it. */
  readonly busy?: boolean;
  readonly loading?: boolean;
  /** Ghost only: which surface it sits on (GameButton parity; the kit reads its place instead). */
  readonly tone?: 'onLight' | 'onBlue';
  /** Stretch to the parent's width (default: yes unless a `width` is given, as GameButton). */
  readonly fullWidth?: boolean;
  readonly width?: number;
  readonly haptics?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  /** A code-drawn glyph in place of the words (the gate's delete key); `label` still speaks. */
  readonly glyph?: ReactNode;
  /** One-line label that shrinks to fit (default: on whenever the width is fixed). */
  readonly fit?: boolean;
  readonly style?: StyleProp<LayoutStyle>;
};

type Look = { lip: string; face: readonly [string, string, ...string[]]; locations?: readonly [number, number, ...number[]]; shine: string | null; ink: 'white' | 'navy' | 'soft' };

const LOOKS: Record<'primary' | 'second' | 'third' | 'danger' | 'key' | 'off', Look> = {
  primary: { lip: INK.goldLip, face: [INK.goldLight, INK.gold, SHADE.goldFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine80, ink: 'white' },
  second: { lip: INK.blueLip, face: [SHADE.blueFaceTop, INK.blueBright, SHADE.blueFaceLow], locations: [0, 0.55, 1], shine: SHADE.shine50, ink: 'white' },
  third: { lip: INK.skyLip, face: [INK.white, SHADE.whiteFaceLow], shine: null, ink: 'navy' },
  key: { lip: INK.creamLip, face: [SHADE.creamTop, INK.cream], shine: INK.white, ink: 'navy' },
  danger: { lip: INK.redLip, face: [SHADE.redFaceTop, INK.red, SHADE.redFaceLow], locations: [0, 0.6, 1], shine: SHADE.shine45, ink: 'white' },
  // Off: a cool sky paper pressed in (no white top line, a 2 pt lip), the label in navy soft, no stroke. Never slate gray, never mistaken for the white third.
  off: { lip: INK.skyLip, face: [INK.sky, INK.sky], shine: null, ink: 'soft' },
};
/** The off button's lip: it sits pressed in. */
export const OFF_LIP = 2;
const PRESSED_GOLD = [SHADE.goldPressedTop, SHADE.goldPressedLow] as const;

const RADII: Record<ButtonSize, number> = { large: RADIUS.buttonLarge, medium: RADIUS.button, small: RADIUS.buttonSmall, row: RADIUS.button, key: RADIUS.key };

/** GameButton names onto kit names. Pure, so it is tested. */
export function kitVariant(variant: StickerButtonVariant): StickerVariant {
  return variant === 'secondary' ? 'second' : variant;
}
export function kitSize(size: StickerButtonSize): ButtonSize {
  return size === 'regular' ? 'large' : size === 'compact' ? 'medium' : size;
}

/** The kit's defaults, beside GameButton's (tested): blue unless gold is chosen, stretch unless a width is given, the label fits a fixed width. */
export const BUTTON_DEFAULTS = { variant: 'second', size: 'medium', fit: (width?: number) => width !== undefined, fullWidth: (width?: number) => width === undefined } as const;

/** The 4-point glint (code-drawn, primary only). Fixed size, no measuring. A smaller glint, set further in, under 44 pt. */
const Glint = memo(function Glint({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      <Path d="M7 0Q7.9 6.1 14 7 7.9 7.9 7 14 6.1 7.9 0 7 6.1 6.1 7 0z" fill={INK.white} />
    </Svg>
  );
});

/** Where the glint sits and how big it is for a face height (pure, tested): never crowding the first letter. */
export function glintFor(size: ButtonSize, face: number): { readonly size: number; readonly left: number; readonly top: number } {
  if (size === 'large') return { size: 13, left: 16, top: 8 };
  if (face < 44) return { size: 7, left: 10, top: 5 };
  return { size: 11, left: 12, top: 6 };
}

/** The one primary's white edge and its moving drop: mounted only when the button wears the edge. */
function EdgeLayers({ p, e, lip, radius, capHeight, line, travel, dropOff, onMap }: {
  p: SharedValue<number>; e: number; lip: number; radius: number; capHeight: number; line: number; travel: number; dropOff: number; onMap: boolean;
}) {
  const dropStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dropOff - (dropOff - 1) * p.value }] }));
  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: travel * p.value }] }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: radius + e,
        backgroundColor: onMap ? DROP.map : DROP.color }, dropStyle]} />
      <View pointerEvents="none" style={{ position: 'absolute', left: -e, right: -e, top: lip - e, bottom: -e, borderRadius: radius + e, backgroundColor: INK.white }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -e, right: -e, top: -e, height: capHeight + line + e * 2,
        borderRadius: radius + e, backgroundColor: INK.white }, capStyle]} />
    </>
  );
}

/** What fades as the face goes down: the top line, the glint and (gold only) the pressed face swap. */
function PressLayers({ p, radius, line, shine, gold, glint }: {
  p: SharedValue<number>; radius: number; line: number; shine: string | null; gold: boolean; glint: ReturnType<typeof glintFor> | null;
}) {
  const shineStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.max(0, Math.min(1, p.value)) }));
  const pressedFace = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, p.value)) }));
  return (
    <>
      {gold ? <Animated.View style={[StyleSheet.absoluteFill, pressedFace]}><LinearGradient colors={PRESSED_GOLD} style={StyleSheet.absoluteFill} /></Animated.View> : null}
      {shine ? (
        <Animated.View style={[StyleSheet.absoluteFill, { borderTopLeftRadius: radius - line, borderTopRightRadius: radius - line,
          borderTopWidth: BUTTON.shine, borderColor: shine }, shineStyle]} />
      ) : null}
      {glint ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: glint.left, top: glint.top, opacity: 0.95 }, shineStyle]}>
          <Glint size={glint.size} />
        </Animated.View>
      ) : null}
    </>
  );
}

type Inner = StickerButtonProps & { readonly pressedStill?: boolean };

const REASON = { ...TEXT.bodySmall, maxScale: 1.3 };

function ButtonBody({
  label, onPress, variant: variantProp = BUTTON_DEFAULTS.variant, size: sizeProp = BUTTON_DEFAULTS.size, icon, image, disabled = false, reason, busy: busyProp = false, loading = false,
  fullWidth: fullWidthProp, width, haptics = true, accessibilityLabel, accessibilityHint, testID, glyph, fit: fitProp, style, pressedStill = false,
}: Inner) {
  const place = useStickerPlace();
  const variant = kitVariant(variantProp) as Exclude<StickerVariant, 'ghost'>;
  const size = kitSize(sizeProp);
  const busy = busyProp || loading;
  const primary = variant === 'primary';
  const fullWidth = fullWidthProp ?? BUTTON_DEFAULTS.fullWidth(width);
  const fit = fitProp ?? BUTTON_DEFAULTS.fit(width);
  useCountPrimary(primary, label);
  const art = image ?? iconArt(icon, `StickerButton "${label}"`);
  const onMap = place.level === 'map';
  const e = edgeFor('button', place, primary);
  useCountEdge(e ? 'primary' : null);
  const off = disabled;
  const look = LOOKS[off ? 'off' : variant];
  const line = buttonLine(onMap);
  const face = buttonFace(size);
  const restLip = buttonLip(size);
  const height = buttonHeight(size, onMap);
  // Off sits pressed in: the cap starts lower and the lip shows 2 pt, the button's height unchanged.
  const lip = off ? OFF_LIP : restLip;
  const sink = restLip - lip;
  const capHeight = face + line;
  const dropOff = onMap ? DROP.buttonOnMap : DROP.button;
  const travel = lip - 1;
  const radius = RADII[size];
  const { p, pressIn, pressOut, reduced } = usePress(pressedStill ? 1 : 0);
  const capStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sink + travel * p.value }] }));

  const inert = disabled || busy;
  const text = BUTTON_TEXT[size];
  const slop = height < BUTTON.minTouch ? (BUTTON.minTouch - height) / 2 : 0;
  const glint = primary && !off && !busy ? glintFor(size, face) : null;
  const button = (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={off && reason ? reason : accessibilityHint}
      accessibilityState={{ disabled, busy }}
      disabled={inert}
      onPressIn={inert ? undefined : pressIn}
      onPressOut={inert ? undefined : pressOut}
      onPress={inert ? undefined : () => { if (haptics) haptic('tapLight'); onPress?.(); }}
      hitSlop={slop ? { top: slop, bottom: slop } : undefined}
      style={[{ height, width, minWidth: BUTTON.minTouch }, fullWidth && !reason ? styles.full : null, reason ? null : style]}>
      {e > 0 ? <EdgeLayers p={p} e={e} lip={restLip} radius={radius} capHeight={capHeight} line={line} travel={travel} dropOff={dropOff} onMap={onMap} /> : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: restLip, bottom: 0, borderRadius: radius,
        borderWidth: line, borderColor: INK.navy, backgroundColor: look.lip }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: capHeight, borderRadius: radius,
        borderTopWidth: line, borderLeftWidth: line, borderRightWidth: line, borderBottomWidth: 0, borderColor: INK.navy, overflow: 'hidden' }, capStyle]}>
        <LinearGradient colors={look.face} locations={look.locations} style={StyleSheet.absoluteFill} />
        {look.shine || (primary && !off) ? <PressLayers p={p} radius={radius} line={line} shine={look.shine} gold={primary && !off} glint={glint} /> : null}
        <View style={styles.center}>
          {busy ? <Busy reduced={reduced} /> : glyph ? glyph : (
            <View style={styles.row}>
              {art ? <Image source={art} resizeMode="contain" fadeDuration={0} style={{ height: Math.round(text.size * 1.1), width: Math.round(text.size * 1.1) }} /> : null}
              <View style={styles.lbl}>
                <StickerText spec={text} tone={look.ink === 'white' ? 'auto' : 'navy'} fill={look.ink === 'soft' ? INK.navySoft : undefined} lineHeight={Math.round(text.size * 1.15)} role="none" fit={fit}>{label}</StickerText>
              </View>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
  if (!reason) return button;
  // Off says why: a plain line under the button (not the button's own words).
  return (
    <View style={[fullWidth ? styles.full : null, { alignItems: 'center', gap: SPACE.base }, style]}>
      {button}
      {off ? <View accessible={false} importantForAccessibility="no-hide-descendants"><StickerText spec={REASON} tone="soft" lines={0} role="none">{reason}</StickerText></View> : null}
    </View>
  );
}

function StickerButtonImpl(props: StickerButtonProps) {
  if (kitVariant(props.variant ?? BUTTON_DEFAULTS.variant) === 'ghost') {
    return <GhostButton label={props.label} accessibilityLabel={props.accessibilityLabel} disabled={props.disabled} busy={props.busy || props.loading}
      onPress={props.onPress} testID={props.testID} haptics={props.haptics} style={props.style} />;
  }
  return <ButtonBody {...props} />;
}

const StickerButton = memo(StickerButtonImpl);
export default StickerButton;

/** Gallery only (not exported from the kit): the pressed look held still, for the kit sheet. Its press starts at 1; buttons pay nothing for it. */
export function PressedSample(props: StickerButtonProps) {
  return <ButtonBody {...props} pressedStill />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.base * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.base + 2, maxWidth: '100%' },
  lbl: { paddingTop: 2, flexShrink: 1 },
  full: { alignSelf: 'stretch' },
});

/** For tests: the white edge width a button gets (re-exported decision). */
export const BUTTON_EDGE = EDGE.button;
