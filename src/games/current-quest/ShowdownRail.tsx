/**
 * Showdown rail (design v7.1 14.1, R2, R3, 0.A.6): every racer as an
 * Alex-colour avatar chip on a 3-voyage track with shells and a check per
 * cleared voyage. Presence without spoilers: no opponent is ever drawn on your
 * board.
 *
 *   - Aim (R2): after your Par clear the splashable chips glow gold for 3 s;
 *     tap one to aim your Splash (otherwise it auto-targets).
 *   - Warning arc and wave meter (0.A.6): a Splash flies from the sender's
 *     chip to the target's as a gold arc (1.5 s), then sits on the target chip
 *     as a wave that rises until that racer's next voyage starts.
 *   - Shield and First Find (R3): a bubble dome on the chip; a gold flag for
 *     each voyage golden pearl found first.
 */

import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { CQ } from './theme';

const AVATARS = {
  you: require('../../assets/games/current-quest/avatar_classic.png'),
  blue: require('../../assets/games/current-quest/avatar_blue.png'),
  green: require('../../assets/games/current-quest/avatar_green.png'),
  orange: require('../../assets/games/current-quest/avatar_orange.png'),
};
const SHELL = require('../../assets/games/current-quest/golden_pearl.png');
const BUBBLE = require('../../assets/games/current-quest/shield_bubble.png');

export interface RailRacer {
  seat: number;
  name: string;
  avatar: keyof typeof AVATARS;
  you: boolean;
  cleared: number;
  shells: number;
  strokes: number;
  finished: boolean;
  shield: boolean;
  /** Changes every time this racer clears (drives the bounce). */
  bump: number;
  place: number;
  /** A Splash is waiting for this racer's next voyage (wave meter), with the sender seat. */
  incomingFrom: number | null;
  /** fx key of when the incoming Splash was sent (restarts the arc and the meter). */
  incomingAt: number;
  firstFinds: number;
  /** Glows and accepts a tap while the local player is aiming. */
  aimable: boolean;
}

export const RAIL_H = 46;

function Chip({ r, total, onAim }: { r: RailRacer; total: number; onAim?: (seat: number) => void }) {
  const s = useSharedValue(1);
  const x = useSharedValue(r.cleared / total);
  useEffect(() => {
    if (r.bump) s.value = withSequence(withTiming(1.25, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [r.bump, s]);
  useEffect(() => { x.value = withSpring(Math.min(1, r.cleared / total), { damping: 14, stiffness: 140 }); }, [r.cleared, total, x]);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (r.aimable) glow.value = withRepeat(withSequence(withTiming(1, { duration: 280 }), withTiming(0.35, { duration: 280 })), -1, true);
    else { cancelAnimation(glow); glow.value = withTiming(0, { duration: 120 }); }
  }, [r.aimable, glow]);
  // Wave meter: rises over 1.5 s of warning arc, then keeps creeping up until the voyage starts.
  const wave = useSharedValue(0);
  useEffect(() => {
    if (r.incomingFrom !== null) {
      wave.value = 0;
      wave.value = withSequence(withTiming(0, { duration: 1500 }), withTiming(0.55, { duration: 400, easing: Easing.out(Easing.back(2)) }), withTiming(0.95, { duration: 40000 }));
    } else wave.value = withTiming(0, { duration: 200 });
  }, [r.incomingFrom, r.incomingAt, wave]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const track = useAnimatedStyle(() => ({ width: `${x.value * 100}%` }));
  const glowSt = useAnimatedStyle(() => ({ opacity: glow.value }));
  const waveSt = useAnimatedStyle(() => ({ height: `${wave.value * 100}%`, opacity: wave.value > 0.01 ? 1 : 0 }));
  return (
    <Pressable style={{ flex: 1 }} disabled={!r.aimable} onPress={() => onAim?.(r.seat)} accessibilityRole={r.aimable ? 'button' : undefined}
      accessibilityLabel={`${r.you ? 'You' : r.name}, ${r.shells} shells${r.aimable ? '. Tap to aim your Splash.' : ''}`}>
      <View style={[styles.chip, r.you && styles.chipYou]}>
        <Animated.View style={[styles.aimGlow, glowSt]} pointerEvents="none" />
        <View style={styles.waveBox} pointerEvents="none">
          <Animated.View style={[styles.wave, waveSt]} />
        </View>
        <Animated.View style={[styles.avatarWrap, st]}>
          <Image source={AVATARS[r.avatar]} style={styles.avatar} />
          {r.shield ? <Image source={BUBBLE} style={styles.bubble} /> : null}
          {r.firstFinds > 0 ? <View style={styles.flag}><Text style={styles.flagTxt}>{r.firstFinds > 1 ? r.firstFinds : ''}</Text></View> : null}
        </Animated.View>
        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>{r.you ? 'You' : r.name}</Text>
          <View style={styles.bar}><Animated.View style={[styles.fill, r.finished && styles.fillDone, track]} /></View>
          <View style={styles.row}>
            <Image source={SHELL} style={styles.shell} />
            <Text style={styles.stat}>{r.shells}</Text>
            <Text style={styles.strokes}>{r.finished ? `${r.strokes} st` : `v${Math.min(total, r.cleared + 1)}`}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** The 1.5 s gold warning arc from the sender's chip to the target's (Mario Kart). */
function Arc({ from, to, n, keyAt }: { from: number; to: number; n: number; keyAt: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = 0;
    k.value = withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) });
  }, [keyAt, k]);
  const st = useAnimatedStyle(() => {
    const a = (from + 0.5) / n;
    const b = (to + 0.5) / n;
    const u = k.value;
    const x = a + (b - a) * u;
    const y = -Math.sin(u * Math.PI) * 22;
    return { left: `${x * 100}%`, transform: [{ translateY: y }, { scale: 0.8 + 0.4 * Math.sin(u * Math.PI) }], opacity: u >= 1 ? 0 : 1 };
  });
  return <Animated.View style={[styles.arcDot, st]} pointerEvents="none" />;
}

