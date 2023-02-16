import { useContext } from 'react';
import { Alert } from 'react-native';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import search from '../api/endpoints/me/inventory/search';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { user, isReady, refreshUser } = useContext(AuthContext);

  const purchaseItem = async (item: ItemType) => {
    if (!isReady || !user) {
      return;
    }

    const response = await search(item);

    if (response.has_purchased) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert(
        '',
        `You have already ${
          item.cost === 0 ? 'redeemed' : 'purchased'
        } the ${item.name}.`,
        [
          {
            text: 'Ok',
            style: 'cancel',
          },
        ]
      );
    }

    if (user.coins < item.cost) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert('', 'You need more coins.', [
        {
          text: 'Ok',
          style: 'cancel',
        },
      ]);
    }

    const text =
      item.cost === 0
        ? `You have found a ${item.name}. Would you like to pick it up?`
        : `Would you like to buy the ${item.name} for ${item.cost} coins? You currently have ${user.coins} coins.`;

    playSound(require('../../assets/sounds/purchase_item_prompt.mp3'));

    Alert.alert('', text, [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: async () => {
          playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));
        },
      },
      {
        text: 'Ok',
        onPress: async () => {
          const response = await purchase(item);
          await refreshUser();

          playSound(require('../../assets/sounds/purchase_item_success.mp3'));

          Alert.alert(
            '',
            `${response.name} has been added to your inventory.`,
            [
              {
                text: 'Ok',
                style: 'cancel',
              },
            ]
          );
        },
      },
    ]);
  };

  return {
    purchaseItem,
  };
}
