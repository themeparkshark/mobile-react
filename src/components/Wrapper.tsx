import { Image } from 'expo-image';
import { ReactNode, useContext, useEffect, useRef } from 'react';
import { Dimensions, ImageBackground, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { COMPASS_INDEX, footerIndex, footerMotion, playFooterTap } from './footerMotion';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { GOLD_FX } from '../ui/motion';
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
    return { opacity: m.glowOpacity.value, transform: [{ translateX: x - 32 }, { scale: size }] };
  });

  const items = [
    {
      icon: require('../../assets/images/toolbar/news.png'),
      screen: 'News',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'News',
    },
    {
      icon: require('../../assets/images/toolbar/leaderboard.png'),
      screen: 'Leaderboard',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'Standings',
    },
    {
      icon: require('../../assets/images/toolbar/explore.png'),
      screen: 'Explore',
      // Every tab says what it is; the big compass is the map (kids asked what it did).
      text: 'Map',
      size: 'large',
      sound: require('../../assets/sounds/explore_button_press.mp3'),
    },
    {
      icon: require('../../assets/images/toolbar/social.png'),
      screen: 'Social',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
      text: 'Social',
    },
    {
      icon: require('../../assets/images/toolbar/profile.png'),
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
            {/* A soft gold glow that slides to the picked tab and fades (never lit at rest). */}
            <Animated.View pointerEvents="none" style={[{
              position: 'absolute', left: 0, top: -7, width: 64, height: 64, borderRadius: 32,
              backgroundColor: 'rgba(255, 213, 74, 0.55)', shadowColor: GOLD_FX.glow, shadowOpacity: 1,
              shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
            }, glowStyle]} />
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

/** One footer icon: hops and pops when picked, dips when left, wiggles on a re-tap; the compass spins. */
function FooterIcon({ index, children }: { readonly index: number; readonly children: ReactNode }) {
  const compass = index === COMPASS_INDEX;
  const style = useAnimatedStyle(() => {
    const m = footerMotion;
    const picked = m.hopIndex.value === index;
    const left = m.sinkIndex.value === index && !picked;
    return {
      transform: [
        { translateY: picked ? m.hopY.value : 0 },
        { scale: picked ? m.hopScale.value : left ? m.sinkScale.value : 1 },
        { rotate: `${(picked ? m.hopRotate.value : 0) + (compass ? m.compassSpin.value : 0)}deg` },
      ],
    };
  });
  const glint = useAnimatedStyle(() => {
    const g = footerMotion.glint.value;
    return { opacity: g > 0 && g < 1 ? 0.75 : 0, transform: [{ translateX: -70 + 140 * g }, { rotate: '20deg' }] };
  });
  return (
    <Animated.View style={style}>
      {children}
      {compass && <View pointerEvents="none" style={{ position: 'absolute', left: 10, top: 10, width: 80, height: 80,
        borderRadius: 40, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', top: -20, left: 30, width: 16, height: 120,
          backgroundColor: 'rgba(255, 255, 255, 0.85)', borderRadius: 8 }, glint]} />
      </View>}
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
