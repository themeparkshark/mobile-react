import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { cheerRide, getLiveParks, type HomeCheerTarget, type LiveParks, type LiveParkSummary } from '../../api/endpoints/me/livePark';
import { BOSS_NAMES } from '../../api/endpoints/parks/raid';
import { TEAMS, type TeamId } from '../../constants/teams';
import { AuthContext } from '../../context/AuthProvider';
import { BOSS_ART } from '../../games/boss/BossBrawl';
import { WhackAShark } from '../../games/whack';
import * as RootNavigation from '../../RootNavigation';
import BossRaidFlow, { useParkRaid } from '../boss/BossRaidFlow';
import PushSoftAsk from '../PushSoftAsk';

const ORDER: TeamId[] = ['mouse', 'globe', 'shark'];

function clock(endsAt: string, now: number) {
  const s = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The parks, live, from home: a bar on the home map (like the team bar at a
 * park) and a sheet with every live boss you can join remotely and the close
 * team fights you can tip with a home cheer.
 */
export default function HomeLive({ top = 12 }: { readonly top?: number }) {
  const { refreshPlayer } = useContext(AuthContext);
  const [live, setLive] = useState<LiveParks | null>(null);
  const [open, setOpen] = useState(false);
  const [raidPark, setRaidPark] = useState<number | null>(null);
  const [cheer, setCheer] = useState<{ park: LiveParkSummary; target: HomeCheerTarget; seed: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const [now, setNow] = useState(Date.now());
  const { raid, setState: setRaidState } = useParkRaid(raidPark);

  const load = useCallback(() => { getLiveParks().then(setLive).catch(() => undefined); }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(id);
  }, [toast]);

  if (!live) return null;
  const yours = live.your_team;
  const liveRaid = live.parks.find(p => p.raid && new Date(p.raid.ends_at).getTime() > now);
  const leader = live.leading_team;

  const finishCheer = async (meta?: Record<string, unknown>) => {
    const target = cheer;
    setCheer(null);
    if (!target || !meta) return;
    const result = await cheerRide(target.park.park_id, {
      asset_id: target.target.asset_id,
      client_request_id: `cheer-${target.target.asset_id}-${Date.now()}`,
      hits: Number(meta.hits ?? 0),
      duration_ms: Math.round(Number(meta.duration ?? 0) * 1000),
    });
    if (result.ok && result.cheer) {
      const c = result.cheer;
      setToast(c.flipped
        ? `${TEAMS[c.team].name} took ${c.ride_name}! 🎉`
        : `🛡 ${c.ride_name} defended: +${c.points} for ${TEAMS[c.team].name}!`);
    } else if (!result.ok) {
      setToast(result.error === 'no_cheers_left' ? "You're out of defends today. Come back tomorrow!"
        : result.error === 'not_holding' ? 'That ride changed hands. Win it back at the park!'
        : result.error === 'bad_proof' ? 'Hit the goal in the game to defend it.'
          : "Your cheer didn't go through. Try again.");
    }
    load();
    refreshPlayer?.();
  };

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => (liveRaid ? setRaidPark(liveRaid.park_id) : setOpen(true))}
        onLongPress={() => setOpen(true)}
        style={[styles.bar, liveRaid && styles.barBoss, { top }]}
        accessibilityLabel={liveRaid?.raid
          ? `Boss live: ${BOSS_NAMES[liveRaid.raid.boss]} at ${liveRaid.name}. Open live parks.`
          : 'Open live parks'}>
        {liveRaid?.raid ? (
          <>
            <Image source={BOSS_ART[liveRaid.raid.boss]} style={styles.barBossArt} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.barKicker} numberOfLines={1}>● LIVE · {liveRaid.name}</Text>
              <Text style={styles.barTitle} numberOfLines={1}>{BOSS_NAMES[liveRaid.raid.boss]} · {clock(liveRaid.raid.ends_at, now)} left</Text>
            </View>
            <Text style={styles.barGo}>JOIN ›</Text>
          </>
        ) : (
          <>
            <Text style={styles.barHeadline} numberOfLines={1}>
              {leader ? `${TEAMS[leader].name.toUpperCase()} LEADS` : 'THE PARKS ARE UP FOR GRABS'}
            </Text>
            <View style={styles.chips}>
              {ORDER.map(team => (
                <View key={team} style={[styles.chip, { backgroundColor: TEAMS[team].color }, yours === team && styles.chipYours]}>
                  <Image source={TEAMS[team].badge} style={styles.chipBadge} contentFit="contain" />
                  <Text style={styles.chipCount}>{live.totals[team]}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Pressable>

      {toast && <View style={[styles.toast, { top: top + 60 }]} pointerEvents="none"><Text style={styles.toastText}>{toast}</Text></View>}

      <Modal isVisible={open} onBackdropPress={() => setOpen(false)} onSwipeComplete={() => setOpen(false)}
        swipeDirection="down" style={styles.sheetModal} backdropOpacity={0.5} propagateSwipe
        onModalHide={() => { const run = pending.current; pending.current = null; run?.(); }}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>LIVE AT THE PARKS</Text>
          <Text style={styles.sub}>Rides each team holds today, every park</Text>
          {!liveRaid && live.next_boss && (
            <Text style={styles.nextBoss}>
              Next boss {new Date(live.next_boss.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} at {live.next_boss.park_name}
            </Text>
          )}
          <View style={styles.standings}>
            {ORDER.map(team => (
              <View key={team} style={styles.standing}>
                <Image source={TEAMS[team].badge} style={styles.standingBadge} contentFit="contain" />
                <Text style={[styles.standingCount, { color: TEAMS[team].color }]}>{live.totals[team]}</Text>
                <Text style={styles.standingLabel}>{TEAMS[team].name.replace('Team ', '')}{yours === team ? ' (you)' : ''}</Text>
              </View>
            ))}
          </View>
          {!yours ? (
            <Pressable style={styles.cta} accessibilityRole="button"
              onPress={() => { setOpen(false); RootNavigation.navigate('TeamSelection', {}); }}>
              <Text style={styles.ctaText}>PICK YOUR TEAM</Text>
            </Pressable>
          ) : (
            <Text style={styles.cheerLine}>
              {live.cheers_left > 0
                ? `🛡 ${live.cheers_left} defend${live.cheers_left === 1 ? '' : 's'} left today · keep your team's rides from home`
                : '🛡 Out of defends today · they reset tomorrow'}
            </Text>
          )}
          <PushSoftAsk />
          <ScrollView style={{ maxHeight: 380 }}>
            {yours && live.parks.every(p => p.cheers.length === 0) && live.parks.length > 0 && (
              <Text style={styles.hint}>Rides your team holds (with coins you own) show up here to defend. Taking rides happens at the park!</Text>
            )}
            {live.parks.length === 0 && (
              <Text style={styles.empty}>Quiet at the parks right now. Bosses surface five times a day at every park.</Text>
            )}
            {live.parks.map(park => (
              <View key={park.park_id} style={styles.park}>
                <View style={styles.parkHead}>
                  <Text style={styles.parkName} numberOfLines={1}>{park.name}</Text>
                  <View style={styles.miniChips}>
                    {ORDER.map(team => (
                      <Text key={team} style={[styles.miniChip, { color: TEAMS[team].color }]}>● {park.rides_held[team]}</Text>
                    ))}
                  </View>
                </View>
                {park.rushes > 0 && <Text style={styles.rush}>⚡ {park.rushes} ride{park.rushes === 1 ? '' : 's'} on Rush right now</Text>}
                {park.raid && new Date(park.raid.ends_at).getTime() > now && (
                  <Pressable style={styles.raidRow} accessibilityRole="button"
                    onPress={() => { pending.current = () => setRaidPark(park.park_id); setOpen(false); }}>
                    <Image source={BOSS_ART[park.raid.boss]} style={styles.raidArt} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.raidName} numberOfLines={1}>{BOSS_NAMES[park.raid.boss]} at {park.raid.ride_name}</Text>
                      <View style={styles.hpTrack}>
                        <View style={[styles.hpFill, { width: `${Math.max(2, (park.raid.hp_left / Math.max(1, park.raid.hp_max)) * 100)}%` }]} />
                      </View>
                      <Text style={styles.raidMeta}>{park.raid.fighters} fighting · {clock(park.raid.ends_at, now)} left</Text>
                    </View>
                    <Text style={styles.join}>JOIN ›</Text>
                  </Pressable>
                )}
                {yours && park.cheers.map(target => (
                  <Pressable key={target.asset_id} style={styles.cheerRow} accessibilityRole="button"
                    disabled={live.cheers_left <= 0}
                    onPress={() => { pending.current = () => setCheer({ park, target, seed: Date.now() % 100000 }); setOpen(false); }}>
                    <View style={[styles.flag, { backgroundColor: TEAMS[target.controller].color }]}>
                      <Image source={TEAMS[target.controller].badge} style={styles.flagBadge} contentFit="contain" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cheerRide} numberOfLines={1}>{target.ride_name}</Text>
                      <Text style={styles.cheerMeta} numberOfLines={1}>
                        {target.gap === 0 ? 'Tied: one cheer keeps it yours' : `Your team holds it · only ${target.gap} ahead`}
                      </Text>
                    </View>
                    <Text style={[styles.cheerGo, live.cheers_left <= 0 && { opacity: 0.4 }]}>DEFEND ›</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <BossRaidFlow raid={raidPark ? raid : null} open={raidPark !== null && !!raid}
        onClose={() => { setRaidPark(null); load(); }} onState={setRaidState} />

      {cheer && (
        <WhackAShark visible seed={cheer.seed} taskName={cheer.target.ride_name ?? undefined} format="ride"
          onClose={() => setCheer(null)} onComplete={(_, meta) => void finishCheer(meta)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, zIndex: 25, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(5, 52, 110, 0.9)', borderRadius: 18, borderWidth: 3, borderColor: '#fff',
    paddingVertical: 6, paddingLeft: 12, paddingRight: 8, minHeight: 46 },
  barBoss: { backgroundColor: '#3b1a5c' },
  barBossArt: { width: 34, height: 34 },
  barHeadline: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b' },
  barKicker: { fontFamily: 'Knockout', fontSize: 12, color: '#ff8a8a', letterSpacing: 0.6 },
  barTitle: { fontFamily: 'Shark', fontSize: 16, color: '#ffcf3b' },
  barGo: { fontFamily: 'Shark', fontSize: 16, color: '#ff7a7a' },
  chips: { flexDirection: 'row', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 3, paddingRight: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: 'transparent' },
  chipYours: { borderColor: '#fff' },
  chipBadge: { width: 22, height: 22 },
  chipCount: { fontFamily: 'Shark', fontSize: 16, color: '#fff', marginLeft: 2 },
  toast: { position: 'absolute', left: 24, right: 24, zIndex: 30, backgroundColor: '#ffcf3b', borderRadius: 14,
    borderWidth: 3, borderColor: '#fff', paddingVertical: 8, paddingHorizontal: 12 },
  toastText: { fontFamily: 'Shark', fontSize: 15, color: '#6a3b00', textAlign: 'center' },
  sheetModal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { backgroundColor: '#0768b9', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: '#fff',
    padding: 18, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 10 },
  title: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b', textAlign: 'center' },
  sub: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center', marginTop: 2 },
  standings: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12 },
  standing: { alignItems: 'center' },
  standingBadge: { width: 48, height: 48 },
  standingCount: { fontFamily: 'Shark', fontSize: 28, textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  standingLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#fff' },
  cta: { backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 4,
    borderBottomColor: '#d99a00', marginBottom: 10 },
  ctaText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
  cheerLine: { fontFamily: 'Knockout', fontSize: 14, color: '#fff', textAlign: 'center', marginBottom: 8 },
  nextBoss: { fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b', textAlign: 'center', marginTop: 4 },
  hint: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff', textAlign: 'center', marginBottom: 8 },
  empty: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center', marginVertical: 20 },
  park: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 10, marginBottom: 8, gap: 6 },
  parkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parkName: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: '#fff' },
  miniChips: { flexDirection: 'row', gap: 6 },
  miniChip: { fontFamily: 'Shark', fontSize: 14 },
  rush: { fontFamily: 'Knockout', fontSize: 13, color: '#ffe38a' },
  raidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#3b1a5c', borderRadius: 12, padding: 8 },
  raidArt: { width: 44, height: 44 },
  raidName: { fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b' },
  hpTrack: { marginTop: 3, height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: '#ef4444' },
  raidMeta: { marginTop: 2, fontFamily: 'Knockout', fontSize: 12, color: '#e9d9ff' },
  join: { fontFamily: 'Shark', fontSize: 16, color: '#ff7a7a' },
  cheerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 12, padding: 7 },
  flag: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  flagBadge: { width: 24, height: 24 },
  cheerRide: { fontFamily: 'Shark', fontSize: 15, color: '#fff' },
  cheerMeta: { fontFamily: 'Knockout', fontSize: 12, color: '#cdeaff' },
  cheerGo: { fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b' },
});
