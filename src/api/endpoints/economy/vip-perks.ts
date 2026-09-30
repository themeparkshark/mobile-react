import { resolveIconName, type GameIconName } from '../../../ui/iconNames';
import client from '../../client';

export type VipPerk = { icon: GameIconName; title: string; body: string };

/**
 * VIP perks as the server delivers them (GET /api/economy `vip_perks`, built
 * from config economy.vip). Anything malformed is dropped; an empty or failed
 * answer returns null so the screen keeps its built-in list.
 */
export function parseVipPerks(value: unknown): VipPerk[] | null {
  if (!Array.isArray(value)) return null;
  const perks = value.flatMap((perk): VipPerk[] => {
    const icon = resolveIconName((perk as { icon?: unknown })?.icon);
    const { title, body } = (perk ?? {}) as { title?: unknown; body?: unknown };
    return icon && typeof title === 'string' && title && typeof body === 'string' ? [{ icon, title, body }] : [];
  });
  return perks.length ? perks : null;
}

export default async function getVipPerks(): Promise<VipPerk[] | null> {
  try {
    const response = await client.get('/economy', { timeout: 8000 });
    return parseVipPerks(response.data?.data?.vip_perks);
  } catch {
    return null;
  }
}
