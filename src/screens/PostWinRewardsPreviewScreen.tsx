import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import PostWinRewardsModal from '../components/PostWinRewardsModal';
import { parkWinNote } from './LeaderboardsScreen/standingsCache';
import CoinLevelingModal from '../components/CoinLevelingModal';
import type { RideCoinLevelType } from '../models/ride-coin-level-type';

const repeatPreview = __DEV__ && process.env.EXPO_PUBLIC_POST_WIN_REPEAT_PREVIEW === '1';
const firstWinPreview = __DEV__ && process.env.EXPO_PUBLIC_POST_WIN_FIRST_PREVIEW === '1';
const previewCoin: RideCoinLevelType = {
  id: 53, ride_id: 1, ride_name: 'Space Mountain',
  coin_url: 'https://assets.themeparkshark.com/mobile/production/assets/r6pPIyzacnukCvbqkMqjqEB8BczIujFYwhc4YDYB.png',
  current_level: 1, max_level: 5, times_collected: repeatPreview ? 9 : 1,
  available_parts: firstWinPreview ? 1 : 2, energy_to_next_level: 10, parts_to_next_level: 2,
  required_parts: [], player_level_required: 1, is_unlocked: true,
  current_perks: [], next_level_perks: [],
};

export default function PostWinRewardsPreviewScreen() {
  // Dev only: EXPO_PUBLIC_STANDINGS_GOAL_PREVIEW=1 parks a Standings goal note, as a real win would.
  useState(() => {
    if (__DEV__ && process.env.EXPO_PUBLIC_STANDINGS_GOAL_PREVIEW === '1') {
      parkWinNote({ text: 'Weekly goal: 8 rides! +25 XP', big: true }, () => undefined);
    }
    return null;
  });
  const [showWin, setShowWin] = useState(true);
  const [showCoin, setShowCoin] = useState(false);
  const [openCoinAfterHide, setOpenCoinAfterHide] = useState(false);
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bg}>
        <Text style={styles.label}>Reward Flow Preview</Text>
      </View>
      <PostWinRewardsModal
        visible={showWin}
        rideName="Space Mountain"
        taskCoinUrl={previewCoin.coin_url}
        rideControl={{ ride_name: 'Space Mountain', team: 'shark', points: 23, underdog: true, controller: 'shark',
          previous_controller: 'globe', flipped: true, captain: 1 }}
        playerId={1}
        coinsEarned={firstWinPreview ? 25 : 37}
        xpEarned={firstWinPreview ? 50 : 51}
        ridePartsEarned={firstWinPreview ? 1 : 2}
        energyEarned={10}
        coinTimesCollected={repeatPreview ? 9 : 1}
        earnedEdition={firstWinPreview || repeatPreview ? null : { id: 1, name: 'Starlight Crew', color: '#C39BFF',
          project_title: 'The Missing Signal', source: 'Ride challenge',
          earned_at: '2026-09-24T12:00:00Z' }}
        earnedStamp={repeatPreview ? null : { id: 1, name: 'First Park Coin', rewards: {
          energy: 10, tickets: 0, xp: 50, coins: 0, title: null,
        } }}
        coinProgress={previewCoin}
        playerEnergy={firstWinPreview ? 10 : 25}
        onViewCoin={() => { setOpenCoinAfterHide(true); setShowWin(false); }}
        onHidden={() => {
          if (openCoinAfterHide) {
            setOpenCoinAfterHide(false);
            setShowCoin(true);
          }
        }}
        onViewStampBook={() => {}}
        onClose={() => setShowWin(false)}
      />
      <CoinLevelingModal visible={showCoin} rideCoin={previewCoin}
        playerEnergy={firstWinPreview ? 10 : 25} playerParts={firstWinPreview ? 1 : 2}
        onClose={() => { setShowCoin(false); setShowWin(true); }}
        onLevelUp={async () => true} onFeature={async () => true} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050816',
  },
  bg: {
    flex: 1,
    backgroundColor: '#050816',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
  },
});
