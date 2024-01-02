import { useContext, useState } from 'react';
import { Alert } from 'react-native';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { ItemType } from '../models/item-type';
import { PlayerType } from '../models/player-type';
import useCrumbs from './useCrumbs';

export default function usePurchaseItem() {
  const { playSound } = useContext(SoundEffectContext);
  const { errors, messages, prompts } = useCrumbs();
  const { player, isReady, refreshPlayer } = useContext(AuthContext);
  const [hasPurchased, setHasPurchased] = useState<boolean>(false);

  const purchaseItem = async (item: ItemType) => {
    if (!isReady || !player) {
      return;
    }

    if (item.has_purchased || hasPurchased) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert(
        item.cost
          ? vsprintf(errors.item_purchased, [item.name])
          : vsprintf(errors.item_redeemed, [item.name]),
        '',
        [
          {
            text: 'Ok',
          },
        ]
      );
    }

    if (!player.is_subscribed && item.is_member_item) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert(
        vsprintf(errors.membership_required_for_item, [item.name]),
        '',
        [
          {
            text: 'Ok',
            style: 'cancel',
          },
          {
            text: 'Learn more',
            onPress: () => {
              RootNavigation.navigate('Membership');
            },
          },
        ]
      );
    }

    if (player[item.currency.name.toLowerCase()] < item.cost) {
      playSound(require('../../assets/sounds/purchase_item_cancel.mp3'));

      return Alert.alert(
        vsprintf(errors.not_enough_currency, [item.currency.name]),
        '',
        [
          {
            text: 'Ok',
          },
        ]
      );
    }

    const text =
      item.cost === 0
        ? vsprintf(prompts.redeem_item, [item.name])
        : vsprintf(prompts.purchase_item, [
            item.name,
            item.cost,
            item.currency.name,
            player[item.currency.name.toLowerCase() as keyof PlayerType],
            item.currency.name,
          ]);

    playSound(require('../../assets/sounds/purchase_item_prompt.mp3'));

    Alert.alert(text, '', [
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
          await refreshPlayer();

          setHasPurchased(true);

          playSound(require('../../assets/sounds/purchase_item_success.mp3'));

          Alert.alert(vsprintf(messages.item_purchased, [item.name]), '', [
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
