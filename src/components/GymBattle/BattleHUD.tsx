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
import { getGym, GymData } from '../../api/endpoints/gym-battle';

// Calculate time until park close (default 10pm local) - LIVE with seconds
function getTimeUntilClose(): string {
  const now = new Date();
  const closeTime = new Date();
  closeTime.setHours(22, 0, 0, 0); // 10pm
  
  // If past 10pm, battle is over
  if (now >= closeTime) {
    return '0:00:00';
  }
  
  const diffMs = closeTime.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  // Format as H:MM:SS or MM:SS
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
  const [countdown, setCountdown] = useState(getTimeUntilClose());

  // Update countdown every second for urgency
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(getTimeUntilClose());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchGym = useCallback(async () => {
    try {
      const data = await getGym(parkId);
      setGymData(data);
    } catch (error) {
      // Silent fail - HUD is optional
    }
  }, [parkId]);

  useEffect(() => {
    fetchGym();
    const interval = setInterval(fetchGym, 30000);
    return () => clearInterval(interval);
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
                    <Text style={styles.myTeamText}>{TEAM_EMOJIS[player.team]} {player.team.toUpperCase()}</Text>
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
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>⚔️ ARENA BATTLE</Text>
                <Text style={styles.modalSubtitle}>{gym.name}</Text>

                {/* Current Standings */}
                <View style={styles.standingsSection}>
                  <Text style={styles.sectionTitle}>CURRENT STANDINGS</Text>
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
                    👆 <Text style={styles.infoBold}>Check in</Text> every 30 min for +20 points{'\n'}
                    🪙 <Text style={styles.infoBold}>Place a coin</Text> for bonus points{'\n'}
                    ⚔️ <Text style={styles.infoBold}>Find swords</Text> to attack enemy teams{'\n'}
                    🏆 <Text style={styles.infoBold}>Win</Text> when time expires to get rewards!
                  </Text>
                </View>

                {/* Winning Team Rewards */}
                <View style={styles.perksSection}>
                  <Text style={styles.sectionTitle}>🏆 WINNING TEAM REWARDS</Text>
                  <Text style={styles.perkSubtitle}>When time expires, if your team wins you get:</Text>
                  <Text style={styles.perkItem}>🪙 1,000 Shark Coins</Text>
                  <Text style={styles.perkItem}>⭐ 100 XP</Text>
                  <Text style={styles.perkItem}>⚡ 10 Energy</Text>
                  <Text style={styles.perkItem}>⚔️ 2 Swords</Text>
                </View>

                {/* Your Status */}
                {player && (
                  <View style={styles.statusSection}>
                    <Text style={styles.sectionTitle}>YOUR STATUS</Text>
                    <Text style={styles.statusText}>
                      Team: {TEAM_EMOJIS[player.team]} {TEAM_NAMES[player.team]}{'\n'}
                      Today's contribution: {player.today_contribution} pts{'\n'}
                      Swords: ⚔️ {player.swords}
                    </Text>
                  </View>
                )}

                <Text style={styles.hint}>Walk to the arena marker on the map to participate!</Text>

                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setShowInfo(false)}
                >
                  <Text style={styles.closeButtonText}>GOT IT!</Text>
                </TouchableOpacity>
              </ScrollView>
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
    fontSize: 28,
    fontWeight: '900',
    color: '#FBBF24',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  standingsSection: {
    marginBottom: 20,
  },
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  standingRank: {
    fontSize: 14,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    width: 30,
  },
  standingEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  standingName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  standingScore: {
    fontSize: 16,
    fontWeight: '800',
  },
  infoSection: {
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 24,
  },
  infoBold: {
    fontWeight: '700',
    color: 'white',
  },
  perksSection: {
    marginBottom: 16,
  },
  perkItem: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  perkSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  statusSection: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 22,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  closeButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
});
