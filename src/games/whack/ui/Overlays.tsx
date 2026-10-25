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
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Canvas, Path, Skia, rect } from '@shopify/react-native-skia';
import { CountUpText } from '../../../gamekit/fx/CountUpText';
import GameIcon from '../../../ui/GameIcon';
import { DURATION, SPRING } from '../../../ui/motion';
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
  /** The roll's last digit landed (the caller plays the gold pop). */
  onRollDone?: () => void;
  /**
   * Wall clock (ms) the card lands on. The card mounts early, hidden, and its entrance, the veil and the roll are
   * scheduled on the UI thread from this time, so a busy JS thread never leaves an empty board (r5: 750 ms).
   */
  enterAt?: number;
  /** The repeat card of a middle Burst: the same beats, about 60 percent as long. */
  quick?: boolean;
  /** Sharks bonked this Burst: drawn as a row of shark heads (w5, no numbers to read). */
  bonks?: number;
  /** Best combo this Burst: drawn as a flame that grows with it. */
  bestStreak?: number;
}

/** The banked roll (r6): starts as the card lands, never on 0, and climbs long enough to read. */
// w5r2: landMs 0, so the number is already climbing on the card's first visible frame (it used to sit on
// its first value for about 300 ms in release captures).
export const BREATHER_ROLL = { landMs: 0, ms: 720, fromShare: 0.2, punch: 1.22 } as const;
export const BREATHER_ROLL_QUICK = { landMs: 0, ms: 460, fromShare: 0.2, punch: 1.18 } as const;
/** The gold rim flash as the card lands (ms after it starts rising): the card's money frame. */
export const RIM_FLASH = { at: 90, inMs: 70, outMs: 420 } as const;
/** The flame chip puffs up after the last shark head (ms after the heads start). */
export const FLAME_PUFF_AFTER_MS = 60;
/** The GO pad's one-time shine sweep, after it pops in (finite: nothing loops while the card waits). */
export const PAD_SHINE = { delayMs: 240, ms: 560 } as const;
/** The veil under the card: a light frost that keeps the board in its own blue, white and gold (never grey). */
export const BREATHER_VEIL = 'rgba(236,248,255,0.16)';
const ROLL_EASE = Easing.out(Easing.quad);
/** Gold sparkles in the roll's end pop (capped; none with Reduce Motion). */
const POP_SPARKS = 6;

/** The first number the roll shows: a fifth of the total, so the card never says +0 for points you earned. */
export function breatherRollFrom(total: number): number {
  return total > 0 ? Math.max(1, Math.round(total * BREATHER_ROLL.fromShare)) : 0;
}

/** Sharks bonked as a row of shark heads (w5 picture stats): one lit head per BONKS_PER_HEAD bonks, up to BONK_HEADS. */
export const BONK_HEADS = 5;
export const BONKS_PER_HEAD = 5;
export function bonkHeadsLit(bonks: number): number {
  return bonks <= 0 ? 0 : Math.min(BONK_HEADS, Math.ceil(bonks / BONKS_PER_HEAD));
}
/** The best combo as a flame that grows with it: 4 sizes (pt), the combo badge's own tiers (3, 6, 10). */
export function streakFlameSize(streak: number): number {
  return streak >= 10 ? 34 : streak >= 6 ? 28 : streak >= 3 ? 23 : 18;
}
/** The heads light one by one while the roll climbs (UI thread), starting this long after the card lands. */
export const HEADS_START_MS = 200;
export const HEAD_STEP_MS = 90;

/** One shark head of the bonk row: lit heads pop in on the card's UI clock; the rest wait as pale outlines. */
function BonkHead({ lit, at, src, reduced }: { lit: boolean; at: number; src: number; reduced?: boolean }) {
  const v = useSharedValue(lit && !reduced ? 0 : 1);
  useEffect(() => {
    if (!lit || reduced) return;
    v.value = withDelay(at, withSequence(withTiming(1.22, { duration: 110, easing: EASE.out }), withSpring(1, SPRING.settle)));
  }, [lit, at, reduced, v]);
  const style = useAnimatedStyle(() => ({ opacity: lit ? Math.min(1, v.value * 2) : 1, transform: [{ scale: lit ? v.value : 1 }] }));
  return <Animated.Image source={src} style={[styles.head, lit ? null : styles.headOff, style]} resizeMode="contain" />;
}

