import { useContext } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';

/**
 * GuestGate — wraps any pressable element.
 * If the user is signed in, children render normally.
 * If guest (no player), tapping shows a gentle nudge to sign in.
 * 
 * Usage:
 *   <GuestGate>
 *     <Button onPress={doThing}>Buy Item</Button>
 *   </GuestGate>
 * 
 * Or as a function:
 *   GuestGate.isGuest(player) → boolean
 */
export function useGuestCheck() {
  const { player } = useContext(AuthContext);
  
  const isGuest = !player;
  
  const requireAccount = (): boolean => {
    if (!player) {
      RootNavigation.navigate('Login');
      return false;
    }
    return true;
  };
  
  return { isGuest, requireAccount, player };
}
