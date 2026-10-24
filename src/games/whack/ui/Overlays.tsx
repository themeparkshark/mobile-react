/**
 * Overlays: the between-moments UI (design 5.2 breathers, 5.9 FINISH, 6.10).
 * These render only at Burst boundaries, never per hit.
 *
 *   <Banner>    READY... GO! / FINISH! / callouts: slam 2.2 -> 1.0, Easing.out(back(2))
 *   <Breather>  banked count-up, stats, Walk Boost, next Burst, the GO pad (split into GO and
 *               GO FEVER when fever is banked, v4 6.5), BANK & EXIT
 *   <DuelCard>  Bonk Battle reveal: both scores, tug-of-war bar, winner, stickers
 */

import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Canvas, Path, Skia, rect } from '@shopify/react-native-skia';
import { CountUpText } from '../../../gamekit/fx/CountUpText';
import GameIcon from '../../../ui/GameIcon';
import { COUNT, DURATION, SPRING } from '../../../ui/motion';
import { EASE } from '../../../ui/motionEasing';
import { ART, BOSS_ART, THEMED_SHARK_FRAMES, type WhackTheme } from '../assets';

const NAVY = '#05346e';
const GOLD = '#ffcf3b';
const BLUE = '#0768b9';
const CREAM = '#fff8e4';
const CORAL = '#ff6b5c';

/**
 * Banner: one short callout at a time, in the bubble-font look of the big stamps (round 4): the words sit
 * on a cream plate with a navy ink edge, stamp in from 1.6 on SPRING.stamp and leave by CALLOUT_LIFE_MS.
 */
