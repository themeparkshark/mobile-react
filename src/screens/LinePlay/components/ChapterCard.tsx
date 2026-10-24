/**
 * The ride chapter's opening page. Above the fold there are at most four
 * blocks: the chapter hero, one big PLAY NOW, the three-step mission trail,
 * and the crew row. The story, the clue that changed the finale and the crew
 * ending sit below for anyone who wants them. Everything is one thumb and
 * glanceable while shuffling forward in line.
 *
 * Blocks rise in with a short stagger (reduced motion: they are just there).
 */
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import useUiReducedMotion from '../../../ui/useUiReducedMotion';
import type { LinePlayChapter } from '../../../services/lineplay/chapters';
import { crewRelayEpilogue, type CrewRelayProgress } from '../../../services/lineplay/crewRelay';
import type { ChapterClue } from '../../../services/lineplay/chapterClue';
import { chapterKicker, chapterPageKicker } from '../../../services/lineplay/labels';
import { borderRadius, spacing } from '../../../design-system';
import { BRAND, GameIcon } from '../../../ui';
import { chapterPageFit, foldGap } from '../../../services/lineplay/lineLayout';
import { SPACE_NAVIGATOR_ART } from '../spaceNavigatorArt';
import PageScroll from './PageScroll';
import KidText from './KidText';

interface Props {
  readonly chapter: LinePlayChapter;
  readonly completedIds: ReadonlySet<string>;
  readonly crewRelay: CrewRelayProgress | null;
  readonly chapterClue?: ChapterClue | null;
  readonly paused: boolean;
  readonly signalAvailable?: boolean;
  readonly onChooseMission: (id: string) => void;
  /**
   * A short phone (iPhone SE): a one-line mission header and a slimmer PLAY NOW,
   * so the clue a kid taps next is fully on screen without scrolling.
   */
  readonly compact?: boolean;
}

// Reduced motion: no entering animation at all. (A springified entering
// with the System reduce-motion mode left the blocks invisible on iOS with Reduce
// Motion on.)
const riseFor = (reduced: boolean) => (index: number) => reduced ? undefined
  : FadeInDown.delay(60 + index * 70).springify().damping(15);

