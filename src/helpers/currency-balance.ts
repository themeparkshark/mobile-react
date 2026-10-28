import type { PlayerType } from '../models/player-type';

export default function currencyBalance(player: PlayerType, name: string): number {
  switch (name.toLowerCase()) {
    case 'coins': return player.coins ?? 0;
    case 'keys': return player.keys ?? 0;
    case 'tickets': return player.tickets ?? 0;
    case 'energy': return player.energy ?? 0;
    // vocab-allow: the server's old currency name, matched here and never shown
    case 'park coins': return player.park_coins_count; // clarity-allow: the server's old currency name
    default: {
      const key = name.toLowerCase().replace(/\s+/g, '_');
      const value = (player as unknown as Record<string, unknown>)[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    }
  }
}
