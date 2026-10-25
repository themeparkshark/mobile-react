/**
 * A warm crew, without chat: the crew strip's badges come alive.
 *
 * JOIN: a player who joins the crew drops into their seat from above
 * (SPRING.land), waves twice (0 to 15 degrees and back) and a gold "+1" bubble
 * rises and fades over 900 ms. Players who join together arrive 80 ms apart.
 * One tick buzz for the join (yours, on your phone).
 * STARS: when a player earns stars in a round, three solid gold 34 pt hearts
 * with a white rim and a navy ink line pop out from behind their badge one after
 * another (pop, pop, pop, 0.24 s apart), each past full size then settling into
 * a halo around the badge, and each shrinks to nothing with a white sparkle pop
 * (opacity stays 1: no see-through olive hearts). The halo stays on the badge's
 * own row: never up over the ride card's words, never over the strip's line.
 * A sparkle twinkles on the badge and the badge bobs once. All three hearts are
 * drawn in ONE small Skia canvas that exists only while they play (nothing is
 * mounted between bursts), and a burst that has started always finishes and
 * unmounts (createHeartsQueue), whatever the strip does meanwhile.
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
  Easing, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withSequence, withSpring, withTiming,
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
  /** Each heart pops this far into the burst after the one before it (fraction of heartsMs: 0.24 s, pop, pop, pop). */
  heartStep: 0.2,
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

  // The hearts' trigger and their lifetime are kept apart (heartsQueue): once a burst starts it always finishes and its
  // canvas always leaves, whatever the strip does meanwhile (the pass-the-phone card coming back, Reduce Motion, a
  // new seat order). Only a burst that has not started yet waits for the strip.
  const queue = useRef<HeartsQueue | null>(null);
  const bursts = useRef(0);
  if (queue.current === null) {
    queue.current = createHeartsQueue(starsKey, {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: id => clearTimeout(id as ReturnType<typeof setTimeout>),
      start: () => {
        hearts.value = 0;
        // The UI clock ends the burst on its last frame; the queue's own safety timer ends it if this callback is dropped.
        hearts.value = withTiming(1, { duration: CREW_FX.heartsMs, easing: Easing.linear }, ok => { if (ok) runOnJS(endBurst)(); });
        bob.value = withSequence(withTiming(1, { duration: 140, easing: EASE.out }), withSpring(0, SPRING.stamp));
        bursts.current += 1;
        setBurst(bursts.current);
      },
      end: () => setBurst(0),
    });
  }
  function endBurst() { queue.current?.finish(); }
  useEffect(() => {
    // Stars earned while the pass-the-phone card covers the strip wait for it: the hearts play when the strip is
    // back on screen (after the round's podium), one badge after another, so nobody's hearts play unseen.
    // Hearts for a good round: quiet for everyone else (never a buzz or a sound for another player's moment).
    queue.current?.update(starsKey, { covered, reduced, order });
  }, [starsKey, reduced, covered, order]);
  useEffect(() => () => { queue.current?.dispose(); cancelAnimation(hearts); cancelAnimation(bob); }, [hearts, bob]);

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
    {/* The hearts pop out from BEHIND the badge (a halo of hearts around it), so the badge itself stays readable. */}
    {burst > 0 && <HeartsBurst key={burst} t={hearts} mine={mine} lean={order === 0 ? 'right' : 'left'} />}
    <Animated.View style={badgeStyle}>{children}</Animated.View>
    <Animated.View pointerEvents="none" style={[styles.spark, sparkStyle]}><GameIcon name="sparkle" size={SPARK_SIZE} /></Animated.View>
    <View pointerEvents="none" style={styles.float}>
      <Animated.View style={[styles.plus, plusStyle]}><Text style={styles.plusText} allowFontScaling={false}>+1</Text></Animated.View>
    </View>
  </View>;
});

/**
 * When a badge's hearts play, kept apart from React's effects (pure, unit tested): a rise in the stars is remembered
 * until the strip is on screen (not covered, Reduce Motion off), then the burst starts after the badge's turn in the
 * strip. A burst that has started always finishes: covering the strip, a new order or Reduce Motion never cancel it,
 * and `end` always runs (from the hearts' own last frame, or the safety timer heartsMs + 80 ms later). Stars that rise
 * during a burst play the next burst right after it.
 */
