import { ApiResponseType } from '../../../models/api-response-type';
import { PlayerType } from '../../../models/player-type';
import client from '../../client';

export type ReportReason = 'inappropriate_username' | 'mean_to_me' | 'something_else';

export default async function reportPlayer(
  player: number,
  reason: ReportReason = 'inappropriate_username'
): Promise<PlayerType> {
  const { data } = await client.post<ApiResponseType<PlayerType>>(
    `/players/${player}/report`,
    { reason }
  );

  return data.data;
}
