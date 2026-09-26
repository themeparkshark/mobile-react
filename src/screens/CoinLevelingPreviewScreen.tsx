import { useState } from 'react';
import { ImageBackground, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import CoinLevelingModal from '../components/CoinLevelingModal';
import { RideCoinLevelType } from '../models/ride-coin-level-type';

const sampleCoin: RideCoinLevelType = {
  id: 1,
  ride_id: 1,
  ride_name: 'Space Mountain',
  coin_url: '',
  current_level: 1,
  max_level: 5,
  times_collected: 1,
  energy_to_next_level: 10,
  parts_to_next_level: 2,
  required_parts: [],
  player_level_required: 1,
  is_unlocked: true,
  current_perks: [{ id: 2001, name: 'Park Gym Power', icon_url: '', type: 'gym_points',
    value: 100, description: 'Place this coin in a park gym for 100 team points.' }],
  next_level_perks: [{ id: 2002, name: 'Park Gym Power', icon_url: '', type: 'gym_points',
    value: 200, description: 'Place this coin in a park gym for 200 team points.' }],
};

export default function CoinLevelingPreviewScreen() {
  const [open, setOpen] = useState(true);
  const [featured, setFeatured] = useState(false);
  const maxPreview = __DEV__ && process.env.EXPO_PUBLIC_COIN_MAX_PREVIEW === '1';
  const previewCoin: RideCoinLevelType = maxPreview ? {
    ...sampleCoin,
    current_level: 5,
    energy_to_next_level: 0,
    parts_to_next_level: 0,
    current_perks: [{ id: 2005, name: 'Park Gym Power', icon_url: '', type: 'gym_points',
      value: 500, description: 'Place this coin in a park gym for 500 team points.' }],
    next_level_perks: [],
  } : sampleCoin;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0866A9' }}>
      <ImageBackground source={require('../../assets/images/water_background.png')}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#FFFFFF' }}>COIN SHELF</Text>
        <TouchableOpacity onPress={() => setOpen(true)} style={{ marginTop: 20,
          backgroundColor: '#F9C94C', borderRadius: 14, padding: 14 }}>
          <Text style={{ fontFamily: 'Shark', fontSize: 18, color: '#18436C' }}>OPEN COIN</Text>
        </TouchableOpacity>
      </ImageBackground>
      <CoinLevelingModal visible={open} rideCoin={{ ...previewCoin, is_featured: featured }}
        playerEnergy={25} playerParts={4}
        onClose={() => setOpen(false)} onLevelUp={async () => true}
        onFeature={async () => { setFeatured(!featured); return true; }} />
    </SafeAreaView>
  );
}
