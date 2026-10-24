import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FULL_SET, LEVEL_CHEST as LEVEL_FX, flameMomentFor, tomorrowPrize, type FlameMoment } from '../../services/retention/loopMotion';
import { BRAND } from '../../ui';
import Daily3MapButton, { type CheckLanding } from './Daily3MapButton';
import FlameArt from './FlameArt';
import StampRibbon from './StampRibbon';
import StreakFlame from './StreakFlame';
import StreakMoment from './StreakMoment';
import TomorrowCard from './TomorrowCard';
import RewardReveal from './RewardReveal';
import FlameUpRow from './FlameUpRow';
import { EmberCard, FreezeSavedCard, FreezeSlots } from './FreezeMoments';
import { GameIcon, ICON_SOURCES } from '../../ui';
import type { PaidRewards } from '../../api/endpoints/retention';
import NextUpRail from '../nextUp/NextUpRail';
import { setBatterySaver } from '../../power/batterySaver';

const LEVEL_CHEST = require('../../../assets/images/retention/level-chest-closed.png');
const LEVEL_CHEST_OPEN = require('../../../assets/images/retention/level-chest-open.png');
const DAILY_PAID: PaidRewards = { coins: 15, tickets: 1, energy: 20, xp: 35, item: { id: 2, name: 'Purple Castle T-Shirt', image: null, rarity: 1 } };
const LEVEL_PAID: PaidRewards = { coins: 120, tickets: 2, energy: 30, item: { id: 1, name: 'Captain Hat', image: null, rarity: 2 } };

