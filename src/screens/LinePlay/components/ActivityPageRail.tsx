import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { borderRadius, spacing } from '../../../design-system';
import { GameIcon } from '../../../ui';
import KidText from './KidText';
import ClueDots from './ClueDots';
import type { GameIconName } from '../../../ui/iconNames';
import { railNextText, type PageRailMode, type RailBackAction } from '../../../services/lineplay/lineLayout';

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
  /**
   * 'back' while the page window has stepped aside (an iPhone SE reading Details):
   * the page buttons would act on a page nobody can see, so the rail is one
   * "Back to games" button that closes Details.
   */
  readonly mode?: PageRailMode;
  readonly onShowPages?: () => void;
  /**
   * 'play' while a kid has pressed pause: the one button says Play and one tap resumes and brings
   * the games back (the card says "Tap play when you're ready"). 'show' at any other time: it
   * says Show games, with an up arrow like the Details pill, never a play triangle.
   */
  readonly backAction?: RailBackAction;
  /** The clue trail as 3 mini bubbles in place of a count (one count form on every screen). */
  readonly progressDots?: { readonly done: readonly boolean[]; readonly current: number } | null;
  /** A small picture beside "Next: ..." so a kid who can't read yet still knows what comes next. */
  readonly nextIcon?: GameIconName;
  /**
   * The page above has its own gold button (PLAY NOW, or the game itself): Next is a quiet white
   * button, so a kid sees exactly one gold button to press.
   */
  readonly quiet?: boolean;
  /** No count or label in the middle (the chapter page: its own bubbles own the count). */
  readonly hideCount?: boolean;
  /**
   * LinePlay's two tabs (core loop 5.5): Story and Games take the place of the Chapter button and
   * the FREE PLAY label. Story opens the line story; Games opens the games picker. A dot on Games
   * means new rounds were added (never a banner over a game).
   */
  readonly tabs?: {
    readonly active: 'story' | 'games';
    readonly hasStory: boolean;
    readonly gamesDot: boolean;
    readonly paused?: boolean;
    readonly onStory: () => void;
    readonly onGames: () => void;
  } | null;
}

function Tab({ label, icon, active, dot = false, disabled = false, onPress }: {
  label: string; icon: GameIconName; active: boolean; dot?: boolean; disabled?: boolean; onPress: () => void;
}) {
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active, disabled }}
    accessibilityLabel={`${label}${dot ? '. New rounds' : ''}`} disabled={disabled} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [styles.tab, active && styles.tabActive, disabled && styles.disabled, pressed && styles.pressed]}>
    <GameIcon name={icon} size={22} />
    <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
    {dot && <View pointerEvents="none" style={styles.tabDot} />}
  </Pressable>;
}

