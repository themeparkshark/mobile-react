import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import ShareableRideCard from './ShareableRideCard';
import ConfettiBurst from './ConfettiBurst';
import { PlayerRideType } from '../../api/endpoints/player-rides';
import { colors, shadows } from '../../design-system';

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const MILESTONE_MESSAGES: Record<number, string> = {
  10: '🎉 Double digits!',
  25: '🔥 Quarter century rider!',
  50: '🦈 Half-centurion!',
  100: '🏆 Century Club!',
  200: '⚡ 200 rides strong!',
  500: '👑 Legendary 500!',
  1000: '🌟 THOUSAND RIDE LEGEND!',
};

interface RideLogSuccessProps {
  ride: PlayerRideType;
  rideCount?: number;
  totalRideCount?: number;
  xpEarned: number;
  newAchievements: Array<{ id: number; name: string; icon: string }>;
  onDone: () => void;
  onLogAnother?: () => void;
}

const RideLogSuccess: React.FC<RideLogSuccessProps> = ({
  ride, rideCount, totalRideCount, xpEarned, newAchievements, onDone, onLogAnother,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const milestoneScale = useRef(new Animated.Value(0)).current;
  const [showCard, setShowCard] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const milestone = totalRideCount ? MILESTONES.find(m => m === totalRideCount) : null;
  const isMilestone = !!milestone;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowConfetti(true);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ]).start(() => {
      setShowCard(true);
      Animated.spring(cardSlide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();

      if (isMilestone) {
        Animated.sequence([
          Animated.delay(200),
          Animated.spring(milestoneScale, { toValue: 1, tension: 40, friction: 4, useNativeDriver: true }),
        ]).start();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    });
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ConfettiBurst trigger={showConfetti} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Success header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.checkEmoji}>🦈</Text>
          <Text style={styles.successTitle}>Ride Logged!</Text>
          <Text style={styles.xpText}>+{xpEarned} XP</Text>
        </Animated.View>

        {/* Milestone celebration */}
        {isMilestone && (
          <Animated.View style={[styles.milestoneCard, { transform: [{ scale: milestoneScale }] }]}>
            <Text style={styles.milestoneEmoji}>🎊</Text>
            <Text style={styles.milestoneTitle}>Ride #{milestone}!</Text>
            <Text style={styles.milestoneMessage}>{MILESTONE_MESSAGES[milestone!]}</Text>
          </Animated.View>
        )}

        {/* Achievements */}
        {newAchievements.length > 0 && (
          <Animated.View style={[styles.achievementsContainer, { opacity: fadeAnim }]}>
            {newAchievements.map(a => (
              <View key={a.id} style={styles.achievementRow}>
                <Text style={styles.achievementIcon}>{a.icon}</Text>
                <Text style={styles.achievementText}>{a.name} unlocked!</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Shareable Card */}
        {showCard && (
          <Animated.View style={[styles.cardContainer, { transform: [{ translateY: cardSlide }] }]}>
            <Text style={styles.sharePrompt}>Share your experience! 📤</Text>
            <ShareableRideCard ride={ride} rideCount={rideCount} />
          </Animated.View>
        )}

        {/* Action buttons */}
        <View style={styles.actions}>
          {onLogAnother && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLogAnother(); }}
              style={({ pressed }) => [styles.logAnotherBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.logAnotherBtnText}>🎢 Log Another</Text>
            </Pressable>
          )}
          <Pressable
            onPress={onDone}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  content: { padding: 20, paddingBottom: 60, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 24 },
  checkEmoji: { fontSize: 80 },
  successTitle: {
    color: colors.textPrimary, fontSize: 36, fontWeight: '900', fontFamily: 'Shark',
    marginTop: 12,
  },
  xpText: { color: colors.tertiary, fontSize: 22, fontWeight: '700', marginTop: 4 },
  // Milestone
  milestoneCard: {
    backgroundColor: 'rgba(254,201,14,0.1)', borderRadius: 16, padding: 20, marginBottom: 20,
    width: '100%', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(254,201,14,0.3)',
    ...shadows.glow(colors.tertiary, 0.2),
  },
  milestoneEmoji: { fontSize: 48 },
  milestoneTitle: {
    color: colors.tertiary, fontSize: 28, fontWeight: '900', fontFamily: 'Shark', marginTop: 8,
  },
  milestoneMessage: { color: colors.textSecondary, fontSize: 16, marginTop: 4, fontWeight: '600' },
  // Achievements
  achievementsContainer: { marginBottom: 20, width: '100%' },
  achievementRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(254,201,14,0.15)', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(254,201,14,0.3)',
  },
  achievementIcon: { fontSize: 28 },
  achievementText: { color: colors.tertiary, fontSize: 16, fontWeight: '700', flex: 1 },
  // Card
  cardContainer: { width: '100%', marginBottom: 20 },
  sharePrompt: {
    color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginBottom: 12, fontWeight: '600',
  },
  // Actions
  actions: { width: '100%', gap: 10 },
  logAnotherBtn: {
    backgroundColor: colors.secondary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', ...shadows.md,
  },
  logAnotherBtnText: { color: '#fff', fontSize: 18, fontWeight: '800', fontFamily: 'Shark' },
  doneBtn: {
    backgroundColor: colors.bgMedium, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  doneBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
});

export default RideLogSuccess;
