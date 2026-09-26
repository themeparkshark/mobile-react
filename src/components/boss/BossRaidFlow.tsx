import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { attackRaid, BOSS_NAMES, getParkRaid, type AttackResult, type BossRaid, type RaidState } from '../../api/endpoints/parks/raid';
import { TEAMS, type TeamId } from '../../constants/teams';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { BOSS_ART, BossBrawl } from '../../games/boss/BossBrawl';
import PushSoftAsk from '../PushSoftAsk';

/** Poll the park's raid while at a park. */
export function useParkRaid(parkId: number | null | undefined) {
  const [state, setState] = useState<RaidState | null>(null);
  const refresh = useCallback(() => {
    if (!parkId) { setState(null); return; }
    getParkRaid(parkId).then(setState).catch(() => undefined);
  }, [parkId]);
  useEffect(() => {
    refresh();
    if (!parkId) return;
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, [parkId, refresh]);
  return { raid: state?.raid ?? null, nextAt: state?.next_at ?? null, refresh, setState };
}

function meters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const r = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function clock(endsAt: string, now: number) {
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ERRORS: Record<Exclude<AttackResult, { ok: true }>['error'], string> = {
  too_far: 'Get closer to the ride to fight.',
  no_energy: 'Not enough Energy for another attack.',
  no_attacks_left: "You've used all your attacks. Cheer them on!",
  bad_proof: "That brawl didn't count. Try again.",
  raid_over: 'The fight is over!',
  no_remote_pass: 'You need a Park Ticket to join another raid from home today.',
  network: "Couldn't reach the park. Your Energy wasn't spent.",
};

/** Boss sheet (who's fighting, HP, your attacks), the Boss Brawl, and the victory/escape moment. */
export default function BossRaidFlow({ raid, open, onClose, onState }: {
  readonly raid: BossRaid | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onState: (state: RaidState) => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const [fighting, setFighting] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<BossRaid | null>(null);
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Once a raid you fought ends, celebrate it once.
  useEffect(() => {
    if (!raid || raid.status === 'active' || !raid.you.reward || !focused) return;
    const key = `boss-celebrated-${raid.id}`;
    let cancelled = false;
    // Wait for the map to settle: iOS drops a modal presented mid-navigation.
    const timer = setTimeout(() => {
      AsyncStorage.getItem(key).then(seen => {
        if (seen || cancelled) return;
        AsyncStorage.setItem(key, '1').catch(() => undefined);
        setCelebrate(raid);
      }).catch(() => undefined);
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [raid?.id, raid?.status, !!raid?.you.reward, focused]);

  const submit = async (meta?: Record<string, unknown>) => {
    if (!raid || !location || !meta) return;
    setSending(true);
    const result = await attackRaid(raid.id, {
      client_request_id: `${raid.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      latitude: location.latitude,
      longitude: location.longitude,
      hits: Number(meta.hits ?? 0),
      weak_hits: Number(meta.weak_hits ?? 0),
      duration_ms: Number(meta.duration_ms ?? 0),
      remote: remote || undefined,
    });
    setSending(false);
    if (result.ok) {
      onState(result.state);
      setNote(`You hit ${BOSS_NAMES[raid.boss]} for ${result.damage.toLocaleString()}!`);
    } else {
      if (result.state) onState(result.state);
      setNote(ERRORS[result.error]);
    }
    refreshPlayer?.();
  };

  const sheetVisible = open && !!raid;
  const far = raid && location && raid.latitude !== null && raid.longitude !== null
    ? meters(location, { latitude: raid.latitude, longitude: raid.longitude }) : null;
  // Away from the ride (or no GPS fix yet), the fight is joined from home.
  const remote = !!raid && (far === null || far > raid.reach_meters);
  const energy = Number((player as { energy?: number } | null)?.energy ?? 0);
  const tickets = Number((player as { tickets?: number } | null)?.tickets ?? 0);
  const active = raid?.status === 'active' && new Date(raid.ends_at).getTime() > now;
  const needsPass = remote && raid && !raid.remote.joined;
  const payWithTicket = needsPass && raid.remote.free_passes_left <= 0;
  const blocked = !raid || !active ? 'The fight is over.'
    : raid.you.attacks_left <= 0 ? "You've used all 5 attacks. Cheer them on!"
      : energy < raid.energy_cost ? `Need ${raid.energy_cost} Energy to attack`
        : payWithTicket && tickets < raid.remote.ticket_cost ? 'Out of free passes · need 1 Park Ticket' : null;
  const fightLabel = !remote ? `FIGHT  ·  ${raid?.energy_cost ?? 10} ⚡`
    : !needsPass ? `FIGHT FROM HOME  ·  ${raid?.energy_cost ?? 10} ⚡`
      : payWithTicket ? `JOIN FROM HOME  ·  1 🎟 + ${raid?.energy_cost ?? 10} ⚡`
        : `JOIN FROM HOME  ·  FREE PASS`;
  const teamTotal = raid ? Math.max(1, raid.teams.mouse + raid.teams.globe + raid.teams.shark) : 1;

  // iOS shows one modal at a time: with the sheet open, the win takes over the sheet.
  const winView = celebrate?.you.reward ? (
    <View style={styles.win}>
      <Text style={styles.winKicker}>{celebrate.you.reward.outcome === 'defeated' ? 'BOSS DEFEATED!' : 'IT GOT AWAY…'}</Text>
      <Image source={BOSS_ART[celebrate.boss]} style={[styles.winArt, celebrate.you.reward.outcome === 'defeated' && styles.winArtKo]} contentFit="contain" />
      <Text style={styles.winTitle}>
        {celebrate.you.reward.outcome === 'defeated'
          ? `The park beat ${BOSS_NAMES[celebrate.boss]}!`
          : `${BOSS_NAMES[celebrate.boss]} escaped. Thanks for fighting!`}
      </Text>
      {celebrate.mvp_is_you && <Text style={styles.mvp}>👑 YOU WERE MVP</Text>}
      <View style={styles.loot}>
        {celebrate.you.reward.coins > 0 && <Text style={styles.lootChip}>+{celebrate.you.reward.coins} Shark Coins</Text>}
        {celebrate.you.reward.xp > 0 && <Text style={styles.lootChip}>+{celebrate.you.reward.xp} XP</Text>}
        {celebrate.you.reward.energy > 0 && <Text style={styles.lootChip}>+{celebrate.you.reward.energy} Energy</Text>}
        {celebrate.you.reward.parts > 0 && <Text style={styles.lootChip}>+{celebrate.you.reward.parts} {celebrate.ride_name} Parts</Text>}
        {celebrate.you.reward.tickets > 0 && <Text style={styles.lootChip}>+{celebrate.you.reward.tickets} Park Ticket</Text>}
      </View>
      <Pressable accessibilityRole="button" style={styles.fight} onPress={() => setCelebrate(null)}>
        <Text style={styles.fightText}>AWESOME</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <>
      {raid && <Modal isVisible={sheetVisible} onBackdropPress={onClose} onSwipeComplete={onClose} swipeDirection="down"
        style={styles.sheetModal} backdropOpacity={0.5}>
          {/* The brawl presents from inside the sheet (iOS can't present a new
              modal while another is dismissing); the sheet waits underneath. */}
          <BossBrawl
            visible={fighting}
            boss={raid.boss}
            bossName={BOSS_NAMES[raid.boss]}
            hpLeft={raid.hp_left}
            hpMax={raid.hp_max}
            damageRate={remote ? raid.remote.damage_rate : 1}
            onComplete={(_, meta) => { setFighting(false); void submit(meta); }}
            onClose={() => setFighting(false)}
          />
          {winView ?? <View style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.head}>
              <Image source={BOSS_ART[raid.boss]} style={styles.bossArt} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>BOSS RAID · {active ? `${clock(raid.ends_at, now)} left` : raid.status === 'defeated' ? 'DEFEATED' : 'ESCAPED'}</Text>
                <Text style={styles.name}>{BOSS_NAMES[raid.boss]}</Text>
                <Text style={styles.where} numberOfLines={1}>at {raid.ride_name}</Text>
              </View>
            </View>
            <View style={styles.hpTrack}>
              <View style={[styles.hpFill, { width: `${Math.max(1, (raid.hp_left / Math.max(1, raid.hp_max)) * 100)}%` }]} />
            </View>
            <Text style={styles.hpText}>{raid.hp_left.toLocaleString()} / {raid.hp_max.toLocaleString()} HP · {raid.fighters} {raid.fighters === 1 ? 'shark' : 'sharks'} fighting</Text>

            <View style={styles.teams}>
              {(['mouse', 'globe', 'shark'] as TeamId[]).map(team => (
                <View key={team} style={styles.teamRow}>
                  <Image source={TEAMS[team].badge} style={styles.teamBadge} contentFit="contain" />
                  <View style={styles.teamTrack}>
                    <View style={[styles.teamFill, { width: `${(raid.teams[team] / teamTotal) * 100}%`, backgroundColor: TEAMS[team].color }]} />
                  </View>
                  <Text style={styles.teamDmg}>{raid.teams[team].toLocaleString()}</Text>
                </View>
              ))}
            </View>

            {raid.top.length > 0 && (
              <View style={styles.top}>
                {raid.top.map((t, i) => (
                  <Text key={`${t.username}-${i}`} style={[styles.topRow, t.you && styles.topYou]} numberOfLines={1}>
                    {['🥇', '🥈', '🥉'][i]} {t.username}{t.you ? ' (you)' : ''} · {t.damage.toLocaleString()}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.you}>
              Your damage {raid.you.damage.toLocaleString()} · {raid.you.attacks_left} of 5 attacks left
            </Text>
            {note && <Text style={styles.note}>{note}</Text>}
            {raid.you.attacks > 0 && <View style={{ marginTop: 8 }}><PushSoftAsk dark /></View>}

            <Pressable accessibilityRole="button" disabled={!!blocked || sending}
              onPress={() => { setNote(null); setFighting(true); }}
              style={[styles.fight, (!!blocked || sending) && styles.fightOff]}>
              <Text style={styles.fightText}>{sending ? 'SENDING…' : blocked ?? fightLabel}</Text>
            </Pressable>
            <Text style={styles.fine}>
              {remote
                ? `Fighting from home deals ${Math.round(raid.remote.damage_rate * 100)}% damage. ${raid.remote.joined ? "You're in!" : `${raid.remote.free_passes_left} free pass${raid.remote.free_passes_left === 1 ? '' : 'es'} left today.`} Everyone who lands a hit gets the loot.`
                : 'Beat it together before time runs out: everyone who lands a hit gets the loot, the top hitter is MVP.'}
            </Text>
          </View>}
      </Modal>}

      {celebrate?.you.reward && !open && focused && <Modal isVisible onBackdropPress={() => setCelebrate(null)} backdropOpacity={0.65}
        animationIn="zoomIn" animationOut="fadeOut">
        {winView}
      </Modal>}
    </>
  );
}

const styles = StyleSheet.create({
  sheetModal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { backgroundColor: '#2a1245', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: '#fff',
    padding: 18, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bossArt: { width: 96, height: 96 },
  kicker: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1.2, color: '#ff9b9b' },
  name: { fontFamily: 'Shark', fontSize: 30, color: '#ffcf3b' },
  where: { fontFamily: 'Knockout', fontSize: 16, color: '#e9d9ff' },
  hpTrack: { marginTop: 10, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 2, borderColor: '#fff', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#ef4444' },
  hpText: { marginTop: 4, fontFamily: 'Knockout', fontSize: 13, color: '#fff', textAlign: 'center' },
  teams: { marginTop: 10, gap: 5 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamBadge: { width: 22, height: 22 },
  teamTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  teamFill: { height: '100%' },
  teamDmg: { width: 58, textAlign: 'right', fontFamily: 'Knockout', fontSize: 13, color: '#fff' },
  top: { marginTop: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 8, gap: 2 },
  topRow: { fontFamily: 'Knockout', fontSize: 14, color: '#fff' },
  topYou: { color: '#ffcf3b' },
  you: { marginTop: 10, fontFamily: 'Knockout', fontSize: 14, color: '#e9d9ff', textAlign: 'center' },
  note: { marginTop: 4, fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b', textAlign: 'center' },
  fight: { marginTop: 12, backgroundColor: '#ef4444', borderRadius: 16, paddingVertical: 13, alignItems: 'center',
    borderBottomWidth: 4, borderBottomColor: '#a51d1d' },
  fightOff: { backgroundColor: '#6b5a80', borderBottomColor: '#4a3d5a' },
  fightText: { fontFamily: 'Shark', fontSize: 18, color: '#fff', textAlign: 'center', paddingHorizontal: 10 },
  fine: { marginTop: 8, fontFamily: 'Knockout', fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  win: { backgroundColor: '#2a1245', borderRadius: 26, borderWidth: 4, borderColor: '#fff', padding: 20, alignItems: 'center' },
  winKicker: { fontFamily: 'Shark', fontSize: 30, color: '#ffcf3b', textAlign: 'center' },
  winArt: { width: 150, height: 150, marginVertical: 6 },
  winArtKo: { transform: [{ rotate: '-18deg' }], opacity: 0.85 },
  winTitle: { fontFamily: 'Knockout', fontSize: 17, color: '#fff', textAlign: 'center' },
  mvp: { marginTop: 6, fontFamily: 'Shark', fontSize: 18, color: '#ffcf3b' },
  loot: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  lootChip: { fontFamily: 'Shark', fontSize: 14, color: '#2a1245', backgroundColor: '#ffcf3b', borderRadius: 10,
    paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
});
