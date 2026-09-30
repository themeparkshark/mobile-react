import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import ErrorBoundary from 'react-native-error-boundary';
import Root from './src/Root';
import { holdNativeSplash } from './src/nativeSplash';
import { captureException, captureMessage, initTelemetry } from './src/services/telemetry';

// Must run at module scope, before the first render, or the native launch
// screen may already be gone.
holdNativeSplash();
// Crash reporting starts before any provider can throw.
if (initTelemetry() && __DEV__ && process.env.EXPO_PUBLIC_TELEMETRY_TEST === '1') {
  captureMessage('Telemetry test event', 'info', { test: 'true' });
}

const reportBoundaryError = (error: Error) => {
  captureException(error, { source: 'error-boundary', handled: true });
};

const ErrorFallback = ({ resetError }: { error: Error; resetError: () => void }) => {
  // Registered fonts are shared app-wide; this only loads them when the crash
  // happened before Root finished loading. The card waits for the bundled
  // fonts (a few ms) so the brand type never flashes as system text; a font
  // failure still shows the card.
  const [fontsLoaded, fontError] = useFonts({
    Shark: require('./assets/fonts/shark-random-funnyness-2.ttf'),
    Knockout: require('./assets/fonts/knockout.otf'),
  });
  const fontsSettled = fontsLoaded || !!fontError;
  return (
    <ImageBackground source={require('./assets/images/water_background.png')}
      resizeMode="cover" style={errorStyles.background}>
      {fontsSettled && <View style={errorStyles.card}>
        <Image source={require('./assets/images/screens/inventory/shark-colored-v2.png')}
          resizeMode="contain" style={errorStyles.shark} />
        <Text style={errorStyles.title}>A little rough water!</Text>
        <Text style={errorStyles.body}>The adventure paused. Let’s get your shark moving again.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again"
          onPress={resetError}
          style={({ pressed }) => [errorStyles.buttonLip, pressed && errorStyles.buttonLipPressed]}>
          <View style={errorStyles.button}>
            <Text style={errorStyles.buttonText} maxFontSizeMultiplier={1.3}>TRY AGAIN</Text>
          </View>
        </Pressable>
      </View>}
    </ImageBackground>
  );
};

// Brand tokens (cream card, navy outline, gold button with its lip), matching
// the WS0 kit values until src/ui/tokens lands.
const errorStyles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  card: { alignItems: 'center', backgroundColor: '#fff8e4', borderColor: '#05346e',
    borderWidth: 3, borderRadius: 26, paddingHorizontal: 22, paddingTop: 18,
    paddingBottom: 26, shadowColor: '#04285a', shadowOpacity: 0.3,
    shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  shark: { width: 185, height: 185, marginTop: -12, marginBottom: -8 },
  title: { color: '#05346e', fontFamily: 'Shark', fontSize: 34, textAlign: 'center',
    letterSpacing: 0.5, marginTop: 2 },
  body: { color: '#0768b9', fontFamily: 'Knockout', fontSize: 19, lineHeight: 24,
    textAlign: 'center', marginTop: 6, marginBottom: 22 },
  buttonLip: { backgroundColor: '#d99a00', borderRadius: 18, paddingBottom: 4, minWidth: 220 },
  buttonLipPressed: { paddingBottom: 0, marginTop: 4 },
  button: { backgroundColor: '#ffcf3b', borderColor: '#05346e', borderWidth: 3,
    borderRadius: 18, paddingHorizontal: 30, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#05346e', fontFamily: 'Shark', fontSize: 26, letterSpacing: 1 },
});
import { ToastProvider } from './src/components/Toast';

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
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={reportBoundaryError}>
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
