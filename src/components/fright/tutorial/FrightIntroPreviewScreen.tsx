/**
 * Dev-only capture harness for the Fin-ister intro (EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW):
 * cinematic | lantern | card1..card5 | welcome | exit | coach-haunt | coach-reef | coach-rank | coach-recap.
 * A busy, bright stand-in for the map sits underneath so captures prove nothing bleeds through.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrightCoachMark, FrightExitCard } from '../FrightOverlays';
import FrightTutorial from './FrightTutorial';

const ENV = process.env.EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW ?? 'cinematic';
/** 'cycle' walks every state, 8 s each (for timed simulator captures). */
export const CYCLE = ['cinematic', 'lantern', 'card1', 'card2', 'card3', 'card4', 'card5', 'welcome', 'exit',
  'coach-haunt', 'coach-reef', 'coach-rank', 'coach-recap'] as const;

export default function FrightIntroPreviewScreen() {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (ENV !== 'cycle') return;
    const timer = setInterval(() => setIndex(i => Math.min(i + 1, CYCLE.length - 1)), 8000);
    return () => clearInterval(timer);
  }, []);
  const STATE: string = ENV === 'cycle' ? CYCLE[index] : ENV;
  const noop = () => {};
  const card = /^card(\d)$/.exec(STATE);
  const coach = STATE.startsWith('coach-') ? ({ haunt: 'haunt_near', reef: 'reef_first', rank: 'rank_first', recap: 'recap' } as const)[
    STATE.slice(6) as 'haunt' | 'reef' | 'rank' | 'recap'] ?? null : null;
  return (
    <View style={styles.root}>
      <View style={[styles.banner, { marginTop: insets.top + 8 }]}><Text style={styles.bannerText}>MAP BANNER (should be hidden under the intro)</Text></View>
      <View style={styles.banner}><Text style={styles.bannerText}>Fin-ister Nights · 0 of 10 haunts</Text></View>
      <View style={styles.tabs}><Text style={styles.bannerText}>TAB BAR</Text></View>
      {STATE === 'exit' && <FrightExitCard visible onOpen={noop} onClose={noop} />}
      {coach && <FrightCoachMark coach={coach} onClose={noop} top={insets.top + 120} />}
      {(STATE === 'cinematic' || STATE === 'lantern' || card || STATE === 'welcome') && (
        <FrightTutorial key={STATE} mode={STATE === 'welcome' ? 'welcome_back' : 'intro'} title="Fin-ister Nights" spooky={false} onDone={noop}
          whatsNew={['The Deep Lantern: one card for your whole season', 'Rank every haunt and see the fan favorites']}
          initialStep={STATE === 'welcome' ? 'welcome' : card ? 'cards' : (STATE as 'cinematic' | 'lantern')}
          initialPage={card ? Number(card[1]) - 1 : 0} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#3aa0ff' },
  banner: { marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16, backgroundColor: '#0b3c8c' },
  bannerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tabs: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96, backgroundColor: '#1aa3ff', alignItems: 'center', justifyContent: 'center' },
});
