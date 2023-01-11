import { AuthProvider } from './src/context/AuthProvider';
import Root from './src/Root';
import { SoundEffectProvider } from './src/context/SoundEffectProvider';
import { MusicProvider } from './src/context/MusicProvider';

export default function App() {
  return (
    <AuthProvider>
      <SoundEffectProvider>
        <MusicProvider>
          <Root />
        </MusicProvider>
      </SoundEffectProvider>
    </AuthProvider>
  );
}
