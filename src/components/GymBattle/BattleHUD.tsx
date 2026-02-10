import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { getGym, GymData } from '../../api/endpoints/gym-battle';
import { battleHUDEvents } from './battleHUDEvents';

// Format seconds into H:MM:SS or MM:SS
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const TEAM_COLORS = {
  mouse: '#F59E0B',  // Gold
  globe: '#22C55E',  // Green
  shark: '#3B82F6',  // Blue
};

const TEAM_EMOJIS = {
  mouse: '🐭',
  globe: '🌍',
  shark: '🦈',
};

const TEAM_NAMES = {
  mouse: 'Team Mouse',
  globe: 'Team Globe',
  shark: 'Team Shark',
};

interface Props {
  parkId: number;
  onPress?: () => void;
}

export default function BattleHUD({ parkId }: Props) {
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [shimmerAnim] = useState(new Animated.Value(0));
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [battleActive, setBattleActive] = useState(true);
  const countdown = remainingSeconds != null ? formatCountdown(remainingSeconds) : '--:--';

  // Sync countdown from API data, then tick locally every second
  useEffect(() => {
    if (gymData?.battle_status) {
      setRemainingSeconds(gymData.battle_status.seconds_until_next_event);
      setBattleActive(gymData.battle_status.is_active);
    }
  }, [gymData?.battle_status?.seconds_until_next_event]);

  // Tick countdown every second (only when we have real data)
  useEffect(() => {
    if (remainingSeconds == null) return;
    const timer = setInterval(() => {
      setRemainingSeconds(prev => prev != null ? Math.max(0, prev - 1) : null);
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds != null]);

  const fetchGym = useCallback(async () => {
    try {
      const data = await getGym(parkId);
      setGymData(data);
    } catch (error) {
      // Silent fail - HUD is optional
    }
  }, [parkId]);

  // Poll every 10s for near-real-time score updates
  useEffect(() => {
    fetchGym();
    const interval = setInterval(fetchGym, 10000);
    return () => clearInterval(interval);
  }, [fetchGym]);

  // Refresh immediately when returning from GymBattleScreen
  const navigation = useNavigation();
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchGym();
    });
    return unsubscribe;
  }, [navigation, fetchGym]);

  // Listen for explicit refresh events (fired after checkin/placeCoin/attack/defend)
  useEffect(() => {
    const unsubscribe = battleHUDEvents.subscribe(() => {
      fetchGym();
    });
    return unsubscribe;
  }, [fetchGym]);

  // Shimmer animation for premium feel
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Pulse when battle is close
  useEffect(() => {
    if (gymData && gymData.lead_margin < 100 && gymData.lead_margin > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [gymData?.lead_margin]);

  if (!gymData || !gymData.player) {
    return null;
  }

  const { gym, scores, leader, lead_margin, player } = gymData;
  const totalScore = scores.mouse + scores.globe + scores.shark;
  const isClose = lead_margin < 100 && lead_margin > 0;

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 0.3],
  });

  return (
    <>
      <TouchableOpacity 
        onPress={() => setShowInfo(true)} 
        activeOpacity={0.9}
        style={styles.touchable}
      >
        <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
          {/* Translucent background */}
          <BlurView intensity={40} tint="dark" style={styles.blur}>
            {/* Shimmer overlay */}
            <Animated.View 
              style={[
                styles.shimmer, 
                { 
                  opacity: shimmerOpacity,
                  backgroundColor: leader ? TEAM_COLORS[leader] : '#FBBF24',
                }
              ]} 
            />
            
            <View style={styles.content}>
              {/* Left: Player team + Gym name */}
              <View style={styles.leftSection}>
                {player && (
                  <View style={[styles.myTeamBadge, { backgroundColor: TEAM_COLORS[player.team] }]}>
                    <Text style={styles.myTeamText}>{TEAM_EMOJIS[player.team]} TEAM</Text>
                  </View>
                )}
              </View>

              {/* Center: Team scores - solid backgrounds for readability */}
              <View style={styles.centerSection}>
                <View style={styles.teamScores}>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.mouse }]}>
                    <Text style={styles.teamScore}>{TEAM_EMOJIS.mouse} {scores.mouse}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.globe }]}>
                    <Text style={styles.teamScore}>{TEAM_EMOJIS.globe} {scores.globe}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.shark }]}>
                    <Text style={styles.teamScore}>{TEAM_EMOJIS.shark} {scores.shark}</Text>
                  </View>
                </View>
              </View>

              {/* Right: Countdown clock */}
              <View style={styles.rightSection}>
                <View style={styles.clockBadge}>
                  <Text style={styles.clockIcon}>⏱️</Text>
                  <Text style={styles.clockTime}>{countdown}</Text>
                </View>
                <Text style={styles.tapHintText}>Tap for info</Text>
              </View>
            </View>
          </BlurView>

          {/* Close battle alert */}
          {isClose && (
            <View style={styles.alertBadge}>
              <Text style={styles.alertText}>⚡ CLOSE BATTLE!</Text>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>

      {/* Info Modal */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowInfo(false)}
        >
          <View style={styles.modalContent}>
            <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
              <View>
                <Text style={styles.modalTitle}>⚔️ ARENA BATTLE</Text>
                
                {/* Timer */}
                <View style={styles.timerSection}>
                  <Text style={styles.timerLabel}>BATTLE ENDS IN</Text>
                  <Text style={styles.timerValue}>{countdown}</Text>
                </View>

                {/* Current Standings */}
                <View style={styles.standingsSection}>
                  <Text style={styles.sectionTitle}>STANDINGS</Text>
                  {(['mouse', 'globe', 'shark'] as const)
                    .sort((a, b) => scores[b] - scores[a])
                    .map((team, index) => (
                      <View key={team} style={styles.standingRow}>
                        <Text style={styles.standingRank}>#{index + 1}</Text>
                        <Text style={styles.standingEmoji}>{TEAM_EMOJIS[team]}</Text>
                        <Text style={[styles.standingName, { color: TEAM_COLORS[team] }]}>
                          {TEAM_NAMES[team]}
                        </Text>
                        <Text style={[styles.standingScore, { color: TEAM_COLORS[team] }]}>
                          {scores[team].toLocaleString()}
                        </Text>
                      </View>
                    ))}
                </View>

                {/* How it works */}
                <View style={styles.infoSection}>
                  <Text style={styles.sectionTitle}>HOW IT WORKS</Text>
                  <Text style={styles.infoText}>
                    👆 <Text style={styles.infoBold}>Check in</Text> every 30 min · +20 pts{'\n'}
                    🪙 <Text style={styles.infoBold}>Place a coin</Text> · bonus pts{'\n'}
                    ⚔️ <Text style={styles.infoBold}>Find swords</Text> · attack enemies{'\n'}
                    🏆 <Text style={styles.infoBold}>Win</Text> when timer hits 0 · get rewards!
                  </Text>
                </View>

                {/* Rewards + Status side by side */}
                <View style={styles.bottomRow}>
                  <View style={styles.rewardsCol}>
                    <Text style={styles.sectionTitle}>🏆 WIN REWARDS</Text>
                    <Text style={styles.rewardItem}>🪙 1,000 Coins</Text>
                    <Text style={styles.rewardItem}>⭐ 100 XP</Text>
                    <Text style={styles.rewardItem}>⚡ 10 Energy</Text>
                    <Text style={styles.rewardItem}>⚔️ 2 Swords</Text>
                  </View>
                  {player && (
                    <View style={styles.statusCol}>
                      <Text style={styles.sectionTitle}>YOUR STATUS</Text>
                      <Text style={styles.statusLine}>{TEAM_EMOJIS[player.team]} {TEAM_NAMES[player.team]}</Text>
                      <Text style={styles.statusLine}>📊 {player.today_contribution} pts today</Text>
                      <Text style={styles.statusLine}>⚔️ {player.swords} swords</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setShowInfo(false)}
                >
                  <Text style={styles.closeButtonText}>GOT IT!</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  touchable: {
    position: 'absolute',
    top: 120,
    left: 12,
    right: 12,
    zIndex: 15,
  },
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  blur: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    alignItems: 'flex-start',
  },
  gymInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  swordIcon: {
    width: 18,
    height: 18,
    marginRight: 6,
  },
  gymName: {
    fontSize: 15,
    fontWeight: '800',
    color: 'white',
  },
  myTeamBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  myTeamText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'white',
  },
  centerSection: {
    flex: 1,
    paddingHorizontal: 6,
  },
  teamScores: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  scoreBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  teamScore: {
    fontSize: 11,
    fontWeight: '800',
    color: 'white',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  rightSection: {
    alignItems: 'center',
    minWidth: 50,
  },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  clockIcon: {
    fontSize: 10,
  },
  clockTime: {
    fontSize: 10,
    fontWeight: '700',
    color: 'white',
  },
  tapHintText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  alertBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  alertText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'white',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxHeight: '80%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  modalBlur: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FBBF24',
    textAlign: 'center',
    marginBottom: 8,
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 8,
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  timerValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#EF4444',
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  standingsSection: {
    marginBottom: 12,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  standingRank: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    width: 26,
  },
  standingEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  standingName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  standingScore: {
    fontSize: 14,
    fontWeight: '800',
  },
  infoSection: {
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '700',
    color: 'white',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  rewardsCol: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
  },
  rewardItem: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  statusCol: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
  },
  statusLine: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  closeButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
  },
});
