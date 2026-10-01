import { useState } from 'react';
import { ImageBackground, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import CoinLevelingModal from '../components/CoinLevelingModal';
import { RideCoinLevelType } from '../models/ride-coin-level-type';
import { PREVIEW_BOSS, PREVIEW_LEVEL_XP, previewPerkTrack, previewUnlocks } from '../components/coin/previewFixtures';

/** Progression v2 preview: EXPO_PUBLIC_COIN_PREVIEW_LEVEL=1..9 opens a Level 10 curve coin one step below the next level. */
const V2_PARTS: Readonly<Record<number, number>> = { 2: 2, 3: 4, 4: 6, 5: 10, 6: 14, 7: 20, 8: 30, 9: 40, 10: 52 };
const V2_ENERGY: Readonly<Record<number, number>> = { 2: 10, 3: 20, 4: 30, 5: 50, 6: 75, 7: 110, 8: 150, 9: 200, 10: 260 };

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
  const v2Level = __DEV__ ? Number(process.env.EXPO_PUBLIC_COIN_PREVIEW_LEVEL || 0) : 0;
  const v2Coin: RideCoinLevelType | null = v2Level >= 1 && v2Level <= 10 ? {
    ...sampleCoin,
    current_level: v2Level,
    max_level: 10,
    energy_to_next_level: V2_ENERGY[v2Level + 1] ?? 0,
    parts_to_next_level: V2_PARTS[v2Level + 1] ?? 0,
    current_perks: [],
    next_level_perks: [],
    tier: undefined,
    perk_track: previewPerkTrack(v2Level, v2Level >= 4 ? ['double_day'] : []),
    parts_banked: 34,
    polish: { stars: 0, next_cost: 20 },
    boss: v2Level >= 5 ? PREVIEW_BOSS : null,
  } : null;
  const previewCoin: RideCoinLevelType = v2Coin ?? (maxPreview ? {
    ...sampleCoin,
    current_level: 5,
    energy_to_next_level: 0,
    parts_to_next_level: 0,
    current_perks: [{ id: 2005, name: 'Park Gym Power', icon_url: '', type: 'gym_points',
      value: 500, description: 'Place this coin in a park gym for 500 team points.' }],
    next_level_perks: [],
  } : sampleCoin);
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
        playerEnergy={v2Coin ? 1000 : 25} playerParts={v2Coin ? 60 : 4}
        onClose={() => setOpen(false)}
        onLevelUp={async () => (v2Coin ? { success: true, ride_coin: v2Coin, spent: { energy: v2Coin.energy_to_next_level,
          ride_parts: v2Coin.parts_to_next_level }, xp: PREVIEW_LEVEL_XP[v2Level + 1] ?? 0, unlocks: previewUnlocks(v2Level + 1) } : true)}
        onFeature={async () => { setFeatured(!featured); return true; }} />
    </SafeAreaView>
  );
}
