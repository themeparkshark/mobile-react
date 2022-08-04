import client from '../../client';
import { Alert } from 'react-native';

export default async function updateUser(data) {
  try {
    const response = await client.put('/me', data);

    return response.data.data;
  } catch (error) {
    Alert.alert(
      '',
      error.response.data.message,
      [
        {
          text: 'Ok',
          style: 'cancel',
        },
      ]
    );

    throw error;
  }
}
