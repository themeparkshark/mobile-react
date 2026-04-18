import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated as RNAnimated,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  BounceIn,
  ZoomIn,
  SlideInRight,
  SlideOutLeft,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { joinTeam } from '../../api/endpoints/gym-battle';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Sparkle ───
const Sparkle = ({ delay, startX, startY, color }: { delay: number; startX: number; startY: number; color: string }) => {
  const translateY = useRef(new RNAnimated.Value(0)).current;
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const scale = useRef(new RNAnimated.Value(0.5)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(0);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.5);

      RNAnimated.sequence([
        RNAnimated.delay(delay),
        RNAnimated.parallel([
          RNAnimated.timing(translateY, { toValue: -150 - Math.random() * 100, duration: 4000 + Math.random() * 2000, useNativeDriver: true }),
          RNAnimated.timing(translateX, { toValue: (Math.random() - 0.5) * 80, duration: 4000 + Math.random() * 2000, useNativeDriver: true }),
          RNAnimated.sequence([
            RNAnimated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
            RNAnimated.timing(opacity, { toValue: 0, duration: 3200, delay: 1000, useNativeDriver: true }),
          ]),
          RNAnimated.sequence([
            RNAnimated.timing(scale, { toValue: 1, duration: 1000, useNativeDriver: true }),
            RNAnimated.timing(scale, { toValue: 0.3, duration: 3000, useNativeDriver: true }),
          ]),
        ]),
      ]).start(() => animate());
    };
    animate();
  }, []);

  return (
    <RNAnimated.View style={{ position: 'absolute', left: startX, top: startY, transform: [{ translateY }, { translateX }, { scale }], opacity }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8 }} />
    </RNAnimated.View>
  );
};

const SPARKLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  delay: i * 200,
  startX: Math.random() * SCREEN_W,
  startY: SCREEN_H * 0.2 + Math.random() * SCREEN_H * 0.6,
  color: ['#fec90e', '#FFD700', '#FFF', '#87CEEB', '#FFB6C1'][Math.floor(Math.random() * 5)],
}));

