import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Modal from 'react-native-modal';
import Lottie from 'lottie-react-native';
import * as Haptics from 'expo-haptics';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

interface Props {
  visible: boolean;
  rideName: string;
  taskCoinUrl?: string; // the ride/task coin image
  coinsEarned: number;
  xpEarned: number;
  ridePartsEarned: number;
  energyEarned: number;
  parkCoinProgress?: boolean; // whether this contributed to a park coin
  onClose: () => void;
}

/**
 * Post-win rewards modal showing EVERYTHING earned after completing a mini-game.
 * Shark Coins, XP, Ride Parts, Energy, and Park Coin progress.
 */
export default function PostWinRewardsModal({
  visible,
  rideName,
  taskCoinUrl,
  coinsEarned,
  xpEarned,
  ridePartsEarned,
  energyEarned,
  parkCoinProgress = true,
  onClose,
}: Props) {
  const cardScale = useRef(new Animated.Value(0)).current;
  const rowAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    if (visible) {
      cardScale.setValue(0);
      rowAnims.forEach(a => a.setValue(0));

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Card bounces in, then rows stagger
      Animated.sequence([
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.stagger(120, rowAnims.map(anim =>
          Animated.spring(anim, {
            toValue: 1,
            tension: 80,
            friction: 6,
            useNativeDriver: true,
          })
        )),
      ]).start();
    }
  }, [visible]);

  const rewards = [
    {
      icon: taskCoinUrl ? { uri: taskCoinUrl } : null,
      emoji: undefined,
      amount: 1,
      label: `${rideName} Coin`,
      color: '#4cdcff',
      bgColor: '#0a2a3e',
      show: !!taskCoinUrl,
      isTaskCoin: true,
    },
    {
      icon: require('../../assets/images/coingold.png'),
      amount: coinsEarned,
      label: 'Shark Coins',
      color: '#FFD700',
      bgColor: '#3b2800',
      show: coinsEarned > 0,
    },
    {
      icon: require('../../assets/images/screens/explore/xp.png'),
      amount: xpEarned,
      label: 'Experience',
      color: '#4ade80',
      bgColor: '#0a2e14',
      show: xpEarned > 0,
    },
    {
      icon: null,
      emoji: '⚙️',
      amount: ridePartsEarned,
      label: `${rideName} Ride Parts`,
      color: '#818cf8',
      bgColor: '#1e1b4b',
      show: ridePartsEarned > 0,
    },
    {
      icon: null,
      emoji: '⚡',
      amount: energyEarned,
      label: 'Energy',
      color: '#fbbf24',
      bgColor: '#3b2800',
      show: energyEarned > 0,
    },
    {
      icon: null,
      emoji: '🏅',
      amount: null,
      label: 'Park Coin Progress',
      color: '#f472b6',
      bgColor: '#4a0e2b',
      show: parkCoinProgress,
      isProgress: true,
    },
  ];

  const visibleRewards = rewards.filter(r => r.show);

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      onBackdropPress={onClose}
      backdropOpacity={0.85}
    >
      <View style={styles.container}>
        {/* Confetti */}
        <Lottie
          source={require('../../assets/animations/confetti.json')}
          autoPlay
          loop
          style={styles.confetti}
        />

        <Animated.View
          style={[
            styles.card,
            { transform: [{ scale: cardScale }] },
          ]}
        >
          <Ribbon text="Challenge Complete!" />

          <View style={styles.content}>
            <Text style={styles.subtitle}>
              You conquered {rideName}!
            </Text>

            {/* Reward rows */}
            {visibleRewards.map((reward, index) => (
              <Animated.View
                key={reward.label}
                style={[
                  styles.rewardRow,
                  { backgroundColor: reward.bgColor },
                  {
                    transform: [{ scale: rowAnims[index] ?? new Animated.Value(1) }],
                    opacity: rowAnims[index] ?? 1,
                  },
                ]}
              >
                <View style={[
                  styles.rewardIconCircle,
                  { backgroundColor: `${reward.color}25` },
                  reward.isTaskCoin && { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: `${reward.color}60` },
                ]}>
                  {reward.icon ? (
                    <Image
                      source={reward.icon}
                      style={{ width: reward.isTaskCoin ? 40 : 32, height: reward.isTaskCoin ? 40 : 32 }}
                      contentFit="contain"
                    />
                  ) : (
                    <Text style={styles.rewardEmoji}>{reward.emoji}</Text>
                  )}
                </View>
                <View style={styles.rewardInfo}>
                  {reward.isProgress ? (
                    <Text style={[styles.rewardProgress, { color: reward.color }]}>
                      +1 Step Closer!
                    </Text>
                  ) : (
                    <Text style={[styles.rewardAmount, { color: reward.color }]}>
                      +{reward.amount}
                    </Text>
                  )}
                  <Text style={styles.rewardLabel}>
                    {reward.label}
                  </Text>
                </View>
              </Animated.View>
            ))}

            <Text style={styles.hint}>
              Use Ride Parts + Energy to level up your ride coins!
            </Text>

            <View style={styles.buttonContainer}>
              <YellowButton text="Awesome!" onPress={onClose} />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: {
    position: 'absolute',
    width: 900,
    height: 400,
    top: 15,
    zIndex: 20,
    left: -80,
  },
  card: {
    width: Dimensions.get('window').width - 40,
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    marginTop: '-10%',
    width: '85%',
    padding: 20,
    paddingTop: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.4)',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 0.3,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: 'Knockout',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rewardEmoji: {
    fontSize: 22,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Shark',
  },
  rewardProgress: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Shark',
  },
  rewardLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Knockout',
    fontSize: 12,
    marginTop: 1,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 14,
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: 4,
  },
});
