import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BOSS_NAMES, type BossId, type BossRaid } from '../api/endpoints/parks/raid';
import type { RideControlClaim, RideControlPark } from '../api/endpoints/parks/rideControl';
import Map from '../components/Map';
import LiveEventsPill from '../components/LiveEventsPill';
import RideControlBar from '../components/RideControlBar';
import BossMapDeparture from '../components/boss/BossMapDeparture';
import BossMarker from '../components/boss/BossMarker';
import BossRaidFlow from '../components/boss/BossRaidFlow';
import BossWinCard from '../components/boss/BossWinCard';
import RideTeamFlag from '../components/map/RideTeamFlag';
import { Circle } from '../components/map/Circle';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import useBossMapMoment from '../hooks/useBossMapMoment';
import type { TaskType } from '../models/task-type';
import { BossAttackRecovery } from '../services/boss/attackRecovery';
import type { RushPick } from '../services/live/rush';
import TaskMarker from './ExploreScreen/TaskMarker';

type Section = 'map' | 'sheet' | 'home' | 'win' | 'escaped' | 'pills';
const SECTIONS: Section[] = ['map', 'sheet', 'home', 'win', 'escaped', 'pills'];
const RIDE = { latitude: 34.13838, longitude: -118.35576 };
/** Fixture raids get fresh ids per app session so a replayed map moment is never 'already seen'. */
const SESSION = Date.now() % 100000;

/** In-memory receipt store: nothing in this gallery touches the account or the server. */
const memory = new globalThis.Map<string, string>();
const fixtureRecovery = new BossAttackRecovery({
  getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async key => { memory.delete(key); },
}, async (_, body) => {
  const damage = Math.floor((body.hits * 4 + body.weak_hits * 40) * (body.remote ? 0.6 : 1));
  const raid = fixtureRaid('kraken');
  return { ok: true, damage, state: { raid: { ...raid, hp_left: Math.max(0, raid.hp_left - damage), you: { ...raid.you,
    attacks: raid.you.attacks + 1, attacks_left: raid.you.attacks_left - 1, damage: raid.you.damage + damage } }, next_at: null } };
}, async () => ({ ok: false }));
/** Fixture FIGHT: a local round token, never a server call. */
const fixtureRound = async (_: number, body: { remote?: boolean }) => ({ ok: true as const, round: { token: 'f'.repeat(32),
  remote: !!body.remote, reason: null, damage_rate: body.remote ? 0.6 : 1, max_ms: 21000, max_hits: 70 } });

function fixtureRaid(boss: BossId, over: Partial<BossRaid> = {}): BossRaid {
  const stamp = new Date().toISOString();
  return { id: 900000 + boss.length, task_id: 900109, boss, ride_name: 'Practice space attraction',
    latitude: RIDE.latitude, longitude: RIDE.longitude, hp_max: 6100, hp_left: 3480, status: 'active', starts_at: stamp,
    ends_at: new Date(Date.now() + 18 * 60000).toISOString(), fighters: 6, teams: { mouse: 1240, globe: 860, shark: 520 },
    team_names: { mouse: 'Team Mouse', globe: 'Team Globe', shark: 'Team Shark' },
    feed: [], top: [{ username: 'finnfan22', damage: 1480, you: false, team: 'mouse' }, { username: 'sharkbait_sam', damage: 1144, you: true, team: 'shark' },
      { username: 'coasterkid', damage: 640, you: false, team: 'globe' }],
    mvp_is_you: false, ride_control: null, energy_cost: 10, reach_meters: 90, max_attacks: 5,
    damage: { per_hit: 4, per_weak_hit: 40, weak_share: 3 },
    you: { attacks: 2, attacks_left: 3, damage: 1144, reward: null, log: [{ damage: 728, remote: false }, { damage: 416, remote: false }] },
    remote: { joined: false, ticket_cost: 1, damage_rate: 0.6, reward_rate: 0.6, fighters: 1 }, ...over };
}

/**
 * WS6 dev gallery (EXPO_PUBLIC_BOSS_MAP_PREVIEW=1): the real components with
 * local fixtures. Sections switch with the chips, or by deep link
 * `themeparkshark://ws6?section=win&boss=robo_shark&held=1` (simulator capture).
 */
