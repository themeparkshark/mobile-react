import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRoute } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useHelp } from '../components/help/HelpProvider';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import * as RootNavigation from '../RootNavigation';
import { GLOSSARY_KEYS, type HelpTopicId } from '../services/help/glossary';
import { HELP_TOPICS, type HelpArtKey } from '../services/help/helpTopics';
import { BRAND, GameButton, GameIcon, gameAlert, RADIUS, SHADOW, textPreset } from '../ui';

/** Existing hand-drawn art only (Alex's originals and the kit art players already know). */
const ART: Readonly<Record<HelpArtKey, number>> = {
  finn: require('../../assets/images/tutorial/teacher-shark.png'),
  churro: require('../../assets/images/prep-items/churros/churro_18.png'),
  park: require('../../assets/images/screens/park/mystery-coin-shark-v1.png'),
  coin: require('../../assets/images/screens/park/gold.png'),
  lineplay: require('../../assets/images/screens/lineplay/queue-recap-shark.png'),
  level: require('../../assets/images/progression/crown.png'),
  stamps: require('../../assets/images/stamps/stamp-logo.png'),
  teams: require('../../assets/images/team-shark-badge.png'),
  standings: require('../../assets/images/screens/leaderboard/crown-gold.png'),
  extras: require('../../assets/images/screens/pin-collections/shark.png'),
};

/** How to play: every feature in a couple of sentences, every word, and a replay switch. */
export default function HowToPlayScreen() {
  const route = useRoute();
  const focus = (route.params as { topic?: HelpTopicId } | undefined)?.topic ?? null;
  const { glossary, explain, replayAllTutorials } = useHelp();
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<HelpTopicId, number>>>({});
  const [replaying, setReplaying] = useState(false);

  // Opened from a "?" or a term sheet: land on that card.
  useEffect(() => {
    if (!focus) return;
    const timer = setTimeout(() => {
      const y = offsets.current[focus];
      if (y != null) scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [focus]);

  const replay = async () => {
    if (replaying) return;
    setReplaying(true);
    try {
      await replayAllTutorials();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      gameAlert('Tutorials ready', 'Finn will show every tip again as you play: at home, at the park and in line.',
        undefined, { icon: 'retry' });
    } finally {
      setReplaying(false);
    }
  };

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>How to Play</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={ART.finn} style={styles.heroArt} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Hi, I'm Finn!</Text>
            <Text style={styles.heroBody}>Everything in the game, in one place. Tap any word to see what it means.</Text>
          </View>
        </View>

        {HELP_TOPICS.map(topic => (
          <View key={topic.id} onLayout={event => { offsets.current[topic.id] = event.nativeEvent.layout.y; }}
            style={[styles.card, focus === topic.id && styles.cardFocus]}>
            <View style={styles.cardHead}>
              <Image source={ART[topic.art]} style={styles.cardArt} contentFit="contain" />
              <Text accessibilityRole="header" style={styles.cardTitle}>{topic.title}</Text>
            </View>
            {topic.lines.map(line => <Text key={line} style={styles.cardLine}>{line}</Text>)}
            <View style={styles.chips}>
              {topic.terms.map(key => (
                <Pressable key={key} accessibilityRole="button" accessibilityLabel={`What is ${glossary[key].label}?`}
                  onPress={() => explain(key)} style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
                  <GameIcon name={glossary[key].icon} size={20} />
                  <Text style={styles.chipText}>{glossary[key].label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.section}>Every word in the game</Text>
        <View style={styles.list}>
          {GLOSSARY_KEYS.map((key, index) => {
            const term = glossary[key];
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${term.label}. ${term.what}`}
                onPress={() => explain(key)}
                style={({ pressed }) => [styles.row, index < GLOSSARY_KEYS.length - 1 && styles.rowBorder, pressed && styles.chipPressed]}>
                <GameIcon name={term.icon} size={26} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.rowTitle}>{term.label}</Text>
                  <Text style={styles.rowBody} numberOfLines={2}>{term.what}</Text>
                </View>
                <GameIcon name="arrow" size={20} />
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.section}>Need a refresher?</Text>
        <View style={[styles.card, { alignItems: 'stretch' }]}>
          <Text style={styles.cardLine}>Replay every tutorial and tip. Finn shows each one again the next time it comes up.</Text>
          <GameButton label="Replay tutorials" icon="retry" loading={replaying} onPress={() => { void replay(); }}
            style={{ marginTop: 8 }} />
          <GameButton label="Settings and support" variant="ghost" onPress={() => RootNavigation.navigate('Settings')}
            style={{ marginTop: 4 }} />
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, marginTop: -8, backgroundColor: '#e3f3ff' },
  content: { padding: 16, paddingTop: 14 },
  hero: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: RADIUS.lg, borderWidth: 3,
    borderColor: BRAND.white, padding: 12, marginBottom: 14, ...SHADOW.card,
  },
  heroArt: { width: 86, height: 86, marginRight: 10 },
  heroTitle: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy },
  heroBody: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 21, color: BRAND.navySoft, marginTop: 2 },
  card: {
    backgroundColor: BRAND.white, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: '#cfe8fb', padding: 14,
    marginBottom: 12, ...SHADOW.card, shadowOpacity: 0.12,
  },
  cardFocus: { borderColor: BRAND.gold, borderWidth: 3 },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardArt: { width: 46, height: 46, marginRight: 10 },
  cardTitle: { flex: 1, fontFamily: 'Shark', fontSize: 21, color: BRAND.navy },
  cardLine: { fontFamily: 'Knockout', fontSize: 17, lineHeight: 22, color: BRAND.navy, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eef7ff', borderRadius: RADIUS.pill,
    borderWidth: 2, borderColor: BRAND.sky, paddingHorizontal: 10, paddingVertical: 4,
  },
  chipPressed: { backgroundColor: BRAND.cream },
  chipText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.blue },
  section: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy, textTransform: 'uppercase', marginTop: 10, marginBottom: 8, marginLeft: 6 },
  list: { backgroundColor: BRAND.white, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: '#cfe8fb', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  rowBorder: { borderBottomWidth: 2, borderBottomColor: '#eef6fd' },
  rowTitle: { ...textPreset('label'), fontSize: 16 },
  rowBody: { ...textPreset('bodySmall'), color: BRAND.navySoft },
});
