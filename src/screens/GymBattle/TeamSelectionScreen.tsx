/**
 * Pick your team. Like Pokémon GO's team choice: three crews, each with a vibe,
 * and live proof of what joining means (how many rides each holds today). Not
 * sure? Finn runs a quick 3-question "help me choose". Joining is for keeps,
 * so there's a clear confirm, and a real celebration once it's done.
 */
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLiveParks } from '../../api/endpoints/me/livePark';
import { joinTeam } from '../../api/endpoints/gym-battle';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { GameIcon } from '../../ui';
import { QUESTION_BANK } from './teamQuiz';

const ORDER: TeamId[] = ['mouse', 'globe', 'shark'];
const BIG_BADGE: Record<TeamId, number> = {
  mouse: require('../../../assets/images/team-mouse-badge.png'),
  globe: require('../../../assets/images/team-globe-badge.png'),
  shark: require('../../../assets/images/team-shark-badge.png'),
};
const VIBE: Record<TeamId, { tag: string; line: string }> = {
  mouse: { tag: 'THE PLANNERS', line: 'Rope drop, perfect routes, every ride in order.' },
  globe: { tag: 'THE EXPLORERS', line: 'Every land, every snack, every hidden detail.' },
  shark: { tag: 'THE THRILL CREW', line: 'Biggest drops first. Go all in, all day.' },
};
const FINN = require('../../../assets/images/tutorial/teacher-shark.png');

type Stage = 'pick' | 'quiz' | 'confirm' | 'joining' | 'done' | 'error';

interface Props {
  navigation?: any;
  route?: { params?: { onTeamSelected?: () => void; isOnboarding?: boolean } };
}

function drawQuestions() {
  return [...QUESTION_BANK].sort(() => Math.random() - 0.5).slice(0, 3);
}

