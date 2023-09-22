import { useContext } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import search from '../api/endpoints/me/inventory/search';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { CurrencyEnum } from '../models/currency-enum';
import { ItemType } from '../models/item-type';
import { UserType } from '../models/user-type';
import useCrumbs from './useCrumbs';

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { errors, messages, prompts } = useCrumbs();
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
          ? vsprintf(errors.item_purchased, [response.name])
          : vsprintf(errors.item_redeemed, [response.name]),
        [
          {
            text: 'Ok',
          },
        ]
      );
    }

    if (
      item.currency.id === CurrencyEnum.SharkCoins &&
      user.coins < item.cost
    ) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert('', errors.not_enough_coins, [
        {
          text: 'Ok',
        },
      ]);
    }

    if (item.currency.id === CurrencyEnum.Keys && user.keys < item.cost) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert('', errors.not_enough_keys, [
        {
          text: 'Ok',
        },
      ]);
    }

    const text =
      item.cost === 0
        ? vsprintf(prompts.redeem_item, [item.name])
        : vsprintf(prompts.purchase_item, [
            item.name,
            item.cost,
            item.currency.name,
            user[item.currency.name.toLowerCase() as keyof UserType],
            item.currency.name,
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
          await purchase(item);
          await refreshUser();

          playSound(require('../../assets/sounds/purchase_item_success.mp3'));

          Alert.alert('', vsprintf(messages.item_purchased, [item.name]), [
            {
              text: 'Ok',
            },
          ]);
        },
      },
    ]);
  };

  return {
    purchaseItem,
  };
}
