import { useContext } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import search from '../api/endpoints/me/inventory/search';
import { AuthContext } from '../context/AuthProvider';
import { CrumbContext } from '../context/CrumbProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { crumbs } = useContext(CrumbContext);
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
        response.cost
          ? vsprintf(crumbs.errors.item_purchased, [response.name])
          : vsprintf(crumbs.errors.item_redeemed, [response.name]),
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

      return Alert.alert('', crumbs.errors.not_enough_coins, [
        {
          text: 'Ok',
          style: 'cancel',
        },
      ]);
    }

    const text =
      item.cost === 0
        ? vsprintf(crumbs.prompts.redeem_item, [item.name])
        : vsprintf(crumbs.prompts.purchase_item, [
            item.name,
            item.cost,
            user.coins,
          ]);

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
            vsprintf(crumbs.messages.item_purchased, [item.name]),
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
