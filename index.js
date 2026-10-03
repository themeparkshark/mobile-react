import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Dev only: review recordings run without the LogBox overlay.
if (__DEV__ && process.env.EXPO_PUBLIC_CLEAN_RECORDING === '1') LogBox.ignoreAllLogs(true);
import App from './App';

registerRootComponent(App);
