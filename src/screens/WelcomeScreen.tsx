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
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import updatePlayer from '../api/endpoints/me/update-player';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function WelcomeScreen({ navigation }) {
  const [username, setUsername] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const { player, refreshPlayer } = useContext(AuthContext);
  const rotate = useRef(new Animated.Value(0)).current;
  const { labels } = useCrumbs();
  
  const handleSubmit = async (name: string) => {
    const trimmed = name.trim();
    if (trimmed.length < 4) {
      Alert.alert('Too Short', 'Your shark name must be at least 4 characters.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await updatePlayer({ username: trimmed });
      await refreshPlayer();
      navigation.navigate('TeamSelection', {
        isOnboarding: true,
        onTeamSelected: () => {
          navigation.navigate('Membership', { intro: true });
        },
      });
    } catch (error: any) {
      // Crash-proof error handling
      const message = error?.response?.data?.errors?.username?.[0]
        ?? error?.response?.data?.message
        ?? 'Something went wrong. Please try again.';
      Alert.alert(message, '', [{ text: 'Ok' }]);
    } finally {
      setSubmitting(false);
    }
  };

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
          {labels?.welcome || 'Welcome!'}
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
          onSubmitEditing={({ nativeEvent }) => handleSubmit(nativeEvent.text)}
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
        {/* Submit button — many users don't know to press keyboard return */}
        <TouchableOpacity
          onPress={() => handleSubmit(username)}
          disabled={submitting || username.trim().length < 4}
          style={{
            marginTop: 20,
            backgroundColor: username.trim().length >= 4 ? '#fec90e' : 'rgba(255,255,255,0.3)',
            paddingVertical: 14,
            paddingHorizontal: 40,
            borderRadius: 25,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? (
            <ActivityIndicator color="#09268f" />
          ) : (
            <Text style={{
              fontFamily: 'Shark',
              fontSize: 20,
              color: '#09268f',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}>
              {labels?.letsgo || "Let's Go!"}
            </Text>
          )}
        </TouchableOpacity>
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
