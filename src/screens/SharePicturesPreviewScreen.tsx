/**
 * Development-only: the mini-game share pictures (Whack and Memory) with sample results, so the
 * story pictures can be made and checked without playing a round. Each Share button is the real
 * one from the results screen (same frame, capture and grown-up gate).
 * With the route param { box: true }: the real box reveal with one golden chaser pull, a
 * "Wear it" that saves after a beat (nothing is sent), to check the footer and Share placement.
 */
import { useRoute } from '@react-navigation/native';
import { ScrollView, Text, View } from 'react-native';
import BoxReveal from './pins/BoxReveal';
import { ShareCardButton, TILE_DECOY, TILE_GOOD, TILE_LATE, TILE_QUICK } from '../games/whack/ui/ShareCard';
import { ShareBack } from '../games/memory/MemoryExtras';

const TILES = Array.from({ length: 40 }, (_, i) => (i % 9 === 4 ? TILE_DECOY : i % 4 === 0 ? TILE_QUICK : i % 7 === 3 ? TILE_LATE : TILE_GOOD));

const CHASER = { id: 1, item_id: 900001, pin_id: 1, name: 'Golden Fin', icon_url: null, is_chaser: true, by_pity: false, serial: 12, duplicate: false, golden: true };

export default function SharePicturesPreviewScreen() {
  const params = useRoute().params as { box?: boolean } | undefined;
  if (params?.box) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0866A9' }}>
        <BoxReveal pulls={[CHASER]} tone="gold" golden still={false} onDone={() => undefined} canWear={() => true}
          onWear={() => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 800))} lanyard={[]} />
      </View>
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0866A9' }} contentContainerStyle={{ paddingTop: 80, paddingBottom: 60, gap: 24, alignItems: 'center' }}>
      <Text style={{ fontFamily: 'Shark', fontSize: 22, color: '#ffffff' }}>Whack-a-Shark</Text>
      <ShareCardButton tiles={TILES} rideName="Sample Ride" score={12840} stars={2} />
      <Text style={{ fontFamily: 'Shark', fontSize: 22, color: '#ffffff' }}>Memory Match</Text>
      <View style={{ width: '100%', paddingHorizontal: 16 }}>
        <ShareBack onBack={() => undefined} daily={{ day: '2026-10-23', ranked: true, cleared: true, turns: 14, pairs: 8, stars: 3, streak: 4,
          verdicts: [2, 2, 1, 2, 0, 2, 1, 2, 2, 1, 2, 2, 0, 2], deckId: 'classic', recall: 86 }} />
      </View>
    </ScrollView>
  );
}
