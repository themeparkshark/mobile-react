/**
 * Dev-only capture harness for the Fin-ister intro (EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW):
 * cinematic | lantern | card1..card5 | welcome | exit | coach-haunt | coach-reef | coach-rank | coach-recap,
 * then the app-layer states (FrightAppPreview: real map, pill, sheet, rank card, coach mark, Marquee).
 * A busy, bright stand-in for the map sits underneath so captures prove nothing bleeds through.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FrightCoachMark, FrightExitCard } from '../FrightOverlays';
import FrightAppPreview, { APP_PREVIEW_SECONDS, APP_PREVIEW_STATES, type AppPreviewState } from '../preview/FrightAppPreview';
import FrightTutorial from './FrightTutorial';

const ENV = process.env.EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW ?? 'cinematic';
const INTRO_STATES = ['cinematic', 'lantern', 'card1', 'card2', 'card3', 'card4', 'card5', 'welcome', 'exit',
  'coach-haunt', 'coach-reef', 'coach-rank', 'coach-recap'] as const;
/** 'cycle' walks every state (for timed simulator captures): intro states first, then the app layer. */
export const CYCLE = [...INTRO_STATES, ...APP_PREVIEW_STATES] as const;
const isAppState = (state: string): state is AppPreviewState => (APP_PREVIEW_STATES as readonly string[]).includes(state);
/** Seconds a state holds in the cycle: 8, except app states with their own (the Marquee timeout needs 16). */
export function cycleSeconds(state: string): number {
  return isAppState(state) ? APP_PREVIEW_SECONDS[state] : 8;
}

export default function FrightIntroPreviewScreen() {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (ENV !== 'cycle' || index >= CYCLE.length - 1) return;
    const timer = setTimeout(() => setIndex(i => Math.min(i + 1, CYCLE.length - 1)), cycleSeconds(CYCLE[index]) * 1000);
    return () => clearTimeout(timer);
  }, [index]);
  const STATE: string = ENV === 'cycle' ? CYCLE[index] : ENV;
  useEffect(() => { console.log(`FRIGHT_PREVIEW ${STATE}`); }, [STATE]);
  if (isAppState(STATE)) return <FrightAppPreview state={STATE} />;
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
          whatsNew={['The Deep Lantern: one card for your whole season', 'Rank every haunt you survive']}
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
