import ErrorBoundary from 'react-native-error-boundary';
import { AuthProvider } from './src/context/AuthProvider';
import { BroadcastProvider } from './src/context/BroadcastProvider';
import { FriendProvider } from './src/context/FriendProvider';
import { MusicProvider } from './src/context/MusicProvider';
import { NotificationProvider } from './src/context/NotificationProvider';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import Root from './src/Root';
import {ForumProvider} from './src/context/ForumProvider';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <FriendProvider>
                <NotificationProvider>
                  <ForumProvider>
                    <Root />
                  </ForumProvider>
                </NotificationProvider>
              </FriendProvider>
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
