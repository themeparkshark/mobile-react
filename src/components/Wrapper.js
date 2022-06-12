import { Image, ImageBackground, View } from 'react-native';
import explore from '../../assets/images/toolbar/explore.png';
import forum from '../../assets/images/toolbar/forum.png';
import news from '../../assets/images/toolbar/news.png';
import profile from '../../assets/images/toolbar/profile.png';
import social from '../../assets/images/toolbar/social.png';
import toolbar from '../../assets/images/toolbar/toolbar.png';
import * as RootNavigation from '../RootNavigation';
import Button from './Button';

export default function Wrapper({ children }) {
  const items = [
    {
      icon: news,
      screen: 'News',
      size: 'normal',
    },
    {
      icon: forum,
      screen: 'News',
      size: 'normal',
    },
    {
      icon: explore,
      screen: 'Explore',
      size: 'large',
    },
    {
      icon: social,
      screen: 'News',
      size: 'normal',
    },
    {
      icon: profile,
      screen: 'News',
      size: 'normal',
    },
  ];

  return (
    <View style={{ flex: '1 1 0%' }}>
      <View style={{ flex: '1 1 0%' }}>{children}</View>
      <ImageBackground
        source={toolbar}
        resizeMode="cover"
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: 75,
          paddingLeft: 12,
          paddingRight: 12,
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
                    width: item.size === 'normal' ? 50 : 80,
                    height: item.size === 'normal' ? 50 : 80,
                    resizeMode: 'contain',
                    alignSelf: 'center',
                    position: 'absolute',
                    top: item.size === 'normal' ? 0 : -35,
                  }}
                  source={item.icon}
                />
              </Button>
            </View>
          );
        })}
      </ImageBackground>
    </View>
  );
}