export const ShowdownRail = React.memo(function ShowdownRail({ racers, remainingMs, total, onAim }: {
  racers: RailRacer[]; remainingMs: number; total: number; onAim?: (seat: number) => void;
}) {
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const low = secs <= 30;
  const idx = (seat: number) => racers.findIndex((x) => x.seat === seat);
  return (
    <View style={styles.wrap} accessibilityLabel="Showdown standings">
      <View style={styles.chips}>
        {racers.map((r) => <Chip key={`r${r.seat}`} r={r} total={total} onAim={onAim} />)}
        {racers.filter((r) => r.incomingFrom !== null).map((r) => (
          <Arc key={`arc${r.seat}:${r.incomingAt}`} from={idx(r.incomingFrom as number)} to={idx(r.seat)} n={racers.length} keyAt={r.incomingAt} />
        ))}
      </View>
      <View style={[styles.window, low && styles.windowLow]}>
        <Text style={[styles.windowTxt, low && styles.windowTxtLow]}>{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: RAIL_H, marginHorizontal: 10, marginBottom: 2, flexDirection: 'row', alignItems: 'center' },
  chips: { flex: 1, flexDirection: 'row', gap: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 11, borderWidth: 1.5, borderColor: CQ.ink, paddingHorizontal: 3, height: 42, overflow: 'visible' },
  chipYou: { backgroundColor: CQ.cream, borderColor: CQ.goldDeep, borderWidth: 2 },
  aimGlow: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderRadius: 14, borderWidth: 3, borderColor: CQ.gold, backgroundColor: 'rgba(254,201,14,0.18)' },
  waveBox: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, borderRadius: 10, overflow: 'hidden', justifyContent: 'flex-end' },
  wave: { width: '100%', backgroundColor: 'rgba(254,201,14,0.55)', borderTopWidth: 2, borderTopColor: '#ffffff' },
  avatarWrap: { width: 24, height: 26 },
  avatar: { width: 24, height: 26, resizeMode: 'contain' },
  bubble: { position: 'absolute', left: -4, top: -4, width: 32, height: 32, opacity: 0.85 },
  flag: { position: 'absolute', right: -5, top: -6, width: 12, height: 10, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: CQ.gold, borderWidth: 1.5, borderColor: CQ.ink, alignItems: 'center', justifyContent: 'center' },
  flagTxt: { fontFamily: 'Knockout', fontSize: 7, color: CQ.navy },
  meta: { flex: 1, marginLeft: 2 },
  name: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  bar: { height: 4, borderRadius: 2, backgroundColor: 'rgba(47,47,58,0.15)', overflow: 'hidden', marginVertical: 1 },
  fill: { height: 4, backgroundColor: CQ.water },
  fillDone: { backgroundColor: CQ.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  shell: { width: 10, height: 11, resizeMode: 'contain' },
  stat: { fontFamily: 'Knockout', fontSize: 10, color: CQ.ink },
  strokes: { fontFamily: 'Knockout', fontSize: 10, color: CQ.navy, marginLeft: 'auto' },
  arcDot: { position: 'absolute', top: 14, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: CQ.gold, borderWidth: 2, borderColor: CQ.ink },
  window: { marginLeft: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: CQ.ink },
  windowLow: { backgroundColor: '#ffe3df', borderColor: CQ.coral },
  windowTxt: { fontFamily: 'Knockout', fontSize: 12, color: CQ.navy },
  windowTxtLow: { color: CQ.coral },
});
