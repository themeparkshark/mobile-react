import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, shadows, spacing } from '../../../design-system';
import type { CrewLivePrompt } from '../../../services/lineplay/livePrompt';

/** A short chip that slides in at the right of the rail ("Line moving. Eyes up.", "+1 Part · Mastery"). */
export interface RailChip {
  readonly key: string;
  readonly text: string;
  readonly tone: 'moving' | 'perk';
}

/**
 * Rail layout (economy review K17, owned by S3): one persistent slot (S4's
 * Duel chip or the Line Party beacon, passed in), then one transient chip at
 * a time. The BONUS OPEN pill lives on the WaitCard ring, never here.
 */
export function railLayout(input: { persistent: boolean; chip: RailChip | null; crew: boolean; project: boolean }):
  { show: boolean; persistent: boolean; chip: RailChip | null } {
  return {
    show: input.persistent || input.chip != null || input.crew || input.project,
    persistent: input.persistent,
    chip: input.chip,
  };
}

function SlideChip({ chip }: { chip: RailChip }) {
  const slide = useRef(new Animated.Value(40)).current;
  useEffect(() => {
    slide.setValue(40);
    const anim = Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [chip.key, slide]);
  return <Animated.View accessibilityLiveRegion="polite" accessibilityLabel={chip.text}
    style={[styles.chip, chip.tone === 'moving' ? styles.chipMoving : styles.chipPerk, { transform: [{ translateX: slide }] }]}>
    <Text style={chip.tone === 'moving' ? styles.chipMovingText : styles.chipPerkText} numberOfLines={1}>{chip.text}</Text>
  </Animated.View>;
}

interface Props {
  readonly crew: CrewLivePrompt | null;
  readonly projectTitle?: string | null;
  readonly projectStage?: number;
  readonly onOpenCrew: () => void;
  readonly onOpenProject: () => void;
  /** One persistent slot: S4's DuelChip or the Line Party beacon. */
  readonly persistent?: ReactNode;
  /** The one transient chip showing now (the screen queues them). */
  readonly chip?: RailChip | null;
}

/** One compact row that keeps live player changes visible during long waits. */
export default function LinePlayLiveRail({ crew, projectTitle, projectStage, onOpenCrew, onOpenProject,
  persistent = null, chip = null }: Props) {
  const layout = railLayout({ persistent: persistent != null, chip, crew: crew != null, project: Boolean(projectTitle) });
  if (!layout.show) return null;
  return <View>
    {(layout.persistent || layout.chip) && <View style={styles.slotRow}>
      {layout.persistent && <View style={styles.persistent}>{persistent}</View>}
      <View style={styles.chipLane}>{layout.chip && <SlideChip chip={layout.chip} />}</View>
    </View>}
    {(crew || projectTitle) && <View style={styles.liveRail}>
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
  </View>}
  </View>;
}

const styles = StyleSheet.create({
  slotRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginTop: spacing.sm, minHeight: 32 },
  persistent: { marginRight: spacing.xs },
  chipLane: { flex: 1, alignItems: 'flex-end', overflow: 'hidden' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 2 },
  chipMoving: { backgroundColor: '#3fc1ef', borderColor: '#08305f' },
  chipMovingText: { color: '#fff', fontFamily: 'Knockout', fontSize: 14 },
  chipPerk: { backgroundColor: '#fff8dc', borderColor: '#fec90e' },
  chipPerkText: { color: '#075083', fontFamily: 'Knockout', fontSize: 14 },
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
