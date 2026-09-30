import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, shadows, spacing } from '../../../design-system';
import type { CrewLivePrompt } from '../../../services/lineplay/livePrompt';

interface Props {
  readonly crew: CrewLivePrompt | null;
  readonly projectTitle?: string | null;
  readonly projectStage?: number;
  readonly onOpenCrew: () => void;
  readonly onOpenProject: () => void;
}

/** One compact row that keeps live player changes visible during long waits. */
export default function LinePlayLiveRail({ crew, projectTitle, projectStage, onOpenCrew, onOpenProject }: Props) {
  if (!crew && !projectTitle) return null;
  return <View style={styles.liveRail}>
    {crew && <Pressable accessibilityRole="button" accessibilityLabel={`Open ${crew.title}`}
      onPress={onOpenCrew} style={[styles.liveTile, styles.crewLiveTile]}>
      <View style={styles.liveCopy}>
        <Text style={styles.crewLiveLabel} numberOfLines={1}>{crew.label}</Text>
        <Text style={styles.crewLiveTitle} numberOfLines={1}>{crew.title}</Text>
        <Text style={styles.crewLiveAction} numberOfLines={1}>{crew.action}</Text>
      </View>
      <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
        resizeMode="contain" style={styles.liveShark} accessibilityLabel="Theme Park Shark mascot" />
    </Pressable>}
    {projectTitle && <Pressable accessibilityRole="button"
      accessibilityLabel={`Open live park chapter: ${projectTitle}`} onPress={onOpenProject}
      style={[styles.liveTile, styles.projectLiveTile]}>
      <Text style={styles.projectLiveLabel}>PARK CHAPTER · STAGE {projectStage ?? 0}/3</Text>
      <Text style={styles.projectLiveTitle} numberOfLines={1}>{projectTitle}</Text>
      <Text style={styles.projectLiveAction}>MISSION & VOTE</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  liveRail: { flexDirection: 'row', gap: spacing.xs, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  liveTile: { flex: 1, minWidth: 0, minHeight: 77, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: '#fff', overflow: 'hidden', ...shadows.md },
  crewLiveTile: { flexDirection: 'row', backgroundColor: '#0875c9', paddingLeft: spacing.sm },
  liveCopy: { flex: 1, minWidth: 0, justifyContent: 'center', paddingVertical: spacing.xs },
  crewLiveLabel: { color: '#ffca30', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.4 },
  crewLiveTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 14, marginTop: 2 },
  crewLiveAction: { color: '#ffe07a', fontFamily: 'Knockout', fontSize: 12, marginTop: 3 },
  liveShark: { width: 44, height: 70, alignSelf: 'flex-end', marginRight: -5, marginBottom: -5 },
  projectLiveTile: { backgroundColor: '#ffca30', paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, justifyContent: 'center' },
  projectLiveLabel: { color: '#07569e', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.4 },
  projectLiveTitle: { color: '#093d77', fontFamily: 'Shark', fontSize: 14, marginTop: 2 },
  projectLiveAction: { color: '#07569e', fontFamily: 'Knockout', fontSize: 12, marginTop: 3 },
});
