/**
 * A warm crew, without chat: the crew strip's badges come alive.
 *
 * JOIN: a player who joins the crew drops into their seat from above
 * (SPRING.land), waves twice (0 to 15 degrees and back) and a gold "+1" bubble
 * rises and fades over 900 ms. Players who join together arrive 80 ms apart.
 * One tick buzz for the join (yours, on your phone).
 * STARS: when a player earns stars in a round, three solid gold hearts with a
 * white outline pop from their badge one after another (past full size, then
 * settle), fan out to 40 pt apart in the first fifth of the rise so they read as
 * three hearts, rise with a sideways drift over 1.2 s, a sparkle twinkles on the
 * badge and the badge bobs once. All three hearts are drawn in ONE small Skia
 * canvas that exists only while they fly (nothing is mounted between bursts).
 * The phone's own player (the first seat, the grown-up holding the phone) feels
 * a selection tick as each of their hearts pops; nobody else's stars ever buzz
 * the phone (rival and other players' events are quiet), and there is no sound
 * for them either.
 *
 * Motion only: the badge keeps its exact place in the row (transforms on a
 * wrapper, the hearts and the bubble float in an absolute layer above it), so
 * the strip looks the same at rest. UI thread only (Reanimated); one-shot, no
 * loops. Reduce Motion: no travel, the badge is simply there.
 */
import { Canvas, PaintStyle, Picture, Skia, StrokeJoin, createPicture } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { queueHaptic } from '../../../gamekit/Haptics';
import { playMoment } from '../../../gamekit/audio/playMoment';
import { GameIcon } from '../../../ui';
import { BRAND } from '../../../ui/tokens';
import { EASE, SPRING } from '../../../ui/motionEasing';

/** The crew moments' beat sheet (ms), pure numbers so tests can read them. */
export const CREW_FX = {
  dropPt: 20,
  waveDeg: 15,
  waveMs: 500,
  plusOneMs: 900,
  joinStaggerMs: 80,
  heartsMs: 1200,
  hearts: 3,
  /** Each heart pops this far into the rise after the one before it (fraction of heartsMs: about 0.14 s). */
  heartStep: 0.12,
  /** Hearts that waited behind the pass-the-phone card play one badge after another, this far apart (ms). */
  crewStaggerMs: 220,
} as const;

export const CrewBadgeFx = memo(function CrewBadgeFx({ joinOrder, starsKey, reduced, mine = false, covered = false, order = 0, children }: {
  /** Null when this badge was already in the crew; otherwise its place among the players joining now (0, 1, ...). */
  readonly joinOrder: number | null;
  /** Changes when this player earns stars (their running total); the first value never celebrates. */
  readonly starsKey: number;
  readonly reduced: boolean;
  /** The phone's own player: their hearts tick in the hand (nobody else's ever buzz). */
  readonly mine?: boolean;
  /** A pass-the-phone card covers the strip: new stars wait and celebrate once it is back on screen. */
  readonly covered?: boolean;
  /** The badge's seat in the strip: waiting hearts play one badge after another (CREW_FX.crewStaggerMs apart). */
  readonly order?: number;
  readonly children: ReactNode;
}) {
  // Only the order at mount matters (a badge is keyed by its player, so a new player mounts a new badge).
  const join = useRef(joinOrder).current;
  const drop = useSharedValue(join != null && !reduced ? 0 : 1);
  const wave = useSharedValue(0);
  const plus = useSharedValue(0);
  const hearts = useSharedValue(0);
  const bob = useSharedValue(0);
  const lastStars = useRef(starsKey);
  // The burst on screen (0: none). The hearts' canvas mounts for one burst and leaves when it ends.
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (join == null || reduced) return undefined;
    const delay = join * CREW_FX.joinStaggerMs;
    drop.value = 0;
    drop.value = withDelay(delay, withSpring(1, SPRING.land));
    const half = CREW_FX.waveMs / 4;
    wave.value = withDelay(delay + 180, withSequence(
      withTiming(1, { duration: half, easing: EASE.out }), withTiming(0, { duration: half, easing: EASE.inOut }),
      withTiming(1, { duration: half, easing: EASE.inOut }), withTiming(0, { duration: half, easing: EASE.in })));
    plus.value = withDelay(delay + 120, withTiming(1, { duration: CREW_FX.plusOneMs, easing: EASE.out }));
    // One tick for the join, only for the first of a group arriving together.
    if (join === 0) { queueHaptic('tickSelection'); playMoment('ui.toast'); }
    return () => { [drop, wave, plus].forEach(v => cancelAnimation(v)); };
    // One-shot per join (on mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Stars earned while the pass-the-phone card covers the strip wait for it: the hearts play when the strip is
    // back on screen (after the round's podium), one badge after another, so nobody's hearts play unseen.
    if (covered) return undefined;
    const before = lastStars.current;
    lastStars.current = starsKey;
    if (reduced || starsKey <= before) return undefined;
    // Hearts for a good round: quiet for everyone else (never a buzz or a sound for another player's moment).
    let off: ReturnType<typeof setTimeout> | null = null;
    const start = setTimeout(() => {
      hearts.value = 0;
      hearts.value = withTiming(1, { duration: CREW_FX.heartsMs, easing: EASE.out });
      bob.value = withSequence(withTiming(1, { duration: 140, easing: EASE.out }), withSpring(0, SPRING.stamp));
      setBurst(n => n + 1);
      off = setTimeout(() => setBurst(0), CREW_FX.heartsMs + 80);
    }, Math.max(0, order) * CREW_FX.crewStaggerMs);
    return () => { clearTimeout(start); if (off) clearTimeout(off); cancelAnimation(hearts); cancelAnimation(bob); };
  }, [starsKey, reduced, covered, order, hearts, bob]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2.5),
    transform: [
      { translateY: -CREW_FX.dropPt * (1 - drop.value) - 5 * bob.value },
      { rotate: `${CREW_FX.waveDeg * wave.value}deg` },
      { scale: 1 + 0.12 * bob.value },
    ],
  }));
  const plusStyle = useAnimatedStyle(() => {
    const t = plus.value;
    if (t <= 0 || t >= 1) return { opacity: 0 };
    // Pops in past full size (SPRING.pop feel), then rises and fades.
    const pop = t < 0.18 ? 0.6 + 0.65 * (t / 0.18) : t < 0.3 ? 1.25 - 0.25 * ((t - 0.18) / 0.12) : 1;
    return { opacity: t < 0.12 ? t / 0.12 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45, transform: [{ translateY: -30 * t }, { scale: pop }] };
  });

  const sparkStyle = useAnimatedStyle(() => {
    // A sparkle twinkles on the badge as the hearts leave it (one quick pop and turn).
    const k = hearts.value / 0.28;
    if (k <= 0 || k >= 1) return { opacity: 0 };
    return { opacity: k < 0.7 ? 1 : (1 - k) / 0.3, transform: [{ scale: k < 0.35 ? 1.3 * (k / 0.35) : 1.3 - 0.5 * ((k - 0.35) / 0.65) }, { rotate: `${90 * k}deg` }] };
  });

  return <View>
    <Animated.View style={badgeStyle}>{children}</Animated.View>
    <Animated.View pointerEvents="none" style={[styles.spark, sparkStyle]}><GameIcon name="sparkle" size={SPARK_SIZE} /></Animated.View>
    <View pointerEvents="none" style={styles.float}>
      <Animated.View style={[styles.plus, plusStyle]}><Text style={styles.plusText} allowFontScaling={false}>+1</Text></Animated.View>
    </View>
    {burst > 0 && <HeartsBurst key={burst} t={hearts} mine={mine} />}
  </View>;
});

