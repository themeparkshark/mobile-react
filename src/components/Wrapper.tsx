import { Image } from 'expo-image';
import { ReactNode, RefObject, useContext, useEffect, useRef, useState } from 'react';
import { Dimensions, Image as RNImage, ImageBackground, Text, View } from 'react-native';
import Animated, { interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring,
  withTiming, type SharedValue } from 'react-native-reanimated';
import { registerShelfTarget } from '../ui/CoinFlight';
import { useScreenFocused } from '../ui/AmbientSwim';
import { HUD_BUMP } from '../ui/motionEasing';
import { queueHaptic } from '../gamekit/Haptics';
import { COMPASS_INDEX, FOOTER_MOTION, footerIndex, footerMotion, playFooterTap, rarePickCount, rareSeed } from './footerMotion';
import { SHARK_ART } from '../ui/SharkRefresh';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { BRAND } from '../ui/tokens';
import { GOLD_FX } from '../ui/motion';
import SparkleBurst from '../ui/SparkleBurst';
import { catchShown, isCatchShown } from '../screens/ExploreScreen/catchPresence';
import * as RootNavigation from '../RootNavigation';
import { NotificationContext } from '../context/NotificationProvider';
import { SoundEffectContext, SoundEffectContextType } from '../context/SoundEffectProvider';
import { ThemeContext } from '../context/ThemeProvider';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import Button from './Button';
import { AuthContext } from '../context/AuthProvider';
import { warmStandings } from '../screens/LeaderboardsScreen/standingsV2Store';
import { emitTabReselect } from '../utils/tabReselect';

/**
 * How far the center compass button rises above the bottom bar into the
 * screen content (its `top: -45` plus breathing room). Scroll content should
 * end at least this far above the bar.
 */
export const BOTTOM_BAR_OVERHANG = 56;

/** The five footer icons, required once at module load. */
const FOOTER_ICONS = {
  news: require('../../assets/images/toolbar/news.png'),
  leaderboard: require('../../assets/images/toolbar/leaderboard.png'),
  explore: require('../../assets/images/toolbar/explore.png'),
  social: require('../../assets/images/toolbar/social.png'),
  profile: require('../../assets/images/toolbar/profile.png'),
} as const;

/**
 * Every tab screen mounts its own footer, so a tab switch used to decode the five icons again
 * from disk while the labels were already painted (icons blank for a few frames). Decode them
 * once at start-up into the memory cache; each footer then paints them on its first frame.
 */
let footerIconsWarm = false;
export function warmFooterIcons(): void {
  if (footerIconsWarm) return;
  footerIconsWarm = true;
  const uris = Object.values(FOOTER_ICONS)
    .map(icon => RNImage.resolveAssetSource(icon)?.uri)
    .filter((uri): uri is string => !!uri);
  if (uris.length) void Image.prefetch(uris, 'memory-disk').catch(() => { footerIconsWarm = false; });
}
warmFooterIcons();

