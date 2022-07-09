import { Dimensions, Image, ImageBackground, View, SafeAreaView } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from './Button';
import { useContext } from 'react';
import { ThemeContext} from '../context/ThemeProvider';

export default function Wrapper({ children }) {
  const { theme } = useContext(ThemeContext);

  const items = [
    {
      icon: theme.news_button_url,
      screen: 'News',
      size: 'normal',
      hidden: false,
    },
    {
      icon: theme.news_button_url,
      screen: 'News',
      size: 'normal',
      hidden: true,
    },
    {
      icon: theme.explore_button_url,
      screen: 'Explore',
      size: 'large',
      hidden: false,
    },
    {
      icon: theme.news_button_url,
      screen: 'News',
      size: 'normal',
      hidden: true,
    },
    {
      icon: theme.profile_button_url,
      screen: 'Profile',
      size: 'normal',
      hidden: false,
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }}>
          {children}
        </SafeAreaView>
      </View>
      <SafeAreaView
        style={{
          width: Dimensions.get('window').width,
          marginBottom: -45,
        }}
      >
        <ImageBackground
          source={{
            uri: theme.bottom_bar_url,
          }}
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
                    display: item.hidden ? 'none' : 'flex',
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
                      source={{
                        uri: item.icon,
                      }}
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
