import { Image } from 'expo-image';
import { ReactNode, useContext, useEffect } from 'react';
import { Dimensions, ImageBackground, Text, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { catchShown, isCatchShown } from '../screens/ExploreScreen/catchPresence';
import * as RootNavigation from '../RootNavigation';
import { NotificationContext } from '../context/NotificationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import Button from './Button';
import { AuthContext } from '../context/AuthProvider';
import { warmStandings } from '../screens/LeaderboardsScreen/standingsV2Store';

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
    <View style={{ flex: 1 }}>
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
            {items.map((item, key) => {
              return (
                <View key={key}>
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
                      onPress={() => {
                        if (isCatchShown()) return;
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
                      <Image
                        style={{
                          width: item.size === 'normal' ? 50 : 100,
                          height: item.size === 'normal' ? 50 : 100,
                          alignSelf: 'center',
                        }}
                        source={item.icon}
                        contentFit="contain"
                      />
                    </Button>
                    <Text
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
                      }}
                    >
                      {item.text}
                    </Text>
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
