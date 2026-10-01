/**
 * RaceStrip: the live scoreboard across the top of the board. Four racers,
 * sorted by score, each with a Mario Kart style position numeral that slams in
 * whenever it changes. Your chip is gold. Rival scores come from 4 Hz
 * whispers (display only; the server decides), house bots are simulated
 * locally from the shared seed, and a racer whose phone went away shows a ghost
 * tag while their ghost keeps playing.
 */
import { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BRAND, FONT } from '../../ui/tokens';
import { ordinal } from '../net/roomState';
import type { EmoteId, Seat } from '../net/partyTypes';
import SeatAvatar from './SeatAvatar';
import { EmotePop } from './EmoteBar';

export interface RacerLine {
  seat: Seat;
  /** Park alias for strangers, screen name for friends. */
  name: string;
  /** Series points so far (best 4 of 5). */
  seriesPoints?: number;
  score: number;
  placement: number;
  me: boolean;
  ghost: boolean;
  away: boolean;
  emote?: { id: EmoteId; key: string } | null;
  /** The Shared Golden (1-5) this seat was last stamped SNATCHED on (display only). */
  snatched?: number;
}

const NUMERAL_COLOR = ['#ffcf3b', '#7cc6f5', '#ff8a5c', '#ffffff'];

function Numeral({ placement }: { placement: number }) {
  const s = useSharedValue(1);
  const r = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    s.value = withSequence(withTiming(2.0, { duration: 0 }), withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2.2)) }));
    r.value = withSequence(withTiming(-8, { duration: 70 }), withTiming(6, { duration: 90 }), withSpring(0, { damping: 6, stiffness: 300 }));
  }, [placement, r, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${r.value}deg` }] }));
  return (
    <Animated.Text style={[styles.numeral, { color: NUMERAL_COLOR[Math.min(3, placement - 1)] }, style]}>
      {ordinal(placement)}
    </Animated.Text>
  );
}

function Score({ value, me }: { value: number; me: boolean }) {
  const s = useSharedValue(1);
  const last = useRef(value);
  useEffect(() => {
    if (value > last.current) s.value = withSequence(withTiming(1.18, { duration: 70 }), withSpring(1, { damping: 10, stiffness: 380 }));
    last.current = value;
  }, [s, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.Text style={[styles.score, me && styles.scoreMe, style]}>{value.toLocaleString('en-US')}</Animated.Text>;
}

function Chip({ line }: { line: RacerLine }) {
  return (
    <View style={[styles.chip, line.me && styles.chipMe]}>
      <Numeral placement={line.placement} />
      <View>
        <SeatAvatar avatarUrl={line.seat.avatar_url} team={line.seat.team} size={40} me={line.me} ghost={line.ghost} away={line.away} bumpKey={line.emote?.key} />
        {line.emote ? <EmotePop key={line.emote.key} emote={line.emote.id} size={38} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.name, line.me && styles.nameMe]}>{line.me ? 'YOU' : line.name}</Text>
      <Score value={line.score} me={line.me} />
      {line.snatched ? <SnatchTag key={line.snatched} /> : null}
      {line.ghost ? <Text style={styles.tag}>GHOST</Text> : line.seat.kind === 'bot' ? <Text style={styles.tagBot}>CREW</Text> : <View style={styles.tagSpacer} />}
    </View>
  );
}

/** SNATCHED slams onto the winner's chip one beat after the window, then fades. */
function SnatchTag() {
  const s = useSharedValue(1.8);
  const o = useSharedValue(1);
  useEffect(() => {
    s.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.back(2)) });
    o.value = withSequence(withTiming(1, { duration: 1300 }), withTiming(0, { duration: 250 }));
  }, [o, s]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }, { rotate: '-8deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.snatch, style]}>
      <Text style={styles.snatchText}>SNATCHED</Text>
    </Animated.View>
  );
}

function RaceStrip({ lines }: { lines: RacerLine[] }) {
  // Fixed slots (you first, then seat order) so a glance always finds the same
  // chip; the position numerals do the racing.
  const sorted = [...lines].sort((a, b) => Number(b.me) - Number(a.me) || a.seat.seat - b.seat.seat);
  return (
    <View style={styles.strip}>
      {sorted.map((line) => <Chip key={line.seat.seat} line={line} />)}
    </View>
  );
}

export default memo(RaceStrip);

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, gap: 6 },
  chip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: BRAND.blueBright,
    borderColor: BRAND.navy,
    borderWidth: 3,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  chipMe: { backgroundColor: BRAND.blue, borderColor: BRAND.gold },
  numeral: {
    position: 'absolute',
    top: -14,
    left: 4,
    fontFamily: FONT.display,
    fontSize: 20,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0.1,
    zIndex: 2,
  },
  name: { marginTop: 3, fontFamily: FONT.body, fontSize: 12, color: BRAND.white, letterSpacing: 0.4, maxWidth: '100%' },
  nameMe: { color: BRAND.gold },
  score: {
    fontFamily: FONT.display,
    fontSize: 18,
    color: BRAND.white,
    textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0.1,
    fontVariant: ['tabular-nums'],
  },
  scoreMe: { color: BRAND.goldLight },
  tag: { fontFamily: FONT.body, fontSize: 10, color: BRAND.navy, backgroundColor: BRAND.sky, paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden', marginTop: 2 },
  tagBot: { fontFamily: FONT.body, fontSize: 10, color: BRAND.navy, backgroundColor: BRAND.cream, paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden', marginTop: 2 },
  tagSpacer: { height: 14 },
  snatch: { position: 'absolute', top: 18, alignSelf: 'center', backgroundColor: BRAND.white, borderColor: BRAND.gold, borderWidth: 3, borderRadius: 10, paddingHorizontal: 6 },
  snatchText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.gold, letterSpacing: 0.6, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0.1 },
});
