import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import GameIcon, { type GameIconName } from '../../ui/GameIcon';
import { queueHaptic } from '../../gamekit/Haptics';
import { PERK_CHIP_STAGGER_MS, perkChipText, type PerkChipData } from './progressionModel';

/**
 * Coin perk proc chips (progression.md 9.4): a row under the post-win
 * rewards. Only chips the server returned; each stamps in 150 ms after the
 * last, after the Parts count-up. Ticket Back gets the Ticket icon.
 */
const ICONS: Record<string, GameIconName> = {
  ticket_back: 'ticket', double_day: 'star', ride_regular: 'ride', short_wait: 'timer',
  queue_crew: 'parts', line_mastery: 'parts',
};

export function PerkChip({ chip, index, start, reduced }: { chip: PerkChipData; index: number; start: boolean; reduced: boolean }) {
  const stamp = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!start) return;
    if (reduced) { stamp.setValue(1); return; }
    const animation = Animated.sequence([
      Animated.delay(index * PERK_CHIP_STAGGER_MS),
      Animated.spring(stamp, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
    ]);
    const timer = setTimeout(() => queueHaptic('tapLight'), index * PERK_CHIP_STAGGER_MS);
    animation.start();
    return () => { animation.stop(); clearTimeout(timer); };
  }, [start, reduced, index]);
  const scale = stamp.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] });
  const text = perkChipText(chip);
  return (
    <Animated.View accessible accessibilityLabel={text} style={[styles.chip, { opacity: stamp, transform: [{ scale }] }]}>
      <GameIcon name={ICONS[chip.key] ?? 'sparkle'} size={20} />
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

export default function PerkChipRow({ perks, start = true, reduced }: { perks: readonly PerkChipData[]; start?: boolean; reduced: boolean }) {
  if (!perks.length) return null;
  return (
    <View style={styles.row}>
      {perks.map((chip, index) => <PerkChip key={`${chip.key}-${index}`} chip={chip} index={index} start={start} reduced={reduced} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff5d6', borderColor: '#ffcf3b',
    borderWidth: 2, borderBottomColor: '#d99a00', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  text: { fontFamily: 'Shark', fontSize: 14, color: '#05346e' },
});
