/**
 * Current Quest results (design v7.1 9.8, 0.A.13 J11, 0.A.5, 0.A.7), drawn
 * through GameShellV2's `renderResults`, so the gameplay controls are already
 * unmounted behind it and the board sits under a white veil (never navy).
 *
 * A cream card (#fff6df) with a gold rim and a 2 px INK edge opens on Alex's
 * chest: three anticipation shakes (300 ms), the lid bursts open with a soft
 * local light, the shells fan out one by one into their sockets on a rising
 * pearl ladder, each star slams with a brush dust ring and a 1.03 kick, then
 * NEW BEST, the NEXT STAR line and the buttons last (about 1.8 s). A tap
 * anywhere jumps to the end state. No score number, no Haul.
 *
 * Ride Challenge adds the tier stamp (PERFECT RIDE / TIDE MASTER RIDE) and the
 * coin pile pouring out of the chest (0.A.5); a Showdown adds the podium with
 * shared ranks under a DEAD HEAT stamp (0.A.7).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, ZoomIn,
} from 'react-native-reanimated';
import { Canvas, Circle, Group, Path, Rect, RoundedRect, Skia } from '@shopify/react-native-skia';
import { CQ } from './theme';
import { sfxPearl, sfxShells, sfxChest } from './audio';
import { CQH } from './cqHaptics';

const CHEST_CLOSED = require('../../assets/games/current-quest/chest_closed.png');
const CHEST_OPEN = require('../../assets/games/current-quest/chest_open.png');
const SOCKET = require('../../assets/games/current-quest/shell_socket.png');
const COIN = require('../../assets/games/current-quest/coin.png');
const CHEER = require('../../assets/games/current-quest/cq_shark_cheer.png');
const STAR = require('../../assets/games/gamekit/particle-star.png');
const AVATAR: Record<string, number> = {
  you: require('../../assets/games/current-quest/avatar_classic.png'),
  blue: require('../../assets/games/current-quest/avatar_blue.png'),
  green: require('../../assets/games/current-quest/avatar_green.png'),
  orange: require('../../assets/games/current-quest/avatar_orange.png'),
};

export const CARD_CREAM = '#fff6df';

export interface PodiumRow { seat: number; name: string; avatar: string; you: boolean; place: number; shells: number; strokes: number; finished: boolean }

export interface CqResultsSummary {
  title: string;
  /** Per voyage [clear, par, golden]. */
  grid: boolean[][];
  stars: number;
  failed: boolean;
  newBest: boolean;
  nextStar: string | null;
  /** 'PERFECT RIDE', 'TIDE MASTER RIDE', 'TIDE MASTER', 'DEAD HEAT' ... */
  stamp: string | null;
  /** Ride Challenge: coins pour out of the chest (count of coin sprites, not a currency number). */
  coinPour: number;
  /** One quiet line (strokes vs par, Daily number, near-miss). */
  line: string | null;
  podium: PodiumRow[] | null;
  /** Labels for the extra buttons this context offers. */
  shareLabel: string | null;
  /** Final voyage routes (Snakebird / Supercell, non-sealed Puzzle contexts): yours beside the par route. */
  routes?: RouteCompare | null;
}

export interface RouteCompare {
  tiles: string;
  H: number;
  chest: number;
  mine: number[];
  par: number[];
  mineStrokes: number;
  parStrokes: number;
}

const MINI = 11;

/** A tiny top-down board with one route: water, coral dots, current stripes, the chest, the route. */
function RouteMini({ r, cells, color, label }: { r: RouteCompare; cells: number[]; color: string; label: string }) {
  const w = MINI * 5;
  const h = MINI * r.H;
  const route = React.useMemo(() => {
    const p = Skia.Path.Make();
    cells.forEach((c, k) => {
      const x = (c % 5) * MINI + MINI / 2;
      const y = Math.floor(c / 5) * MINI + MINI / 2;
      if (k === 0) p.moveTo(x, y); else p.lineTo(x, y);
    });
    return p;
  }, [cells]);
  const start = cells[0] ?? 0;
  return (
    <View style={styles.mini} accessibilityLabel={label}>
      <Canvas style={{ width: w + 4, height: h + 4 }}>
        <RoundedRect x={0} y={0} width={w + 4} height={h + 4} r={5} color={CQ.ink} />
        <RoundedRect x={2} y={2} width={w} height={h} r={4} color="#8fe3fa" />
        <Group transform={[{ translateX: 2 }, { translateY: 2 }]}>
          {r.tiles.split('').map((t, i) => {
            const x = (i % 5) * MINI;
            const y = Math.floor(i / 5) * MINI;
            if (t === '#') return <Circle key={`t${i}`} cx={x + MINI / 2} cy={y + MINI / 2} r={MINI * 0.36} color={CQ.rock} />;
            if ('^>v<'.includes(t)) return <Rect key={`t${i}`} x={x + 1} y={y + 1} width={MINI - 2} height={MINI - 2} color="#d9f6ff" />;
            if (t === 's') return <Circle key={`t${i}`} cx={x + MINI / 2} cy={y + MINI / 2} r={MINI * 0.32} color={CQ.sand} />;
            return null;
          })}
          <Rect x={(r.chest % 5) * MINI + 1.5} y={Math.floor(r.chest / 5) * MINI + 2.5} width={MINI - 3} height={MINI - 5} color={CQ.gold} />
          <Path path={route} color={CQ.ink} style="stroke" strokeWidth={4.5} strokeJoin="round" strokeCap="round" />
          <Path path={route} color={color} style="stroke" strokeWidth={2.5} strokeJoin="round" strokeCap="round" />
          <Circle cx={(start % 5) * MINI + MINI / 2} cy={Math.floor(start / 5) * MINI + MINI / 2} r={2.6} color={CQ.ink} />
        </Group>
      </Canvas>
      <Text style={styles.miniTxt}>{label}</Text>
    </View>
  );
}

