import React, { useCallback, useRef } from 'react';
import { Animated, Pressable, View, StyleSheet } from 'react-native';

const REACTIONS = ['🤯', '😂', '😴', '🤢', '🔥'];

interface ReactionPickerProps {
  selected: string | null;
  onSelect: (reaction: string | null) => void;
}

const ReactionPicker: React.FC<ReactionPickerProps> = React.memo(({ selected, onSelect }) => {
  const scales = useRef(REACTIONS.map(() => new Animated.Value(1))).current;

  const handlePress = useCallback((emoji: string, index: number) => {
    Animated.sequence([
      Animated.timing(scales[index], { toValue: 1.5, duration: 80, useNativeDriver: true }),
      Animated.timing(scales[index], { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    onSelect(selected === emoji ? null : emoji);
  }, [selected, onSelect, scales]);

  return (
    <View style={styles.container}>
      {REACTIONS.map((emoji, i) => (
        <Pressable key={emoji} onPress={() => handlePress(emoji, i)} hitSlop={6}>
          <Animated.View
            style={[
              styles.pill,
              selected === emoji && styles.pillSelected,
              { transform: [{ scale: scales[i] }] },
            ]}
          >
            <Animated.Text style={styles.emoji}>{emoji}</Animated.Text>
          </Animated.View>
        </Pressable>
      ))}
    </View>
  );
});

ReactionPicker.displayName = 'ReactionPicker';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  pill: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillSelected: {
    backgroundColor: 'rgba(254, 201, 14, 0.25)',
    borderWidth: 2,
    borderColor: '#fec90e',
  },
  emoji: {
    fontSize: 28,
  },
});

export default ReactionPicker;
