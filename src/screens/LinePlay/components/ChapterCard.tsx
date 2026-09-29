import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LinePlayChapter } from '../../../services/lineplay/chapters';
import { crewRelayEpilogue, type CrewRelayProgress } from '../../../services/lineplay/crewRelay';
import type { ChapterClue } from '../../../services/lineplay/chapterClue';
import { borderRadius, colors, shadows, spacing } from '../../../design-system';

interface Props {
  readonly chapter: LinePlayChapter;
  readonly completedIds: ReadonlySet<string>;
  readonly crewRelay: CrewRelayProgress | null;
  readonly chapterClue?: ChapterClue | null;
  readonly paused: boolean;
  readonly signalAvailable?: boolean;
  readonly onChooseMission: (id: string) => void;
}

export default function ChapterCard({ chapter, completedIds, crewRelay, chapterClue = null, paused, signalAvailable = false, onChooseMission }: Props) {
  const epilogue = crewRelay ? crewRelayEpilogue(crewRelay, chapter.relay.epilogues) : null;
  const epilogueDone = epilogue ? completedIds.has(`${chapter.id}-route-${epilogue.route}`) : false;
  const missionIds = [
    `${chapter.id}-trivia`,
    `${chapter.id}-field-note`,
    `${chapter.id}-${chapter.finale.idSuffix}`,
  ];
  const done = missionIds.filter((id) => completedIds.has(id)).length;
  const nextMissionIndex = missionIds.findIndex((id) => !completedIds.has(id));
  const crewGridId = `${chapter.id}-crew-grid`;
  const nextId = nextMissionIndex >= 0 ? missionIds[nextMissionIndex] : crewGridId;
  const nextName = nextMissionIndex >= 0 ? chapter.missionNames[nextMissionIndex] : 'Crew Bingo';
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>SHARK FAN MISSION · {chapter.parkLabel}</Text>
          <Text style={styles.title}>{done === 3 ? chapter.completedTitle : chapter.title}</Text>
        </View>
        <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
          resizeMode="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      </View>
      <Pressable accessibilityRole="button"
        accessibilityLabel={`${done === 3 ? 'Play' : 'Start'} ${nextName}`}
        disabled={paused} onPress={() => onChooseMission(nextId)}
        style={[styles.playNow, paused && styles.missionPaused]}>
        <View style={styles.playNowCopy}>
          <Text style={styles.playNowKicker}>{done === 3 ? 'KEEP THE WAIT FUN' : `CLUE ${done + 1} OF 3 · PLAY NOW`}</Text>
          <Text style={styles.playNowTitle}>{nextName}</Text>
          <Text style={styles.playNowHint}>One phone · play solo or with your crew</Text>
        </View>
        <View style={styles.playNowArrow}><Text style={styles.playNowArrowText}>▶</Text></View>
      </Pressable>
      <Text style={styles.story}>
        {done === 3 ? chapter.completedStory : chapter.story}
      </Text>
      {chapterClue && <View style={styles.clueBadge}>
        <Text style={styles.clueKicker}>YOUR CLUE CHANGED THE FINALE</Text>
        <Text style={styles.clueText}>{chapterClue.noteTitle}: {chapterClue.choiceLabel}. The memory finale now uses your crew’s signal.</Text>
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel="Open one-phone Crew Bingo"
        disabled={paused} onPress={() => onChooseMission(crewGridId)}
        style={[styles.gridLink, paused && styles.missionPaused]}>
        <Text style={styles.gridTitle}>
          {completedIds.has(crewGridId) ? '✓ ' : '✦ '}CREW BINGO
        </Text>
        <Text style={styles.gridDescription}>Nine quick prompts. Complete any line during your wait. No extra walking or photos.</Text>
        <Text style={styles.gridArrow}>PLAY TOGETHER OR SOLO  →</Text>
      </Pressable>
      {signalAvailable && <Pressable accessibilityRole="button" accessibilityLabel="Open community Crew Route"
        disabled={paused} onPress={() => onChooseMission('crew-signal')}
        style={[styles.signalLink, paused && styles.missionPaused]}>
        <Text style={styles.signalTitle}>CREW ROUTE  →</Text>
        <Text style={styles.signalDescription}>Fans at this ride can choose a shared bonus round.</Text>
      </Pressable>}
      <View style={styles.progress}>
        <Text style={styles.progressCount}>{done}/3 {chapter.progressNoun}</Text>
        {chapter.missionNames.map((name, index) => (
          <Pressable key={name} accessibilityRole="button"
            accessibilityLabel={`${completedIds.has(missionIds[index]) ? 'Replay' : 'Open'} ${name}`}
            disabled={paused} onPress={() => onChooseMission(missionIds[index])}
            style={[styles.missionButton, paused && styles.missionPaused]}>
            <Text style={styles.mission}>
              {completedIds.has(missionIds[index]) ? '✓' : String(index + 1)}  {name}
            </Text>
            <Text style={styles.missionArrow}>→</Text>
          </Pressable>
        ))}
      </View>
      {epilogue && <View style={styles.branch}>
        <Text style={styles.branchKicker}>{chapter.relay.branchKicker}</Text>
        <Text style={styles.branchTitle}>{epilogueDone ? '✓ ' : ''}{epilogue.title}</Text>
        <Text style={styles.story}>{epilogueDone
          ? chapter.relay.branchDone
          : `${epilogue.prompt} Swipe past the relay to play the new round.`}</Text>
      </View>}
      <Text style={styles.footer}>
        {chapter.adaptive
          ? 'The optional Crew Relay and Crew Bingo work with one phone or solo. The shark story is original fiction and the trivia is general park knowledge. Put the phone down when the line moves.'
          : 'The optional Crew Relay and Crew Bingo work with one phone or solo. Put the phone down when the line moves. The shark story is original; ride facts were checked against official park pages.'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  card: { margin: spacing.md, padding: spacing.lg, borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#bcecff', ...shadows.lg },
  header: { flexDirection: 'row', minHeight: 106, alignItems: 'center', backgroundColor: '#0875c9',
    borderRadius: 16, margin: -8, marginBottom: 9, paddingLeft: 14, overflow: 'hidden' },
  headerCopy: { flex: 1, zIndex: 1 },
  shark: { width: 115, height: 115, marginRight: -15 },
  kicker: { color: '#bfeaff', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 23, marginTop: 5,
    textShadowColor: '#034471', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 1 },
  playNow: { flexDirection: 'row', alignItems: 'center', minHeight: 94, marginTop: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#ffcb2e', ...shadows.md },
  playNowCopy: { flex: 1, paddingRight: spacing.sm },
  playNowKicker: { color: '#7c4200', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.8 },
  playNowTitle: { color: '#093d77', fontFamily: 'Shark', fontSize: 20, marginTop: 3 },
  playNowHint: { color: '#385670', fontFamily: 'Knockout', fontSize: 12, marginTop: 3 },
  playNowArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center',
    justifyContent: 'center', borderWidth: 2, borderColor: '#fff', backgroundColor: '#0875c9' },
  playNowArrowText: { color: '#fff', fontSize: 18, marginLeft: 2 },
  story: { color: '#153e67', fontFamily: 'Knockout', fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  clueBadge: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#ffca30', backgroundColor: '#fff6d0' },
  clueKicker: { color: '#a86500', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.5 },
  clueText: { color: '#153e67', fontFamily: 'Knockout', fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  progress: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', backgroundColor: '#e7f8ff' },
  branch: { marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#ffcb2e', backgroundColor: '#fff6d0' },
  gridLink: { marginTop: spacing.lg, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#ffcb2e', ...shadows.md },
  gridTitle: { color: '#093d77', fontFamily: 'Shark', fontSize: 22 },
  gridDescription: { color: '#244d70', fontFamily: 'Knockout', fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  gridArrow: { color: '#005da4', fontFamily: 'Knockout', fontSize: 17, marginTop: spacing.sm },
  signalLink: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg, borderWidth: 2, borderColor: '#fff', backgroundColor: '#0875c9' },
  signalTitle: { color: '#ffcb2e', fontFamily: 'Shark', fontSize: 17 },
  signalDescription: { color: '#fff', fontFamily: 'Knockout', fontSize: 12, marginTop: 2 },
  branchKicker: { color: '#a86500', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.6 },
  branchTitle: { color: '#143c67', fontFamily: 'Shark', fontSize: 17, marginTop: spacing.xs },
  progressCount: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 20, marginBottom: spacing.sm },
  mission: { color: '#153e67', fontFamily: 'Knockout', fontSize: 17, lineHeight: 27 },
  missionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, borderTopWidth: 1, borderTopColor: '#b6e0f1' },
  missionPaused: { opacity: 0.45 },
  missionArrow: { color: '#0875c9', fontSize: 18, fontWeight: '800' },
  footer: { color: '#376888', fontFamily: 'Knockout', fontSize: 12, lineHeight: 18, marginTop: spacing.lg },
});
