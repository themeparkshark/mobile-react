import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { ThreadType } from '../../../models/thread-type';
import client from '../../client';

export default async function createThread(thread: {
  readonly title: string;
  readonly content?: string;
  readonly team?: 'mouse' | 'globe' | 'shark' | null;
}): Promise<ThreadType | null> {
  try {
    const { data } = await client.post<ApiResponseType<ThreadType>>(
      '/threads',
      thread
    );

    return data.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { message?: string } } };
    Alert.alert(axiosError.response?.data?.message ?? 'Error creating thread', '', [
      {
        text: 'Ok',
      },
    ]);
    return null;
  }
}
