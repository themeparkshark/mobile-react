import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Pressable, ImageBackground } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import ShareableRideCard from './ShareableRideCard';
import ConfettiBurst from './ConfettiBurst';
import { PlayerRideType } from '../../api/endpoints/player-rides';
import { colors, shadows } from '../../design-system';
import Wrapper from '../Wrapper';
import Topbar from '../Topbar';
import TopbarColumn from '../Topbar/TopbarColumn';
import TopbarText from '../Topbar/TopbarText';
import { SoundEffectContext, SoundEffectContextType } from '../../context/SoundEffectProvider';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

const MILESTONES = [10, 25, 50, 100, 200, 500, 1000];
const MILESTONE_MESSAGES: Record<number, string> = {
  10: 'Double digits!',
  25: 'Quarter century rider!',
  50: 'Half-centurion!',
  100: 'Century Club!',
  200: '200 rides strong!',
  500: 'Legendary 500!',
  1000: 'THOUSAND RIDE LEGEND!',
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
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const milestoneScale = useRef(new Animated.Value(0)).current;
  const [showCard, setShowCard] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const reducedMotion = useReducedGameMotion();
  const celebrated = useRef(false);

  const milestone = totalRideCount ? MILESTONES.find(m => m === totalRideCount) : null;
  const isMilestone = !!milestone;

  useEffect(() => {
    if (!celebrated.current) {
      celebrated.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      playSound(require('../../../assets/sounds/success.mp3'), { volume: 0.65 });
    }
  }, [playSound]);

  useEffect(() => {
    if (reducedMotion) {
      scaleAnim.setValue(1); fadeAnim.setValue(1);
      cardSlide.setValue(0); milestoneScale.setValue(1);
      setShowCard(true); setShowConfetti(false);
      return;
    }
    setShowConfetti(true);

    const entrance = Animated.sequence([
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.delay(400),
    ]);
    entrance.start(({ finished }) => {
      if (!finished) return;
      setShowCard(true);
      Animated.spring(cardSlide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();

      if (isMilestone) {
        Animated.sequence([
          Animated.delay(200),
          Animated.spring(milestoneScale, { toValue: 1, tension: 40, friction: 4, useNativeDriver: true }),
        ]).start();
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      }
    });
    return () => {
      entrance.stop(); scaleAnim.stopAnimation(); fadeAnim.stopAnimation();
      cardSlide.stopAnimation(); milestoneScale.stopAnimation();
    };
  }, [reducedMotion, isMilestone, scaleAnim, fadeAnim, cardSlide, milestoneScale]);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Return to Ride Tracker">
            <Image source={require('../../../assets/images/screens/explore/back.png')}
              style={{ width: 35, height: 35 }} contentFit="contain" />
          </Pressable>
        </TopbarColumn>
        <TopbarColumn><TopbarText>Ride Journal</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}>
          {onLogAnother && (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onLogAnother(); }}
              accessibilityRole="button"
              accessibilityLabel="Log another ride"
              style={styles.addRideButton}
            >
              <Text style={styles.addRideText}>+ RIDE</Text>
            </Pressable>
          )}
        </TopbarColumn>
      </Topbar>
      <ImageBackground source={require('../../../assets/images/seaweed_background.png')}
        style={styles.container} resizeMode="cover">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Success header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
            style={styles.heroShark} contentFit="contain" />
          <Text style={styles.successTitle}>Ride Logged!</Text>
          {xpEarned > 0 ? (
            <Text style={styles.xpText}>+{xpEarned} XP</Text>
          ) : (
            <Text style={styles.journalText}>Saved to your ride journal</Text>
          )}
        </Animated.View>

        {/* Milestone celebration */}
        {isMilestone && (
          <Animated.View style={[styles.milestoneCard, { transform: [{ scale: milestoneScale }] }]}>
            <Image source={require('../../../assets/images/screens/explore/stampbook.png')}
              style={styles.milestoneIcon} contentFit="contain" />
            <Text style={styles.milestoneTitle}>Ride #{milestone}!</Text>
            <Text style={styles.milestoneMessage}>{MILESTONE_MESSAGES[milestone!]}</Text>
          </Animated.View>
        )}

        {/* Achievements */}
        {newAchievements.length > 0 && (
          <Animated.View style={[styles.achievementsContainer, { opacity: fadeAnim }]}>
            {newAchievements.map(a => (
              <View key={a.id} style={styles.achievementRow}>
                <Image source={require('../../../assets/images/screens/explore/stampbook.png')}
                  style={styles.achievementIcon} contentFit="contain" />
                <Text style={styles.achievementText}>{a.name} unlocked!</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Shareable Card */}
        {showCard && (
          <Animated.View style={[styles.cardContainer, { transform: [{ translateY: cardSlide }] }]}>
            <ShareableRideCard ride={ride} rideCount={rideCount} />
          </Animated.View>
        )}

      </ScrollView>
      <ConfettiBurst trigger={showConfetti} />
      </ImageBackground>
    </Wrapper>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DFF3FF' },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingTop: 10, paddingBottom: 90, alignItems: 'center' },
  header: { alignItems: 'center', marginBottom: 12 },
  heroShark: { width: 116, height: 116 },
  successTitle: {
    color: '#0B4B83', fontSize: 34, fontWeight: '900', fontFamily: 'Shark',
    marginTop: 3,
  },
  xpText: { color: '#7E5100', fontSize: 22, fontWeight: '700', marginTop: 4 },
  journalText: { color: '#315C7C', fontSize: 17, fontFamily: 'Knockout', marginTop: 5 },
  // Milestone
  milestoneCard: {
    backgroundColor: '#FFF5D3', borderRadius: 16, padding: 20, marginBottom: 20,
    width: '100%', alignItems: 'center',
    borderWidth: 2, borderColor: '#E3AE3E',
    ...shadows.glow(colors.tertiary, 0.2),
  },
  milestoneIcon: { width: 54, height: 54 },
  milestoneTitle: {
    color: colors.tertiary, fontSize: 28, fontWeight: '900', fontFamily: 'Shark', marginTop: 8,
  },
  milestoneMessage: { color: '#59421E', fontSize: 16, fontFamily: 'Knockout', marginTop: 4 },
  // Achievements
  achievementsContainer: { marginBottom: 12, width: '100%' },
  achievementRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFF5D3', borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#E3AE3E',
  },
  achievementIcon: { width: 38, height: 38 },
  achievementText: { color: '#745012', fontSize: 16, fontFamily: 'Knockout', flex: 1 },
  // Card
  cardContainer: { width: '100%', marginBottom: 20 },
  addRideButton: { backgroundColor: '#FFCB35', borderRadius: 13,
    paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#A9680C' },
  addRideText: { color: '#603600', fontSize: 12, fontWeight: '900', fontFamily: 'Knockout' },
});

export default RideLogSuccess;
