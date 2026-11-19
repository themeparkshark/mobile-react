// Fix pass w4, lane line-story: line stories name the ride, its land and a true fact (T077), and the
// story's clues are picture puzzles a seven-year-old solves with zero reading (T075).
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, {
    module: moduleRef, exports: moduleRef.exports, Date, JSON, Math, Promise,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return moduleRef.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const rideTheme = load('src/services/rideTheme.ts');
const rideLands = load('src/services/lineplay/rideLands.ts');
const chapters = load('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme, './rideLands': rideLands });
const puzzle = load('src/services/lineplay/picturePuzzle.ts');

const AUTOPIA_FACT = "Autopia has run since opening day in 1955, when freeways were America's hot new transportation idea.";

test('T077: Autopia tells a Tomorrowland story that names the ride, never the parade plan', () => {
  for (let episode = 0; episode < 6; episode += 1) {
    const chapter = chapters.getLinePlayChapter(8, 'autopia-8', 'Autopia', episode, 571);
    assert.equal(chapter.adaptive, true);
    assert.equal(chapter.parkLabel, 'TOMORROWLAND');
    assert.equal(chapter.ride.rideId, 571);
    assert.equal(chapter.ride.land, 'Tomorrowland');
    assert.equal(chapter.storyTheme, 'space');
    assert.equal(chapter.puzzleDeckId, 'space');
    assert.match(chapter.story, /^Autopia, in Tomorrowland\./);
    assert.doesNotMatch(chapter.story + chapter.missionNames.join(' '), /parade plan|Decode a clue|Notice a signal/i);
    assert.notEqual(chapter.missionNames[0], 'Decode a clue');
    assert.equal(chapter.missionNames[1], 'Spot the twin pictures');
  }
});

test('T077: the story tells this ride’s own checked fact, and a ride with no fact gets its land’s true line', () => {
  const chapter = chapters.getLinePlayChapter(8, 'autopia-8', 'Autopia', 0, 571);
  const withFact = chapters.chapterStoryText(chapter, [AUTOPIA_FACT]);
  assert.match(withFact, /Autopia, in Tomorrowland\./);
  assert.ok(withFact.endsWith(`Fan fact: ${AUTOPIA_FACT}`));
  const noFact = chapters.chapterStoryText(chapter, []);
  assert.match(noFact, /Tomorrowland is the land of rockets/);
  assert.doesNotMatch(noFact, /Fan fact/);
  // Finished: the completed line, never the opening one.
  assert.equal(chapters.chapterStoryText(chapter, [AUTOPIA_FACT], true), chapter.completedStory);
  // Authored chapters keep their own story untouched.
  const pirates = chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean');
  assert.equal(chapters.chapterStoryText(pirates, [AUTOPIA_FACT]), pirates.story);
  // A Main Street ride with no fact: on the street, its true street line, no fan fact, no other ride's name.
  const vehicles = chapters.getLinePlayChapter(8, 'main-street-vehicles-8', 'Main Street Vehicles', 0, 597);
  const street = chapters.chapterStoryText(vehicles, []);
  assert.match(street, /^Main Street Vehicles, on Main Street, U\.S\.A\./);
  assert.match(street, /small American town from around 1900/);
  assert.doesNotMatch(street, /Fan fact|Autopia/);
});

test('T077: returning players meet a new fact each story, and only facts passed for this ride ever show', () => {
  const facts = ['Fact one is short.', 'Fact two is short.', 'Fact three is short.'];
  const seen = new Set();
  for (let episode = 0; episode < 3; episode += 1) {
    seen.add(chapters.chapterFact(chapters.getLinePlayChapter(8, 'autopia-8', 'Autopia', episode, 571), facts));
  }
  assert.equal(seen.size, 3);
  assert.equal(chapters.chapterFact({ id: 'queue-8-autopia-8' }, []), null);
  // Clue 2 tells the next fact, so the two puzzles never repeat one.
  assert.notEqual(chapters.chapterFact({ id: 'queue-8-autopia-8-episode-0' }, facts, 1), chapters.chapterFact({ id: 'queue-8-autopia-8-episode-0' }, facts));
  // Long rows step aside while a short one exists.
  assert.equal(chapters.chapterFact({ id: 'queue-8-x-episode-1' }, ['x'.repeat(240), 'Short and true.']), 'Short and true.');
});

test('T077: lands are per park (Haunted Mansion is Liberty Square at Magic Kingdom) and themes follow them', () => {
  assert.equal(rideLands.rideLand(2, 'Haunted Mansion'), 'Liberty Square');
  assert.equal(rideLands.rideLand(8, 'Haunted Mansion'), 'New Orleans Square');
  assert.equal(rideLands.rideLand(8, 'Walt Disney’s Enchanted Tiki Room'), 'Adventureland');
  assert.equal(rideLands.rideLand(8, 'Star Wars: Rise of the Resistance'), "Galaxy's Edge");
  assert.equal(rideLands.rideLand(2, 'TRON Lightcycle / Run'), 'Tomorrowland');
  assert.equal(rideLands.rideLand(2, 'Tiana\'s Bayou Adventure'), 'Frontierland');
  assert.equal(rideLands.rideLand(8, 'Tiana\'s Bayou Adventure'), 'Bayou Country');
  assert.equal(rideLands.rideLand(1, 'Jurassic World The Ride'), null);
  // A Disneyland ride with no checked fact still names its land (Main Street Vehicles, Toontown play spots).
  assert.equal(rideLands.rideLand(8, 'Main Street Vehicles'), 'Main Street, U.S.A.');
  assert.equal(rideLands.rideLand(8, "Goofy's How-to-Play Yard"), "Mickey's Toontown");
  assert.equal(rideLands.rideLand(2, 'Walt Disney World Railroad - Fantasyland'), 'Fantasyland');
  const mine = chapters.getLinePlayChapter(2, 'seven-dwarfs-mine-train-2', 'Seven Dwarfs Mine Train', 1, 292);
  assert.equal(mine.parkLabel, 'FANTASYLAND');
  const thunder = chapters.getLinePlayChapter(2, 'big-thunder-mountain-railroad-2', 'Big Thunder Mountain Railroad', 2, 295);
  assert.equal(thunder.parkLabel, 'FRONTIERLAND');
  assert.equal(thunder.storyTheme, 'frontier');
  assert.equal(thunder.puzzleDeckId, 'rainbow-ridge');
  assert.doesNotMatch(thunder.story, /parade|balloon|music box/i);
  const tron = chapters.getLinePlayChapter(2, 'tron-lightcycle-run-2', 'TRON Lightcycle / Run', 0, 332);
  assert.equal(tron.parkLabel, 'TOMORROWLAND');
  // No authored land: the story names the park, never a guessed land.
  const jurassic = chapters.getLinePlayChapter(1, 'jurassic-world-1', 'Jurassic World The Ride', 0, 9001);
  assert.equal(jurassic.parkLabel, 'UNIVERSAL STUDIOS HOLLYWOOD');
  assert.match(jurassic.story, /^Jurassic World The Ride, at Universal Studios Hollywood\./);
  assert.equal(chapters.chapterStoryText(jurassic, []), jurassic.story);
  // Every land with a story deck has a true line.
  for (const land of ['Adventureland', 'New Orleans Square', 'Frontierland', 'Fantasyland', 'Tomorrowland', 'Bayou Country',
    "Mickey's Toontown", "Galaxy's Edge", 'Main Street, U.S.A.', 'Liberty Square']) assert.ok(rideLands.landLine(land), land);
});

test('T077: the next-story teaser reads the chapter’s own story set and the found count covers every set', () => {
  const chapter = chapters.getLinePlayChapter(8, 'autopia-8', 'Autopia', 0, 571);
  assert.equal(chapters.nextAdaptiveStoryTitle(chapter, 'Autopia'), 'The Silent Space Beacon');
  assert.equal(chapters.ADAPTIVE_STORY_TOTAL, 48);
});

test('T075: the picture row is a real pattern with one right picture among three', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    for (const round of [0, 1]) {
      const r = puzzle.patternRound(seed, round, 10);
      assert.equal(r.row.length, 5);
      assert.equal(r.choices.length, 3);
      assert.equal(new Set(r.choices).size, 3);
      assert.ok(r.choices.includes(r.answer));
      // One wrong choice comes from the row itself, so a pattern-blind tap is wrong.
      assert.ok(r.choices.some(choice => choice !== r.answer && r.row.includes(choice)));
      assert.ok(puzzle.patternTapRight(r, r.answer));
      assert.deepEqual(puzzle.patternRound(seed, round, 10), r);
    }
  }
  // Round 1 is a two-picture beat.
  const easy = puzzle.patternRound(3, 0, 10);
  assert.ok(new Set(easy.row).size === 2);
});