// ─── Confetti particle ───
const ConfettiPiece = ({ delay, color }: { delay: number; color: string }) => {
  const translateY = useRef(new RNAnimated.Value(-20)).current;
  const translateX = useRef(new RNAnimated.Value((Math.random() - 0.5) * SCREEN_W)).current;
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const rotate = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    RNAnimated.sequence([
      RNAnimated.delay(delay),
      RNAnimated.parallel([
        RNAnimated.timing(translateY, { toValue: SCREEN_H + 50, duration: 3000 + Math.random() * 2000, useNativeDriver: true }),
        RNAnimated.timing(translateX, { toValue: (Math.random() - 0.5) * SCREEN_W * 1.5, duration: 3000 + Math.random() * 2000, useNativeDriver: true }),
        RNAnimated.sequence([
          RNAnimated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          RNAnimated.timing(opacity, { toValue: 0, duration: 2000, delay: 1500, useNativeDriver: true }),
        ]),
        RNAnimated.timing(rotate, { toValue: 10, duration: 3000, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 10], outputRange: ['0deg', '720deg'] });

  return (
    <RNAnimated.View style={{
      position: 'absolute', left: SCREEN_W / 2, top: -10,
      transform: [{ translateY }, { translateX }, { rotate: spin }],
      opacity,
    }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
    </RNAnimated.View>
  );
};

// ─── Types & Data ───
interface Props {
  navigation?: any;
  route?: { params?: { onTeamSelected?: () => void; isOnboarding?: boolean } };
}

type Team = 'mouse' | 'globe' | 'shark';
type Stage = 'intro' | 'question' | 'sorting' | 'result';

// Large question bank — 3 are randomly selected each time
const QUESTION_BANK = [
  {
    text: "You're at a theme park.\nWhat do you do first?",
    answers: [
      { text: 'Find the newest ride and sprint there', team: 'globe' as Team, points: 2 },
      { text: 'Grab a map and plan the perfect route', team: 'mouse' as Team, points: 2 },
      { text: 'Follow the crowd and see what happens', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "Your friend is scared\nof a ride. You...",
    answers: [
      { text: 'Drag them on anyway, they\'ll love it', team: 'globe' as Team, points: 2 },
      { text: 'Show them the safety stats to calm them down', team: 'mouse' as Team, points: 2 },
      { text: 'Ride it yourself and tell them how great it was', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Pick a park snack.',
    answers: [
      { text: 'Turkey leg - go big or go home', team: 'globe' as Team, points: 2 },
      { text: 'Dole Whip - a classic for a reason', team: 'mouse' as Team, points: 2 },
      { text: 'Whatever looks good right now', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "The park is closing in\n30 minutes. You...",
    answers: [
      { text: 'Run to re-ride your favorite one more time', team: 'globe' as Team, points: 2 },
      { text: 'Head to the exit early to beat the crowd', team: 'mouse' as Team, points: 2 },
      { text: 'Stay for the fireworks, obviously', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Your ideal park day\nweather is...',
    answers: [
      { text: 'Hot and sunny - bring on the energy', team: 'globe' as Team, points: 2 },
      { text: 'Cool and overcast - shorter lines', team: 'mouse' as Team, points: 2 },
      { text: 'Light rain - thins the crowd out', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You see a ride with\na 90-minute wait.',
    answers: [
      { text: 'Get in line. Worth it.', team: 'globe' as Team, points: 2 },
      { text: 'Check the app for a better time later', team: 'mouse' as Team, points: 2 },
      { text: 'Skip it and find a walk-on', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "What's your ride\nstyle?",
    answers: [
      { text: 'The faster and wilder the better', team: 'globe' as Team, points: 2 },
      { text: 'Dark rides with incredible theming', team: 'mouse' as Team, points: 2 },
      { text: 'A little bit of everything', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'A new land just opened.\nYou...',
    answers: [
      { text: 'Were there on opening day, obviously', team: 'globe' as Team, points: 2 },
      { text: 'Wait a month for the crowds to die down', team: 'mouse' as Team, points: 2 },
      { text: 'Go when a friend invites you', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You can only bring one\nthing to the park.',
    answers: [
      { text: 'Portable charger - gotta stay connected', team: 'globe' as Team, points: 2 },
      { text: 'Sunscreen - prepared for everything', team: 'mouse' as Team, points: 2 },
      { text: 'Good vibes - that\'s all you need', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Your group can\'t agree\non what to do next.',
    answers: [
      { text: 'Take charge and pick something', team: 'globe' as Team, points: 2 },
      { text: 'Pull up wait times and find the best option', team: 'mouse' as Team, points: 2 },
      { text: 'Suggest splitting up and meeting later', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'What draws you to\na theme park most?',
    answers: [
      { text: 'The thrill of the rides', team: 'globe' as Team, points: 2 },
      { text: 'The storytelling and details', team: 'mouse' as Team, points: 2 },
      { text: 'The whole vibe and atmosphere', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: "It's your birthday.\nPark plan?",
    answers: [
      { text: 'VIP tour - go all out', team: 'globe' as Team, points: 2 },
      { text: 'Hit every classic ride on a perfect schedule', team: 'mouse' as Team, points: 2 },
      { text: 'No plan, just enjoy the day', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Best seat on\na roller coaster?',
    answers: [
      { text: 'Front row, no question', team: 'globe' as Team, points: 2 },
      { text: 'Back row - best forces', team: 'mouse' as Team, points: 2 },
      { text: 'Wherever is open, let\'s go', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'You find a hidden\ndetail in a ride queue.',
    answers: [
      { text: 'Cool, but I want to get on the ride already', team: 'globe' as Team, points: 2 },
      { text: 'Stop and study it, this is the good stuff', team: 'mouse' as Team, points: 2 },
      { text: 'Take a photo and share it with friends', team: 'shark' as Team, points: 2 },
    ],
  },
  {
    text: 'Pick a park souvenir.',
    answers: [
      { text: 'A limited edition pin nobody else has', team: 'globe' as Team, points: 2 },
      { text: 'A vintage-style poster for the wall', team: 'mouse' as Team, points: 2 },
      { text: 'Matching ears with your crew', team: 'shark' as Team, points: 2 },
    ],
  },
];

// Shuffle and pick 3 random questions
function pickQuestions() {
  const shuffled = [...QUESTION_BANK].sort(() => Math.random() - 0.5);
  // Also shuffle answer order within each question
  return shuffled.slice(0, 3).map(q => ({
    ...q,
    answers: [...q.answers].sort(() => Math.random() - 0.5),
  }));
}

const QUESTIONS = pickQuestions();

const TEAM_DATA: Record<Team, { name: string; color: string; badge: any }> = {
  mouse: {
    name: 'TEAM MOUSE',
    color: '#F59E0B',
    badge: require('../../../assets/images/team-mouse-badge.png'),
  },
  globe: {
    name: 'TEAM GLOBE',
    color: '#22C55E',
    badge: require('../../../assets/images/team-globe-badge.png'),
  },
  shark: {
    name: 'TEAM SHARK',
    color: '#3B82F6',
    badge: require('../../../assets/images/team-shark-badge.png'),
  },
};

const CONFETTI_COLORS = ['#fec90e', '#F59E0B', '#22C55E', '#3B82F6', '#FFD700', '#FF6B6B', '#A855F7', '#FFF'];

// ─── Main Component ───
export default function TeamSelectionScreen({ navigation, route }: Props) {
  const [stage, setStage] = useState<Stage>('intro');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questionKey, setQuestionKey] = useState(0); // forces re-render for animations
  const [scores, setScores] = useState<Record<Team, number>>({ mouse: 0, globe: 0, shark: 0 });
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [assignedTeam, setAssignedTeam] = useState<Team | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [sortingDots, setSortingDots] = useState('');

  // ─── Animations ───
  const sparkleIntensity = useSharedValue(1);
  const finFloat = useSharedValue(0);
  const finRotate = useSharedValue(0);
  const finScale = useSharedValue(0.3);
  const finGlow = useSharedValue(0);
  const beginPulse = useSharedValue(1);

  useEffect(() => {
    sparkleIntensity.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 3000 }), withTiming(1, { duration: 3000 })),
      -1, true
    );
    finScale.value = withDelay(200, withSpring(1, { damping: 8, stiffness: 80 }));
    finFloat.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(-12, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(12, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));
    finRotate.value = withDelay(600, withRepeat(
      withSequence(
        withTiming(-4, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true
    ));
    finGlow.value = withDelay(800, withRepeat(
      withSequence(withTiming(1, { duration: 1500 }), withTiming(0.4, { duration: 1500 })),
      -1, true
    ));
    beginPulse.value = withDelay(1300, withRepeat(
      withSequence(withTiming(1.08, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1, true
    ));
  }, []);

  // Sorting dots animation ("..." cycling)
  useEffect(() => {
    if (stage !== 'sorting') return;
    const interval = setInterval(() => {
      setSortingDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);
    return () => clearInterval(interval);
  }, [stage]);

  const sparkleStyle = useAnimatedStyle(() => ({ opacity: sparkleIntensity.value }));
  const finAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: finFloat.value },
      { rotate: `${finRotate.value}deg` },
      { scale: finScale.value },
    ],
  }));
  const finGlowStyle = useAnimatedStyle(() => ({ opacity: finGlow.value }));
  const beginPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: beginPulse.value }] }));

  // ─── Handlers ───
  const handleBegin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStage('question');
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (selectedAnswer !== null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectedAnswer(answerIndex);

    const answer = QUESTIONS[currentQuestion].answers[answerIndex];
    const updatedScores = { ...scores, [answer.team]: scores[answer.team] + answer.points };
    setScores(updatedScores);

    setTimeout(() => {
      setSelectedAnswer(null);
      if (currentQuestion < QUESTIONS.length - 1) {
        setCurrentQuestion(prev => prev + 1);
        setQuestionKey(prev => prev + 1);
      } else {
        setStage('sorting');
        startSorting(updatedScores);
      }
    }, 600);
  };

  const startSorting = (finalScores: Record<Team, number>) => {
    // Haptic "thinking" pattern
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 500);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 1000);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 1500);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 2000);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 2500);

    const teams = Object.keys(finalScores) as Team[];
    const maxScore = Math.max(...teams.map(t => finalScores[t]));
    const winners = teams.filter(t => finalScores[t] === maxScore);
    const winner = winners[Math.floor(Math.random() * winners.length)];

    setTimeout(() => {
      setAssignedTeam(winner);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowConfetti(true);
      setStage('result');
      joinTeamAutomatically(winner);
    }, 3000);
  };

  const joinTeamAutomatically = async (team: Team) => {
    setIsJoining(true);
    // Show button after 2s no matter what — don't let API hang strand users
    const safetyTimer = setTimeout(() => {
      setIsJoining(false);
      setHasJoined(true);
    }, 2000);
    try {
      await joinTeam(team);
    } catch (error: any) {
      // Proceed regardless of error — team may already be set
      console.warn('Join team error (proceeding anyway):', error?.message);
    } finally {
      clearTimeout(safetyTimer);
      setIsJoining(false);
      setHasJoined(true);
    }
  };

  const handleEnterArena = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (route?.params?.onTeamSelected) {
      route.params.onTeamSelected();
    } else if (route?.params?.isOnboarding) {
      // Onboarding flow — go to Explore since there's no callback
      navigation?.reset({ index: 0, routes: [{ name: 'Explore' }] });
    } else {
      navigation?.goBack();
    }
  };

  // ─── Render ───
  const teamColor = assignedTeam ? TEAM_DATA[assignedTeam].color : '#fec90e';

  return (
    <View style={s.container}>
      {/* Background */}
      <Image source={require('../../../assets/images/team-selection-bg.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={s.darkOverlay} />

      {/* Sparkles */}
      <Animated.View style={[StyleSheet.absoluteFill, sparkleStyle]}>
        {SPARKLES.map(sp => <Sparkle key={sp.id} delay={sp.delay} startX={sp.startX} startY={sp.startY} color={sp.color} />)}
      </Animated.View>

      {/* ─── INTRO ─── */}
      {stage === 'intro' && (
        <Animated.View entering={FadeIn} style={s.centered}>
          <View style={s.finContainer}>
            <Animated.View style={[s.finGlow, finGlowStyle]} />
            <Animated.View style={finAnimStyle}>
              <Image source={require('../../../assets/images/sorting-fin.png')} style={s.finImage} contentFit="contain" />
            </Animated.View>
          </View>
          <Animated.Text entering={FadeInUp.delay(700)} style={s.title}>
            THE SORTING FIN
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(1000)} style={s.subtitle}>
            Answer three questions{'\n'}to discover your team.
          </Animated.Text>
          <Animated.View entering={FadeInUp.delay(1300)} style={beginPulseStyle}>
            <TouchableOpacity style={s.beginBtn} onPress={handleBegin} activeOpacity={0.8}>
              <LinearGradient colors={['#fec90e', '#d4a70a']} style={s.beginBtnGrad}>
                <Text style={s.beginBtnText}>Begin</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* ─── QUESTIONS ─── */}
      {stage === 'question' && (
        <View style={s.questionContainer}>
          {/* Progress */}
          <View style={s.progressRow}>
            {QUESTIONS.map((_, i) => (
              <View key={i} style={[s.progressDot, i <= currentQuestion && s.progressDotActive]}>
                {i < currentQuestion && <Text style={s.progressCheck}>✓</Text>}
              </View>
            ))}
            <View style={s.progressLine}>
              <View style={[s.progressLineFill, { width: `${((currentQuestion) / (QUESTIONS.length - 1)) * 100}%` }]} />
            </View>
          </View>

          {/* Question */}
          <Animated.View key={questionKey} entering={SlideInRight.duration(300)} style={s.questionContent}>
            <Text style={s.questionNum}>QUESTION {currentQuestion + 1}</Text>
            <Text style={s.questionText}>{QUESTIONS[currentQuestion].text}</Text>

            <View style={s.answersWrap}>
              {QUESTIONS[currentQuestion].answers.map((answer, idx) => (
                <Animated.View key={`${questionKey}-${idx}`} entering={FadeInUp.delay(200 + idx * 150)}>
                  <TouchableOpacity
                    style={[s.answerCard, selectedAnswer === idx && s.answerCardSelected]}
                    onPress={() => handleAnswerSelect(idx)}
                    disabled={selectedAnswer !== null}
                    activeOpacity={0.7}
                  >
                    <View style={s.answerLetter}>
                      <Text style={[s.answerLetterText, selectedAnswer === idx && { color: '#09268f' }]}>
                        {['A', 'B', 'C'][idx]}
                      </Text>
                    </View>
                    <Text style={[s.answerText, selectedAnswer === idx && s.answerTextSelected]}>
                      {answer.text}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          {/* Small fin in corner during questions */}
          <Animated.View style={[s.questionFin, finAnimStyle]}>
            <Image source={require('../../../assets/images/sorting-fin.png')} style={s.questionFinImage} contentFit="contain" />
          </Animated.View>
        </View>
      )}

      {/* ─── SORTING (thinking) ─── */}
      {stage === 'sorting' && (
        <Animated.View entering={FadeIn} style={s.centered}>
          <Animated.View style={finAnimStyle}>
            <Image source={require('../../../assets/images/sorting-fin.png')} style={s.sortingFinImage} contentFit="contain" />
          </Animated.View>
          <Animated.Text entering={FadeInUp.delay(300)} style={s.sortingText}>
            Hmm, interesting{sortingDots}
          </Animated.Text>
          <Animated.Text entering={FadeInUp.delay(1200)} style={s.sortingSubtext}>
            The Sorting Fin is deciding{sortingDots}
          </Animated.Text>
        </Animated.View>
      )}

      {/* ─── RESULT ─── */}
      {stage === 'result' && assignedTeam && (
        <Animated.View entering={FadeIn} style={s.centered}>
          {/* Confetti */}
          {showConfetti && Array.from({ length: 40 }).map((_, i) => (
            <ConfettiPiece key={i} delay={i * 60} color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]} />
          ))}

          {/* Team color glow */}
          <Animated.View entering={ZoomIn.delay(100)} style={[s.resultGlow, { backgroundColor: teamColor + '30', shadowColor: teamColor }]} />

          {/* Badge */}
          <Animated.View entering={BounceIn.delay(300)}>
            <Image source={TEAM_DATA[assignedTeam].badge} style={s.resultBadge} contentFit="contain" />
          </Animated.View>

          {/* Team name */}
          <Animated.Text entering={FadeInUp.delay(800)} style={[s.resultTeamName, { color: teamColor }]}>
            {TEAM_DATA[assignedTeam].name}
          </Animated.Text>

          <Animated.Text entering={FadeInUp.delay(1100)} style={s.resultWelcome}>
            The Sorting Fin has spoken!
          </Animated.Text>

          {/* Enter Arena button */}
          {hasJoined && (
            <Animated.View entering={FadeInUp.delay(1600)}>
              <TouchableOpacity style={[s.arenaBtn, { borderColor: teamColor }]} onPress={handleEnterArena} activeOpacity={0.8}>
                <Text style={[s.arenaBtnText, { color: teamColor }]}>Enter the Arena</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a1a' },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.85)' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },

  // Fin
  finContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  finGlow: {
    position: 'absolute', width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(254, 201, 14, 0.12)',
    shadowColor: '#fec90e', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 60,
  },
  finImage: { width: 280, height: 280 },

  // Intro
  title: {
    fontSize: 44, fontFamily: 'Shark', color: '#fec90e', textAlign: 'center', marginBottom: 12,
    textShadowColor: 'rgba(254, 201, 14, 0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 25,
  },
  subtitle: {
    fontSize: 17, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginBottom: 36, lineHeight: 24,
  },
  beginBtn: { borderRadius: 28, overflow: 'hidden',
    shadowColor: '#fec90e', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 8,
  },
  beginBtnGrad: { paddingVertical: 16, paddingHorizontal: 48, borderRadius: 28 },
  beginBtnText: { fontSize: 22, fontWeight: '900', color: '#09268f', textAlign: 'center', letterSpacing: 1 },

  // Questions
  questionContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 70 },
  progressRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: 36, gap: 24, position: 'relative',
  },
  progressDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', zIndex: 2,
  },
  progressDotActive: { backgroundColor: '#fec90e', borderColor: '#fec90e' },
  progressCheck: { color: '#09268f', fontSize: 14, fontWeight: '900' },
  progressLine: {
    position: 'absolute', left: SCREEN_W * 0.2, right: SCREEN_W * 0.2,
    height: 3, backgroundColor: 'rgba(255,255,255,0.1)', top: 13, zIndex: 1,
  },
  progressLineFill: { height: '100%', backgroundColor: '#fec90e', borderRadius: 2 },
  questionContent: { flex: 1, alignItems: 'center' },
  questionNum: {
    fontSize: 14, fontFamily: 'Knockout', color: '#fec90e',
    marginBottom: 16, letterSpacing: 3,
  },
  questionText: {
    fontSize: 26, color: 'white', textAlign: 'center', marginBottom: 36,
    lineHeight: 34, fontWeight: '700', fontFamily: 'Shark',
  },
  answersWrap: { width: '100%', gap: 14 },
  answerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 18,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  answerCardSelected: {
    backgroundColor: 'rgba(254, 201, 14, 0.15)', borderColor: '#fec90e',
    shadowColor: '#fec90e', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  answerLetter: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center',
    marginRight: 14,
  },
  answerLetterText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '800' },
  answerText: { fontSize: 15, color: 'rgba(255,255,255,0.9)', flex: 1, lineHeight: 21 },
  answerTextSelected: { color: '#fec90e', fontWeight: '700' },
  questionFin: { position: 'absolute', bottom: 30, right: 10, opacity: 0.3 },
  questionFinImage: { width: 80, height: 80 },

  // Sorting
  sortingFinImage: { width: 200, height: 200, marginBottom: 28 },
  sortingText: {
    fontSize: 24, fontFamily: 'Shark', color: '#fec90e', textAlign: 'center',
    fontStyle: 'italic', marginBottom: 8,
    textShadowColor: 'rgba(254, 201, 14, 0.4)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15,
  },
  sortingSubtext: {
    fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center', fontStyle: 'italic',
  },

  // Result
  resultGlow: {
    position: 'absolute', width: 300, height: 300, borderRadius: 150,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 80,
  },
  resultBadge: { width: 180, height: 180, marginBottom: 20 },
  resultTeamName: {
    fontSize: 36, fontWeight: '900', fontFamily: 'Shark', textAlign: 'center',
    letterSpacing: 2, marginBottom: 8,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  resultWelcome: {
    fontSize: 18, color: 'rgba(255,255,255,0.7)', textAlign: 'center',
    fontStyle: 'italic', marginBottom: 40,
  },
  arenaBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 16, paddingHorizontal: 36,
    borderRadius: 28, borderWidth: 2,
  },
  arenaBtnText: { fontSize: 20, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
});
