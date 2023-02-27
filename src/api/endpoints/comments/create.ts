import { Alert } from 'react-native';
import { ApiResponseType } from '../../../models/api-response-type';
import { CommentType } from '../../../models/comment-type';
import client from '../../client';

export default async function createComment(
  thread: number,
  comment: string,
  parent?: number | null
): Promise<CommentType> {
  try {
    const { data } = await client.post<ApiResponseType<CommentType>>(
      `/threads/${thread}/comments`,
      {
        comment_id: parent,
        content: comment,
      }
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
