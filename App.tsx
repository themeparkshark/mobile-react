import { Image, ImageBackground, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import ErrorBoundary from 'react-native-error-boundary';
import Root from './src/Root';
import { holdNativeSplash } from './src/nativeSplash';
import { captureException, captureMessage, initTelemetry } from './src/services/telemetry';
import { installConsoleRing } from './src/services/feedback/consoleRing';
import { installFatalHandler } from './src/services/fatalErrors';
import { BRAND, FONT, GameButton, OUTLINE, SHADOW } from './src/ui';

// Must run at module scope, before the first render, or the native launch
// screen may already be gone.
holdNativeSplash();
// Tester reports carry the recent console warnings and errors from launch on.
installConsoleRing();
// Crash reporting starts before any provider can throw.
if (initTelemetry() && __DEV__ && process.env.EXPO_PUBLIC_TELEMETRY_TEST === '1') {
  captureMessage('Telemetry test event', 'info', { test: 'true' });
}
// After telemetry, so it wraps telemetry's handler: a fatal throw outside render
// (onPress, timer, async) shows the reload card instead of closing the app, and
// is saved for Settings > Report a Problem.
installFatalHandler({
  errorUtils: (globalThis as unknown as { ErrorUtils?: Parameters<typeof installFatalHandler>[0]['errorUtils'] }).ErrorUtils,
  dev: __DEV__,
  report: (error, fatal) => { captureException(error, { fatal, handled: true, source: 'global-handler' }); },
});

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
        <GameButton label="Try again" onPress={resetError} style={errorStyles.button} />
      </View>}
    </ImageBackground>
  );
};

// WS0 kit tokens: cream card, navy outline, his yellow button art.
const errorStyles = StyleSheet.create({
  background: { flex: 1, justifyContent: 'center', paddingHorizontal: 22 },
  card: { alignItems: 'center', backgroundColor: BRAND.cream, borderColor: BRAND.navy,
    borderWidth: OUTLINE.thick, borderRadius: 26, paddingHorizontal: 22, paddingTop: 18,
    paddingBottom: 22, ...SHADOW.card },
  shark: { width: 185, height: 185, marginTop: -12, marginBottom: -8 },
  title: { color: BRAND.navy, fontFamily: FONT.display, fontSize: 34, textAlign: 'center',
    letterSpacing: 0.5, marginTop: 2 },
  body: { color: BRAND.blue, fontFamily: FONT.body, fontSize: 19, lineHeight: 24,
    textAlign: 'center', marginTop: 6, marginBottom: 18 },
  button: { maxWidth: 260 },
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
import HelpProvider from './src/components/help/HelpProvider';
import LinePlayRewardRecovery from './src/services/lineplay/LinePlayRewardRecovery';
import RemintNoticeModal from './src/components/RemintNoticeModal';

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
                                <HelpProvider>
                                  <ToastProvider>
                                    <Root />
                                    {/* Progression v2: the one-time re-mint card, through the PresentationQueue. */}
                                    <RemintNoticeModal />
                                  </ToastProvider>
                                </HelpProvider>
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
