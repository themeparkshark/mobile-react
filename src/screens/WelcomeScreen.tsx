import {
  Button,
  Dimensions,
  Image,
  ImageBackground,
  Text,
  TextInput,
  SafeAreaView,
  View,
  Animated,
  Easing,
} from 'react-native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import updateUser from '../api/endpoints/me/update-user';
import { AuthContext } from '../context/AuthProvider';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState<string>('');
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

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Welcome screen.');
    }, [])
  );

  return (
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
        <Text
          style={{
            paddingBottom: 32,
            textShadowRadius: 5,
            textShadowColor: 'black',
            color: 'white',
            fontFamily: 'Shark',
            fontSize: 36,
            textTransform: 'uppercase',
          }}
        >
          Welcome!
        </Text>
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
          autoCapitalize="none"
          onChangeText={setUsername}
          value={username}
          maxLength={12}
          placeholder="Enter a username"
          returnKeyType="next"
          enablesReturnKeyAutomatically
          onSubmitEditing={async ({ nativeEvent }) => {
            await updateUser({
              username: nativeEvent.text,
            });

            await refreshUser();

            navigation.navigate('Explore');
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
            resizeMode="contain"
            style={{
              width: '100%',
              height: 300,
            }}
          />
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}
