const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, {
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) { return dependencies[name] ?? {}; },
  }, { filename: file });
  return moduleRef.exports;
}

const rideTheme = load('src/services/rideTheme.ts');
const chapters = load('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme });
const session = load('src/services/lineplay/LinePlaySession.ts', {
  './content': { buildPredictionCard: wait => ({ id: `pred-${wait}`, postedWaitMinutes: wait }) },
  '../../games/trivia/config': { LINEPLAY_ROUND_QUESTIONS: 5 },
});
const clue = load('src/services/lineplay/chapterClue.ts');
const content = load('src/services/lineplay/content.ts', { './chapters': chapters,
  './triviaDeck': { cachedServerTrivia: () => [] } });
const triviaSources = load('src/games/trivia/sources.ts', {
  '../../services/lineplay/content': content,
  './config': { DEFAULT_QUESTION_SECONDS: 15, LIFELINE_ENABLED: false, LINEPLAY_ROUND_QUESTIONS: 5 },
});

test('a long authored queue gives one-card clues and Trivia+ a shared nonrepeating deck', async () => {
  for (const [parkId, chapter] of [
    [2, chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain')],
    [8, chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean')],
    [8, chapters.getLinePlayChapter(8, 'jungle-cruise-8', 'Jungle Cruise')],
    [8, chapters.getLinePlayChapter(8, 'space-mountain-8', 'Space Mountain')],
    [2, chapters.getLinePlayChapter(2, 'haunted-mansion-2', 'Haunted Mansion')],
  ]) {
    assert.ok(chapter);
    const playlist = session.generatePlaylist(45, 45, chapter);
    assert.equal(playlist.filter(item => item.kind === 'crew_grid').length, 1);
    const trivia = playlist.filter(item => item.kind === 'trivia');
    const lore = playlist.filter(item => item.kind === 'lore');
    const questionSeeds = playlist.flatMap(item => item.kind === 'trivia' ? [item.seed]
      : item.kind === 'minigame' && item.gameId === 'trivia'
        ? Array.from({ length: 5 }, (_, index) => item.seed + index) : []);
    const questionIds = await Promise.all(questionSeeds.map(seed =>
      content.fetchRideTrivia(undefined, parkId, seed, chapter.id).then(question => question.id)));
    assert.ok(questionIds.length >= 3);
    assert.equal(new Set(questionIds).size, questionIds.length);
    // One authored Field Note per chapter; generic lore no longer fills pages.
    assert.equal(lore.length, 1);
    assert.equal(lore[0].id, `${chapter.id}-field-note`);
    assert.equal(trivia[0].seed, 0);
    assert.equal(lore[0].seed, 0);
    assert.equal(playlist.filter(item => item.kind === 'prediction').length, 1);
    assert.equal(playlist.some(item => item.kind === 'minigame' && item.gameId === 'current'), true);
    assert.equal(playlist.some(item => item.kind === 'circuit'), true);
    // Retired from the queue: Shark Showdown merges into Trivia, Rhythm Tap is pulled.
    assert.equal(playlist.some(item => item.kind === 'minigame' &&
      (item.gameId === 'showdown' || item.gameId === 'timing')), false);
    // Crew Prompts is the optional last card, never an early page.
    assert.equal(playlist[playlist.length - 1].kind, 'crew_grid');
  }
});

test('a shorter queue does not repeat its opening chapter question', async () => {
  const chapter = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  const playlist = session.generatePlaylist(15, 15, chapter);
  const questions = await Promise.all(playlist.filter(item => item.kind === 'trivia')
    .map(item => content.fetchRideTrivia(undefined, 2, item.seed, chapter.id).then(question => question.id)));
  assert.equal(questions.length > 1, true);
  assert.equal(new Set(questions).size, questions.length);
});

test('a large session seed opens with ride-story clues, then new questions', async () => {
  const chapter = chapters.getLinePlayChapter(99, 'star-tours', 'Star Tours', 1);
  const playlist = session.generatePlaylist(25, 25, chapter, true, 0x7fffffff);
  const cards = playlist.filter(item => item.kind === 'trivia');
  assert.ok(cards.length >= 2);
  assert.ok(cards[0].seed >= 0 && cards[0].seed < chapter.trivia.length);
  assert.ok(cards[1].seed > cards[0].seed);
  const first = await content.fetchRideTrivia(999, 99, cards[0].seed, chapter.id);
  const next = await content.fetchRideTrivia(999, 99, cards[1].seed, chapter.id);
  assert.ok(first.id.startsWith(chapter.id));
  assert.notEqual(first.id, next.id);
});

test('one-card and five-card general trivia consume different questions', async () => {
  const playlist = session.generatePlaylist(25, 25, null, false, 17);
  const seeds = playlist.flatMap(item => item.kind === 'trivia' ? [item.seed]
    : item.kind === 'minigame' && item.gameId === 'trivia'
      ? Array.from({ length: 5 }, (_, index) => item.seed + index) : []);
  assert.ok(seeds.length >= 2);
  assert.equal(new Set(seeds).size, seeds.length);
  const ids = await Promise.all(seeds.map(seed =>
    content.fetchRideTrivia(undefined, undefined, seed).then(question => question.id)));
  assert.equal(new Set(ids).size, ids.length);
});

test('the offline quickfire pool stays distinct and valid for six full rounds, with no arithmetic filler', async () => {
  const questions = await Promise.all(Array.from({ length: 33 }, (_, seed) =>
    content.fetchRideTrivia(undefined, undefined, seed)));
  assert.equal(new Set(questions.map(question => question.id)).size, 33);
  // Arithmetic filler ("Captain Shark has 5 tickets") and the duplicated
  // Haunted Mansion / Space Mountain year questions are retired.
  const ids = new Set(questions.map(question => question.id));
  for (const retired of ['gen-19', 'gen-20', 'gen-27', 'gen-29', 'gen-35', 'gen-41', 'gen-42'])
    assert.equal(ids.has(retired), false, retired);
  for (const question of questions)
    assert.doesNotMatch(question.question, /How many|twice as many|worth\?/);
  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices).size, 4);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < 4);
    assert.ok(question.choices[question.correctIndex]);
  }
  for (const question of questions.filter(question => Number(question.id.slice(4)) >= 37)) {
    assert.ok(question.fact);
    assert.ok(question.source === 'Disney Parks Blog' || question.source === 'Universal Studios Hollywood');
  }
});

