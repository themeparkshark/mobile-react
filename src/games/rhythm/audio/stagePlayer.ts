/**
 * The right player for a stage format: rev 7 stems (ParadeAudio, locked decks)
 * when the stage has them, else the rev 6 song + Fever mix (SongPlayer).
 */

import type { RoundFormat } from '../core/types';
import type { StageEntry } from '../stages';
import { ParadeAudio } from './ParadeAudio';
import { SongPlayer } from './SongPlayer';

export type StagePlayer = ParadeAudio | SongPlayer;

export function stagePlayer(entry: StageEntry, format: RoundFormat): StagePlayer | null {
  const stems = entry.stems?.[format] ?? entry.stems?.queue;
  if (stems) return new ParadeAudio(stems);
  const audio = entry.audio[format] ?? entry.audio.queue;
  return audio ? new SongPlayer(audio.song, audio.fever) : null;
}

export function hasFormat(entry: StageEntry, format: RoundFormat): boolean {
  return !!(entry.stems?.[format] ?? entry.audio[format]);
}
