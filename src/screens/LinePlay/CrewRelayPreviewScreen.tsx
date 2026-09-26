import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Topbar from '../../components/Topbar';
import TopbarText from '../../components/Topbar/TopbarText';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import Wrapper from '../../components/Wrapper';
import { colors, spacing } from '../../design-system';
import { getLinePlayChapter } from '../../services/lineplay/chapters';
import { createCrewRelay, crewRelayEpilogue } from '../../services/lineplay/crewRelay';
import { personalizeChapterFinale, resolveChapterClue } from '../../services/lineplay/chapterClue';
import { RhythmTapGame } from '../../games/rhythm';
import { SharkySwim } from '../../games/sharky';
import { MemoryGame } from '../../games/memory';
import { CurrentQuestGame } from '../../games/current-quest';
import SharkShowdown from '../../games/showdown/SharkShowdown';
import { LinePlayMovementContext } from '../../gamekit/LinePlayMovementContext';
import ActivitySlot from './components/ActivitySlot';
import ChapterCard from './components/ChapterCard';
import CrewRelayCard from './components/CrewRelayCard';
import CrewPuzzleCard from './components/CrewPuzzleCard';
import { SessionRecap } from './LinePlayScreen';
import type { RideCoinLevelType } from '../../models/ride-coin-level-type';
import type { CrewPuzzleSummary } from '../../api/endpoints/me/inline-timer/types';

const previewRide = process.env.EXPO_PUBLIC_CREW_RELAY_RIDE;
const previewEpisode = Number(process.env.EXPO_PUBLIC_CREW_RELAY_EPISODE ?? 1);
const previewInitialView = process.env.EXPO_PUBLIC_CREW_RELAY_INITIAL_VIEW === 'chapter' ? 'chapter'
  : process.env.EXPO_PUBLIC_CREW_RELAY_INITIAL_VIEW === 'trivia' ? 'trivia'
    : process.env.EXPO_PUBLIC_CREW_RELAY_INITIAL_VIEW === 'showdown' ? 'showdown'
    : process.env.EXPO_PUBLIC_CREW_RELAY_INITIAL_VIEW === 'finale' ? 'finale' : 'relay';
const previewRideName = previewRide === 'pirates' ? 'Pirates of the Caribbean'
  : previewRide === 'jungle' ? 'Jungle Cruise'
  : previewRide === 'dl-space' ? 'Space Mountain'
  : previewRide === 'mansion' ? 'Haunted Mansion'
    : previewRide === 'studio-tour' ? 'Studio Tour'
      : previewRide === 'river' ? 'River Journey' : 'Space Mountain';
const chapter = previewRide === 'pirates'
  ? getLinePlayChapter(8, 'pirates-of-the-caribbean-8', previewRideName)
  : previewRide === 'jungle'
    ? getLinePlayChapter(8, 'jungle-cruise-8', previewRideName)
  : previewRide === 'dl-space'
    ? getLinePlayChapter(8, 'space-mountain-8', previewRideName)
  : previewRide === 'mansion'
    ? getLinePlayChapter(2, 'haunted-mansion-2', previewRideName)
    : previewRide === 'studio-tour'
      ? getLinePlayChapter(1, 'studio-tour-1', previewRideName)
    : previewRide === 'river'
      ? getLinePlayChapter(99, 'river-journey-99', previewRideName,
          Number.isInteger(previewEpisode) && previewEpisode >= 0 && previewEpisode <= 2 ? previewEpisode : 1)
    : getLinePlayChapter(2, 'space-mountain-2', previewRideName);
const previewPuzzle: CrewPuzzleSummary = {
  route: 'route_a', stage: 2, total_stages: 3, completed: false, completed_at: null,
  total_guesses: 12, participants: 8, can_guess: true, seconds_until_guess: 0,
  needs_nearby_sample: false,
  recent_guesses: [{ stage: 2, symbols: [0, 2, 3], exact: 1, misplaced: 1, solved_stage: false }],
  last_result: null,
};

