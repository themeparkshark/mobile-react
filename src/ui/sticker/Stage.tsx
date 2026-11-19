/**
 * Stage: the window of Alex's underwater light and rays for the one hero thing on a screen (a won
 * coin, an offer chest). DIRECTION.md kit: Stage; kit.css .stage. A navy-lined rounded window with
 * his stage water, his rays at 42 percent and the tinted rays at 85 percent, an inset highlight and
 * a hard drop. The rays sway a little, slowly: the screen's one loop, on the UI thread; still under
 * Reduce Motion. Level 2: it lives inside a page, and takes the page's inner width by default.
 *
 * The hero never gives up size first. With `hero` the stage `grow`s into the height its page
 * leaves and draws the hero at least `hero.min` (winHeroSize: 110 on the SE, about 145 on the
 * 17 Pro). When the room is short the window shrinks under it and the hero breaks the window's
 * top edge (art breaks the box), inside the stage's own box, so nothing above is ever covered.
 *
 * Landing (`landDelay`): a gold "next" spot waits where the hero lands; the hero falls in, lands
 * with a squash on a spring (0.92, then past 1 and back), one white ring pulses out behind it and
 * the board's sparkles (Alex's sparkle file) pop on and stay. Reduce Motion: a 150 ms fade, no ring, sparkles still.
 * `corner`: a sticker on the window's top-left corner (Alex's NEW!), stuck on at its delay.
 */
import { memo, useEffect, useState, type ReactNode } from 'react';
import { Image, View, type LayoutChangeEvent, type StyleProp } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SPRING } from '../motion';
import useUiReducedMotion from '../useUiReducedMotion';
import Arrive from './Arrive';
import Spot from './Spot';
import { usePageWidth } from './StickerContext';
import { useLandOn } from './motion';
import { ART, ART_RATIO } from './art';
import type { LayoutStyle } from './style';
import { DROP, INK, SHADE, SPACE, STAGE, STICK, TAG } from './tokens';

export type StageProps = {
  /** Default: the page's inner width. */
  readonly width?: number;
  /** A fixed window height (an offer chest). With `hero` the stage grows into the room it is given instead. */
  readonly height?: number;
  /** The hero thing, centred over the window (it may overflow it). */
  readonly children?: ReactNode;
  /** The one hero, drawn at a size the stage picks (never under `min`). */
  readonly hero?: { readonly min: number; readonly render: (size: number) => ReactNode };
  /** What VoiceOver says about the hero ("Walt Statue coin"). */
  readonly label?: string;
  /** The hero lands on the stage after this many ms. Absent: it is just there. */
  readonly landDelay?: number;
  /** A sticker on the window's top-left corner (Alex's NEW!), stuck on after `delay`. */
  readonly corner?: { readonly node: ReactNode; readonly delay?: number };
  readonly style?: StyleProp<LayoutStyle>;
};

/** The room under the hero's bottom inside the window, and the least window when the hero breaks out. */
const PAD = SPACE.base * 2;
const MIN_WINDOW = 64;

/** The won coin's least size on a phone of this height: 110 on the SE, about 145 on the 17 Pro, at most 150. Pure, tested. */
export function winHeroSize(windowHeight: number): number {
  return Math.max(110, Math.min(150, Math.round(windowHeight * 0.165)));
}

/**
 * Where the window and the hero sit in a stage box `box` tall (pure, tested). If the hero fits at
 * 86 percent of the box, the window is the whole box and the hero is centred. Else the hero keeps
 * `min`, stands on the box's bottom (PAD up), and the window starts a third of the way down the
 * hero: the hero breaks its top edge, inside the box.
 */
export function stageLayout(box: number, min: number): { readonly hero: number; readonly heroTop: number; readonly windowTop: number; readonly windowHeight: number } {
  const full = Math.round(box * 0.86);
  if (full >= min) return { hero: full, heroTop: Math.round((box - full) / 2), windowTop: 0, windowHeight: box };
  const heroTop = Math.max(0, box - PAD - min);
  const windowTop = Math.min(heroTop + Math.round(min * 0.35), Math.max(0, box - MIN_WINDOW));
  return { hero: min, heroTop, windowTop, windowHeight: box - windowTop };
}

/** The least box a hero stage takes: the hero and its pad, so it never needs to reach above itself. */
export function stageMinBox(min: number): number {
  return min + PAD * 2;
}

const SPARKLES = [{ x: 0.86, y: 0.2, s: 22 }, { x: 0.13, y: 0.7, s: 16 }, { x: 0.78, y: 0.8, s: 12 }] as const;

