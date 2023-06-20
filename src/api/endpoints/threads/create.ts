import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function createThread(thread: {
  readonly title: string;
  readonly content?: string;
}): Promise<ThreadType> {
  try {
    const { data } = await client.post<ApiResponseType<ThreadType>>(
      '/threads', thread
    );

    return data.data;
  } catch (error) {
    Alert.alert('', error.response.data.message, [
      {
        text: 'Ok',
      },
    ]);

    throw error;
  }
}
