/**
 * The first catch of the night: Team Chaos or Team Control. Two big cartoon
 * buttons, one short line each, kid-safe. The catch is sent with the side.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrightSide } from '../../api/endpoints/fright';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import { NightCard } from './ui';

export const SIDES: readonly { readonly side: FrightSide; readonly title: string; readonly line: string; readonly color: string }[] = [
  { side: 'chaos', title: 'Team Chaos', line: 'Giggles, pranks and wobbly fun.', color: NIGHT.pumpkin },
  { side: 'control', title: 'Team Control', line: 'Tidy tents and perfect order.', color: '#3f9fb0' },
];

export default function SidePicker({ name, onPick, onClose }: {
  readonly name: string | null;
  readonly onPick: (side: FrightSide) => void;
  readonly onClose: () => void;
}) {
  if (!name) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <NightCard style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={onClose} hitSlop={10} style={styles.close}>
            <GameIcon name="close" size={26} />
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">Pick a side!</Text>
          <Text style={styles.sub}>{`${name} is here. Team Chaos or Team Control?`}</Text>
          {SIDES.map(item => (
            <Pressable key={item.side} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.line}`}
              onPress={() => onPick(item.side)}
              style={({ pressed }) => [styles.side, { backgroundColor: item.color }, pressed && { transform: [{ scale: 0.97 }] }]}>
              <Text style={styles.sideTitle}>{item.title}</Text>
              <Text style={styles.sideLine}>{item.line}</Text>
            </Pressable>
          ))}
          <Text style={styles.foot}>Your side counts all night.</Text>
        </NightCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 360, alignItems: 'stretch' },
  close: { position: 'absolute', right: 10, top: 10, zIndex: 2 },
  title: { fontFamily: 'Shark', fontSize: 26, color: NIGHT.candy, textAlign: 'center' },
  sub: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fogLight, textAlign: 'center', marginTop: 4, marginBottom: 6 },
  side: { minHeight: 96, borderRadius: 20, borderWidth: 4, borderColor: NIGHT.white, alignItems: 'center', justifyContent: 'center',
    marginTop: 12, paddingHorizontal: 12 },
  sideTitle: { fontFamily: 'Shark', fontSize: 26, color: NIGHT.white, textShadowColor: NIGHT.ink, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sideLine: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.white, marginTop: 2 },
  foot: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fog, textAlign: 'center', marginTop: 12 },
});
