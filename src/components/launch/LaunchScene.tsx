import { nativeSplashArtDrawn } from '../../nativeSplash';
import { memo, useEffect, useState } from 'react';
import { Dimensions, Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, {
  Easing, cancelAnimation, makeMutable, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import config from '../../config';
import useUiReducedMotion from '../../ui/useUiReducedMotion';

/**
 * Alex's launch art: the same picture as the native launch screen (ios SplashScreen.storyboard draws
 * splash-bg.png), saved as a 750-wide JPEG (about 240 KB, not the 2.3 MB 1080-wide PNG) so a busy
 * phone decodes it while the native splash is still up.
 */
export const LAUNCH_ART = require('../../../assets/images/launch-art.jpg');

/** The art has drawn once this launch: a later screen with the scene shows the bar at once. */
let launchArtDrawn = false;
// Start decoding the art the moment this module loads (Root imports it at app start, while the
// native splash is still up), so the scene's first frame already has its picture.
try {
  const uri = RNImage.resolveAssetSource(LAUNCH_ART)?.uri;
  if (uri) Image.prefetch(uri, 'memory-disk').catch(() => undefined);
} catch {
  // No asset resolver (tests): the scene still loads the art itself.
}
/** Same blue as the native splash (app.config.js splash.backgroundColor). */
export const LAUNCH_BLUE = '#0768B9';

/**
 * The one launch bar. Every screen that shows the launch scene (the Splash route, the Loading
 * screen and the map's first cover) draws this same shared value, so the bar is one bar from the
 * first second to the map: it never restarts, never jumps back, and a new screen picks it up
 * mid-move. Its moves run on the UI thread.
 */
export const launchFill: SharedValue<number> = makeMutable(0);

/** Move the launch bar forward to `share` (0 to 1) over `ms`. Never moves it back. */
export function moveLaunchBar(share: number, ms: number) {
  const to = Math.max(0, Math.min(1, share));
  if (to <= launchFill.value) return;
  launchFill.value = withTiming(to, { duration: ms, easing: ms > 600 ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad) });
}

/** The fun fact under the bar: picked once per launch, so it never swaps between screens. */
let launchFact: string | null = null;
export function setLaunchFact(fact: string | null | undefined) {
  if (!launchFact && fact) launchFact = fact;
}
export function getLaunchFact(): string | null {
  return launchFact;
}

/** The home-indicator inset, read once: every screen places the bar from the same number. */
const BOTTOM_INSET = initialWindowMetrics?.insets.bottom ?? 0;

/** The scene's own clock starts with the app, so bubbles carry on across screens without a restart. */
const SCENE_T0 = Date.now();

/** Bubbles rising through the art (where they start, how big, how long one rise takes). */
export const LAUNCH_BUBBLES = [
  { delay: 0, size: 8, left: 10, duration: 4500 },
  { delay: 1200, size: 5, left: 25, duration: 5000 },
  { delay: 600, size: 10, left: 45, duration: 4000 },
  { delay: 2000, size: 6, left: 65, duration: 4800 },
  { delay: 1500, size: 9, left: 80, duration: 4200 },
  { delay: 800, size: 7, left: 35, duration: 5200 },
  { delay: 2500, size: 4, left: 55, duration: 5500 },
  { delay: 3000, size: 11, left: 90, duration: 3800 },
  { delay: 1800, size: 6, left: 18, duration: 4600 },
  { delay: 400, size: 8, left: 72, duration: 4400 },
] as const;

/**
 * The launch scene: Alex's splash art (exactly as the native launch screen frames it), bubbles
 * rising through the water, the fun fact and the launch bar, all in the same spot on every screen
 * that shows it. A kid sees one living splash with one bar filling from the first second until the
 * map arrives, never a second loading screen. Every loop runs on the UI thread; Reduce Motion keeps
 * the water still (the bar still fills).
 */
function LaunchScene({ active = true, fact: givenFact }: {
  /** Off when the screen is under another one: the bubbles stop. */
  readonly active?: boolean;
  /** The fun fact (the Loading screen picks it); left out, the scene shows the one already picked. */
  readonly fact?: string | null;
}) {
  const { width, height } = Dimensions.get('window');
  const reduced = useUiReducedMotion();
  const fact = givenFact ?? getLaunchFact();
  // The fact fades in once, the first time it shows; a later screen shows it at once (no swap, no blink).
  const factIn = useSharedValue(fact ? 1 : 0);
  useEffect(() => {
    if (!fact) return;
    factIn.value = reduced ? 1 : withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) });
  }, [fact, reduced, factIn]);
  const factStyle = useAnimatedStyle(() => ({ opacity: factIn.value }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0, Math.min(1, launchFill.value)) }] }));
  const still = reduced || !active;
  // Until the art has drawn, the scene is only the native splash's own blue: the bar, the fact and
  // the bubbles wait for the picture, so a slow decode can never show an empty bar on a flat screen.
  // The bar keeps filling underneath, so it appears already moving.
  const [artIn, setArtIn] = useState(launchArtDrawn);
  const [barWidth, setBarWidth] = useState(0);
  const onArt = () => {
    launchArtDrawn = true;
    setArtIn(true);
    nativeSplashArtDrawn();
  };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.blue]}>
      <Image source={LAUNCH_ART} transition={0} contentFit="cover" accessible={false} cachePolicy="memory-disk" priority="high"
        onLoad={onArt} onError={onArt} style={{ width, height }} />
      {artIn && !still && LAUNCH_BUBBLES.map((b, i) => <Bubble key={i} bubble={b} rise={height * 0.6} />)}
      {/* The phone's own bottom inset (one fixed number), so the fact and bar sit in exactly the same
          spot on the Splash route, the Loading screen and the map's cover (no jump at a hand-off). */}
      <View style={[styles.bottom, { paddingBottom: BOTTOM_INSET, opacity: artIn ? 1 : 0 }]}>
        <View style={styles.column}>
          <Animated.View style={factStyle}>
            <Text style={styles.fact} numberOfLines={3}>{fact ?? ' '}</Text>
          </Animated.View>
          <View style={styles.rim} accessible accessibilityRole="progressbar" accessibilityLabel="Loading">
            <View style={styles.bar} onLayout={event => setBarWidth(event.nativeEvent.layout.width)}>
              <Animated.View style={[styles.barFill, fillStyle]} />
              {artIn && !still && barWidth > 0 && <BarShine width={barWidth} />}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * A soft white shine that sweeps along the filled part of the bar every second and a half, so even
 * a slow stretch of loading always looks alive. It never runs past the fill. UI thread only; off
 * with Reduce Motion and while the screen is under another one.
 */
