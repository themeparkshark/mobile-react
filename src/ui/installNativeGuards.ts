/**
 * Native guards that must be in place before anything renders (index.js imports this second, right after the studio
 * mute). See ui/nativeModalDoor.ts and dev/setNativePropsTrace.ts for why.
 */
import { Platform } from 'react-native';
import Animated from 'react-native-reanimated';

// 1. Every <Modal> on iOS goes through the one door. React Native reads this seam the first time Modal is required.
if (Platform.OS === 'ios') {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const injection = require('react-native/Libraries/Modal/ModalInjection').default;
  injection.unstable_Modal = require('./DoorModal').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
}

// 2. Reanimated hands any animated prop it does not know to JS, as a setNativeProps per frame: a data race with its
// own UI-thread commit, and the rolling score crashed Whack through it. Named here, the score's digits (`text` and
// the `defaultValue` a Fabric TextInput draws) stay on the UI thread, with no JS call at all.
Animated.addWhitelistedNativeProps({ text: true, defaultValue: true });
