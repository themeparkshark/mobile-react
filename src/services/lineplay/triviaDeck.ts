/**
 * The server's ride-keyed trivia deck, cached per park and ride for offline
 * queue play. A session primes it once at start; fetchRideTrivia then reads it
 * synchronously and puts server ride and park questions ahead of the bundled
 * pool. Any failure leaves the bundled deck in charge: nothing here throws.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import getLinePlayTrivia, { type ServerTriviaDeck, type ServerTriviaQuestion } from '../../api/endpoints/lineplay/trivia';
import type { TriviaQuestion } from './content';

const PREFIX = 'lineplay_trivia_deck_v1_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const decks = new Map<string, readonly TriviaQuestion[]>();

const keyFor = (parkId: number, rideId?: number) => `${parkId}_${rideId ?? 0}`;

/** Server rows become app questions; malformed rows (or glyph-bearing copy) are dropped. */
export function toTriviaQuestions(deck: Pick<ServerTriviaDeck, 'questions'>): TriviaQuestion[] {
  const seen = new Set<string>();
  const out: TriviaQuestion[] = [];
  for (const row of deck.questions ?? []) {
    if (!row || typeof row.id !== 'string' || seen.has(row.id) || typeof row.question !== 'string' ||
        !Array.isArray(row.choices) || row.choices.length !== 4 ||
        !row.choices.every((choice: unknown) => typeof choice === 'string' && choice.trim().length > 0) ||
        !Number.isInteger(row.correct_index) || row.correct_index < 0 || row.correct_index > 3 ||
        !['easy', 'medium', 'hard'].includes(row.difficulty)) continue;
    seen.add(row.id);
    out.push({
      id: row.id,
      rideId: row.ride_id ?? undefined,
      parkId: row.park_id ?? undefined,
      question: row.question,
      choices: [...row.choices],
      correctIndex: row.correct_index,
      difficulty: row.difficulty,
      fact: row.fact ?? undefined,
      source: row.source || undefined,
      deck: typeof row.deck === 'string' ? row.deck : undefined,
    });
  }
  return out;
}

/** Cached server questions for this ride and park, ride questions first. */
export function cachedServerTrivia(parkId: number | undefined, rideId: number | undefined): readonly TriviaQuestion[] {
  if (parkId == null) return [];
  return decks.get(keyFor(parkId, rideId)) ?? decks.get(keyFor(parkId)) ?? [];
}

/** Load the deck from storage, then refresh it from the server when online. */
export async function primeTriviaDeck(parkId: number | undefined, rideId?: number,
  fetchDeck: (parkId: number, rideId?: number) => Promise<ServerTriviaDeck> = getLinePlayTrivia): Promise<void> {
  if (parkId == null || !Number.isInteger(parkId) || parkId <= 0) return;
  const key = keyFor(parkId, rideId);
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw && !decks.has(key)) {
      const saved = JSON.parse(raw) as { savedAt: number; questions: ServerTriviaQuestion[] };
      if (Number.isFinite(saved.savedAt) && Date.now() - saved.savedAt <= MAX_AGE_MS) {
        decks.set(key, toTriviaQuestions(saved));
      }
    }
  } catch {
    // Offline play falls back to the bundled deck.
  }
  try {
    const deck = await fetchDeck(parkId, rideId);
    const questions = toTriviaQuestions(deck);
    decks.set(key, questions);
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), questions: deck.questions }))
      .catch(() => undefined);
  } catch {
    // Keep whatever deck we already have.
  }
}

/** Test hook: forget every cached deck. */
export function resetTriviaDecks(): void {
  decks.clear();
}