export default function Wrapper({
  children,
  previewMode = false,
  onNavigate,
}: {
  readonly children: ReactNode;
  readonly previewMode?: boolean;
  readonly onNavigate?: (screen: string) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const { player } = useContext(AuthContext);
  // Standings v2: warm This Week and Friends once, so the first tap paints a real board.
  useEffect(() => { if (!previewMode) warmStandings(player?.id); }, [player?.id, previewMode]);
  
  // Default theme URLs if theme not loaded
  const bottomBarSource = theme?.bottom_bar_url
    ? { uri: theme.bottom_bar_url }
    : require('../../assets/images/original-bottom-bar.png');
  const { checkPermission, hasPermission } = usePermissions();
  const { notificationCount } = useContext(NotificationContext);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  // A catch moment owns the whole screen: the tab bar slides away on the UI thread (no re-render).
  const barSlide = useAnimatedStyle(() => ({ transform: [{ translateY: 160 * catchShown.value }] }));
  const reducedMotion = useUiReducedMotion();
  // Tab centers (x in the row), measured once, so the gold glow can slide between them.
  const centers = useSharedValue<number[]>([]);
  const measured = useRef<(number | undefined)[]>([undefined, undefined, undefined, undefined, undefined]);
  // The Profile tab is the shelf: a prize a kid takes from a reward dialog flies here and the icon squashes as it lands.
  const focused = useScreenFocused();
  const profileRef = useRef<View>(null);
  const shelfLanded = useSharedValue(0);
  const shelfHit = useSharedValue(0);
  useEffect(() => {
    if (previewMode || !focused) return undefined;
    return registerShelfTarget(done => {
      const node = profileRef.current;
      if (!node) { done(null); return; }
      node.measureInWindow((x, y, w, h) => done(Number.isFinite(x) && w > 0 ? { x: x + w / 2, y: y + h / 2 } : null));
    }, shelfLanded);
  }, [previewMode, focused, shelfLanded]);
  const shelfBuzz = () => queueHaptic('tapLight');
  useAnimatedReaction(() => shelfLanded.value, (now, before) => {
    if (before === null || now <= before) return;
    shelfHit.value = withSequence(withTiming(1, { duration: 60 }), withSpring(0, HUD_BUMP.spring));
    runOnJS(shelfBuzz)();
  });
  const glowStyle = useAnimatedStyle(() => {
    const c = centers.value;
    const m = footerMotion;
    if (c.length !== 5) return { opacity: 0 };
    const x = interpolate(m.glowX.value, [0, 1, 2, 3, 4], c);
    // Bigger behind the big compass.
    const size = interpolate(Math.abs(m.glowX.value - COMPASS_INDEX), [0, 1], [1.7, 1], 'clamp');
    return { opacity: m.glowOpacity.value, transform: [{ translateX: x - GLOW / 2 }, { scale: size }] };
  });

  const goTo = (item: { screen: string; permission?: PermissionEnums }, key: number) => {
    if (isCatchShown()) return;
    if (!previewMode) {
      // The rare compass pick answers in the hand on its burst frame, from the UI thread (footerMotion.rareBuzz, RareFans).
      playFooterTap(footerIndex(RootNavigation.navigationRef.getCurrentRoute()?.name), key, reducedMotion);
    }
    // Already here: the screen scrolls back to its top (News).
    if (!onNavigate && RootNavigation.navigationRef.getCurrentRoute()?.name === item.screen
      && emitTabReselect(item.screen)) return;
    if (item.permission !== undefined) {
      if (checkPermission(item.permission)) {
        if (onNavigate) onNavigate(item.screen);
        else RootNavigation.navigate(item.screen);
      }
    } else {
      if (onNavigate) onNavigate(item.screen);
      else RootNavigation.navigate(item.screen);
    }
  };

  const items = [
    {
      icon: FOOTER_ICONS.news,
      screen: 'News',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'News',
    },
    {
      icon: FOOTER_ICONS.leaderboard,
      screen: 'Leaderboard',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'Standings',
    },
    {
      icon: FOOTER_ICONS.explore,
      screen: 'Explore',
      // Every tab says what it is; the big compass is the map (kids asked what it did).
      text: 'Map',
      size: 'large',
      sound: require('../../assets/sounds/explore_button_press.mp3'),
    },
    {
      icon: FOOTER_ICONS.social,
      screen: 'Social',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'Social',
    },
    {
      icon: FOOTER_ICONS.profile,
      screen: 'Profile',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'Profile',
      permission: PermissionEnums.ViewProfile,
    },
  ];

  return (
    // The tab bar's own blue behind it: when it slides back after a catch it never uncovers grey.
    <View style={{ flex: 1, backgroundColor: '#0e7fd9' }}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: '101%',
          }}
        >
          {children}
        </View>
      </View>
      <Animated.View
        style={[{
          width: Dimensions.get('window').width,
        }, barSlide]}
      >
        <ImageBackground
          source={bottomBarSource}
          resizeMode="cover"
          style={{
            width: '100%',
            aspectRatio: 5.3,
          }}
        >
          <View
            style={{
              paddingLeft: 32,
              paddingRight: 32,
              flexDirection: 'row',
              justifyContent: 'space-between',
            }}
          >
            {/* The alternate rare compass pick: the little shark swims along the wave behind the icons. */}
            {!previewMode && <FooterSwim />}
            {/* Warm sunlight that slides to the picked tab and fades (never lit at rest). Pale cream
                rings stacked into a soft radial, no shadow pass: over the blue bar it reads as light, never olive. */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: -21, width: GLOW, height: GLOW,
              alignItems: 'center', justifyContent: 'center' }, glowStyle]}>
              {GLOW_RINGS.map(r => <View key={r.size} style={{ position: 'absolute', width: r.size, height: r.size,
                borderRadius: r.size / 2, backgroundColor: r.color }} />)}
            </Animated.View>
            {items.map((item, key) => {
              return (
                <View key={key} onLayout={event => {
                  const { x, width } = event.nativeEvent.layout;
                  measured.current[key] = x + width / 2;
                  if (measured.current.every(c => c !== undefined)) centers.value = measured.current.slice() as number[];
                }}>
                  <View
                    style={{
                      top: item.size === 'normal' ? 0 : -45,
                    }}
                  >
                    <Button
                      showRedCircle={
                        notificationCount > 0 && item.text === 'Profile'
                      }
                      hasPermission={
                        previewMode ? true : item.permission !== undefined
                          ? hasPermission(item.permission)
                          : true
                      }
                      pressHaptic="tickSelection"
                      onPress={() => goTo(item, key)}
                      onPressSound={item.sound}
                    >
                      <FooterIcon index={key} anchor={key === PROFILE_INDEX ? profileRef : undefined}
                        hit={key === PROFILE_INDEX ? shelfHit : undefined}>
                        <Image
                          style={{
                            width: item.size === 'normal' ? 50 : 100,
                            height: item.size === 'normal' ? 50 : 100,
                            alignSelf: 'center',
                          }}
                          source={item.icon}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                          recyclingKey={item.screen}
                          priority="high"
                        />
                      </FooterIcon>
                    </Button>
                    {/* Capped: past 1.2x the five labels run into each other ("NEWSSTANDINGS") and over the page. */}
                    {/* The word under the icon is part of the button too: a kid who taps
                        "PROFILE" instead of the picture still goes there. */}
                    <FooterLabel index={key}><Text
                      onPress={() => { playSound(item.sound); goTo(item, key); }}
                      suppressHighlighting
                      accessibilityRole="button"
                      maxFontSizeMultiplier={1.2}
                      numberOfLines={1}
                      style={{
                        fontFamily: 'Shark',
                        color: 'white',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowOffset: {
                          width: 1,
                          height: 1,
                        },
                        textShadowRadius: 0,
                        // The big compass is 100 pt tall from -45: lift its label onto the same line as the others.
                        marginTop: item.size === 'normal' ? 0 : -5,
                      }}
                    >
                      {item.text}
                    </Text></FooterLabel>
                  </View>
                </View>
              );
            })}
          </View>
        </ImageBackground>
      </Animated.View>
    </View>
  );
}

