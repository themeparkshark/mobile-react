const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

function load() {
  const values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
  const rideTheme = loadTs('src/services/rideTheme.ts');
  const chapters = loadTs('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme });
  const deck = loadTs('src/services/lineplay/triviaDeck.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    '../../api/endpoints/lineplay/trivia': { __esModule: true, default: async () => { throw new Error('offline'); } },
  });
  const content = loadTs('src/services/lineplay/content.ts', { './chapters': chapters, './triviaDeck': deck, './triviaHistory': { recentTriviaIds: () => new Map(), markTriviaSeen() {}, dealtTriviaId() {} } });
  return { values, deck, content, chapters };
}

const row = (id, extra = {}) => ({ id, park_id: 8, ride_id: null, question: `Question ${id}?`,
  choices: ['A', 'B', 'C', 'D'], correct_index: 0, difficulty: 'easy', fact: null, source: 'Disney Parks Blog', ...extra });

test('server rows are validated: malformed rows never reach players', () => {
  const { deck } = load();
  const kept = deck.toTriviaQuestions({ questions: [row('ok'), row('ok'), row('three', { choices: ['A', 'B', 'C'] }),
    row('bad-index', { correct_index: 4 }), row('blank', { choices: ['A', '', 'C', 'D'] }), row('odd', { difficulty: 'wild' })] });
  assert.deepEqual(plain(kept.map(question => question.id)), ['ok']);
});

test('server ride and park questions lead the queue deck; offline keeps the cached copy', async () => {
  const { deck, content, values } = load();
  const serverDeck = { park_id: 8, ride_id: 12, version: 'v1', questions: [
    row('srv-ride', { ride_id: 12, park_id: null }), row('srv-park'), row('gen-41') ] };
  await deck.primeTriviaDeck(8, 12, async () => serverDeck);
  const ids = [];
  for (let seed = 0; seed < 6; seed++) ids.push((await content.fetchRideTrivia(12, 8, seed)).id);
  assert.deepEqual(ids.slice(0, 3), ['srv-ride', 'srv-park', 'gen-41']);
  assert.equal(new Set(ids).size, ids.length, 'a bundled copy of a server question is not dealt twice');
  // A fresh app launch offline reads the stored deck.
  const reloaded = load();
  for (const [key, value] of values) await reloaded.values.set(key, value);
  await reloaded.deck.primeTriviaDeck(8, 12);
  assert.equal((await reloaded.content.fetchRideTrivia(12, 8, 0)).id, 'srv-ride');
});

test('a park with a full sourced deck retires the general filler; chapter questions are not repeated', async () => {
  const { deck, content, chapters } = load();
  const many = Array.from({ length: 30 }, (_, index) => row(`srv-${index}`));
  const chapter = chapters.getLinePlayChapter(8, 'haunted-mansion-8', 'Haunted Mansion');
  await deck.primeTriviaDeck(8, 12, async () => ({ questions: [...many, row('dl-hm-1', { ride_id: 12, park_id: null })] }));
  const seen = [];
  for (let seed = chapter.trivia.length; seed < chapter.trivia.length + 60; seed++)
    seen.push((await content.fetchRideTrivia(12, 8, seed, chapter.id)).id);
  assert.equal(seen.some(id => /^gen-([1-9]|[12]\d|3[0-6])$/.test(id)), false, 'no general filler once 30 sourced questions exist');
  assert.equal(seen.includes('dl-hm-1'), false, 'chapter questions are not dealt again from the server deck');
});
