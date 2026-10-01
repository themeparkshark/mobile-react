/**
 * Pass-and-play hand-off (L3): "Pass to Maya", then the round podium.
 *
 * A plain overlay, not a Modal, so it never stacks on a game's Modal and the
 * wait's own dialogs (boarding, line done) still appear above it. It pauses
 * nothing: the line always moves, and the hand-off doubles as a line check.
 */
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameButton, GameIcon, SHADOW } from '../../../ui';
import type { GroupTurn, PodiumEntry } from '../../../services/lineplay/lineGroup';
import PlayerBadge, { playerColor } from './PlayerBadge';

const PASS_ART = require('../../../../assets/images/screens/lineplay/pass-the-phone-shark.png');

export type PassPhoneMode =
  | { readonly kind: 'handoff'; readonly turn: GroupTurn; readonly seat: number;
      readonly gameLabel: string; readonly kidNote: string | null; readonly firstTurn: boolean }
  | { readonly kind: 'podium'; readonly entries: readonly PodiumEntry[];
      readonly seats: Readonly<Record<string, number>>; readonly gameLabel: string;
      readonly leaderLine: string | null; readonly nextLabel: string | null };

export function Stars({ count, size = 22 }: { readonly count: number; readonly size?: number }) {
  return <View style={styles.stars} accessible accessibilityLabel={`${count} of 3 stars`}>
    {[0, 1, 2].map(index => <View key={index} style={index < count ? null : styles.starOff}>
      <GameIcon name="star" size={size} />
    </View>)}
  </View>;
}