test('a park queue sees its own fan facts before general play and no other park facts', async () => {
  const checkPark = async (parkId, localIds, deckSize) => {
    const questions = await Promise.all(Array.from({ length: deckSize }, (_, seed) =>
      content.fetchRideTrivia(undefined, parkId, seed)));
    assert.equal(new Set(questions.map(question => question.id)).size, deckSize);
    assert.deepEqual(questions.slice(0, localIds.length).map(question => question.id), localIds);
    assert.equal(questions.slice(localIds.length).every(question => Number(question.id.slice(4)) <= 36), true);
  };
  await checkPark(8, ['gen-37', 'gen-38', 'gen-39', 'gen-40', 'gen-43', 'gen-44', 'gen-45'], 30);
  await checkPark(1, ['gen-48'], 24);
  await checkPark(6, ['gen-46'], 24);
  await checkPark(13, ['gen-47'], 24);
  await checkPark(2, [], 23);
});

test('five-question LinePlay trivia carries the fan-fact reveal without changing its answer key', async () => {
  const source = triviaSources.createLinePlayTriviaSource({ parkId: 8, seed: 0 });
  const first = await source.next();
  const original = await content.fetchRideTrivia(undefined, 8, 0);
  assert.equal(first.fact, original.fact);
  assert.equal(first.source, original.source);
  assert.deepEqual(Array.from(first.choices), Array.from(original.choices));
  assert.equal((await source.grade(original.correctIndex)).correct, true);
  for (let index = 1; index < 5; index++) assert.ok(await source.next());
  assert.equal(await source.next(), null);
});

