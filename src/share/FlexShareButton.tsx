/**
 * Prebuilt re-share button for wherever a flex-worthy thing lives (book tile,
 * stamp card, coin sheet, event card, standings row). Alex-style round blue
 * button with a white share glyph; 48 pt hit target.
 */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from '../helpers/haptics';
import { BRAND } from '../ui/tokens';
import { shareFlex } from './store';
import type { FlexKind, FlexPayload } from './types';

export function ShareGlyph({ size = 20, color = '#ffffff' }: { readonly size?: number; readonly color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M8 11H6.5A1.5 1.5 0 0 0 5 12.5v7A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16" stroke={color} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function FlexShareButton<K extends FlexKind>({ kind, payload, surface, size = 'sm', style }: {
  readonly kind: K;
  readonly payload: FlexPayload<K>;
  readonly surface: string;
  /** sm: round icon button. md: pill with icon + "Share". */
  readonly size?: 'sm' | 'md';
  readonly style?: StyleProp<ViewStyle>;
}) {
  const open = () => {
    void Haptics.selectionAsync();
    shareFlex(kind, payload, { surface });
  };
  return (
    <Pressable onPress={open} hitSlop={size === 'sm' ? 6 : 0} accessibilityRole="button" accessibilityLabel="Share"
      accessibilityHint="Make a card to show it off" style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }, style]}>
      <View style={[styles.base, size === 'sm' ? styles.round : styles.pill]}>
        <View style={styles.gloss} />
        <ShareGlyph size={size === 'sm' ? 20 : 18} />
        {size === 'md' && <Text style={styles.label}>Share</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: BRAND.blueBright, borderWidth: 3, borderBottomWidth: 5, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  round: { width: 44, height: 44, borderRadius: 22 },
  pill: { height: 44, borderRadius: 22, flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
  gloss: { position: 'absolute', left: 6, right: 6, top: 3, height: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.3)' },
  label: { fontFamily: 'Shark', fontSize: 18, color: '#ffffff' },
});
