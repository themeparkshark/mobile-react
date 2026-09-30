import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import {
  acknowledgeRaid, BOSS_NAMES, DEFAULT_DAMAGE, fitToRound, getParkRaid, startRaidRound, type AttackResult, type BossRaid,
  type PresenceReason, type RaidRound, type RaidState,
} from '../../api/endpoints/parks/raid';
import { applyTeamNames } from '../../constants/teams';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext } from '../../context/LocationProvider';
import { BossBrawl } from '../../games/boss/BossBrawl';
import useBossAttackRecovery from '../../hooks/useBossAttackRecovery';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import type { BossAttackCheckpoint, BossAttackRecovery } from '../../services/boss/attackRecovery';
import { BRAND, GameButton, GameIcon } from '../../ui';
import BossAttackStatus from './BossAttackStatus';
import { BOSS_ART } from './bossArt';
import { AttackPips, BossHpBar, BossSheetSkeleton, TeamDamage, TopFighters } from './BossSheetParts';
import BossWinCard from './BossWinCard';
import PushSoftAsk from '../PushSoftAsk';

/** Poll the park's raid while at a park. `loaded` is false until the first answer for this player and park. */
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
  const names = state?.raid?.team_names;
  useEffect(() => applyTeamNames(names), [names]);
  return { raid: state?.raid ?? null, nextAt: state?.next_at ?? null, loaded: !!state, refresh, setState };
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

export const ERRORS: Record<Exclude<AttackResult, { ok: true }>['error'], string> = {
  too_far: 'Get closer to the ride to fight in person.',
  no_energy: 'Not enough Energy for another attack.',
  no_attacks_left: "You've used all your attacks. Cheer them on!",
  bad_proof: "That brawl didn't count. No Energy was spent. Try again.",
  bad_round: 'That round timed out. No Energy was spent. Tap FIGHT for a new one.',
  raid_over: 'The fight is over!',
  no_remote_pass: 'Joining from home costs 1 Park Ticket. Hunt at home to earn more!',
  not_found: 'This fight is no longer available.',
  damage_cap: "You've dealt the most one shark can in this raid. No Energy was spent. Your team can finish it!",
  network: 'Your round is awaiting confirmation.',
};

/** Why the server counted this player as away from the ride, in plain words. */
export const PRESENCE: Record<PresenceReason, string> = {
  far: 'You are too far from the ride to fight in person. Walk closer for full damage, or fight from here.',
  not_checked_in: 'Check in at this park to fight in person. You can still join from home.',
  jump: 'Your location just jumped. Give GPS a moment, or join from home.',
  no_location: 'No location yet. You can still join from home.',
};

