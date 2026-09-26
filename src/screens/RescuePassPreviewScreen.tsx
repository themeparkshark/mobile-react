import { useContext } from 'react';
import { Image, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RedeemRedeemableModal from '../components/RedeemRedeemableModal';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { LocationContext } from '../context/LocationProvider';
import type { PlayerType } from '../models/player-type';
import type { ParkType } from '../models/park-type';
import type { CurrentRedeemableType } from '../models/current-redeemable-type';
import type { CurrencyType } from '../models/currency-type';

const sampleCoinUrl = Image.resolveAssetSource(require('../../assets/images/coingold.png')).uri;
const park = {
  id: 1, name: 'Magic Kingdom', display_name: 'Magic Kingdom',
  coin_url: sampleCoinUrl,
} as ParkType;
const rescueRedeemable: CurrentRedeemableType = {
  type: 'task', rescue_pass_available: true,
  model: { id: 1, name: 'Space Mountain', asset_id: 1, ticket_cost: 1,
    coin_url: sampleCoinUrl,
    coins: 25, experience: 50, energy_reward: 10, ride_parts_reward: 1,
    completion_goal: 1, latitude: '28.4194', longitude: '-81.5778', times_completed: 0 },
};

/** Sample-only presentation of the real zero-Ticket ride modal. */
export default function RescuePassPreviewScreen() {
  const spentPreview = process.env.EXPO_PUBLIC_RESCUE_PASS_SPENT_PREVIEW === '1';
  const redeemable = spentPreview
    ? { ...rescueRedeemable, rescue_pass_available: false, rescue_pass_used_today: true }
    : rescueRedeemable;
  const auth = useContext(AuthContext);
  const location = useContext(LocationContext);
  const wallet = useContext(CurrencyContext);
  return <AuthContext.Provider value={{ ...auth,
      player: { ...(auth.player ?? {}), id: 999999, tickets: 0 } as PlayerType }}>
    <LocationContext.Provider value={{ ...location,
      location: { latitude: 28.4194, longitude: -81.5778 } }}>
      <CurrencyContext.Provider value={{ ...wallet,
        currencies: [{ id: 1, icon_url: park.coin_url } as CurrencyType] }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0b72bf' }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontFamily: 'Shark', fontSize: 24 }}>
              {spentPreview ? 'REFRESH TICKETS' : 'SHARK RESCUE PASS'}
            </Text>
          </View>
          <RedeemRedeemableModal open previewOnly park={park} redeemable={redeemable}
            onPress={() => {}} close={() => {}} />
        </SafeAreaView>
      </CurrencyContext.Provider>
    </LocationContext.Provider>
  </AuthContext.Provider>;
}
