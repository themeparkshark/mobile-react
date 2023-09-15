import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { ReactNode, useContext } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthProvider';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';
import Broadcasts from './Broadcasts';
import InformationModal from './InformationModal';

export default function Topbar({
  informationModalId = null,
  leftButton = null,
  rightButton = null,
  text = null,
  showBackButton = false,
  showCoins = false,
  showKeys = false,
  parkCoin = null,
  parkCoins = null,
  purple = false,
  onBackButtonPress,
}: {
  readonly informationModalId?: number | null;
  readonly rightButton?: ReactNode | null;
  readonly leftButton?: ReactNode | null;
  readonly text?: string | null;
  readonly purple?: boolean;
  readonly showBackButton?: boolean;
  readonly showCoins?: boolean;
  readonly showKeys?: boolean;
  readonly parkCoin?: string | null;
  readonly parkCoins?: number | null;
  readonly onBackButtonPress?: () => void;
}) {
  const { user } = useContext(AuthContext);
  const width = text ? (showCoins ? '20%' : '15%') : '33.3333333%';
  const { theme } = useContext(ThemeContext);

  let background;

  if (purple) {
    background = require('../../assets/images/screens/store/purple_topbar.png');
  } else {
    if (theme?.top_bar_url) {
      background = { url: theme.top_bar_url };
    } else {
      background = require('../../assets/images/screens/explore/topbar.png');
    }
  }

  return (
    <View
      style={{
        width: Dimensions.get('window').width,
        zIndex: 20,
        position: 'relative',
      }}
    >
      <SafeAreaView
        style={{
          marginTop: Constants.statusBarHeight,
          position: 'absolute',
        }}
      >
        <Broadcasts />
      </SafeAreaView>
      <ImageBackground
        source={background}
        resizeMode="cover"
        style={{
          height: 70 + Constants.statusBarHeight,
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
            {(parkCoins !== null ||
              showBackButton ||
              showCoins ||
              leftButton ||
              rightButton ||
              informationModalId) && (
              <View
                style={{
                  width,
                  alignItems: 'flex-start',
                }}
              >
                {leftButton}
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
                      }}
                      contentFit="contain"
                    />
                  </Button>
                )}
                {parkCoins !== null && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Image
                      source={parkCoin}
                      style={{
                        width: 35,
                        height: 35,
                        marginRight: 8,
                      }}
                      contentFit="contain"
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
            {!showKeys && (
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
            )}
            {showKeys && (
              <View
                style={{
                  width,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Image
                    source={require('../../assets/images/keys.png')}
                    style={{
                      width: 35,
                      height: 35,
                      marginRight: 8,
                    }}
                    contentFit="contain"
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
                    {user?.keys}
                  </Text>
                </View>
              </View>
            )}
            {(parkCoins !== null ||
              showBackButton ||
              showCoins ||
              leftButton ||
              rightButton ||
              informationModalId) && (
              <View
                style={{
                  width,
                  alignItems: 'flex-end',
                }}
              >
                {rightButton}
                {informationModalId && (
                  <InformationModal id={informationModalId} />
                )}
                {showCoins && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Image
                      source={require('../../assets/images/coins.png')}
                      style={{
                        width: 35,
                        height: 35,
                      }}
                      contentFit="contain"
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
                        marginLeft: 8,
                      }}
                      adjustsFontSizeToFit
                      numberOfLines={1}
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
    </View>
  );
}
