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
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { GameIcon, GameRichText } from '../../ui';
import { useBudgetedPoll } from '../../power';

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

// Team colours and names come from the one team table (constants/teams).
const TEAM_COLORS: Record<TeamId, string> = { mouse: TEAMS.mouse.color, globe: TEAMS.globe.color, shark: TEAMS.shark.color };
const TEAM_NAMES = { get mouse() { return teamName('mouse'); }, get globe() { return teamName('globe'); }, get shark() { return teamName('shark'); } };
const TeamBadge = ({ team, size = 18 }: { team: TeamId; size?: number }) =>
  <Image source={TEAMS[team].badge} style={{ width: size, height: size }} contentFit="contain" />;

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

  // Poll every 10s for near-real-time score updates, on the app's one poll
  // clock: paused in the background, slower while idle or on Battery Saver.
  useBudgetedPoll(fetchGym, 10000);

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
          <BlurView intensity={40} tint="light" style={styles.blur}>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><TeamBadge team={player.team} /><Text style={styles.myTeamText}>TEAM</Text></View>
                  </View>
                )}
              </View>

              {/* Center: Team scores - solid backgrounds for readability */}
              <View style={styles.centerSection}>
                <View style={styles.teamScores}>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.mouse }]}>
                    <TeamBadge team="mouse" /><Text style={styles.teamScore}>{scores.mouse}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.globe }]}>
                    <TeamBadge team="globe" /><Text style={styles.teamScore}>{scores.globe}</Text>
                  </View>
                  <View style={[styles.scoreBadge, { backgroundColor: TEAM_COLORS.shark }]}>
                    <TeamBadge team="shark" /><Text style={styles.teamScore}>{scores.shark}</Text>
                  </View>
                </View>
              </View>

              {/* Right: Countdown clock */}
              <View style={styles.rightSection}>
                <View style={styles.clockBadge}>
                  <GameIcon name="timer" size={16} />
                  <Text style={styles.clockTime}>{battleActive ? countdown : 'Soon'}</Text>
                </View>
                <Text style={styles.tapHintText}>{battleActive ? 'Tap for info' : 'Starts soon'}</Text>
              </View>
            </View>
          </BlurView>

          {/* Close battle alert */}
          {isClose && (
            <View style={styles.alertBadge}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><GameIcon name="swords" size={14} /><Text style={styles.alertText}>CLOSE BATTLE!</Text></View>
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
            <BlurView intensity={80} tint="light" style={styles.modalBlur}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><GameIcon name="swords" size={26} /><Text style={styles.modalTitle}>ARENA BATTLE</Text></View>
                
                {/* Timer */}
                <View style={styles.timerSection}>
                  <Text style={styles.timerLabel}>{battleActive ? 'BATTLE ENDS IN' : 'NEXT BATTLE'}</Text>
                  <Text style={styles.timerValue}>{battleActive ? countdown : `Starts in ${countdown}`}</Text>
                </View>

                {/* Current Standings */}
                <View style={styles.standingsSection}>
                  <Text style={styles.sectionTitle}>STANDINGS</Text>
                  {(['mouse', 'globe', 'shark'] as const).slice()
                    .sort((a, b) => scores[b] - scores[a])
                    .map((team, index) => (
                      <View key={team} style={styles.standingRow}>
                        <Text style={styles.standingRank}>#{index + 1}</Text>
                        <TeamBadge team={team} size={22} />
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
                  <GameRichText tone="onBlue" style={styles.infoText}>{'[icon:pin] Check in every 30 min: +20 points.\n[icon:coin] Place a coin: bonus points.\n[icon:swords] Find swords: attack other teams.\n[icon:trophy] Be winning when the timer hits 0 to get rewards!'}</GameRichText>
                </View>

                {/* Rewards + Status side by side */}
                <View style={styles.bottomRow}>
                  <View style={styles.rewardsCol}>
                    <Text style={styles.sectionTitle}>WIN REWARDS</Text>
                    <GameRichText tone="onBlue" style={styles.rewardItem}>{'[icon:coins] 1,000 Coins'}</GameRichText>
                    <GameRichText tone="onBlue" style={styles.rewardItem}>{'[icon:xp] 100 XP'}</GameRichText>
                    <GameRichText tone="onBlue" style={styles.rewardItem}>{'[icon:energy] 10 Energy'}</GameRichText>
                    <GameRichText tone="onBlue" style={styles.rewardItem}>{'[icon:swords] 2 Swords'}</GameRichText>
                  </View>
                  {player && (
                    <View style={styles.statusCol}>
                      <Text style={styles.sectionTitle}>YOUR STATUS</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><TeamBadge team={player.team} /><Text style={styles.statusLine}>{TEAM_NAMES[player.team]}</Text></View>
                      <Text style={styles.statusLine}>{player.today_contribution} pts today</Text>
                      <GameRichText tone="onBlue" style={styles.statusLine}>{`[icon:swords] ${player.swords} swords`}</GameRichText>
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
    backgroundColor: 'rgba(7, 104, 185, 0.88)',
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
    backgroundColor: 'rgba(5, 52, 110, 0.4)',
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
    backgroundColor: 'rgba(5, 52, 110, 0.7)',
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
    backgroundColor: 'rgba(7, 104, 185, 0.94)',
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
