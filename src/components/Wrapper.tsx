import { Image } from 'expo-image';
import { ReactNode } from 'react';
import { Dimensions, ImageBackground, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from './Button';

export default function Wrapper({
  children,
}: {
  readonly children: ReactNode[];
}) {
  const items = [
    {
      icon: require('../../assets/images/toolbar/news.png'),
      screen: 'News',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
    },
    {
      icon: require('../../assets/images/toolbar/leaderboard.png'),
      screen: 'Leaderboard',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
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
    },
    {
      icon: require('../../assets/images/toolbar/profile.png'),
      screen: 'Profile',
      size: 'normal',
      sound: require('../../assets/sounds/wrapper_button_press.mp3'),
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
          source={require('../../assets/images/screens/explore/bottombar.png')}
          resizeMode="cover"
          style={{
            width: '100%',
            aspectRatio: 5.3,
          }}
        >
          <View
            style={{
              paddingLeft: 12,
              paddingRight: 12,
              display: 'flex',
              flexDirection: 'row',
            }}
          >
            {items.map((item, key) => {
              return (
                <View
                  key={key}
                  style={{
                    flex: 1,
                    flexDirection: 'column',
                  }}
                >
                  <View
                    style={{
                      position: 'absolute',
                      width: '100%',
                      top: item.size === 'normal' ? 0 : -45,
                    }}
                  >
                    <Button
                      onPress={() => {
                        RootNavigation.navigate(item.screen);
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
