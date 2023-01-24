import {
  Dimensions,
  Image,
  ImageBackground,
  SafeAreaView,
  Text,
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
      label: 'News',
    },
    {
      icon: require('../../assets/images/toolbar/leaderboard.png'),
      screen: 'Leaderboard',
      size: 'normal',
      label: 'Leaderboards',
    },
    {
      icon: require('../../assets/images/toolbar/explore.png'),
      screen: 'Explore',
      size: 'large',
      label: 'Explore',
    },
    {
      icon: require('../../assets/images/toolbar/social.png'),
      screen: 'Social',
      size: 'normal',
      label: 'Social',
    },
    {
      icon: require('../../assets/images/toolbar/profile.png'),
      screen: 'Profile',
      size: 'normal',
      label: 'Profile',
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SafeAreaView
          style={{
            height: Dimensions.get('window').height - 82,
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
                  <Text
                    style={{
                      paddingTop: 56,
                      textAlign: 'center',
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      color: 'white',
                      textShadowColor: 'rgba(0, 0, 0, .5)',
                      textShadowOffset: {
                        width: 2,
                        height: 2,
                      },
                      textShadowRadius: 0,
                    }}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </ImageBackground>
      </SafeAreaView>
    </View>
  );
}
