/**
 * Memory Match+ — public surface for the game.
 *
 * Consumers (MiniGameSelector / LinePlay playlist) import the default game
 * component from here. Everything else is internal.
 */

export { default as MemoryGame } from './MemoryGame';
export type { MemoryGameProps } from './MemoryGame';
