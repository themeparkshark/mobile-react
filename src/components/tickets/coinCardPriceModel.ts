/**
 * The coin card before PLAY! (T3, arcade plan Nov 20 2026), pure. In order:
 *   - "This ride's game" with its picture (the server's dealt game, shown before paying)
 *   - Win: the coin and its Parts (1, 2 or 4); Lose: its Parts (the price, arcade server only)
 *   - the price as Ticket pictures with the number beside them for grown-ups
 *   - a limited coin's leave date, as a date (never a countdown)
 * Nothing is guessed: no dealt game hides the game row, no served price hides the pictures.
 */
import { servedTicketPrice } from './ticketPipsModel';

export type DealtGame = 'tap' | 'memory' | 'trivia';
const GAME_NAMES: Readonly<Record<DealtGame, string>> = { tap: 'Whack-a-Shark', memory: 'Memory Match', trivia: 'Beat the Buzzer' };

export interface CoinCardPriceInput {
  readonly game?: string | null;
  readonly price?: unknown;
  /** The coin's win Parts tier (task.ride_parts_reward). */
  readonly winParts?: number | null;
  readonly arcade: boolean;
  /** A limited coin's last day ("Monday, Nov 30"), already in words. */
  readonly leavesOn?: string | null;
  /** Boards in one game (Memory Match deals 3), from the server's deal. */
  readonly boards?: number | null;
}

export interface CoinCardPrice {
  readonly game: { readonly id: DealtGame; readonly name: string } | null;
  readonly win: { readonly parts: number | null; readonly text: string };
  readonly lose: { readonly parts: number; readonly text: string } | null;
  readonly price: number | null;
  readonly leaves: string | null;
  /** "One game, 3 boards" with one picture per board (T9), or null for a one-board game. */
  readonly boards: { readonly count: number; readonly text: string } | null;
}

const partsWord = (n: number) => `${n} Part${n === 1 ? '' : 's'}`;

export function coinCardPrice(input: CoinCardPriceInput): CoinCardPrice {
  const id = typeof input.game === 'string' && input.game in GAME_NAMES ? input.game as DealtGame : null;
  const price = servedTicketPrice(input.price);
  const win = typeof input.winParts === 'number' && Number.isFinite(input.winParts) && input.winParts > 0 ? Math.floor(input.winParts) : null;
  return {
    game: id ? { id, name: GAME_NAMES[id] } : null,
    win: { parts: win, text: win ? `coin + ${partsWord(win)}` : 'the coin' },
    // A loss pays Parts only on the arcade server; today's server pays nothing, so the row hides there.
    lose: input.arcade && price != null ? { parts: price, text: partsWord(price) } : null,
    price,
    leaves: input.leavesOn ? `Leaves ${input.leavesOn}` : null,
    boards: typeof input.boards === 'number' && input.boards > 1
      ? { count: Math.min(5, Math.floor(input.boards)), text: `One game, ${Math.min(5, Math.floor(input.boards))} boards` } : null,
  };
}
