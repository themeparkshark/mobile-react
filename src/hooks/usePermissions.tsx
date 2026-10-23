import { useContext } from 'react';
import { gameAlert } from '../ui/GameDialog';
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

      // A friendly ask in the game's own dialog: sign in is the big button, "Not now" keeps playing.
      gameAlert(
        prompts.permissions[permission as keyof typeof permissions] ?? 'Sign in to save your shark.',
        'Sign in to make your own shark.',
        [
          { text: 'Sign in', onPress: () => { RootNavigation.navigate('Login'); } },
          { text: 'Not now', style: 'cancel' },
        ],
      );

      return false;
    },
  };
}