export default function PassPhoneOverlay({ mode, moving, onGo, onSkip, onEndRound, onNext, onDone }: {
  readonly mode: PassPhoneMode;
  /** The line is moving: a reminder only, nothing waits. */
  readonly moving: boolean;
  readonly onGo: () => void;
  readonly onSkip: () => void;
  readonly onEndRound: () => void;
  readonly onNext: () => void;
  readonly onDone: () => void;
}) {
  const reducedMotion = useReducedGameMotion();
  const enter = reducedMotion ? undefined : FadeIn.duration(160);
  const pop = reducedMotion ? undefined : ZoomIn.springify().damping(12);

  return (
    <Animated.View entering={enter} style={styles.root} accessibilityViewIsModal>
      <LinearGradient colors={['#13a8e9', '#0879ca', '#0768b9']} style={StyleSheet.absoluteFill} />
      {moving && <View style={styles.movingChip} accessibilityLiveRegion="polite">
        <GameIcon name="queue" size={22} />
        <Text style={styles.movingText}>Line moving. Eyes up.</Text>
      </View>}
      {mode.kind === 'handoff' ? (
        <View style={styles.body}>
          <Text style={styles.kicker}>
            TURN {mode.turn.number} OF {mode.turn.total} · {mode.gameLabel.toUpperCase()}
          </Text>
          <Animated.View entering={pop} style={styles.artWrap}>
            <Image source={PASS_ART} style={styles.art} contentFit="contain"
              accessibilityLabel="A shark passing the phone to a friend" />
          </Animated.View>
          <Text style={styles.passTo}>{mode.firstTurn ? 'First up' : 'Pass to'}</Text>
          <View style={styles.nameRow}>
            <PlayerBadge name={mode.turn.player.name} index={mode.seat} size={58} kid={mode.turn.player.kid} />
            <Text style={[styles.name, { color: BRAND.white, textShadowColor: playerColor(mode.seat) }]}
              numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} accessibilityRole="header">
              {mode.turn.player.name}
            </Text>
          </View>
          {mode.kidNote && <View style={styles.kidNote}>
            <GameIcon name="star" size={22} />
            <Text style={styles.kidNoteText}>{mode.kidNote}</Text>
          </View>}
          <Text style={styles.lineCheck}>Quick line check while the phone changes hands.</Text>
          <View style={styles.actions}>
            <GameButton label={`I'm ${mode.turn.player.name}. Go!`} icon="play" onPress={onGo}
              accessibilityLabel={`Start ${mode.turn.player.name}'s turn`} />
            <View style={styles.ghostRow}>
              <GameButton label={`Skip ${mode.turn.player.name}`} variant="ghost" tone="onBlue" fullWidth={false}
                onPress={onSkip} accessibilityHint="Stepped away. The round goes on without this turn." />
              <GameButton label="End round" variant="ghost" tone="onBlue" fullWidth={false} onPress={onEndRound} />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.kicker}>ROUND RESULTS · {mode.gameLabel.toUpperCase()}</Text>
          <Animated.View entering={pop} style={styles.podiumCard}>
            {mode.entries.map(entry => <View key={entry.player.id}
              style={[styles.podiumRow, entry.place === 1 && !entry.skipped && styles.podiumRowFirst]}
              accessible accessibilityLabel={`${entry.place}. ${entry.player.name}, ${entry.skipped ? 'skipped' : `${entry.stars} stars`}`}>
              <View style={styles.place}>
                {entry.place === 1 && !entry.skipped
                  ? <GameIcon name="crown" size={30} />
                  : <Text style={styles.placeText}>{entry.skipped ? '-' : entry.place}</Text>}
              </View>
              <PlayerBadge name={entry.player.name} index={mode.seats[entry.player.id] ?? 0} size={36} kid={entry.player.kid} />
              <View style={styles.podiumCopy}>
                <Text style={styles.podiumName} numberOfLines={1}>{entry.player.name}</Text>
                <Text style={styles.podiumMeta}>
                  {entry.skipped ? 'Stepped away' : entry.kidRound ? 'Kid round' : entry.score != null ? `${entry.score} pts` : ' '}
                </Text>
              </View>
              {!entry.skipped && <Stars count={entry.stars} />}
            </View>)}
          </Animated.View>
          {mode.leaderLine && <Text style={styles.leader}>{mode.leaderLine}</Text>}
          <View style={styles.actions}>
            {mode.nextLabel && <GameButton label={`Next: ${mode.nextLabel}`} icon="arrow" onPress={onNext} />}
            <GameButton label="Back to the line" variant={mode.nextLabel ? 'ghost' : 'primary'}
              tone="onBlue" onPress={onDone} />
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 40, justifyContent: 'center' },
  body: { paddingHorizontal: 22, alignItems: 'center' },
  movingChip: { position: 'absolute', top: 64, alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
    gap: 6, backgroundColor: BRAND.gold, borderRadius: 999, borderWidth: 3, borderColor: BRAND.navy,
    paddingHorizontal: 14, paddingVertical: 6 },
  movingText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 16 },
  kicker: { color: '#d8f2ff', fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1, textAlign: 'center' },
  artWrap: { marginTop: 6 },
  art: { width: 200, height: 170 },
  passTo: { color: BRAND.goldLight, fontFamily: 'Shark', fontSize: 24, marginTop: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, maxWidth: '100%' },
  name: { fontFamily: 'Shark', fontSize: 50, lineHeight: 58, flexShrink: 1,
    textShadowOffset: { width: 3, height: 3 }, textShadowRadius: 0 },
  kidNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: BRAND.cream,
    borderRadius: 999, borderWidth: 3, borderColor: BRAND.navy, paddingHorizontal: 14, paddingVertical: 6 },
  kidNoteText: { color: BRAND.navy, fontFamily: 'Knockout', fontSize: 16 },
  lineCheck: { color: '#d8f2ff', fontFamily: 'Knockout', fontSize: 16, marginTop: 16, textAlign: 'center' },
  actions: { alignSelf: 'stretch', alignItems: 'center', marginTop: 20, gap: 4 },
  ghostRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  podiumCard: { alignSelf: 'stretch', marginTop: 14, backgroundColor: BRAND.cream, borderRadius: 24,
    borderWidth: 4, borderColor: BRAND.navy, padding: 10, gap: 6, ...SHADOW.lifted },
  podiumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 8,
    paddingVertical: 7, backgroundColor: BRAND.white },
  podiumRowFirst: { backgroundColor: BRAND.goldLight },
  place: { width: 32, alignItems: 'center' },
  placeText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 22 },
  podiumCopy: { flex: 1 },
  podiumName: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 19 },
  podiumMeta: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 14 },
  stars: { flexDirection: 'row', gap: 1 },
  starOff: { opacity: 0.22 },
  leader: { color: BRAND.white, fontFamily: 'Shark', fontSize: 18, marginTop: 14, textAlign: 'center' },
});
