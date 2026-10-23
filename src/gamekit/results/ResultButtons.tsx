/**
 * ResultButtons: the one button look every results card shares.
 *
 * Primary: a full-width yellow button with a navy border and a thick bottom
 * edge, caps Shark font (PLAY AGAIN, DONE, CONTINUE). Secondary: a white
 * button with the same border, sitting side by side in a row. These match the
 * shell's own results buttons, so a screenshot of any game's card reads as
 * the same system.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';

export function ResultPrimaryButton({ label, icon, onPress, disabled, style }: {
  label: string;
  icon?: GameIconName;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, styles.primary, style]}
      onPress={onPress} disabled={disabled}>
      {icon ? <GameIcon name={icon} size={26} /> : null}
      <Text style={[styles.primaryText, icon && styles.gap]}>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

export function ResultSecondaryButton({ label, icon, onPress, style }: {
  label: string;
  icon?: GameIconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={[styles.btn, styles.secondary, style]} onPress={onPress}>
      {icon ? <GameIcon name={icon} size={20} /> : null}
      <Text style={[styles.secondaryText, icon && styles.gap]} numberOfLines={1} adjustsFontSizeToFit>{label.toUpperCase()}</Text>
    </TouchableOpacity>
  );
}

/** Secondary buttons side by side. */
export function ResultButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  btn: { width: '100%', borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', marginTop: 10 },
  primary: { backgroundColor: '#ffcf3b', paddingVertical: 16, marginTop: 14, borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 6 },
  primaryText: { color: '#05346e', fontSize: 22, fontFamily: 'Shark' },
  secondary: { flex: 1, backgroundColor: '#ffffff', paddingVertical: 12, borderWidth: 3, borderColor: '#05346e', borderBottomWidth: 5 },
  secondaryText: { color: '#05346e', fontSize: 18, fontFamily: 'Shark' },
  gap: { marginLeft: 8 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
});