export type HeartsQueue = {
  update(starsKey: number, flags: { readonly covered: boolean; readonly reduced: boolean; readonly order: number }): void;
  finish(): void;
  dispose(): void;
  readonly playing: () => boolean;
};
export function createHeartsQueue(firstKey: number, io: {
  readonly setTimeout: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout: (id: unknown) => void;
  readonly start: () => void;
  readonly end: () => void;
}): HeartsQueue {
  let last = firstKey;
  let pending = false;
  let playing = false;
  let disposed = false;
  let flags = { covered: false, reduced: false, order: 0 };
  let startTimer: unknown = null;
  let endTimer: unknown = null;
  const cancelStart = () => { if (startTimer !== null) { io.clearTimeout(startTimer); startTimer = null; } };
  const kick = () => {
    if (disposed || playing || !pending || startTimer !== null) return;
    if (flags.reduced) { pending = false; return; }
    if (flags.covered) return;
    startTimer = io.setTimeout(() => {
      startTimer = null;
      if (disposed || playing || !pending || flags.covered || flags.reduced) return;
      pending = false;
      playing = true;
      io.start();
      endTimer = io.setTimeout(finish, CREW_FX.heartsMs + 80);
    }, Math.max(0, flags.order) * CREW_FX.crewStaggerMs);
  };
  function finish() {
    if (endTimer !== null) { io.clearTimeout(endTimer); endTimer = null; }
    if (!playing) return;
    playing = false;
    io.end();
    kick();
  }
  return {
    update(starsKey, next) {
      if (starsKey > last) pending = true;
      last = starsKey;
      flags = { covered: next.covered, reduced: next.reduced, order: next.order };
      // Waiting (not started) hearts follow the strip; a burst on screen is never touched.
      if (flags.covered || flags.reduced) cancelStart();
      kick();
    },
    finish,
    dispose() {
      disposed = true;
      cancelStart();
      if (endTimer !== null) { io.clearTimeout(endTimer); endTimer = null; }
      playing = false;
    },
    playing: () => playing,
  };
}

/*
 * The heart's look and flight (declared before heartAt: a worklet captures the values it reads when it is
 * created, so constants declared after it would read as undefined on the UI thread).
 */
/** Gold, never red (red reads as a miss). Big enough to read at a glance (and on a contact sheet). */
const HEART_GOLD = '#ffc928';
export const HEART_SIZE = 34;
/** The white rim around each heart (pt per side). */
const HEART_OUTLINE = 3;
/**
 * Wave 5 round 3: the hearts burst out around the badge like a halo (never up over the ride card's words above the
 * strip, never over the strip's own line to the right). Each heart pops out from behind the badge to HALO_R from its
 * centre, drifts out HALO_DRIFT more, then shrinks to nothing with a white sparkle pop. Opacity stays 1 the whole time
 * (a see-through gold heart on the blue rail read olive).
 */
const HALO_R = 18;
const HALO_DRIFT = 3;
/** Where the three hearts sit around the badge (degrees, 0 = right, -90 = straight up). */
export const HEART_ANGLES = {
  /** The first badge (the strip's left end): up-left, up and right, over the next badge. */
  right: [-150, -95, -38],
  /** Every other badge (the line of words starts right after the last one): left, up-left and up. */
  left: [-174, -131, -89],
} as const;
/** The hearts' canvas, centred on the 28 pt badge. */
const HEARTS_BOX = 120;
/** Each heart's own life, as a fraction of the burst; they pop CREW_FX.heartStep apart so it reads pop, pop, pop. */
const HEART_LIFE = 0.5;
const SPARK_SIZE = 22;
/** The white sparkle each heart becomes as it pops away (pt across at its biggest), over this part of its life. */
export const POP_SPARK = 18;
const SPARK_FROM = 0.86;
/** The last heart's sparkle is gone by the end of the burst: 2 x heartStep + HEART_LIFE x SPARK_END <= 1. */
export const SPARK_END = 1.18;
/**
 * A real heart shape (the app's heart icon is a heart inside a round badge, which a gold tint turned into a plain gold
 * disc), code-drawn.
 */
const HEART_PATH = Skia.Path.MakeFromSVGString('M16 29 C 6 21.5, 1 15.5, 1 9.8 C 1 5.2, 4.6 2, 8.6 2 C 11.6 2, 14.2 3.8, 16 6.6 C 17.8 3.8, 20.4 2, 23.4 2 C 27.4 2, 31 5.2, 31 9.8 C 31 15.5, 26 21.5, 16 29 Z');
/** A four-point sparkle (unit size 2, centred on 0,0). */
const SPARK_PATH = Skia.Path.MakeFromSVGString('M0 -1 C 0.12 -0.3, 0.3 -0.12, 1 0 C 0.3 0.12, 0.12 0.3, 0 1 C -0.12 0.3, -0.3 0.12, -1 0 C -0.3 -0.12, -0.12 -0.3, 0 -1 Z');

/**
 * Where heart `index` is at burst time `t` (0..1), relative to the badge's centre: it pops out from behind the badge
 * past full size (0.4 to 1.25, then 1) a beat after the one before, opens to its place in the halo inside the first
 * fifth of its life, drifts out a little with a small wobble, then shrinks to 0 (opacity stays 1) while a white
 * sparkle pops where it was (`spark`, 0..1). A worklet, read by the canvas; pure for tests.
 */
