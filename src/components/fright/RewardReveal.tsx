/**
 * Compact reward reveal after a haunt, reef or catch. The milestone headline
 * ("Every haunt in one night!", "You caught Ringmaster Riptide!"), then the
 * hero item large with its name: an earned cosmetic is the hero (the gear is
 * the payoff), ahead of any spot pin, which drops to the small row.
 * "Added to your wardrobe" for a new real item, "Already yours" for a
 * duplicate (server `owned: true`, the coins chip shows what it paid instead).
 * "On your Deep Lantern too" for a new pin opens the Deep Lantern pins
 * (FrightCard), never PinCollections. The server decides what was earned;
 * this only renders.
 */
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FrightReward } from '../../api/endpoints/fright';
import { isOwned, lanternLine, rewardReveal, wardrobeLine } from '../../services/fright/rewards';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import ArtImage from './ArtImage';
import { openDeepLantern } from './openDeepLantern';
import { NightButton, NightCard } from './ui';

const HERO_ART = 176;

export default function RewardReveal({ rewards, critter = null, eventSlug = null, onClose }: {
  readonly rewards: readonly FrightReward[] | null;
  /** The caught critter's name (encounter milestone headline). */
  readonly critter?: string | null;
  /** The event whose Deep Lantern the pins line opens. */
  readonly eventSlug?: string | null;
  readonly onClose: () => void;
}) {
  const reveal = rewardReveal(rewards, critter);
  if (!reveal) return null;
  const [hero, ...rest] = reveal.items;
  const wardrobe = wardrobeLine(hero);
  // The pins line rides on the hero pin, or on a new pin in the small row when gear is the hero.
  const pinLine = lanternLine(hero) ?? rest.map(lanternLine).find(Boolean) ?? null;
  const openPins = pinLine && eventSlug ? () => { onClose(); openDeepLantern(eventSlug, { section: 'pins' }); } : null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <NightCard style={styles.card}>
          <Text style={styles.headline} accessibilityRole="header">{reveal.headline}</Text>
          <View style={styles.artWell}>
            <ArtImage uri={hero.image} style={{ width: HERO_ART, height: HERO_ART }} label={hero.name}
              fallback={<GameIcon name={hero.kind === 'pin' ? 'pin' : 'gift'} size={104} />} />
          </View>
          <Text style={styles.name}>{hero.name}</Text>
          {!!wardrobe && <Text style={[styles.line, isOwned(hero) && styles.owned]}>{wardrobe}</Text>}
          {rest.length > 0 && (
            <View style={styles.rest}>
              {rest.slice(0, 4).map((item, i) => (
                <View key={`${item.item_id ?? item.name}-${i}`} style={styles.small} accessible
                  accessibilityLabel={`${item.name}${isOwned(item) ? ', already yours' : ''}`}>
                  <ArtImage uri={item.image} style={{ width: 44, height: 44 }} fallback={<GameIcon name={item.kind === 'pin' ? 'pin' : 'gift'} size={32} />} />
                  <Text style={styles.smallName} numberOfLines={2}>{item.name}</Text>
                  {isOwned(item) && <Text style={styles.smallOwned}>Already yours</Text>}
                </View>
              ))}
            </View>
          )}
          {!!pinLine && (openPins ? (
            <Pressable accessibilityRole="link" accessibilityLabel="On your Deep Lantern too. Open your pins." onPress={openPins}
              hitSlop={8} style={styles.pinLink}>
              <GameIcon name="pin" size={16} />
              <Text style={styles.pinLinkText}>{pinLine}</Text>
            </Pressable>
          ) : <Text style={styles.line}>{pinLine}</Text>)}
          {reveal.chips.length > 0 && <Text style={styles.chips}>{reveal.chips.join('   ')}</Text>}
          <NightButton label="Nice!" onPress={onClose} style={{ marginTop: 14, alignSelf: 'stretch' }} />
        </NightCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // Opaque haunt violet like the Case File card, so the busy map never reads through.
  card: { width: '100%', maxWidth: 340, alignItems: 'center', borderColor: NIGHT.candy, backgroundColor: NIGHT.haunt },
  headline: { fontFamily: 'Shark', fontSize: 22, color: NIGHT.candy, textAlign: 'center' },
  artWell: { width: HERO_ART + 20, height: HERO_ART + 20, borderRadius: (HERO_ART + 20) / 2, backgroundColor: 'rgba(255,179,71,0.18)',
    alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  name: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.white, textAlign: 'center', marginTop: 10 },
  line: { fontFamily: 'Knockout', fontSize: 15, color: NIGHT.fogLight, textAlign: 'center', marginTop: 4 },
  owned: { color: NIGHT.moon },
  rest: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  small: { width: 70, alignItems: 'center' },
  smallName: { fontFamily: 'Knockout', fontSize: 12, color: NIGHT.fog, textAlign: 'center', marginTop: 2 },
  smallOwned: { fontFamily: 'Knockout', fontSize: 11, color: NIGHT.moon, textAlign: 'center' },
  pinLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, minHeight: 32, paddingHorizontal: 10,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
  pinLinkText: { fontFamily: 'Knockout', fontSize: 15, color: NIGHT.fogLight, textDecorationLine: 'underline' },
  chips: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.lantern, marginTop: 10 },
});
