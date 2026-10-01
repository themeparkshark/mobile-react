/**
 * Memory Match: public surface for the game.
 *
 * Consumers (MiniGameSelector, LinePlay playlist) import `MemoryGame` from
 * here. It keeps the original props; queue callers may add `menu` to open the
 * barker's booth menu (Time Attack, Daily Deck, Pass & Play) first.
 */

export { default as MemoryGame } from './MemoryMenu';
export type { MemoryMatchProps as MemoryGameProps } from './MemoryMenu';
