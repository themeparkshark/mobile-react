import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { BOSS_NAMES, getParkRaid, type AttackResult, type BossRaid, type RaidState } from '../../api/endpoints/parks/raid';
import { TEAMS, type TeamId } from '../../constants/teams';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { BOSS_ART_SCALE, BOSS_ART, BossBrawl } from '../../games/boss/BossBrawl';
import useBossAttackRecovery from '../../hooks/useBossAttackRecovery';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import type { BossAttackCheckpoint, BossAttackRecovery } from '../../services/boss/attackRecovery';
import BossAttackStatus from './BossAttackStatus';
import PushSoftAsk from '../PushSoftAsk';

/** Poll the park's raid while at a park. */
export function useParkRaid(parkId: number | null | undefined) {
  const { player } = useContext(AuthContext);
  const scope = `${player?.id ?? 'guest'}:${parkId ?? 'none'}`;
  const current = useRef(scope), generation = useRef(0), mounted = useRef(false);
  current.current = scope;
  const [selection, setSelection] = useState<{ scope: string; state: RaidState } | null>(null);
  const setState = useCallback((state: RaidState) => {
    if (!mounted.current || current.current !== scope) return;
    generation.current += 1; // A confirmed attack invalidates any older in-flight poll.
    setSelection({ scope, state });
  }, [scope]);
  const refresh = useCallback(() => {
    if (!parkId || !player?.id) return;
    const request = ++generation.current;
    getParkRaid(parkId).then(state => {
      if (mounted.current && current.current === scope && generation.current === request) setSelection({ scope, state });
    }).catch(() => undefined);
  }, [parkId, scope]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => {
    generation.current += 1;
    refresh();
    if (!parkId || !player?.id) return;
    const id = setInterval(refresh, 20000);
    return () => { clearInterval(id); generation.current += 1; };
  }, [scope, refresh]);
  const state = selection?.scope === scope ? selection.state : null;
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
  no_remote_pass: 'Joining from home costs 1 Park Ticket. Hunt at home to earn more!',
  not_found: 'This fight is no longer available.',
  network: 'Your round is awaiting confirmation.',
};