test('T075: the twin hunt shows six different pictures with the target exactly once', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    for (let round = 0; round < puzzle.TWIN_ROUNDS; round += 1) {
      const r = puzzle.twinRound(seed, round, 10);
      assert.equal(r.grid.length, 6);
      assert.equal(new Set(r.grid).size, 6);
      assert.equal(r.grid.filter(symbol => symbol === r.target).length, 1);
      assert.ok(puzzle.twinTapRight(r, r.target));
      if (round > 0) assert.notEqual(r.target, puzzle.twinRound(seed, round - 1, 10).target, `seed ${seed} round ${round} repeats`);
    }
  }
  assert.equal(puzzle.puzzleRounds('pattern') + puzzle.puzzleRounds('twin'), 5);
});

test('T075: story clues 1 and 2 are picture puzzles at adaptive rides, and at authored rides with Picture games on', () => {
  const autopia = chapters.getLinePlayChapter(8, 'autopia-8', 'Autopia', 0, 571);
  assert.deepEqual(plain(puzzle.storyPuzzleFor(autopia, { kind: 'trivia', id: `${autopia.id}-trivia` }, false)), { kind: 'pattern', deckId: 'space' });
  assert.deepEqual(plain(puzzle.storyPuzzleFor(autopia, { kind: 'lore', id: `${autopia.id}-field-note` }, false)), { kind: 'twin', deckId: 'space' });
  // Free-play rounds stay what they are.
  assert.equal(puzzle.storyPuzzleFor(autopia, { kind: 'trivia', id: 'tr-3' }, true), null);
  const pirates = chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean');
  assert.equal(puzzle.storyPuzzleFor(pirates, { kind: 'trivia', id: `${pirates.id}-trivia` }, false), null);
  assert.deepEqual(plain(puzzle.storyPuzzleFor(pirates, { kind: 'trivia', id: `${pirates.id}-trivia` }, true)), { kind: 'pattern', deckId: 'pirates' });
  // Space Mountain's board is already a picture game.
  const space = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  assert.equal(puzzle.storyPuzzleFor(space, { kind: 'trivia', id: `${space.id}-trivia` }, true), null);
  assert.notEqual(puzzle.puzzleSeed('queue-8-autopia-8', 1), puzzle.puzzleSeed('queue-8-matterhorn-8', 1));
});

