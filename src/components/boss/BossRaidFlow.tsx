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
import { BossBash } from '../../games/boss/bash/BossBash';
import useBossAttackRecovery from '../../hooks/useBossAttackRecovery';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import type { BossAttackCheckpoint, BossAttackRecovery } from '../../services/boss/attackRecovery';
import { BRAND, GameButton, GameIcon } from '../../ui';
import BossAttackStatus from './BossAttackStatus';
import { BOSS_ART } from './bossArt';
import { AttackPips, BossSheetSkeleton, TeamDamage, TopFighters } from './BossSheetParts';
import BossJoinCard, { BossJoinCta } from './BossJoinCard';
import { MAX_DAMAGE_PER_PLAYER, joinCost, rewardPreview, shortfallCopy } from './joinModel';
import BossWinCard from './BossWinCard';
import PushSoftAsk from '../PushSoftAsk';
import useLivePoll, { useAppActive } from '../../hooks/useLivePoll';
import { useBudgetedPoll } from '../../power';
import useMatchLink from '../../hooks/useMatchLink';
import MatchLinkBanner from '../match/MatchLinkBanner';
import { LINK_COPY, type LinkPhase } from '../../services/match/matchLink';
import { idlePollInterval } from '../../hooks/useUserIdle';

/** Poll the park's raid while at a park. `loaded` is false until the first answer for this player and park. */
export function useParkRaid(parkId: number | null | undefined, { focused = true, idle = false }: {
  readonly focused?: boolean;
  /** The player is idle: poll 3x slower, except during an active raid. */
  readonly idle?: boolean;
} = {}) {
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
  // The link outlives refresh (it retries through a ref), so declare it first.
  const refreshRef = useRef<() => void>(() => undefined);
  const link = useMatchLink(() => refreshRef.current(), scope, focused && !!parkId && !!player?.id);
  const refresh = useCallback(() => {
    if (!parkId || !player?.id) return;
    const request = ++generation.current;
    getParkRaid(parkId).then(state => {
      if (!mounted.current || current.current !== scope) return;
      link.ok();
      if (generation.current === request) setSelection({ scope, state });
    }).catch(error => {
      // A failed poll keeps the last raid on screen and says so; it never fakes an empty one.
      if (mounted.current && current.current === scope) link.fail(error);
    });
  }, [parkId, scope]);
  refreshRef.current = refresh;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => {
    generation.current += 1;
    return () => { generation.current += 1; };
  }, [scope]);
  // Every 20 s while the raid is on screen (60 s on an idle map with no raid
  // running); paused in the background.
  const raidRunning = selection?.scope === scope && selection.state.raid?.status === 'active';
  useLivePoll(refresh, idlePollInterval(20000, idle && !raidRunning), { enabled: !!parkId && !!player?.id, focused, key: scope });
  const state = selection?.scope === scope ? selection.state : null;
  const names = state?.raid?.team_names;
  useEffect(() => applyTeamNames(names), [names]);
  return { raid: state?.raid ?? null, nextAt: state?.next_at ?? null, loaded: !!state, refresh, setState,
    link: link.phase, retryLink: link.retryNow };
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
  no_remote_pass: 'Joining from home costs 1 ticket. Hunt at home to get more!',
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
export default function BossRaidFlow({ raid, parkId, open, onClose, onState, recoveryService, roundService = startRaidRound, devAutoplay = 0, onLiveRefresh, onCelebrationDismiss, onMapOcclusionChange, presentationAvailable = true, loading = false, link = 'live', onRetryLink }: {
  readonly raid: BossRaid | null;
  readonly parkId: number | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onState: (state: RaidState) => void;
  /** Local fixture injection; normal screens always use the shared durable service. */
  readonly recoveryService?: BossAttackRecovery;
  /** Local fixture injection for dev previews; normal screens ask the server. */
  readonly roundService?: typeof startRaidRound;
  /** Dev capture only: the fight plays itself at this skill (0-1). */
  readonly devAutoplay?: number;
  /** Poll the raid faster while a round is on screen, so teammates' hits move the bar mid-fight. */
  readonly onLiveRefresh?: () => void;
  readonly onCelebrationDismiss?: (raid: BossRaid) => void;
  readonly onMapOcclusionChange?: (busy: boolean) => void;
  readonly presentationAvailable?: boolean;
  /** The raid is still loading: the sheet shows its skeleton instead of "no boss". */
  readonly loading?: boolean;
  /** Is the raid poll reaching the park? Reconnecting shows a chip; lost offers a free way out. */
  readonly link?: LinkPhase;
  readonly onRetryLink?: () => void;
}) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const appActive = useAppActive();
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
    if (sentAtBell.current) setReceipt(result.ok ? { state: 'saved', note: null } : { state: 'error', note: ERRORS[result.error] });
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
    if (!appActive || !focused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, appActive, focused]);

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
  // Result screen "Attack again": send this round, then start the next one once it is confirmed.
  const [againPending, setAgainPending] = useState(false);
  // The round is sent at the bell (keepOpen) so the result card can show what the server said and an idle
  // result card or a closed app never loses it; Done / Attack again then only close the fight.
  const sentAtBell = useRef(false);
  const [showTeams, setShowTeams] = useState(false);
  const atStart = useRef<{ energy: number; attacksLeft: number; attacks: number } | null>(null);
  const [receipt, setReceipt] = useState<{ state: 'saving' | 'saved' | 'error'; note: string | null } | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const submit = (expectedRound: typeof round.current, meta?: Record<string, unknown>, keepOpen = false) => {
    const finished = round.current;
    if (!finished || finished !== expectedRound) return;
    round.current = null; // Consume the round synchronously, even on rapid result taps.
    if (!keepOpen) setFighting(false);
    if (!meta || finished.playerId !== playerId || finished.parkId !== parkId || finished.raidId !== raid?.id) return;
    if (Number(meta.hits ?? 0) <= 0) { setNote('No hits landed. Give it another try. No Energy was spent.'); return; }
    const fitted = fitToRound({ hits: Number(meta.hits), weak_hits: Number(meta.weak_hits),
      duration_ms: Number(meta.duration_ms) }, roundLimits.current, raid?.damage ?? DEFAULT_DAMAGE);
    if (keepOpen) { sentAtBell.current = true; setReceipt({ state: 'saving', note: null }); }
    void recovery.capture({ ...finished, savedAt: Date.now(), body: { ...finished.body, ...fitted } })
      .catch(() => {
        setNote('That round couldn’t be saved. No attack was sent.');
        if (keepOpen) setReceipt({ state: 'error', note: 'That round could not be saved. No Energy was spent.' });
      });
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
  const blocked = !playerId ? 'Sign in to join the fight.'
    : link === 'lost' ? `${LINK_COPY.lostTitle}.` : link === 'reconnecting' ? LINK_COPY.reconnecting
    : !raid || !active ? 'The fight is over.'
    : atThisPark && !validLocation && !away ? 'Waiting for your location…'
    : raid.you.attacks_left <= 0 ? `You've used all ${maxAttacks} attacks. Cheer them on!`
      : shortfallCopy(joinCost(raid, remote, energy, tickets).short);

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
    const result = await roundService(raid.id, { ...at, ...(remote ? { remote: true } : {}) });
    setStarting(false);
    if (!currentView.current.open || !currentView.current.focused || currentView.current.contextKey !== entryKey || round.current) return;
    if (!result.ok) {
      if (result.error === 'too_far') {
        setAwayFor({ raidId: raid.id, reason: result.reason ?? 'far' });
        setNote(PRESENCE[result.reason ?? 'far']);
      } else setNote(result.error === 'network' ? 'Could not reach the fight. Check your internet and try again.' : ERRORS[result.error]);
      return;
    }
    // Lock GPS, the explicit join choice and the server round at the action the player approved.
    round.current = { version: 1, playerId, parkId, raidId: raid.id, boss: raid.boss, rideName: raid.ride_name,
      body: { client_request_id: `boss-${raid.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ...at, hits: 0, weak_hits: 0, duration_ms: 20000, round_token: result.round.token,
        ...(result.round.remote ? { remote: true } : {}) } };
    setRoundRate(result.round.damage_rate);
    roundLimits.current = { max_ms: result.round.max_ms, max_hits: result.round.max_hits };
    sentAtBell.current = false; setReceipt(null); setLiveActive(true);
    atStart.current = { energy, attacksLeft: raid.you.attacks_left, attacks: raid.you.attacks };
    setFighting(true);
  };
  const renderedRound = round.current;
  const liveRefresh = useRef(onLiveRefresh); liveRefresh.current = onLiveRefresh;
  // Only while play is live: never on the pause sheet or the result card (shared, budgeted poll).
  useBudgetedPoll(() => liveRefresh.current?.(), 6000, { enabled: fighting && liveActive, immediate: false, key: 'boss-live' });
  useEffect(() => {
    if (!againPending || fighting || starting) return;
    if (!open || !focused) { setAgainPending(false); return; }
    if (receiptBlocked) return;
    setAgainPending(false);
    if (!blocked) void startBrawl();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [againPending, receiptBlocked, fighting, starting, open, focused, blocked]);
  const rewards = raid ? rewardPreview(raid, remote) : null;

  // iOS shows one modal at a time: with the sheet open, the win takes over the sheet.
  const winView = celebrate?.you.reward ? (
    <BossWinCard raid={celebrate} onDone={dismissCelebration}
      lastHp={lastHp.current?.id === celebrate.id ? lastHp.current.hp : undefined} />
  ) : null;
  const emptyView = <View style={[styles.sheet, styles.sheetContent]}>
    <View style={styles.grabber} />
    {link !== 'live' && <MatchLinkBanner phase={link} onRetry={() => onRetryLink?.()} onLeave={closeSheet} leaveLabel="Leave fight" />}
    {loading && !receiptBlocked ? (link === 'lost' ? null : <BossSheetSkeleton />) : <>
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
          {raid && <BossBash
            visible={fighting}
            boss={raid.boss}
            bossName={BOSS_NAMES[raid.boss]}
            rideName={raid.ride_name}
            hpLeft={raid.hp_left}
            hpMax={raid.hp_max}
            fighters={raid.fighters}
            endsAt={raid.ends_at}
            damageRate={round.current?.body.remote ? roundRate : 1}
            damage={raid.damage ?? DEFAULT_DAMAGE}
            maxHits={roundLimits.current?.max_hits}
            // The wallet as it was at FIGHT: the round is charged at the bell, and the refreshed wallet must not be charged twice.
            next={{ attacksLeft: atStart.current?.attacksLeft ?? raid.you.attacks_left, energy: atStart.current?.energy ?? energy, energyCost: raid.energy_cost }}
            rewards={rewards ?? undefined}
            capLeft={Math.max(0, MAX_DAMAGE_PER_PLAYER - raid.you.damage)}
            teamDamage={raid.teams.mouse + raid.teams.globe + raid.teams.shark}
            // Come-back reward: from your 4th attack on this raid you start with a free fin.
            warmStart={(atStart.current?.attacks ?? raid.you.attacks) >= 3}
            warmNext={(atStart.current?.attacks ?? raid.you.attacks) + 1 >= 3}
            autoplay={__DEV__ || process.env.EXPO_PUBLIC_PERF_CAPTURE === '1' ? devAutoplay : 0}
            onRoundEnd={meta => submit(renderedRound, meta, true)}
            onActiveChange={setLiveActive}
            receipt={receipt?.state ?? null}
            receiptNote={receipt?.note ?? null}
            onComplete={(_, meta) => {
              if (sentAtBell.current) { sentAtBell.current = false; setFighting(false); } else submit(renderedRound, meta);
            }}
            onAgain={meta => {
              setAgainPending(true);
              if (sentAtBell.current) { sentAtBell.current = false; setFighting(false); } else submit(renderedRound, meta);
            }}
            onClose={() => { if (round.current === renderedRound) { round.current = null; setFighting(false); } }}
          />}
          {winView ?? (raid ? <View style={[styles.sheet, styles.sheetFrame]}>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.sheetScroll} bounces={false}>
              <View style={styles.grabber} />
              <MatchLinkBanner phase={link} onRetry={() => onRetryLink?.()} onLeave={closeSheet} leaveLabel="Leave fight" />
              <BossJoinCard raid={raid} remote={remote} walkCloser={walkCloser} energy={energy} tickets={tickets}
                endsAt={raid.ends_at} now={now} rewards={rewards!} onClose={closeSheet} note={note} paused={fighting} />
              {receiptBlocked && recovery.snapshot && !againPending &&
                <BossAttackStatus snapshot={recovery.snapshot} onRetry={() => { void recovery.retry(); }} />}
              {raid.you.attacks > 0 && <View style={{ marginTop: 6 }}><PushSoftAsk /></View>}
              {/* First look stays short: the team details open on a tap (they are always there for repeat attackers). */}
              {raid.you.attacks > 0 || showTeams ? <>
                <Text style={styles.section}>Your attacks</Text>
                <AttackPips raid={raid} />
                <Text style={styles.section}>Teams</Text>
                <TeamDamage raid={raid} />
                <TopFighters raid={raid} />
                <Text style={styles.fine}>
                {remote
                  ? `From home your hits count ${Math.round(raid.remote.damage_rate * 100)}%, loot is ${Math.round((raid.remote.reward_rate ?? raid.remote.damage_rate) * 100)}% and the MVP prize stays at the ride. Everyone who lands a hit shares the loot if the team wins.`
                  : 'Everyone who lands a hit shares the loot if the team wins. The top hitter is MVP and wins a Ticket.'}
              </Text>
              </> : <Pressable accessibilityRole="button" onPress={() => setShowTeams(true)} style={styles.teamsBtn} hitSlop={6}>
                <Text style={styles.teamsBtnText}>See who is fighting</Text>
              </Pressable>}

            </ScrollView>
            {/* The button is pinned in the thumb zone; while a saved attack is being confirmed there is no button. */}
            {!(receiptBlocked && recovery.snapshot && !againPending) && <View style={styles.footer}>
              <BossJoinCta raid={raid} remote={remote} energy={energy} tickets={tickets}
                blocked={!active ? (raid.status === 'defeated' ? 'Your team beat it!' : 'The fight is over.') : againPending ? 'Sending your attack...' : blocked}
                starting={starting || againPending} onFight={() => { void startBrawl(); }} onClose={closeSheet} paused={fighting} />
            </View>}
          </View> : emptyView)}
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
  sheetFrame: { maxHeight: '100%', overflow: 'hidden' },
  sheetScroll: { padding: 18, paddingBottom: 18 },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 30, borderTopWidth: 3, borderTopColor: 'rgba(255,255,255,0.35)', backgroundColor: BRAND.blue,
    shadowColor: BRAND.navy, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: -6 } },
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
  teamsBtn: { alignSelf: 'center', marginTop: 12, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 14,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  teamsBtnText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  section: { marginTop: 14, fontFamily: 'Shark', fontSize: 15, color: BRAND.white, opacity: 0.9 },
  fine: { marginTop: 8, fontFamily: 'Knockout', fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
});
