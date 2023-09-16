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
import shortenNumber from '../helpers/shorten-number';
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
  showPumpkins = false,
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
  readonly showPumpkins?: boolean;
  readonly parkCoin?: string | null;
  readonly parkCoins?: number | null;
  readonly onBackButtonPress?: () => void;
}) {
  const { user } = useContext(AuthContext);
  const { theme } = useContext(ThemeContext);

  const BackButton = () => {
    return (
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
    );
  };

  const Currency = ({ image, count }: { image: any; count: number }) => {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Image
          source={image}
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
          {shortenNumber(count)}
        </Text>
      </View>
    );
  };

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
        source={
          purple
            ? require('../../assets/images/screens/store/purple_topbar.png')
            : theme?.top_bar_url
            ? { url: theme.top_bar_url }
            : require('../../assets/images/screens/explore/topbar.png')
        }
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
                  flex: text ? 0 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                {leftButton}
                {showBackButton && <BackButton />}
                {parkCoins !== null && (
                  <Currency
                    image={parkCoin}
                    count={user?.park_coins_count ?? 0}
                  />
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
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Currency
                  image={require('../../assets/images/keys.png')}
                  count={user?.keys ?? 0}
                />
              </View>
            )}
            {showPumpkins && (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Currency
                  image={require('../../assets/images/keys.png')}
                  count={user?.pumpkins ?? 0}
                />
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
                  flex: text ? 0 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                {rightButton}
                {informationModalId && (
                  <InformationModal id={informationModalId} />
                )}
                {showCoins && (
                  <Currency
                    image={require('../../assets/images/coins.png')}
                    count={user?.coins ?? 0}
                  />
                )}
              </View>
            )}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}