/** Development-only visual QA route, selected by EXPO_PUBLIC_CREW_RELAY_PREVIEW=1. */
export default function CrewRelayPreviewScreen() {
  const [progress, setProgress] = useState(() => createCrewRelay(12345));
  const [paused, setPaused] = useState(false);
  const [showPreviewControls, setShowPreviewControls] = useState(
    process.env.EXPO_PUBLIC_CREW_RELAY_SHOW_CONTROLS === '1');
  const [view, setView] = useState<'relay' | 'puzzle' | 'chapter' | 'trivia' | 'clue' | 'prediction' | 'finale' | 'quest' | 'showdown' | 'epilogue' | 'recap'>(previewInitialView);
  const [recapOwned, setRecapOwned] = useState(true);
  const [previewAnswered, setPreviewAnswered] = useState(false);
  const [previewClueCompleted, setPreviewClueCompleted] = useState(false);
  const [previewClueChoice, setPreviewClueChoice] = useState<number | null>(null);
  const [gameOpen, setGameOpen] = useState(
    process.env.EXPO_PUBLIC_CREW_RELAY_AUTO_OPEN_GAME === '1' &&
    (previewInitialView === 'finale' || previewInitialView === 'showdown'));
  const [epilogueDone, setEpilogueDone] = useState(false);
  const [finaleDone, setFinaleDone] = useState(false);
  if (!chapter) return null;
  const previewChapterClue = previewClueCompleted && previewClueChoice != null
    ? resolveChapterClue(chapter, 0, previewClueChoice) : null;
  const finaleItem = personalizeChapterFinale({
    kind: 'minigame', id: `${chapter.id}-${chapter.finale.idSuffix}`,
    gameId: chapter.finale.gameId ?? 'memory', seed: 2,
    title: chapter.finale.title, preview: chapter.finale.preview,
  }, chapter, previewChapterClue);
  const epilogue = crewRelayEpilogue(progress, chapter?.relay.epilogues);
  const epilogueItem = epilogue ? {
    kind: 'minigame' as const, id: `${chapter.id}-route-${epilogue.route}`,
    gameId: epilogue.gameId, seed: epilogue.seed,
    title: epilogue.title, preview: epilogue.prompt,
  } : null;
  const previewCoin: RideCoinLevelType = {
    id: 42, ride_id: 7, ride_name: previewRideName, coin_url: '',
    current_level: 1, max_level: 5, times_collected: 1, available_parts: 2,
    energy_to_next_level: 10, parts_to_next_level: 2, required_parts: [],
    player_level_required: 1, is_unlocked: true, current_perks: [],
    next_level_perks: [{ id: 1001, name: 'LinePlay Mastery',
      description: 'Earn one bonus Ride Part after your first verified Part at this ride each park day.',
      icon_url: '', type: 'bonus_parts', value: 1 }],
  };

  return (
    <Wrapper previewMode>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn>
          <Pressable onLongPress={() => setShowPreviewControls(value => !value)} accessibilityLabel="LinePlay preview controls">
            <TopbarText>LINEPLAY</TopbarText>
          </Pressable>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {showPreviewControls && <View style={styles.toolbar}>
        <Text style={styles.label}>{previewRide === 'mansion' ? 'MANSION PREVIEW' : previewRide === 'pirates' ? 'PIRATES PREVIEW' : previewRide === 'jungle' ? 'JUNGLE CRUISE PREVIEW' : previewRide === 'dl-space' ? 'DISNEYLAND SPACE PREVIEW' : previewRide === 'studio-tour' ? 'STUDIO TOUR PREVIEW' : previewRide === 'river' ? 'ADAPTIVE RIDE PREVIEW' : 'CREW RELAY PREVIEW'}</Text>
        <Pressable onPress={() => setPaused(value => !value)} accessibilityRole="button">
          <Text style={styles.action}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Pressable onPress={() => { setProgress(createCrewRelay(12345)); setView('relay');
          setEpilogueDone(false); setGameOpen(false); setPreviewAnswered(false);
          setPreviewClueCompleted(false); setPreviewClueChoice(null); setFinaleDone(false); }} accessibilityRole="button">
          <Text style={styles.action}>Reset</Text>
        </Pressable>
        <Pressable onPress={() => setView('recap')} accessibilityRole="button">
          <Text style={styles.action}>Recap</Text>
        </Pressable>
      </View>}
      {showPreviewControls && view === 'recap' && <View style={styles.toolbar}>
        <Pressable onPress={() => setRecapOwned(value => !value)} accessibilityRole="button">
          <Text style={styles.action}>{recapOwned ? 'Show missing coin' : 'Show owned coin'}</Text>
        </Pressable>
        <Pressable onPress={() => setView('relay')} accessibilityRole="button">
          <Text style={styles.action}>Back to relay</Text>
        </Pressable>
      </View>}
      {showPreviewControls && view !== 'recap' && <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.previewNav} contentContainerStyle={styles.previewNavContent}>
        {(['relay', 'puzzle', 'chapter', 'trivia', 'clue', 'prediction', 'finale', 'quest', 'showdown', ...(epilogue ? ['epilogue'] as const : [])] as const).map(option =>
          <Pressable key={option} onPress={() => setView(option)} accessibilityRole="button">
            <Text style={[styles.action, view === option && styles.selected]}>{option === 'prediction' ? 'PREDICT' : option.toUpperCase()}</Text>
          </Pressable>)}
      </ScrollView>}
      {view === 'recap' ? <SessionRecap
        elapsedSeconds={20 * 60} activityCount={3}
        activityNames={['Ride trivia', 'Crew relay', 'Memory Match']}
        earnedEnergy={0} experience={0} partsCount={2} ticketsEarned={0}
        masteryBonusParts={0} rewardsPending={false} rewardsConfirmed
        rewardTrackingAvailable resolution={null} predictionUnscored={false}
        crewPuzzle={null} crewRelay={progress.step === 'complete' ? progress : null}
        crewRouteNames={chapter.relay.routeNames}
        crewScoreNoun={chapter.relay.scoreNoun}
        coin={recapOwned ? previewCoin : null} coinState={recapOwned ? 'owned' : 'unowned'}
        playerEnergy={15} rideName={previewCoin.ride_name} parkAvailable
        onOpenCoin={() => {}} onOpenPark={() => {}} onDone={() => {}} />
        : view === 'puzzle' ? <CrewPuzzleCard puzzle={previewPuzzle} route="route_a"
          pending={false} retryPending={false} retrySymbols={null} paused={paused} error={null}
          bonusAvailable onGuess={() => {}} />
        : view === 'chapter' ? <ChapterCard chapter={chapter}
        completedIds={new Set([
          ...(previewAnswered ? [`${chapter.id}-trivia`] : []),
          ...(previewClueCompleted ? [`${chapter.id}-field-note`] : []),
          ...(finaleDone ? [`${chapter.id}-${chapter.finale.idSuffix}`] : []),
          ...(epilogueDone && epilogueItem ? [epilogueItem.id] : []),
        ])}
        crewRelay={progress} chapterClue={previewChapterClue} paused={paused}
        onChooseMission={(id) => setView(id.endsWith('-trivia') ? 'trivia'
          : id.endsWith('-field-note') ? 'clue' : 'finale')} />
        : view === 'trivia' ? <View style={styles.activityPreview}><ActivitySlot
          item={{ kind: 'trivia', id: `${chapter.id}-trivia`, seed: 0 }}
          chapterId={chapter.id} completed={previewAnswered} paused={paused}
          onPlayGame={() => {}} onPredict={() => {}}
          onActivityCompleted={() => setPreviewAnswered(true)} /></View>
        : view === 'clue' ? <View style={styles.activityPreview}><ActivitySlot
          item={{ kind: 'lore', id: `${chapter.id}-field-note`, seed: 0 }}
          chapterId={chapter.id} completed={previewClueCompleted} paused={paused}
          savedLoreChoice={previewClueChoice}
          onPlayGame={() => {}} onPredict={() => {}}
          onChooseLore={(_id, choice) => setPreviewClueChoice(choice < 0 ? null : choice)}
          onActivityCompleted={() => setPreviewClueCompleted(true)} /></View>
        : view === 'prediction' ? <View style={styles.activityPreview}><ActivitySlot
          item={{ kind: 'prediction', id: 'pred-final', card: {
            id: 'preview-wait', postedWaitMinutes: 45,
            prompt: 'The entrance board says 45 minutes. Will your crew reach boarding sooner?',
            options: ['beat', 'miss'],
          } }} paused={paused} onPlayGame={() => {}} onPredict={() => {}}
          onActivityCompleted={() => {}} /></View>
        : view === 'finale' ? <View style={styles.activityPreview}><ActivitySlot
          item={finaleItem}
          completed={finaleDone} paused={paused}
          onPlayGame={() => setGameOpen(true)} onPredict={() => {}} onActivityCompleted={() => {}} /></View>
        : view === 'quest' ? <View style={styles.activityPreview}><ActivitySlot
          item={{ kind: 'minigame', id: 'preview-current-quest', gameId: 'current', seed: 314159 }}
          paused={paused} onPlayGame={() => setGameOpen(true)} onPredict={() => {}}
          onActivityCompleted={() => {}} /></View>
        : view === 'showdown' ? <View style={styles.activityPreview}><ActivitySlot
          item={{ kind: 'minigame', id: 'preview-shark-showdown', gameId: 'showdown', seed: 314159 }}
          paused={paused} onPlayGame={() => setGameOpen(true)} onPredict={() => {}}
          onActivityCompleted={() => {}} /></View>
        : view === 'epilogue' && epilogueItem ? <ActivitySlot item={epilogueItem}
          paused={paused} completed={epilogueDone}
          onPlayGame={() => setGameOpen(true)} onPredict={() => {}} onActivityCompleted={() => {}} />
        : <CrewRelayCard chapter={chapter} progress={progress} paused={paused} onChange={setProgress} />}
      <LinePlayMovementContext.Provider value={{ moving: paused, onResume: () => setPaused(false) }}>
        {gameOpen && view === 'finale' && finaleItem.kind === 'minigame' && finaleItem.gameId === 'memory' &&
          <MemoryGame visible seed={finaleItem.seed}
          deckId={chapter.finale.memoryDeckId} taskName={previewCoin.ride_name}
          onClose={() => setGameOpen(false)} onComplete={() => { setFinaleDone(true); setGameOpen(false); }} />}
        {gameOpen && view === 'finale' && finaleItem.kind === 'minigame' && finaleItem.gameId === 'timing' &&
          <RhythmTapGame visible seed={finaleItem.seed}
            onClose={() => setGameOpen(false)} onComplete={() => { setFinaleDone(true); setGameOpen(false); }} />}
        {gameOpen && view === 'finale' && finaleItem.kind === 'minigame' && finaleItem.gameId === 'shark' &&
          <SharkySwim visible seed={finaleItem.seed}
            onClose={() => setGameOpen(false)} onComplete={() => { setFinaleDone(true); setGameOpen(false); }} />}
        {gameOpen && view === 'quest' && <CurrentQuestGame visible seed={314159}
          taskName={previewCoin.ride_name} onClose={() => setGameOpen(false)}
          onComplete={() => setGameOpen(false)} />}
        {gameOpen && view === 'showdown' && <SharkShowdown visible seed={314159}
          chapterId={chapter.id} rideName={previewCoin.ride_name}
          onClose={() => setGameOpen(false)} onComplete={() => setGameOpen(false)} />}
        {gameOpen && view === 'epilogue' && epilogue?.gameId === 'timing' && <RhythmTapGame visible seed={epilogue.seed}
          onClose={() => setGameOpen(false)} onComplete={() => { setEpilogueDone(true); setGameOpen(false); }} />}
        {gameOpen && view === 'epilogue' && epilogue?.gameId === 'shark' && <SharkySwim visible seed={epilogue.seed}
          onClose={() => setGameOpen(false)} onComplete={() => { setEpilogueDone(true); setGameOpen(false); }} />}
      </LinePlayMovementContext.Provider>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgDark },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  action: { color: colors.tertiary, fontSize: 14, fontWeight: '700' },
  selected: { color: colors.textPrimary },
  previewNav: { flexGrow: 0 },
  previewNavContent: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm },
  activityPreview: { flex: 1, paddingHorizontal: spacing.md },
});