/*
 * The heart's look and flight (declared before heartAt: a worklet captures the values it reads when it is
 * created, so constants declared after it would read as undefined on the UI thread).
 */
/** Gold, never red (red reads as a miss). Big enough to read at a glance (and on a contact sheet). */
const HEART_GOLD = '#ffc928';
export const HEART_SIZE = 30;
/** The white rim around each heart (pt per side). */
const HEART_OUTLINE = 3;
/** How far the outer hearts fan out sideways (40 pt apart: three separate hearts), and how high they all rise (pt). */
const HEART_FAN = 40;
const HEART_RISE = 62;
/** The hearts' canvas, centred over the 28 pt badge; a heart starts HEART_START above its bottom edge (on the badge). */
const HEARTS_W = 160;
const HEARTS_H = 132;
const HEART_START = 20;
/** Each heart's own flight, as a fraction of the burst (the last one, two steps late, ends with the burst). */
const HEART_LIFE = 0.76;
const SPARK_SIZE = 22;
/**
 * A real heart shape (the app's heart icon is a heart inside a round badge, which a gold tint turned into a plain gold
 * disc), code-drawn.
 */
const HEART_PATH = Skia.Path.MakeFromSVGString('M16 29 C 6 21.5, 1 15.5, 1 9.8 C 1 5.2, 4.6 2, 8.6 2 C 11.6 2, 14.2 3.8, 16 6.6 C 17.8 3.8, 20.4 2, 23.4 2 C 27.4 2, 31 5.2, 31 9.8 C 31 15.5, 26 21.5, 16 29 Z');

/**
 * Where heart `index` is at burst time `t` (0..1): it pops past full size (0.4 to 1.25, then 1) a beat after the one
 * before, opens to its place in the fan (40 pt apart) inside the first fifth of its rise, then rises with a small
 * sideways drift and stays solid until it is nearly gone. A worklet, read by the canvas; pure for tests.
 */
