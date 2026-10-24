import { Image } from 'expo-image';
import { ReactNode, useContext, useEffect, useRef } from 'react';
import { Dimensions, Image as RNImage, ImageBackground, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { COMPASS_INDEX, FOOTER_MOTION, footerIndex, footerMotion, playFooterTap } from './footerMotion';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { BRAND } from '../ui/tokens';
import { GOLD_FX } from '../ui/motion';
import SparkleBurst from '../ui/SparkleBurst';
import { catchShown, isCatchShown } from '../screens/ExploreScreen/catchPresence';
import * as RootNavigation from '../RootNavigation';
import { NotificationContext } from '../context/NotificationProvider';
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
  // A catch moment owns the whole screen: the tab bar slides away on the UI thread (no re-render).
  const barSlide = useAnimatedStyle(() => ({ transform: [{ translateY: 160 * catchShown.value }] }));
  const reducedMotion = useUiReducedMotion();
  // Tab centers (x in the row), measured once, so the gold glow can slide between them.
  const centers = useSharedValue<number[]>([]);
  const measured = useRef<(number | undefined)[]>([undefined, undefined, undefined, undefined, undefined]);
  const glowStyle = useAnimatedStyle(() => {
    const c = centers.value;
    const m = footerMotion;
    if (c.length !== 5) return { opacity: 0 };
    const x = interpolate(m.glowX.value, [0, 1, 2, 3, 4], c);
    // Bigger behind the big compass.
    const size = interpolate(Math.abs(m.glowX.value - COMPASS_INDEX), [0, 1], [1.7, 1], 'clamp');
    return { opacity: m.glowOpacity.value, transform: [{ translateX: x - GLOW / 2 }, { scale: size }] };
  });

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
            {/* Warm sunlight that slides to the picked tab and fades (never lit at rest). Pale cream
                rings stacked into a soft radial, no shadow pass: over the blue bar it reads as light, never olive. */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: -14, width: GLOW, height: GLOW,
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
                      onPress={() => {
                        if (isCatchShown()) return;
                        if (!previewMode) playFooterTap(footerIndex(RootNavigation.navigationRef.getCurrentRoute()?.name),
                          key, reducedMotion);
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
                      }}
                      onPressSound={item.sound}
                    >
                      <FooterIcon index={key}>
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
                    <FooterLabel index={key}><Text
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

/** The sunlight behind a picked tab: soft cream rings stacked into a radial (pure data). */
const GLOW = 78;
const GLOW_RINGS = [
  { size: 78, color: 'rgba(255, 250, 232, 0.16)' },
  { size: 64, color: 'rgba(255, 248, 225, 0.2)' },
  { size: 50, color: 'rgba(255, 246, 214, 0.28)' },
  { size: 36, color: 'rgba(255, 251, 234, 0.42)' },
] as const;

/**
 * One footer icon: hops and pops when picked, dips when left, wiggles on a re-tap, and a thin gold
 * ring pulses off it. The compass squashes first, wobbles on its base (transformOrigin bottom, so its
 * baked shadow stays under it), gets a white glint across its face and throws six gold sparkles.
 */
function FooterIcon({ index, children }: { readonly index: number; readonly children: ReactNode }) {
  const compass = index === COMPASS_INDEX;
  const size = compass ? 100 : 50;
  const F = FOOTER_MOTION;
  const style = useAnimatedStyle(() => {
    const m = footerMotion;
    const picked = m.hopIndex.value === index;
    const left = m.sinkIndex.value === index && !picked;
    const s = picked ? m.hopScale.value : left ? m.sinkScale.value : 1;
    const q = compass && picked ? m.compassSquash.value : 0;
    return {
      transform: [
        { translateY: picked ? m.hopY.value : 0 },
        { scaleX: s * (1 + F.compassSquashX * q) },
        { scaleY: s * (1 - F.compassSquashY * q) },
        { rotate: `${(picked ? m.hopRotate.value : 0) + (compass && picked ? m.compassWobble.value : 0)}deg` },
      ],
    };
  });
  const ring = useAnimatedStyle(() => {
    const m = footerMotion;
    const r = m.ring.value;
    if (m.hopIndex.value !== index || r <= 0 || r >= 1) return { opacity: 0 };
    return { opacity: r < 0.15 ? r / 0.15 : 1 - (r - 0.15) / 0.85,
      transform: [{ scale: F.ringFrom + (F.ringTo - F.ringFrom) * r }] };
  });
  const glint = useAnimatedStyle(() => {
    const g = footerMotion.glint.value;
    return { opacity: g > 0 && g < 1 ? 0.8 : 0, transform: [{ translateX: -64 + 128 * g }, { rotate: '20deg' }] };
  });
  // The compass face (the gold disc inside the star), so the glint never crosses the navy base.
  const face = { left: 30, top: 26, width: 40, height: 40 };
  const ringSize = compass ? 64 : 46;
  return (
    <View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - ringSize) / 2,
        top: compass ? 14 : (size - ringSize) / 2, width: ringSize, height: ringSize, borderRadius: ringSize / 2,
        borderWidth: 3, borderColor: GOLD_FX.glow, alignItems: 'center', justifyContent: 'center' }, ring]}>
        <View style={{ width: ringSize - 6, height: ringSize - 6, borderRadius: (ringSize - 6) / 2, borderWidth: 1.5,
          borderColor: BRAND.white }} />
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
        spread={[-170, -10]} dist={[34, 50]} size={[11, 16]} gravity={14} seed={2} />}
    </View>
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
