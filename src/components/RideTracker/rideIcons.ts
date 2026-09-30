/**
 * Ride Tracker art for server-sent icons (WS8). The server sends either a
 * GameIcon name, an '[icon:name]' token or (until WS7 switches them) a legacy
 * emoji. Emoji are mapped to art or fall back; they never render.
 */
import { iconForEmoji, resolveIconName, type GameIconName } from '../../ui';

export function serverIcon(icon: string | null | undefined, fallback: GameIconName): GameIconName {
  if (!icon) return fallback;
  const token = /^\[icon:([a-zA-Z0-9]+)\]$/.exec(icon.trim());
  return resolveIconName(token ? token[1] : icon.trim()) ?? iconForEmoji(icon.trim()) ?? fallback;
}
