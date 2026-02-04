import { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import Modal from 'react-native-modal';
import Lottie from 'lottie-react-native';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

interface Props {
  visible: boolean;
  rideName: string;
  ridePartsEarned: number;
  energyEarned: number;
  onClose: () => void;
}

/**
 * Post-win rewards modal showing ride parts + energy earned after
 * completing a mini-game. This appears AFTER the main redeem modal.
 */
export default function PostWinRewardsModal({
  visible,
  rideName,
  ridePartsEarned,
  energyEarned,
  onClose,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const partsScale = useRef(new Animated.Value(0)).current;
  const energyScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Reset
      scaleAnim.setValue(0);
      partsScale.setValue(0);
      energyScale.setValue(0);

      // Confetti loop
      Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: 2250,
          useNativeDriver: true,
        })
      ).start();

      // Staggered reveal animation
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.delay(200),
        Animated.spring(partsScale, {
          toValue: 1,
          tension: 80,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.delay(100),
        Animated.spring(energyScale, {
          toValue: 1,
          tension: 80,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      animationIn="fadeIn"
      animationOut="fadeOut"
      isVisible={visible}
      onSwipeComplete={onClose}
      swipeDirection="down"
    >
      <View style={styles.container}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Lottie
            source={require('../../assets/animations/confetti.json')}
            progress={progress}
            style={styles.confetti}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.card,
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          <Ribbon text="Bonus Loot!" />

          <View style={styles.content}>
            <Text style={styles.subtitle}>
              You unlocked bonus rewards!
            </Text>

            {/* Ride Parts */}
            <Animated.View
              style={[
                styles.rewardRow,
                { transform: [{ scale: partsScale }] },
              ]}
            >
              <View style={styles.rewardIcon}>
                <Text style={styles.rewardEmoji}>⚙️</Text>
              </View>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardAmount}>
                  +{ridePartsEarned}
                </Text>
                <Text style={styles.rewardLabel}>
                  {rideName} Ride Parts
                </Text>
              </View>
            </Animated.View>

            {/* Energy */}
            <Animated.View
              style={[
                styles.rewardRow,
                { transform: [{ scale: energyScale }] },
              ]}
            >
              <View style={[styles.rewardIcon, { backgroundColor: '#FFB300' }]}>
                <Text style={styles.rewardEmoji}>⚡</Text>
              </View>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardAmount}>
                  +{energyEarned}
                </Text>
                <Text style={styles.rewardLabel}>Energy</Text>
              </View>
            </Animated.View>

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
  backdrop: {
    width: '100%',
    height: '100%',
    position: 'absolute',
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
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rewardEmoji: {
    fontSize: 24,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardAmount: {
    color: '#FFD700',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Shark',
  },
  rewardLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  hint: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  buttonContainer: {
    marginTop: 4,
  },
});
