import { Alert } from 'react-native';
import search from '../api/endpoints/me/inventory/search';
import purchase from '../api/endpoints/me/inventory/purchase-item';

export default async function purchaseItem(item, context) {
  const { user, updateUser } = context;
  const response = await search(item);

  if (response.has_purchased) {
    return Alert.alert(
      '',
      `You have already ${item.cost === 0 ? 'redeemed' : 'purchased'} this item.`,
      [
        {
          text: 'Ok',
          style: 'cancel',
        },
      ]
    );
  }

  if (user.coins < item.cost) {
    return Alert.alert(
      '',
      'You need more coins.',
      [
        {
          text: 'Ok',
          style: 'cancel',
        },
      ]
    );
  }

  const text = item.cost === 0
    ? `You have found ${item.name}. Would you like to pick it up?`
    : `Would you like to buy ${item.name} for ${item.cost} coins? You currently have ${user.coins} coins.`;

  Alert.alert(
    '',
    text,
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Ok',
        onPress: async () => {
          const response = await purchase(item);
          await updateUser();

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
        }
      },
    ]
  );
};