/** Boss sheet (who's fighting, HP, your attacks), the Boss Brawl, and the victory/escape moment. */
export default function BossRaidFlow({ raid, parkId, open, onClose, onState, recoveryService, onCelebrationDismiss, onMapOcclusionChange, presentationAvailable = true }: {
  readonly raid: BossRaid | null;
  readonly parkId: number | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onState: (state: RaidState) => void;
  /** Local fixture injection; normal screens always use the shared durable service. */
  readonly recoveryService?: BossAttackRecovery;
  readonly onCelebrationDismiss?: (raid: BossRaid) => void;
  readonly onMapOcclusionChange?: (busy: boolean) => void;
  readonly presentationAvailable?: boolean;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const [fighting, setFighting] = useState(false);
  const round = useRef<Omit<BossAttackCheckpoint, 'savedAt'> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<BossRaid | null>(null);
  const [sheetSettled, setSheetSettled] = useState(true);
  const [winSettled, setWinSettled] = useState(true);
  const reduced = useReducedGameMotion();
  const focused = useIsFocused() && presentationAvailable;
  const [now, setNow] = useState(Date.now());
  const playerId = player?.id ?? null;
  const contextKey = `${playerId}:${parkId}:${raid?.id}`;
  const ownerKey = `${playerId}:${parkId}`;
  const owner = useRef(ownerKey); owner.current = ownerKey;
  const currentView = useRef({ contextKey, open, focused });
  currentView.current = { contextKey, open, focused };
  const presented = useRef(new Set<string>());
  const recovery = useBossAttackRecovery({ playerId, parkId, onResult: (checkpoint, result) => {
    if (result.ok) {
      onState(result.state);
      setNote(`Confirmed! You hit ${BOSS_NAMES[checkpoint.boss]} for ${result.damage.toLocaleString()}.`);
    } else {
      if (result.state) onState(result.state);
      setNote(ERRORS[result.error]);
    }
    void refreshPlayer?.().catch(() => undefined);
  }, recovery: recoveryService });
  const receiptBlocked = !recovery.snapshot?.loaded || recovery.snapshot.phase !== 'ready' || !!recovery.snapshot.pending;
  const occluded = open || fighting || !!celebrate || !sheetSettled || !winSettled;
  const occlusionCallback = useRef(onMapOcclusionChange); occlusionCallback.current = onMapOcclusionChange;
  useEffect(() => { occlusionCallback.current?.(occluded); }, [occluded, onMapOcclusionChange]);
  useEffect(() => () => { occlusionCallback.current?.(false); }, []);

  useEffect(() => {
    round.current = null;
    setFighting(false);
    setNote(null);
    setCelebrate(null);
  }, [playerId, parkId]);
  useEffect(() => { round.current = null; setFighting(false); }, [raid?.id]);
  useEffect(() => {
    if (!open || !focused) { round.current = null; setFighting(false); }
  }, [open, focused]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Once a raid you fought ends, celebrate it once.
  useEffect(() => {
    if (!playerId || !raid || raid.status === 'active' || !raid.you.reward || !focused || fighting) return;
    const key = `boss-celebrated-v2-${playerId}-${raid.id}`;
    let cancelled = false;
    // Wait for the map to settle: iOS drops a modal presented mid-navigation.
    const timer = setTimeout(() => {
      AsyncStorage.getItem(key).then(seen => {
        if (seen || cancelled || presented.current.has(key)) return;
        presented.current.add(key);
        setCelebrate(raid);
      }).catch(() => undefined);
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [raid?.id, raid?.status, !!raid?.you.reward, focused, fighting, playerId]);

  const dismissCelebration = () => {
    if (owner.current !== ownerKey) return;
    if (celebrate && playerId) void AsyncStorage.setItem(`boss-celebrated-v2-${playerId}-${celebrate.id}`, '1').catch(() => undefined);
    if (celebrate) onCelebrationDismiss?.(celebrate);
    setCelebrate(null);
    onClose();
  };
  const closeSheet = () => { round.current = null; setFighting(false); if (celebrate) dismissCelebration(); else onClose(); };
  const submit = (expectedRound: typeof round.current, meta?: Record<string, unknown>) => {
    const finished = round.current;
    if (!finished || finished !== expectedRound) return;
    round.current = null; // Consume the round synchronously, even on rapid result taps.
    setFighting(false);
    if (!meta || finished.playerId !== playerId || finished.parkId !== parkId || finished.raidId !== raid?.id) return;
    if (Number(meta.hits ?? 0) <= 0) { setNote('No hits landed. Give it another try—no Energy spent.'); return; }
    void recovery.capture({ ...finished, savedAt: Date.now(), body: { ...finished.body,
      hits: Number(meta.hits), weak_hits: Number(meta.weak_hits), duration_ms: Number(meta.duration_ms) } })
      .catch(() => { setNote('That round couldn’t be saved. No attack was sent.'); });
  };

  const sheetVisible = open && focused && !!parkId;
  const far = raid && location && raid.latitude !== null && raid.longitude !== null
    ? meters(location, { latitude: raid.latitude, longitude: raid.longitude }) : null;
  // Away from the ride (or no GPS fix yet), the fight is joined from home.
  const remote = !!raid && (far === null || far > raid.reach_meters);
  const energy = Number((player as { energy?: number } | null)?.energy ?? 0);
  const tickets = Number((player as { tickets?: number } | null)?.tickets ?? 0);
  const active = raid?.status === 'active' && new Date(raid.ends_at).getTime() > now;
  const needsPass = remote && raid && !raid.remote.joined;
  const validLocation = !!location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
  const blocked = !playerId ? 'Sign in to join the fight.' : !raid || !active ? 'The fight is over.'
    : !validLocation ? 'Waiting for your location…'
    : raid.you.attacks_left <= 0 ? "You've used all 5 attacks. Cheer them on!"
      : energy < raid.energy_cost ? `Need ${raid.energy_cost} Energy to attack`
        : needsPass && tickets < raid.remote.ticket_cost ? 'Joining from home needs 1 Park Ticket' : null;
  const fightLabel = !remote ? `FIGHT  ·  ${raid?.energy_cost ?? 10} ⚡`
    : !needsPass ? `FIGHT FROM HOME  ·  ${raid?.energy_cost ?? 10} ⚡`
      : `JOIN FROM HOME  ·  1 🎟 + ${raid?.energy_cost ?? 10} ⚡`;
  const teamTotal = raid ? Math.max(1, raid.teams.mouse + raid.teams.globe + raid.teams.shark) : 1;
  const startBrawl = () => {
    if (!currentView.current.open || !currentView.current.focused || currentView.current.contextKey !== contextKey ||
      blocked || receiptBlocked || !recovery.canStart() || round.current || !raid || !playerId || !parkId || !location ||
      new Date(raid.ends_at).getTime() <= Date.now()) return;
    // Lock GPS and the explicit join choice at the action the player approved.
    round.current = { version: 1, playerId, parkId, raidId: raid.id, boss: raid.boss, rideName: raid.ride_name,
      body: { client_request_id: `boss-${raid.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        latitude: location.latitude, longitude: location.longitude, hits: 0, weak_hits: 0, duration_ms: 20000,
        ...(remote ? { remote: true } : {}) } };
    setNote(null);
    setFighting(true);
  };
  const renderedRound = round.current;

  // iOS shows one modal at a time: with the sheet open, the win takes over the sheet.
  const winView = celebrate?.you.reward ? (
    <View style={styles.win}>
      <Text style={styles.winKicker}>{celebrate.you.reward.outcome === 'defeated' ? 'BOSS DEFEATED!' : 'IT GOT AWAY…'}</Text>
      <Image source={BOSS_ART[celebrate.boss]} style={[styles.winArt, { transform: [{ scale: BOSS_ART_SCALE?.[celebrate.boss] ?? 1 }, { rotate: celebrate.you.reward.outcome === 'defeated' ? '-18deg' : '0deg' }] }]} contentFit="contain" />
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
      <Pressable accessibilityRole="button" style={styles.fight} onPress={dismissCelebration}>
        <Text style={styles.fightText}>BACK TO THE PARK</Text>
      </Pressable>
    </View>
  ) : null;
  const emptyView = <View style={[styles.sheet, styles.sheetContent]}>
    <Text style={styles.name}>Your boss brawl</Text>
    {receiptBlocked && recovery.snapshot ? <BossAttackStatus snapshot={recovery.snapshot} onRetry={() => { void recovery.retry(); }} />
      : <Text style={styles.you}>{note ?? 'No boss is fighting here right now.'}</Text>}
    <Pressable accessibilityRole="button" style={styles.fight} onPress={closeSheet}>
      <Text style={styles.fightText}>Back to the park</Text>
    </Pressable>
  </View>;

  return (
    <>
      <Modal isVisible={sheetVisible} onBackdropPress={closeSheet} onBackButtonPress={closeSheet}
        onModalWillShow={() => setSheetSettled(false)} onModalHide={() => setSheetSettled(true)}
        animationIn={reduced ? 'fadeIn' : 'slideInUp'} animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
        animationInTiming={reduced ? 100 : 300} animationOutTiming={reduced ? 100 : 300}
        style={styles.sheetModal} backdropOpacity={0.5}>
          {/* The brawl presents from inside the sheet (iOS can't present a new
              modal while another is dismissing); the sheet waits underneath. */}
          {raid && <BossBrawl
            visible={fighting}
            boss={raid.boss}
            bossName={BOSS_NAMES[raid.boss]}
            hpLeft={raid.hp_left}
            hpMax={raid.hp_max}
            damageRate={round.current?.body.remote ? raid.remote.damage_rate : 1}
            onComplete={(_, meta) => submit(renderedRound, meta)}
            onClose={() => { if (round.current === renderedRound) { round.current = null; setFighting(false); } }}
          />}
          {winView ?? (raid ? <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} bounces={false}>
            <View style={styles.grabber} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close boss raid" onPress={closeSheet} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
            <View style={styles.head}>
              <Image source={BOSS_ART[raid.boss]} style={[styles.bossArt, { transform: [{ scale: BOSS_ART_SCALE?.[raid.boss] ?? 1 }] }]} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>BOSS RAID · {active ? `${clock(raid.ends_at, now)} left` : raid.status === 'defeated' ? 'DEFEATED' : 'ESCAPED'}</Text>
                <Text style={styles.name}>{BOSS_NAMES[raid.boss]}</Text>
                <Text style={styles.where} numberOfLines={1}>at {raid.ride_name}</Text>
              </View>
            </View>
            <View style={styles.hpTrack}>
              <View style={[styles.hpFill, { width: `${Math.min(100, Math.max(0, (raid.hp_left / Math.max(1, raid.hp_max)) * 100))}%` }]} />
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

            {receiptBlocked && recovery.snapshot ? <BossAttackStatus snapshot={recovery.snapshot} onRetry={() => { void recovery.retry(); }} />
              : <Pressable accessibilityRole="button" disabled={!!blocked}
                onPress={startBrawl} style={[styles.fight, !!blocked && styles.fightOff]}>
                <Text style={styles.fightText}>{blocked ?? fightLabel}</Text>
              </Pressable>}
            <Text style={styles.fine}>
              {remote
                ? `From home you deal ${Math.round(raid.remote.damage_rate * 100)}% damage and can't be MVP. ${raid.remote.joined ? "You're in! " : ''}Everyone who lands a hit gets the loot.`
                : 'Beat it together before time runs out: everyone who lands a hit gets the loot, the top hitter is MVP.'}
            </Text>
          </ScrollView> : emptyView)}
      </Modal>

      <Modal isVisible={!!celebrate?.you.reward && !open && focused && sheetSettled} onBackdropPress={dismissCelebration} onBackButtonPress={dismissCelebration} backdropOpacity={0.65}
        onModalWillShow={() => setWinSettled(false)} onModalHide={() => setWinSettled(true)}
        animationIn={reduced ? 'fadeIn' : 'zoomIn'} animationOut="fadeOut" animationInTiming={reduced ? 100 : 300}>
        {winView ?? <View />}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetModal: { justifyContent: 'flex-end', margin: 0, paddingTop: 70 },
  sheet: { backgroundColor: '#2a1245', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: '#fff',
    flexGrow: 0 },
  sheetContent: { padding: 18, paddingBottom: 40 },
  close: { alignSelf: 'flex-end', width: 44, height: 44, borderRadius: 22, backgroundColor: '#472462', alignItems: 'center', justifyContent: 'center', marginTop: -4, marginBottom: 2 },
  closeText: { color: '#fff', fontSize: 22 },
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
