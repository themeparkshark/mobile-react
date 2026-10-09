import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventReward } from '../api/endpoints/live-events';
import EventGainToast from '../components/liveEvents/EventGainToast';
import EventHomeChip from '../components/liveEvents/EventHomeChip';
import EventSheet from '../components/liveEvents/EventSheet';
import EventStatusChip from '../components/liveEvents/EventStatusChip';
import FrenzyBanner, { resetFrenzyBannerForTests } from '../components/liveEvents/FrenzyBanner';
import StarRideBadge from '../components/liveEvents/StarRideBadge';
import { goldenReefFixture } from '../services/liveEvents/fixture';
import { BRAND, GameIcon } from '../ui';

/**
 * Dev-only (DEV_SCREENS): Shark Events pieces on a stand-in park map, with
 * fixture data, for captures and grading. EXPO_PUBLIC_LIVE_EVENT_PREVIEW picks
 * the opening state: progress | ready | frenzy | upcoming | ended | sheet | home.
 */
type Mode = 'progress' | 'ready' | 'frenzy' | 'upcoming' | 'ended' | 'sheet' | 'home';
const MODES: Mode[] = ['progress', 'ready', 'frenzy', 'upcoming', 'ended', 'sheet', 'home'];

function fixtureFor(mode: Mode) {
  if (mode === 'ready') return goldenReefFixture({ mine: 13, claimed: 1 });
  if (mode === 'frenzy') return goldenReefFixture({ mine: 9, claimed: 2, frenzy: true });
  if (mode === 'upcoming') return goldenReefFixture({ phase: 'upcoming', mine: 0, total: 0 });
  if (mode === 'ended') return goldenReefFixture({ phase: 'ended', mine: 34, total: 290, claimed: 3 });
  if (mode === 'sheet') return goldenReefFixture({ mine: 13, claimed: 1, total: 140 });
  return goldenReefFixture({ mine: 9, claimed: 2 });
}

const RIDES = [
  { id: 101, x: 0.22, y: 0.38, star: true }, { id: 7, x: 0.62, y: 0.3, star: false },
  { id: 102, x: 0.7, y: 0.58, star: true }, { id: 8, x: 0.3, y: 0.66, star: false }, { id: 103, x: 0.48, y: 0.47, star: true },
];

export default function LiveEventPreviewScreen() {
  const insets = useSafeAreaInsets();
  const initial = (MODES as string[]).includes(process.env.EXPO_PUBLIC_LIVE_EVENT_PREVIEW ?? '') ? process.env.EXPO_PUBLIC_LIVE_EVENT_PREVIEW as Mode : 'progress';
  const [mode, setMode] = useState<Mode>(initial);
  const [sheet, setSheet] = useState(initial === 'sheet');
  const [gain, setGain] = useState({ n: 0, at: 0 });
  const event = useMemo(() => fixtureFor(mode), [mode]);
  const [live, setLive] = useState(event);
  useEffect(() => { setLive(event); }, [event]);
  useEffect(() => { resetFrenzyBannerForTests(); }, [mode]);
  const fakeOpen = async (key: string): Promise<EventReward | null> => {
    await new Promise(r => setTimeout(r, 700));
    const all = [...live.me.chests, ...live.together.chests];
    const chest = all.find(c => c.key === key);
    const reward = key === 'team' ? live.team_race!.reward_all : chest?.reward ?? null;
    setLive(e => ({ ...e,
      me: { ...e.me, chests: e.me.chests.map(c => c.key === key ? { ...c, claimed: true, claimable: false } : c) },
      together: { ...e.together, chests: e.together.chests.map(c => c.key === key ? { ...c, claimed: true, claimable: false } : c) },
      team_race: e.team_race && key === 'team' ? { ...e.team_race, claimed: true, claimable: false } : e.team_race }));
    return reward;
  };
  const home = mode === 'home';

  return (
    <View style={styles.map}>
      {/* Stand-in park map: paths and rides. Not the real map (the motion stream owns it). */}
      <View style={[styles.path, { top: '35%', left: 0, right: 0, transform: [{ rotate: '-8deg' }] }]} />
      <View style={[styles.path, { top: 0, bottom: 0, left: '46%', width: 26, height: undefined, transform: [{ rotate: '12deg' }] }]} />
      {!home && RIDES.map(r => (
        <View key={r.id} style={[styles.ride, { left: `${r.x * 100}%`, top: `${r.y * 100}%` }]}>
          <View style={styles.coin}><GameIcon name="coin" size={36} /></View>
          {r.star && live.phase === 'live' && <View style={styles.badge}><StarRideBadge /></View>}
        </View>
      ))}
      <View style={[styles.hud, { top: insets.top + 64 }]} pointerEvents="box-none">
        {home ? (
          <View style={styles.homeRow}>
            <View style={styles.fakeChip}><GameIcon name="ticket" size={24} /></View>
            <EventHomeChip event={live} onPress={() => setSheet(true)} />
          </View>
        ) : <EventStatusChip inline event={live} onPress={() => setSheet(true)} />}
        <View style={styles.toastSlot}>
          <EventGainToast gained={gain.n} gainedAt={gain.at} artKey={live.art_key} />
        </View>
        <View style={styles.toastSlot}><FrenzyBanner event={live} /></View>
      </View>
      <ScrollView horizontal style={[styles.controls, { bottom: insets.bottom + 12 }]} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
        {MODES.map(m => (
          <Pressable key={m} onPress={() => { setMode(m); setSheet(m === 'sheet'); }} style={[styles.ctl, m === mode && styles.ctlOn]}>
            <Text style={styles.ctlText}>{m}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setGain({ n: 8, at: Date.now() })} style={styles.ctl}><Text style={styles.ctlText}>+8</Text></Pressable>
      </ScrollView>
      <EventSheet event={live} visible={sheet} onClose={() => setSheet(false)} atPark={!home} onShowRide={() => undefined} openOverride={fakeOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: '#dfeccf', overflow: 'hidden' },
  path: { position: 'absolute', height: 26, backgroundColor: '#f4ead2', borderColor: '#d9cba6', borderWidth: 2 },
  ride: { position: 'absolute', marginLeft: -24, marginTop: -24, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  coin: { width: 48, height: 48, borderRadius: 24, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -14, right: -14 },
  hud: { position: 'absolute', left: 12, right: 12 },
  homeRow: { flexDirection: 'row', gap: 10 },
  fakeChip: { height: 36, paddingHorizontal: 8, borderRadius: 18, backgroundColor: BRAND.blue, borderWidth: 2.5, borderColor: BRAND.white, justifyContent: 'center' },
  toastSlot: { marginTop: 10, alignItems: 'center' },
  controls: { position: 'absolute', left: 0, right: 0, flexGrow: 0 },
  ctl: { backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 8 },
  ctlOn: { backgroundColor: BRAND.gold },
  ctlText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
});