test('a long queue rotates the playable five-question trivia game into its arcade', () => {
  const playlist = session.generatePlaylist(90, 90, null, false, 0);
  const gameIds = playlist.filter(item => item.kind === 'minigame').map(item => item.gameId);
  assert.ok(gameIds.includes('trivia'));
  assert.ok(gameIds.includes('current'));
  assert.ok(gameIds.includes('shark'));
});

test('return visits give adaptive shark stories distinct playable finales', () => {
  for (const rideName of ['Star Tours', 'Jungle Riverboat', 'Pirate Harbor', 'River Journey']) {
    const games = [];
    for (let episode = 0; episode < 3; episode++) {
      const chapter = chapters.getLinePlayChapter(99, rideName.toLowerCase().replace(/\W+/g, '-'), rideName, episode);
      const finale = session.generatePlaylist(20, 20, chapter)
        .find(item => item.id === `${chapter.id}-${chapter.finale.idSuffix}`);
      assert.equal(finale.gameId, chapter.finale.gameId);
      assert.equal(chapter.missionNames[2], finale.title);
      games.push(finale.gameId);
    }
    assert.deepEqual(games, ['memory', 'tap', 'shark']);
  }
});

test('new sessions rotate their opening content while an extended wait preserves it', async () => {
  const chapter = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  const first = session.generatePlaylist(15, 15, chapter, true, 1);
  const next = session.generatePlaylist(15, 15, chapter, true, 2);
  const longer = session.generatePlaylist(25, 15, chapter, true, 1);
  const opening = items => items.slice(0, 6).map(item => `${item.kind}:${item.seed ?? item.gameId ?? item.id}`);
  assert.notDeepEqual(opening(first), opening(next));
  assert.notEqual(first.find(item => item.kind === 'crew_grid').seed,
    next.find(item => item.kind === 'crew_grid').seed);
  assert.deepEqual(opening(first), opening(longer));
  assert.equal(session.playlistRotation('line-session-12345'), session.playlistRotation('line-session-12345'));
  assert.notEqual(session.playlistRotation('line-session-12345'), session.playlistRotation('line-session-12346'));
  const trivia = await Promise.all(first.filter(item => item.kind === 'trivia')
    .map(item => content.fetchRideTrivia(undefined, 2, item.seed, chapter.id).then(question => question.id)));
  assert.equal(new Set(trivia).size, trivia.length);
});

test('optional encore waves add varied playable rounds without moving the opening chapter', () => {
  const first = session.generateEncoreRounds(22, 413);
  const second = session.generateEncoreRounds(30, 413);
  assert.equal(first.length, 8);
  assert.equal(second.length, 8);
  assert.equal(first.every(item => ['minigame', 'trivia', 'circuit'].includes(item.kind)), true);
  assert.equal(new Set([...first, ...second].map(item => item.id)).size, 16);
  assert.notDeepEqual(first.map(item => item.seed), second.map(item => item.seed));
  assert.equal(session.generateEncoreRounds(79, 413).length, 1);
  assert.equal(session.generateEncoreRounds(80, 413).length, 0);
});

