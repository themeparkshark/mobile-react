import { LogBox } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from 'react-native-error-boundary';
import Root from './src/Root';
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
import { WeatherProvider } from './src/context/WeatherProvider';
import CurrencyFlyProvider from './src/context/CurrencyFlyProvider';
import { TutorialProvider } from './src/components/Tutorial';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <NotificationProvider>
                <ForumProvider>
                  <CrumbProvider>
                    <LocationProvider>
                      <WeatherProvider>
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
                      </WeatherProvider>
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
