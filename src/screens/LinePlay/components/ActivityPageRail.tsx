import { Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius, spacing } from '../../../design-system';
import { GameIcon } from '../../../ui';

interface Props {
  readonly index: number;
  readonly count: number;
  readonly nextLabel: string;
  readonly firstLabel?: string;
  readonly progressText?: string;
  readonly progressAccessibilityLabel?: string;
  readonly onFirst: () => void;
  readonly onArcade?: () => void;
  readonly arcadePaused?: boolean;
  readonly onNext: () => void;
  readonly moreAvailable?: boolean;
  readonly morePaused?: boolean;
  readonly onMore?: () => void;
}

/** Keeps the next playable round visible after a player finishes a queue activity. */
export default function ActivityPageRail({ index, count, nextLabel, firstLabel = 'Chapter',
  progressText, progressAccessibilityLabel, onFirst, onArcade, arcadePaused = false, onNext,
  moreAvailable = false, morePaused = false, onMore }: Props) {
  const wrapsToFirst = index + 1 >= count;
  const showMore = wrapsToFirst && moreAvailable && !!onMore;
  return <View style={styles.rail}>
    {/* On the first page there is nowhere to return to, so the button is gone, not faded. */}
    {index > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Return to ${firstLabel.toLowerCase()}`}
      onPress={onFirst} style={styles.chapter} hitSlop={4}>
      <Text style={styles.chapterText}>{firstLabel}</Text>
    </Pressable>}
    {onArcade ? <Pressable accessibilityRole="button" accessibilityLabel="Open queue arcade"
      disabled={arcadePaused} onPress={onArcade}
      style={[styles.arcade, arcadePaused && styles.disabled]}>
      <Text style={styles.arcadeText}>ARCADE</Text>
      {progressText ? <Text style={styles.arcadeProgress} numberOfLines={1}
        accessibilityLabel={progressAccessibilityLabel}>{progressText}</Text> : null}
    </Pressable> : <Text style={styles.count}
      accessibilityLabel={progressAccessibilityLabel ?? `Activity ${index + 1} of ${count}`}>
      {progressText ?? `${index + 1}/${count}`}
    </Text>}
    <Pressable accessibilityRole="button"
      accessibilityLabel={showMore ? 'Add more queue activities' : wrapsToFirst ? `Return to ${firstLabel.toLowerCase()}` : `Next activity: ${nextLabel}`}
      disabled={showMore ? morePaused : count <= 1} onPress={showMore ? onMore : onNext}
      style={[styles.next, (showMore ? morePaused : count <= 1) && styles.disabled]}>
      <Text style={styles.nextText} numberOfLines={1}>
        {showMore ? morePaused ? 'Resume for more rounds' : 'More queue rounds'
          : count <= 1 ? 'Only activity' : wrapsToFirst ? `Back to ${firstLabel.toLowerCase()}` : `Next: ${nextLabel}`}
      </Text>
      {count > 1 && <GameIcon name="arrow" size={26} />}
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  rail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    // The original footer compass rises above the bar. Reserve its overlap so
    // chapter navigation stays fully visible and tappable on every page.
    marginHorizontal: spacing.lg, marginBottom: 56, padding: spacing.xs,
    borderWidth: 2, borderColor: '#fff', borderRadius: borderRadius.lg,
    backgroundColor: '#bcecff' },
  chapter: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md, backgroundColor: '#0875c9' },
  disabled: { opacity: 0.45 },
  chapterText: { color: '#fff', fontFamily: 'Knockout', fontSize: 15 },
  count: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 14, minWidth: 35,
    textAlign: 'center' },
  arcade: { minWidth: 66, minHeight: 42, justifyContent: 'center', alignItems: 'center',
    borderRadius: borderRadius.md, borderWidth: 2, borderColor: '#0875c9',
    backgroundColor: '#fff', paddingHorizontal: 3 },
  arcadeText: { color: '#075d9f', fontFamily: 'Shark', fontSize: 13 },
  arcadeProgress: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 9, marginTop: -1 },
  next: { flex: 1, minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, borderRadius: borderRadius.md, backgroundColor: '#ffca30',
    borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  nextText: { flexShrink: 1, color: '#093d77', fontFamily: 'Knockout', fontSize: 17 },
});