/** One of the board's sparkles (Alex's sparkle file): pops on when the hero lands, then stays still. */
function Sparkle({ x, y, s, at, reduced }: { x: number; y: number; s: number; at: number; reduced: boolean }) {
  const v = useSharedValue(at < 0 ? 1 : 0);
  useEffect(() => {
    if (at < 0) return;
    v.value = reduced ? withDelay(at, withTiming(1, { duration: STICK.reducedFadeMs })) : withDelay(at, withSpring(1, SPRING.pop));
  }, [at, reduced, v]);
  const style = useAnimatedStyle(() => (reduced ? { opacity: v.value } : { opacity: Math.min(1, v.value * 2), transform: [{ scale: v.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - s / 2, top: y - s / 2 }, style]}>
      <Image source={ART.sparkle} resizeMode="contain" fadeDuration={0} style={{ width: s * ART_RATIO.sparkle, height: s }} />
    </Animated.View>
  );
}

/** The hero landing: falls in, squashes on a spring as it lands, a white ring pulses out behind it; the waiting spot fades. */
function Landing({ delay, fall, size, children }: { readonly delay: number; readonly fall: number; readonly size: number; readonly children?: ReactNode }) {
  const reduced = useUiReducedMotion();
  const style = useLandOn(delay, fall);
  const hit = delay + 260;
  const squash = useSharedValue(1);
  const ring = useSharedValue(0);
  const wait = useSharedValue(1);
  useEffect(() => {
    wait.value = withDelay(delay + STICK.fadeInMs, withTiming(0, { duration: STICK.reducedFadeMs, easing: Easing.out(Easing.quad) }));
    if (reduced) return;
    squash.value = withDelay(hit, withSequence(withTiming(0.92, { duration: 80, easing: Easing.out(Easing.quad) }), withSpring(1, SPRING.stamp)));
    ring.value = withDelay(hit, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
  }, [delay, hit, reduced, ring, squash, wait]);
  const squashStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 2 - squash.value }, { scaleY: squash.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value > 0 && ring.value < 1 ? 0.7 * (1 - ring.value) : 0, transform: [{ scale: 0.8 + 0.6 * ring.value }] }));
  const waitStyle = useAnimatedStyle(() => ({ opacity: wait.value }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, waitStyle]}><Spot state="next" size={Math.round(size * 0.8)} /></Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 4, borderColor: INK.white }, ringStyle]} />
      <Animated.View style={style}><Animated.View style={squashStyle}>{children}</Animated.View></Animated.View>
    </View>
  );
}

function StageImpl({ width: widthProp, height, children, hero, label, landDelay, corner, style }: StageProps) {
  const reduced = useUiReducedMotion();
  const pageWidth = usePageWidth();
  const width = widthProp ?? pageWidth;
  const sway = useSharedValue(0);
  const [box, setBox] = useState(0);
  useEffect(() => {
    if (reduced) { sway.value = 0; return undefined; }
    sway.value = withRepeat(withTiming(1, { duration: STAGE.swayMs, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(sway);
  }, [reduced, sway]);
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${STAGE.sway * (sway.value * 2 - 1)}deg` }] }));
  const grow = !!hero && height === undefined;
  const onLayout = grow ? (e: LayoutChangeEvent) => { const h = Math.round(e.nativeEvent.layout.height); setBox(b => (b === h ? b : h)); } : undefined;
  const boxH = grow ? box : height ?? 0;
  const lay = hero ? stageLayout(boxH, hero.min) : { hero: 0, heroTop: 0, windowTop: 0, windowHeight: boxH };
  const wh = lay.windowHeight;
  const rays = Math.round(width * STAGE.rays);
  const waterH = Math.round((width * 1.31) / ART_RATIO.stageWater);
  const outer = grow ? [{ width, flexGrow: 1, minHeight: stageMinBox(hero.min) }, style] : [{ width, height: boxH }, style];
  // A growing stage draws once it knows its height (the page is still being stuck on: nothing pops).
  if (grow && !box) return <View style={outer} onLayout={onLayout} />;
  const heroNode = hero ? hero.render(lay.hero) : children;
  const landAt = landDelay ?? -1;
  return (
    <View style={outer} onLayout={onLayout} accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: lay.windowTop + DROP.cardInPage, height: wh, borderRadius: STAGE.radius, backgroundColor: DROP.inPage }} />
      <View style={{ position: 'absolute', left: 0, top: lay.windowTop, width, height: wh, borderRadius: STAGE.radius, borderWidth: STAGE.line, borderColor: INK.navy, overflow: 'hidden', backgroundColor: SHADE.stageWater }}>
        <Image source={ART.stageWater} resizeMode="cover" fadeDuration={0} style={{ position: 'absolute', left: -width * 0.155, top: 0, width: width * 1.31, height: Math.max(waterH, wh) }} />
        <Animated.View style={[{ position: 'absolute', left: (width - rays) / 2 - STAGE.line, top: (wh - rays) / 2 - STAGE.line, width: rays, height: rays }, raysStyle]}>
          <Image source={ART.rays} fadeDuration={0} style={{ position: 'absolute', width: rays, height: rays, opacity: STAGE.raysOpacity }} />
          <Image source={ART.raysTint} fadeDuration={0} style={{ position: 'absolute', width: rays, height: rays, opacity: STAGE.tintOpacity }} />
        </Animated.View>
        {hero ? SPARKLES.map((p, i) => <Sparkle key={i} x={width * p.x} y={wh * p.y} s={p.s} at={landAt < 0 ? -1 : landAt + 300 + i * 90} reduced={reduced} />) : null}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: STAGE.radius - STAGE.line, borderTopWidth: 3, borderColor: SHADE.shine35 }} />
      </View>
      {hero ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, width, top: lay.heroTop, height: lay.hero, alignItems: 'center' }}>
          {landDelay === undefined ? heroNode : <Landing delay={landDelay} fall={boxH * 0.8} size={lay.hero}>{heroNode}</Landing>}
        </View>
      ) : (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width, height: wh, alignItems: 'center', justifyContent: 'center' }}>
          {landDelay === undefined ? children : <Landing delay={landDelay} fall={wh * 0.8} size={Math.min(width, wh)}>{children}</Landing>}
        </View>
      )}
      {corner ? (
        <Arrive delay={corner.delay ?? 0} style={{ position: 'absolute', left: SPACE.base * 2, top: lay.windowTop - SPACE.base }}>
          {() => <View style={{ transform: [{ rotate: `${-TAG.tilt}deg` }] }}>{corner.node}</View>}
        </Arrive>
      ) : null}
    </View>
  );
}

const Stage = memo(StageImpl);
export default Stage;
