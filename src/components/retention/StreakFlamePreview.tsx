import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { flameMomentFor, tomorrowPrize, type FlameMoment } from '../../services/retention/loopMotion';
import { BRAND } from '../../ui';
import Daily3MapButton, { type CheckLanding } from './Daily3MapButton';
import FlameArt from './FlameArt';
import StampRibbon from './StampRibbon';
import StreakFlame from './StreakFlame';
import StreakMoment from './StreakMoment';
import TomorrowCard from './TomorrowCard';

type Stage = { k: 'flame'; moment: Exclude<FlameMoment, { kind: 'none' }> } | { k: 'tomorrow'; days: number } | null;

const FIXTURE = (days: number, milestoneTomorrow = false) => ({
  done: true,
  reward: { coins: 15, tickets: 1, energy: 20, xp: 35 },
  streak: { days, best: days, freezes: 1, freeze_cap: 2, freeze_price: 60, at_risk: false, counted_today: true,
    next_milestone: milestoneTomorrow ? { day: days + 1, gear: true, mystery_boxes: 0, label: 'New gear', days_away: 1 } : null },
});

/**
 * Dev only: the daily loop moments on fixtures (the same components the map uses).
 * Lane tools drive it over CDP: globalThis.__loopsPreview.play('m7' | 'p12' | 't6' | 'land2' ...).
 */
export default function StreakFlamePreview() {
  const [stage, setStage] = useState<Stage>(null);
  const [pips, setPips] = useState([false, false, false]);
  const [landing, setLanding] = useState<CheckLanding | null>(null);
  const play = (code: string) => {
    const n = Number(code.replace(/\D/g, '')) || 1;
    if (code.startsWith('m')) setStage({ k: 'flame', moment: flameMomentFor(n - 1, n, true) as Exclude<FlameMoment, { kind: 'none' }> });
    else if (code.startsWith('p')) setStage({ k: 'flame', moment: { kind: 'plusOne', from: n - 1, to: n } });
    else if (code.startsWith('t')) setStage({ k: 'tomorrow', days: n });
    else if (code.startsWith('land')) {
      const done = Math.max(1, Math.min(3, n));
      setStage(null);
      setPips([0, 1, 2].map(i => i < done));
      setLanding(l => ({ index: done - 1, done, key: (l?.key ?? 0) + 1 }));
    } else if (code === 'reset') { setStage(null); setPips([false, false, false]); }
  };
  useEffect(() => {
    (globalThis as Record<string, unknown>).__loopsPreview = { play };
  });
  return (
    <View style={{ flex: 1, backgroundColor: '#5c9ad1' }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.h}>Flame sizes: 0, 1, 3, 7, 30, 100</Text>
        <View style={styles.tiers}>
          {[0, 1, 3, 7, 30, 100].map(d => (
            <View key={d} style={styles.tier}><FlameArt days={d} size={58} reducedMotion={false} /><Text style={styles.tierText}>{d}</Text></View>
          ))}
        </View>
        <Text style={styles.h}>Badges (Profile, friends, Standings)</Text>
        <View style={styles.card}><Text style={styles.name}>ParkHopper</Text><StreakFlame streak={12} best={12} size={34} /></View>
        <View style={styles.row}><Text style={styles.rowName}>captaindax</Text><StreakFlame streak={0} best={6} size={24} /></View>
        <Text style={styles.h}>Moments</Text>
        <View style={styles.buttons}>
          {['p1', 'p2', 'm3', 'm7', 'p12', 'm30', 'm100', 't2', 't6', 'land1', 'land2', 'land3', 'reset'].map(c => (
            <Pressable key={c} onPress={() => play(c)} style={styles.btn}><Text style={styles.btnText}>{c}</Text></Pressable>
          ))}
        </View>
        <View style={styles.mapMock}>
          <Daily3MapButton pips={pips} streak={7} attention="none" onPress={() => undefined} landing={landing} active reducedMotion={false}
            onFullSet={() => setStage({ k: 'tomorrow', days: 7 })} />
        </View>
      </ScrollView>
      {stage && (
        <View style={styles.overlay}>
          <StampRibbon text={stage.k === 'tomorrow' ? 'See you tomorrow' : stage.moment.kind === 'milestone' ? 'Big flame!' : 'Flame up!'} reducedMotion={false} />
          {stage.k === 'flame'
            ? <StreakMoment key={JSON.stringify(stage.moment)} moment={stage.moment} reducedMotion={false} onDone={() => setStage(null)} />
            : <TomorrowCard prize={tomorrowPrize(FIXTURE(stage.days, stage.days === 6))} reducedMotion={false} onDone={() => setStage(null)} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 64, gap: 10, paddingBottom: 300 },
  h: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginTop: 6 },
  tiers: { flexDirection: 'row', justifyContent: 'space-between' },
  tier: { alignItems: 'center' },
  tierText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 12 },
  name: { fontFamily: 'Shark', fontSize: 24, color: BRAND.white, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white, borderRadius: 14, padding: 10 },
  rowName: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { backgroundColor: BRAND.gold, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  btnText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  mapMock: { height: 120, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 52, 110, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 8 },
});