/** The Profile tab (the shelf a prize flies to) and how hard it squashes as the prize lands. */
const PROFILE_INDEX = 4;
const SHELF_SQUASH = 0.22;

/** The sunlight behind a picked tab: soft cream rings stacked into a radial (pure data). */
const GLOW = 92;
const GLOW_RINGS = [
  { size: 92, color: 'rgba(255, 246, 214, 0.14)' },
  { size: 76, color: 'rgba(255, 240, 190, 0.2)' },
  { size: 60, color: 'rgba(255, 233, 166, 0.26)' },
  { size: 44, color: 'rgba(255, 244, 205, 0.35)' },
  { size: 28, color: 'rgba(255, 252, 238, 0.45)' },
] as const;

/**
 * One footer icon: hops and pops when picked, dips when left, wiggles on a re-tap, and a thin gold
 * ring pulses off it. The compass squashes first, wobbles on its base (transformOrigin bottom, so its
 * baked shadow stays under it), gets a white glint across its face and throws six gold sparkles.
 */
function FooterIcon({ index, children, anchor, hit }: { readonly index: number; readonly children: ReactNode;
  /** The view a prize flies to (the Profile tab). */
  readonly anchor?: RefObject<View>;
  /** 0 to 1: the squash as a prize lands in this icon. */
  readonly hit?: SharedValue<number>;
}) {
  const compass = index === COMPASS_INDEX;
  const size = compass ? 100 : 50;
  const F = FOOTER_MOTION;
  const style = useAnimatedStyle(() => {
    const m = footerMotion;
    const picked = m.hopIndex.value === index;
    const left = m.sinkIndex.value === index && !picked;
    const s = picked ? m.hopScale.value : left ? m.sinkScale.value : 1;
    // Every picked icon squashes wide and short first (the anticipation), then hops.
    const q = picked ? m.compassSquash.value : 0;
    const h = hit ? hit.value : 0;
    return {
      transform: [
        { translateY: picked ? m.hopY.value : 0 },
        { scaleX: s * (1 + F.compassSquashX * q) * (1 + SHELF_SQUASH * h) },
        { scaleY: s * (1 - F.compassSquashY * q) * (1 - SHELF_SQUASH * 0.8 * h) },
        { rotate: `${(picked ? m.hopRotate.value : 0) + (compass && picked ? m.compassWobble.value : 0)}deg` },
      ],
    };
  });
  const ring = useAnimatedStyle(() => {
    const m = footerMotion;
    const r = m.ring.value;
    if (m.hopIndex.value !== index || r <= 0 || r >= 1) return { opacity: 0 };
    // A crisp gold ring: up fast, holds bright, then fades as it grows.
    return { opacity: r < 0.1 ? r / 0.1 : r < F.ringHold ? 1 : 1 - (r - F.ringHold) / (1 - F.ringHold),
      transform: [{ scale: F.ringFrom + (F.ringTo - F.ringFrom) * (1 - (1 - r) * (1 - r)) }] };
  });
  // A soft gold disc under the ring: the pick reads as a glow on the bar, not just a line.
  const disc = useAnimatedStyle(() => {
    const m = footerMotion;
    const r = m.ring.value;
    if (m.hopIndex.value !== index || r <= 0 || r >= 1) return { opacity: 0 };
    return { opacity: F.ringDiscPeak * (r < 0.1 ? r / 0.1 : Math.max(0, 1 - (r - 0.1) / 0.6)),
      transform: [{ scale: 0.6 + 0.7 * Math.min(1, r * 1.6) }] };
  });
  // The rare compass pick's wide gold shock ring.
  const rareRing = useAnimatedStyle(() => {
    const r = footerMotion.ringRare.value;
    if (!compass || r <= 0 || r >= 1) return { opacity: 0 };
    return { opacity: r < 0.08 ? r / 0.08 : r < 0.3 ? 1 : 1 - (r - 0.3) / 0.7,
      transform: [{ scale: 0.8 + (F.rareRingTo - 0.8) * (1 - (1 - r) * (1 - r)) }] };
  });
  // The rare pick's second ring, a beat behind the first (a double shock wave).
  const rareRing2 = useAnimatedStyle(() => {
    const r = Math.max(0, footerMotion.ringRare.value - 0.12) / 0.88;
    if (!compass || r <= 0 || r >= 1) return { opacity: 0 };
    return { opacity: 0.9 * (r < 0.1 ? r / 0.1 : 1 - (r - 0.1) / 0.9), transform: [{ scale: 0.8 + 2.6 * (1 - (1 - r) * (1 - r)) }] };
  });
  // The rare pick's sun: a big warm glow that blooms under the compass and fades.
  const rareSun = useAnimatedStyle(() => {
    const r = footerMotion.ringRare.value;
    if (!compass || r <= 0 || r >= 1) return { opacity: 0 };
    return { opacity: F.rareSunPeak * (r < 0.12 ? r / 0.12 : Math.max(0, 1 - (r - 0.12) / 0.6)), transform: [{ scale: 0.8 + 1.6 * Math.min(1, r * 2) }] };
  });
  // A small icon's own stars, only when it is the one picked.
  const smallBurst = useDerivedValue(() => (footerMotion.hopIndex.value === index ? footerMotion.burstSmall.value : 0));
  const glint = useAnimatedStyle(() => {
    const g = footerMotion.glint.value;
    return { opacity: g > 0 && g < 1 ? 0.8 : 0, transform: [{ translateX: -64 + 128 * g }, { rotate: '20deg' }] };
  });
  // The compass face (the gold disc inside the star), so the glint never crosses the navy base.
  const face = { left: 30, top: 26, width: 40, height: 40 };
  const ringSize = compass ? 64 : 46;
  const ringTop = compass ? 14 : (size - ringSize) / 2;
  return (
    <View ref={anchor} collapsable={false}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2, top: ringTop,
        width: ringSize, height: ringSize, borderRadius: ringSize / 2, backgroundColor: GOLD_FX.glow }, disc]} />
      {compass && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2, top: ringTop,
        width: ringSize, height: ringSize, borderRadius: ringSize / 2, backgroundColor: GOLD_FX.raysSoft }, rareSun]} />}
      {compass && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2, top: ringTop,
        width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: 6, borderColor: GOLD_FX.rays,
        alignItems: 'center', justifyContent: 'center' }, rareRing]}>
        <View style={{ width: ringSize - 8, height: ringSize - 8, borderRadius: (ringSize - 8) / 2, borderWidth: 2, borderColor: BRAND.white }} />
      </Animated.View>}
      {compass && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2, top: ringTop,
        width: ringSize, height: ringSize, borderRadius: ringSize / 2, borderWidth: 3, borderColor: GOLD_FX.glow }, rareRing2]} />}
      {/* The pick ring: a bright gold band with a crisp dark-gold outer edge and a white inner line. */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2,
        top: compass ? 14 : (size - ringSize) / 2, width: ringSize, height: ringSize, borderRadius: ringSize / 2,
        borderWidth: 1.5, borderColor: BRAND.goldLip, alignItems: 'center', justifyContent: 'center' }, ring]}>
        <View style={{ width: ringSize - 3, height: ringSize - 3, borderRadius: (ringSize - 3) / 2, borderWidth: 4.5,
          borderColor: GOLD_FX.rays, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: ringSize - 12, height: ringSize - 12, borderRadius: (ringSize - 12) / 2, borderWidth: 1.5,
            borderColor: BRAND.white }} />
        </View>
      </Animated.View>
      <Animated.View style={[compass ? { transformOrigin: 'bottom' } : null, style]}>
        {children}
        {compass && <View pointerEvents="none" style={{ position: 'absolute', ...face, borderRadius: face.width / 2,
          overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', top: -14, left: 14, width: 12, height: 68,
            backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 6 }, glint]} />
        </View>}
      </Animated.View>
      {compass && <SparkleBurst progress={footerMotion.burst} count={F.compassSparkles} x={size / 2} y={44}
        spread={[-180, 0]} dist={[58, 82]} size={[16, 22]} gravity={18} seed={2} />}
      {/* Every fifth compass pick: twelve inked gold stars in two low fans out along the footer wave (never up over the cards),
          laid out differently on each rare pick. */}
      {compass && <RareFans size={size} />}
      {!compass && <SparkleBurst progress={smallBurst} count={F.smallSparkles} x={size / 2} y={size / 2}
        spread={[-175, -5]} dist={F.smallDist} size={F.smallSize} gravity={10} seed={index + 11} />}
    </View>
  );
}

