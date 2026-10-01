import { StyleSheet, Text, View } from 'react-native';
import { BRAND } from '../../../ui';

/** One bright color per seat, so a glance says whose turn it is. No purple, no neon. */
export const PLAYER_COLORS = ['#1e8ae0', '#ef4a3c', '#3cb85c', '#ff9a2e', '#16b5b0', '#e85a9a'] as const;

export function playerColor(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

/** A round initial badge for a crew member. Local names only. */
export default function PlayerBadge({ name, index, size = 40, kid = false }: {
  readonly name: string; readonly index: number; readonly size?: number; readonly kid?: boolean;
}) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';
  return <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2,
    backgroundColor: playerColor(index), borderWidth: size >= 56 ? 4 : 3 }]}
    accessibilityElementsHidden importantForAccessibility="no">
    <Text style={[styles.initial, { fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) }]}>{initial}</Text>
    {kid && <View style={[styles.kidDot, { width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18 }]} />}
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderColor: BRAND.white },
  initial: { fontFamily: 'Shark', color: BRAND.white, textShadowColor: BRAND.navy,
    textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 0 },
  kidDot: { position: 'absolute', right: -2, bottom: -2, backgroundColor: BRAND.gold,
    borderWidth: 2, borderColor: BRAND.white },
});
