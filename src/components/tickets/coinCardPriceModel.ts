/**
 * The coin card before PLAY! (T3, arcade plan Nov 20 2026), pure. In order:
 *   - "This ride's game" with its picture (the server's dealt game, shown before paying)
 *   - Win: the coin and its Parts (1, 2 or 4); Lose: its Parts (the price, arcade server only)
 *   - the price as Ticket pictures with the number beside them for grown-ups
 *   - a limited coin's leave date, as a date (never a countdown)
 *   - P14: the Parts already saved for this coin (the server's parts_waiting), "3 Parts saved. Win it to grow it."
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
  /** P14: Parts the player holds for this coin before winning it (task.parts_waiting); missing hides the row. */
  readonly partsWaiting?: unknown;
}

export interface CoinCardPrice {
  readonly game: { readonly id: DealtGame; readonly name: string } | null;
  readonly win: { readonly parts: number | null; readonly text: string };
  readonly lose: { readonly parts: number; readonly text: string } | null;
  readonly price: number | null;
  readonly leaves: string | null;
  /** "One game, 3 boards" with one picture per board (T9), or null for a one-board game. */
  readonly boards: { readonly count: number; readonly text: string } | null;
  /** P14: Parts already saved in this coin's slot, or null (none, or a server that does not send them). */
  readonly waiting: { readonly parts: number; readonly text: string } | null;
}

/** P14 (bug 4, 23): the coin card's saved Parts line, from the server's parts_waiting only (never guessed). */
export function partsWaitingLine(value: unknown): { parts: number; text: string } | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 1) return null;
  const parts = Math.floor(n);
  return { parts, text: `${partsWord(parts)} saved. Win it to grow it.` };
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
    waiting: partsWaitingLine(input.partsWaiting),
  };
}

/** The coin card's picture strip, read aloud: this coin's own price, never a fixed one (integration rule break 2). */
export function howStripLabel(price: unknown): string {
  const n = servedTicketPrice(price);
  const cost = n == null ? 'Tickets buy' : n === 1 ? 'One Ticket buys' : `${n} Tickets buy`;
  return `${cost} one game, win or lose. Win the game to win this coin.`;
}