export default function TeamSelectionScreen({ navigation, route }: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [team, setTeam] = useState<TeamId | null>(null);
  const [suggested, setSuggested] = useState<TeamId | null>(null);
  const [held, setHeld] = useState<Record<TeamId, number> | null>(null);
  const [questions, setQuestions] = useState(drawQuestions);
  const [qIndex, setQIndex] = useState(0);
  const [scores, setScores] = useState<Record<TeamId, number>>({ mouse: 0, globe: 0, shark: 0 });

  useEffect(() => { getLiveParks().then(l => setHeld(l.totals)).catch(() => undefined); }, []);

  const leader = useMemo(() => {
    if (!held) return null;
    const max = Math.max(...ORDER.map(t => held[t]));
    const tops = ORDER.filter(t => held[t] === max);
    return max > 0 && tops.length === 1 ? tops[0] : null;
  }, [held]);
  const underdog = useMemo(() => {
    if (!held) return null;
    const min = Math.min(...ORDER.map(t => held[t]));
    const lows = ORDER.filter(t => held[t] === min);
    return lows.length === 1 ? lows[0] : null;
  }, [held]);

  const choose = (t: TeamId) => {
    Haptics.selectionAsync();
    setTeam(t);
    setStage('confirm');
  };

  const answer = (t: TeamId, points: number) => {
    Haptics.selectionAsync();
    const next = { ...scores, [t]: scores[t] + points };
    setScores(next);
    if (qIndex + 1 < questions.length) { setQIndex(qIndex + 1); return; }
    const best = ORDER.reduce((a, b) => (next[b] > next[a] ? b : a), ORDER[Math.floor(Math.random() * 3)]);
    setSuggested(best);
    setTeam(best);
    setStage('confirm');
  };

  const join = async () => {
    if (!team) return;
    setStage('joining');
    try {
      await joinTeam(team);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStage('done');
    } catch (error: any) {
      // Already on this team (e.g. a retried request) counts as joined.
      if (error?.response?.data?.current_team === team) { setStage('done'); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStage('error');
    }
  };

  const finish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (route?.params?.onTeamSelected) route.params.onTeamSelected();
    else if (route?.params?.isOnboarding) navigation?.reset({ index: 0, routes: [{ name: 'Explore' }] });
    else navigation?.goBack();
  };

  return (
    <View style={s.root}>
      <Image source={require('../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, s.tint]} />
      <SafeAreaView style={s.safe}>
        {stage !== 'done' && (
          <Pressable style={s.close} onPress={() => navigation?.goBack()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
            <GameIcon name="close" size={36} />
          </Pressable>
        )}

        {stage === 'pick' && (
          <View style={s.page}>
            <Animated.Text entering={FadeInDown.duration(400)} style={s.title}>PICK YOUR TEAM</Animated.Text>
            <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={s.sub}>
              Your team battles for rides at every park. Catch coins, beat bosses and win rides for your crew.
            </Animated.Text>
            <View style={s.cards}>
              {ORDER.map((t, i) => (
                <Animated.View key={t} entering={FadeInUp.delay(160 + i * 110).springify().damping(14)}>
                  <TeamCard team={t} held={held?.[t]} leader={leader === t} underdog={underdog === t && leader !== null}
                    onPress={() => choose(t)} />
                </Animated.View>
              ))}
            </View>
            <Animated.View entering={FadeIn.delay(600)}>
              <Pressable style={s.helpBtn} accessibilityRole="button"
                onPress={() => { setQuestions(drawQuestions()); setQIndex(0); setScores({ mouse: 0, globe: 0, shark: 0 }); setStage('quiz'); }}>
                <Image source={FINN} style={s.helpFinn} contentFit="contain" />
                <Text style={s.helpText}>Not sure? Let Finn help you choose</Text>
                <GameIcon name="arrow" size={18} />
              </Pressable>
            </Animated.View>
          </View>
        )}

        {stage === 'quiz' && (
          <View style={s.page} key={`q${qIndex}`}>
            <Animated.View entering={ZoomIn.springify().damping(12)}>
              <Image source={FINN} style={s.quizFinn} contentFit="contain" />
            </Animated.View>
            <Text style={s.progress}>QUESTION {qIndex + 1} OF {questions.length}</Text>
            <Animated.Text entering={FadeInDown.duration(300)} style={s.question}>{questions[qIndex].text}</Animated.Text>
            <View style={s.answers}>
              {questions[qIndex].answers.map((a, i) => (
                <Animated.View key={a.text} entering={FadeInUp.delay(80 + i * 70).duration(300)}>
                  <Pressable style={({ pressed }) => [s.answer, pressed && s.answerPressed]} accessibilityRole="button"
                    onPress={() => answer(a.team as TeamId, a.points)}>
                    <Text style={s.answerText}>{a.text}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
            <Pressable onPress={() => setStage('pick')} hitSlop={8}><Text style={s.back}>‹ Back to the teams</Text></Pressable>
          </View>
        )}

        {(stage === 'confirm' || stage === 'joining' || stage === 'error') && team && (
          <View style={s.page}>
            {suggested === team && <Animated.Text entering={FadeInDown} style={s.finnSays}>Finn thinks you’re a…</Animated.Text>}
            <Animated.View entering={ZoomIn.springify().damping(11)}>
              <Image source={BIG_BADGE[team]} style={s.bigBadge} contentFit="contain" />
            </Animated.View>
            <Text style={[s.teamName, { color: TEAMS[team].color }]}>{teamName(team).toUpperCase()}</Text>
            <Text style={s.tag}>{VIBE[team].tag}</Text>
            <Text style={s.line}>{VIBE[team].line}</Text>
            <View style={s.warn}>
              <Text style={s.warnText}>This is for keeps: you can’t switch teams later.</Text>
            </View>
            {stage === 'error' && <Text style={s.error}>Couldn’t join just now. Check your internet and try again.</Text>}
            <Pressable style={[s.join, { backgroundColor: TEAMS[team].color }]} onPress={() => void join()}
              disabled={stage === 'joining'} accessibilityRole="button">
              {stage === 'joining' ? <ActivityIndicator color="#fff" />
                : <Text style={s.joinText}>JOIN {teamName(team).toUpperCase()}</Text>}
            </Pressable>
            <Pressable onPress={() => { setSuggested(null); setStage('pick'); }} hitSlop={8} disabled={stage === 'joining'}>
              <Text style={s.back}>‹ See all three teams</Text>
            </Pressable>
          </View>
        )}

        {stage === 'done' && team && <Welcome team={team} onGo={finish} />}
      </SafeAreaView>
    </View>
  );
}

function TeamCard({ team, held, leader, underdog, onPress }: {
  team: TeamId; held?: number; leader: boolean; underdog: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${teamName(team)}. ${VIBE[team].line}`}
      style={({ pressed }) => [s.card, { borderColor: TEAMS[team].color }, pressed && s.cardPressed]}>
      <Image source={BIG_BADGE[team]} style={s.cardBadge} contentFit="contain" />
      <View style={{ flex: 1 }}>
        <Text style={[s.cardName, { color: TEAMS[team].color }]}>{teamName(team)}</Text>
        <Text style={s.cardTag}>{VIBE[team].tag}</Text>
        <Text style={s.cardLine}>{VIBE[team].line}</Text>
        {held !== undefined && (
          <Text style={s.cardHeld}>
            Holds {held} ride{held === 1 ? '' : 's'} today{leader ? '  ·  leading' : underdog ? '  ·  extra points (behind)' : ''}
          </Text>
        )}
      </View>
      {leader ? <GameIcon name="crown" size={26} /> : <GameIcon name="arrow" size={22} />}
    </Pressable>
  );
}

function Welcome({ team, onGo }: { team: TeamId; onGo: () => void }) {
  const glow = useSharedValue(0);
  const pop = useSharedValue(0.4);
  useEffect(() => {
    pop.value = withSequence(withSpring(1.15, { damping: 7 }), withSpring(1, { damping: 10 }));
    glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [glow, pop]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { rotate: `${(1 - Math.min(1, pop.value)) * -30}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.08 }] }));
  return (
    <View style={s.page}>
      <Animated.Text entering={FadeInDown.delay(200)} style={s.welcomeKicker}>WELCOME TO</Animated.Text>
      <View style={s.welcomeStage}>
        <Animated.View style={[s.ring, { backgroundColor: TEAMS[team].color }, ring]} />
        <Animated.View style={badge}>
          <Image source={BIG_BADGE[team]} style={s.welcomeBadge} contentFit="contain" />
        </Animated.View>
      </View>
      <Animated.Text entering={FadeInUp.delay(300)} style={[s.welcomeName, { color: TEAMS[team].color }]}>
        {teamName(team).toUpperCase()}!
      </Animated.Text>
      <Animated.Text entering={FadeInUp.delay(450)} style={s.line}>
        Every ride coin you catch at a park now wins power for your team. Beat bosses and hold rides together!
      </Animated.Text>
      <Animated.View entering={FadeInUp.delay(600)} style={{ width: '100%' }}>
        <Pressable style={[s.join, { backgroundColor: TEAMS[team].color }]} onPress={onGo} accessibilityRole="button">
          <Text style={s.joinText}>LET’S GO!</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0768b9' },
  tint: { backgroundColor: 'rgba(3, 38, 92, 0.45)' },
  safe: { flex: 1 },
  close: { position: 'absolute', top: 54, right: 18, zIndex: 5, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(5,52,110,0.3)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  page: { flex: 1, paddingHorizontal: 18, paddingTop: 28, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Shark', fontSize: 38, color: '#ffcf3b', textAlign: 'center',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 17, color: '#fff', textAlign: 'center', marginTop: 6, lineHeight: 22, paddingHorizontal: 10 },
  cards: { width: '100%', gap: 12, marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 22, borderWidth: 4,
    padding: 12, shadowColor: '#021e45', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } },
  cardPressed: { transform: [{ scale: 0.97 }] },
  cardBadge: { width: 76, height: 76 },
  cardName: { fontFamily: 'Shark', fontSize: 24 },
  cardTag: { fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1.2, color: '#64748b' },
  cardLine: { fontFamily: 'Knockout', fontSize: 15, color: '#1e3a5f', marginTop: 2 },
  cardHeld: { fontFamily: 'Knockout', fontSize: 13, color: '#0768b9', marginTop: 4 },
  cardGo: { fontFamily: 'Shark', fontSize: 34 },
  helpBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 18, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  helpFinn: { width: 40, height: 44 },
  helpText: { fontFamily: 'Shark', fontSize: 16, color: '#fff' },
  quizFinn: { width: 150, height: 160 },
  progress: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1.5, color: '#cdeaff', marginTop: 6 },
  question: { fontFamily: 'Shark', fontSize: 26, color: '#fff', textAlign: 'center', marginTop: 6, lineHeight: 30 },
  answers: { width: '100%', gap: 10, marginTop: 18 },
  answer: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 4,
    borderBottomColor: '#bcd9f5' },
  answerPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 2, backgroundColor: '#fff7d6' },
  answerText: { fontFamily: 'Knockout', fontSize: 18, color: '#09268f', textAlign: 'center' },
  back: { fontFamily: 'Knockout', fontSize: 15, color: '#cdeaff', marginTop: 16 },
  finnSays: { fontFamily: 'Shark', fontSize: 20, color: '#ffcf3b', marginBottom: 4 },
  bigBadge: { width: 190, height: 190 },
  teamName: { fontFamily: 'Shark', fontSize: 40, marginTop: 4, textShadowColor: '#021e45', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  tag: { fontFamily: 'Knockout', fontSize: 14, letterSpacing: 2, color: '#cdeaff' },
  line: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 8, lineHeight: 23, paddingHorizontal: 8 },
  warn: { marginTop: 16, backgroundColor: 'rgba(5,52,110,0.3)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  warnText: { fontFamily: 'Knockout', fontSize: 14, color: '#ffe08a', textAlign: 'center' },
  error: { fontFamily: 'Knockout', fontSize: 14, color: '#fecaca', marginTop: 10, textAlign: 'center' },
  join: { width: '100%', marginTop: 18, borderRadius: 20, paddingVertical: 16, alignItems: 'center', borderWidth: 3, borderColor: '#fff' },
  joinText: { fontFamily: 'Shark', fontSize: 24, color: '#fff', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  welcomeKicker: { fontFamily: 'Shark', fontSize: 22, color: '#fff' },
  welcomeStage: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 240, height: 240, borderRadius: 120 },
  welcomeBadge: { width: 220, height: 220 },
  welcomeName: { fontFamily: 'Shark', fontSize: 42, textShadowColor: '#021e45', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
});