/** Boss sheet (who's fighting, HP, your attacks), the Boss Brawl, and the victory/escape moment. */
export default function BossRaidFlow({ raid, parkId, open, onClose, onState, recoveryService, onCelebrationDismiss, onMapOcclusionChange, presentationAvailable = true, loading = false }: {
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
  /** The raid is still loading: the sheet shows its skeleton instead of "no boss". */
  readonly loading?: boolean;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const [fighting, setFighting] = useState(false);
  const [starting, setStarting] = useState(false);
  const round = useRef<Omit<BossAttackCheckpoint, 'savedAt'> | null>(null);
  const [roundRate, setRoundRate] = useState(1);
  const roundLimits = useRef<Pick<RaidRound, 'max_ms' | 'max_hits'> | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The server said this player is not at the ride for this raid: offer the remote join.
  const [awayFor, setAwayFor] = useState<{ raidId: number; reason: PresenceReason } | null>(null);
  const [celebrate, setCelebrate] = useState<BossRaid | null>(null);
  const [sheetSettled, setSheetSettled] = useState(true);
  const [winSettled, setWinSettled] = useState(true);
  const lastHp = useRef<{ id: number; hp: number } | null>(null);
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
    setAwayFor(null);
  }, [playerId, parkId]);
  useEffect(() => { round.current = null; setFighting(false); }, [raid?.id]);
  useEffect(() => {
    if (!open || !focused) { round.current = null; setFighting(false); }
  }, [open, focused]);
  // Remember the HP the player last saw on an active raid, so the win drains from there.
  useEffect(() => {
    if (raid && raid.status === 'active') lastHp.current = { id: raid.id, hp: raid.hp_left };
  }, [raid?.id, raid?.hp_left, raid?.status]);

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
    if (celebrate && playerId) {
      void AsyncStorage.setItem(`boss-celebrated-v2-${playerId}-${celebrate.id}`, '1').catch(() => undefined);
      // The server keeps a missed win on the raid endpoint until the app has shown it.
      void acknowledgeRaid(celebrate.id);
    }
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
    if (Number(meta.hits ?? 0) <= 0) { setNote('No hits landed. Give it another try. No Energy was spent.'); return; }
    const fitted = fitToRound({ hits: Number(meta.hits), weak_hits: Number(meta.weak_hits),
      duration_ms: Number(meta.duration_ms) }, roundLimits.current, raid?.damage ?? DEFAULT_DAMAGE);
    void recovery.capture({ ...finished, savedAt: Date.now(), body: { ...finished.body, ...fitted } })
      .catch(() => { setNote('That round couldn’t be saved. No attack was sent.'); });
  };

  const sheetVisible = open && focused && !!parkId;
  const validLocation = !!location && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 &&
    Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
  // The server only shares the ride's position with players checked in at this park.
  const atThisPark = !!raid && raid.latitude !== null && raid.longitude !== null;
  const far = raid && atThisPark && validLocation ? meters(location!, { latitude: raid.latitude!, longitude: raid.longitude! }) : null;
  const away = awayFor && raid && awayFor.raidId === raid.id ? awayFor.reason : null;
  // At the park: in person when within reach (the server has the final say). From home: remote.
  const remote = !!raid && (!atThisPark || !!away || (far !== null && far > raid.reach_meters));
  const walkCloser = !!raid && atThisPark && !away && far !== null && far > raid.reach_meters;
  const energy = Number((player as { energy?: number } | null)?.energy ?? 0);
  const tickets = Number((player as { tickets?: number } | null)?.tickets ?? 0);
  const active = raid?.status === 'active' && new Date(raid.ends_at).getTime() > now;
  const needsPass = remote && raid && !raid.remote.joined;
  const maxAttacks = raid?.max_attacks ?? 5;
  const blocked = !playerId ? 'Sign in to join the fight.' : !raid || !active ? 'The fight is over.'
    : atThisPark && !validLocation && !away ? 'Waiting for your location…'
    : raid.you.attacks_left <= 0 ? `You've used all ${maxAttacks} attacks. Cheer them on!`
      : energy < raid.energy_cost ? `Need ${raid.energy_cost} Energy to attack`
        : needsPass && tickets < raid.remote.ticket_cost ? 'Joining from home needs 1 Park Ticket' : null;
  const fightLabel = !remote ? 'FIGHT' : !needsPass ? 'FIGHT FROM HERE' : 'JOIN FROM HOME';

  const startBrawl = async () => {
    if (!currentView.current.open || !currentView.current.focused || currentView.current.contextKey !== contextKey ||
      blocked || starting || receiptBlocked || !recovery.canStart() || round.current || !raid || !playerId || !parkId ||
      new Date(raid.ends_at).getTime() <= Date.now()) return;
    const at = validLocation ? { latitude: location!.latitude, longitude: location!.longitude } : {};
    const entryKey = contextKey;
    setNote(null);
    setStarting(true);
    // FIGHT asks the server for this round's token first: it checks Energy, attacks
    // left, the remote Ticket and whether you are really at the ride before you play.
    const result = await startRaidRound(raid.id, { ...at, ...(remote ? { remote: true } : {}) });
    setStarting(false);
    if (!currentView.current.open || !currentView.current.focused || currentView.current.contextKey !== entryKey || round.current) return;
    if (!result.ok) {
      if (result.error === 'too_far') {
        setAwayFor({ raidId: raid.id, reason: result.reason ?? 'far' });
        setNote(PRESENCE[result.reason ?? 'far']);
      } else setNote(result.error === 'network' ? 'Could not reach the fight. Check your connection and try again.' : ERRORS[result.error]);
      return;
    }
    // Lock GPS, the explicit join choice and the server round at the action the player approved.
    round.current = { version: 1, playerId, parkId, raidId: raid.id, boss: raid.boss, rideName: raid.ride_name,
      body: { client_request_id: `boss-${raid.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...at, hits: 0, weak_hits: 0, duration_ms: 20000, round_token: result.round.token,
        ...(result.round.remote ? { remote: true } : {}) } };
    setRoundRate(result.round.damage_rate);
    roundLimits.current = { max_ms: result.round.max_ms, max_hits: result.round.max_hits };
    setFighting(true);
  };
  const renderedRound = round.current;

  // iOS shows one modal at a time: with the sheet open, the win takes over the sheet.
  const winView = celebrate?.you.reward ? (
    <BossWinCard raid={celebrate} onDone={dismissCelebration}
      lastHp={lastHp.current?.id === celebrate.id ? lastHp.current.hp : undefined} />
  ) : null;
  const emptyView = <View style={[styles.sheet, styles.sheetContent]}>
    <View style={styles.grabber} />
    {loading && !receiptBlocked ? <BossSheetSkeleton /> : <>
      <Text style={styles.name}>Your boss brawl</Text>
      {receiptBlocked && recovery.snapshot ? <BossAttackStatus snapshot={recovery.snapshot} onRetry={() => { void recovery.retry(); }} />
        : <Text style={styles.you}>{note ?? 'No boss is fighting here right now.'}</Text>}
    </>}
    <GameButton label="Back to the park" variant="secondary" onPress={closeSheet} style={{ marginTop: 14 }} />
  </View>;

  return (
    <>
      <Modal isVisible={sheetVisible} onBackdropPress={closeSheet} onBackButtonPress={closeSheet}
        onModalWillShow={() => setSheetSettled(false)} onModalHide={() => setSheetSettled(true)}
        animationIn={reduced ? 'fadeIn' : 'slideInUp'} animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
        animationInTiming={reduced ? 100 : 300} animationOutTiming={reduced ? 100 : 300}
        style={winView ? styles.winModal : styles.sheetModal} backdropColor={BRAND.navy} backdropOpacity={0.4}>
          {/* The brawl presents from inside the sheet (iOS can't present a new
              modal while another is dismissing); the sheet waits underneath. */}
          {raid && <BossBrawl
            visible={fighting}
            boss={raid.boss}
            bossName={BOSS_NAMES[raid.boss]}
            hpLeft={raid.hp_left}
            hpMax={raid.hp_max}
            damageRate={round.current?.body.remote ? roundRate : 1}
            damage={raid.damage ?? DEFAULT_DAMAGE}
            maxHits={roundLimits.current?.max_hits}
            onComplete={(_, meta) => submit(renderedRound, meta)}
            onClose={() => { if (round.current === renderedRound) { round.current = null; setFighting(false); } }}
          />}
          {winView ?? (raid ? <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} bounces={false}>
            <View style={styles.grabber} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close boss raid" onPress={closeSheet} style={styles.close} hitSlop={8}>
              <GameIcon name="close" size={36} />
            </Pressable>
            <View style={styles.head}>
              <View style={styles.bossDisc}>
                <Image source={BOSS_ART[raid.boss]} style={styles.bossArt} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={[styles.kickerChip, !active && styles.kickerDone]}>
                  <GameIcon name="timer" size={16} />
                  <Text style={styles.kicker}>{active ? `${clock(raid.ends_at, now)} LEFT` : raid.status === 'defeated' ? 'DEFEATED' : 'ESCAPED'}</Text>
                </View>
                <Text style={styles.name}>{BOSS_NAMES[raid.boss]}</Text>
                <Text style={styles.where} numberOfLines={1}>at {raid.ride_name}</Text>
              </View>
            </View>
            <View style={{ marginTop: 12 }}><BossHpBar hpLeft={raid.hp_left} hpMax={raid.hp_max} /></View>
            <Text style={styles.hpText}>{raid.hp_left.toLocaleString()} / {raid.hp_max.toLocaleString()} HP  ·  {raid.fighters} {raid.fighters === 1 ? 'shark' : 'sharks'} fighting</Text>

            <AttackPips raid={raid} />
            <Text style={styles.you}>Your damage {raid.you.damage.toLocaleString()}  ·  {raid.you.attacks_left} of {maxAttacks} attacks left</Text>
            <TeamDamage raid={raid} />
            <TopFighters raid={raid} />

            {walkCloser && <View style={styles.hint}>
              <GameIcon name="pin" size={22} />
              <Text style={styles.hintText}>Walk closer to {raid.ride_name ?? 'the ride'} for full damage. From here you deal {Math.round(raid.remote.damage_rate * 100)}%.</Text>
            </View>}
            {note && <Text style={styles.note}>{note}</Text>}
            {raid.you.attacks > 0 && <View style={{ marginTop: 8 }}><PushSoftAsk /></View>}

            {receiptBlocked && recovery.snapshot ? <BossAttackStatus snapshot={recovery.snapshot} onRetry={() => { void recovery.retry(); }} />
              : <View style={styles.cta}>
                {blocked && <Text style={styles.blocked}>{blocked}</Text>}
                <GameButton testID="boss-fight" label={fightLabel} variant="danger" disabled={!!blocked} loading={starting}
                  onPress={() => { void startBrawl(); }}
                  accessibilityHint={remote ? `Costs ${needsPass ? `${raid.remote.ticket_cost} Park Ticket and ` : ''}${raid.energy_cost} Energy` : `Costs ${raid.energy_cost} Energy`} />
                <View style={styles.cost}>
                  {needsPass && <><GameIcon name="ticket" size={20} /><Text style={styles.costText}>{raid.remote.ticket_cost}  +</Text></>}
                  <GameIcon name="energy" size={20} /><Text style={styles.costText}>{raid.energy_cost} per attack</Text>
                </View>
              </View>}
            <Text style={styles.fine}>
              {remote
                ? `From here you deal ${Math.round(raid.remote.damage_rate * 100)}% damage and can't be MVP. ${raid.remote.joined ? "You're in! " : ''}Everyone who lands a hit gets the loot.`
                : 'Beat it together before time runs out: everyone who lands a hit gets the loot, the top hitter is MVP.'}
            </Text>
          </ScrollView> : emptyView)}
      </Modal>

      <Modal isVisible={!!celebrate?.you.reward && !open && focused && sheetSettled} onBackdropPress={dismissCelebration} onBackButtonPress={dismissCelebration}
        backdropColor={BRAND.navy} backdropOpacity={0.55}
        onModalWillShow={() => setWinSettled(false)} onModalHide={() => setWinSettled(true)}
        animationIn={reduced ? 'fadeIn' : 'zoomIn'} animationOut="fadeOut" animationInTiming={reduced ? 100 : 300}>
        {winView ?? <View />}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sheetModal: { justifyContent: 'flex-end', margin: 0, paddingTop: 70 },
  winModal: { justifyContent: 'center', margin: 16 },
  sheet: { backgroundColor: BRAND.blue, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: BRAND.white,
    flexGrow: 0 },
  sheetContent: { padding: 18, paddingBottom: 40 },
  close: { position: 'absolute', right: 12, top: 14, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 36 },
  bossDisc: { width: 104, height: 104, borderRadius: 52, backgroundColor: BRAND.sky, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  bossArt: { width: 92, height: 92 },
  kickerChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.red, borderRadius: 10,
    borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 8, paddingVertical: 2 },
  kickerDone: { backgroundColor: BRAND.navySoft },
  kicker: { fontFamily: 'Shark', fontSize: 13, letterSpacing: 0.6, color: BRAND.white },
  name: { fontFamily: 'Shark', fontSize: 30, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2.5 }, textShadowRadius: 0 },
  where: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff' },
  hpText: { marginTop: 4, fontFamily: 'Knockout', fontSize: 14, color: BRAND.white, textAlign: 'center' },
  you: { marginTop: 8, fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center' },
  hint: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.cream, borderRadius: 12,
    borderWidth: 2, borderColor: BRAND.gold, padding: 8 },
  hintText: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
  note: { marginTop: 8, fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, textAlign: 'center', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  cta: { marginTop: 12, alignItems: 'center' },
  blocked: { marginBottom: 6, fontFamily: 'Shark', fontSize: 15, color: BRAND.white, textAlign: 'center' },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  costText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  fine: { marginTop: 8, fontFamily: 'Knockout', fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
});
