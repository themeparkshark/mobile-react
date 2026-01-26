import { Image } from 'expo-image';
import { useContext, useState, useEffect, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native';
import { PrepItemType } from '../models/prep-item-type';
import { AuthContext } from '../context/AuthProvider';
import redeemPrepItem from '../api/endpoints/me/prep-items/redeem';

// Simple confetti particle component (no Lottie dependency)
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(Math.random() * 200 - 100)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 400,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 360,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateY }, { translateX }, { rotate: spin }],
        opacity,
      }}
    />
  );
}

function Confetti() {
  const colors = ['#FFD700', '#FF6B6B', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800'];
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 500,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  return (
    <View style={confettiStyles.container} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} color={p.color} />
      ))}
    </View>
  );
}

const confettiStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
});

interface Props {
  visible: boolean;
  prepItem: PrepItemType | null;
  pivotId: number | null;
  onClose: () => void;
  onCollected: () => void;
}

/**
 * Modal for collecting a prep item.
 * Shows the item, rewards preview, and collect button.
 */
export default function PrepItemRedeemModal({
  visible,
  prepItem,
  pivotId,
  onClose,
  onCollected,
}: Props) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewards, setRewards] = useState<{
    energy: number;
    tickets: number;
    experience: number;
  } | null>(null);
  const [streakInfo, setStreakInfo] = useState<{
    current: number;
    multiplier: number;
  } | null>(null);
  const { player, refreshPlayer } = useContext(AuthContext);

  const handleCollect = async () => {
    if (!prepItem || !pivotId) return;

    setIsCollecting(true);
    try {
      const response = await redeemPrepItem(
        prepItem.id,
        pivotId,
        player?.is_subscribed || false // VIP double rewards
      );

      setRewards(response.data.rewards);
      setStreakInfo(response.data.streak);
      setShowRewards(true);

      // Refresh player data
      await refreshPlayer();
    } catch (error) {
      console.error('Failed to collect prep item:', error);
      onClose();
    } finally {
      setIsCollecting(false);
    }
  };

  const handleDone = () => {
    setShowRewards(false);
    setRewards(null);
    setStreakInfo(null);
    onCollected();
    onClose();
  };

  if (!prepItem) return null;

  const rarityLabel = {
    1: 'Common',
    2: 'Uncommon',
    3: 'Rare',
  }[prepItem.rarity] || 'Common';

  const rarityColor = {
    1: '#4CAF50',
    2: '#2196F3',
    3: '#9C27B0',
  }[prepItem.rarity] || '#4CAF50';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          {!showRewards ? (
            // Pre-collect view
            <>
              {/* Confetti animation */}
              <Confetti />

              {/* Rarity badge */}
              <View style={[styles.rarityBadge, { backgroundColor: rarityColor }]}>
                <Text style={styles.rarityText}>{rarityLabel}</Text>
              </View>

              {/* Item image */}
              <View style={styles.itemContainer}>
                {prepItem.icon_url ? (
                  <Image
                    source={{ uri: prepItem.icon_url }}
                    style={styles.itemImage}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.fallbackIcon, { backgroundColor: rarityColor }]}>
                    <Text style={styles.fallbackEmoji}>🎁</Text>
                  </View>
                )}
              </View>

              {/* Item name */}
              <Text style={styles.itemName}>{prepItem.name}</Text>
              {prepItem.description && (
                <Text style={styles.itemDescription}>{prepItem.description}</Text>
              )}

              {/* Rewards preview */}
              <View style={styles.rewardsPreview}>
                {prepItem.energy_reward > 0 && (
                  <View style={styles.rewardBox}>
                    <Text style={styles.rewardIcon}>⚡</Text>
                    <Text style={styles.rewardValue}>+{prepItem.energy_reward}</Text>
                    <Text style={styles.rewardLabel}>Energy</Text>
                  </View>
                )}
                {prepItem.ticket_reward > 0 && (
                  <View style={styles.rewardBox}>
                    <Text style={styles.rewardIcon}>🎟️</Text>
                    <Text style={styles.rewardValue}>+{prepItem.ticket_reward}</Text>
                    <Text style={styles.rewardLabel}>Tickets</Text>
                  </View>
                )}
                {prepItem.experience_reward > 0 && (
                  <View style={styles.rewardBox}>
                    <Text style={styles.rewardIcon}>⭐</Text>
                    <Text style={styles.rewardValue}>+{prepItem.experience_reward}</Text>
                    <Text style={styles.rewardLabel}>XP</Text>
                  </View>
                )}
              </View>

              {/* Collect button */}
              <TouchableOpacity
                style={[styles.collectButton, isCollecting && styles.collectingButton]}
                onPress={handleCollect}
                disabled={isCollecting}
              >
                <Text style={styles.collectButtonText}>
                  {isCollecting ? 'Collecting...' : 'Collect!'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // Post-collect view (rewards received)
            <>
              <Confetti />

              <Text style={styles.collectedTitle}>🎉 Collected!</Text>
              <Text style={styles.itemName}>{prepItem.name}</Text>

              {/* Actual rewards received */}
              <View style={styles.rewardsReceived}>
                {rewards?.energy && rewards.energy > 0 && (
                  <View style={styles.rewardReceivedBox}>
                    <Text style={styles.rewardReceivedValue}>+{rewards.energy}</Text>
                    <Text style={styles.rewardReceivedLabel}>⚡ Energy</Text>
                  </View>
                )}
                {rewards?.tickets && rewards.tickets > 0 && (
                  <View style={styles.rewardReceivedBox}>
                    <Text style={styles.rewardReceivedValue}>+{rewards.tickets}</Text>
                    <Text style={styles.rewardReceivedLabel}>🎟️ Tickets</Text>
                  </View>
                )}
                {rewards?.experience && rewards.experience > 0 && (
                  <View style={styles.rewardReceivedBox}>
                    <Text style={styles.rewardReceivedValue}>+{rewards.experience}</Text>
                    <Text style={styles.rewardReceivedLabel}>⭐ XP</Text>
                  </View>
                )}
              </View>

              {/* Streak info */}
              {streakInfo && streakInfo.current > 0 && (
                <View style={styles.streakInfo}>
                  <Text style={styles.streakText}>
                    🔥 {streakInfo.current} day streak!
                  </Text>
                  {streakInfo.multiplier > 1 && (
                    <Text style={styles.multiplierText}>
                      {streakInfo.multiplier}x bonus applied!
                    </Text>
                  )}
                </View>
              )}

              {/* Done button */}
              <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
                <Text style={styles.doneButtonText}>Awesome!</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '85%',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 18,
  },
  rarityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 16,
  },
  rarityText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  itemContainer: {
    marginBottom: 16,
  },
  itemImage: {
    width: 120,
    height: 120,
  },
  fallbackIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackEmoji: {
    fontSize: 60,
  },
  itemName: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  itemDescription: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  rewardsPreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  rewardBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rewardIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  rewardValue: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rewardLabel: {
    color: '#888',
    fontSize: 10,
  },
  collectButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  collectingButton: {
    backgroundColor: '#888',
  },
  collectButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  collectedTitle: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 20,
  },
  rewardsReceived: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginVertical: 24,
  },
  rewardReceivedBox: {
    alignItems: 'center',
  },
  rewardReceivedValue: {
    color: '#4CAF50',
    fontSize: 28,
    fontWeight: 'bold',
  },
  rewardReceivedLabel: {
    color: '#888',
    fontSize: 12,
  },
  streakInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  streakText: {
    color: '#FF9800',
    fontSize: 18,
    fontWeight: 'bold',
  },
  multiplierText: {
    color: '#FFD700',
    fontSize: 14,
    marginTop: 4,
  },
  doneButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 30,
  },
  doneButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
