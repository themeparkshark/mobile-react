// Must load first: silences every sound on test simulators (EXPO_PUBLIC_STUDIO_MUTE, lane tooling only).
import './src/dev/studioMute';
import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Dev only: review recordings run without the LogBox overlay.
if (__DEV__ && process.env.EXPO_PUBLIC_CLEAN_RECORDING === '1') LogBox.ignoreAllLogs(true);
import App from './App';

registerRootComponent(App);
