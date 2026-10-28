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
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import useUiReducedMotion from '../../../ui/useUiReducedMotion';
import type { LinePlayChapter } from '../../../services/lineplay/chapters';
import { crewRelayEpilogue, type CrewRelayProgress } from '../../../services/lineplay/crewRelay';
import type { ChapterClue } from '../../../services/lineplay/chapterClue';
import { chapterKicker, chapterPageKicker } from '../../../services/lineplay/labels';
import { borderRadius, spacing } from '../../../design-system';
import { BRAND, GameIcon } from '../../../ui';
import { chapterPageFit, chapterPlayNow, foldGap, STRIP_TRAIL_GAP as STRIP_TRAIL_GAP_PT, STRIP_TRAIL_ROW, stripDotsFit, stripTrailFits,
} from '../../../services/lineplay/lineLayout';
import ClueDots from './ClueDots';
import { SPACE_NAVIGATOR_ART } from '../spaceNavigatorArt';
import PageScroll from './PageScroll';
import KidText from './KidText';

interface Props {
  readonly chapter: LinePlayChapter;
  readonly completedIds: ReadonlySet<string>;
  readonly crewRelay: CrewRelayProgress | null;
  /** "Who's in line?" said 2 or more: only then the Crew Relay tile and the Crew Prompts link show (core loop 5.5). */
  readonly crew?: boolean;
  readonly chapterClue?: ChapterClue | null;
  /** Paused by hand (or counting back in): the buttons rest in pale blue but still act (the 3 2 1, then the page). */
  readonly paused: boolean;
  /**
   * The wait is not running and cannot be resumed from here (just detected, ending or complete):
   * every mission button is off and looks off, so no live-looking button ever does nothing.
   */
  readonly locked?: boolean;
  readonly signalAvailable?: boolean;
  readonly onChooseMission: (id: string) => void;
  /**
   * A short phone (iPhone SE): a one-line mission header and a slimmer PLAY NOW,
   * so the clue a kid taps next is fully on screen without scrolling.
   */
  readonly compact?: boolean;
  /**
   * The page's scroll height as the screen measured it in the same frame the window changed size
   * (Details opening or closing). The page picks its layout from it at once, so no frame shows the
   * old layout cut by the new window. Its own measurement is used until the screen has one.
   */
  readonly windowHeight?: number;
}

// Reduced motion: no entering animation at all. (A springified entering
// with the System reduce-motion mode left the blocks invisible on iOS with Reduce
// Motion on.)
const riseFor = (reduced: boolean) => (index: number) => reduced ? undefined
  : FadeInDown.delay(60 + index * 70).springify().damping(15);

/** Why a locked chapter cannot start, in seven-year-old words. */
export const LOCKED_LINE = 'Get in line to play';

