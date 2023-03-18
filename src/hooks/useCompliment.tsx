import { useContext } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import createCompliment from '../api/endpoints/compliments/create';
import { AuthContext } from '../context/AuthProvider';
import { UserType } from '../models/user-type';
import useCrumbs from './useCrumbs';

export default function useCompliment() {
  const { errors, messages, prompts } = useCrumbs();
  const { user: currentUser, isReady } = useContext(AuthContext);

  const complimentUser = async (user: UserType) => {
    if (!isReady || !currentUser) {
      return;
    }

    Alert.alert('', vsprintf(prompts.compliment, [user?.screen_name]), [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Ok',
        onPress: async () => {
          try {
            await createCompliment(user.id);
          } catch {
            Alert.alert('', errors.max_compliments_created, [
              {
                text: 'Ok',
              },
            ]);

            return;
          }

          Alert.alert('', messages.compliment_created, [
            {
              text: 'Ok',
            },
          ]);
        },
      },
    ]);
  };

  return {
    complimentUser,
  };
}
