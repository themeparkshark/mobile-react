import ErrorBoundary from 'react-native-error-boundary';
import { AuthProvider } from './src/context/AuthProvider';
import { BroadcastProvider } from './src/context/BroadcastProvider';
import { CrumbProvider } from './src/context/CrumbProvider';
import { DailyGiftProvider } from './src/context/DailyGiftProvider';
import { LocationProvider } from './src/context/LocationProvider';
import { MusicProvider } from './src/context/MusicProvider';
import { NotificationProvider } from './src/context/NotificationProvider';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import Root from './src/Root';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <NotificationProvider>
                <CrumbProvider>
                  <LocationProvider>
                    <DailyGiftProvider>
                      <Root />
                    </DailyGiftProvider>
                  </LocationProvider>
                </CrumbProvider>
              </NotificationProvider>
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