export default function ChapterCard({ chapter, completedIds, crewRelay, chapterClue = null, paused, signalAvailable = false, onChooseMission, compact: shortScreen = false }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  // The page's real height decides what leads (it shrinks while Details is open), so PLAY NOW
  // is always whole: never a button cut by the frame's edge.
  const [viewHeight, setViewHeight] = useState(0);
  // The first screen ends on whole blocks: the crew row starts below the window when it would peek.
  const [trailBottom, setTrailBottom] = useState(0);
  const [crewHeight, setCrewHeight] = useState(0);
  const fit = chapterPageFit(viewHeight, shortScreen);
  const compact = fit !== 'full';
  // Blocks rise in once, when the page first opens. A later layout switch (Details opening
  // or closing changes what leads) just shows the blocks, never replays the entrance.
  const entered = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { entered.current = true; }, 900);
    return () => clearTimeout(timer);
  }, []);
  const rise = riseFor(useUiReducedMotion() || entered.current);
  const epilogue = crewRelay ? crewRelayEpilogue(crewRelay, chapter.relay.epilogues) : null;
  const epilogueDone = epilogue ? completedIds.has(`${chapter.id}-route-${epilogue.route}`) : false;
  const missionIds = [
    `${chapter.id}-trivia`,
    `${chapter.id}-field-note`,
    `${chapter.id}-${chapter.finale.idSuffix}`,
  ];
  const done = missionIds.filter((id) => completedIds.has(id)).length;
  const nextMissionIndex = missionIds.findIndex((id) => !completedIds.has(id));
  const relayId = `${chapter.id}-crew-relay`;
  const relayDone = completedIds.has(relayId);
  const crewGridId = `${chapter.id}-crew-grid`;
  const nextId = nextMissionIndex >= 0 ? missionIds[nextMissionIndex] : relayDone ? crewGridId : relayId;
  const nextName = nextMissionIndex >= 0 ? chapter.missionNames[nextMissionIndex]
    : relayDone ? 'Crew Prompts' : chapter.relay.title;

  const header = (
    <Animated.View key="header" entering={rise(compact ? 1 : 0)} style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.headerCopy}>
        <KidText style={[styles.kicker, compact && styles.kickerCompact]} numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.8} accessibilityLabel={chapterKicker(chapter)}>{chapterPageKicker(chapter)}</KidText>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={compact ? 1 : undefined}
          adjustsFontSizeToFit={compact} minimumFontScale={0.8}>
          {done === 3 ? chapter.completedTitle : chapter.title}
        </Text>
      </View>
      <Image source={chapter.navigationPanel
        ? SPACE_NAVIGATOR_ART
        : require('../../../../assets/images/screens/pin-collections/shark.png')}
        resizeMode="contain" style={[styles.shark, compact && styles.sharkCompact]} accessibilityLabel="Theme Park Shark mascot" />
    </Animated.View>
  );
  const playNow = (
    <Animated.View key="play-now" entering={rise(compact ? 0 : 1)} style={compact && styles.playFirst}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${done === 3 ? 'Play' : 'Start'} ${nextName}`}
        disabled={paused} onPress={() => onChooseMission(nextId)}
        style={({ pressed }) => [styles.playNow, compact && styles.playNowCompact, paused && styles.missionPaused, pressed && styles.pressed]}>
        <View style={styles.playNowCopy}>
          {/* No count here: the numbered bubbles below own it (one count per screen). */}
          <KidText style={styles.playNowKicker}>{done === 3 ? 'KEEP THE WAIT FUN' : 'PLAY NOW'}</KidText>
          <Text style={styles.playNowTitle}>{nextName}</Text>
          {!compact && <Text style={styles.playNowHint}>One phone · play solo or with your crew</Text>}
        </View>
        <GameIcon name="play" size={compact ? 48 : 56} />
      </Pressable>
    </Animated.View>
  );

  const measure = (event: { nativeEvent: { layout: { height: number } } }) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height !== viewHeight) setViewHeight(height);
  };

  // A very short page (an iPhone SE with Details open): the page is just one PLAY NOW row that fits whole.
  if (fit === 'strip') {
    return (
      <PageScroll fill={FRAME_FILL} contentStyle={styles.contentStrip} onLayout={measure} still>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${done === 3 ? 'Play' : 'Start'} ${nextName}`}
          disabled={paused} onPress={() => onChooseMission(nextId)}
          style={({ pressed }) => [styles.playStrip, paused && styles.missionPaused, pressed && styles.pressed]}>
          <Text style={styles.playStripText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            <Text style={styles.playStripKicker}>{done === 3 ? 'PLAY' : 'CLUE '}{done === 3 ? null
              : <Text style={styles.playStripDigit}>{done + 1}</Text>}{'  '}</Text>{nextName}
          </Text>
          <GameIcon name="play" size={40} />
        </Pressable>
      </PageScroll>
    );
  }

  return (
    <PageScroll fill={FRAME_FILL} contentStyle={compact && styles.contentCompact} onLayout={measure}>
      {/* A short phone (iPhone SE) puts the clue to play first, fully on screen; the mission header follows.
          Keyed, so when the first layout switches the order mid-entrance each block MOVES with its own
          animation; it is never morphed into the other block and left half faded. */}
      {compact ? <>{playNow}{header}</> : <>{header}{playNow}</>}
      {/* Compact: just the numbered bubbles (names stay in the spoken label), so the row ends whole
          above the fade instead of small labels dissolving into it. */}
      <Animated.View entering={rise(2)} style={[styles.trail, compact && styles.trailCompact]}
        onLayout={event => setTrailBottom(Math.round(event.nativeEvent.layout.y + event.nativeEvent.layout.height))}
        accessibilityLabel={`${done} of 3 ${chapter.progressNoun}`}>
        {chapter.missionNames.map((name, index) => {
          const complete = completedIds.has(missionIds[index]);
          const current = index === nextMissionIndex;
          return <Pressable key={name} accessibilityRole="button"
            accessibilityLabel={`${complete ? 'Replay' : 'Open'} ${name}`}
            disabled={paused} onPress={() => onChooseMission(missionIds[index])}
            style={({ pressed }) => [styles.step, compact && styles.stepCompact, current && styles.stepCurrent, complete && styles.stepDone,
              paused && styles.missionPaused, pressed && styles.pressed]}>
            <View style={[styles.stepBadge, complete && styles.stepBadgeDone]}>
              {complete ? <GameIcon name="check" size={22} /> : <Text style={styles.stepNumber}>{index + 1}</Text>}
            </View>
            {!compact && <Text style={styles.stepName} numberOfLines={3}>{name}</Text>}
          </Pressable>;
        })}
      </Animated.View>

      <Animated.View entering={rise(3)} style={[styles.crewRow, { marginTop: foldGap(viewHeight, trailBottom, crewHeight, CREW_ROW_GAP) }]}
        onLayout={event => setCrewHeight(Math.round(event.nativeEvent.layout.height))}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${chapter.relay.title}`}
          disabled={paused} onPress={() => onChooseMission(relayId)}
          style={({ pressed }) => [styles.crewChip, paused && styles.missionPaused, pressed && styles.pressed]}>
          <GameIcon name={relayDone ? 'check' : 'shark'} size={30} />
          <View style={styles.crewChipCopy}>
            <Text style={styles.crewChipTitle}>CREW RELAY</Text>
            <Text style={styles.crewChipBody} numberOfLines={1}>{relayDone ? 'Your crew story is in the recap' : 'Four turns, one phone'}</Text>
          </View>
        </Pressable>
        {signalAvailable && <Pressable accessibilityRole="button" accessibilityLabel="Open community Crew Route"
          disabled={paused} onPress={() => onChooseMission('crew-signal')}
          style={({ pressed }) => [styles.crewChip, styles.crewChipBlue, paused && styles.missionPaused, pressed && styles.pressed]}>
          <GameIcon name="map" size={30} />
          <View style={styles.crewChipCopy}>
            <Text style={[styles.crewChipTitle, styles.onBlue]}>CREW ROUTE</Text>
            <Text style={[styles.crewChipBody, styles.onBlueSoft]} numberOfLines={1}>Fans here pick a bonus round</Text>
          </View>
        </Pressable>}
      </Animated.View>

      {/* Below the fold: the story, the clue that changed the finale, the crew ending. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: storyOpen }}
        accessibilityLabel={storyOpen ? 'Hide the chapter story' : 'Read the chapter story'}
        onPress={() => setStoryOpen(value => !value)} style={styles.storyToggle}>
        <GameIcon name="info" size={24} />
        <Text style={styles.storyToggleText}>{storyOpen ? 'Hide the story' : 'Read the story'}</Text>
      </Pressable>
      {storyOpen && <Text style={styles.story}>{done === 3 ? chapter.completedStory : chapter.story}</Text>}

      {chapterClue && <View style={styles.clueBadge}>
        <Text style={styles.clueKicker}>YOUR CLUE CHANGED THE FINALE</Text>
        <Text style={styles.clueText}>{chapterClue.noteTitle}: {chapterClue.choiceLabel}. The finale now uses your crew’s signal.</Text>
      </View>}
      {epilogue && <View style={styles.branch}>
        <Text style={styles.branchKicker}>{chapter.relay.branchKicker}</Text>
        <View style={styles.branchTitleRow}>
          {epilogueDone && <GameIcon name="check" size={20} />}
          <Text style={styles.branchTitle}>{epilogue.title}</Text>
        </View>
        <Text style={styles.story}>{epilogueDone
          ? chapter.relay.branchDone
          : `${epilogue.prompt} Swipe past the relay to play the new round.`}</Text>
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open Crew Prompts"
        disabled={paused} onPress={() => onChooseMission(crewGridId)} style={styles.promptsLink}>
        <GameIcon name={completedIds.has(crewGridId) ? 'check' : 'sparkle'} size={22} />
        <Text style={styles.promptsText}>Crew Prompts: nine talk-and-notice prompts for the end of your wait</Text>
      </Pressable>
      <Text style={styles.footer}>
        {chapter.adaptive
          ? 'Keep playing as the line moves. The shark story is made up. The trivia is about parks in general.'
          : 'Keep playing as the line moves. The shark story is made up. We checked the ride facts on the park’s own website.'}
      </Text>
    </PageScroll>
  );
}

/** The chapter page's light-blue frame (the fade above the rail ends in this color). */
const FRAME_FILL = '#bcecff';
const CREW_ROW_GAP = spacing.md;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', minHeight: 100, alignItems: 'center', backgroundColor: BRAND.blueBright,
    borderRadius: 16, borderWidth: 3, borderColor: BRAND.navy, paddingLeft: 14, overflow: 'hidden' },
  headerCompact: { minHeight: 0, height: 58 },
  headerCopy: { flex: 1, zIndex: 1 },
  shark: { width: 108, height: 108, marginRight: -14 },
  sharkCompact: { width: 64, height: 64, marginRight: -8 },
  kicker: { color: '#d4f1ff', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  kickerCompact: { fontSize: 12, letterSpacing: 0.6 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 23, lineHeight: 27, marginTop: 4,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  titleCompact: { fontSize: 19, lineHeight: 22, marginTop: 1 },
  playNow: { flexDirection: 'row', alignItems: 'center', minHeight: 96, marginTop: spacing.md,
    paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.sm, borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 6, backgroundColor: BRAND.gold },
  playNowCompact: { minHeight: 64, marginTop: 0, paddingVertical: 6 },
  playFirst: { marginTop: 0, marginBottom: spacing.sm },
  contentCompact: { paddingTop: 6 },
  // The strip sits in the middle of its frame, like a button on a tray, whatever room is left.
  contentStrip: { flexGrow: 1, justifyContent: 'center', padding: 5, paddingBottom: 5 },
  playStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 12, paddingRight: 4,
    paddingVertical: 1, borderRadius: borderRadius.lg, borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 5,
    backgroundColor: BRAND.gold },
  playStripText: { flex: 1, color: BRAND.navy, fontFamily: 'Shark', fontSize: 19, lineHeight: 23 },
  playStripDigit: { fontFamily: 'Shark', fontSize: 15 },
  playStripKicker: { color: '#7c4200', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.8 },
  playNowCopy: { flex: 1, paddingRight: spacing.sm },
  playNowKicker: { color: '#7c4200', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.8 },
  playNowTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 21, lineHeight: 25, marginTop: 3 },
  playNowHint: { color: '#385670', fontFamily: 'Knockout', fontSize: 14, marginTop: 3 },
  pressed: { transform: [{ scale: 0.97 }] },
  trail: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  step: { flex: 1, minHeight: 104, alignItems: 'center', padding: 8, borderRadius: 16, borderWidth: 3,
    borderColor: '#ffffff', backgroundColor: '#e7f8ff' },
  trailCompact: { marginTop: spacing.sm },
  stepCompact: { minHeight: 0, paddingVertical: 5 },
  stepCurrent: { borderColor: BRAND.gold, backgroundColor: '#fff8d6' },
  stepDone: { backgroundColor: '#e3f7e3', borderColor: '#bfe8c3' },
  stepBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.navy },
  stepBadgeDone: { backgroundColor: '#ffffff' },
  stepNumber: { color: '#fff', fontFamily: 'Shark', fontSize: 17, marginTop: 2 },
  stepName: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 14, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  crewRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  crewChip: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10,
    borderRadius: 16, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.cream },
  crewChipBlue: { backgroundColor: BRAND.blueBright },
  crewChipCopy: { flex: 1 },
  crewChipTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 15 },
  crewChipBody: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 13 },
  onBlue: { color: '#ffffff' },
  onBlueSoft: { color: '#d9f0ff' },
  storyToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: spacing.md },
  storyToggleText: { color: BRAND.blue, fontFamily: 'Knockout', fontSize: 16 },
  story: { color: '#153e67', fontFamily: 'Knockout', fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  clueBadge: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#ffca30', backgroundColor: '#fff6d0' },
  clueKicker: { color: '#a86500', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.5 },
  clueText: { color: '#153e67', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19, marginTop: spacing.xs },
  branch: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#ffcb2e', backgroundColor: '#fff6d0' },
  branchKicker: { color: '#a86500', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.6 },
  branchTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  branchTitle: { color: '#143c67', fontFamily: 'Shark', fontSize: 17 },
  promptsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginTop: spacing.md },
  promptsText: { flex: 1, color: BRAND.blue, fontFamily: 'Knockout', fontSize: 15, lineHeight: 19 },
  missionPaused: { opacity: 0.45 },
  footer: { color: '#376888', fontFamily: 'Knockout', fontSize: 13, lineHeight: 18, marginTop: spacing.md },
});
