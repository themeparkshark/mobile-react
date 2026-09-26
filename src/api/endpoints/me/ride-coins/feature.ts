import api from '../../../api';
import { FeaturedRideCoinType } from '../../../../models/player-type';

export default async function featureRideCoin(assetId: number | null): Promise<FeaturedRideCoinType | null> {
  const response = await api.put<{ featured_ride_coin: FeaturedRideCoinType | null }>(
    '/me/featured-ride-coin',
    { asset_id: assetId },
  );
  return response.data.featured_ride_coin;
}
