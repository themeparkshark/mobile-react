import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CrewGridCard from './components/CrewGridCard';
import ChapterCard from './components/ChapterCard';
import SignalCard from './components/SignalCard';
import WaitCard from './components/WaitCard';
import ActivityPageRail from './components/ActivityPageRail';
import ActivitySlot from './components/ActivitySlot';
import NewRoundsBanner from './components/NewRoundsBanner';
import { generateEncoreRounds } from '../../services/lineplay/LinePlaySession';
import { getLinePlayChapterById } from '../../services/lineplay/chapters';
import type { LineSignalSummary } from '../../api/endpoints/me/inline-timer/types';

/** Development-only visual check of the same grid used in LinePlay. */
export default function CrewGridPreviewScreen() {
  const countdownPreview = __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_COUNTDOWN_PREVIEW === '1';
  const [marks, setMarks] = useState<number[]>([]);
  const [paused, setPaused] = useState(false);
  const [creditedParts, setCreditedParts] = useState(countdownPreview ? 0 : 1);
  const [verifiedAt, setVerifiedAt] = useState(() => Date.now());
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!countdownPreview) return;
    const timer = setInterval(() => setClockTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [countdownPreview]);
  const [page, setPage] = useState<'intro' | 'grid' | 'signal' | 'encore'>('intro');
  const [encoreAdded, setEncoreAdded] = useState(false);
  const [showExpansion, setShowExpansion] = useState(false);
  const [route, setRoute] = useState<'route_a' | 'route_b' | null>(null);
  const chapter = getLinePlayChapterById('mk-space-mountain');
  const signal: LineSignalSummary = {
    park_day: '2026-09-24', community_target: 3, participants: route ? 2 : 1,
    route_a_count: route === 'route_a' ? 2 : 1,
    route_b_count: route === 'route_b' ? 1 : 0,
    unlocked_route: null, player_choice: route, can_choose: route == null,
    solo_route: route, seconds_until_eligible: 0, seconds_until_solo: 0, puzzle: null,
  };
  const completed = [[0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
    .some(line => line.every(index => marks.includes(index)));
  const toggle = (index: number) => setMarks(previous => previous.includes(index)
    ? previous.filter(mark => mark !== index) : [...previous, index]);
  const pageIndex = page === 'intro' ? 0 : page === 'grid' ? 1 : page === 'signal' ? 2 : 3;
  const nextPage = page === 'intro' ? 'grid' : page === 'grid' ? 'signal'
    : page === 'signal' && encoreAdded ? 'encore' : 'intro';
  const encore = generateEncoreRounds(22, 413)[0];
  return <SafeAreaView style={styles.root}>
    <View style={styles.toolbar}>
      <Text style={styles.heading}>LINEPLAY FIRST MINUTE PREVIEW</Text>
      <Pressable accessibilityRole="button" onPress={() => setPage(value => value === 'intro' ? 'grid' : value === 'grid' ? 'signal' : value === 'signal' && encoreAdded ? 'encore' : 'intro')}>
        <Text style={styles.action}>{page === 'intro' ? 'Show Bingo' : page === 'grid' ? 'Show route' : page === 'signal' && encoreAdded ? 'Show encore' : 'Show entry'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setPaused(value => !value)}>
        <Text style={styles.action}>{paused ? 'Resume line' : 'Line moving'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setShowExpansion(value => !value)}>
        <Text style={styles.action}>{showExpansion ? 'Hide update' : 'Wait grew'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => {
        setCreditedParts(value => Math.min(3, value + 1));
        setVerifiedAt(Date.now());
      }}>
        <Text style={styles.action}>Part earned</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => {
        setMarks([]);
        setCreditedParts(countdownPreview ? 0 : 1);
        setVerifiedAt(Date.now());
      }}>
        <Text style={styles.action}>Reset</Text>
      </Pressable>
    </View>
    <View style={styles.waitWrap}>
      <WaitCard rideName="Space Mountain" postedWaitMinutes={35} waitSource="posted"
        entranceWaitMinutes={35} entranceWaitObservedAt={Date.now()}
        entranceWaitChangeMinutes={0} elapsedSeconds={countdownPreview
          ? (creditedParts === 0 ? 590 : creditedParts * 600) : 720 + (creditedParts - 1) * 600}
        paused={paused} pauseReason={paused ? 'manual' : null}
        onTogglePause={() => setPaused(value => !value)} rewardTrackingAvailable rewardUnavailable={false}
        verifiedEligibleSeconds={countdownPreview
          ? (creditedParts === 0 ? 590 : creditedParts * 600) : 720 + (creditedParts - 1) * 600}
        verifiedPresenceAt={countdownPreview ? verifiedAt : null}
        creditedParts={creditedParts} partsRemainingToday={12 - creditedParts}
        partIntervalSeconds={600} sessionPartCap={4} ticketIntervalSeconds={1200}
        ticketAvailable masteryBonusAvailable={false} />
    </View>
    {showExpansion && <NewRoundsBanner count={8} paused={paused}
      onJump={() => { setEncoreAdded(true); setPage('encore'); setShowExpansion(false); }} />}
    <View style={styles.activity}>
    {page === 'intro' && chapter
      ? <ChapterCard chapter={chapter} completedIds={new Set()} crewRelay={null} paused={paused}
          signalAvailable onChooseMission={(id) => {
            if (id.endsWith('-crew-grid')) setPage('grid');
            if (id === 'crew-signal') setPage('signal');
          }} />
      : page === 'encore'
      ? <ActivitySlot item={encore} rideId={1} parkId={2} paused={paused}
          onPlayGame={() => {}} onPredict={() => {}} onActivityCompleted={() => {}} />
      : page === 'signal'
      ? <SignalCard signal={signal} pending={false} paused={paused} error={null}
          onChoose={setRoute} onPlayUnlocked={() => {}} />
      : <CrewGridCard rideName="Space Mountain" chapterTitle="The Lost Star Chart"
          seed={4721} marks={marks} completed={completed} paused={paused} onToggle={toggle} />}
    </View>
    <ActivityPageRail index={pageIndex} count={encoreAdded ? 4 : 3}
      nextLabel={nextPage === 'grid' ? 'Crew Bingo' : nextPage === 'encore' ? 'Sharky Swim' : 'Crew Route'}
      onFirst={() => setPage('intro')} onNext={() => setPage(nextPage)}
      moreAvailable={!encoreAdded} morePaused={paused}
      onMore={() => { setEncoreAdded(true); setPage('encore'); }} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a74c8' },
  toolbar: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0a74c8',
    flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  heading: { color: '#fff', fontFamily: 'Knockout', fontSize: 17, width: '100%' },
  action: { color: '#ffda44', fontFamily: 'Knockout', fontSize: 16, paddingVertical: 6 },
  waitWrap: { paddingHorizontal: 12, paddingVertical: 7 },
  activity: { flex: 1 },
});
