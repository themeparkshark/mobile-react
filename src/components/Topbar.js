import { ImageBackground, SafeAreaView, Text, View, Image } from 'react-native';
import { ThemeContext } from '../context/ThemeProvider';
import { AuthContext } from '../context/AuthProvider';
import { useContext } from 'react';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import coins from '../../assets/images/coins.png';
import diamonds from '../../assets/images/purple_diamonds.png';

export default function Topbar({ text, showBackButton = false, showCoins = false, showPurpleDiamonds = false }) {
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(AuthContext);

  return (
    <SafeAreaView
      style={{
        zIndex: 20,
      }}
    >
      <ImageBackground
        source={{
          uri: theme.top_bar_url,
        }}
        resizeMode="cover"
        style={{
          height: 120,
          marginTop: -50,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        {showBackButton && (
          <SafeAreaView
            style={{
              position: 'absolute',
              top: '50%',
              left: 16,
            }}
          >
            <Button onPress={() => RootNavigation.goBack()}>
              <Image
                source={{
                  uri: theme.back_button_url,
                }}
                style={{
                  width: 35,
                  height: 35,
                  resizeMode: 'contain',
                }}
              />
            </Button>
          </SafeAreaView>
        )}
        {showCoins && (
          <SafeAreaView
            style={{
              position: 'absolute',
              top: '50%',
              right: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Image
                source={coins}
                style={{
                  width: 30,
                  height: 30,
                  resizeMode: 'contain',
                  marginRight: 8,
                }}
              />
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                }}
              >
                {user?.coins}
              </Text>
            </View>
          </SafeAreaView>
        )}
        {showPurpleDiamonds && (
          <SafeAreaView
            style={{
              position: 'absolute',
              top: '50%',
              left: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Image
                source={diamonds}
                style={{
                  width: 30,
                  height: 30,
                  resizeMode: 'contain',
                  marginRight: 8,
                }}
              />
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                }}
              >
                {user?.purple_diamonds}
              </Text>
            </View>
          </SafeAreaView>
        )}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          style={{
            textAlign: 'center',
            fontSize: 38,
            color: 'white',
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: 24,
            fontFamily: 'Shark',
            textTransform: 'uppercase',
            textShadowOffset: {
              width: -1,
            },
            textShadowColor: theme.primary_color,
            textShadowRadius: 5,
          }}
        >
          {text}
        </Text>
      </ImageBackground>
    </SafeAreaView>
  );
};
