import api from '../../api';

interface CosmeticItem {
  id: number;
  name: string;
  description: string;
  icon_url: string;
  preview_url?: string;
  category: 'shark_skin' | 'frame' | 'badge' | 'trail';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  is_owned: boolean;
  is_equipped: boolean;
  unlock_method?: string;
}

/**
 * Get all cosmetics with player ownership
 */
export default async function getCosmetics(): Promise<{
  data: CosmeticItem[];
  equipped: {
    shark_skin?: number;
    frame?: number;
    badge?: number;
    trail?: number;
  };
}> {
  const response = await api.get('/api/v2/cosmetics');
  return response.data;
}
