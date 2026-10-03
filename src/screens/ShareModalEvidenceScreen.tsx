/**
 * Development-only: the three in-modal Share buttons, for the evidence recording
 * (panel r2-fasttrack blocker 2). EXPO_PUBLIC_SHARE_EVIDENCE picks the scenario:
 *   coin5    the real coin sheet at Lv4, levels up to Lv5, Share in the success state
 *   crowned  the real coin sheet at Lv9, levels up into the Crowning, Share on its card
 *   podium   the real Home Hunt results modal, #2 this week, Share under Claim
 * EXPO_PUBLIC_SHARE_AUTODRIVE presses the buttons (src/share/devDrive.ts).
 * EXPO_PUBLIC_SHARE_THEN_PARKDAY=1 opens a Park Day share 6 s after the modal
 * flow, to show the queue is free afterwards.
 */
import { useEffect, useState } from 'react';
import { ImageBackground, SafeAreaView, Text } from 'react-native';
import CoinLevelingModal from '../components/CoinLevelingModal';
import HomeHuntResultsModal from '../components/home/HomeHuntResultsModal';
import { PREVIEW_BOSS, PREVIEW_LEVEL_XP, previewPerkTrack, previewUnlocks } from '../components/coin/previewFixtures';
import type { RideCoinLevelType } from '../models/ride-coin-level-type';
import { shareFlex } from '../share';
import { parkDayFlexPayload } from '../share/parkDay';
import { markDevStub } from '../share/devDrive';

const SCENARIO = process.env.EXPO_PUBLIC_SHARE_EVIDENCE ?? 'coin5';
const PROD = 'https://assets.themeparkshark.com/mobile/production/assets';
const COIN_URL = `${PROD}/vNgekqJJn9PbI2NjD4VSjgnexTtiuqfWS4QalA99.png`;
const V2_PARTS: Readonly<Record<number, number>> = { 5: 10, 10: 52 };
const V2_ENERGY: Readonly<Record<number, number>> = { 5: 50, 10: 260 };

function coinAt(level: number): RideCoinLevelType {
  return {
    id: 1, ride_id: 1, ride_name: 'Sample Ride', coin_url: COIN_URL, current_level: level, max_level: 10, times_collected: 31,
    energy_to_next_level: V2_ENERGY[level + 1] ?? 0, parts_to_next_level: V2_PARTS[level + 1] ?? 0, required_parts: [],
    player_level_required: 1, is_unlocked: true, current_perks: [], next_level_perks: [],
    perk_track: previewPerkTrack(level), parts_banked: 60, polish: { stars: 0, next_cost: 20 }, boss: level >= 5 ? PREVIEW_BOSS : null,
  } as RideCoinLevelType;
}

export default function ShareModalEvidenceScreen() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_SHARE_THEN_PARKDAY !== '1') return;
    const t = setTimeout(() => {
      setOpen(false);
      setTimeout(() => {
        console.log('SHARE_DRIVE park_day');
        shareFlex('park_day', parkDayFlexPayload({ distinct_rides_won: 7, new_coins: 3,
          coins: [{ asset_id: 1, ride_name: 'x', coin_url: COIN_URL, new: true }] }), { surface: 'park_day' });
      }, 900);
    }, Number(process.env.EXPO_PUBLIC_SHARE_PARKDAY_AT || 9000));
    return () => clearTimeout(t);
  }, []);
  const from = SCENARIO === 'crowned' ? 9 : 4;
  const coin = coinAt(from);
  const next = coinAt(from + 1);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0866A9' }}>
      <ImageBackground source={require('../../assets/images/water_background.png')} style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: 'Shark', fontSize: 24, color: '#FFFFFF' }}>{`Share evidence: ${SCENARIO}`}</Text>
      </ImageBackground>
      {SCENARIO === 'podium'
        ? <HomeHuntResultsModal visible={open} onClose={() => setOpen(false)} onClaimed={() => undefined}
            result={{ week_key: '2026-W40', status: 'held', rank: 2, percentile: 1, tier_key: 'podium', tier_label: 'Podium',
              board_label: 'Tampa Area', points: 1840, finds: 46, rewards: {} }} />
        : <CoinLevelingModal visible={open} rideCoin={coin} playerEnergy={1000} playerParts={80}
            onClose={() => setOpen(false)}
            onLevelUp={markDevStub(async () => ({ success: true, ride_coin: next, spent: { energy: coin.energy_to_next_level, ride_parts: coin.parts_to_next_level },
              xp: PREVIEW_LEVEL_XP[from + 1] ?? 0, unlocks: previewUnlocks(from + 1) }))}
            onFeature={async () => true} />}
    </SafeAreaView>
  );
}
