import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { cheerRide, getLiveParks, type HomeCheerTarget, type LiveParks, type LiveParkSummary } from '../../api/endpoints/me/livePark';
import { BOSS_NAMES } from '../../api/endpoints/parks/raid';
import { applyTeamNames, TEAM_ORDER, TEAMS, teamName, teamShortName } from '../../constants/teams';
import { AuthContext } from '../../context/AuthProvider';
import { WhackAShark } from '../../games/whack';
import * as RootNavigation from '../../RootNavigation';
import BossRaidFlow, { useParkRaid } from '../boss/BossRaidFlow';
import { BOSS_ART } from '../boss/bossArt';
import { BRAND, GameButton, GameIcon } from '../../ui';
import PushSoftAsk from '../PushSoftAsk';

const ORDER = TEAM_ORDER;

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
  const { raid, loaded: raidLoaded, setState: setRaidState } = useParkRaid(raidPark);

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

  useEffect(() => applyTeamNames(live?.team_names), [live?.team_names]);
  if (!live) return null;
  const names = live.team_names;
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
        ? `${teamName(c.team, names)} took ${c.ride_name}!`
        : `${c.ride_name} defended: +${c.points} for ${teamName(c.team, names)}!`);
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
              <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.barKicker} numberOfLines={1}>LIVE  ·  {liveRaid.name}</Text></View>
              <Text style={styles.barTitle} numberOfLines={1}>{BOSS_NAMES[liveRaid.raid.boss]}  ·  {clock(liveRaid.raid.ends_at, now)} left</Text>
            </View>
            <View style={styles.joinTag}><Text style={styles.joinTagText}>JOIN</Text></View>
          </>
        ) : (
          <>
            <Text style={styles.barHeadline} numberOfLines={1}>
              {leader ? `${teamName(leader, names).toUpperCase()} LEADS` : 'THE PARKS ARE UP FOR GRABS'}
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

      {toast && <View style={[styles.toast, { top: top + 60 }]} pointerEvents="none">
        <GameIcon name="check" size={22} /><Text style={styles.toastText}>{toast}</Text>
      </View>}

      <Modal isVisible={open} onBackdropPress={() => setOpen(false)} onSwipeComplete={() => setOpen(false)}
        swipeDirection="down" style={styles.sheetModal} backdropColor={BRAND.navy} backdropOpacity={0.35} propagateSwipe
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
                <Text style={styles.standingLabel}>{teamShortName(team, names)}{yours === team ? ' (you)' : ''}</Text>
              </View>
            ))}
          </View>
          {!yours ? (
            <GameButton label="Pick your team" style={{ marginBottom: 10 }}
              onPress={() => { setOpen(false); RootNavigation.navigate('TeamSelection', {}); }} />
          ) : (
            <View style={styles.cheerLineRow}>
              <GameIcon name="swords" size={20} />
              <Text style={styles.cheerLine}>
                {live.cheers_left > 0
                  ? `${live.cheers_left} defend${live.cheers_left === 1 ? '' : 's'} left today  ·  keep your team's rides from home`
                  : 'Out of defends today  ·  they reset tomorrow'}
              </Text>
            </View>
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
                      <View key={team} style={styles.miniChipRow}>
                        <Image source={TEAMS[team].badge} style={styles.miniBadge} contentFit="contain" />
                        <Text style={[styles.miniChip, { color: TEAMS[team].color }]}>{park.rides_held[team]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {park.rushes > 0 && <View style={styles.rushRow}><GameIcon name="rush" size={18} />
                  <Text style={styles.rush}>{park.rushes} ride{park.rushes === 1 ? '' : 's'} on Rush right now</Text></View>}
                {park.raid && new Date(park.raid.ends_at).getTime() > now && (
                  <Pressable style={styles.raidRow} accessibilityRole="button"
                    onPress={() => { pending.current = () => setRaidPark(park.park_id); setOpen(false); }}>
                    <Image source={BOSS_ART[park.raid.boss]} style={styles.raidArt} contentFit="contain" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.raidName} numberOfLines={1}>{BOSS_NAMES[park.raid.boss]} at {park.raid.ride_name}</Text>
                      <View style={styles.hpTrack}>
                        <View style={[styles.hpFill, { width: `${Math.max(2, (park.raid.hp_left / Math.max(1, park.raid.hp_max)) * 100)}%` }]} />
                      </View>
                      <Text style={styles.raidMeta}>{park.raid.fighters} fighting  ·  {clock(park.raid.ends_at, now)} left</Text>
                    </View>
                    <View style={styles.joinTag}><Text style={styles.joinTagText}>JOIN</Text></View>
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
                        {target.gap === 0 ? 'Tied: one cheer keeps it yours' : `Your team holds it  ·  only ${target.gap} ahead`}
                      </Text>
                    </View>
                    <Text style={[styles.cheerGo, live.cheers_left <= 0 && { opacity: 0.4 }]}>DEFEND</Text>
                    <GameIcon name="arrow" size={18} />
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <BossRaidFlow parkId={raidPark} raid={raidPark ? raid : null} open={raidPark !== null} loading={raidPark !== null && !raidLoaded}
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
    backgroundColor: BRAND.blue, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    paddingVertical: 6, paddingLeft: 12, paddingRight: 8, minHeight: 50,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  barBoss: { backgroundColor: BRAND.blueBright, paddingLeft: 6 },
  barBossArt: { width: 40, height: 40 },
  barHeadline: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND.red, borderWidth: 1.5, borderColor: BRAND.white },
  barKicker: { fontFamily: 'Knockout', fontSize: 12, color: '#e4f7ff', letterSpacing: 0.6 },
  barTitle: { fontFamily: 'Shark', fontSize: 16, color: BRAND.gold, textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  joinTag: { backgroundColor: BRAND.red, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 4,
    borderBottomColor: BRAND.redLip, paddingHorizontal: 9, paddingVertical: 3 },
  joinTagText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  chips: { flexDirection: 'row', gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 3, paddingRight: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: 'transparent' },
  chipYours: { borderColor: BRAND.white },
  chipBadge: { width: 22, height: 22 },
  chipCount: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginLeft: 2 },
  toast: { position: 'absolute', left: 24, right: 24, zIndex: 30, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 3, borderColor: BRAND.gold, paddingVertical: 8, paddingHorizontal: 12,
    shadowColor: BRAND.shadow, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  toastText: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, textAlign: 'center' },
  sheetModal: { justifyContent: 'flex-end', margin: 0 },
  sheet: { backgroundColor: BRAND.blue, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 4, borderColor: BRAND.white,
    padding: 18, paddingBottom: 40 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)', marginBottom: 10 },
  title: { fontFamily: 'Shark', fontSize: 28, color: BRAND.gold, textAlign: 'center', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  sub: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center', marginTop: 2 },
  standings: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 12 },
  standing: { alignItems: 'center' },
  standingBadge: { width: 48, height: 48 },
  standingCount: { fontFamily: 'Shark', fontSize: 28, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  standingLabel: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.white },
  cheerLineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 },
  cheerLine: { flexShrink: 1, fontFamily: 'Knockout', fontSize: 14, color: BRAND.white, textAlign: 'center' },
  nextBoss: { fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, textAlign: 'center', marginTop: 4 },
  hint: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff', textAlign: 'center', marginBottom: 8 },
  empty: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center', marginVertical: 20 },
  park: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 10, marginBottom: 8, gap: 6 },
  parkHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  parkName: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  miniChips: { flexDirection: 'row', gap: 6 },
  miniChipRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  miniBadge: { width: 16, height: 16 },
  miniChip: { fontFamily: 'Shark', fontSize: 14, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  rushRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rush: { fontFamily: 'Knockout', fontSize: 13, color: '#ffe38a' },
  raidRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.blueBright, borderWidth: 2, borderColor: BRAND.white,
    borderRadius: 12, padding: 8 },
  raidArt: { width: 46, height: 46 },
  raidName: { fontFamily: 'Shark', fontSize: 15, color: BRAND.gold },
  hpTrack: { marginTop: 3, height: 8, borderRadius: 4, backgroundColor: 'rgba(5,52,110,0.5)', overflow: 'hidden' },
  hpFill: { height: '100%', backgroundColor: BRAND.red },
  raidMeta: { marginTop: 2, fontFamily: 'Knockout', fontSize: 12, color: '#e4f7ff' },
  cheerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(5,52,110,0.2)', borderRadius: 12, padding: 7, minHeight: 48 },
  flag: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: BRAND.white },
  flagBadge: { width: 24, height: 24 },
  cheerRide: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  cheerMeta: { fontFamily: 'Knockout', fontSize: 12, color: '#cdeaff' },
  cheerGo: { fontFamily: 'Shark', fontSize: 15, color: BRAND.gold },
});
