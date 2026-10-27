/**
 * Prebuilt re-share button for wherever a flex-worthy thing lives (book tile,
 * stamp card, coin sheet, event card, standings row). Alex-style round blue
 * button with a white share glyph; 48 pt hit target. Full-screen reveals use
 * size "reveal": one placement everywhere, directly under the main button.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from '../helpers/haptics';
import { BRAND } from '../ui/tokens';
import { useDevAutoPress } from './devDrive';
import { shareFlexAfterHandoff } from './handoff';
import { shareFlex, warmFlex } from './store';
import type { FlexKind, FlexPayload } from './types';

export function ShareGlyph({ size = 20, color = '#ffffff' }: { readonly size?: number; readonly color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/**
 * The one share face, used by every share button (FlexShareButton, LookShareButton):
 * - sm: round blue icon button (optional "Share" word under it),
 * - md: blue pill with the glyph and "Share",
 * - reveal: the full-screen reveal placement, a wide blue pill with a gold rim that always sits
 *   directly under the reveal's main button.
 */
export function ShareFace({ size = 'sm', caption = false, onDark = false, dim = false, pulseStyle }: {
  readonly size?: ShareSize;
  readonly caption?: boolean;
  readonly onDark?: boolean;
  readonly dim?: boolean;
  readonly pulseStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ alignItems: 'center' }, dim && { opacity: 0.55 }]}>
      <Animated.View style={[styles.base, size === 'sm' ? styles.round : size === 'md' ? styles.pill : styles.reveal, pulseStyle]}>
        <View style={styles.gloss} />
        <ShareGlyph size={size === 'sm' ? 20 : size === 'md' ? 18 : 20} />
        {size !== 'sm' && <Text style={[styles.label, size === 'reveal' && styles.revealLabel]}>Share</Text>}
      </Animated.View>
      {size === 'sm' && caption && <Text style={[styles.caption, onDark && styles.captionOnDark]}>Share</Text>}
    </View>
  );
}

export type ShareSize = 'sm' | 'md' | 'reveal';

/** Width of the reveal pill: the same as the reveal's main button. Exported for the reveals. */
export function revealShareWidth(screenWidth: number): number {
  return Math.min(320, screenWidth - 48);
}

export function FlexShareButton<K extends FlexKind>({ kind, payload, surface, size = 'sm', caption = false, onDark = false, style, handoff, disabled = false }: {
  readonly kind: K;
  readonly payload: FlexPayload<K>;
  readonly surface: string;
  /** sm: round icon button. md: pill with icon + "Share". reveal: gold-rimmed pill under a reveal's main button. */
  readonly size?: ShareSize;
  /** sm only: a "Share" word under the icon and two attention pulses on arrival, so kids read it. */
  readonly caption?: boolean;
  /** The caption sits on a dark (navy) screen: white words with a navy edge. */
  readonly onDark?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  /**
   * The button sits inside an RN <Modal>: close that modal first (useModalHandoff), then the
   * Share Studio sheet opens from Root. Without it a share from a modal never shows on iOS.
   */
  readonly handoff?: () => Promise<void>;
  /** Not yet (a save is still going): the button shows dimmed and does nothing. */
  readonly disabled?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => { warmFlex(kind); }, [kind]);
  const pulses = caption || size === 'reveal';
  useEffect(() => {
    if (!pulses || reduced) return;
    pulse.value = withDelay(500, withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 260 })), 2, false));
    return () => cancelAnimation(pulse);
  }, [pulses, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * (size === 'reveal' ? 0.06 : 0.14) }] }));
  const leaving = useRef(false);
  const open = () => {
    if (disabled) return;
    void Haptics.selectionAsync();
    if (!handoff) { shareFlex(kind, payload, { surface }); return; }
    if (leaving.current) return;
    leaving.current = true;
    void shareFlexAfterHandoff(handoff, kind, payload, { surface }).finally(() => { leaving.current = false; });
  };
  useDevAutoPress('flex_button', open);
  return (
    <Pressable onPress={open} disabled={disabled} hitSlop={size === 'sm' ? 6 : 0} accessibilityRole="button" accessibilityLabel="Share"
      accessibilityState={{ disabled }} accessibilityHint="Make a card to show it off"
      style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }, style]}>
      <ShareFace size={size} caption={caption} onDark={onDark} dim={disabled} pulseStyle={pulseStyle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: BRAND.blueBright, borderWidth: 3, borderBottomWidth: 5, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  round: { width: 44, height: 44, borderRadius: 22 },
  pill: { height: 44, borderRadius: 22, flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  // The reveal pill: a gold rim on the house blue, as wide as the main button above it.
  reveal: { height: 52, minWidth: 200, borderRadius: 26, flexDirection: 'row', gap: 10, paddingHorizontal: 26, borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  gloss: { position: 'absolute', left: 6, right: 6, top: 3, height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)' },
  label: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff' },
  revealLabel: { fontSize: 21 },
  captionOnDark: { color: '#ffffff', textShadowColor: BRAND.navy },
  caption: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 1, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
});
