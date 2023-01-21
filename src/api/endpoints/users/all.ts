import client from '../../client';
import { ApiResponseType } from '../../../models/api-response-type';
import { UserType } from '../../../models/user-type';
import {Alert} from 'react-native';

export default async function searchUsers(query: string): Promise<UserType[]> {
  try {
    const { data } = await client.get<ApiResponseType<UserType[]>>(
      '/users',
      {
        params: {
          query,
        }
      }
    );

    return data.data;
  } catch (error) {
    Alert.alert('', error.response.data.errors.query[0], [
      {
        text: 'Ok',
      },
    ]);

    throw error;
  }
}