/** The rare compass pick's two low fans of inked gold stars; the layout changes with each rare pick. */
function RareFans({ size }: { readonly size: number }) {
  const [seed, setSeed] = useState(() => rareSeed(rarePickCount.value));
  // The seed is worked out on the JS thread (only plain values cross from the UI thread).
  const takeCount = (n: number) => setSeed(rareSeed(n));
  useAnimatedReaction(() => rarePickCount.value, (n, before) => {
    if (before !== null && n !== before) runOnJS(takeCount)(n);
  });
  // The rare pick answers in the hand on its burst frame (every footer reacts; the shared haptic gate keeps it to one).
  const buzz = () => queueHaptic('hitMedium');
  useAnimatedReaction(() => footerMotion.rareBuzz.value >= 1, (now, was) => {
    if (now && !was) runOnJS(buzz)();
  });
  const half = Math.round(FOOTER_MOTION.rareSparkles / 2);
  const { rareFanFrom: lo, rareFanTo: hi } = FOOTER_MOTION;
  return <>
    <SparkleBurst progress={footerMotion.burstRare} count={half} x={size / 2} y={44} inked
      spread={[-180 + lo, -180 + hi]} dist={FOOTER_MOTION.rareDist} size={FOOTER_MOTION.rareSize} gravity={16} seed={seed} />
    <SparkleBurst progress={footerMotion.burstRare} count={half} x={size / 2} y={44} inked
      spread={[-hi, -lo]} dist={FOOTER_MOTION.rareDist} size={FOOTER_MOTION.rareSize} gravity={16} seed={seed + 3} />
  </>;
}

