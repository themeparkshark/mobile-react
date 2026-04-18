import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { CommentType } from '../../../models/comment-type';
import client from '../../client';

export default async function createComment(
  thread: number,
  comment: string,
  parent?: number | null
): Promise<CommentType | null> {
  try {
    const { data } = await client.post<ApiResponseType<CommentType>>(
      `/threads/${thread}/comments`,
      {
        comment_id: parent,
        content: comment,
      }
    );

    return data.data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { message?: string } } };
    Alert.alert(axiosError.response?.data?.message ?? 'Error creating comment', '', [
      {
        text: 'Ok',
      },
    ]);
    return null;
  }
}
