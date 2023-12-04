import ErrorBoundary from 'react-native-error-boundary';
import Root from './src/Root';
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

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
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
                            <Root />
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
  );
}