export function Banner({ text, sub, color = '#ffffff', stamp, top }: { text: string | null; sub?: string | null; color?: string; stamp: number; top: number }) {
  const s = useSharedValue(0);
  const o = useSharedValue(0);
  useEffect(() => {
    if (!text) {
      o.value = withTiming(0, { duration: DURATION.exit, easing: EASE.in });
      return;
    }
    s.value = 1.6;
    o.value = withTiming(1, { duration: DURATION.tap });
    s.value = withSpring(1, SPRING.stamp);
  }, [text, stamp, s, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  const gold = color.toLowerCase() === GOLD;
  return (
    <Animated.View pointerEvents="none" style={[styles.banner, { top }, style]}>
      {text ? (
        <View style={[styles.plate, gold && styles.plateGold]}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.bannerText, gold && styles.bannerTextGold]}>{text}</Text>
          {sub ? <Text numberOfLines={1} adjustsFontSizeToFit style={styles.bannerSub}>{sub}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

function Ring({ pct, size = 64 }: { pct: number; size?: number }) {
  const p = Skia.Path.Make();
  p.addArc(rect(6, 6, size - 12, size - 12), -90, 360 * Math.max(0, Math.min(1, pct)));
  const bg = Skia.Path.Make();
  bg.addArc(rect(6, 6, size - 12, size - 12), 0, 359.9);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Path path={bg} style="stroke" strokeWidth={9} color={NAVY} />
      <Path path={bg} style="stroke" strokeWidth={5} color="#bfe5ff" />
      <Path path={p} style="stroke" strokeWidth={5} strokeCap="round" color={GOLD} />
    </Canvas>
  );
}

export interface BreatherProps {
  burstNumber: number;
  bursts: number;
  burstScore: number;
  runScore: number;
  stats: { label: string; value: string }[];
  nextBanner: string;
  /** The next Burst's shape id (b2 lure, b3 patterns, b4 twins, b5 boss, rush golden): drawn as a picture. */
  nextShape?: string;
  /** Boss art index when the next Burst is a Boss Run. */
  nextBoss?: number;
  theme?: WhackTheme;
  walkPct: number;
  walkMeters: number;
  boostReady: string | null;
  incomingSplats: number;
  readyEnabled: boolean;
  goal: string | null;
  /** The next star as a picture: how full (0..1) and its score; `best` is where your best run was at this point (0..1 on the same bar). */
  goalStar?: { progress: number; target: number; three: boolean; best?: number | null } | null;
  /** The card's top edge (pt): below the game's HUD row, so the Burst ring and combo stay visible. */
  top?: number;
  /** Reduce Motion: the card and pads fade in, no pulse. */
  reduced?: boolean;
  /** Show the Walk Boost row (random-seed solo Queue Runs only). */
  showWalk?: boolean;
  /** A banked fever: the pad splits into GO and GO FEVER. */
  feverReady?: boolean;
  /** The next Burst is the Boss Run. */
  bossNext?: boolean;
  onReady: () => void;
  onFever?: () => void;
  onBank: () => void;
  canBank: boolean;
  duelLine?: string | null;
  /** Split vs your best (Mario Kart ghost splits), never a red minus. */
  split?: { text: string; ahead: boolean; delta?: number; best?: number } | null;
  /** One coin tick per step of the banked roll (the caller climbs the pitch ladder). */
  onCountTick?: () => void;
}

/** Stat label to a picture (no reading): the value sits next to its icon. */
const STAT_ICON: Record<string, 'rush' | 'streak' | 'star' | 'timer'> = { QUICK: 'rush', STREAK: 'streak', CRITS: 'star', 'LOOK-UPS': 'timer' };

/** The next Burst as a picture: what is new, drawn with the game's own art. */
function NextPreview({ shape, theme, boss }: { shape?: string; theme: WhackTheme; boss?: number }) {
  const finn = THEMED_SHARK_FRAMES[theme][1];
  if (shape === 'b2') {
    return (
      <View style={styles.nextRow}>
        <Image source={ART.angler} style={styles.nextArt} resizeMode="contain" />
        <View style={[styles.nextBadge, { backgroundColor: '#ffffff' }]}>
          <View style={[styles.xBar, { transform: [{ rotate: '45deg' }] }]} />
          <View style={[styles.xBar, { transform: [{ rotate: '-45deg' }] }]} />
        </View>
      </View>
    );
  }
  if (shape === 'b5' || shape === 'raid') {
    return <View style={styles.nextRow}><Image source={(BOSS_ART[boss ?? 0] ?? BOSS_ART[0]).src} style={styles.nextBossArt} resizeMode="contain" /></View>;
  }
  if (shape === 'rush') return <View style={styles.nextRow}><Image source={ART.golden} style={styles.nextArt} resizeMode="contain" /><GameIcon name="sparkle" size={22} /></View>;
  const n = shape === 'b3' ? 3 : shape === 'b4' ? 2 : 1;
  return (
    <View style={styles.nextRow}>
      {Array.from({ length: n }, (_, i) => <Image key={i} source={finn} style={[styles.nextArt, n > 1 && { width: 34, height: 34, marginHorizontal: -2 }]} resizeMode="contain" />)}
    </View>
  );
}

export function Breather(p: BreatherProps) {
  const pad = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    // The card rises out of the FINISH! rings onto a calm board: up from below, settling with no wobble.
    enter.value = p.reduced ? withTiming(1, { duration: DURATION.quick }) : withSpring(1, SPRING.settle);
  }, [enter, p.reduced]);
  useEffect(() => {
    // r5: the pads are the last beat of the card stagger. They never sit ghosted: hidden until they can be
    // pressed, then they pop in at full strength on SPRING.pop with one pulse to draw the eye (and one more
    // after a quiet moment). Finite, so nothing loops while the card waits or the app is in the background.
    if (!p.readyEnabled) { pad.value = 0; return; }
    if (p.reduced) { pad.value = withTiming(1, { duration: DURATION.quick }); return; }
    pad.value = 0.8;
    pad.value = withSequence(
      withSpring(1, SPRING.pop),
      withDelay(2600, withTiming(1.06, { duration: 260, easing: EASE.out })),
      withTiming(1, { duration: 260, easing: EASE.inOut }),
    );
  }, [p.readyEnabled, p.reduced, pad]);
  const padStyle = useAnimatedStyle(() => ({
    opacity: p.reduced ? pad.value : pad.value < 0.79 ? 0 : 1,
    transform: [{ scale: p.reduced ? 1 : Math.max(0.8, pad.value) }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6),
    transform: [{ translateY: (1 - enter.value) * 60 }, { scale: 0.9 + 0.1 * enter.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, enter.value * 1.6) }));
  const theme = p.theme ?? 'park';
  const tickEvery = Math.max(1, Math.round(p.burstScore / 10));
  // At most 3 picture stats: the run total (only when it differs from this Burst) and two chips.
  const showRun = p.runScore !== p.burstScore;
  const chips = p.stats.filter((s) => STAT_ICON[s.label] && s.value !== '0').slice(0, showRun ? 2 : 3);
  const walkOn = p.showWalk !== false && (p.walkPct > 0.01 || !!p.boostReady);
  const best = p.goalStar && p.goalStar.best != null ? Math.max(0.02, Math.min(0.98, p.goalStar.best)) : null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The veil fades in with the card on the same UI-thread spring (never a dim frame with no card). */}
      <Animated.View style={[styles.dim, dimStyle]} pointerEvents="none" />
      {/* The animated layer carries only the motion; the bordered cream card is a plain view inside it. */}
      <Animated.View style={[cardStyle, { marginTop: p.top ?? 14 }]}>
      <View style={styles.card} accessibilityLabel={`Burst ${p.burstNumber} of ${p.bursts} banked. ${p.burstScore} points.`}>
        {/* Bursts as pips: banked ones are gold with a check (no words). */}
        <View style={styles.pips}>
          {Array.from({ length: p.bursts }, (_, i) => (
            <View key={i} style={[styles.pip, i < p.burstNumber ? styles.pipOn : null, i === p.burstNumber - 1 ? styles.pipNow : null]}>
              {i < p.burstNumber ? <View style={styles.pipDot} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.scoreRow}>
          <GameIcon name="coins" size={34} />
          <CountUpText value={p.burstScore} fromValue={0} reducedMotion={p.reduced} prefix="+" delayMs={200} durationMs={COUNT.ms} tickEvery={tickEvery} onTick={p.onCountTick}
            style={styles.cardScore} />
        </View>
        <View style={styles.chips}>
          {showRun ? (
            <View style={styles.chip} accessibilityLabel={`Run total ${p.runScore}`}>
              <GameIcon name="trophy" size={18} />
              <Text style={styles.chipValue}>{p.runScore.toLocaleString()}</Text>
            </View>
          ) : null}
          {chips.map((s) => (
            <View key={s.label} style={styles.chip} accessibilityLabel={`${s.label} ${s.value}`}>
              <GameIcon name={STAT_ICON[s.label]} size={18} />
              <Text style={styles.chipValue}>{s.value}</Text>
            </View>
          ))}
        </View>
        {p.duelLine ? <Text style={styles.duelLine}>{p.duelLine}</Text> : null}
        {p.goalStar ? (
          <View style={styles.starRow} accessibilityLabel={p.goal ?? undefined}>
            <GameIcon name="star" size={24} />
            <View style={styles.starTrackWrap}>
              <View style={styles.starTrack}>
                <View style={[styles.starFill, { width: `${Math.round(Math.max(0.04, Math.min(1, p.goalStar.progress)) * 100)}%` }]} />
              </View>
              {/* Your best run at this point, as the ghost fin on the same bar (the chase, with no number). */}
              {best != null ? (
                <View style={[styles.bestMark, { left: `${Math.round(best * 100)}%` }]} accessibilityLabel={p.split?.text}>
                  <GameIcon name="fin" size={16} />
                </View>
              ) : null}
            </View>
            {p.goalStar.three ? <GameIcon name="trophy" size={22} /> : <GameIcon name="star" size={18} />}
          </View>
        ) : p.goal ? <Text style={styles.goal}>{p.goal}</Text> : null}
        {walkOn ? (
          <View style={styles.walkRow} accessibilityLabel={p.boostReady ? `Walk boost: ${p.boostReady}` : `Walk boost, ${Math.round(p.walkMeters)} meters`}>
            <View>
              <Ring pct={p.walkPct} size={46} />
              <View style={styles.ringIcon}><GameIcon name="queue" size={20} /></View>
            </View>
            {/* The ring fills as you walk; a full ring shows the golden shark it unlocks (no units to read). */}
            {p.boostReady ? <Image source={ART.golden} style={{ width: 34, height: 34, marginLeft: 8 }} resizeMode="contain" /> : null}
          </View>
        ) : null}
        {p.incomingSplats > 0 ? (
          <Text style={styles.incoming}>{`INCOMING: ${p.incomingSplats} CANDY SPLAT${p.incomingSplats > 1 ? 'S' : ''}. 3 QUICK HITS IN A ROW BLOCK ONE`}</Text>
        ) : null}
        <View style={styles.nextWrap} accessibilityLabel={p.bossNext ? `Boss run: ${p.nextBanner}` : `Next: ${p.nextBanner}`}>
          <GameIcon name="arrow" size={18} />
          <NextPreview shape={p.nextShape} theme={theme} boss={p.nextBoss} />
        </View>
      </View>
      </Animated.View>
      <View style={styles.thumbZone}>
        {p.feverReady && p.onFever ? (
          <Animated.View style={[styles.split, padStyle]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go and save the fever" onPress={p.readyEnabled ? p.onReady : undefined}
              style={styles.go}>
              <Text style={styles.goText}>GO</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Go with fever, 7 seconds of double points" onPress={p.readyEnabled ? p.onFever : undefined}
              style={styles.goFever}>
              <GameIcon name="streak" size={40} />
              <Text style={styles.goText}>GO</Text>
              <View style={styles.multBadge}><Text style={styles.multText}>x2</Text></View>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={padStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ready for the next Burst" onPress={p.readyEnabled ? p.onReady : undefined}
              style={styles.ready}>
              <Text style={styles.readyText}>GO</Text>
            </Pressable>
          </Animated.View>
        )}
        {p.canBank ? (
          <Animated.View style={padStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Keep your points and finish" onPress={p.onBank} style={styles.bank} hitSlop={10}>
              <GameIcon name="trophy" size={22} />
              <GameIcon name="check" size={20} />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

export function DuelCard({ me, rival, rivalName, winner, wins, onEmote }: {
  me: number; rival: number; rivalName: string; winner: 'me' | 'rival' | 'tie'; wins: [number, number]; onEmote?: (id: number) => void;
}) {
  const tug = useSharedValue(0.5);
  useEffect(() => {
    const share = me + rival > 0 ? me / (me + rival) : 0.5;
    tug.value = withDelay(300, withTiming(share, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [me, rival, tug]);
  const fill = useAnimatedStyle(() => ({ width: `${tug.value * 100}%` }));
  return (
    <View style={styles.duel}>
      <Text style={styles.duelTitle}>{winner === 'me' ? 'BURST TO YOU!' : winner === 'rival' ? `BURST TO ${rivalName.toUpperCase()}` : 'DEAD HEAT!'}</Text>
      <View style={styles.duelRow}>
        <Text style={styles.duelScore}>{me.toLocaleString()}</Text>
        <Text style={styles.duelWins}>{`${wins[0]} - ${wins[1]}`}</Text>
        <Text style={[styles.duelScore, { color: CORAL }]}>{rival.toLocaleString()}</Text>
      </View>
      <View style={styles.tug}>
        <Animated.View style={[styles.tugFill, fill]} />
      </View>
      {onEmote ? (
        <View style={styles.emotes}>
          {['NICE!', 'GG', 'REMATCH?'].map((label, i) => (
            <Pressable key={label} onPress={() => onEmote(i)} style={styles.emote} hitSlop={6}>
              <Text style={styles.emoteText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  plate: {
    maxWidth: '86%', backgroundColor: CREAM, borderRadius: 20, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 16, paddingVertical: 4,
    alignItems: 'center', shadowColor: NAVY, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 0, elevation: 3,
  },
  plateGold: { backgroundColor: GOLD },
  bannerText: { fontFamily: 'Shark', fontSize: 30, color: NAVY, textAlign: 'center' },
  bannerTextGold: { color: '#5a3200' },
  bannerSub: { fontFamily: 'Shark', fontSize: 16, color: BLUE, textAlign: 'center' },
  pips: { flexDirection: 'row', marginBottom: 2 },
  pip: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: NAVY, backgroundColor: '#ffffff', marginHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  pipOn: { backgroundColor: GOLD },
  pipNow: { transform: [{ scale: 1.2 }] },
  pipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: NAVY },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  runPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 2, borderColor: NAVY, paddingHorizontal: 10, paddingVertical: 2 },
  starRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, alignSelf: 'stretch', paddingHorizontal: 18 },
  starTrackWrap: { flex: 1, marginHorizontal: 8, justifyContent: 'center' },
  bestMark: { position: 'absolute', top: -14, marginLeft: -8 },
  starTrack: { height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: NAVY, backgroundColor: '#ffffff', overflow: 'hidden' },
  starFill: { height: '100%', backgroundColor: GOLD },
  ringIcon: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  nextWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  nextArt: { width: 44, height: 44 },
  nextBossArt: { width: 70, height: 56 },
  nextBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: NAVY, marginLeft: -12, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  xBar: { position: 'absolute', width: 12, height: 3, borderRadius: 2, backgroundColor: NAVY },
  multBadge: { position: 'absolute', top: -10, right: -8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 7, paddingVertical: 1 },
  multText: { fontFamily: 'Shark', fontSize: 18, color: NAVY },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(191,229,255,0.35)' },
  card: {
    marginHorizontal: 16, backgroundColor: CREAM, borderRadius: 22, borderWidth: 4, borderColor: NAVY,
    paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center',
  },
  cardKicker: { fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1.5, color: BLUE },
  cardScore: { fontFamily: 'Shark', fontSize: 48, color: GOLD, marginLeft: 6, minWidth: 120, textAlign: 'left',
    textShadowColor: '#7a4300', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  cardRun: { fontFamily: 'Shark', fontSize: 18, color: BLUE, marginLeft: 6 },
  chips: { flexDirection: 'row', marginTop: 10 },
  chip: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 4, alignItems: 'center' },
  chipValue: { fontFamily: 'Shark', fontSize: 18, color: NAVY, marginLeft: 5 },
  chipLabel: { fontFamily: 'Knockout', fontSize: 11, color: BLUE, letterSpacing: 1 },
  duelLine: { fontFamily: 'Shark', fontSize: 18, color: CORAL, marginTop: 8 },
  splitChip: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 2, borderColor: NAVY },
  splitText: { fontFamily: 'Shark', fontSize: 16, marginLeft: 6 },
  goal: { fontFamily: 'Knockout', fontSize: 15, color: NAVY, marginTop: 8 },
  walkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  walkTitle: { fontFamily: 'Shark', fontSize: 17, color: NAVY, marginLeft: 8 },
  walkSub: { fontFamily: 'Knockout', fontSize: 13, color: BLUE },
  incoming: { fontFamily: 'Knockout', fontSize: 13, color: CORAL, marginTop: 8, textAlign: 'center' },
  next: { fontFamily: 'Shark', fontSize: 18, color: BLUE, marginTop: 10 },
  feverHint: { fontFamily: 'Knockout', fontSize: 13, color: NAVY, marginTop: 4, textAlign: 'center' },
  split: { flexDirection: 'row', alignItems: 'center' },
  go: {
    width: 128, height: 88, borderRadius: 44, backgroundColor: '#ffffff', borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  goFever: {
    width: 196, height: 96, borderRadius: 48, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center',
  },
  goText: { fontFamily: 'Shark', fontSize: 30, color: NAVY },
  thumbZone: { position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' },
  ready: {
    width: 240, height: 92, borderRadius: 46, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center',
  },
  readyText: { fontFamily: 'Shark', fontSize: 40, color: NAVY },
  readySub: { fontFamily: 'Knockout', fontSize: 13, color: NAVY, marginTop: -4 },
  bank: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18, backgroundColor: '#ffffff', borderWidth: 3, borderColor: NAVY },
  bankText: { fontFamily: 'Shark', fontSize: 17, color: NAVY },
  duel: { marginTop: 10, alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 3, borderColor: NAVY, padding: 10, alignItems: 'center' },
  duelTitle: { fontFamily: 'Shark', fontSize: 22, color: NAVY },
  duelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4 },
  duelScore: { fontFamily: 'Shark', fontSize: 24, color: BLUE },
  duelWins: { fontFamily: 'Shark', fontSize: 18, color: NAVY },
  tug: { height: 16, alignSelf: 'stretch', borderRadius: 8, backgroundColor: CORAL, borderWidth: 3, borderColor: NAVY, overflow: 'hidden', marginTop: 6 },
  tugFill: { height: '100%', backgroundColor: '#00a5f5' },
  emotes: { flexDirection: 'row', marginTop: 8 },
  emote: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: CREAM, borderWidth: 2, borderColor: NAVY, marginHorizontal: 4 },
  emoteText: { fontFamily: 'Shark', fontSize: 14, color: NAVY },
});
