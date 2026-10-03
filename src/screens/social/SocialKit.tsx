/**
 * Social v2 chrome, in the Stamp Book's language: Alex's shark-camo ocean,
 * chunky cards with a navy outline and a darker bottom lip, a gloss band, and
 * pill buttons that squash on press (UI thread springs; instant with reduced
 * motion). Every touch target is at least 44 pt and every label at least 14 pt.
 */
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import GameIcon from '../../ui/GameIcon';
import type { GameIconName } from '../../ui/iconNames';
import { BRAND, FONT } from '../../ui/tokens';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

export const INK = '#05346E';
export const CARD = '#FFFFFF';
export const CARD_NEW = '#FFF8E4';
export const PAGE_DIM = 'rgba(7,104,185,0.28)';

const PRESS_SPRING = { damping: 14, stiffness: 420, mass: 0.6 } as const;

/** The ocean page every social screen sits on. */
export function SocialBackdrop({ children }: { readonly children: ReactNode }) {
  return (
    <View style={kit.page}>
      <Image source={require('../../../assets/images/shark_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: PAGE_DIM }]} />
      {children}
    </View>
  );
}

/** Press feedback for anything tappable: squash to 0.96 and spring back. */
export function useSquash() {
  const reduced = useUiReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => { scale.value = reduced ? 1 : withTiming(0.96, { duration: 70 }); },
    onPressOut: () => { scale.value = reduced ? 1 : withSpring(1, PRESS_SPRING); },
  };
}

export type PillTone = 'gold' | 'green' | 'blue' | 'grey' | 'red' | 'white';

const TONES: Record<PillTone, { face: string; lip: string; text: string; outline: string }> = {
  gold: { face: BRAND.gold, lip: BRAND.goldLip, text: INK, outline: INK },
  green: { face: '#4CC96A', lip: BRAND.greenLip, text: '#FFFFFF', outline: INK },
  blue: { face: BRAND.blueBright, lip: BRAND.blueLip, text: '#FFFFFF', outline: INK },
  grey: { face: '#E6EEF7', lip: '#AFC0D4', text: INK, outline: INK },
  red: { face: BRAND.red, lip: BRAND.redLip, text: '#FFFFFF', outline: INK },
  white: { face: '#FFFFFF', lip: '#C9D8EA', text: INK, outline: INK },
};

/** A chunky pill button: outline, lip, optional art, one short word. */
export const Pill = memo(function Pill({
  label, icon, tone = 'gold', onPress, disabled, accessibilityLabel, accessibilityHint, compact, iconOnly, style,
}: {
  readonly label: string;
  readonly icon?: GameIconName;
  readonly tone?: PillTone;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly compact?: boolean;
  /** Show only the art (label still read by VoiceOver). */
  readonly iconOnly?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const squash = useSquash();
  const t = TONES[tone];
  const height = compact ? 44 : 50;
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={squash.onPressIn}
      onPressOut={squash.onPressOut}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={style}
    >
      <Animated.View style={[squash.style, { opacity: disabled ? 0.55 : 1 }]}>
        <View style={[kit.pill, { height, minWidth: iconOnly ? height : 0, backgroundColor: t.lip, borderColor: t.outline }]}>
          <View style={[kit.pillFace, { backgroundColor: t.face, paddingHorizontal: iconOnly ? 0 : compact ? 12 : 16 }]}>
            <View style={kit.gloss} pointerEvents="none" />
            {icon && <GameIcon name={icon} size={compact ? 24 : 28} />}
            {!iconOnly && (
              <Text style={[kit.pillText, { color: t.text, fontSize: compact ? 16 : 18 }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                {label}
              </Text>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

/** Red count bubble (e.g. waiting requests). */
export function CountBadge({ count, style }: { readonly count: number; readonly style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[kit.badge, style]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Text style={kit.badgeText} maxFontSizeMultiplier={1.1}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

/** "New" / "Earlier" style header on the ocean. */
export const SectionHeader = memo(function SectionHeader({ label, count, icon, right }: { readonly label: string; readonly count?: number; readonly icon?: GameIconName; readonly right?: ReactNode }) {
  return (
    <View style={kit.sectionHead}>
      <View style={kit.sectionLeft} accessibilityRole="header" accessible accessibilityLabel={count ? `${label}, ${count}` : label}>
        {icon && <GameIcon name={icon} size={26} />}
        <Text style={kit.sectionText} maxFontSizeMultiplier={1.2}>{label}</Text>
        {count != null && count > 0 && <View style={kit.sectionCount}><Text style={kit.sectionCountText}>{count}</Text></View>}
      </View>
      {right}
    </View>
  );
});

export const kit = StyleSheet.create({
  page: { flex: 1, marginTop: -8, backgroundColor: BRAND.blue },
  card: {
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: INK,
    overflow: 'hidden',
  },
  pill: { borderRadius: 999, borderWidth: 3, paddingBottom: 4, overflow: 'hidden' },
  pillFace: { flex: 1, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden' },
  gloss: { position: 'absolute', top: 3, left: 10, right: 10, height: '38%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.32)' },
  pillText: { fontFamily: FONT.display, textTransform: 'uppercase', letterSpacing: 0.3, includeFontPadding: false },
  badge: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 6, backgroundColor: BRAND.red,
    borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: FONT.display, fontSize: 14, color: '#FFFFFF', includeFontPadding: false },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 14, paddingTop: 14, paddingBottom: 8, minHeight: 58 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionText: {
    fontFamily: FONT.display, fontSize: 20, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5,
    textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  sectionCount: { backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  sectionCountText: { fontFamily: FONT.display, fontSize: 14, color: '#FFFFFF' },
});