/** Keeps the next playable round visible after a player finishes a queue activity. */
export default function ActivityPageRail({ index, count, nextLabel, firstLabel = 'Chapter',
  progressText, progressAccessibilityLabel, onFirst, onArcade, arcadePaused = false, onNext,
  moreAvailable = false, morePaused = false, onMore, mode = 'pages', onShowPages, quiet = false,
  backAction = 'show', progressDots = null, nextIcon, hideCount = false, tabs = null }: Props) {
  const { width } = useWindowDimensions();
  if (mode === 'back' && onShowPages) {
    const play = backAction === 'play';
    return <View style={styles.rail}>
      <Pressable accessibilityRole="button"
        accessibilityLabel={play ? 'Play. Starts the games again and hides the details.' : 'Show the games. Hides the details.'}
        onPress={onShowPages} style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
        {play ? <GameIcon name="play" size={26} />
          : <View style={styles.upArrow}><GameIcon name="arrow" size={22} /></View>}
        <Text style={styles.nextText} numberOfLines={1}>{play ? 'Play' : 'Show games'}</Text>
      </Pressable>
    </View>;
  }
  const wrapsToFirst = index + 1 >= count;
  const showMore = wrapsToFirst && moreAvailable && !!onMore;
  // Quiet beside a page's own gold PLAY, "More games" included: PLAY is the one gold button.
  const calm = quiet;
  const nextWords = railNextText(nextLabel, width);
  const naming = !showMore && count > 1 && !wrapsToFirst;
  if (tabs) {
    // Story | Games, then the one Next offer inside the tab (or "More rounds" at the end of Games).
    const single = count <= 1;
    return <View style={styles.rail} accessibilityRole="tablist">
      {tabs.hasStory && <Tab label="Story" icon="search" active={tabs.active === 'story'} onPress={tabs.onStory} />}
      <Tab label="Games" icon="play" active={tabs.active === 'games'} dot={tabs.gamesDot} disabled={tabs.paused}
        onPress={tabs.onGames} />
      <Pressable accessibilityRole="button"
        accessibilityLabel={showMore ? 'Add more games' : single ? 'Only activity' : `Next: ${nextLabel}`}
        disabled={showMore ? morePaused : single} onPress={showMore ? onMore : onNext}
        style={[styles.next, calm && styles.nextQuiet, (showMore ? morePaused : single) && styles.disabled]}>
        {nextIcon && !showMore && !single ? <GameIcon name={nextIcon} size={22} /> : null}
        {/* Beside two tabs the name alone, on up to two lines (the arrow says "next"). */}
        <Text style={[styles.nextText, !showMore && styles.nextTextTwoLines, calm && styles.nextTextQuiet]}
          numberOfLines={showMore ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.85}>
          {showMore ? morePaused ? 'Resume for more' : 'More games' : single ? 'Only activity' : nextLabel}
        </Text>
        {!single && <GameIcon name="arrow" size={24} />}
      </Pressable>
    </View>;
  }
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
      {progressText ? <KidText style={styles.arcadeProgress} numberOfLines={1}
        accessibilityLabel={progressAccessibilityLabel}>{progressText}</KidText> : null}
    </Pressable> : hideCount ? null : progressDots ? <ClueDots done={progressDots.done} current={progressDots.current}
      accessibilityLabel={progressAccessibilityLabel} />
      : <KidText style={styles.count}
      accessibilityLabel={progressAccessibilityLabel ?? `Activity ${index + 1} of ${count}`}>
      {progressText ?? `${index + 1}/${count}`}
    </KidText>}
    <Pressable accessibilityRole="button"
      accessibilityLabel={showMore ? 'Add more queue activities' : wrapsToFirst ? `Return to ${firstLabel.toLowerCase()}` : `Next activity: ${nextLabel}`}
      disabled={showMore ? morePaused : count <= 1} onPress={showMore ? onMore : onNext}
      style={[styles.next, calm && styles.nextQuiet, (showMore ? morePaused : count <= 1) && styles.disabled]}>
      {nextIcon && !showMore && count > 1 && !wrapsToFirst ? <GameIcon name={nextIcon} size={24} /> : null}
      {/* A narrow phone: the mission name alone, on up to two lines at the normal size (never a small font). */}
      <Text style={[styles.nextText, naming && nextWords.lines === 2 && styles.nextTextTwoLines, calm && styles.nextTextQuiet]}
        numberOfLines={naming ? nextWords.lines : 1} adjustsFontSizeToFit
        minimumFontScale={naming && nextWords.lines === 2 ? 0.9 : 0.7}>
        {showMore ? morePaused ? 'Resume for more rounds' : 'More queue rounds'
          : count <= 1 ? 'Only activity' : wrapsToFirst ? `Back to ${firstLabel.toLowerCase()}` : nextWords.text}
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
  pressed: { transform: [{ scale: 0.97 }] },
  upArrow: { transform: [{ rotate: '-90deg' }] },
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
  nextTextTwoLines: { lineHeight: 18, textAlign: 'center' },
  // Quiet: white with a blue outline, same size and spot, so it still reads as a button.
  nextQuiet: { backgroundColor: '#ffffff', borderWidth: 2, borderColor: '#0875c9', borderBottomWidth: 4,
    borderBottomColor: '#0875c9' },
  nextTextQuiet: { color: '#075d9f' },
  tab: { minHeight: 48, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
    borderRadius: borderRadius.md, borderWidth: 2, borderColor: '#0875c9', backgroundColor: '#ffffff' },
  tabActive: { backgroundColor: '#0875c9' },
  tabText: { color: '#075d9f', fontFamily: 'Knockout', fontSize: 13, marginTop: -1 },
  tabTextActive: { color: '#ffffff' },
  tabDot: { position: 'absolute', top: 4, right: 4, width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#e4462e', borderWidth: 2, borderColor: '#ffffff' },
});
