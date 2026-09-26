import { Image, ImageBackground, LogBox, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from 'react-native-error-boundary';
import Root from './src/Root';

const ErrorFallback = ({ resetError }: { error: Error; resetError: () => void }) => {
  return (
    <ImageBackground source={require('./assets/images/water_background.png')}
      resizeMode="cover" style={errorStyles.background}>
      <View style={errorStyles.card}>
        <Image source={require('./assets/images/screens/inventory/shark-colored-v2.png')}
          resizeMode="contain" style={errorStyles.shark} />
        <Text style={errorStyles.title}>A little rough water!</Text>
        <Text style={errorStyles.body}>The adventure paused. Let’s get your shark moving again.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again"
          onPress={resetError} style={errorStyles.button}>
          <Text style={errorStyles.buttonText}>TRY AGAIN</Text>
        </Pressable>
      </View>
    </ImageBackground>
  );
};

const errorStyles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  card: { alignItems: 'center', backgroundColor: '#EAF8FF', borderColor: '#72C5EA',
    borderWidth: 3, borderRadius: 24, paddingHorizontal: 22, paddingTop: 18,
    paddingBottom: 24, shadowColor: '#06294E', shadowOpacity: 0.28,
    shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  shark: { width: 185, height: 185, marginTop: -12, marginBottom: -8 },
  title: { color: '#173E67', fontSize: 27, fontWeight: '900', textAlign: 'center',
    letterSpacing: 0.2, marginTop: 2 },
  body: { color: '#315D7A', fontSize: 16, lineHeight: 23, textAlign: 'center',
    marginTop: 9, marginBottom: 23 },
  button: { backgroundColor: '#F9B832', borderColor: '#8D5A0A', borderWidth: 2,
    borderRadius: 15, paddingHorizontal: 35, paddingVertical: 13,
    shadowColor: '#704507', shadowOpacity: 0.25, shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  buttonText: { color: '#3D2D10', fontSize: 17, fontWeight: '900', letterSpacing: 1.2 },
});
import { ToastProvider } from './src/components/Toast';

// Suppress common network error warnings in LogBox
LogBox.ignoreLogs([
  'Possible Unhandled Promise Rejection',
  'Network Error',
  'API error',
  'AxiosError',
]);
import { AuthProvider } from './src/context/AuthProvider';
import { BroadcastProvider } from './src/context/BroadcastProvider';
import { CrumbProvider } from './src/context/CrumbProvider';
import { CurrencyProvider } from './src/context/CurrencyProvider';
import { DailyGiftProvider } from './src/context/DailyGiftProvider';
import { ForumProvider } from './src/context/ForumProvider';
import { LocationProvider } from './src/context/LocationProvider';
import { MusicProvider } from './src/context/MusicProvider';
import { NotificationProvider } from './src/context/NotificationProvider';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import { ThemeProvider } from './src/context/ThemeProvider';
import CurrencyFlyProvider from './src/context/CurrencyFlyProvider';
import { TutorialProvider } from './src/components/Tutorial';
import LinePlayRewardRecovery from './src/services/lineplay/LinePlayRewardRecovery';

export default function App() {
  if (__DEV__ && process.env.EXPO_PUBLIC_ERROR_FALLBACK_PREVIEW === '1') {
    return <ErrorFallback error={new Error('preview')} resetError={() => undefined} />;
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    {/* @ts-ignore */}
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AuthProvider>
        <LinePlayRewardRecovery />
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <NotificationProvider>
                <ForumProvider>
                  <CrumbProvider>
                    <LocationProvider>
                      <DailyGiftProvider>
                        <ThemeProvider>
                          <CurrencyProvider>
                            <CurrencyFlyProvider>
                              <TutorialProvider>
                                <ToastProvider>
                                  <Root />
                                </ToastProvider>
                              </TutorialProvider>
                            </CurrencyFlyProvider>
                          </CurrencyProvider>
                        </ThemeProvider>
                      </DailyGiftProvider>
                    </LocationProvider>
                  </CrumbProvider>
                </ForumProvider>
              </NotificationProvider>
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