/**
 * The alternate rare compass pick: a little TPS shark swims along the footer wave, behind the compass and above
 * the small icons, bobbing as it goes (one pass, UI thread, existing art; nothing at rest).
 */
function FooterSwim() {
  const width = Dimensions.get('window').width;
  const pt = FOOTER_MOTION.swimPt;
  const style = useAnimatedStyle(() => {
    const p = footerMotion.swim.value;
    if (p <= 0 || p >= 1) return { opacity: 0 };
    const x = -pt + (width + pt) * p;
    const bob = Math.sin(p * Math.PI * 4) * 7;
    return { opacity: p < 0.06 ? p / 0.06 : p > 0.94 ? (1 - p) / 0.06 : 1,
      transform: [{ translateX: x }, { translateY: -pt * 0.75 + bob }, { rotate: `${Math.cos(p * Math.PI * 4) * -10}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: pt, height: pt }, style]}>
      <Image source={SHARK_ART} style={{ width: pt, height: pt }} contentFit="contain" cachePolicy="memory-disk" />
    </Animated.View>
  );
}

/** A footer label: lifts 2 pt into place and fades up when its tab is picked. */
function FooterLabel({ index, children }: { readonly index: number; readonly children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const m = footerMotion;
    const picked = m.hopIndex.value === index;
    return { opacity: picked ? m.labelOpacity.value : 1, transform: [{ translateY: picked ? m.labelLift.value : 0 }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}