export function heartAt(t: number, index: number): { x: number; y: number; scale: number; rotate: number; opacity: number } {
  'worklet';
  const k = (t - index * CREW_FX.heartStep) / HEART_LIFE;
  if (k <= 0 || k >= 1) return { x: 0, y: 0, scale: 0, rotate: 0, opacity: 0 };
  // Solid gold to 85% of the rise, then it shrinks away as it fades (a see-through gold heart on the blue rail read
  // as a pale blue clump).
  const pop = (k < 0.12 ? 0.4 + 0.85 * (k / 0.12) : k < 0.24 ? 1.25 - 0.25 * ((k - 0.12) / 0.12) : 1) *
    (k > 0.85 ? 1 - 0.45 * ((k - 0.85) / 0.15) : 1);
  const open = Math.min(1, k / 0.2);
  const fan = 1 - (1 - open) * (1 - open);
  return {
    x: (index - 1) * HEART_FAN * fan + 4 * Math.sin(k * Math.PI * 2 + index),
    y: -HEART_RISE * k,
    scale: pop,
    rotate: (index - 1) * 0.2 * fan,
    opacity: k < 0.08 ? k / 0.08 : k < 0.85 ? 1 : (1 - k) / 0.15,
  };
}

/** The three hearts of one burst in one small canvas (mounted for the burst only). */
function HeartsBurst({ t, mine }: { readonly t: SharedValue<number>; readonly mine: boolean }) {
  // Your own hearts tick in the hand as each one pops (other players' never do).
  const tick = () => queueHaptic('tickSelection');
  useAnimatedReaction(() => {
    let popped = 0;
    for (let i = 0; i < CREW_FX.hearts; i += 1) if (t.value - i * CREW_FX.heartStep > 0.02) popped = i + 1;
    return popped;
  }, (now, before) => {
    if (mine && before !== null && before !== undefined && now > before) runOnJS(tick)();
  }, [mine]);
  // The three hearts drawn into one picture per frame on the UI thread (paints and the heart shape made once).
  const art = useMemo(() => {
    const k = HEART_SIZE / 32;
    const rim = Skia.Paint();
    rim.setAntiAlias(true);
    rim.setStyle(PaintStyle.Stroke);
    rim.setStrokeJoin(StrokeJoin.Round);
    rim.setStrokeWidth((HEART_OUTLINE * 2) / k);
    rim.setColor(Skia.Color(BRAND.white));
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    fill.setColor(Skia.Color(HEART_GOLD));
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setStyle(PaintStyle.Stroke);
    ink.setStrokeJoin(StrokeJoin.Round);
    ink.setStrokeWidth(1.4);
    ink.setColor(Skia.Color(BRAND.navy));
    const shine = Skia.Paint();
    shine.setAntiAlias(true);
    shine.setColor(Skia.Color('rgba(255,255,255,0.85)'));
    return { k, rim, fill, ink, shine, oval: Skia.XYWHRect(6, 5, 7, 5) };
  }, []);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!HEART_PATH) return;
    for (let i = 0; i < CREW_FX.hearts; i += 1) {
      const h = heartAt(t.value, i);
      if (h.opacity <= 0.01 || h.scale <= 0.01) continue;
      canvas.save();
      canvas.translate(HEARTS_W / 2 + h.x, HEARTS_H - HEART_START + h.y);
      canvas.rotate((h.rotate * 180) / Math.PI, 0, 0);
      canvas.scale(h.scale * art.k, h.scale * art.k);
      canvas.translate(-16, -16);
      // A thick white rim, a solid gold heart, a thin navy ink line like Alex's outlines and a white shine.
      art.rim.setAlphaf(h.opacity);
      art.fill.setAlphaf(h.opacity);
      art.ink.setAlphaf(h.opacity);
      art.shine.setAlphaf(0.85 * h.opacity);
      canvas.drawPath(HEART_PATH, art.rim);
      canvas.drawPath(HEART_PATH, art.fill);
      canvas.drawPath(HEART_PATH, art.ink);
      canvas.drawOval(art.oval, art.shine);
      canvas.restore();
    }
  }, { width: HEARTS_W, height: HEARTS_H }));
  return <Canvas pointerEvents="none" style={styles.hearts}><Picture picture={picture} /></Canvas>;
}


/** The "+1" is at least 22 pt tall. */
export const PLUS_FONT = 20;

const styles = StyleSheet.create({
  // Wider than the 28 pt badge, so the +1 bubble never wraps into a sliver; centred on the badge.
  float: { position: 'absolute', left: -30, right: -30, top: -4, alignItems: 'center' },
  plus: { position: 'absolute', top: -26, minHeight: 28, minWidth: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.gold, borderRadius: 14,
    borderWidth: 2.5, borderColor: BRAND.white, paddingHorizontal: 7,
    shadowColor: BRAND.navy, shadowOpacity: 0.35, shadowOffset: { width: 0, height: 2 }, shadowRadius: 0 },
  plusText: { fontFamily: 'Shark', fontSize: PLUS_FONT, lineHeight: 23, color: BRAND.navy },
  // Bottom edge 2 pt above the badge's bottom, centred on it: a heart starts on the badge's face.
  hearts: { position: 'absolute', left: 14 - HEARTS_W / 2, top: 26 - HEARTS_H, width: HEARTS_W, height: HEARTS_H },
  spark: { position: 'absolute', right: -8, top: -8 },
});
