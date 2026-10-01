const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

// L4 content engine: a player never sees a trivia card again within their
// last 150, the local park deck leads, and the network deck keeps it fresh.
function load(values = new Map()) {
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
  const asyncStorage = { '@react-native-async-storage/async-storage': { __esModule: true, default: storage } };
  const rideTheme = loadTs('src/services/rideTheme.ts');
  const chapters = loadTs('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme });
  const deck = loadTs('src/services/lineplay/triviaDeck.ts', {
    ...asyncStorage,
    '../../api/endpoints/lineplay/trivia': { __esModule: true, default: async () => { throw new Error('offline'); } },
  });
  const history = loadTs('src/services/lineplay/triviaHistory.ts', asyncStorage);
  const content = loadTs('src/services/lineplay/content.ts', { './chapters': chapters, './triviaDeck': deck, './triviaHistory': history });
  return { values, deck, history, content };
}

const row = (id, extra = {}) => ({ id, park_id: 2, ride_id: null, question: `Question ${id}?`,
  choices: ['A', 'B', 'C', 'D'], correct_index: 0, difficulty: 'medium', deck: 'classic', fact: null, source: 'Disney Parks Blog', ...extra });

function serverDeck({ ride = 4, park = 20, siblings = 20, network = 160 } = {}) {
  return { questions: [
    ...Array.from({ length: ride }, (_, i) => row(`ride-${i}`, { ride_id: 322 })),
    ...Array.from({ length: park }, (_, i) => row(`park-${i}`)),
    ...Array.from({ length: siblings }, (_, i) => row(`sib-${i}`, { ride_id: 335 })),
    ...Array.from({ length: network }, (_, i) => row(`net-${i}`, { park_id: 10, ride_id: i % 2 ? 781 : null })),
  ] };
}

async function round(content, seed, count = 5, options) {
  const ids = [];
  for (let i = 0; i < count; i++) ids.push((await content.fetchRideTrivia(322, 2, seed + i, undefined, options)).id);
  return ids;
}

test('no card repeats within the last 150 dealt, across many rounds with random seeds', async () => {
  const { deck, history, content } = load();
  await deck.primeTriviaDeck(2, 322, async () => serverDeck());
  await history.primeTriviaHistory(7);
  const dealt = [];
  for (let r = 0; r < 40; r++) dealt.push(...await round(content, 1000 + r * 7919, 5));
  for (let i = 0; i < dealt.length; i++) {
    const window = dealt.slice(Math.max(0, i - 149), i);
    assert.equal(window.includes(dealt[i]), false, `card ${dealt[i]} repeated within 150 at deal ${i}`);
  }
  assert.equal(history.TRIVIA_NO_REPEAT_WINDOW, 150);
});

test('the local park deck is dealt before any other park', async () => {
  const { deck, content } = load();
  await deck.primeTriviaDeck(2, 322, async () => serverDeck());
  const first = [];
  for (let r = 0; r < 9; r++) first.push(...await round(content, 31 * r + 5, 5));
  const local = first.slice(0, 44);
  assert.equal(local.every(id => !id.startsWith('net-')), true, 'all 44 local cards come first');
  assert.equal(new Set(local).size, 44);
  assert.ok(first.slice(44).every(id => id.startsWith('net-')), 'then the network deck');
});

test('a slot keeps its card on re-render; a new slot gets a fresh card', async () => {
  const { deck, content } = load();
  await deck.primeTriviaDeck(2, 322, async () => serverDeck());
  const a = await content.fetchRideTrivia(322, 2, 42);
  const again = await content.fetchRideTrivia(322, 2, 42);
  const next = await content.fetchRideTrivia(322, 2, 43);
  assert.equal(again.id, a.id);
  assert.notEqual(next.id, a.id);
});

test('history survives an app restart and stays per player', async () => {
  const first = load();
  await first.deck.primeTriviaDeck(2, 322, async () => serverDeck({ ride: 0, park: 6, siblings: 0, network: 0 }));
  await first.history.primeTriviaHistory(7);
  const seen = await round(first.content, 0, 4);
  await new Promise(resolve => setImmediate(resolve));

  const reopened = load(first.values);
  await reopened.deck.primeTriviaDeck(2, 322, async () => serverDeck({ ride: 0, park: 6, siblings: 0, network: 0 }));
  await reopened.history.primeTriviaHistory(7);
  const after = await round(reopened.content, 0, 2);
  assert.equal(after.some(id => seen.includes(id)), false, 'a restart does not reset the window');

  const sibling = load(first.values);
  await sibling.deck.primeTriviaDeck(2, 322, async () => serverDeck({ ride: 0, park: 6, siblings: 0, network: 0 }));
  await sibling.history.primeTriviaHistory(8);
  assert.equal((await sibling.content.fetchRideTrivia(322, 2, 0)).id, 'park-0', 'another player starts fresh');
});

test('when every card has been seen, the one seen longest ago comes back first', async () => {
  const { deck, content } = load();
  await deck.primeTriviaDeck(2, 322, async () => serverDeck({ ride: 0, park: 3, siblings: 0, network: 0 }));
  // 3 sourced cards plus the general filler pool; deal everything once.
  const dealt = [];
  for (let seed = 0; seed < 200; seed++) dealt.push((await content.fetchRideTrivia(322, 2, seed)).id);
  const pool = new Set(dealt).size;
  for (let i = pool; i < dealt.length; i++) {
    assert.equal(dealt[i], dealt[i - pool], 'least recently seen card returns, in order');
  }
});

test('family mode deals the kids deck and easy cards first', async () => {
  const { deck, content } = load();
  await deck.primeTriviaDeck(2, 322, async () => ({ questions: [
    row('hard-1', { difficulty: 'hard', deck: 'deep-cut' }), row('mid-1'),
    row('kid-1', { deck: 'kids', difficulty: 'easy' }), row('easy-1', { difficulty: 'easy', deck: 'classic' }),
    ...Array.from({ length: 30 }, (_, i) => row(`mid-x${i}`)),
  ] }));
  const ids = await round(content, 9, 2, { kids: true });
  assert.deepEqual([...ids].sort(), ['easy-1', 'kid-1']);
  const later = await round(content, 50, 31, { kids: true });
  assert.equal(later.includes('hard-1'), false, 'hard cards wait until everything else is seen');
});

test('server rows keep their deck tag', () => {
  const { deck } = load();
  const [question] = deck.toTriviaQuestions({ questions: [row('tagged', { deck: 'deep-cut' })] });
  assert.equal(question.deck, 'deep-cut');
});
