/**
 * Development-only: the mini-game share pictures (Whack and Memory) with sample results, so the
 * story pictures can be made and checked without playing a round. Each Share button is the real
 * one from the results screen (same frame, capture and grown-up gate).
 * With the route param { rideCard: true }: the real ride card outside a park (the story picture and its Share).
 * With the route param { box: true }: the real box reveal with one golden chaser pull, a
 * "Wear it" that saves after a beat (nothing is sent), to check the footer and Share placement.
 */
import { useRoute } from '@react-navigation/native';
import { ScrollView, Text, View } from 'react-native';
import BoxReveal from './pins/BoxReveal';
import { ShareCardButton, TILE_DECOY, TILE_GOOD, TILE_LATE, TILE_QUICK } from '../games/whack/ui/ShareCard';
import { ShareBack } from '../games/memory/MemoryExtras';
import ShareableRideCard from '../components/RideTracker/ShareableRideCard';
import { SHARK_REACTIONS } from '../components/RideTracker/SharkReactionIcon';
import { LocationStatusContext } from '../context/LocationProvider';
import type { PlayerRideType } from '../api/endpoints/player-rides';

const TILES = Array.from({ length: 40 }, (_, i) => (i % 9 === 4 ? TILE_DECOY : i % 4 === 0 ? TILE_QUICK : i % 7 === 3 ? TILE_LATE : TILE_GOOD));

// A real pin's art from the public CDN (Magic Hat Pin), so the reveal and the share card show the pin itself.
const CHASER = { id: 1, item_id: 7, pin_id: 7, name: 'Magic Hat Pin', icon_url: 'https://assets.themeparkshark.com/mobile/production/assets/LgZqx5CI6PNN0qmSBNXqF9nTjr70nc5J9iocdOwz.png', is_chaser: true, by_pity: false, serial: 12, duplicate: false, golden: true };

// A first ride with a reaction, a note and a wait: the card must show none of the note, wait or date.
const RIDE: PlayerRideType = { id: 1, ride_id: 580, ride_name: 'Indiana Jones Adventure', ride_slug: 'indiana-jones-adventure', ride_type: 'ride',
  ride_image_url: null, park_id: 8, rating: 5, reaction: SHARK_REACTIONS[4].code, wait_time_minutes: 35, note: 'A typed note that never ships',
  photo_url: null, rode_at: '2026-10-22T11:43:00Z', weather: null };

export default function SharePicturesPreviewScreen() {
  const params = useRoute().params as { box?: boolean; rideCard?: boolean } | undefined;
  if (params?.rideCard) {
    return (
      <LocationStatusContext.Provider value={{ park: null } as never}>
        <View style={{ flex: 1, backgroundColor: '#0866A9', justifyContent: 'center', paddingHorizontal: 16 }}>
          <ShareableRideCard ride={RIDE} rideCount={1} />
        </View>
      </LocationStatusContext.Provider>
    );
  }
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
