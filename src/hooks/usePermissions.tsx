import { useContext } from 'react';
import { Alert } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from './useCrumbs';

export default function usePermissions() {
  const { user } = useContext(AuthContext);
  const { prompts } = useCrumbs();

  const permissions = {
    add_friends: user,
    become_a_member: user,
    create_compliments: user,
    create_threads: user,
    redeem_coin_codes: user,
    redeem_mascot_gifts: user,
    trade_pins: user,
    view_arcade: user,
    view_profile: user,
    watch_content: user,
  };

  return {
    hasPermission: (permission: string) => {
      return (
        Boolean(permissions[permission as keyof typeof permissions]) ?? false
      );
    },
    checkPermission: (permission: string) => {
      const hasPermission = permissions[permission as keyof typeof permissions];

      if (hasPermission) {
        return true;
      }

      Alert.alert(
        prompts.permissions[permission as keyof typeof permissions],
        '',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              RootNavigation.navigate('Login');
            },
          },
        ]
      );

      return false;
    },
  };
}
