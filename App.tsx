import ErrorBoundary from 'react-native-error-boundary';
import * as Sentry from 'sentry-expo';
import { AuthProvider } from './src/context/AuthProvider';
import { BroadcastProvider } from './src/context/BroadcastProvider';
import { FriendProvider } from './src/context/FriendProvider';
import { MusicProvider } from './src/context/MusicProvider';
import { NotificationProvider } from './src/context/NotificationProvider';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import Root from './src/Root';

Sentry.init({
  dsn: 'https://2766e9daf5164076a418442d455d1bca@o1233862.ingest.sentry.io/4504511020138496',
  enableInExpoDevelopment: true,
  debug: __DEV__,
  enableNative: false,
});

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <FriendProvider>
                <NotificationProvider>
                  <Root />
                </NotificationProvider>
              </FriendProvider>
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