type Stage = { k: 'flame'; moment: Exclude<FlameMoment, { kind: 'none' }> } | { k: 'tomorrow'; days: number }
  | { k: 'chest'; src: 'daily' | 'level'; rewards: PaidRewards | null; opening: boolean; n: number }
  | { k: 'saved'; streak: number } | { k: 'ember'; was: number } | null;

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
  const [freezes, setFreezes] = useState(0);
  const [arrive, setArrive] = useState(0);
  const [arriveKey, setArriveKey] = useState(0);
  const [rm, setRm] = useState(false);
  // The fixture chest "server" answers after 500 ms.
  const openChest = () => setStage(st => {
    if (!st || st.k !== 'chest' || st.opening || st.rewards) return st;
    // The same holds the map uses: the full set waits for its checks to dive in plus the chest gather; a level chest its lid beat.
    setTimeout(() => setStage(cur => (cur && cur.k === 'chest' ? { ...cur, opening: false, rewards: cur.src === 'daily' ? DAILY_PAID : LEVEL_PAID } : cur)),
      st.src === 'daily' ? FULL_SET.chestAt + 420 : LEVEL_FX.holdMs);
    return { ...st, opening: true };
  });
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
    } else if (code === 'reset') { setStage(null); setPips([false, false, false]); setFreezes(0); setArrive(0); }
    else if (code.startsWith('chestd')) setStage({ k: 'chest', src: 'daily', rewards: null, opening: false, n: Date.now() });
    else if (code.startsWith('chestl')) setStage({ k: 'chest', src: 'level', rewards: null, opening: false, n: Date.now() });
    else if (code.startsWith('saved')) setStage({ k: 'saved', streak: n });
    else if (code.startsWith('ember')) setStage({ k: 'ember', was: n });
    else if (code.startsWith('fin')) { setStage(null); setFreezes(f => Math.min(2, f + 1)); setArrive(1); setArriveKey(k => k + 1); }
  };
  useEffect(() => {
    // play(code, afterMs): a delay lets the recorder start first; rm toggles Reduce Motion for the gym moments.
    (globalThis as Record<string, unknown>).__loopsPreview = {
      play: (code: string, afterMs = 0) => { if (afterMs > 0) setTimeout(() => play(code), afterMs); else play(code); },
      rm: (on: boolean) => setRm(!!on),
      saver: (on: boolean) => setBatterySaver(!!on),
    };
  });
  return (
    <View style={{ flex: 1, backgroundColor: '#5c9ad1' }}>
      <ScrollView contentContainerStyle={styles.page}>
        <Text style={styles.h}>Flame sizes: 0, 1, 3, 7, 30, 100</Text>
        <View style={styles.tiers}>
          {[0, 1, 3, 7, 30, 100].map(d => (
            <View key={d} style={styles.tier}><FlameArt days={d} size={58} reducedMotion={rm} /><Text style={styles.tierText}>{d}</Text></View>
          ))}
        </View>
        <Text style={styles.h}>Badges (Profile, friends, Standings)</Text>
        <View style={styles.card}><Text style={styles.name}>ParkHopper</Text><StreakFlame streak={12} best={12} size={34} /></View>
        <View style={styles.row}><Text style={styles.rowName}>captaindax</Text><StreakFlame streak={0} best={6} size={24} /></View>
        <Text style={styles.h}>Moments</Text>
        <View style={styles.buttons}>
          {['p1', 'p2', 'm3', 'm7', 'p12', 'm30', 'm100', 't2', 't6', 'land1', 'land2', 'land3', 'chestd', 'chestl', 'saved8', 'ember12', 'fin', 'reset'].map(c => (
            <Pressable key={c} onPress={() => play(c)} style={styles.btn}><Text style={styles.btnText}>{c}</Text></Pressable>
          ))}
        </View>
        <Text style={styles.h}>Next Up (real XP toward the next level chest)</Text>
        <NextUpRail item={{ kind: 'ride', icon: 'coin', title: 'Win a ride coin', action: { type: 'ride' } }} onAction={() => undefined} />
        <View style={styles.freezeMock}>
          <FlameArt days={7} size={70} reducedMotion={rm} />
          <FreezeSlots key={arriveKey} freezes={freezes} cap={2} arrive={arrive} from={{ x: -140, y: 160 }} reducedMotion={rm} />
        </View>
        <View style={styles.mapMock}>
          <Daily3MapButton pips={pips} streak={7} attention="none" onPress={() => undefined} landing={landing} active reducedMotion={rm}
            onFullSet={() => setStage({ k: 'tomorrow', days: 7 })} />
        </View>
      </ScrollView>
      {stage && (
        <View style={styles.overlay}>
          <StampRibbon text={stage.k === 'tomorrow' ? 'See you tomorrow' : stage.k === 'chest' ? (stage.src === 'daily' ? 'All 3 done!' : 'Level 4!')
            : stage.k === 'saved' ? 'Saved!' : stage.k === 'ember' ? 'New day!' : stage.moment.kind === 'milestone' ? 'Big flame!' : 'Flame up!'} reducedMotion={rm} />
          {stage.k === 'flame'
            ? <StreakMoment key={JSON.stringify(stage.moment)} moment={stage.moment} reducedMotion={rm} onDone={() => setStage(null)} />
            : stage.k === 'chest' ? (
              <RewardReveal key={stage.n} reducedMotion={rm} rewards={stage.rewards} opening={stage.opening} onOpen={openChest} onDone={() => setStage(null)}
                subtitle={stage.src === 'daily' ? 'All three goals done!' : 'You reached Level 4!'} dropIn={stage.src === 'level'}
                autoOpen={stage.src === 'daily'} fullSet={stage.src === 'daily'}
                expectRows={stage.src === 'daily' ? { small: 4, big: 1 } : { small: 3, big: 1 }}
                preview={<GymPreview level={stage.src === 'level'} />}
                closedArt={stage.src === 'daily' ? ICON_SOURCES.chest : LEVEL_CHEST} openArt={stage.src === 'daily' ? ICON_SOURCES.chestOpen : LEVEL_CHEST_OPEN}
                footer={stage.src === 'daily' ? <FlameUpRow from={8} to={9} grow reducedMotion={rm} /> : undefined} />
            ) : stage.k === 'saved' ? <FreezeSavedCard streak={stage.streak} days={1} reducedMotion={rm} onDone={() => setStage(null)} />
            : stage.k === 'ember' ? <EmberCard was={stage.was} reducedMotion={rm} onDone={() => setStage(null)} />
            : <TomorrowCard prize={tomorrowPrize(FIXTURE(stage.days, stage.days === 6))} reducedMotion={rm} onDone={() => setStage(null)} />}
        </View>
      )}
    </View>
  );
}

/** The gym's "what is inside" chips (fixture amounts). */
function GymPreview({ level }: { readonly level: boolean }) {
  const chips: [ 'coins' | 'ticket' | 'energy' | 'xp', number][] = level ? [['coins', 120], ['ticket', 2], ['energy', 30]]
    : [['coins', 15], ['ticket', 1], ['energy', 20], ['xp', 35]];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
      {chips.map(([icon, n]) => (
        <View key={icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 }}>
          <GameIcon name={icon} size={30} /><Text style={{ fontFamily: 'Shark', fontSize: 20, color: BRAND.white }}>{n}</Text>
        </View>
      ))}
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
  freezeMock: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 10 },
  mapMock: { height: 120, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5, 52, 110, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 8 },
});
