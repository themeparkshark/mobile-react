/**
 * The clean screen look Dustin liked on the old production Social screen: a soft light-grey
 * page (#f0f4f8) with white cards and light chrome, instead of the saturated water art.
 * Shared by Social and Notifications so the two screens match.
 *
 * <CleanScreenBackground style={...}>{content}</CleanScreenBackground>, or read CLEAN for the
 * matching card, line and chip colours.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export const CLEAN = {
  /** The page. */
  bg: '#f0f4f8',
  /** Cards and pills on the page. */
  card: '#ffffff',
  /** Hairline borders and dividers. */
  line: '#dbe4ee',
  /** Quiet fills: inactive segments, input wells. */
  well: '#e8eef5',
} as const;

export default function CleanScreenBackground({ children, style }: { readonly children?: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.page, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: CLEAN.bg },
});
