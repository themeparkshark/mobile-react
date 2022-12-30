import { Alert } from 'react-native';
import purchase from '../api/endpoints/me/inventory/purchase-item';
import {ItemType} from '../models/item-type';

export default async function collectItem(item: ItemType, onPurchase: () => void) {
  Alert.alert(
    '',
    `You have found a ${item.name}. Would you like to pick it up?`,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Ok',
        onPress: async () => {
          const response = await purchase(item);

          if (onPurchase) {
            onPurchase();
          }

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
    ]
  );
}
