import { Image } from 'expo-image';
import { ReactNode, useContext } from 'react';
import { Dimensions, ImageBackground, SafeAreaView, View } from 'react-native';
import { NotificationContext } from '../context/NotificationProvider';
import * as RootNavigation from '../RootNavigation';
import Button from './Button';

export default function Wrapper({
  showBar = true,
  children,
}: {
  readonly showBar?: boolean;
  readonly children: ReactNode[];
}) {
  const { notificationCount } = useContext(NotificationContext);

  const items = [
    {
      icon: require('../../assets/images/toolbar/news.png'),
      screen: 'News',
      size: 'normal',
      label: 'News',
      showRedCircle: true,
    },
    {
      icon: require('../../assets/images/toolbar/leaderboard.png'),
      screen: 'Leaderboard',
      size: 'normal',
      label: 'Standings',
    },
    {
      icon: require('../../assets/images/toolbar/explore.png'),
      screen: 'Explore',
      size: 'large',
      label: 'Explore',
      sound: require('../../assets/sounds/explore_button_press.mp3')
    },
    {
      icon: require('../../assets/images/toolbar/social.png'),
      screen: 'Social',
      size: 'normal',
      label: 'Social',
      showRedCircle: true,
    },
    {
      icon: require('../../assets/images/toolbar/profile.png'),
      screen: 'Profile',
      size: 'normal',
      label: 'Profile',
      showRedCircle: !!notificationCount,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SafeAreaView
          style={{
            height: '101%',
          }}
        >
          {children}
        </SafeAreaView>
      </View>
      <SafeAreaView
        style={{
          width: Dimensions.get('window').width,
          marginBottom: -45,
          display: showBar ? 'flex' : 'none',
        }}
      >
        <ImageBackground
          source={require('../../assets/images/screens/explore/bottombar.png')}
          resizeMode="cover"
          style={{
            height: 100,
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
                      showRedCircle={item.showRedCircle}
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
      </SafeAreaView>
    </View>
  );
}
