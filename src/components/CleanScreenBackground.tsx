/**
 * The clean screen background: the calm, flat light page the production
 * Social and Notifications screens sat on (claude/prime-time: Social
 * `#f0f4f8`, Notifications `#e3f3ff`; this sits between the two), restored as one shared surface so list
 * screens stop sitting on the saturated water art. Cards, lists and loaders go
 * on top of it; text on it uses CLEAN_SCREEN_INK / CLEAN_SCREEN_INK_SOFT.
 *
 * Used by Notifications and Friends, and by Social (Shark Social). Directly
 * under a <Topbar>, pass `underTopbar` so it tucks 8 pt under the bar's curved
 * edge the way the production screens did. CLEAN carries the matching card,
 * line and well colours for anything drawn on the page.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BRAND } from '../ui/tokens';

/** The page colour: production's pale sky, a hair softer, so it belongs to the blue Topbar without the water art. */
export const CLEAN_SCREEN_BG = '#EAF3FB';
/** Headings and strong text on the page. */
export const CLEAN_SCREEN_INK = BRAND.navy;
/** Secondary text on the page (captions, empty-state copy). */
export const CLEAN_SCREEN_INK_SOFT = BRAND.navySoft;
/** Pull-to-refresh spinner and other small accents on the page. */
export const CLEAN_SCREEN_ACCENT = BRAND.blueBright;

export const CLEAN = {
  /** The page. */
  bg: CLEAN_SCREEN_BG,
  /** Cards and pills on the page. */
  card: '#ffffff',
  /** Hairline borders and dividers. */
  line: '#dbe4ee',
  /** Quiet fills: inactive segments, input wells. */
  well: '#e8eef5',
} as const;

export default function CleanScreenBackground({ children, underTopbar = false, style }: {
  readonly children?: ReactNode;
  /** Tuck 8 pt under the Topbar's curve when it sits directly under one. */
  readonly underTopbar?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.page, underTopbar && styles.underTopbar, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: CLEAN_SCREEN_BG },
  underTopbar: { marginTop: -8 },
});