test('each rotated featured field note gives a crew choice that changes the finale', () => {
  for (const chapter of [
    chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain'),
    chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean'),
    chapters.getLinePlayChapter(2, 'haunted-mansion-2', 'Haunted Mansion'),
    chapters.getLinePlayChapter(999, 'sample-ride', 'Sample Ride'),
  ]) {
    for (let rotation = 0; rotation < 9; rotation += 1) {
      const playlist = session.generatePlaylist(20, 20, chapter, true, rotation);
      const featured = playlist.find(item => item.id === `${chapter.id}-field-note`);
      const note = chapter.fieldNotes[featured.seed % chapter.fieldNotes.length];
      assert.equal(note.challenge?.options.length, 3);
      const finale = playlist.find(item => item.id === `${chapter.id}-${chapter.finale.idSuffix}`);
      const firstClue = clue.resolveChapterClue(chapter, featured.seed, 0);
      const secondClue = clue.resolveChapterClue(chapter, featured.seed, 1);
      const firstFinale = clue.personalizeChapterFinale(finale, chapter, firstClue);
      const secondFinale = clue.personalizeChapterFinale(finale, chapter, secondClue);
      assert.equal(firstFinale.id, finale.id);
      assert.notEqual(firstFinale.seed, finale.seed);
      assert.notEqual(firstFinale.seed, secondFinale.seed);
      assert.match(firstFinale.preview, new RegExp(firstClue.choiceLabel));
      assert.equal(clue.personalizeChapterFinale(finale, chapter, null), finale);
    }
  }
});

test('Magic Kingdom Space Mountain flies on for returning players: three flights, one arc', () => {
  const navigation = require('./helpers/navigation-panel.cjs');
  const first = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  assert.equal(first.id, 'mk-space-mountain');
  assert.equal(first.episodeCount, 3);
  assert.equal(chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain', 0), first);
  const flights = [0, 1, 2].map(episode => chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain', episode));
  assert.deepEqual(flights.map(chapter => chapter.id),
    ['mk-space-mountain', 'mk-space-mountain-episode-1', 'mk-space-mountain-episode-2']);
  assert.deepEqual(flights.map(chapter => chapter.episodeLabel), ['FLIGHT 1 OF 3', 'FLIGHT 2 OF 3', 'FLIGHT 3 OF 3']);
  // Wraps, and resumes by id from a checkpoint.
  assert.equal(chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain', 4), flights[1]);
  for (const flight of flights) assert.equal(chapters.getLinePlayChapterById(flight.id), flight);
  assert.equal(chapters.getLinePlayChapterById('mk-space-mountain-episode-3'), null);
  // Disneyland keeps its own single story.
  assert.equal(chapters.getLinePlayChapter(8, 'space-mountain-8', 'Space Mountain', 2).id, 'dl-space-mountain');

  const titles = new Set(flights.map(chapter => chapter.title));
  assert.equal(titles.size, 3);
  for (const flight of flights) {
    assert.equal(flight.navigationPanel, true);
    // Same sourced deck on every flight; new strange-signal notes up front.
    assert.equal(flight.trivia, first.trivia);
    assert.equal(flight.fieldNotes.slice(0, 3).every(note => note.challenge?.options.length === 3), true);
    assert.equal(flight.finale.memoryDeckId, 'space');
    assert.equal(flight.finale.idSuffix, 'star-chart');
  }
  const featured = new Set(flights.flatMap(flight => flight.fieldNotes.slice(0, 3).map(note => note.id)));
  assert.equal(featured.size, 9);
  assert.notEqual(flights[1].relay.alphaResult, first.relay.alphaResult);
  assert.notEqual(flights[2].relay.epilogues.omega.title, flights[1].relay.epilogues.omega.title);

  // Returning flights open the navigation repair on the bigger board.
  for (let offset = 0; offset < 24; offset++) {
    const repair = session.generatePlaylist(30, 30, flights[1], true, offset)
      .find(item => item.id === `${flights[1].id}-trivia`);
    assert.equal(navigation.createNavigationPanel(repair.seed, 0).size, 4);
  }
  const firstSizes = new Set(Array.from({ length: 24 }, (_, offset) => navigation.createNavigationPanel(
    session.generatePlaylist(30, 30, first, true, offset).find(item => item.id === `${first.id}-trivia`).seed, 0).size));
  assert.ok(firstSizes.has(3));
});
