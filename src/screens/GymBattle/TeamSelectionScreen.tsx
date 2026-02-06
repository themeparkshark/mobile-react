import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated as RNAnimated,
  ImageBackground,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  BounceIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { joinTeam, getTeamStandings, TeamStanding } from '../../api/endpoints/gym-battle';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Floating sparkle component
const Sparkle = ({ delay, startX, startY, color }: { delay: number; startX: number; startY: number; color: string }) => {
  const translateY = useRef(new RNAnimated.Value(0)).current;
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const scale = useRef(new RNAnimated.Value(0.5)).current;

  useEffect(() => {
    const animate = () => {
      // Reset
      translateY.setValue(0);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.5);

      RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.parallel([
          // Float up
          RNAnimated.timing(translateY, {
            toValue: -150 - Math.random() * 100,
            duration: 4000 + Math.random() * 2000,
            useNativeDriver: true,
          }),
          // Drift sideways
          RNAnimated.timing(translateX, {
            toValue: (Math.random() - 0.5) * 80,
            duration: 4000 + Math.random() * 2000,
            useNativeDriver: true,
          }),
          // Fade in then out
          RNAnimated.sequence([
            RNAnimated.timing(opacity, {
              toValue: 0.8,
              duration: 800,
              useNativeDriver: true,
            }),
            RNAnimated.timing(opacity, {
              toValue: 0,
              duration: 3200,
              delay: 1000,
              useNativeDriver: true,
            }),
          ]),
          // Scale pulse
          RNAnimated.sequence([
            RNAnimated.timing(scale, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
            }),
            RNAnimated.timing(scale, {
              toValue: 0.3,
              duration: 3000,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => animate());
    };

    animate();
  }, []);

  return (
    <RNAnimated.View
      style={{
        position: 'absolute',
        left: startX,
        top: startY,
        transform: [{ translateY }, { translateX }, { scale }],
        opacity,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1,
          shadowRadius: 8,
        }}
      />
    </RNAnimated.View>
  );
};

// Generate sparkles
const SPARKLES = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  delay: i * 300,
  startX: Math.random() * SCREEN_W,
  startY: SCREEN_H * 0.4 + Math.random() * SCREEN_H * 0.4,
  color: ['#FFD700', '#FFF', '#87CEEB', '#FFB6C1', '#98FB98'][Math.floor(Math.random() * 5)],
}));

interface Props {
  navigation?: any;
  route?: {
    params?: {
      onTeamSelected?: () => void;
      isOnboarding?: boolean;
    };
  };
}

const TEAMS = [
  {
    id: 'mouse' as const,
    name: 'TEAM MOUSE',
    emoji: '🐭',
    tagline1: 'Strong defenders.',
    tagline2: 'Precise control.',
    color: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.6)',
  },
  {
    id: 'globe' as const,
    name: 'TEAM GLOBE',
    emoji: '🌍',
    tagline1: 'Fast captures.',
    tagline2: 'Aggressive play.',
    color: '#22C55E',
    glowColor: 'rgba(34, 197, 94, 0.6)',
  },
  {
    id: 'shark' as const,
    name: 'TEAM SHARK',
    emoji: '🦈',
    tagline1: 'Balanced.',
    tagline2: 'Everywhere. Always.',
    color: '#3B82F6',
    glowColor: 'rgba(59, 130, 246, 0.6)',
  },
];

