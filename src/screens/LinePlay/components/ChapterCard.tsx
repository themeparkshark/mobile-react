/**
 * The ride chapter's opening page. Above the fold there are at most four
 * blocks: the chapter hero, one big PLAY NOW, the three-step mission trail,
 * and the crew row. The story, the clue that changed the finale and the crew
 * ending sit below for anyone who wants them. Everything is one thumb and
 * glanceable while shuffling forward in line.
 *
 * Blocks rise in with a short stagger (reduced motion: they are just there).
 */
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import useUiReducedMotion from '../../../ui/useUiReducedMotion';
import type { LinePlayChapter } from '../../../services/lineplay/chapters';
import { crewRelayEpilogue, type CrewRelayProgress } from '../../../services/lineplay/crewRelay';
import type { ChapterClue } from '../../../services/lineplay/chapterClue';
import { chapterKicker } from '../../../services/lineplay/labels';
import { borderRadius, shadows, spacing } from '../../../design-system';
import { BRAND, GameIcon } from '../../../ui';
import { SPACE_NAVIGATOR_ART } from '../spaceNavigatorArt';

interface Props {
  readonly chapter: LinePlayChapter;
  readonly completedIds: ReadonlySet<string>;
  readonly crewRelay: CrewRelayProgress | null;
  readonly chapterClue?: ChapterClue | null;
  readonly paused: boolean;
  readonly signalAvailable?: boolean;
  readonly onChooseMission: (id: string) => void;
}

// Reduced motion: no entering animation at all. (A springified entering
// with the System reduce-motion mode left the blocks invisible on iOS with Reduce
// Motion on.)
const riseFor = (reduced: boolean) => (index: number) => reduced ? undefined
  : FadeInDown.delay(60 + index * 70).springify().damping(15);

export default function ChapterCard({ chapter, completedIds, crewRelay, chapterClue = null, paused, signalAvailable = false, onChooseMission }: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  const rise = riseFor(useUiReducedMotion());
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

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.card}>
      <Animated.View entering={rise(0)} style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{chapterKicker(chapter)}</Text>
          <Text style={styles.title}>{done === 3 ? chapter.completedTitle : chapter.title}</Text>
        </View>
        <Image source={chapter.navigationPanel
          ? SPACE_NAVIGATOR_ART
          : require('../../../../assets/images/screens/pin-collections/shark.png')}
          resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </Animated.View>

      <Animated.View entering={rise(1)}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${done === 3 ? 'Play' : 'Start'} ${nextName}`}
          disabled={paused} onPress={() => onChooseMission(nextId)}
          style={({ pressed }) => [styles.playNow, paused && styles.missionPaused, pressed && styles.pressed]}>
          <View style={styles.playNowCopy}>
            <Text style={styles.playNowKicker}>{done === 3 ? 'KEEP THE WAIT FUN' : `CLUE ${done + 1} OF 3 · PLAY NOW`}</Text>
            <Text style={styles.playNowTitle}>{nextName}</Text>
            <Text style={styles.playNowHint}>One phone · play solo or with your crew</Text>
          </View>
          <GameIcon name="play" size={56} />
        </Pressable>
      </Animated.View>

      <Animated.View entering={rise(2)} style={styles.trail}
        accessibilityLabel={`${done} of 3 ${chapter.progressNoun}`}>
        {chapter.missionNames.map((name, index) => {
          const complete = completedIds.has(missionIds[index]);
          const current = index === nextMissionIndex;
          return <Pressable key={name} accessibilityRole="button"
            accessibilityLabel={`${complete ? 'Replay' : 'Open'} ${name}`}
            disabled={paused} onPress={() => onChooseMission(missionIds[index])}
            style={({ pressed }) => [styles.step, current && styles.stepCurrent, complete && styles.stepDone,
              paused && styles.missionPaused, pressed && styles.pressed]}>
            <View style={[styles.stepBadge, complete && styles.stepBadgeDone]}>
              {complete ? <GameIcon name="check" size={22} /> : <Text style={styles.stepNumber}>{index + 1}</Text>}
            </View>
            <Text style={styles.stepName} numberOfLines={3}>{name}</Text>
          </Pressable>;
        })}
      </Animated.View>

      <Animated.View entering={rise(3)} style={styles.crewRow}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  card: { margin: spacing.md, padding: spacing.md, borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#bcecff', ...shadows.lg },
  header: { flexDirection: 'row', minHeight: 100, alignItems: 'center', backgroundColor: BRAND.blueBright,
    borderRadius: 16, borderWidth: 3, borderColor: BRAND.navy, paddingLeft: 14, overflow: 'hidden' },
  headerCopy: { flex: 1, zIndex: 1 },
  shark: { width: 108, height: 108, marginRight: -14 },
  kicker: { color: '#d4f1ff', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 23, lineHeight: 27, marginTop: 4,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  playNow: { flexDirection: 'row', alignItems: 'center', minHeight: 96, marginTop: spacing.md,
    paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.sm, borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 6, backgroundColor: BRAND.gold },
  playNowCopy: { flex: 1, paddingRight: spacing.sm },
  playNowKicker: { color: '#7c4200', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.8 },
  playNowTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 21, lineHeight: 25, marginTop: 3 },
  playNowHint: { color: '#385670', fontFamily: 'Knockout', fontSize: 14, marginTop: 3 },
  pressed: { transform: [{ scale: 0.97 }] },
  trail: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  step: { flex: 1, minHeight: 104, alignItems: 'center', padding: 8, borderRadius: 16, borderWidth: 3,
    borderColor: '#ffffff', backgroundColor: '#e7f8ff' },
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
