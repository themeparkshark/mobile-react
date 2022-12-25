import {
  Dimensions,
  Image,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import theme from '../config/theme';
import { AuthContext } from '../context/AuthProvider';
import { ReactNode, useContext } from 'react';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';

export default function Topbar({
  button = null,
  text = null,
  showBackButton = false,
  showCoins = false,
  showPurpleDiamonds = false,
}: {
  readonly button?: ReactNode | null;
  readonly text?: string | null;
  readonly showBackButton?: boolean;
  readonly showCoins?: boolean;
  readonly showPurpleDiamonds?: boolean;
}) {
  const { user } = useContext(AuthContext);
  const width = text ? (showCoins ? '20%' : '15%') : '20%';

  return (
    <SafeAreaView
      style={{
        zIndex: 20,
      }}
    >
      <ImageBackground
        source={require('../../assets/images/screens/explore/topbar.png')}
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
                      source={require('../../assets/images/screens/explore/back.png')}
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
                      alignItems: 'center',
                    }}
                  >
                    <Image
                      source={require('../../assets/images/purple_diamonds.png')}
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
                        textShadowColor: theme.primary,
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
                  textShadowColor: theme.primary,
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
                      source={require('../../assets/images/coins.png')}
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
                        textShadowColor: theme.primary,
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
}
