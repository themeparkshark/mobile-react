import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import SharkReactionIcon, { SHARK_REACTIONS } from './SharkReactionIcon';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

interface ReactionPickerProps {
  selected: string | null;
  onSelect: (reaction: string | null) => void;
}

const ReactionPicker: React.FC<ReactionPickerProps> = React.memo(({ selected, onSelect }) => {
  const scales = useRef(SHARK_REACTIONS.map(() => new Animated.Value(1))).current;
  const reducedMotion = useReducedGameMotion();
  useEffect(() => {
    if (reducedMotion) scales.forEach(scale => { scale.stopAnimation(); scale.setValue(1); });
    return () => scales.forEach(scale => scale.stopAnimation());
  }, [reducedMotion, scales]);

  const handlePress = useCallback((emoji: string, index: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (!reducedMotion) Animated.sequence([
      Animated.timing(scales[index], { toValue: 1.1, duration: 80, useNativeDriver: true }),
      Animated.timing(scales[index], { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    onSelect(selected === emoji ? null : emoji);
  }, [selected, onSelect, scales, reducedMotion]);

  return (
    <View style={styles.container}>
      {SHARK_REACTIONS.map(({ code, label }, i) => (
        <Pressable key={code} onPress={() => handlePress(code, i)} style={styles.choice}
          accessibilityRole="button" accessibilityLabel={label}
          accessibilityState={{ selected: selected === code }}>
          <Animated.View
            style={[
              styles.pill,
              selected === code && styles.pillSelected,
              { transform: [{ scale: scales[i] }] },
            ]}
          >
            <SharkReactionIcon reaction={code} size={40} />
          </Animated.View>
          <Text style={[styles.label, selected === code && styles.labelSelected]} numberOfLines={2}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
});

ReactionPicker.displayName = 'ReactionPicker';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  choice: { flex: 1, alignItems: 'center', minHeight: 70 },
  pill: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#B9E2F7',
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: '#FFF1BA',
    borderWidth: 2,
    borderColor: '#fec90e',
  },
  label: { fontFamily: 'Knockout', color: '#174D76', fontSize: 11, textAlign: 'center', marginTop: 5 },
  labelSelected: { color: '#6F4609' },
});

export default ReactionPicker;
