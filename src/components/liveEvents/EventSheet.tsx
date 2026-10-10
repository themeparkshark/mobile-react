import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { EventChest, EventReward, LiveEvent, TeamKey } from '../../api/endpoints/live-events';
import { TEAMS, TEAM_ORDER } from '../../constants/teams';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { clockTime, frenzyLine, goalWord, openableKeys, nextStepHint, ordinal, rewardChips, starTimes, teamPlace, timeLine } from '../../services/liveEvents/model';
import { useOpenChest } from '../../services/liveEvents/useLiveEvent';
import { BRAND, GameIcon } from '../../ui';
import ChestReveal from './ChestReveal';
import ChestTrack from './ChestTrack';
import { eventArt, type EventArt } from './eventArt';

type Opened = { key: string; rewards: EventReward | null; already?: boolean; failed?: 'not_ready' | 'network' | false };

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

/** What a chest holds, shown under its track after a tap. */
function Peek({ chest, track }: { readonly chest: EventChest | null; readonly track: string }) {
  if (!chest) return null;
  const chips = rewardChips(chest.reward);
  return (
    <View style={styles.peek} accessible accessibilityLiveRegion="polite"
      accessibilityLabel={`${track} chest holds ${chips.map(c => (c.icon === 'gift' ? c.text : `${c.text} ${c.icon}`)).join(', ')}`}>
      <Text style={styles.peekLabel}>{chest.claimed ? 'Had' : 'Inside'}</Text>
      {chips.map((c, i) => (
        <View key={c.icon + i} style={styles.peekChip}>
          <GameIcon name={c.icon} size={20} />
          <Text style={styles.peekText} numberOfLines={1}>{c.icon === 'gift' ? c.text : c.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** Three pictures, three words each: what to do, what it fills, what you get. */
const HOW_TO_DEFAULT = ['Win and find', 'Fill the bar', 'Open chests'];

function HowTo({ art, steps }: { readonly art: EventArt; readonly steps: readonly { readonly text: string }[] }) {
  const words = [0, 1, 2].map(i => steps[i]?.text?.trim() || HOW_TO_DEFAULT[i]);
  const step = (picture: React.ReactNode, text: string, last = false) => (
    <>
      <View style={styles.step} accessible accessibilityLabel={text}>
        <View style={styles.stepArt}>{picture}</View>
        <Text style={styles.stepText}>{text}</Text>
      </View>
      {!last && <View style={styles.stepArrow}><GameIcon name="arrow" size={16} /></View>}
    </>
  );
  return (
    <View style={styles.howRow}>
      {step(<View style={styles.pair}><GameIcon name="coin" size={30} /><GameIcon name="ride" size={30} /></View>, words[0])}
      {step(<Image source={art.emblem} style={styles.stepImg} contentFit="contain" />, words[1])}
      {step(<Image source={art.chestOpen} style={styles.stepImg} contentFit="contain" />, words[2], true)}
    </View>
  );
}

/** "  ·  3 to pass" or "  ·  ahead by 3": makes 2nd feel winnable. Scores are points per player. */
function gapLine(scores: Readonly<Record<TeamKey, number>>, team: TeamKey, place: number): string {
  const mine = scores[team] ?? 0;
  const others = (Object.keys(scores) as TeamKey[]).filter(t => t !== team).map(t => scores[t] ?? 0);
  if (place === 1) {
    const next = Math.max(0, ...others);
    return mine > next ? `  ·  ahead by ${mine - next}` : '';
  }
  const above = Math.min(...others.filter(v => v > mine));
  return Number.isFinite(above) ? `  ·  ${above - mine + 1} to pass` : '';
}

/** Your team's last place seen per event (this app run), so a climb gets its moment once. */
const lastPlace = new Map<number, number>();

/** "UP TO 1st!": your team's row hops and a tag pops when your place improves. */
function RankBump({ place }: { readonly place: number }) {
  const reduced = useReducedGameMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    playSfx('star');
    haptic('success');
    t.value = reduced ? 1 : withSequence(withSpring(1, { damping: 7, stiffness: 260 }), withDelay(1800, withTiming(0.0001, { duration: 300 })));
  }, [place, reduced, t]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 1.5), transform: [{ scale: 0.6 + 0.4 * t.value }, { translateY: (1 - t.value) * 8 }] }));
  return <Animated.View style={[styles.bump, style]} pointerEvents="none"><Text style={styles.bumpText}>UP TO {ordinal(place).toUpperCase()}!</Text></Animated.View>;
}

function TeamRace({ event }: { readonly event: LiveEvent }) {
  const race = event.team_race!;
  const max = Math.max(1, ...Object.values(race.scores));
  const place = teamPlace(race.scores, event.me.team);
  const before = lastPlace.get(event.id);
  const climbed = place != null && before != null && place < before;
  useEffect(() => { if (place != null) lastPlace.set(event.id, place); }, [event.id, place]);
  const ended = event.phase === 'ended';
  const winner = race.winners.length === 1 ? race.winners[0] : null;
  const line = ended
    ? winner ? `${TEAMS[winner].name} won!` : race.winners.length ? 'A tie at the top!' : 'Race over'
    : place && event.me.team ? `${TEAMS[event.me.team].name}: ${ordinal(place)}${gapLine(race.scores, event.me.team, place)}` : event.me.team ? 'Help your team!' : '';
  return (
    <View>
      {TEAM_ORDER.map((team: TeamKey) => {
        const score = race.scores[team] ?? 0;
        const mine = event.me.team === team;
        const leads = race.leaders.includes(team);
        return (
          <View key={team} style={[styles.teamRow, mine && styles.teamMine]} accessible
            accessibilityLabel={`${TEAMS[team].name}${mine ? ', your team' : ''}${leads ? ', in the lead' : ''}`}>
            <Image source={TEAMS[team].badge} style={styles.crest} contentFit="contain" />
            <View style={styles.teamTrack}>
              <View style={[styles.teamFill, { width: `${Math.max(3, (score / max) * 100)}%`, backgroundColor: TEAMS[team].color }]} />
            </View>
            {mine && climbed && <RankBump place={place!} />}
            <View style={styles.teamTag}>
              {leads && score > 0 ? <GameIcon name="crown" size={22} /> : mine ? <Text style={styles.you}>YOU</Text> : null}
            </View>
          </View>
        );
      })}
      {!!line && <Text style={styles.line}>{line}</Text>}
    </View>
  );
}

/**
 * The event card: what to do (3 pictures), your chests, everyone's chests,
 * the team race, today's Star Rides and Frenzy. No point totals or tables up
 * front; grown-ups can open "How it works".
 */
function EventSheet({ event, visible, onClose, atPark, onShowRide, now = Date.now(), openOverride }: {
  readonly event: LiveEvent;
  readonly visible: boolean;
  readonly onClose: () => void;
  /** At an event park (Star Rides and park hints show). */
  readonly atPark: boolean;
  /** Point the map at a Star Ride (the sheet closes first). */
  readonly onShowRide?: (taskId: number) => void;
  readonly now?: number;
  /** Dev preview only: open without the server. */
  readonly openOverride?: (key: string) => Promise<EventReward | null>;
}) {
  const insets = useSafeAreaInsets();
  const art = eventArt(event.art_key);
  const [details, setDetails] = useState(false);
  const [peek, setPeek] = useState<{ track: 'me' | 'together'; chest: EventChest } | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const { open, opening } = useOpenChest();
  /** Every way out clears the reveal, so a reopened sheet never flashes an old one. */
  // The bottom fade shows only while there is more below.
  const [more, setMore] = useState(false);
  const viewH = useRef(0); const contentH = useRef(0); const scrollY = useRef(0);
  const updateMore = useCallback(() => {
    const next = contentH.current - (scrollY.current + viewH.current) > 24;
    setMore(m => (m === next ? m : next));
  }, []);
  // Live "+N" on everyone's bar when the shared total grows between refreshes (others playing right now).
  const [togetherTick, setTogetherTick] = useState<{ n: number; at: number } | null>(null);
  const lastTotal = useRef<{ total: number; mine: number } | null>(null);
  useEffect(() => {
    const prev = lastTotal.current;
    lastTotal.current = { total: event.together.total, mine: event.me.points };
    if (!prev) return;
    // Only what OTHER players added (your own points have their own toast).
    const others = (event.together.total - prev.total) - Math.max(0, event.me.points - prev.mine);
    if (others > 0) setTogetherTick({ n: others, at: Date.now() });
  }, [event.together.total, event.me.points]);
  const close = useCallback(() => { setOpened(null); setPeek(null); onClose(); }, [onClose]);
  const onOpen = useCallback(async (key: string) => {
    if (opening) return; // one open at a time (a double tap on Try again never sends two)
    haptic('tapLight');
    setOpened({ key, rewards: null });
    let rewards: EventReward | null = null;
    let already = false;
    let failed: 'not_ready' | 'network' = 'not_ready';
    if (openOverride) rewards = await openOverride(key);
    else {
      const result = await open(event.id, key);
      if ('error' in result) failed = result.error;
      else {
        rewards = result.rewards;
        already = result.already;
      }
    }
    if (!rewards) {
      playSfx('fail');
      setOpened({ key, rewards: null, failed });
      return;
    }
    setOpened({ key, rewards, already });
  }, [event.id, open, openOverride, opening]);

  const frenzy = frenzyLine(event);
  const hint = event.phase === 'live' ? nextStepHint(event, atPark && event.here) : null;
  const together = event.together;
  const live = event.phase === 'live';
  const showStars = atPark && event.here && live && event.star_rides.length > 0;
  const firstStar = showStarsFor(event, atPark, live) ? event.star_rides[0] : null;
  const readyCount = openableKeys(event).length; // the one count every surface uses
  const doNow: { icon: 'chest' | 'star' | 'ride' | 'coin'; text: string; go?: () => void } | null = readyCount > 0
    ? { icon: 'chest', text: readyCount === 1 ? 'Open your chest below' : `Open ${readyCount} chests below` }
    : !live ? null
      : firstStar ? { icon: 'star', text: `Win a Star Ride: x${starTimes(event)}`, go: onShowRide ? () => { close(); onShowRide(firstStar.task_id); } : undefined }
        : hint ? { icon: atPark && event.here ? 'ride' : 'coin', text: hint } : null;
  const nextFrenzy = live && atPark && event.here && !frenzy && event.frenzy.next_starts_at ? `Next Frenzy ${clockTime(event.frenzy.next_starts_at)}` : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close event" accessibilityRole="button" />
        <View style={[styles.sheet, { marginTop: insets.top + 24, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Image source={art.emblem} style={styles.headerEmblem} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} accessibilityRole="header">{event.title}</Text>
              <Text style={styles.when}>{timeLine(event, now)}</Text>
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <GameIcon name="close" size={26} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} scrollEventThrottle={64}
            onLayout={e => { viewH.current = e.nativeEvent.layout.height; updateMore(); }}
            onContentSizeChange={(_, h) => { contentH.current = h; updateMore(); }}
            onScroll={e => { scrollY.current = e.nativeEvent.contentOffset.y; updateMore(); }}>
            {doNow && (
              <View style={styles.doNow} accessible accessibilityLabel={`Next: ${doNow.text}`}>
                <GameIcon name={doNow.icon} size={30} />
                <Text style={styles.doNowText} numberOfLines={1}>{doNow.text}</Text>
                {doNow.go && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Go: ${doNow.text}`} onPress={doNow.go} style={styles.go} hitSlop={6}>
                    <Text style={styles.goText}>GO</Text>
                  </Pressable>
                )}
              </View>
            )}
            <HowTo art={art} steps={event.how_to} />
            {frenzy && (
              <View style={styles.frenzy} accessible accessibilityLabel={`Frenzy! ${frenzy}`}>
                <GameIcon name="rush" size={26} />
                <Text style={styles.frenzyText}>Frenzy! {frenzy}</Text>
              </View>
            )}
            <Section title="YOUR CHESTS">
              <ChestTrack chests={event.me.chests} value={event.me.points} art={art} onOpen={onOpen} opening={opening} label="Your chests"
                onPeek={chest => setPeek(p => (p?.chest.key === chest.key ? null : { track: 'me', chest }))} />
              <Peek chest={peek?.track === 'me' ? peek.chest : null} track="Your" />
              <Text style={styles.line}>{event.phase === 'upcoming' ? timeLine(event, now)
                : hint ?? (event.me.chests.every(c => c.claimed) ? 'All your chests opened!' : 'Open your chests!')}</Text>
              {live && !(atPark && event.here) && event.include_home && (event.daily_caps.home_find ?? 0) > 0 && (
                <Text style={styles.small}>At home: up to {event.daily_caps.home_find} snacks count each day. Rides count most!</Text>
              )}
            </Section>
            {together.chests.length > 0 && (
              <Section title={`EVERYONE'S ${goalWord(event).toUpperCase()}`}>
                <ChestTrack chests={together.chests} value={together.total} tick={togetherTick} art={art} onOpen={onOpen} opening={opening} label="Everyone's chests"
                  onPeek={chest => setPeek(p => (p?.chest.key === chest.key ? null : { track: 'together', chest }))} />
                <Peek chest={peek?.track === 'together' ? peek.chest : null} track="Everyone's" />
                <View style={styles.helpedRow}>
                  {event.me.helped ? <><GameIcon name="check" size={20} /><Text style={styles.line}>You helped!</Text></>
                    : <Text style={styles.line}>{together.min_personal <= 1 ? 'Win or find 1 time to share' : 'Play to share these'}</Text>}
                </View>
              </Section>
            )}
            {event.team_race && <Section title="TEAM RACE"><TeamRace event={event} /></Section>}
            {event.team_race?.claimable && (
              <Pressable accessibilityRole="button" onPress={() => onOpen('team')} style={styles.teamChest}>
                <Image source={art.chestClosed} style={styles.teamChestImg} contentFit="contain" />
                <Text style={styles.teamChestText}>{event.team_race.you_won ? 'Winner chest!' : 'Team chest!'}</Text>
                <View style={styles.openTag}><Text style={styles.openText}>OPEN</Text></View>
              </Pressable>
            )}
            {showStars && (
              <Section title="STAR RIDES TODAY">
                {event.star_rides.map(ride => (
                  <View key={ride.task_id} style={styles.starRow}>
                    <GameIcon name="star" size={26} />
                    <Text style={styles.starName} numberOfLines={1}>{ride.name}</Text>
                    <Text style={styles.x2}>x{starTimes(event)}</Text>
                    {onShowRide && (
                      <Pressable accessibilityRole="button" accessibilityLabel={`Show ${ride.name} on the map`} hitSlop={6}
                        onPress={() => { close(); onShowRide(ride.task_id); }} style={styles.show}>
                        <Text style={styles.showText}>SHOW</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
                {nextFrenzy && <Text style={styles.line}>{nextFrenzy}</Text>}
              </Section>
            )}
            <Pressable onPress={() => setDetails(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: details }} style={styles.detailsLink}>
              <GameIcon name="info" size={18} />
              <Text style={styles.detailsText}>How it works</Text>
            </Pressable>
            {details && (
              <View style={styles.details}>
                <Text style={styles.detail}>Ride win {event.points.ride_win} · Star Ride win {event.points.spotlight_win} · Snack find {event.points.home_find} (up to {event.daily_caps.home_find ?? 0} a day) · Boss hit {event.points.boss_hit} (up to {event.daily_caps.boss_hit ?? 0} a day).</Text>
                {event.frenzy.hours.length > 0 && <Text style={styles.detail}>Frenzy: park ride wins count double from {event.frenzy.hours.map(h => `${h.from} to ${h.to}`).join(' and ')}, park time.</Text>}
                <Text style={styles.detail}>Everyone's chests open for anyone who helped at least once.</Text>
                {event.team_race && <Text style={styles.detail}>Team race counts points per player, so a small team can win. Every team that helped gets a chest; the winner's is bigger.</Text>}
                <Text style={styles.detail}>Open chests until {new Date(event.claim_until).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.</Text>
              </View>
            )}
          </ScrollView>
          {/* More below: a soft cream fade at the bottom edge. */}
          {more && <LinearGradient pointerEvents="none" colors={['rgba(255,248,228,0)', BRAND.cream]} style={[styles.fade, { bottom: insets.bottom }]} />}
        </View>
        {opened && (
          <ChestReveal art={art} rewards={opened.rewards} onDone={() => setOpened(null)} already={opened.already} failed={opened.failed}
            onRetry={() => { void onOpen(opened.key); }}
            title={opened.key === 'team' ? (event.team_race?.you_won ? 'Your team won!' : 'Team chest') : 'You got'} />
        )}
      </View>
    </Modal>
  );
}

export default memo(EventSheet);

function showStarsFor(event: LiveEvent, atPark: boolean, live: boolean): boolean {
  return atPark && event.here && live && event.star_rides.length > 0;
}

const styles = StyleSheet.create({
  bump: { position: 'absolute', right: 44, top: -6, backgroundColor: BRAND.green, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, paddingHorizontal: 8, paddingVertical: 2, zIndex: 2 },
  bumpText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  doNow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.sky, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy,
    paddingVertical: 6, paddingLeft: 10, paddingRight: 6, minHeight: 56 },
  doNowText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  go: { backgroundColor: BRAND.gold, borderRadius: 12, borderWidth: 2.5, borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: BRAND.goldLip,
    paddingHorizontal: 14, paddingVertical: 6, minHeight: 44, justifyContent: 'center' },
  goText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  peek: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2 },
  peekLabel: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  peekChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy,
    paddingLeft: 3, paddingRight: 8, height: 30, maxWidth: 220 },
  peekText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy },
  scrim: { flex: 1, backgroundColor: BRAND.scrim, justifyContent: 'flex-end' },
  sheet: { flex: 1, backgroundColor: BRAND.cream, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 4, borderBottomWidth: 0,
    borderColor: BRAND.navy, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.blue, paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 3, borderBottomColor: BRAND.navy },
  headerEmblem: { width: 72, height: 72, marginVertical: -6 },
  title: { fontFamily: 'Shark', fontSize: 26, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  when: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.white },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 12, paddingBottom: 72 },
  fade: { position: 'absolute', left: 0, right: 0, height: 36 },
  howRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: BRAND.white, borderRadius: 20,
    borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 10, paddingHorizontal: 6 },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepArt: { height: 58, justifyContent: 'center', alignItems: 'center' },
  stepImg: { width: 58, height: 58 },
  pair: { flexDirection: 'row', gap: 2 },
  stepText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, textAlign: 'center' },
  stepArrow: { opacity: 0.6, marginTop: -18 },
  frenzy: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.gold, borderRadius: 16, borderWidth: 3, borderColor: BRAND.white,
    borderBottomWidth: 5, borderBottomColor: BRAND.goldLip, paddingVertical: 8, paddingHorizontal: 12 },
  frenzyText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  section: { backgroundColor: BRAND.white, borderRadius: 20, borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 10, paddingHorizontal: 12 },
  sectionTitle: { fontFamily: 'Shark', fontSize: 16, color: BRAND.blue, marginBottom: 2 },
  small: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft, textAlign: 'center', marginTop: 2 },
  line: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy, textAlign: 'center', marginTop: 4 },
  helpedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 12 },
  teamMine: { backgroundColor: BRAND.sky },
  crest: { width: 34, height: 34 },
  teamTrack: { flex: 1, height: 16, borderRadius: 8, backgroundColor: BRAND.creamDeep, borderWidth: 2.5, borderColor: BRAND.navy, overflow: 'hidden' },
  teamFill: { height: '100%' },
  teamTag: { width: 40, alignItems: 'center' },
  you: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  teamChest: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: BRAND.blueBright, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    paddingVertical: 6, paddingHorizontal: 12, minHeight: 56 },
  teamChestImg: { width: 44, height: 44 },
  teamChestText: { flex: 1, fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  openTag: { backgroundColor: BRAND.gold, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 4, borderBottomColor: BRAND.goldLip,
    paddingHorizontal: 10, paddingVertical: 3 },
  openText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, minHeight: 44 },
  starName: { flex: 1, fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy },
  x2: { fontFamily: 'Shark', fontSize: 15, color: BRAND.goldLip },
  show: { backgroundColor: BRAND.blue, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 4, borderBottomColor: BRAND.blueLip,
    paddingHorizontal: 10, paddingVertical: 4 },
  showText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  detailsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 },
  detailsText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, textDecorationLine: 'underline' },
  details: { gap: 6, paddingHorizontal: 6, paddingBottom: 10 },
  detail: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
});
