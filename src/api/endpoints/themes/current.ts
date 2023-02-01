import { ApiResponseType } from '../../../models/api-response-type';
import { ThemeType } from '../../../models/theme-type';
import client from '../../client';

export default async function current(): Promise<ThemeType> {
  const { data } = await client.get<ApiResponseType<ThemeType>>(
    '/current-theme'
  );

  return data.data;
}
