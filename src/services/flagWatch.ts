import { useEffect } from 'react';
import { AppState } from 'react-native';
import { setFeatureFlagWatch, setFeatureFlagsAppActive } from '../api/endpoints/platform/feature-flags';

/**
 * The root's one switch watcher (T095): after a slow or failed /feature-flags
 * read the shared store retries by itself while the app is open, and reads
 * again the moment the app comes back to the front. Mounted once in Root.
 */
export default function useFeatureFlagWatch(): void {
  useEffect(() => {
    setFeatureFlagWatch(true);
    setFeatureFlagsAppActive(AppState.currentState !== 'background');
    const sub = AppState.addEventListener('change', state => setFeatureFlagsAppActive(state === 'active'));
    return () => { sub.remove(); setFeatureFlagWatch(false); };
  }, []);
}
