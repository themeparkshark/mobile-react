import Lottie from 'lottie-react-native';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from '../helpers/haptics';
import { celebrationHaptic } from '../helpers/animations';
import config from '../config';
import YellowButton from './YellowButton';

interface Props {
  visible: boolean;
  level: number;
  onClose: () => void;
  rewards?: {
    coins?: number;
    energy?: number;
    tickets?: number;
    unlocks?: string[];
  };
}

/**
 * Epic level-up celebration modal.
 * Makes leveling up feel like a HUGE achievement.
 */
export default function LevelUpCelebration({ visible, level, onClose, rewards }: Props) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const levelScaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const rewardsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Haptic celebration pattern
      celebrationHaptic();
      
      // Animate entrance
      Animated.sequence([
        // Pop in the modal
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 100,
          useNativeDriver: true,
        }),
        // Delay, then pop in the level number with extra bounce
        Animated.delay(200),
      ]).start();

      // Level number animation
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Animated.spring(levelScaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 80,
          useNativeDriver: true,
        }).start();
      }, 400);

      // Glow pulse
      setTimeout(() => {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
            Animated.timing(glowAnim, { toValue: 0.5, duration: 1000, useNativeDriver: false }),
          ])
        ).start();
      }, 600);

      // Confetti progress
      Animated.loop(
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        })
      ).start();

      // Fade in rewards
      setTimeout(() => {
        Animated.timing(rewardsOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, 800);
    } else {
      scaleAnim.setValue(0);
      levelScaleAnim.setValue(0);
      rewardsOpacity.setValue(0);
    }
  }, [visible]);

  const glowColor = glowAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: ['rgba(254, 201, 14, 0.3)', 'rgba(254, 201, 14, 0.7)'],
  });

  return (
    <Modal
      isVisible={visible}
      animationIn="fadeIn"
      animationOut="fadeOut"
      backdropOpacity={0.9}
      onBackdropPress={onClose}
    >
      {/* Confetti */}
      <Lottie
        source={require('../../assets/animations/confetti.json')}
        progress={progressAnim}
        style={styles.confetti}
      />

      <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
        {/* Glow ring */}
        <Animated.View
          style={[
            styles.glowRing,
            { backgroundColor: glowColor },
          ]}
        />

        {/* Level badge */}
        <View style={styles.badgeContainer}>
          <View style={styles.badge}>
            <Text style={styles.levelLabel}>LEVEL</Text>
            <Animated.Text
              style={[
                styles.levelNumber,
                { transform: [{ scale: levelScaleAnim }] },
              ]}
            >
              {level}
            </Animated.Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>🎉 LEVEL UP! 🎉</Text>
        <Text style={styles.subtitle}>You're becoming a legend!</Text>

        {/* Rewards */}
        {rewards && (
          <Animated.View style={[styles.rewardsContainer, { opacity: rewardsOpacity }]}>
            <Text style={styles.rewardsTitle}>REWARDS</Text>
            <View style={styles.rewardsRow}>
              {rewards.coins && (
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardIcon}>🪙</Text>
                  <Text style={styles.rewardValue}>+{rewards.coins}</Text>
                </View>
              )}
              {rewards.energy && (
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardIcon}>⚡</Text>
                  <Text style={styles.rewardValue}>+{rewards.energy}</Text>
                </View>
              )}
              {rewards.tickets && (
                <View style={styles.rewardItem}>
                  <Text style={styles.rewardIcon}>🎟️</Text>
                  <Text style={styles.rewardValue}>+{rewards.tickets}</Text>
                </View>
              )}
            </View>
            {rewards.unlocks && rewards.unlocks.length > 0 && (
              <View style={styles.unlocksContainer}>
                <Text style={styles.unlocksTitle}>NEW UNLOCKS:</Text>
                {rewards.unlocks.map((unlock, i) => (
                  <Text key={i} style={styles.unlockItem}>✨ {unlock}</Text>
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* Continue button */}
        <View style={styles.buttonContainer}>
          <YellowButton text="AWESOME!" onPress={onClose} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  confetti: {
    position: 'absolute',
    width: Dimensions.get('window').width + 200,
    height: 500,
    top: -50,
    left: -100,
    zIndex: 20,
  },
  container: {
    alignItems: 'center',
    backgroundColor: config.primary,
    borderRadius: 24,
    padding: 24,
    marginHorizontal: 20,
    borderWidth: 4,
    borderColor: config.tertiary,
    overflow: 'visible',
  },
  glowRing: {
    position: 'absolute',
    top: -60,
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  badgeContainer: {
    marginTop: -60,
    marginBottom: 16,
  },
  badge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: config.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  levelLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: config.primary,
    marginBottom: -4,
  },
  levelNumber: {
    fontFamily: 'Knockout',
    fontSize: 56,
    color: config.primary,
  },
  title: {
    fontFamily: 'Knockout',
    fontSize: 32,
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: config.secondary,
    marginBottom: 20,
  },
  rewardsContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  rewardsTitle: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: config.tertiary,
    textAlign: 'center',
    marginBottom: 12,
  },
  rewardsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  rewardItem: {
    alignItems: 'center',
  },
  rewardIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  rewardValue: {
    fontFamily: 'Knockout',
    fontSize: 20,
    color: 'white',
  },
  unlocksContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  unlocksTitle: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: config.secondary,
    marginBottom: 8,
  },
  unlockItem: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: 'white',
    marginBottom: 4,
  },
  buttonContainer: {
    width: '100%',
  },
});