test('T075: FAN FACT only labels a real checked fact, never a story riddle’s explanation', () => {
  assert.equal(puzzle.triviaFactKicker({ correctIndex: 0 }, 0), 'CORRECT · HOW IT WORKS');
  assert.equal(puzzle.triviaFactKicker({ correctIndex: 0 }, 1), 'HOW IT WORKS');
  assert.equal(puzzle.triviaFactKicker({ correctIndex: 0, bank: true }, 0), 'CORRECT · FAN FACT');
  assert.equal(puzzle.triviaFactKicker({ correctIndex: 0, source: 'Disneyland Resort' }, 2), 'FAN FACT');
  assert.equal(puzzle.triviaFactKicker({ correctIndex: 0, bank: true }, null), 'THE ANSWER');
});

test('T075: free-play trivia at an adaptive ride never deals the story riddles; puzzle pages draw no clock', () => {
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /chapterId=\{chapter\?\.adaptive && item\.id !== `\$\{chapterId\}-trivia` \? undefined : chapterId\}/);
  assert.match(slot, /triviaFactKicker\(q, picked\)/);
  const card = read('src/screens/LinePlay/components/PicturePuzzleCard.tsx').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.doesNotMatch(card, /timer|countdown|seconds|Switch|Alert|ActivityIndicator/);
  assert.match(card, /useUiReducedMotion/);
  assert.match(card, /FAN FACT/);
});

test('T077: cachedRideFacts reads only rows keyed to this ride', async () => {
  const store = new Map();
  const triviaDeck = load('src/services/lineplay/triviaDeck.ts', {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async key => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } } },
    '../../api/endpoints/lineplay/trivia': { default: async () => ({}) },
  });
  const row = (id, rideId, fact) => ({ id, park_id: rideId ? null : 8, ride_id: rideId, question: 'Q?', choices: ['a', 'b', 'c', 'd'],
    correct_index: 0, difficulty: 'easy', fact, source: 'Disneyland Resort' });
  await triviaDeck.primeTriviaDeck(8, 571, async () => ({ park_id: 8, ride_id: 571, version: '1', questions: [
    { ...row('n', 571, 'Guests 54 inches or taller may drive alone.'), deck: 'numbers' },
    row('a', 571, AUTOPIA_FACT), row('b', null, 'A park fact.'), row('c', 584, 'A Matterhorn fact.'), row('d', 571, null)] }));
  assert.deepEqual([...triviaDeck.cachedRideFacts(8, 571)], [AUTOPIA_FACT, 'Guests 54 inches or taller may drive alone.']);
  assert.deepEqual([...triviaDeck.cachedRideFacts(8, 584)], []);
  assert.deepEqual([...triviaDeck.cachedRideFacts(8, undefined)], []);
});

test('T075: a new puzzle round starts clean in the same update that deals it (no locked first tap)', () => {
  const card = read('src/screens/LinePlay/components/PicturePuzzleCard.tsx');
  assert.match(card, /const nextRound = \(value: number\) => \{ setWrong\(\[\]\); setRight\(null\); setRound\(value\); \};/);
  assert.doesNotMatch(card, /useEffect\(\(\) => \{ setWrong\(\[\]\); setRight\(null\); \}/);
});
