import { Image } from 'expo-image';
import { useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BOSS_NAMES, type BossId, type BossRaid, type AttackResult } from '../api/endpoints/parks/raid';
import { BOSS_ART_SCALE, BOSS_ART, BossBrawl } from '../games/boss/BossBrawl';
import BossRaidFlow from '../components/boss/BossRaidFlow';
import { AuthContext } from '../context/AuthProvider';
import { BossAttackRecovery, type BossAttackCheckpoint } from '../services/boss/attackRecovery';

/** Read-only arena and recovery QA. Recovery uses an in-memory server fixture. */
export default function BossMechanicsPreviewScreen() {
  const [boss, setBoss] = useState<BossId>('kraken'), [visible, setVisible] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const auth = useContext(AuthContext);
  const [recoveryOpen, setRecoveryOpen] = useState(false), [fixtureRaid, setFixtureRaid] = useState<BossRaid | null>(null);
  const [recoveryReceipt, setRecoveryReceipt] = useState<string | null>(null);
  const fixture = useMemo(() => {
    const records = new Map<string, string>(), responses = new Map<string, AttackResult>();
    let calls = 0, spends = 0;
    const raid: BossRaid = { id: 900077, boss: 'kraken', task_id: 109, ride_name: 'Practice attraction',
      latitude: 34.13838, longitude: -118.35576, hp_max: 5000, hp_left: 5000, status: 'active',
      starts_at: new Date(Date.now() - 60000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(),
      fighters: 0, teams: { mouse: 0, globe: 0, shark: 0 }, feed: [], top: [], mvp_is_you: false,
      you: { attacks: 0, attacks_left: 5, damage: 0, reward: null }, energy_cost: 10, reach_meters: 200,
      remote: { joined: false, ticket_cost: 1, damage_rate: .6, fighters: 0 } };
    const service = new BossAttackRecovery({
      async getItem(key) { return records.get(key) ?? null; },
      async setItem(key, value) { records.set(key, value); },
      async removeItem(key) { records.delete(key); },
    }, async (_, body) => {
      calls += 1;
      if (responses.has(body.client_request_id)) {
        setRecoveryReceipt(`${calls} fixture requests · ${spends} simulated spend · same saved round`);
        return responses.get(body.client_request_id)!;
      }
      spends += 1;
      const damage = body.hits * 10 + body.weak_hits * 20;
      responses.set(body.client_request_id, { ok: true, damage, state: { raid: { ...raid, hp_left: 5000 - damage,
        fighters: 1, teams: { mouse: damage, globe: 0, shark: 0 },
        you: { attacks: 1, attacks_left: 4, damage, reward: null } }, next_at: null } });
      setRecoveryReceipt(`${calls} fixture request · ${spends} simulated spend · reply deliberately lost`);
      return { ok: false, error: 'network' };
    });
    return { service, raid };
  }, []);
  const testRecovery = async () => {
    if (!__DEV__ || !auth.player) return;
    setFixtureRaid(fixture.raid);
    setRecoveryOpen(true);
    await fixture.service.load(900005, 1);
    const checkpoint: BossAttackCheckpoint = { version: 1, playerId: 900005, parkId: 1, raidId: fixture.raid.id,
      boss: fixture.raid.boss, rideName: fixture.raid.ride_name, savedAt: Date.now(), body: {
        client_request_id: `boss-fixture-${Date.now()}-saved-round`, latitude: 34.13838, longitude: -118.35576,
        hits: 3, weak_hits: 1, duration_ms: 20000 } };
    await fixture.service.capture(checkpoint, () => true);
  };
  return <View style={{ flex: 1, backgroundColor: '#075083', padding: 22, justifyContent: 'center' }}>
    <Text style={{ fontFamily: 'Shark', fontSize: 28, color: '#FFD34B', textAlign: 'center' }}>Boss practice</Text>
    <Text style={{ fontFamily: 'Knockout', color: '#DFF6FF', fontSize: 15, textAlign: 'center', marginVertical: 12 }}>
      Development arena · no Energy, raid damage or rewards are submitted
    </Text>
    {(['kraken', 'robo_shark', 'ghost_squid'] as const).map(id => <Pressable key={id} accessibilityRole="button"
      accessibilityLabel={`Practice ${BOSS_NAMES[id]}`} onPress={() => { setBoss(id); setReceipt(null); setVisible(true); }}
      style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 7, padding: 12, borderRadius: 18,
        borderWidth: 2, borderColor: '#A6DFF5', backgroundColor: '#163B6D' }}>
      <Image source={BOSS_ART[id]} contentFit="contain" style={{ width: 74, height: 74, marginRight: 15, transform: [{ scale: BOSS_ART_SCALE?.[id] ?? 1 }] }} />
      <Text style={{ fontFamily: 'Shark', color: '#FFF', fontSize: 22 }}>{BOSS_NAMES[id]}</Text>
    </Pressable>)}
    {receipt && <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#FFE37B', marginTop: 16, textAlign: 'center' }}>{receipt}</Text>}
    {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="Test saved boss round recovery without spending account Energy"
      onPress={() => { void testRecovery(); }} style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFE079', marginTop: 16 }}>
      <Text style={{ fontFamily: 'Shark', fontSize: 19, color: '#153861', textAlign: 'center' }}>Test lost-reply recovery</Text>
    </Pressable>}
    {recoveryReceipt && <Text style={{ fontFamily: 'Knockout', fontSize: 14, color: '#DFF6FF', textAlign: 'center', marginTop: 12 }}>{recoveryReceipt}</Text>}
    {__DEV__ && auth.player && <AuthContext.Provider value={{ ...auth, player: { ...auth.player, id: 900005 },
      refreshPlayer: async () => ({ ...auth.player!, id: 900005 }) }}>
      <BossRaidFlow raid={fixtureRaid} parkId={1} open={recoveryOpen} recoveryService={fixture.service}
        onClose={() => setRecoveryOpen(false)} onState={state => setFixtureRaid(state.raid)} />
    </AuthContext.Provider>}
    {__DEV__ && <BossBrawl visible={visible} boss={boss} bossName={BOSS_NAMES[boss]} hpLeft={5000} hpMax={5000}
      onClose={() => setVisible(false)} onComplete={(_, meta) => { setVisible(false);
        const hits = Number(meta?.hits ?? 0), critical = Number(meta?.weak_hits ?? 0);
        setReceipt(`Practice finished · ${hits} ${hits === 1 ? 'hit' : 'hits'} · ${critical} critical ${critical === 1 ? 'hit' : 'hits'}`); }} />}
  </View>;
}