/** The best-combo flame: it puffs up on the card's UI clock after the heads, with a soft white puff behind it. */
function FlamePuff({ size, at, reduced }: { size: number; at: number; reduced?: boolean }) {
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(at, withTiming(1, { duration: 420, easing: Easing.linear }));
  }, [at, reduced, v]);
  const flameStyle = useAnimatedStyle(() => {
    const t = v.value;
    // 0.6 -> 1.4 in the first quarter, then settle to 1 (one overshoot, no wobble).
    const k = t < 0.25 ? 0.6 + 0.8 * (t / 0.25) : 1.4 - 0.4 * Math.min(1, (t - 0.25) / 0.45);
    return { transform: [{ scale: reduced ? 1 : k }] };
  });
  const puffStyle = useAnimatedStyle(() => {
    const t = v.value;
    return { opacity: t <= 0 || t >= 1 ? 0 : 0.8 * (1 - t), transform: [{ scale: 0.5 + 1.1 * t }] };
  });
  return (
    <View style={styles.flameBox}>
      {reduced ? null : <Animated.View pointerEvents="none" style={[styles.puff, puffStyle]} />}
      <Animated.View style={flameStyle}><GameIcon name="streak" size={size} /></Animated.View>
    </View>
  );
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

/** One gold sparkle of the roll's end pop: out from the number on the pop clock, then gone (UI thread). */
function PopSpark({ k, pop }: { k: number; pop: SharedValue<number> }) {
  const ang = (k / POP_SPARKS) * Math.PI * 2 - Math.PI / 2;
  const style = useAnimatedStyle(() => {
    const v = pop.value;
    const r = 26 + 54 * v;
    return {
      opacity: v <= 0 || v >= 1 ? 0 : 1 - v * v,
      transform: [{ translateX: Math.cos(ang) * r * 1.5 }, { translateY: Math.sin(ang) * r }, { rotate: `${45 + v * 90}deg` }, { scale: 1.1 - 0.6 * v }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.popSpark, k % 2 ? styles.popSparkWhite : null, style]} />;
}

export function Breather(p: BreatherProps) {
  const pad = useSharedValue(0);
  const enter = useSharedValue(0);
  const pop = useSharedValue(0);
  const rim = useSharedValue(0);
  const shine = useSharedValue(0);
  // How long until the card lands, fixed at mount (the parent mounts the card early, hidden).
  const enterIn = React.useRef(Math.max(0, (p.enterAt ?? 0) - Date.now())).current;
  const rollFrom = React.useRef(breatherRollFrom(p.burstScore)).current;
  const roll = p.quick ? BREATHER_ROLL_QUICK : BREATHER_ROLL;
  useEffect(() => {
    // The card rises out of the FINISH! rings onto a calm board: up from below, settling with no wobble, on
    // a UI-thread delay so it lands on time however busy JS is.
    enter.value = withDelay(enterIn, p.reduced ? withTiming(1, { duration: DURATION.quick }) : withSpring(1, SPRING.settle));
    // The roll's payoff: a gold ring and a few sparkles burst from the number on its last digit.
    if (!p.reduced && p.burstScore > 0) pop.value = withDelay(enterIn + roll.landMs + roll.ms, withTiming(1, { duration: 460, easing: EASE.out }));
    // The money frame: a gold rim flashes round the card as it lands, then fades (UI thread, finite).
    if (!p.reduced) {
      rim.value = withDelay(enterIn + RIM_FLASH.at, withSequence(
        withTiming(1, { duration: RIM_FLASH.inMs, easing: EASE.out }),
        withTiming(2, { duration: RIM_FLASH.outMs, easing: EASE.out }),
      ));
    }
  }, [enter, pop, rim, enterIn, roll, p.reduced, p.burstScore]);
  const rimStyle = useAnimatedStyle(() => {
    const r = rim.value;
    return { opacity: r <= 0 || r >= 2 ? 0 : r <= 1 ? r : 2 - r, transform: [{ scale: 1 + 0.035 * Math.min(1, r) + 0.02 * Math.max(0, r - 1) }] };
  });
  const glowStyle = useAnimatedStyle(() => {
    const r = rim.value;
    return { opacity: r <= 0 || r >= 2 ? 0 : 0.45 * (r <= 1 ? r : 2 - r), transform: [{ scale: 1 + 0.06 * r }] };
  });
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pop.value <= 0 || pop.value >= 1 ? 0 : 0.95 * (1 - pop.value),
    transform: [{ scale: 0.5 + 1.3 * pop.value }],
  }));
  useEffect(() => {
    // r5: the pads are the last beat of the card stagger. They never sit ghosted: hidden until they can be
    // pressed, then they pop in at full strength on SPRING.pop with one pulse to draw the eye (and one more
    // after a quiet moment). Finite, so nothing loops while the card waits or the app is in the background.
    if (!p.readyEnabled) { pad.value = 0; shine.value = 0; return; }
    if (p.reduced) { pad.value = withTiming(1, { duration: DURATION.quick }); return; }
    // One shine sweeps across the pad once it is ready (w5r2: a landed pad never looks dead; finite).
    shine.value = 0;
    shine.value = withDelay(PAD_SHINE.delayMs, withTiming(1, { duration: PAD_SHINE.ms, easing: EASE.inOut }));
    pad.value = 0.8;
    pad.value = withSequence(
      withSpring(1, SPRING.pop),
      withDelay(2600, withTiming(1.06, { duration: 260, easing: EASE.out })),
      withTiming(1, { duration: 260, easing: EASE.inOut }),
    );
  }, [p.readyEnabled, p.reduced, pad, shine]);
  const shineStyle = useAnimatedStyle(() => {
    const v = shine.value;
    return { opacity: v <= 0 || v >= 1 ? 0 : 0.55, transform: [{ translateX: -70 + v * 340 }, { rotate: '20deg' }] };
  });
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
      {p.reduced ? null : <Animated.View pointerEvents="none" style={[styles.rimGlow, glowStyle]} />}
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
          <Animated.View pointerEvents="none" style={[styles.popRing, ringStyle]} />
          {p.reduced || p.burstScore <= 0 ? null : Array.from({ length: POP_SPARKS }, (_, k) => <PopSpark key={k} k={k} pop={pop} />)}
          <GameIcon name="coins" size={34} />
          <CountUpText value={p.burstScore} fromValue={rollFrom} reducedMotion={p.reduced} prefix="+" delayMs={enterIn + roll.landMs}
            durationMs={roll.ms} easing={ROLL_EASE} punch={roll.punch} punchAt="end" tickEvery={tickEvery} onTick={p.onCountTick}
            onDone={p.onRollDone} style={styles.cardScore} />
        </View>
        {p.bonks != null ? (
          // w5 picture stats: a row of shark heads for the sharks bonked, a flame that grows with the best combo.
          <View style={styles.chips}>
            <View style={[styles.chip, styles.headsChip]} accessibilityLabel={`Sharks bonked: ${p.bonks}`}>
              {Array.from({ length: BONK_HEADS }, (_, i) => (
                <BonkHead key={i} lit={i < bonkHeadsLit(p.bonks ?? 0)} at={enterIn + HEADS_START_MS + i * HEAD_STEP_MS}
                  src={THEMED_SHARK_FRAMES[theme][1]} reduced={p.reduced} />
              ))}
            </View>
            {(p.bestStreak ?? 0) > 0 ? (
              <View style={[styles.chip, styles.flameChip]} accessibilityLabel={`Best combo: ${p.bestStreak}`}>
                <FlamePuff size={streakFlameSize(p.bestStreak ?? 0)} reduced={p.reduced}
                  at={enterIn + HEADS_START_MS + BONK_HEADS * HEAD_STEP_MS + FLAME_PUFF_AFTER_MS} />
                <Text style={styles.flameValue}>{p.bestStreak}</Text>
              </View>
            ) : null}
          </View>
        ) : (
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
        )}
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
      {p.reduced ? null : <Animated.View pointerEvents="none" style={[styles.rim, rimStyle]} />}
      </Animated.View>
      <View style={styles.thumbZone}>
        {p.feverReady && p.onFever ? (
          <Animated.View style={[styles.split, padStyle]}>
            {/* r6: the two pads read with zero words. Plain GO is the everyday blue shark; GO x2 is the golden
                shark with the flame, so a non-reader can tell save the fever from use it. */}
            <Pressable accessibilityRole="button" accessibilityLabel="Go and save the fever" onPress={p.readyEnabled ? p.onReady : undefined}
              style={styles.go}>
              {p.reduced ? null : <View pointerEvents="none" style={styles.shineClip}><Animated.View style={[styles.shine, shineStyle]} /></View>}
              <Image source={THEMED_SHARK_FRAMES[theme][1]} style={styles.padShark} resizeMode="contain" />
              <Text style={styles.goText}>GO</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Go with fever, 7 seconds of double points" onPress={p.readyEnabled ? p.onFever : undefined}
              style={styles.goFever}>
              {p.reduced ? null : <View pointerEvents="none" style={styles.shineClip}><Animated.View style={[styles.shine, shineStyle]} /></View>}
              <Image source={ART.golden} style={styles.padShark} resizeMode="contain" />
              <GameIcon name="streak" size={34} />
              <Text style={styles.goText}>GO</Text>
              <View style={styles.multBadge}><Text style={styles.multText}>x2</Text></View>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View style={padStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ready for the next Burst" onPress={p.readyEnabled ? p.onReady : undefined}
              style={styles.ready}>
              {p.reduced ? null : <View pointerEvents="none" style={styles.shineClip}><Animated.View style={[styles.shine, shineStyle]} /></View>}
              <Text style={styles.readyText}>GO</Text>
            </Pressable>
          </Animated.View>
        )}
        {p.canBank ? (
          <Animated.View style={padStyle}>
            <Pressable accessibilityRole="button" accessibilityLabel="Keep your points and finish" onPress={p.onBank} style={styles.bank} hitSlop={10}>
              <GameIcon name="trophy" size={28} />
              <GameIcon name="check" size={24} />
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
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  popRing: { position: 'absolute', left: '50%', top: '50%', marginLeft: -48, marginTop: -48, width: 96, height: 96, borderRadius: 48, borderWidth: 6, borderColor: GOLD },
  popSpark: { position: 'absolute', left: '50%', top: '50%', marginLeft: -6, marginTop: -6, width: 12, height: 12, borderRadius: 2, backgroundColor: GOLD, borderWidth: 2, borderColor: NAVY },
  popSparkWhite: { backgroundColor: '#ffffff' },
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
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: BREATHER_VEIL },
  rim: { position: 'absolute', left: 12, right: 12, top: -4, bottom: -4, borderRadius: 26, borderWidth: 5, borderColor: GOLD },
  rimGlow: { position: 'absolute', left: 6, right: 6, top: -10, bottom: -10, borderRadius: 32, backgroundColor: '#fff3c4' },
  flameBox: { alignItems: 'center', justifyContent: 'center' },
  puff: { position: 'absolute', width: 34, height: 34, borderRadius: 17, backgroundColor: '#ffffff' },
  shineClip: { ...StyleSheet.absoluteFillObject, borderRadius: 40, overflow: 'hidden' },
  shine: { position: 'absolute', top: -20, bottom: -20, left: 0, width: 26, backgroundColor: '#ffffff' },
  card: {
    marginHorizontal: 16, backgroundColor: CREAM, borderRadius: 22, borderWidth: 4, borderColor: NAVY,
    paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center',
  },
  cardKicker: { fontFamily: 'Knockout', fontSize: 15, letterSpacing: 1.5, color: BLUE },
  cardScore: { fontFamily: 'Shark', fontSize: 54, color: GOLD, marginLeft: 6, minWidth: 120, textAlign: 'left',
    textShadowColor: '#7a4300', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  cardRun: { fontFamily: 'Shark', fontSize: 18, color: BLUE, marginLeft: 6 },
  chips: { flexDirection: 'row', marginTop: 10 },
  chip: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 3, borderColor: NAVY, paddingHorizontal: 10, paddingVertical: 4, marginHorizontal: 4, alignItems: 'center' },
  chipValue: { fontFamily: 'Shark', fontSize: 18, color: NAVY, marginLeft: 5 },
  headsChip: { paddingHorizontal: 6, height: 44 },
  head: { width: 29, height: 29, marginHorizontal: 1 },
  headOff: { opacity: 0.22 },
  flameChip: { height: 44, paddingLeft: 6, paddingRight: 10 },
  flameValue: { fontFamily: 'Shark', fontSize: 15, color: NAVY, marginLeft: 3 },
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
    width: 132, height: 88, borderRadius: 44, backgroundColor: '#ffffff', borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12, flexDirection: 'row',
  },
  goFever: {
    width: 196, height: 96, borderRadius: 48, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  padShark: { width: 40, height: 40, marginRight: 2 },
  goText: { fontFamily: 'Shark', fontSize: 30, color: NAVY },
  thumbZone: { position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' },
  ready: {
    width: 240, height: 92, borderRadius: 46, backgroundColor: GOLD, borderWidth: 4, borderColor: NAVY,
    borderBottomWidth: 9, alignItems: 'center', justifyContent: 'center',
  },
  readyText: { fontFamily: 'Shark', fontSize: 40, color: NAVY },
  readySub: { fontFamily: 'Knockout', fontSize: 13, color: NAVY, marginTop: -4 },
  // r6: a real 56 pt button with the pads' chunky bottom edge (was a small chip).
  bank: { marginTop: 14, minHeight: 56, minWidth: 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 22,
    borderRadius: 28, backgroundColor: '#ffffff', borderWidth: 4, borderBottomWidth: 7, borderColor: NAVY },
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