export default function BossMapPreviewScreen() {
  const [section, setSection] = useState<Section>('map');
  const [boss, setBoss] = useState<BossId>('kraken'), [run, setRun] = useState(0), [selected, setSelected] = useState(false);
  const [held, setHeld] = useState(false);
  // Capture knobs (deep link): energy, tickets, attacks used, joined from home already.
  const [knobs, setKnobs] = useState({ energy: 120, tickets: 2, attacks: 0, joined: false, autoplay: 0 });
  const auth = useContext(AuthContext);
  const place = useContext(LocationContext);
  useEffect(() => {
    const apply = (url: string | null) => {
      if (!url || !url.includes('ws6')) return;
      const query = new URLSearchParams(url.split('?')[1] ?? '');
      const next = query.get('section') as Section | null;
      if (next && SECTIONS.includes(next)) setSection(next);
      const b = query.get('boss') as BossId | null;
      if (b && b in BOSS_NAMES) setBoss(b);
      setHeld(query.get('held') === '1');
      const num = (k: string, d: number) => (query.get(k) !== null && Number.isFinite(Number(query.get(k))) ? Number(query.get(k)) : d);
      setKnobs({ energy: num('energy', 120), tickets: num('tickets', 2), attacks: num('attacks', 0), joined: query.get('joined') === '1', autoplay: num('autoplay', 0) });
      if (query.get('play') === '1') setRun(value => value + 1);
      // First-time Boss Bash lesson again (capture only).
      if (query.get('fresh') === '1') void AsyncStorage.removeItem('boss_bash_seen_v1').catch(() => undefined);
    };
    void Linking.getInitialURL().then(apply).catch(() => undefined);
    const sub = Linking.addEventListener('url', event => apply(event.url));
    return () => sub.remove();
  }, []);

  const fixture = useMemo(() => {
    const stamp = new Date().toISOString();
    const claim: RideControlClaim = { park_id: 1, asset_id: 13, park_day: new Date().toISOString().slice(0, 10), confirmed_at: stamp,
      ride_name: 'Practice space attraction', team: 'mouse', points: 25, controller: 'mouse', previous_controller: held ? 'mouse' : 'globe',
      flipped: !held, scores: { mouse: 35, globe: 30, shark: 0 } };
    const ride = { asset_id: 13, controller: 'mouse' as const, scores: claim.scores, margin: 5, contested: false,
      carried_over: false, captain: null, your_points: 25, flipped_at: stamp };
    const control: RideControlPark = { park_day: claim.park_day, rides_held: { mouse: 4, globe: 3, shark: 1 },
      leading_team: 'mouse', your_team: 'shark', your_team_is_underdog: true, rides: [ride], points: {}, player_daily_cap: 50 };
    const defeated = fixtureRaid(boss, { id: 1000000 + SESSION * 1000 + run, status: 'defeated', hp_left: 0, mvp_is_you: true, ride_control: claim,
      you: { attacks: 3, attacks_left: 2, damage: 1960, log: [], reward: { outcome: 'defeated', coins: 50, xp: 100, energy: 20, parts: 2, tickets: 1 } } });
    const task: TaskType = { id: 900109, name: claim.ride_name, latitude: String(RIDE.latitude), longitude: String(RIDE.longitude),
      asset_id: 13, coin_url: '', coins: 0, experience: 0, completion_goal: 1, times_completed: 0 };
    return { control, ride, defeated, task };
  }, [boss, run, held]);
  const map = useBossMapMoment({ playerId: 900005, parkId: 1, available: section === 'map', control: fixture.control,
    refreshControl: async () => fixture.control });
  useEffect(() => { if (section === 'map' && run > 0) void map.enqueue(fixture.defeated); }, [run, section]);

  const fakeAuth = useMemo(() => ({ ...auth, player: { ...(auth?.player ?? {}), id: 900005, energy: knobs.energy, tickets: knobs.tickets } as never,
    refreshPlayer: async () => auth?.player as never }), [auth, knobs.energy, knobs.tickets]);
  const log = [{ damage: 512, remote: section === 'home' }, { damage: 416, remote: section === 'home' }, { damage: 388, remote: section === 'home' },
    { damage: 604, remote: section === 'home' }].slice(0, knobs.attacks);
  const youFixture = { attacks: knobs.attacks, attacks_left: 5 - knobs.attacks, damage: log.reduce((a, b) => a + b.damage, 0), reward: null, log };
  const fakePlace = useMemo(() => ({ ...place, location: { latitude: RIDE.latitude + 0.0004, longitude: RIDE.longitude } as never }), [place]);
  const rushes: RushPick[] = [{ task: fixture.task, wait: 10, rush: { ends_at: new Date(Date.now() + 12 * 60000).toISOString(), wait: 10, typical: 55 } as never }];

  return <View style={styles.screen}>
    <View style={styles.header}><Text style={styles.title}>Boss and teams gallery</Text>
      <Text style={styles.note}>Local fixtures  ·  no Energy, damage or rewards change</Text></View>
    <View style={{ flex: 1 }}>
      {section === 'map' && <>
        <View style={styles.receipt} pointerEvents="box-none">
          <RideControlBar control={fixture.control} tasks={[fixture.task]} onFocusTask={() => undefined} compact={!map.moment} />
          <LiveEventsPill raid={map.moment ? null : fixtureRaid(boss)} rushes={rushes} onBoss={() => setSection('sheet')} onRush={() => undefined}
            mapMoment={map.moment} mapFlag={map.flag} onMapMoment={() => setSelected(true)} onDismissMoment={map.dismiss} />
        </View>
        <Map onPress={() => setSelected(false)} controlsTop={150} focusCoordinate={map.moment ? { ...map.moment.impact.coordinate, requestId: map.moment.impact.raidId } : { ...RIDE, requestId: 1 }}>
          <TaskMarker task={fixture.task} isSelected={selected} control={fixture.ride} onPress={() => setSelected(value => !value)}
            flagRaiseKey={map.flag && (map.moment?.phase === 'flag' || map.moment?.phase === 'settled') ? map.moment.impact.key : undefined} />
          {map.moment && (map.moment.phase === 'exit' || map.moment.phase === 'flag') &&
            <Circle center={map.moment.impact.coordinate} radius={65} fillColor="rgba(255,207,59,0.12)" strokeColor="#ffcf3b" strokeWidth={2} />}
          {map.moment?.phase === 'exit' && <BossMapDeparture impact={map.moment.impact} flag={map.flag} onComplete={map.finishExit} />}
          {!map.moment && <BossMarker raid={fixtureRaid(boss)} onPress={() => setSection('sheet')} />}
        </Map>
      </>}
      {(section === 'sheet' || section === 'home') && <View style={styles.center}>
        <Text style={styles.phase}>{section === 'home' ? 'From home: ride position is never sent' : 'At the park, in reach'}</Text>
        <View style={styles.flags}>{(['mouse', 'globe', 'shark'] as const).map(t => <View key={t} style={{ transform: [{ scale: 1.6 }] }}>
          <RideTeamFlag team={t} contested={t === 'globe'} raiseKey={held ? `held-${t}` : undefined} held={held} /></View>)}</View>
      </View>}
      {(section === 'win' || section === 'escaped') && <ScrollView contentContainerStyle={styles.winWrap}>
        <BossWinCard key={`${section}-${boss}-${run}`} lastHp={640} onDone={() => setRun(value => value + 1)}
          raid={section === 'win' ? fixture.defeated : fixtureRaid(boss, { status: 'escaped', hp_left: 1800, mvp_is_you: false,
            you: { attacks: 1, attacks_left: 4, damage: 380, reward: { outcome: 'escaped', coins: 9, xp: 18, energy: 0, parts: 0, tickets: 0, remote: true } } })} />
      </ScrollView>}
      {section === 'pills' && <ScrollView contentContainerStyle={{ paddingTop: 12, gap: 6 }}>
        <RideControlBar control={fixture.control} tasks={[fixture.task]} onFocusTask={() => undefined} />
        <LiveEventsPill raid={fixtureRaid(boss)} rushes={rushes} onBoss={() => undefined} onRush={() => undefined} />
        <LiveEventsPill raid={fixtureRaid(boss)} rushes={[]} onBoss={() => undefined} onRush={() => undefined} />
        <LiveEventsPill raid={null} rushes={rushes} onBoss={() => undefined} onRush={() => undefined} />
        <LiveEventsPill raid={null} rushes={[]} onBoss={() => undefined} onRush={() => undefined}
          mapMoment={{ impact: { key: 'k', playerId: 1, parkId: 1, raidId: 1, boss, taskId: 1, rideName: 'Practice space attraction',
            coordinate: RIDE, yourDamage: 1960, claim: null, fighters: [] }, phase: 'settled' }}
          mapFlag={{ ...(fixture.defeated.ride_control as RideControlClaim) }} />
      </ScrollView>}
    </View>
    {(section === 'sheet' || section === 'home') && <AuthContext.Provider value={fakeAuth}>
      <LocationContext.Provider value={fakePlace}>
        <BossRaidFlow parkId={1} open recoveryService={fixtureRecovery} roundService={fixtureRound} devAutoplay={knobs.autoplay} onClose={() => setSection('map')} onState={() => undefined}
          raid={fixtureRaid(boss, { ...(section === 'home' ? { latitude: null, longitude: null } : {}), you: youFixture,
            remote: { joined: knobs.joined, ticket_cost: 1, damage_rate: 0.6, reward_rate: 0.6, fighters: 1 } })} />
      </LocationContext.Provider>
    </AuthContext.Provider>}
    <View style={styles.controls}>
      <View style={styles.choices}>{SECTIONS.map(id => <Pressable key={id} accessibilityRole="button" onPress={() => setSection(id)}
        style={[styles.choice, section === id && styles.chosen]}><Text style={styles.choiceText}>{id}</Text></Pressable>)}</View>
      <View style={styles.choices}>{(['kraken', 'robo_shark', 'ghost_squid'] as const).map(id => <Pressable key={id} accessibilityRole="button"
        accessibilityLabel={`Select ${BOSS_NAMES[id]}`} onPress={() => { map.dismiss(); setBoss(id); }}
        style={[styles.choice, boss === id && styles.chosen]}><Text style={styles.choiceText}>{BOSS_NAMES[id]}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Play confirmed boss map fixture" style={styles.play}
        onPress={() => { map.dismiss(); setSection('map'); setRun(value => value + 1); }}><Text style={styles.playText}>Play the map moment</Text></Pressable>
      <Text style={styles.phase}>{map.moment ? `Map phase: ${map.moment.phase}` : held ? 'Held variant on' : 'Raised variant'}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0768b9' }, header: { paddingTop: 54, paddingHorizontal: 16, paddingBottom: 8 },
  title: { fontFamily: 'Shark', fontSize: 24, color: '#ffcf3b', textAlign: 'center' },
  note: { fontFamily: 'Knockout', fontSize: 12, color: '#dff4ff', textAlign: 'center', marginTop: 4 },
  receipt: { position: 'absolute', top: 8, left: 0, right: 0, zIndex: 25 }, controls: { padding: 12, paddingBottom: 30, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 },
  flags: { flexDirection: 'row', gap: 40 },
  winWrap: { flexGrow: 1, justifyContent: 'center', padding: 16, paddingTop: 30 },
  choices: { flexDirection: 'row', gap: 6 }, choice: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 2,
    borderColor: '#bfe5ff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  chosen: { backgroundColor: '#0879ca', borderColor: '#ffcf3b' },
  choiceText: { fontFamily: 'Shark', fontSize: 13, color: '#fff', textAlign: 'center' },
  play: { minHeight: 46, borderRadius: 14, backgroundColor: '#ffcf3b', borderWidth: 2, borderColor: '#fff', borderBottomWidth: 4,
    borderBottomColor: '#d99a00', alignItems: 'center', justifyContent: 'center' },
  playText: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' }, phase: { fontFamily: 'Knockout', color: '#dff4ff', textAlign: 'center', fontSize: 13 },
});
