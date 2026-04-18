import { useEffect, useState, useCallback } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Checks for OTA updates on app launch and when returning from background.
 * Shows a prompt when an update is available, then reloads the app.
 */
export function useAppUpdates() {
  const [isChecking, setIsChecking] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) return; // Skip in development
    if (isChecking) return;

    try {
      setIsChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        const result = await Updates.fetchUpdateAsync();

        if (result.isNew) {
          Alert.alert(
            'Update Available',
            'A new version of Theme Park Shark is ready! Restart to get the latest features.',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Restart Now',
                style: 'default',
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ],
          );
        }
      }
    } catch (e) {
      // Silently fail - don't disrupt the user experience
      console.log('Update check failed:', e);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

  useEffect(() => {
    // Check on initial mount
    checkForUpdate();

    // Check when app returns from background
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkForUpdate();
      }
    });

    return () => subscription.remove();
  }, [checkForUpdate]);
}
