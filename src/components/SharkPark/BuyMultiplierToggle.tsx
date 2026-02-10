import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BuyMultiplier } from '../../models/idle-game-types';

const OPTIONS: { label: string; value: BuyMultiplier }[] = [
  { label: 'x1', value: 1 },
  { label: 'x10', value: 10 },
  { label: 'x100', value: 100 },
  { label: 'MAX', value: 'max' },
];

interface Props {
  selected: BuyMultiplier;
  onSelect: (m: BuyMultiplier) => void;
}

export default function BuyMultiplierToggle({ selected, onSelect }: Props) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((opt) => {
        const active = selected === opt.value;
        return (
          <Pressable
            key={opt.label}
            onPress={() => onSelect(opt.value)}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#e8ecf0',
  },
  pillActive: {
    backgroundColor: '#09268f',
  },
  pillText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#666',
    textTransform: 'uppercase',
  },
  pillTextActive: {
    color: '#fff',
  },
});
