import { resolveIconName, type GameIconName } from '../../ui/iconNames';
import { iconForEmoji } from '../../ui/iconTokens';

/**
 * Ride achievements carry a GameIcon name from the server (an older server
 * sent emoji). Either way the screen draws art, never the raw key or emoji.
 */
export function achievementIconName(icon: unknown): GameIconName {
  return resolveIconName(icon) ?? (typeof icon === 'string' ? iconForEmoji(icon) : undefined) ?? 'trophy';
}
