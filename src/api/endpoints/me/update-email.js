import client from '../../client';
import { Alert } from 'react-native';

export default async function updateEmail(data) {
  try {
    const response = await client.put('/me/email', data);

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