export default function ChapterCard({ chapter, completedIds, crewRelay, crew = false, chapterClue = null, paused, locked = false, signalAvailable = false, onChooseMission, compact: shortScreen = false, windowHeight }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  // The page's real height decides what leads (it shrinks while Details is open), so PLAY NOW
  // is always whole: never a button cut by the frame's edge.
  const [measuredHeight, setViewHeight] = useState(0);
  const viewHeight = windowHeight != null && windowHeight > 0 ? windowHeight : measuredHeight;
  // The first screen ends on whole blocks: the crew row starts below the window when it would peek.
  // Block sizes are kept per layout (full or compact), because Details switching the layout would
  // otherwise leave the last layout's numbers in place for a few frames.
  const [trailBottomSeen, setTrailBottom] = useState(0);
  const [trailHeights, setTrailHeights] = useState<Partial<Record<string, number>>>({});
  // The bottom of the two lead blocks (PLAY NOW and the header): the trail starts below the window when it would peek too.
  const [leadBottoms, setLeadBottoms] = useState<Partial<Record<string, number>>>({});
  const [crewHeight, setCrewHeight] = useState(0);
  const fit = chapterPageFit(viewHeight, shortScreen);
  const compact = fit !== 'full';
  const leadBottom = leadBottoms[fit] ?? 0;
  const trailHeight = trailHeights[fit] ?? 0;
  const setLeadBottom = (bottom: number) => setLeadBottoms(seen => seen[fit] === bottom ? seen : { ...seen, [fit]: bottom });
  const trailGap = foldGap(viewHeight, leadBottom, trailHeight, compact ? TRAIL_GAP_COMPACT : TRAIL_GAP);
  // The crew row's offset is worked out from the same window height in the same render: the trail sits
  // right under the lead blocks, so its bottom is lead + gap + height. No frame waits for the trail's
  // own layout, so closing Details never shows the crew row's top edge under the bubbles.
  const trailBottom = leadBottom > 0 && trailHeight > 0 ? leadBottom + trailGap + trailHeight : trailBottomSeen;
  // Blocks rise in once, when the page first opens. A later layout switch (Details opening
  // or closing changes what leads) just shows the blocks, never replays the entrance.
  const entered = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { entered.current = true; }, 900);
    return () => clearTimeout(timer);
  }, []);
  const reducedUi = useUiReducedMotion();
  const rise = riseFor(reducedUi || entered.current);
  const epilogue = crewRelay ? crewRelayEpilogue(crewRelay, chapter.relay.epilogues) : null;
  const epilogueDone = epilogue ? completedIds.has(`${chapter.id}-route-${epilogue.route}`) : false;
  // The same pick the rail uses to skip this target, so its Next never opens what PLAY NOW opens.
  const { id: nextId, name: nextName, done } = chapterPlayNow(chapter, completedIds);
  const missionIds = [`${chapter.id}-trivia`, `${chapter.id}-field-note`, `${chapter.id}-${chapter.finale.idSuffix}`];
  const nextMissionIndex = missionIds.indexOf(nextId);
  const relayId = `${chapter.id}-crew-relay`;
  const relayDone = completedIds.has(relayId);
  const crewGridId = `${chapter.id}-crew-grid`;
  // Locked: plain words (nothing to resume) and an off state; paused: the tap resumes first.
  const playVerb = !locked && paused ? 'Resume and play' : done === 3 ? 'Play' : 'Start';
  const off = { accessibilityState: { disabled: locked } } as const;
  // Locked never means a dead tap: the button gives a small no-shake and a soft buzz, and its own line says why.
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const choose = (id: string) => {
    if (!locked) { onChooseMission(id); return; }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    if (reducedUi) return;
    shake.value = withSequence(withTiming(-7, { duration: 50 }), withTiming(7, { duration: 70 }),
      withTiming(-4, { duration: 60 }), withTiming(0, { duration: 60 }));
  };

  const header = (
    <Animated.View key="header" entering={rise(compact ? 1 : 0)} style={[styles.header, compact && styles.headerCompact]}
      onLayout={event => { if (compact) setLeadBottom(layoutBottom(event)); }}>
      {/* One name per idea: while clues are left, the header is the park and the shark, never the story's name
          (The Lost Star Chart next to Rebuild the star chart read as two names for one thing). The missions
          below are the only names. Finished, it celebrates with the completed line. */}
      <View style={styles.headerCopy}>
        {done === 3 ? <>
          <KidText style={[styles.kicker, compact && styles.kickerCompact]} numberOfLines={1}
            adjustsFontSizeToFit minimumFontScale={0.8} accessibilityLabel={chapterKicker(chapter)}>{chapterPageKicker(chapter)}</KidText>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={compact ? 1 : undefined}
            adjustsFontSizeToFit={compact} minimumFontScale={0.8}>{chapter.completedTitle}</Text>
        </> : <KidText style={[styles.title, styles.parkTitle, compact && styles.titleCompact]} numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.7} accessibilityLabel={chapterKicker(chapter)}>{chapterPageKicker(chapter)}</KidText>}
      </View>
      <Image source={chapter.navigationPanel
        ? SPACE_NAVIGATOR_ART
        : require('../../../../assets/images/screens/pin-collections/shark.png')}
        resizeMode="contain" style={[styles.shark, compact && styles.sharkCompact]} accessibilityLabel="Theme Park Shark mascot" />
    </Animated.View>
  );
  const playNow = (
    <Animated.View key="play-now" entering={rise(compact ? 0 : 1)} style={compact && styles.playFirst}
      onLayout={event => { if (!compact) setLeadBottom(layoutBottom(event)); }}>
      <Animated.View style={shakeStyle}><Pressable accessibilityRole="button"
        accessibilityLabel={locked ? `${nextName}. ${LOCKED_LINE}` : `${playVerb} ${nextName}`} {...off}
        onPress={() => choose(nextId)}
        style={({ pressed }) => [styles.playNow, compact && styles.playNowCompact, paused && styles.playResting, locked && styles.lockedPlay, pressed && styles.pressed]}>
        <View style={styles.playNowCopy}>
          {/* No count here: the numbered bubbles below own it (one count per screen). PLAY, the same
              word as the SE strip, so every phone size says one word for one idea. */}
          <KidText style={[styles.playNowKicker, locked && styles.lockedKicker]}>{locked ? 'LOCKED' : done === 3 ? 'KEEP THE WAIT FUN' : 'PLAY'}</KidText>
          <Text style={[styles.playNowTitle, locked && styles.lockedText]}>{nextName}</Text>
          {locked ? <Text style={[styles.playNowHint, styles.lockedText]}>{LOCKED_LINE}</Text>
            : !compact && <Text style={styles.playNowHint}>One phone · play solo or with your crew</Text>}
        </View>
        <View style={locked && styles.lockWell}><GameIcon name={locked ? 'lock' : 'play'} size={locked ? (compact ? 30 : 36) : compact ? 48 : 56} /></View>
      </Pressable></Animated.View>
    </Animated.View>
  );

  const measure = (event: { nativeEvent: { layout: { height: number } } }) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height !== measuredHeight) setViewHeight(height);
  };

  // A very short page (an iPhone SE): the page is one PLAY row that fits whole. It always reads
  // "PLAY <clue name>"; the clue count is the bubbles, never a "CLUE 1" number in the strip.
  if (fit === 'strip') {
    // Room for the 1 2 3 bubbles under the strip (a closed iPhone SE page): they fill the window.
    // Too short for them (Details open): the strip grows to fill its window (no empty pale band)
    // and carries the same 3 bubbles, small, under its name.
    const withTrail = stripTrailFits(viewHeight);
    const dotsInStrip = !withTrail && stripDotsFit(viewHeight);
    return (
      <PageScroll fill={FRAME_FILL} contentStyle={[styles.contentStrip, withTrail && styles.contentStripTrail]}
        onLayout={measure} still>
        <Animated.View style={[shakeStyle, !withTrail && styles.playStripFill]}><Pressable accessibilityRole="button"
          accessibilityLabel={locked ? `${nextName}. ${LOCKED_LINE}` : `${playVerb} ${nextName}`} {...off}
          onPress={() => choose(nextId)}
          style={({ pressed }) => [styles.playStrip, !withTrail && styles.playStripFill, paused && styles.playResting, locked && styles.lockedPlay, pressed && styles.pressed]}>
          <View style={styles.playStripCopy}>
            <Text style={[styles.playStripText, locked && styles.lockedText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              <Text style={[styles.playStripKicker, locked && styles.lockedKicker]}>{locked ? 'LOCKED  ' : 'PLAY  '}</Text>{locked ? LOCKED_LINE : nextName}
            </Text>
            {dotsInStrip && <ClueDots size={16} onGold current={done === 3 ? -1 : nextMissionIndex}
              done={missionIds.map(id => completedIds.has(id))} accessibilityLabel={`${done} of 3 ${chapter.progressNoun}`} />}
          </View>
          <View style={locked && styles.lockWellSmall}><GameIcon name={locked ? 'lock' : 'play'} size={locked ? 26 : 40} /></View>
        </Pressable></Animated.View>
        {withTrail && <View style={styles.stripTrail} accessibilityLabel={`${done} of 3 ${chapter.progressNoun}`}>
          {chapter.missionNames.map((name, index) => {
            const complete = completedIds.has(missionIds[index]);
            const current = index === nextMissionIndex;
            return <Pressable key={name} accessibilityRole="button"
              accessibilityLabel={`${complete ? 'Replay' : 'Open'} ${name}`} {...off}
              onPress={() => choose(missionIds[index])}
              style={({ pressed }) => [styles.step, styles.stepStrip, current && styles.stepCurrent, complete && styles.stepDone,
                paused && styles.missionPaused, locked && styles.locked, pressed && styles.pressed]}>
              <View style={[styles.stepBadge, styles.stepBadgeStrip, current && !complete && styles.stepBadgeCurrent, complete && styles.stepBadgeDone]}>
                {complete ? <GameIcon name="check" size={18} /> : <Text style={[styles.stepNumber, styles.stepNumberStrip, current && styles.stepNumberCurrent]}>{index + 1}</Text>}
              </View>
            </Pressable>;
          })}
        </View>}
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
      <Animated.View entering={rise(2)} style={[styles.trail, compact && styles.trailCompact,
        { marginTop: trailGap }]}
        onLayout={event => {
          setTrailBottom(layoutBottom(event));
          const height = Math.round(event.nativeEvent.layout.height);
          setTrailHeights(seen => seen[fit] === height ? seen : { ...seen, [fit]: height });
        }}
        accessibilityLabel={`${done} of 3 ${chapter.progressNoun}`}>
        {chapter.missionNames.map((name, index) => {
          const complete = completedIds.has(missionIds[index]);
          const current = index === nextMissionIndex;
          return <Pressable key={name} accessibilityRole="button"
            accessibilityLabel={`${complete ? 'Replay' : 'Open'} ${name}`} {...off}
            onPress={() => choose(missionIds[index])}
            style={({ pressed }) => [styles.step, compact && styles.stepCompact, current && styles.stepCurrent, complete && styles.stepDone,
              paused && styles.missionPaused, locked && styles.locked, pressed && styles.pressed]}>
            <View style={[styles.stepBadge, current && !complete && styles.stepBadgeCurrent, complete && styles.stepBadgeDone]}>
              {complete ? <GameIcon name="check" size={22} /> : <Text style={[styles.stepNumber, current && styles.stepNumberCurrent]}>{index + 1}</Text>}
            </View>
            {!compact && <Text style={styles.stepName} numberOfLines={3}>{name}</Text>}
          </Pressable>;
        })}
      </Animated.View>

      {(crew || signalAvailable) && <Animated.View entering={rise(3)} style={[styles.crewRow, { marginTop: foldGap(viewHeight, trailBottom, crewHeight, CREW_ROW_GAP) }]}
        onLayout={event => setCrewHeight(Math.round(event.nativeEvent.layout.height))}>
        {/* A solo wait never meets a crew page (its tile would open a page that is not there). */}
        {crew && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${chapter.relay.title}`} {...off}
          onPress={() => choose(relayId)}
          style={({ pressed }) => [styles.crewChip, paused && styles.missionPaused, locked && styles.locked, pressed && styles.pressed]}>
          <GameIcon name={relayDone ? 'check' : 'shark'} size={30} />
          <View style={styles.crewChipCopy}>
            <Text style={styles.crewChipTitle}>CREW RELAY</Text>
            <Text style={styles.crewChipBody} numberOfLines={1}>{relayDone ? 'Your crew story is in the recap' : 'Four turns, one phone'}</Text>
          </View>
        </Pressable>}
        {signalAvailable && <Pressable accessibilityRole="button" accessibilityLabel="Open community Crew Route" {...off}
          onPress={() => choose('crew-signal')}
          style={({ pressed }) => [styles.crewChip, styles.crewChipBlue, paused && styles.missionPaused, locked && styles.locked, pressed && styles.pressed]}>
          <GameIcon name="map" size={30} />
          <View style={styles.crewChipCopy}>
            <Text style={[styles.crewChipTitle, styles.onBlue]}>CREW ROUTE</Text>
            <Text style={[styles.crewChipBody, styles.onBlueSoft]} numberOfLines={1}>Fans here pick a bonus round</Text>
          </View>
        </Pressable>}
      </Animated.View>}

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
      {crew && <Pressable accessibilityRole="button" accessibilityLabel="Open Crew Prompts" {...off}
        onPress={() => choose(crewGridId)} style={[styles.promptsLink, locked && styles.locked]}>
        <GameIcon name={completedIds.has(crewGridId) ? 'check' : 'sparkle'} size={22} />
        <Text style={styles.promptsText}>Crew Prompts: nine talk-and-notice prompts for the end of your wait</Text>
      </Pressable>}
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
const TRAIL_GAP = spacing.md;
const TRAIL_GAP_COMPACT = spacing.sm;
const STRIP_TRAIL_GAP = STRIP_TRAIL_GAP_PT;
const layoutBottom = (event: { nativeEvent: { layout: { y: number; height: number } } }) =>
  Math.round(event.nativeEvent.layout.y + event.nativeEvent.layout.height);

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
  parkTitle: { marginTop: 0 },
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
  contentStripTrail: { gap: STRIP_TRAIL_GAP },
  stripTrail: { flexDirection: 'row', gap: 8 },
  stepStrip: { minHeight: 0, height: STRIP_TRAIL_ROW, paddingVertical: 0, padding: 0, justifyContent: 'center' },
  stepBadgeStrip: { width: 30, height: 30, borderRadius: 15 },
  stepNumberStrip: { fontSize: 15 },
  playStripText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 19, lineHeight: 23 },
  // Details open on an iPhone SE: the strip fills its window (a big gold button, no pale band).
  playStripFill: { flexGrow: 1, maxHeight: 112 },
  playStripCopy: { flex: 1, gap: 4 },
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
  // The clue a kid is on is a gold bubble, the same as the rail's and the strip's mini bubbles.
  stepBadgeCurrent: { backgroundColor: BRAND.gold },
  stepNumberCurrent: { color: BRAND.navy },
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
  // Paused: the clue buttons rest (still live: one tap runs the 3 2 1, then opens the page).
  missionPaused: { opacity: 0.7 },
  // Off (the wait is not running): the small buttons rest at 60% on their own pale fill (never gold at
  // low opacity over blue, which read as olive). A tap shakes the PLAY button and buzzes, never opens.
  locked: { opacity: 0.6 },
  // The big PLAY when locked: a solid pale blue-white strip, navy words, a lock in a navy ring, and its reason.
  lockedPlay: { backgroundColor: '#eef6fd', borderColor: '#7d9cbc' },
  lockedText: { color: 'rgba(5,52,110,0.6)' },
  lockedKicker: { color: 'rgba(5,52,110,0.6)' },
  lockWell: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderWidth: 3, borderColor: '#7d9cbc', marginRight: 4 },
  lockWellSmall: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#7d9cbc', marginRight: 4 },
  // Paused PLAY rests like the paused ARCADE: pale blue with a navy outline, never a faded olive gold.
  playResting: { backgroundColor: '#e8f6ff', borderColor: '#0b4f8a' },
  footer: { color: '#376888', fontFamily: 'Knockout', fontSize: 13, lineHeight: 18, marginTop: spacing.md },
});
