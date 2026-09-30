import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { buildCrewGrid, crewGridHasLine } from '../../../services/lineplay/crewGrid';
import { SoundEffectContext } from '../../../context/SoundEffectProvider';
import * as Haptics from '../../../helpers/haptics';
import { BRAND, GameIcon, type GameIconName } from '../../../ui';

interface Props {
  readonly rideName: string;
  readonly chapterTitle: string;
  readonly seed: number;
  readonly marks: readonly number[];
  readonly completed: boolean;
  readonly paused: boolean;
  readonly onToggle: (index: number) => void;
}

/** Each prompt wears one of his drawn icons; no dingbats. */
const SYMBOLS: Record<string, GameIconName> = {
  color: 'pin', shape: 'dice', sound: 'bell', name: 'edit', memory: 'search',
  captain: 'crown', prediction: 'ride', 'three-words': 'info', pattern: 'retry',
  vote: 'check', story: 'star', symbol: 'fin', question: 'heart', direction: 'map',
  snack: 'gift', pose: 'shark', 'story-clue': 'sparkle',
};

/** A self-reported one-phone activity. Only verified queue time can mint Parts. */
export default function CrewGridCard({ rideName, chapterTitle, seed, marks, completed, paused, onToggle }: Props) {
  const squares = useMemo(() => buildCrewGrid(rideName, chapterTitle, seed), [rideName, chapterTitle, seed]);
  const [selected, setSelected] = useState(4);
  const scrollRef = useRef<ScrollView>(null);
  const hasLine = completed || crewGridHasLine(marks);
  const celebration = useRef(new Animated.Value(hasLine ? 1 : 0)).current;
  const celebrated = useRef(hasLine);
  const { playSound } = useContext(SoundEffectContext);
  const selectedSquare = squares[selected];
  useEffect(() => {
    celebrated.current = completed || crewGridHasLine(marks);
    celebration.setValue(celebrated.current ? 1 : 0);
  // A new ride or board is a new activity; ordinary marks must not reset the animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideName, seed]);
  const chooseSquare = (index: number) => {
    setSelected(index);
    scrollRef.current?.scrollToEnd({ animated: true });
  };
  const toggleSquare = () => {
    if (paused || hasLine) return;
    const next = marks.includes(selected) ? marks.filter(mark => mark !== selected) : [...marks, selected];
    const won = !marks.includes(selected) && crewGridHasLine(next);
    onToggle(selected);
    if (won && !celebrated.current) {
      celebrated.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound?.(require('../../../../assets/sounds/reward.mp3'));
      void AccessibilityInfo.announceForAccessibility('Line complete! Your crew prompts are saved in this wait’s recap.');
      celebration.setValue(0);
      Animated.spring(celebration, { toValue: 1, friction: 5, tension: 75, useNativeDriver: true }).start();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else if (!won) {
      void Haptics.selectionAsync();
      playSound?.(require('../../../../assets/sounds/tap.mp3'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  return <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
    <ImageBackground source={require('../../../../assets/images/screens/leaderboard/standings-bg.png')}
      resizeMode="cover" style={styles.background} imageStyle={styles.backgroundImage}>
      <LinearGradient colors={['#087ddd', '#0065b8', '#00448d']} style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>ONE PHONE · SOLO OR CREW</Text>
          <Text style={styles.heroTitle}>CREW{'\n'}PROMPTS</Text>
        </View>
        <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
          resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </LinearGradient>
      <View style={styles.rideBanner}>
        <GameIcon name="sparkle" size={18} />
        <Text numberOfLines={1} style={styles.rideName}>{rideName.toUpperCase()}</Text>
        <GameIcon name="sparkle" size={18} />
      </View>
      <View style={styles.body}>
        <Text style={styles.instruction}>{hasLine ? 'A finished line is in your crew log!' : 'Optional talk-and-notice prompts. Finish any line of three.'}</Text>
        <View style={styles.progressTrack} accessibilityLabel={`${marks.length} of 9 bingo squares marked`}>
          <View style={[styles.progressFill, { width: `${Math.round(marks.length / 9 * 100)}%` }]} />
        </View>
        {hasLine && <Animated.View style={[styles.bingoRibbon, {
          opacity: celebration.interpolate({ inputRange: [0, 1], outputRange: [celebrated.current ? 0.35 : 1, 1] }),
          transform: [{ rotate: '-2deg' }, { scale: celebration.interpolate({ inputRange: [0, 1], outputRange: [celebrated.current ? 0.76 : 1, 1] }) }],
        }]}><GameIcon name="sparkle" size={22} /><Text style={styles.bingoText}>LINE COMPLETE!</Text><GameIcon name="sparkle" size={22} /></Animated.View>}
        <View style={styles.grid}>
          {squares.map((square, index) => {
            const marked = marks.includes(index);
            return <Pressable key={square.id} accessibilityRole="button"
              accessibilityLabel={`${square.title}, ${marked ? 'completed' : 'not completed'}`}
              accessibilityState={{ selected: selected === index }}
              onPress={() => chooseSquare(index)} style={styles.squareFrame}>
              <LinearGradient colors={marked ? ['#ffe984', '#ffbe24'] : ['#f4fcff', '#c9efff']}
                style={[styles.square, selected === index && styles.squareSelected]}>
                <GameIcon name={SYMBOLS[square.id] ?? 'sparkle'} size={28} />
                <Text numberOfLines={2} style={styles.squareTitle}>{square.title.toUpperCase()}</Text>
                {marked && <View style={styles.checkBubble}><GameIcon name="check" size={20} /></View>}
              </LinearGradient>
            </Pressable>;
          })}
        </View>
        {!hasLine && <Text style={styles.progressText}>{marks.length}/9 SQUARES · COMPLETE ANY LINE</Text>}
        <View style={styles.ticket}>
          <View style={styles.ticketHeader}>
            <View style={styles.ticketSymbol}><GameIcon name={SYMBOLS[selectedSquare.id] ?? 'sparkle'} size={40} /></View>
            <View style={styles.ticketHeading}>
              <Text style={styles.ticketEyebrow}>YOUR CREW QUEST</Text>
              <Text style={styles.ticketTitle}>{selectedSquare.title}</Text>
            </View>
          </View>
          <Text style={styles.prompt}>{selectedSquare.prompt}</Text>
          {!hasLine && <Pressable disabled={paused} accessibilityRole="button"
            accessibilityLabel={marks.includes(selected) ? 'Undo this square' : 'Mark this square done'}
            onPress={toggleSquare} style={[styles.action, paused && styles.disabled]}>
            <Text style={styles.actionText}>{marks.includes(selected) ? 'UNDO SQUARE' : 'WE DID IT!'}</Text>
          </Pressable>}
          {!hasLine && <Pressable accessibilityRole="button" accessibilityLabel="Back to the Crew Prompts board"
            onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}>
            <Text style={styles.backToBoard}>BACK TO BOARD</Text>
          </Pressable>}
          {hasLine && <View style={styles.completePanel}>
            <Text style={styles.completeEyebrow}>CREW QUEST COMPLETE</Text>
            <Text style={styles.completeTitle}>Your line is in the log!</Text>
            <Text style={styles.completeNote}>Saved in this wait’s recap. Nice work, crew!</Text>
          </View>}
          {paused && !hasLine && <Text style={styles.pause}>Paused. Resume to mark squares.</Text>}
        </View>
        <Text style={styles.rewardNote}>Play from your place in line. Verified nearby time determines Ride Parts.</Text>
      </View>
    </ImageBackground>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#89d7fc' },
  scrollContent: { flexGrow: 1 },
  background: { flex: 1, minHeight: '100%' },
  backgroundImage: { opacity: 0.78 },
  hero: { height: 90, paddingHorizontal: 20, paddingTop: 7, overflow: 'hidden',
    borderBottomWidth: 4, borderBottomColor: '#fff' },
  heroCopy: { zIndex: 1 },
  heroEyebrow: { color: '#b8ecff', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 1.4 },
  heroTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 30, lineHeight: 32,
    textShadowColor: '#003c7c', textShadowOffset: { width: 3, height: 4 }, textShadowRadius: 1 },
  shark: { width: 106, height: 99, position: 'absolute', right: -2, top: 0 },
  rideBanner: { marginTop: -17, alignSelf: 'center', minWidth: '78%', maxWidth: '94%',
    borderRadius: 10, borderWidth: 3, borderColor: '#fff', backgroundColor: '#ffc82a',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 5, shadowColor: '#003f76', shadowOpacity: 0.27,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 3, elevation: 4 },
  rideName: { color: '#093d77', fontFamily: 'Knockout', fontSize: 18, textAlign: 'center', flexShrink: 1 },
  body: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 26 },
  instruction: { color: '#073e79', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center' },
  progressTrack: { height: 8, borderWidth: 1, borderColor: '#03629f', backgroundColor: '#fff',
    borderRadius: 10, marginHorizontal: 26, marginTop: 8, marginBottom: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#ffc523', borderRadius: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, justifyContent: 'center' },
  squareFrame: { width: '31.6%', aspectRatio: 1.55 },
  square: { flex: 1, borderRadius: 14, borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    shadowColor: '#07538b', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 3 },
    shadowRadius: 2, elevation: 3 },
  squareSelected: { borderColor: '#ffc323', borderWidth: 4 },
  squareTitle: { color: '#113c69', fontFamily: 'Knockout', fontSize: 12, lineHeight: 14,
    textAlign: 'center', marginTop: 1 },
  checkBubble: { position: 'absolute', top: 2, right: 2 },
  progressText: { textAlign: 'center', color: '#005594', fontFamily: 'Knockout',
    fontSize: 14, marginTop: 12, marginBottom: 11 },
  bingoRibbon: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 7, marginBottom: 8, borderRadius: 8,
    backgroundColor: '#ffcb24', borderWidth: 2, borderColor: '#fff',
    paddingHorizontal: 24, paddingVertical: 4 },
  bingoText: { color: '#093d77', fontFamily: 'Shark', fontSize: 23 },
  ticket: { backgroundColor: '#fff', borderWidth: 3, borderColor: '#d6f3ff',
    borderRadius: 20, padding: 15, shadowColor: '#07538b', shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 4, elevation: 4 },
  ticketHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ticketSymbol: { width: 56, height: 56, borderRadius: 13, backgroundColor: '#ffd443',
    borderWidth: 2, borderColor: '#ffb900', alignItems: 'center', justifyContent: 'center' },
  ticketHeading: { flex: 1 },
  ticketEyebrow: { color: '#327da9', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1 },
  ticketTitle: { color: '#092f62', fontFamily: 'Shark', fontSize: 19, marginTop: 2 },
  prompt: { color: '#244866', fontFamily: 'Knockout', fontSize: 16, lineHeight: 21, marginTop: 11 },
  action: { backgroundColor: '#0079da', borderRadius: 12, borderWidth: 2, borderColor: '#b7e9ff',
    alignItems: 'center', paddingVertical: 11, marginTop: 14 },
  actionText: { color: '#fff', fontFamily: 'Knockout', fontSize: 20 },
  backToBoard: { color: '#0065a9', fontFamily: 'Knockout', fontSize: 15,
    textAlign: 'center', marginTop: 12, paddingVertical: 6 },
  disabled: { opacity: 0.45 },
  completePanel: { backgroundColor: '#eaf9ff', borderColor: '#9bddfa', borderWidth: 2,
    borderRadius: 13, marginTop: 13, paddingHorizontal: 14, paddingVertical: 10 },
  completeEyebrow: { color: '#0064a8', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1.1 },
  completeTitle: { color: '#073d77', fontFamily: 'Shark', fontSize: 19, marginTop: 2 },
  completeNote: { color: '#086c54', fontFamily: 'Knockout', fontSize: 15, marginTop: 3 },
  pause: { color: '#9a5a00', fontFamily: 'Knockout', fontSize: 14, marginTop: 9 },
  rewardNote: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, textAlign: 'center',
    marginTop: 12, marginHorizontal: 12 },
});
