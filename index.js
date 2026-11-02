// Must load first: silences every sound on test simulators (EXPO_PUBLIC_STUDIO_MUTE, lane tooling only).
import './src/dev/studioMute';
// One door for every native sheet, and no JS setNativeProps from animated digits. Must load before anything renders.
import './src/ui/installNativeGuards';
// Lane tooling only (EXPO_PUBLIC_SNP_TRACE): counts JS setNativeProps calls. Inert in store and OTA bundles.
import './src/dev/setNativePropsTrace';
import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Dev only: review recordings run without the LogBox overlay.
if (__DEV__ && process.env.EXPO_PUBLIC_CLEAN_RECORDING === '1') LogBox.ignoreAllLogs(true);
import App from './App';

registerRootComponent(App);
