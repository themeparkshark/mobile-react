import {
  Dimensions,
  Image,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import { ReactNode, useContext } from 'react';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';

export default function Topbar({
  button = null,
  text = null,
  showBackButton = false,
  showCoins = false,
  parkCoin = null,
  parkCoins = null,
  purple = false,
  onBackButtonPress,
}: {
  readonly button?: ReactNode | null;
  readonly text?: string | null;
  readonly purple?: boolean;
  readonly showBackButton?: boolean;
  readonly showCoins?: boolean;
  readonly parkCoin?: string | null;
  readonly parkCoins?: number | null;
  readonly onBackButtonPress?: () => void;
}) {
  const { user } = useContext(AuthContext);
  const width = text ? (showCoins ? '20%' : '15%') : '50%';

  return (
    <SafeAreaView
      style={{
        zIndex: 20,
      }}
    >
      <ImageBackground
        source={
          purple
            ? require('../../assets/images/screens/store/purple_topbar.png')
            : require('../../assets/images/screens/explore/topbar.png')
        }
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
            {(parkCoins !== null || showBackButton || showCoins || button) && (
              <View
                style={{
                  width,
                }}
              >
                {showBackButton && (
                  <Button
                    onPress={async () => {
                      if (onBackButtonPress) {
                        await onBackButtonPress();
                      }

                      RootNavigation.goBack();
                    }}
                  >
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
                {parkCoins !== null && parkCoin && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Image
                      source={{
                        uri: parkCoin,
                      }}
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
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowOffset: {
                          width: 2,
                          height: 2,
                        },
                        textShadowRadius: 0,
                      }}
                    >
                      {parkCoins}
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
                  fontSize: showCoins ? 28 : 38,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowColor: 'rgba(0, 0, 0, .5)',
                  textShadowOffset: {
                    width: 2,
                    height: 2,
                  },
                  textShadowRadius: 0,
                  paddingLeft: 12,
                  paddingRight: 12,
                }}
              >
                {text}
              </Text>
            </View>
            {(parkCoins !== null || showBackButton || showCoins || button) && (
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
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Text
                      style={{
                        textAlign: 'center',
                        fontSize: 24,
                        color: 'white',
                        fontFamily: 'Shark',
                        textTransform: 'uppercase',
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowOffset: {
                          width: 2,
                          height: 2,
                        },
                        textShadowRadius: 0,
                        marginRight: 8,
                      }}
                      adjustsFontSizeToFit
                      numberOfLines={1}
                    >
                      {user?.coins}
                    </Text>
                    <Image
                      source={require('../../assets/images/coins.png')}
                      style={{
                        width: 30,
                        height: 30,
                        resizeMode: 'contain',
                      }}
                    />
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
