/**
 * How to Play swipe cards: five big cards, one short sentence each, written
 * so a kid can read them. Pure data (the screen maps `art` to images).
 * Deeper detail lives behind "More" (HELP_TOPICS and the glossary).
 */
import type { HelpTopicId } from './glossary';

export type HowToArtKey = 'find' | 'catch' | 'book' | 'park' | 'line';

export interface HowToCard {
  readonly id: HowToArtKey;
  readonly title: string;
  /** One short sentence, 7 words at most. Read aloud by vo-<id>.mp3. */
  readonly line: string;
  readonly art: HowToArtKey;
  /** Card face colors, top to bottom. */
  readonly colors: readonly [string, string];
  /** The "More" card this one opens to. */
  readonly topic: HelpTopicId;
}

export const HOW_TO_CARDS: readonly HowToCard[] = [
  { id: 'find', art: 'find', title: 'Find snacks', topic: 'home',
    line: 'Snacks pop up near you.', colors: ['#2fa9f5', '#0768b9'] },
  { id: 'catch', art: 'catch', title: 'Catch them', topic: 'home',
    line: 'Walk close, then catch it!', colors: ['#ffb43b', '#f07f1a'] },
  { id: 'book', art: 'book', title: 'Fill your book', topic: 'collections',
    line: 'Every catch fills your book.', colors: ['#3cc77a', '#14915a'] },
  { id: 'park', art: 'park', title: 'Park day!', topic: 'park',
    line: 'Beat ride games at the park.', colors: ['#ff6f61', '#d93a52'] },
  { id: 'line', art: 'line', title: 'Line time pays', topic: 'lineplay',
    line: 'Waiting in line fills a prize!', colors: ['#5a7cf0', '#2f4cc4'] },
];

/** Most words a card line may use (kids read 5 to 7 words at a glance). */
export const MAX_LINE_WORDS = 7;

export const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/** The page a horizontal offset lands on, clamped to the deck. */
export function pageForOffset(offsetX: number, pageWidth: number, count = HOW_TO_CARDS.length): number {
  if (!(pageWidth > 0) || !Number.isFinite(offsetX) || count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(offsetX / pageWidth)));
}