export default function TeamSelectionScreen({ navigation, route }: Props) {
  const [selectedTeam, setSelectedTeam] = useState<'mouse' | 'globe' | 'shark' | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [teamStats, setTeamStats] = useState<Record<string, number>>({});
  
  // Animated values for each pillar glow
  const mouseGlow = useRef(new RNAnimated.Value(0)).current;
  const globeGlow = useRef(new RNAnimated.Value(0)).current;
  const sharkGlow = useRef(new RNAnimated.Value(0)).current;
  
  // Pulsing animation for pillars
  const pillarPulse = useSharedValue(1);

  useEffect(() => {
    // Subtle breathing animation for all pillars
    pillarPulse.value = withRepeat(
      withSequence(
        withTiming(1.02, { duration: 2000 }),
        withTiming(1, { duration: 2000 })
      ),
      -1,
      true
    );

    // Fetch team stats
    fetchTeamStats();
  }, []);

  const fetchTeamStats = async () => {
    try {
      const data = await getTeamStandings();
      const stats: Record<string, number> = {};
      data.standings.forEach((s: TeamStanding) => {
        stats[s.team] = s.player_count;
      });
      setTeamStats(stats);
    } catch (e) {
      // Silent fail
    }
  };

  const pillarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pillarPulse.value }],
  }));

  const getGlowAnim = (team: string) => {
    switch (team) {
      case 'mouse': return mouseGlow;
      case 'globe': return globeGlow;
      case 'shark': return sharkGlow;
      default: return mouseGlow;
    }
  };

  const handleSelectTeam = (teamId: 'mouse' | 'globe' | 'shark') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Animate glow for selected team
    const glowAnim = getGlowAnim(teamId);
    RNAnimated.sequence([
      RNAnimated.timing(glowAnim, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
    
    // Reset other glows
    TEAMS.forEach(t => {
      if (t.id !== teamId) {
        RNAnimated.timing(getGlowAnim(t.id), { toValue: 0, duration: 200, useNativeDriver: false }).start();
      }
    });

    setSelectedTeam(teamId);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!selectedTeam) return;

    setIsJoining(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await joinTeam(selectedTeam);
      
      if (route?.params?.onTeamSelected) {
        // Callback provided - let it handle navigation
        route.params.onTeamSelected();
      } else {
        // Default: go back
        navigation?.goBack();
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to join team');
      setIsJoining(false);
    }
  };

  const handleCancel = () => {
    // Reset glow
    if (selectedTeam) {
      RNAnimated.timing(getGlowAnim(selectedTeam), { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    setShowConfirm(false);
    setSelectedTeam(null);
  };

  return (
    <View style={styles.container}>
      {/* Full-screen background image */}
      <Image
        source={require('../../../assets/images/team-selection-bg.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />

      {/* Floating sparkles */}
      {SPARKLES.map((sparkle) => (
        <Sparkle
          key={sparkle.id}
          delay={sparkle.delay}
          startX={sparkle.startX}
          startY={sparkle.startY}
          color={sparkle.color}
        />
      ))}

      {/* Animated pillar overlay for breathing effect */}
      <Animated.View style={[styles.pillarOverlay, pillarStyle]} pointerEvents="none" />

      {/* Team tap zones with glow effects */}
      <View style={styles.teamTapZones}>
        {TEAMS.map((team, index) => {
          const glowAnim = getGlowAnim(team.id);
          const glowStyle = {
            shadowColor: team.color,
            shadowOpacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.9],
            }),
            shadowRadius: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 30],
            }),
            borderColor: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', team.color],
            }),
            borderWidth: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 3],
            }),
            backgroundColor: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['transparent', team.glowColor],
            }),
          };

          return (
            <RNAnimated.View key={team.id} style={[styles.teamTapZone, glowStyle]}>
              <TouchableOpacity
                style={styles.teamTouchable}
                onPress={() => handleSelectTeam(team.id)}
                activeOpacity={0.7}
              />

            </RNAnimated.View>
          );
        })}
      </View>

      {/* Bottom hint */}
      <Animated.View entering={FadeIn.delay(500)} style={styles.hintContainer}>
        <Text style={styles.hintText}>👆 Tap a pillar to choose your team</Text>
      </Animated.View>

      {/* Confirm Modal */}
      {showConfirm && selectedTeam && (
        <Animated.View
          entering={FadeIn}
          style={styles.confirmOverlay}
        >
          <Animated.View entering={BounceIn}>
            <ImageBackground
              source={require('../../../assets/images/modal-frame.png')}
              style={styles.confirmModal}
              resizeMode="stretch"
            >
              <View style={styles.confirmContent}>
                {selectedTeam === 'shark' ? (
                  <Image
                    source={require('../../../assets/images/team-shark-badge.png')}
                    style={styles.confirmBadge}
                    contentFit="contain"
                  />
                ) : selectedTeam === 'globe' ? (
                  <Image
                    source={require('../../../assets/images/team-globe-badge.png')}
                    style={styles.confirmBadge}
                    contentFit="contain"
                  />
                ) : selectedTeam === 'mouse' ? (
                  <Image
                    source={require('../../../assets/images/team-mouse-badge.png')}
                    style={styles.confirmBadge}
                    contentFit="contain"
                  />
                ) : null}
                <Text style={[styles.confirmTitle, { color: TEAMS.find(t => t.id === selectedTeam)?.color }]}>
                  {TEAMS.find(t => t.id === selectedTeam)?.name}
                </Text>
                <Text style={styles.confirmTagline}>
                  {TEAMS.find(t => t.id === selectedTeam)?.tagline1}{' '}
                  {TEAMS.find(t => t.id === selectedTeam)?.tagline2}
                </Text>

                <View style={styles.warningBox}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                  <Text style={styles.confirmWarning}>
                    This choice is PERMANENT!
                  </Text>
                </View>

                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.cancelButton]}
                    onPress={handleCancel}
                    disabled={isJoining}
                  >
                    <Text style={styles.cancelButtonText}>Go Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      styles.joinButton,
                      { backgroundColor: TEAMS.find(t => t.id === selectedTeam)?.color },
                    ]}
                    onPress={handleConfirm}
                    disabled={isJoining}
                  >
                    <Text style={styles.joinButtonText}>
                      {isJoining ? 'JOINING...' : 'JOIN TEAM!'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ImageBackground>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  pillarOverlay: {
    ...StyleSheet.absoluteFillObject,
    // This invisible view applies the breathing scale to the whole scene
  },
  teamTapZones: {
    position: 'absolute',
    flexDirection: 'row',
    top: SCREEN_H * 0.28,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.38,
    paddingHorizontal: 8,
    gap: 6,
  },
  teamTapZone: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  teamTouchable: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  memberBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 5,
  },
  memberCount: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
  },
  hintContainer: {
    position: 'absolute',
    bottom: SCREEN_H * 0.08,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  confirmModal: {
    width: SCREEN_W - 40,
    height: SCREEN_W - 40,
    maxWidth: 360,
    maxHeight: 360,
  },
  confirmContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    paddingTop: 20,
    paddingBottom: 24,
  },
  confirmEmoji: {
    fontSize: 70,
    marginBottom: 8,
  },
  confirmBadge: {
    width: 100,
    height: 100,
    marginBottom: 8,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  confirmTagline: {
    fontSize: 14,
    color: '#CBD5E1',
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  confirmStats: {
    fontSize: 14,
    color: '#FBBF24',
    marginTop: 12,
    fontWeight: '600',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  confirmWarning: {
    fontSize: 13,
    color: '#F87171',
    fontWeight: '700',
  },
  warningSubtext: {
    fontWeight: '400',
    color: '#94A3B8',
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 115,
  },
  cancelButton: {
    backgroundColor: '#334155',
  },
  cancelButtonText: {
    color: '#94A3B8',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 15,
  },
  joinButton: {},
  joinButtonText: {
    color: 'white',
    fontWeight: '900',
    textAlign: 'center',
    fontSize: 17,
    letterSpacing: 0.5,
  },
});
