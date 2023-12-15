import { useContext } from 'react';
import { Alert } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from './useCrumbs';

export default function usePermissions() {
  const { player } = useContext(AuthContext);
  const { prompts } = useCrumbs();

  const permissions = {
    add_friends: player,
    become_a_member: player,
    create_compliments: player,
    create_reports: player,
    create_threads: player,
    redeem_coin_codes: player,
    redeem_mascot_gifts: player,
    trade_pins: player,
    view_arcade: player,
    view_secret_store: player?.is_subscribed,
    view_profile: player,
    watch_content: player,
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