export function heartAt(t: number, index: number, lean: 'left' | 'right' = 'right'):
  { x: number; y: number; scale: number; rotate: number; opacity: number; spark: number } {
  'worklet';
  const k = (t - index * CREW_FX.heartStep) / HEART_LIFE;
  if (k <= 0 || k >= SPARK_END) return { x: 0, y: 0, scale: 0, rotate: 0, opacity: 0, spark: 0 };
  const deg = (lean === 'left' ? HEART_ANGLES.left : HEART_ANGLES.right)[index] ?? -90;
  const a = (deg * Math.PI) / 180;
  const open = Math.min(1, k / 0.2);
  const fan = 1 - (1 - open) * (1 - open);
  const r = 4 + (HALO_R - 4) * fan + HALO_DRIFT * Math.min(1, k);
  // Pop past full size, settle, hold, then shrink to nothing (ease-in) over the last fifth.
  const shrink = k < 0.8 ? 1 : k >= 1 ? 0 : 1 - ((k - 0.8) / 0.2) * ((k - 0.8) / 0.2);
  const pop = k < 0.12 ? 0.4 + 0.85 * (k / 0.12) : k < 0.24 ? 1.25 - 0.25 * ((k - 0.12) / 0.12) : 1;
  const wob = 0.08 * Math.sin(k * Math.PI * 3 + index);
  // The sparkle pops as the heart goes (0 to 1 over its own short life; it is biggest just as the heart is gone).
  const spark = k < SPARK_FROM ? 0 : Math.min(1, (k - SPARK_FROM) / (SPARK_END - SPARK_FROM));
  return {
    x: Math.cos(a) * r,
    y: Math.sin(a) * r,
    scale: k >= 1 ? 0 : pop * shrink,
    rotate: (a + Math.PI / 2) * 0.3 + wob,
    opacity: 1,
    spark,
  };
}

/** The three hearts of one burst in one small canvas (mounted for the burst only), behind the badge. */
function HeartsBurst({ t, mine, lean }: { readonly t: SharedValue<number>; readonly mine: boolean; readonly lean: 'left' | 'right' }) {
  // Your own hearts tick in the hand as each one pops (other players' never do).
  const tick = () => queueHaptic('tickSelection');
  useAnimatedReaction(() => {
    let popped = 0;
    for (let i = 0; i < CREW_FX.hearts; i += 1) if (t.value - i * CREW_FX.heartStep > 0.02) popped = i + 1;
    return popped;
  }, (now, before) => {
    if (mine && before !== null && before !== undefined && now > before) runOnJS(tick)();
  }, [mine]);
  // The three hearts drawn into one picture per frame on the UI thread (paints and the shapes made once).
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
    const sparkFill = Skia.Paint();
    sparkFill.setAntiAlias(true);
    sparkFill.setColor(Skia.Color(BRAND.white));
    const sparkInk = Skia.Paint();
    sparkInk.setAntiAlias(true);
    sparkInk.setStyle(PaintStyle.Stroke);
    sparkInk.setStrokeJoin(StrokeJoin.Round);
    sparkInk.setStrokeWidth(0.12);
    sparkInk.setColor(Skia.Color(BRAND.navy));
    return { k, rim, fill, ink, shine, sparkFill, sparkInk, oval: Skia.XYWHRect(6, 5, 7, 5) };
  }, []);
  const picture = useDerivedValue(() => createPicture(canvas => {
    if (!HEART_PATH || !SPARK_PATH) return;
    for (let i = 0; i < CREW_FX.hearts; i += 1) {
      const h = heartAt(t.value, i, lean);
      const cx = HEARTS_BOX / 2 + h.x;
      const cy = HEARTS_BOX / 2 + h.y;
      if (h.spark > 0.01 && h.spark < 0.99) {
        // The white sparkle pop where the heart was (navy ink line, like Alex's sparkles): grows and shrinks once.
        const s = (POP_SPARK / 2) * Math.sin(h.spark * Math.PI);
        canvas.save();
        canvas.translate(cx, cy);
        canvas.rotate(45 * h.spark, 0, 0);
        canvas.scale(s, s);
        canvas.drawPath(SPARK_PATH, art.sparkFill);
        canvas.drawPath(SPARK_PATH, art.sparkInk);
        canvas.restore();
      }
      if (h.scale <= 0.01) continue;
      canvas.save();
      canvas.translate(cx, cy);
      canvas.rotate((h.rotate * 180) / Math.PI, 0, 0);
      canvas.scale(h.scale * art.k, h.scale * art.k);
      canvas.translate(-16, -16);
      // A thick white rim, a solid gold heart, a thin navy ink line like Alex's outlines and a white shine.
      canvas.drawPath(HEART_PATH, art.rim);
      canvas.drawPath(HEART_PATH, art.fill);
      canvas.drawPath(HEART_PATH, art.ink);
      canvas.drawOval(art.oval, art.shine);
      canvas.restore();
    }
  }, { width: HEARTS_BOX, height: HEARTS_BOX }));
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
  // Centred on the 28 pt badge (the halo is drawn around its centre).
  hearts: { position: 'absolute', left: 14 - HEARTS_BOX / 2, top: 14 - HEARTS_BOX / 2, width: HEARTS_BOX, height: HEARTS_BOX },
  spark: { position: 'absolute', right: -8, top: -8 },
});
