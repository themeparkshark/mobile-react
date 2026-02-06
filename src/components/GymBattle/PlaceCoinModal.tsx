import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, BounceIn } from 'react-native-reanimated';
import { placeCoin, getMyParkCoins, ParkCoin } from '../../api/endpoints/gym-battle';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Level colors matching the coin shelf
const LEVEL_COLORS = {
  0: '#6B7280', // Not collected - gray
  1: '#a8a29e', // Basic - stone
  2: '#cbd5e1', // Silver
  3: '#fbbf24', // Gold
  4: '#c4b5fd', // Prismatic
  5: '#fb923c', // Legendary
};

const LEVEL_NAMES = {
  0: 'Not Collected',
  1: 'Basic',
  2: 'Silver',
  3: 'Gold',
  4: 'Prismatic',
  5: 'Legendary',
};

interface CoinOption {
  task_id: number;
  name: string;
  coin_url: string;
  level: number;
  times_collected: number;
  points: number;
}

interface Props {
  visible: boolean;
  parkId: number;
  onComplete: () => void;
  onClose: () => void;
}

type PlaceState = 'loading' | 'select' | 'placing' | 'success' | 'error' | 'empty';

export default function PlaceCoinModal({
  visible,
  parkId,
  onComplete,
  onClose,
}: Props) {
  const [state, setState] = useState<PlaceState>('loading');
  const [coins, setCoins] = useState<CoinOption[]>([]);
  const [selectedCoin, setSelectedCoin] = useState<CoinOption | null>(null);
  const [result, setResult] = useState<{ message: string; points: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load coins when modal opens
  useEffect(() => {
    if (visible) {
      loadCoins();
    } else {
      // Reset state when closing
      setState('loading');
      setSelectedCoin(null);
      setResult(null);
      setError(null);
    }
  }, [visible, parkId]);

  const loadCoins = async () => {
    setState('loading');
    try {
      const parkCoins = await getMyParkCoins(parkId);
      
      // Convert to coin options format
      const coinOptions: CoinOption[] = parkCoins
        .map((coin: ParkCoin) => ({
          task_id: coin.task_id,
          name: coin.name,
          coin_url: coin.coin_url,
          level: coin.level,
          times_collected: coin.times_completed,
          points: coin.points,
        }))
        .sort((a, b) => b.level - a.level); // Sort by level desc

      setCoins(coinOptions);
      
      if (coinOptions.length === 0) {
        setState('empty');
      } else {
        setState('select');
        // Auto-select the highest level coin
        setSelectedCoin(coinOptions[0]);
      }
    } catch (err) {
      console.error('Failed to load coins:', err);
      setState('error');
      setError('Failed to load your coins');
    }
  };

  const handlePlace = async () => {
    if (!selectedCoin) return;
    
    setState('placing');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const response = await placeCoin(parkId, selectedCoin.level || 1);
      setResult({
        message: response.message,
        points: response.points_added,
      });
      setState('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to place coin!');
      setState('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleClose = () => {
    if (state === 'success') {
      onComplete();
    } else {
      onClose();
    }
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={state === 'select' || state === 'empty' ? handleClose : undefined}
      backdropOpacity={0.9}
      style={styles.modal}
    >
      <View style={styles.container}>
        <View style={styles.gradient}>
          {/* Loading */}
          {state === 'loading' && (
            <View style={styles.content}>
              <ActivityIndicator size="large" color="#FBBF24" />
              <Text style={styles.loadingText}>Loading your coins...</Text>
            </View>
          )}

          {/* Empty - No coins collected */}
          {state === 'empty' && (
            <View style={styles.content}>
              <Text style={styles.emptyEmoji}>🪙</Text>
              <Text style={styles.emptyTitle}>No Coins Yet!</Text>
              <Text style={styles.emptyMessage}>
                Collect coins by completing tasks at attractions in this park first!
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>GOT IT</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Select Coin */}
          {state === 'select' && (
            <Animated.View entering={FadeIn} style={styles.content}>
              <Text style={styles.title}>🪙 PLACE YOUR COIN 🪙</Text>
              <Text style={styles.subtitle}>Select a coin from your collection:</Text>

              <ScrollView 
                style={styles.coinList}
                contentContainerStyle={styles.coinListContent}
                showsVerticalScrollIndicator={false}
              >
                {coins.map((coin) => (
                  <TouchableOpacity
                    key={coin.task_id}
                    style={[
                      styles.coinRow,
                      selectedCoin?.task_id === coin.task_id && styles.coinRowSelected,
                      { borderColor: LEVEL_COLORS[coin.level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[1] },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCoin(coin);
                    }}
                  >
                    <Image
                      source={{ uri: coin.coin_url }}
                      style={styles.coinImage}
                      contentFit="contain"
                    />
                    <View style={styles.coinInfo}>
                      <Text style={styles.coinName} numberOfLines={1}>{coin.name}</Text>
                      <Text style={[
                        styles.coinLevel, 
                        { color: LEVEL_COLORS[coin.level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[1] }
                      ]}>
                        {LEVEL_NAMES[coin.level as keyof typeof LEVEL_NAMES] || 'Basic'} (Lv.{coin.level})
                      </Text>
                    </View>
                    <View style={styles.coinPoints}>
                      <Text style={styles.pointsValue}>+{coin.points}</Text>
                      <Text style={styles.pointsLabel}>pts</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedCoin && (
                <View style={styles.selectedInfo}>
                  <Text style={styles.selectedLabel}>Selected:</Text>
                  <Text style={[
                    styles.selectedName, 
                    { color: LEVEL_COLORS[selectedCoin.level as keyof typeof LEVEL_COLORS] || LEVEL_COLORS[1] }
                  ]}>
                    {selectedCoin.name}
                  </Text>
                  <Text style={styles.selectedPoints}>
                    +{selectedCoin.points} points for your team!
                  </Text>
                </View>
              )}

              <TouchableOpacity 
                style={[styles.placeButton, !selectedCoin && styles.placeButtonDisabled]} 
                onPress={handlePlace}
                disabled={!selectedCoin}
              >
                <Text style={styles.placeButtonText}>PLACE COIN!</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Placing */}
          {state === 'placing' && (
            <View style={styles.content}>
              <Text style={styles.placingText}>🪙 Placing coin...</Text>
            </View>
          )}

          {/* Success */}
          {state === 'success' && result && (
            <Animated.View entering={BounceIn} style={styles.content}>
              <Text style={styles.successEmoji}>🎉</Text>
              <Text style={styles.successTitle}>COIN PLACED!</Text>
              <Text style={styles.successPoints}>+{result.points} points!</Text>
              <Text style={styles.resultMessage}>
                You're now in the battle! Check in every 30 mins for more points!
              </Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>LET'S GO!</Text>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Error */}
          {state === 'error' && (
            <View style={styles.content}>
              <Text style={styles.errorEmoji}>😢</Text>
              <Text style={styles.errorTitle}>Oops!</Text>
              <Text style={styles.errorMessage}>{error}</Text>
              <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneText}>OK</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: SCREEN_W - 40,
    maxHeight: SCREEN_H * 0.8,
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    padding: 24,
    backgroundColor: '#0F172A',
  },
  content: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FBBF24',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 16,
  },
  coinList: {
    width: '100%',
    maxHeight: 280,
  },
  coinListContent: {
    gap: 8,
  },
  coinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  coinRowSelected: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderWidth: 3,
  },
  coinImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  coinInfo: {
    flex: 1,
    marginLeft: 12,
  },
  coinName: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
  coinLevel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  coinPoints: {
    alignItems: 'flex-end',
  },
  pointsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#22C55E',
  },
  pointsLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  selectedInfo: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 16,
    width: '100%',
  },
  selectedLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  selectedName: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },
  selectedPoints: {
    fontSize: 16,
    color: '#22C55E',
    fontWeight: '700',
    marginTop: 4,
  },
  placeButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginBottom: 12,
  },
  placeButtonDisabled: {
    backgroundColor: '#374151',
  },
  placeButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#64748B',
    fontSize: 16,
  },
  placingText: {
    fontSize: 20,
    color: '#FBBF24',
    fontWeight: '700',
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FBBF24',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  successEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#22C55E',
    marginBottom: 8,
  },
  successPoints: {
    fontSize: 24,
    color: '#FBBF24',
    fontWeight: '800',
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F87171',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 20,
  },
  doneButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  doneText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
  },
});
