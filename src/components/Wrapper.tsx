import {
  Dimensions,
  Image,
  ImageBackground,
  SafeAreaView,
  View,
} from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from './Button';
import { ReactNode } from 'react';

export default function Wrapper({
  showBar = true,
  children,
}: {
  readonly showBar?: boolean;
  readonly children: ReactNode[];
}) {
  const items = [
    {
      icon: require('../../assets/images/toolbar/news.png'),
      screen: 'News',
      size: 'normal',
    },
    {
      icon: require('../../assets/images/toolbar/leaderboard.png'),
      screen: 'Leaderboard',
      size: 'normal',
    },
    {
      icon: require('../../assets/images/toolbar/explore.png'),
      screen: 'Explore',
      size: 'large',
    },
    {
      icon: require('../../assets/images/toolbar/social.png'),
      screen: 'Social',
      size: 'normal',
    },
    {
      icon: require('../../assets/images/toolbar/profile.png'),
      screen: 'Profile',
      size: 'normal',
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>{children}</SafeAreaView>
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
                    flex: '1 1 0%',
                  }}
                >
                  <Button
                    onPress={() => {
                      RootNavigation.navigate(item.screen);
                    }}
                  >
                    <Image
                      style={{
                        width: item.size === 'normal' ? 50 : 100,
                        height: item.size === 'normal' ? 50 : 100,
                        resizeMode: 'contain',
                        alignSelf: 'center',
                        position: 'absolute',
                        top: item.size === 'normal' ? 0 : -45,
                      }}
                      source={item.icon}
                    />
                  </Button>
                </View>
              );
            })}
          </View>
        </ImageBackground>
      </SafeAreaView>
    </View>
  );
}
