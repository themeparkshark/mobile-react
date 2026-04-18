import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet } from 'react-native';
import PostWinRewardsModal from '../components/PostWinRewardsModal';

export default function PostWinRewardsPreviewScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.bg}>
        <Text style={styles.label}>Reward Flow Preview</Text>
      </View>
      <PostWinRewardsModal
        visible={true}
        rideName="Butter Drink"
        taskCoinUrl="https://assets.themeparkshark.com/mobile/production/task-coins/butter-drink.png"
        coinsEarned={37}
        xpEarned={51}
        ridePartsEarned={2}
        energyEarned={10}
        parkCoinProgress={true}
        onClose={() => {}}
      />
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
