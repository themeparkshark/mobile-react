import api from '../../client';
import { isCoordinate, isRecord } from '../../jsonGuard';

export interface CommunityCenter {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  available_gifts: number;
  can_give: boolean;
  can_claim: boolean;
  give_cooldown_remaining: number;
  claim_cooldown_remaining: number;
  give_cost?: number;
  give_tickets?: number;
}

export default async function getCommunityCenter(parkId: number): Promise<CommunityCenter | null> {
  try {
    console.log('🏠 getCommunityCenter: fetching for park', parkId);
    const response = await api.get(`/parks/${parkId}/community-center`);
    console.log('🏠 getCommunityCenter: success', response.data?.id);
    // The map places the center by its coordinates: anything else is "none here".
    const center = response.data;
    if (!isRecord(center) || !isCoordinate(center.latitude) || !isCoordinate(center.longitude)) return null;
    return center as unknown as CommunityCenter;
  } catch (error: any) {
    console.log('🏠 getCommunityCenter: error for park', parkId, 'status:', error?.response?.status, 'data:', JSON.stringify(error?.response?.data));
    return null;
  }
}
