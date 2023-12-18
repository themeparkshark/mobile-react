import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  SafeAreaView,
  TextInput,
  View,
} from 'react-native';
import redeemCoinCode from '../api/endpoints/coin-codes/redeemCoinCode';
import InformationModal from '../components/InformationModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { CoinCodeType } from '../models/coin-code-type';

export default function RedeemCoinCodeScreen() {
  const [coinCode, setCoinCode] = useState<string>('');
  const [redeemedCoinCode, setRedeemedCoinCode] = useState<CoinCodeType>();
  const { refreshPlayer } = useContext(AuthContext);
  const rotate = useRef(new Animated.Value(0)).current;
  const { currencies } = useContext(CurrencyContext);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 20000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Redeem</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal />
        </TopbarColumn>
      </Topbar>
      <View
        style={{
          marginTop: -8,
          flex: 1,
        }}
      >
        <ImageBackground
          source={require('../../assets/images/screens/welcome/background.png')}
          style={{
            width: Dimensions.get('window').width,
            height: Dimensions.get('window').height,
            alignItems: 'center',
          }}
          resizeMode="cover"
        >
          <SafeAreaView
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              width: '80%',
            }}
          >
            {!redeemedCoinCode && (
              <TextInput
                style={{
                  borderWidth: 1,
                  paddingTop: 15,
                  paddingBottom: 15,
                  paddingLeft: 25,
                  paddingRight: 25,
                  borderRadius: 10,
                  backgroundColor: 'white',
                  fontSize: 20,
                  fontFamily: 'Knockout',
                  width: '55%',
                  textAlign: 'center',
                }}
                autoCapitalize="characters"
                onChangeText={setCoinCode}
                value={coinCode}
                maxLength={9}
                placeholder="Enter a coin code"
                returnKeyType="next"
                enablesReturnKeyAutomatically
                onSubmitEditing={async ({ nativeEvent }) => {
                  setRedeemedCoinCode(await redeemCoinCode(nativeEvent.text));
                  await refreshPlayer();
                }}
              />
            )}
            <View
              style={{
                width: '100%',
                height: 500,
                position: 'relative',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Animated.Image
                source={require('../../assets/images/screens/explore/starburst.png')}
                style={{
                  width: '100%',
                  height: 400,
                  position: 'absolute',
                  zIndex: -10,
                  opacity: 0.04,
                  transform: [
                    {
                      rotate: spin,
                    },
                  ],
                }}
                resizeMode="contain"
              />
              {redeemedCoinCode && (
                <View
                  style={{
                    flexDirection: 'row',
                    columnGap: 16,
                  }}
                >
                  {redeemedCoinCode.item && (
                    <View
                      style={{
                        marginBottom: 32,
                        borderRadius: 10,
                        backgroundColor: 'rgba(255, 255, 255, .8)',
                        borderColor: 'white',
                        borderWidth: 3,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        width: '40%',
                        aspectRatio: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowOffset: {
                          width: 0,
                          height: 0,
                        },
                        shadowOpacity: 0.4,
                        shadowRadius: 3,
                      }}
                    >
                      <Image
                        source={redeemedCoinCode.item.icon_url}
                        style={{
                          width: '60%',
                          aspectRatio: 1,
                        }}
                        contentFit="contain"
                      />
                    </View>
                  )}
                  {redeemedCoinCode.coins && (
                    <View
                      style={{
                        marginBottom: 32,
                        borderRadius: 10,
                        backgroundColor: 'rgba(255, 255, 255, .8)',
                        borderColor: 'white',
                        borderWidth: 3,
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        width: '40%',
                        aspectRatio: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowOffset: {
                          width: 0,
                          height: 0,
                        },
                        shadowOpacity: 0.4,
                        shadowRadius: 3,
                      }}
                    >
                      <Image
                        source={{
                          uri: currencies[0].icon_url,
                        }}
                        style={{
                          width: '60%',
                          aspectRatio: 1,
                        }}
                        contentFit="contain"
                      />
                    </View>
                  )}
                </View>
              )}
              <Image
                source={
                  redeemedCoinCode
                    ? require('../../assets/images/screens/redeem/chest_opened.png')
                    : require('../../assets/images/screens/redeem/chest_closed.png')
                }
                style={{
                  aspectRatio: 1,
                  height: 300,
                }}
                contentFit="contain"
              />
            </View>
          </SafeAreaView>
        </ImageBackground>
      </View>
    </>
  );
}
