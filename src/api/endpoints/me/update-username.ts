import client from '../../client';
import { Alert } from 'react-native';
import { UserType } from '../../../models/user-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function updateUsername(payload: {
  readonly username: string;
}): Promise<UserType> {
  try {
    const { data } = await client.put<ApiResponseType<UserType>>(
      '/me/username',
      payload
    );

    return data.data;
  } catch (error) {
    Alert.alert('', error.response.data.message, [
      {
        text: 'Ok',
        style: 'cancel',
      },
    ]);

    throw error;
  }
}
