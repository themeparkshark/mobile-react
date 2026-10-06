import { useRef } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import type { ParkProject } from '../../../api/endpoints/me/park-projects';
import type { ActivityItem } from '../../../services/lineplay/LinePlaySession';
import { resolveProjectMission } from '../../../services/lineplay/projectMission';
import { borderRadius, shadows, spacing } from '../../../design-system';
import ProjectRippleFeed from '../../ExploreScreen/ProjectRippleFeed';
import { GameIcon } from '../../../ui';

interface Props {
  readonly visible: boolean;
  readonly project: ParkProject;
  readonly paused: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly completedIds: ReadonlySet<string>;
  readonly onClose: () => void;
  readonly onHidden: () => void;
  readonly onPlay: (game: Extract<ActivityItem, { kind: 'minigame' }>) => void;
  readonly onVote: (chapter: 'a' | 'b') => void;
}

export default function ProjectMissionModal({ visible, project, paused, pending, error, completedIds, onClose, onHidden, onPlay, onVote }: Props) {
  const mission = resolveProjectMission(project);
  const current = project.play_chapter;
  const scrollRef = useRef<ScrollView>(null);
  const voteY = useRef(0);
  return (
    <Modal isVisible={visible} onBackdropPress={onClose} onBackButtonPress={onClose} onModalHide={onHidden}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Image source={require('../../../../assets/images/screens/park-projects/lost-current-hero.png')}
            resizeMode="cover" style={styles.headerArt} accessibilityLabel="Shark following a glowing park current" />
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>THE PARK IS WRITING A STORY</Text>
            <Text style={styles.headerTitle}>LIVE CHAPTER</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close park chapter"
            style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <GameIcon name="close" size={40} />
          </Pressable>
        </View>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
          <Text style={styles.park}>{project.park_name.toUpperCase()} · {project.contributors} CREW CONTRIBUTORS</Text>
          <Text style={styles.title}>{project.title}</Text>
          <Text style={styles.story}>{project.story_text}</Text>
          <View style={styles.progressBox}>
            <View style={styles.stageRow}>
              <Text style={styles.progress}>STAGE {project.stage}/3</Text>
              <Text style={styles.progress}>{project.total_points}/{project.goal_points} POINTS</Text>
            </View>
            <View style={styles.stageTrack}>
              {[1, 2, 3].map(stage => <View key={stage}
                style={[styles.stagePip, stage <= project.stage && styles.stagePipActive]} />)}
            </View>
          </View>
          <ProjectRippleFeed project={project} compact />
          {project.personal_clue && <View style={styles.clueBox}>
            <GameIcon name="sparkle" size={22} />
            <Text style={styles.clue}>YOUR CLUE: {project.personal_clue}</Text>
          </View>}
          {project.crew && (
            <View style={styles.clueBox}>
              <GameIcon name="heart" size={22} />
              <Text style={styles.clue}>
                FRIEND CREW: {project.crew.points}/{project.crew.target} points · {project.crew.friends} {project.crew.friends === 1 ? 'friend' : 'friends'} helped
                {project.crew.clue ? `\nCREW CLUE: ${project.crew.clue}` : '\nYour crew clue opens when your crew hits the goal. Playing alone counts too.'}
              </Text>
            </View>
          )}

          <View style={styles.mission}>
            <Text style={styles.missionKicker}>WHAT THE CREW CAN PLAY NOW</Text>
            <Text style={styles.missionTitle}>{mission?.title ?? 'No game right now'}</Text>
            <Text style={styles.story}>
              {mission?.prompt ?? 'This part of the story is changing. The wait timer and other games still work.'}
            </Text>
            {project.stage >= 2 && (
              <Text style={styles.context}>
                {project.leading_chapter
                  ? `Most votes so far are for ${current === 'b' ? project.chapter_b_title : project.chapter_a_title}.`
                  : `Votes are tied, so ${project.chapter_a_title} wins for now.`}
                {' '}New votes can still change it for everyone in line.
              </Text>
            )}
            {mission && (
              <Pressable accessibilityRole="button" style={[styles.play, paused && styles.disabled]}
                disabled={paused} onPress={() => onPlay(mission.game)}>
                <Text style={styles.playText}>{completedIds.has(mission.game.id) ? 'Play again' : `Play ${mission.gameName}`}</Text>
              </Pressable>
            )}
            <Text style={styles.context}>This game is just for fun. Your time near the ride earns Parts and points.</Text>
          </View>

          {project.stage >= 2 && (
            <View style={styles.voteBox} onLayout={event => { voteY.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.missionTitle}>Shape the next chapter</Text>
              {(['a', 'b'] as const).map((chapter) => (
                <Pressable key={chapter} disabled={paused || pending || !project.can_vote}
                  style={[styles.vote, project.my_chapter === chapter && styles.selected, (paused || pending || !project.can_vote) && styles.disabled]}
                  onPress={() => onVote(chapter)}>
                  <Text style={styles.voteText}>
                    {chapter === 'a' ? project.chapter_a_title : project.chapter_b_title}
                    {' · '}{chapter === 'a' ? project.chapter_a_votes : project.chapter_b_votes}
                  </Text>
                </Pressable>
              ))}
              {project.my_chapter && <Text style={styles.context}>Your choice is locked in.</Text>}
              {!project.participated && <Text style={styles.context}>Win a ride coin or Ride Part here to vote.</Text>}
              <Text style={styles.context}>If votes tie, {project.chapter_a_title} wins.</Text>
            </View>
          )}
          {paused && <Text style={styles.context}>Paused. Resume to play or vote.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
        {project.stage >= 2 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Jump to the park chapter vote"
            onPress={() => scrollRef.current?.scrollTo({ y: voteY.current, animated: true })}
            style={styles.voteJump}>
            <Text style={styles.voteJumpText}>
              {project.can_vote ? 'SHAPE THE NEXT CHAPTER' : 'SEE THE CREW VOTE'}
            </Text>
            <Text style={styles.voteJumpCounts}>{project.chapter_a_votes} vs {project.chapter_b_votes}</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shell: { maxHeight: '88%', backgroundColor: '#d8f4ff', borderRadius: borderRadius.xxl,
    borderWidth: 3, borderColor: '#fff', overflow: 'hidden', ...shadows.lg },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 104,
    backgroundColor: '#073a78', paddingLeft: spacing.md, borderBottomWidth: 4,
    borderBottomColor: '#ffca30', overflow: 'hidden' },
  headerArt: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  headerCopy: { flex: 1, zIndex: 1 },
  kicker: { color: '#ffca30', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.7,
    textShadowColor: '#062a55', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  headerTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 25, marginTop: 4,
    textShadowColor: '#062a55', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 3 },
  closeButton: { width: 48, height: 48, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  park: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.5 },
  title: { color: '#153e67', fontFamily: 'Shark', fontSize: 23, marginTop: spacing.xs },
  story: { color: '#244d70', fontFamily: 'Knockout', fontSize: 15, lineHeight: 21, marginTop: spacing.sm },
  progressBox: { marginTop: spacing.md, borderRadius: borderRadius.lg, borderWidth: 2,
    borderColor: '#fff', backgroundColor: '#bcecff', padding: spacing.sm },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  progress: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 12 },
  stageTrack: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  stagePip: { flex: 1, height: 8, backgroundColor: '#fff', borderRadius: 8 },
  stagePipActive: { backgroundColor: '#ffca30' },
  clueBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: spacing.md,
    borderRadius: borderRadius.lg, borderWidth: 2, borderColor: '#ffca30',
    backgroundColor: '#fff6d0', marginTop: spacing.md },
  clue: { flex: 1, color: '#153e67', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19 },
  mission: { backgroundColor: '#fff', borderRadius: borderRadius.lg, borderWidth: 2,
    borderColor: '#80d4fb', padding: spacing.md, marginTop: spacing.lg },
  missionKicker: { color: '#0875c9', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.6 },
  missionTitle: { color: '#153e67', fontFamily: 'Shark', fontSize: 19, marginTop: spacing.sm },
  context: { color: '#376888', fontFamily: 'Knockout', fontSize: 14, lineHeight: 18, marginTop: spacing.md },
  play: { backgroundColor: '#ffca30', borderRadius: borderRadius.lg, borderWidth: 2,
    borderColor: '#fff', padding: spacing.md, alignItems: 'center', marginTop: spacing.lg, ...shadows.md },
  playText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 18 },
  voteBox: { marginTop: spacing.lg, backgroundColor: '#bcecff', borderWidth: 2,
    borderColor: '#fff', borderRadius: borderRadius.lg, padding: spacing.md },
  vote: { backgroundColor: '#fff', borderRadius: borderRadius.lg, borderWidth: 2,
    borderColor: '#80d4fb', padding: spacing.md, marginTop: spacing.sm },
  selected: { borderColor: '#ffca30', backgroundColor: '#fff6d0' },
  voteText: { color: '#153e67', fontFamily: 'Knockout', fontSize: 16 },
  voteJump: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 49, paddingHorizontal: spacing.md, backgroundColor: '#ffca30',
    borderTopWidth: 3, borderTopColor: '#fff' },
  voteJumpText: { color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
  voteJumpCounts: { color: '#07569e', fontFamily: 'Knockout', fontSize: 14 },
  disabled: { opacity: 0.5 },
  error: { color: '#b72333', fontFamily: 'Knockout', fontSize: 14, marginTop: spacing.md },
});