function BarShine({ width }: { readonly width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 400 }), withTiming(0, { duration: 0 })), -1);
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const filled = Math.max(0, Math.min(1, launchFill.value)) * width;
    return {
      opacity: filled > SHINE_WIDTH ? 1 : 0,
      transform: [{ translateX: -SHINE_WIDTH + t.value * filled }, { skewX: '-20deg' }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.shine, style]} />;
}
const SHINE_WIDTH = 26;

/**
 * One bubble on the scene's clock: where it is in its rise comes from the time since launch, so the
 * Loading screen and the map's cover show the same bubble in the same place (no restart at hand-off).
 */
function Bubble({ bubble, rise }: { readonly bubble: (typeof LAUNCH_BUBBLES)[number]; readonly rise: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const elapsed = Date.now() - SCENE_T0 - bubble.delay;
    const wait = elapsed < 0 ? -elapsed : 0;
    const start = elapsed < 0 ? 0 : (elapsed % bubble.duration) / bubble.duration;
    p.value = start;
    p.value = withDelay(wait, withSequence(
      withTiming(1, { duration: Math.round((1 - start) * bubble.duration), easing: Easing.linear }),
      withRepeat(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: bubble.duration, easing: Easing.linear })), -1)));
    return () => cancelAnimation(p);
  }, [bubble, p]);
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const opacity = t < 0.15 ? (t / 0.15) * 0.5 : t < 0.7 ? 0.5 : 0.5 * (1 - (t - 0.7) / 0.3);
    return {
      opacity,
      transform: [
        { translateY: -rise * (1 - (1 - t) * (1 - t)) },
        { translateX: 10 * Math.sin(t * Math.PI * 2 * (bubble.duration / 2800)) },
      ],
    };
  });
  // The moving view has no border: on the new architecture every animated prop update re-draws a
  // bordered view's border image on the main thread (seen pinning the main thread at launch). The
  // drawn bubble is a still child, so each frame only moves a plain layer.
  return (
    <Animated.View style={[styles.bubbleSlot, { left: `${bubble.left}%`, width: bubble.size, height: bubble.size }, style]}>
      <View style={[styles.bubble, { borderRadius: bubble.size / 2 }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blue: { backgroundColor: LAUNCH_BLUE, overflow: 'hidden' },
  bottom: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end' },
  column: { marginBottom: 32, width: '80%' },
  fact: {
    color: 'white', textAlign: 'center', fontFamily: 'Knockout', fontSize: 20, marginBottom: 16,
    textShadowColor: 'rgba(0, 0, 0, .5)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0,
  },
  rim: { borderRadius: 50, borderColor: 'white', borderWidth: 3 },
  bar: { width: '100%', height: 23, borderRadius: 10, borderWidth: 3, borderColor: config.primary, backgroundColor: 'white', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transformOrigin: 'left', backgroundColor: config.primary },
  shine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: SHINE_WIDTH, backgroundColor: 'rgba(255,255,255,0.38)' },
  bubbleSlot: { position: 'absolute', bottom: 20 },
  bubble: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
});

export default memo(LaunchScene);
