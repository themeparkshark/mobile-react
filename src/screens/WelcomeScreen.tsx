import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from 'react-native';
import updatePlayer from '../api/endpoints/me/update-player';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState<string>('');
  const { player, refreshPlayer } = useContext(AuthContext);
  const rotate = useRef(new Animated.Value(0)).current;
  const { labels } = useCrumbs();

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
            textShadowColor: 'rgba(0, 0, 0, .5)',
            textShadowOffset: {
              width: 2,
              height: 2,
            },
            textShadowRadius: 0,
            color: 'white',
            fontFamily: 'Shark',
            fontSize: 36,
            textTransform: 'uppercase',
          }}
        >
          {labels.welcome}
        </Text>
        <Text
          style={{
            fontFamily: 'Knockout',
            color: 'white',
            paddingBottom: 8,
            fontSize: 18,
          }}
        >
          Create Shark Name:
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
          returnKeyType="next"
          enablesReturnKeyAutomatically
          onSubmitEditing={async ({ nativeEvent }) => {
            try {
              await updatePlayer({
                username: nativeEvent.text,
              });
            } catch (error) {
              Alert.alert(error.response.data.errors.username[0], '', [
                {
                  text: 'Ok',
                },
              ]);

              return;
            }

            await refreshPlayer();

            navigation.navigate('Membership', {
              intro: true,
            });
          }}
        />
        <Text
          style={{
            color: 'white',
            fontFamily: 'Knockout',
            fontSize: 16,
            paddingTop: 8,
          }}
        >
          4 - 12 letters or numbers. No spaces.
        </Text>
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
  );
}
