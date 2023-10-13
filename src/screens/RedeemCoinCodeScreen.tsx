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
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import { CoinCodeType } from '../models/coin-code-type';

export default function RedeemCoinCodeScreen() {
  const [coinCode, setCoinCode] = useState<string>('');
  const [redeemedCoinCode, setRedeemedCoinCode] = useState<CoinCodeType>();
  const { refreshUser } = useContext(AuthContext);
  const rotate = useRef(new Animated.Value(0)).current;

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
      <Topbar text="Redeem" showBackButton />
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
              autoFocus
              autoCapitalize="none"
              onChangeText={setCoinCode}
              value={coinCode}
              maxLength={9}
              placeholder="Enter a coin code"
              returnKeyType="next"
              enablesReturnKeyAutomatically
              onSubmitEditing={async ({ nativeEvent }) => {
                setRedeemedCoinCode(await redeemCoinCode(nativeEvent.text));

                await refreshUser();
              }}
            />
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
              <Image
                source={require('../../assets/images/screens/welcome/shark.png')}
                style={{
                  width: '100%',
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