interface Props {
  s: CqResultsSummary;
  stars: number;
  reducedMotion: boolean;
  onDone: () => void;
  onAgain?: () => void;
  onChallenge?: () => void;
  onShare?: () => void;
}

const SHAKE_MS = 300;
const BURST_AT = 520;
const SHELL_STEP = 90;
const STAR_STEP = 300;

export function CqResultsCard({ s, stars, reducedMotion, onDone, onAgain, onChallenge, onShare }: Props) {
  const flat: boolean[] = s.grid.flat();
  const earned = flat.filter(Boolean).length;
  const shellsEnd = BURST_AT + 120 + earned * SHELL_STEP;
  const starsAt = shellsEnd + 120;
  const endAt = starsAt + Math.max(1, stars) * STAR_STEP + 380;
  const [skip, setSkip] = useState(reducedMotion);
  const [open, setOpen] = useState(reducedMotion);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const kick = useSharedValue(1);
  const shake = useSharedValue(0);
  const light = useSharedValue(0);

  useEffect(() => {
    if (skip) return undefined;
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    shake.value = withSequence(withTiming(1, { duration: 50 }), withTiming(-1, { duration: 50 }), withTiming(1, { duration: 50 }), withTiming(-1, { duration: 50 }), withTiming(1, { duration: 50 }), withTiming(0, { duration: 50 }));
    at(BURST_AT, () => {
      setOpen(true);
      sfxChest();
      CQH.medium();
      light.value = withSequence(withTiming(0.18, { duration: 90 }), withTiming(0, { duration: 600 }));
    });
    let k = 0;
    flat.forEach((on) => { if (on) { const step = k++; at(BURST_AT + 120 + step * SHELL_STEP, () => { sfxPearl(step); CQH.tick(); }); } });
    for (let i = 0; i < stars; i++) {
      at(starsAt + i * STAR_STEP, () => {
        CQH.light();
        kick.value = withSequence(withTiming(1.03, { duration: 60 }), withSpring(1, { damping: 10, stiffness: 300 }));
      });
    }
    at(starsAt + stars * STAR_STEP, () => sfxShells(Math.min(3, Math.max(1, stars))));
    at(endAt, () => setSkip(true));
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = () => {
    if (skip) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setOpen(true);
    setSkip(true);
  };

  const cardSt = useAnimatedStyle(() => ({ transform: [{ scale: kick.value }] }));
  const chestSt = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 6}deg` }] }));
  const lightSt = useAnimatedStyle(() => ({ opacity: light.value }));
  const d = (ms: number) => (skip ? 0 : ms);

  let shellIdx = 0;
  return (
    <Pressable onPress={jump} style={styles.full} accessibilityLabel="Results">
      <Animated.View style={[styles.inkEdge, cardSt]}>
      <View style={[styles.card, { width: '100%' }]}>
        <Image source={CHEER} style={styles.cheer} />
        <Text style={styles.title}>{s.title}</Text>
        <View style={[styles.chestRow, s.podium && styles.chestRowSmall]}>
          <Animated.View style={[styles.light, lightSt]} pointerEvents="none" />
          <Animated.View style={chestSt}>
            <Image source={open ? CHEST_OPEN : CHEST_CLOSED} style={[styles.chest, s.podium && styles.chestSmall]} />
          </Animated.View>
          {open && s.coinPour > 0 ? Array.from({ length: Math.min(12, s.coinPour) }, (_, i) => (
            <Animated.Image key={`c${i}`} source={COIN} entering={ZoomIn.delay(d(i * 60)).springify().damping(9)}
              style={[styles.coin, { left: 60 + ((i * 37) % 120) - 30, top: 54 + ((i * 23) % 22) }]} />
          )) : null}
        </View>
        <View style={styles.gridWrap}>
        {s.routes ? <RouteMini r={s.routes} cells={s.routes.mine} color="#ffffff" label={`You: ${s.routes.mineStrokes}`} /> : null}
        <View style={styles.grid}>
          {s.grid.map((row, v) => (
            <View key={`v${v}`} style={styles.gridRow}>
              {row.map((on, k) => {
                const idx = on ? shellIdx++ : -1;
                return (
                  <View key={`s${k}`} style={styles.socketBox}>
                    <Image source={SOCKET} style={[styles.socket, styles.socketEmpty]} />
                    {on && (open || skip) ? (
                      <Animated.View entering={skip ? undefined : ZoomIn.delay(Math.max(0, BURST_AT + 120 + idx * SHELL_STEP - BURST_AT)).springify().damping(8)} style={styles.socketFill}>
                        <Image source={SOCKET} style={styles.socket} />
                        <View style={styles.gold} />
                      </Animated.View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        {s.routes ? <RouteMini r={s.routes} cells={s.routes.par} color={CQ.gold} label={`Par: ${s.routes.parStrokes}`} /> : null}
        </View>
        <View style={styles.stars}>
          {[0, 1, 2].map((i) => (
            <View key={`st${i}`} style={styles.starBox}>
              <Image source={STAR} style={[styles.star, styles.starEmpty]} />
              {i < stars ? (
                <Animated.Image entering={skip ? undefined : ZoomIn.delay(d(starsAt + i * STAR_STEP)).springify().damping(7)} source={STAR} style={[styles.star, styles.starOn]} />
              ) : null}
            </View>
          ))}
        </View>
        {s.stamp ? (
          <Animated.View entering={skip ? undefined : ZoomIn.delay(d(starsAt + stars * STAR_STEP)).springify().damping(9)}>
            <View style={styles.stamp}><Text style={styles.stampTxt}>{s.stamp}</Text></View>
          </Animated.View>
        ) : null}
        {s.podium ? (
          <View style={styles.podium}>
            {s.podium.map((r) => (
              <View key={`p${r.seat}`} style={[styles.podRow, r.you && styles.podYou]}>
                <Text style={styles.podPlace}>{['1st', '2nd', '3rd', '4th'][r.place - 1] ?? `${r.place}th`}</Text>
                <Image source={AVATAR[r.avatar] ?? AVATAR.you} style={styles.podAvatar} />
                <Text style={styles.podName} numberOfLines={1}>{r.you ? 'You' : r.name}</Text>
                <Text style={styles.podStat}>{r.finished ? `${r.shells} shells, ${r.strokes} strokes` : 'out of time'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Animated.View entering={skip ? undefined : FadeIn.delay(d(endAt - 300)).duration(220)} style={styles.lines}>
          {s.newBest ? <View style={styles.best}><Text style={styles.bestTxt}>NEW BEST</Text></View> : null}
          {s.nextStar ? <Text style={styles.next}>{s.nextStar}</Text> : null}
          {s.line ? <Text style={styles.line}>{s.line}</Text> : null}
        </Animated.View>
        <Animated.View entering={skip ? undefined : FadeIn.delay(d(endAt)).duration(220)} style={styles.actions}>
          {onAgain ? (
            <Pressable onPress={onAgain} style={({ pressed }) => [styles.btn, styles.btnGold, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.btnTxt}>Play again</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDone} style={({ pressed }) => [styles.btn, !onAgain && styles.btnGold, pressed && styles.pressed]} accessibilityRole="button">
            <Text style={styles.btnTxt}>Done</Text>
          </Pressable>
        </Animated.View>
        {onChallenge || (onShare && s.shareLabel) ? (
          <Animated.View entering={skip ? undefined : FadeIn.delay(d(endAt + 120)).duration(220)} style={styles.actions}>
            {onChallenge ? (
              <Pressable onPress={onChallenge} style={({ pressed }) => [styles.btnSmall, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.btnSmallTxt}>Challenge a friend</Text>
              </Pressable>
            ) : null}
            {onShare && s.shareLabel ? (
              <Pressable onPress={onShare} style={({ pressed }) => [styles.btnSmall, pressed && styles.pressed]} accessibilityRole="button">
                <Text style={styles.btnSmallTxt}>{s.shareLabel}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
      </Animated.View>
    </Pressable>
  );
}

/** Pulsing white veil over the board under the card (never darkened, never navy). */
export function ResultsVeil() {
  const a = useSharedValue(0);
  useEffect(() => { a.value = withDelay(60, withTiming(1, { duration: 260 })); }, [a]);
  const st = useAnimatedStyle(() => ({ opacity: a.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, st]} />;
}

/** A soft gold pulse used by the stake card's coin stacks. */
export function usePulse(on: boolean) {
  const p = useSharedValue(1);
  useEffect(() => {
    if (on) p.value = withRepeat(withSequence(withTiming(1.06, { duration: 380 }), withTiming(1, { duration: 380 })), -1, true);
  }, [on, p]);
  return useAnimatedStyle(() => ({ transform: [{ scale: p.value }] }));
}

const styles = StyleSheet.create({
  full: { width: '100%', alignItems: 'center' },
  veil: { backgroundColor: 'rgba(255,255,255,0.35)' },
  card: {
    width: '90%', maxWidth: 380, paddingTop: 34, paddingBottom: 16, paddingHorizontal: 14, borderRadius: 26, backgroundColor: CARD_CREAM,
    borderWidth: 4, borderColor: CQ.gold, alignItems: 'center',
  },
  inkEdge: { width: '90%', maxWidth: 384, borderRadius: 28, borderWidth: 2, borderColor: CQ.ink },
  cheer: { position: 'absolute', top: -58, width: 82, height: 100, resizeMode: 'contain' },
  title: { fontFamily: 'Shark', fontSize: 26, color: CQ.navy, textAlign: 'center' },
  chestRow: { height: 104, width: 220, alignItems: 'center', justifyContent: 'center' },
  light: { position: 'absolute', width: 200, height: 120, borderRadius: 100, backgroundColor: '#ffffff' },
  chest: { width: 112, height: 96, resizeMode: 'contain' },
  chestRowSmall: { height: 70 },
  chestSmall: { width: 80, height: 66 },
  coin: { position: 'absolute', width: 28, height: 28, resizeMode: 'contain' },
  grid: { gap: 2, marginTop: 2 },
  gridWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mini: { alignItems: 'center' },
  miniTxt: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy, marginTop: 2 },
  gridRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  socketBox: { width: 34, height: 34 },
  socket: { width: 34, height: 34, resizeMode: 'contain' },
  socketEmpty: { opacity: 0.4 },
  socketFill: { position: 'absolute', left: 0, top: 0 },
  gold: { position: 'absolute', left: 4, top: 5, width: 26, height: 22, borderRadius: 11, backgroundColor: CQ.gold, opacity: 0.55 },
  stars: { flexDirection: 'row', gap: 8, marginTop: 8 },
  starBox: { width: 46, height: 46 },
  star: { position: 'absolute', width: 46, height: 46, resizeMode: 'contain' },
  starEmpty: { opacity: 0.25 },
  starOn: {},
  stamp: { marginTop: 6, paddingHorizontal: 14, paddingVertical: 4, borderRadius: 10, borderWidth: 3, borderColor: CQ.ink, backgroundColor: CQ.gold, transform: [{ rotate: '-6deg' }] },
  stampTxt: { fontFamily: 'Shark', fontSize: 22, color: CQ.navy },
  podium: { alignSelf: 'stretch', gap: 4, marginTop: 8 },
  podRow: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 5, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: CQ.ink },
  podYou: { backgroundColor: '#fff3c2', borderColor: CQ.goldDeep, borderWidth: 2.5 },
  podPlace: { fontFamily: 'Shark', fontSize: 17, color: CQ.navy, width: 38 },
  podAvatar: { width: 24, height: 26, resizeMode: 'contain' },
  podName: { fontFamily: 'Shark', fontSize: 15, color: CQ.navy, flex: 1 },
  podStat: { fontFamily: 'Knockout', fontSize: 11, color: CQ.navy },
  lines: { alignItems: 'center', marginTop: 8, gap: 4 },
  best: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 8, backgroundColor: CQ.coral, borderWidth: 2, borderColor: CQ.ink, transform: [{ rotate: '-8deg' }] },
  bestTxt: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff' },
  next: { fontFamily: 'Knockout', fontSize: 15, color: CQ.navy, textAlign: 'center' },
  line: { fontFamily: 'Knockout', fontSize: 13, color: CQ.navy, opacity: 0.85, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { minWidth: 120, minHeight: 50, paddingHorizontal: 16, borderRadius: 14, borderWidth: 2.5, borderColor: CQ.ink, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  btnGold: { backgroundColor: CQ.gold },
  btnTxt: { fontFamily: 'Shark', fontSize: 19, color: CQ.navy },
  btnSmall: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: CQ.ink, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  btnSmallTxt: { fontFamily: 'Knockout', fontSize: 14, color: CQ.navy },
  pressed: { transform: [{ scale: 0.95 }] },
});
