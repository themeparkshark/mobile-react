import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { ComplimentType } from '../../../models/compliment-type';
import client from '../../client';

export default async function createCompliment(
  user: number
): Promise<ComplimentType> {
  try {
    const response = await client.post<ApiResponseType<ComplimentType>>(
      `/compliments/${user}`
    );

    return response.data.data;
  } catch (error) {
    Alert.alert('', 'You can only send one compliment to this user per day.', [
      {
        text: 'Ok',
      },
    ]);

    throw error;
  }
}
