import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import { MusicProvider } from './src/context/MusicProvider';
import ErrorBoundary from 'react-native-error-boundary';
import {BroadcastProvider} from './src/context/BroadcastProvider';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SoundEffectProvider>
          <MusicProvider>
            <BroadcastProvider>
              <Root />
            </BroadcastProvider>
          </MusicProvider>
        </SoundEffectProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
