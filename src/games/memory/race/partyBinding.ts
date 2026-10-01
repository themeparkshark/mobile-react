/**
 * partyBinding.ts: what Memory Race needs from a live Line Party round.
 * LineParty builds it from its PartyClient; MemoryGame never talks to the
 * network itself.
 */
import type { Racer } from './RivalStrip';

export interface MemoryPartyBinding {
  /** Round seed (every seat plays the same board). */
  seed: number;
  /** Board ms since this phone's GO (negative during the count-in), null before the round. */
  boardTime(): number | null;
  /** Record a flip (slot) or a quick dismiss (-1) in the tap log. Returns board ms, null outside play. */
  recordFlip(slot: number): number | null;
  /** 4 Hz display whisper. */
  reportProgress(score: number, chain: number): void;
  /** Live rival strip (whispers and crew seats, rendered 250ms behind). */
  racers(): Racer[];
  /** This board is finished (cleared or out of time); the server finalizes the round. */
  onBoardDone(): void;
}
