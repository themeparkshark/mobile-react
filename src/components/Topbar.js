import { Dimensions, ImageBackground, SafeAreaView, Text, View, Image } from 'react-native';
import { ThemeContext } from '../context/ThemeProvider';
import { AuthContext } from '../context/AuthProvider';
import { useContext } from 'react';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import coins from '../../assets/images/coins.png';
import diamonds from '../../assets/images/purple_diamonds.png';
import topbar from '../../assets/images/screens/explore/topbar.png';
import back from '../../assets/images/screens/explore/back.png';

export default function Topbar({ button, text, showBackButton = false, showCoins = false, showPurpleDiamonds = false }) {
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(AuthContext);
  const width = text ? (showCoins ? '20%' : '15%') : '20%';

  return (
    <SafeAreaView
      style={{
        zIndex: 20,
      }}
    >
      <ImageBackground
        source={topbar}
        resizeMode="cover"
        style={{
          height: 120,
          marginTop: -50,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <SafeAreaView>
          <View
            style={{
              paddingLeft: 12,
              paddingRight: 12,
              flexDirection: 'row',
              alignItems: 'center',
              width: Dimensions.get('window').width,
              height: 80,
            }}
          >
            {(showPurpleDiamonds || showBackButton || showCoins || button) && (
              <View
                style={{
                  width,
                }}
              >
                {showBackButton && (
                  <Button onPress={() => RootNavigation.goBack()}>
                    <Image
                      source={back}
                      style={{
                        width: 35,
                        height: 35,
                        resizeMode: 'contain',
                      }}
                    />
                  </Button>
                )}
                {showPurpleDiamonds && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center'
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
                )}
              </View>
            )}
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit={true}
                style={{
                  textAlign: 'center',
                  fontSize: 38,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                  paddingLeft: 12,
                  paddingRight: 12,
                }}
              >
                {text}
              </Text>
            </View>
            {(showPurpleDiamonds || showBackButton || showCoins || button) && (
              <View
                style={{
                  width,
                }}
              >
                {button}
                {showCoins && (
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
                )}
              </View>
            )}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </SafeAreaView>
  );
};
