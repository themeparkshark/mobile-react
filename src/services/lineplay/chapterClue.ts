import type { ActivityItem } from './LinePlaySession';
import type { LinePlayChapter } from './chapters';

export interface ChapterClue {
  readonly noteTitle: string;
  readonly choiceLabel: string;
  readonly noteIndex: number;
  readonly choiceIndex: number;
}

/** The featured field note is a saved, non-rewarding crew choice. */
export function resolveChapterClue(chapter: LinePlayChapter, noteSeed: number, choiceIndex: number): ChapterClue | null {
  if (!Number.isInteger(noteSeed) || !Number.isInteger(choiceIndex) || chapter.fieldNotes.length === 0) return null;
  const noteIndex = ((noteSeed % chapter.fieldNotes.length) + chapter.fieldNotes.length) % chapter.fieldNotes.length;
  const note = chapter.fieldNotes[noteIndex];
  const choiceLabel = note.challenge?.options[choiceIndex]?.label;
  return choiceLabel ? { noteTitle: note.title, choiceLabel, noteIndex, choiceIndex } : null;
}

/** A completed clue changes the finale's stable seed and tells the crew what changed. */
export function personalizeChapterFinale(item: ActivityItem, chapter: LinePlayChapter, clue: ChapterClue | null): ActivityItem {
  if (!clue || item.kind !== 'minigame' || item.id !== `${chapter.id}-${chapter.finale.idSuffix}`) return item;
  return {
    ...item,
    seed: (item.seed + (clue.noteIndex + 1) * 97 + (clue.choiceIndex + 1) * 131) >>> 0,
    preview: `Your ${clue.noteTitle} choice (${clue.choiceLabel}) changes this round’s route. ${item.preview ?? chapter.finale.preview}`,
  };
}
