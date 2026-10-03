/**
 * Small night-palette building blocks for Fin-ister surfaces. No haptics or
 * sound here: phones-down (H6) is enforced by the caller never rendering
 * prompts inside the quiet window.
 */
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { GameIcon, type GameIconName } from '../../ui';
import { NIGHT } from '../../services/fright/theme';

export function NightButton({ label, onPress, icon, disabled, loading, variant = 'pumpkin', style, accessibilityLabel, accessibilityHint }: {
  readonly label: string;
  readonly onPress: () => void;
  readonly icon?: GameIconName;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly variant?: 'pumpkin' | 'ghost' | 'candy';
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], off && styles.disabled, pressed && !off && styles.pressed, style]}>
      {loading ? <ActivityIndicator color={variant === 'ghost' ? NIGHT.fogLight : NIGHT.ink} /> : (
        <>
          {icon && <GameIcon name={icon} size={18} />}
          <Text style={[styles.label, variant === 'ghost' && styles.labelGhost]} numberOfLines={1}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function NightCard({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Fins({ value, size = 22 }: { readonly value: number; readonly size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={`${value} of 5 fins`}>
      {[1, 2, 3, 4, 5].map(n => <View key={n} style={{ opacity: n <= value ? 1 : 0.28 }}><GameIcon name="fin" size={size} /></View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, borderWidth: 3 },
  pumpkin: { backgroundColor: NIGHT.pumpkin, borderColor: NIGHT.moon },
  candy: { backgroundColor: NIGHT.candy, borderColor: NIGHT.white },
  ghost: { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: NIGHT.fog },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.97 }] },
  /** Primary labels (Next, Into the fog, Done, See it, Let's go, Retry) at 18 pt; ghost chips stay smaller. */
  label: { fontFamily: 'Shark', fontSize: 18, color: NIGHT.ink },
  labelGhost: { color: NIGHT.fogLight, fontSize: 15 },
  card: { backgroundColor: NIGHT.midnight, borderRadius: 22, borderWidth: 3, borderColor: NIGHT.fog, padding: 16 },
});
