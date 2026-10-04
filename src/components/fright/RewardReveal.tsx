/**
 * Compact reward reveal after a haunt, reef or catch: the headline item's art
 * large, its name, "Added to your wardrobe" only for a real item (pin or
 * cosmetic with an item_id), "On your Deep Lantern too" for pins, and small
 * XP / Coins chips. The server decides what was earned; this only renders.
 */
import { Modal, StyleSheet, Text, View } from 'react-native';
import type { FrightReward } from '../../api/endpoints/fright';
import { lanternLine, rewardReveal, wardrobeLine } from '../../services/fright/rewards';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import ArtImage from './ArtImage';
import { NightButton, NightCard } from './ui';

export default function RewardReveal({ rewards, onClose }: { readonly rewards: readonly FrightReward[] | null; readonly onClose: () => void }) {
  const reveal = rewardReveal(rewards);
  if (!reveal) return null;
  const [lead, ...rest] = reveal.items;
  const lines = [wardrobeLine(lead), lanternLine(lead)].filter(Boolean).join(' · ');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <NightCard style={styles.card}>
          <Text style={styles.headline} accessibilityRole="header">{reveal.headline}</Text>
          <View style={styles.artWell}>
            <ArtImage uri={lead.image} style={{ width: 150, height: 150 }} label={lead.name}
              fallback={<GameIcon name={lead.kind === 'pin' ? 'pin' : 'gift'} size={96} />} />
          </View>
          <Text style={styles.name}>{lead.name}</Text>
          {!!lines && <Text style={styles.line}>{lines}</Text>}
          {rest.length > 0 && (
            <View style={styles.rest}>
              {rest.slice(0, 4).map((item, i) => (
                <View key={`${item.item_id ?? item.name}-${i}`} style={styles.small} accessible accessibilityLabel={item.name}>
                  <ArtImage uri={item.image} style={{ width: 44, height: 44 }} fallback={<GameIcon name={item.kind === 'pin' ? 'pin' : 'gift'} size={32} />} />
                  <Text style={styles.smallName} numberOfLines={2}>{item.name}</Text>
                </View>
              ))}
            </View>
          )}
          {reveal.chips.length > 0 && <Text style={styles.chips}>{reveal.chips.join('   ')}</Text>}
          <NightButton label="Nice!" onPress={onClose} style={{ marginTop: 14 }} />
        </NightCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', borderColor: NIGHT.candy },
  headline: { fontFamily: 'Shark', fontSize: 22, color: NIGHT.candy, textAlign: 'center' },
  artWell: { width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,179,71,0.18)', alignItems: 'center',
    justifyContent: 'center', marginTop: 10 },
  name: { fontFamily: 'Shark', fontSize: 19, color: NIGHT.white, textAlign: 'center', marginTop: 10 },
  line: { fontFamily: 'Knockout', fontSize: 15, color: NIGHT.fogLight, textAlign: 'center', marginTop: 4 },
  rest: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  small: { width: 70, alignItems: 'center' },
  smallName: { fontFamily: 'Knockout', fontSize: 12, color: NIGHT.fog, textAlign: 'center', marginTop: 2 },
  chips: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.lantern, marginTop: 10 },
});
