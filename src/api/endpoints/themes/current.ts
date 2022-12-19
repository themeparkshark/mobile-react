import client from '../../client';
import { ThemeType } from '../../../models/theme-type';
import { ApiResponseType } from '../../../models/api-response-type';

export default async function current(): Promise<ThemeType> {
  const { data } = await client.get<ApiResponseType<ThemeType>>(
    '/current-theme'
  );

  return data.data;
}
