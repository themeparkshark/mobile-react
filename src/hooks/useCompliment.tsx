import { useContext } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import createCompliment from '../api/endpoints/compliments/create';
import { AuthContext } from '../context/AuthProvider';
import { PlayerType } from '../models/player-type';
import useCrumbs from './useCrumbs';

export default function useCompliment() {
  const { errors, messages, prompts } = useCrumbs();
  const { player: currentPlayer, isReady } = useContext(AuthContext);

  const complimentPlayer = async (player: PlayerType) => {
    if (!isReady || !currentPlayer) {
      return;
    }

    Alert.alert(vsprintf(prompts.compliment, [player?.screen_name]), '', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Ok',
        onPress: async () => {
          try {
            await createCompliment(player.id);
          } catch {
            Alert.alert(errors.max_compliments_created, '', [
              {
                text: 'Ok',
              },
            ]);

            return;
          }

          Alert.alert(messages.compliment_created, '', [
            {
              text: 'Ok',
            },
          ]);
        },
      },
    ]);
  };

  return {
    complimentPlayer,
  };
}
