/**
 * Registers the Fin-ister Nights content-pack trivia (content/trivia.json,
 * parody lore and Halloween fun facts, kid-safe) as the haunt-line deck.
 * Imported once by LinePlayScreen for its side effect.
 */
import type { TriviaQuestion } from '../lineplay/content';
import { registerFrightChapterDeck } from '../lineplay/chapters';
import TRIVIA from './content/trivia.json';

type Raw = { slug: string; question: string; choices: string[]; correct_index: number; difficulty: string; fact?: string;
  source_label?: string; deck?: string };

export function frightTriviaDeck(raw: readonly Raw[]): TriviaQuestion[] {
  return raw.filter(q => q && q.slug && Array.isArray(q.choices) && q.choices.length >= 2
    && q.correct_index >= 0 && q.correct_index < q.choices.length).map(q => ({
    id: `fright-${q.slug}`, question: q.question, choices: q.choices, correctIndex: q.correct_index,
    difficulty: q.difficulty === 'hard' || q.difficulty === 'medium' ? q.difficulty : 'easy',
    fact: q.fact, source: q.source_label ?? 'Fin-ister Nights lore', deck: 'fright',
  }));
}

registerFrightChapterDeck({ trivia: frightTriviaDeck(TRIVIA as Raw[]) });
