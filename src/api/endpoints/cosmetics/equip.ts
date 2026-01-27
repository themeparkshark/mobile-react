import api from '../../api';

/**
 * Equip a cosmetic item
 */
export default async function equipCosmetic(
  cosmeticId: number
): Promise<{
  success: boolean;
  equipped: {
    shark_skin?: number;
    frame?: number;
    badge?: number;
    trail?: number;
  };
}> {
  const response = await api.post(`/api/v2/cosmetics/${cosmeticId}/equip`);
  return response.data;
}
