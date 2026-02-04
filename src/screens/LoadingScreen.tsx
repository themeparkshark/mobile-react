import { sample } from 'lodash';
import { useContext, useEffect, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect, useEffectOnceWhen, useTimeoutWhen } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import Progress from '../components/Progress';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function LoadingScreen() {
  const { isReady, player } = useContext(AuthContext);
  const { requestPark, parkLoaded, permissionGranted } =
    useContext(LocationContext);
  const { labels } = useCrumbs();
  const { theme } = useContext(ThemeContext);
  const [progress, setProgress] = useState<number>(0);
  const [fact, setFact] = useState<string>();
  const hasUsername = !!player?.username;

  useEffectOnceWhen(() => {
    RootNavigation.navigate('Welcome');
  }, Boolean(isReady && !hasUsername));

  useAsyncEffect(async () => {
    if (!isReady || !hasUsername) {
      return;
    }

    if (!permissionGranted) {
      setProgress(100);
      return;
    }

    await requestPark();
  }, [isReady, permissionGranted, hasUsername]);

  useAsyncEffect(async () => {
    if (!isReady || !hasUsername) {
      return;
    }

    setProgress(50);
  }, [isReady, hasUsername]);

  useEffect(() => {
    if (!hasUsername) {
      return;
    }
    // Don't wait for parkLoaded - proceed after a short delay
    // parkLoaded may never be true in Travel Mode (not at a park)
    const timer = setTimeout(() => {
      setProgress(90);
    }, 2000);
    return () => clearTimeout(timer);
  }, [hasUsername]);

  useEffect(() => {
    setFact(sample(labels.splash_screen_facts));
  }, []);

  useTimeoutWhen(
    () => {
      setProgress(100);
    },
    3000,
    progress === 90
  );

  useEffect(() => {
    console.log('🦈 Loading screen state:', { progress, isReady, hasUsername, parkLoaded, permissionGranted });
  }, [progress, isReady, hasUsername, parkLoaded, permissionGranted]);

  // Force navigate after 5 seconds regardless of state
  useTimeoutWhen(
    () => {
      console.log('🦈 Force navigating to Explore');
      RootNavigation.navigate('Explore');
    },
    5000,
    isReady
  );

  useTimeoutWhen(
    () => {
      RootNavigation.navigate('Explore');
    },
    500,
    progress === 100 && hasUsername
  );

  return (
    <ImageBackground
      source={{
        uri: theme?.splash_screen_url,
      }}
      resizeMode="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <SafeAreaView
        style={{
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            marginBottom: 32,
            marginLeft: 'auto',
            marginRight: 'auto',
            width: '80%',
          }}
        >
          <Text
            style={{
              color: 'white',
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: 20,
              textShadowColor: 'rgba(0, 0, 0, .5)',
              textShadowOffset: {
                width: 1,
                height: 1,
              },
              textShadowRadius: 0,
              marginBottom: 16,
            }}
          >
            {fact}
          </Text>
          <View
            style={{
              borderRadius: 50,
              borderColor: 'white',
              borderWidth: 3,
            }}
          >
            <Progress progress={progress} />
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}
