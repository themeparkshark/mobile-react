import { Image } from 'expo-image';
import { ReactNode, useContext } from 'react';
import { Dimensions, ImageBackground, Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { ThemeContext } from '../context/ThemeProvider';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import Button from './Button';

export default function Wrapper({
  children,
}: {
  readonly children: ReactNode;
}) {
  const { theme } = useContext(ThemeContext);
  const { checkPermission, hasPermission } = usePermissions();

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
      <View
        style={{
          width: Dimensions.get('window').width,
        }}
      >
        <ImageBackground
          source={{ url: theme.bottom_bar_url }}
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
                      hasPermission={
                        item.permission !== undefined
                          ? hasPermission(item.permission)
                          : true
                      }
                      onPress={() => {
                        if (item.permission !== undefined) {
                          if (checkPermission(item.permission)) {
                            RootNavigation.navigate(item.screen);
                          }
                        } else {
                          RootNavigation.navigate(item.screen);
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
      </View>
    </View>
  );
}
