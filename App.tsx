import ErrorBoundary from 'react-native-error-boundary';
import { AuthProvider } from './src/context/AuthProvider';
import { BroadcastProvider } from './src/context/BroadcastProvider';
import { FriendProvider } from './src/context/FriendProvider';
import { MusicProvider } from './src/context/MusicProvider';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import Root from './src/Root';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <FriendProvider>
                <Root />
              </FriendProvider>
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
