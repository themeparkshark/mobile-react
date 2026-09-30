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
    module: moduleRef,
    exports: moduleRef.exports,
    require(name) {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: file });
  return moduleRef.exports;
}

const rideTheme = load('src/services/rideTheme.ts');
const chapters = load('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme });
const content = load('src/services/lineplay/content.ts', { './chapters': chapters });

test('the Magic Kingdom chapter cannot bleed into Disneyland or other rides', () => {
  const chapter = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  assert.equal(chapter.id, 'mk-space-mountain');
  assert.equal(chapters.getLinePlayChapter(8, 'space-mountain-8', 'Space Mountain').id, 'dl-space-mountain');
  assert.equal(chapters.getLinePlayChapter(2, 'haunted-mansion-2', 'Haunted Mansion').id, 'mk-haunted-mansion');
  assert.equal(chapter.trivia.length >= 5, true);
  assert.equal(chapter.fieldNotes.length >= 3, true);
});

test('Disneyland Space Mountain has its own sourced queue mission and never uses Magic Kingdom facts', async () => {
  const chapter = chapters.getLinePlayChapter(8, 'space-mountain-8', 'Space Mountain');
  assert.equal(chapter.id, 'dl-space-mountain');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapter.finale.memoryDeckId, 'launch-code');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  assert.equal(chapter.fieldNotes.slice(0, 3).every(note => note.challenge?.options.length === 3), true);
  assert.equal(chapter.trivia.some(question => /Alpha|Omega|Starport Seven-Five/.test(question.question)), false);
  const ids = new Set();
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(44, 8, seed, chapter.id);
    assert.equal(question.choices[question.correctIndex], chapter.trivia[seed].choices[0]);
    assert.ok(['Disneyland Resort', 'Disney Parks Blog'].includes(question.source));
    ids.add(question.id);
  }
  assert.equal(ids.size, 8);
});

test('Magic Kingdom Haunted Mansion has its own offline clue path and never bleeds to Disneyland', async () => {
  const chapter = chapters.getLinePlayChapter(2, 'haunted-mansion-2', 'Haunted Mansion');
  assert.equal(chapter.id, 'mk-haunted-mansion');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(8, 'haunted-mansion-8', 'Haunted Mansion').id, 'dl-haunted-mansion');
  assert.equal(chapter.finale.memoryDeckId, 'mansion');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(84, 2, seed, chapter.id);
    assert.equal(question.id, chapter.trivia[seed].id);
    assert.equal(question.source, 'Walt Disney World');
  }
  for (let seed = 0; seed < 3; seed++) {
    const note = await content.fetchRideLore(84, 2, seed, chapter.id);
    assert.equal(note.challenge.options.length, 3);
  }
});

test('Disneyland Haunted Mansion restores its own sourced portrait chapter without borrowing Florida queue facts', async () => {
  const chapter = chapters.getLinePlayChapter(8, 'haunted-mansion-8', 'Haunted Mansion');
  assert.equal(chapter.id, 'dl-haunted-mansion');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(8, 'another-slug', 'Haunted Mansion'), chapter);
  assert.equal(chapter.finale.memoryDeckId, 'mansion');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  assert.notEqual(chapter.title, chapters.getLinePlayChapter(2, 'haunted-mansion-2', 'Haunted Mansion').title);
  assert.notEqual(chapter.relay.epilogues.alpha.title, chapter.relay.epilogues.omega.title);
  assert.equal(chapter.trivia.some(question => /musical crypt|Magic Kingdom/i.test(question.question)), false);
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(84, 8, seed, chapter.id);
    assert.equal(question.id, chapter.trivia[seed].id);
    assert.ok(['Disneyland Resort', 'Disney Parks Blog'].includes(question.source));
  }
  for (let seed = 0; seed < 3; seed++) {
    const note = await content.fetchRideLore(84, 8, seed, chapter.id);
    assert.equal(note.challenge.options.length, 3);
    assert.match(note.challenge.finish, /place|relay|Relay/);
  }
});

test('Universal Hollywood Studio Tour has a distinct solo and crew chapter', async () => {
  const chapter = chapters.getLinePlayChapter(1, 'studio-tour-1', 'Studio Tour');
  assert.equal(chapter.id, 'ush-studio-tour');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(1, 'world-famous-studio-tour-1',
    'The World-Famous Studio Tour').id, chapter.id);
  assert.equal(chapters.getLinePlayChapter(2, 'studio-tour-2', 'Studio Tour').adaptive, true);
  assert.equal(chapter.finale.memoryDeckId, 'backlot');
  // Seven sourced questions: the third-party film-title question was retired from UI copy.
  assert.equal(chapter.trivia.length, 7);
  assert.equal(chapter.trivia.some(question => /jaws/i.test(`${question.question} ${question.choices.join(' ')} ${question.fact ?? ''}`)), false);
  assert.equal(chapter.fieldNotes.length, 6);
  assert.notEqual(chapter.relay.epilogues.alpha.title, chapter.relay.epilogues.omega.title);
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(31, 1, seed, chapter.id);
    assert.equal(question.id, chapter.trivia[seed].id);
    assert.equal(question.source, 'Universal Studios Hollywood');
  }
  for (let seed = 0; seed < 3; seed++) {
    const note = await content.fetchRideLore(31, 1, seed, chapter.id);
    assert.equal(note.challenge.options.length, 3);
  }
});

test('the Disneyland Pirates chapter stays at its own ride and restores by id', () => {
  const chapter = chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean');
  assert.equal(chapter.id, 'dl-pirates');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(2, 'pirates-of-the-caribbean-2', 'Pirates of the Caribbean').adaptive, true);
  assert.equal(chapters.getLinePlayChapter(8, 'haunted-mansion-8', 'Haunted Mansion').id, 'dl-haunted-mansion');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  assert.equal(chapter.finale.idSuffix, 'compass');
  assert.equal(chapter.finale.memoryDeckId, 'pirates');
});

test('Disneyland Jungle Cruise has sourced offline trivia, safe crew clues, and its own art', async () => {
  const chapter = chapters.getLinePlayChapter(8, 'jungle-cruise-8', 'Jungle Cruise');
  assert.equal(chapter.id, 'dl-jungle-cruise');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(2, 'jungle-cruise-2', 'Jungle Cruise').adaptive, true);
  assert.equal(chapter.finale.memoryDeckId, 'jungle');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  const positions = new Set();
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(10, 8, seed, chapter.id);
    assert.equal(question.id, chapter.trivia[seed].id);
    assert.equal(question.choices[question.correctIndex], chapter.trivia[seed].choices[0]);
    assert.equal(question.source, 'Disneyland Resort');
    positions.add(question.correctIndex);
  }
  assert.ok(positions.size >= 3);
  for (let seed = 0; seed < 3; seed++) {
    const note = await content.fetchRideLore(10, 8, seed, chapter.id);
    assert.equal(note.challenge.options.length, 3);
    assert.match(note.challenge.finish, /line|photo|solo/i);
  }
});

test('Disneyland Big Thunder has a sourced Rainbow Ridge chapter without bleeding to Florida', async () => {
  const chapter = chapters.getLinePlayChapter(8, 'big-thunder-mountain-railroad-8',
    'Big Thunder Mountain Railroad');
  assert.equal(chapter.id, 'dl-big-thunder');
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(2, 'big-thunder-mountain-railroad-2',
    'Big Thunder Mountain Railroad').adaptive, true);
  assert.equal(chapter.finale.memoryDeckId, 'rainbow-ridge');
  assert.equal(chapter.trivia.length, 8);
  assert.equal(chapter.fieldNotes.length, 6);
  assert.equal(chapter.fieldNotes.slice(0, 3).every(note => note.challenge?.options.length === 3), true);
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const question = await content.fetchRideTrivia(999, 8, seed, chapter.id);
    assert.equal(question.id, chapter.trivia[seed].id);
    assert.equal(question.choices[question.correctIndex], chapter.trivia[seed].choices[0]);
    assert.ok(['Disneyland Resort', 'Disney Parks Blog'].includes(question.source));
  }
});

test('every named ride gets a stable offline adventure without invented ride trivia', async () => {
  const first = chapters.getLinePlayChapter(4, 'river-journey-4', 'River Journey');
  const replay = chapters.getLinePlayChapter(4, 'river-journey-4', 'River Journey');
  const anotherPark = chapters.getLinePlayChapter(8, 'river-journey-8', 'River Journey');
  assert.equal(first, replay);
  assert.equal(first.adaptive, true);
  assert.notEqual(first.id, anotherPark.id);
  assert.equal(first.trivia.length, 6);
  assert.equal(chapters.getLinePlayChapterById(first.id), first);
  assert.ok(first.story.includes('River Journey'));
  assert.equal(first.fieldNotes.length, 6);
  const clue = await content.fetchRideLore(1, 4, 0, first.id);
  assert.equal(clue.challenge.options.length, 3);
  const question = await content.fetchRideTrivia(1, 4, 0, first.id);
  assert.ok(question.id.startsWith(first.id));
  assert.equal(question.question, first.trivia[0].question);
  assert.ok((await content.fetchRideTrivia(1, 4, 6, first.id)).id.startsWith('gen-'));
  assert.equal(chapters.getLinePlayChapter(4, 'unnamed-4', ''), null);
});

test('adaptive rides get fictional chapters and matching illustrated decks', () => {
  const cases = [
    ['Star Tours', 'space'],
    ['Pirate Harbor', 'pirates'],
    ['Phantom Manor', 'mansion'],
    ['Studio Tour', 'backlot'],
    ['The Seas with Nemo & Friends', 'ocean'],
    ['Jungle Riverboat', 'jungle'],
    ['River Journey', 'park'],
  ];
  for (const [rideName, deckId] of cases) {
    const chapter = chapters.getLinePlayChapter(99, rideName.toLowerCase().replace(/\W+/g, '-'), rideName);
    assert.equal(chapter.adaptive, true);
    assert.equal(chapter.finale.memoryDeckId, deckId);
    assert.equal(chapter.trivia.length, 6);
    assert.ok(chapter.story.includes(rideName));
    assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  }
  assert.notEqual(chapters.getLinePlayChapter(99, 'star-tours', 'Star Tours').title,
    chapters.getLinePlayChapter(99, 'river-journey', 'River Journey').title);
});

test('a return visit can open a new episode without changing its saved chapter', () => {
  const first = chapters.getLinePlayChapter(99, 'river-journey', 'River Journey', 0);
  const second = chapters.getLinePlayChapter(99, 'river-journey', 'River Journey', 1);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.title, second.title);
  assert.equal(chapters.getLinePlayChapter(99, 'river-journey', 'River Journey', 0), first);
  assert.equal(chapters.getLinePlayChapterById(second.id), second);
  assert.equal(first.finale.memoryDeckId, second.finale.memoryDeckId);
});

test('adaptive and offline fallback content fits non-coaster rides across a long wait', async () => {
  const chapter = chapters.getLinePlayChapter(4, 'river-journey-4', 'River Journey');
  const questions = [];
  for (let seed = 0; seed < 12; seed++) {
    const question = await content.fetchRideTrivia(1, 4, seed, chapter.id);
    questions.push(question);
    assert.equal(question.choices.length, 4);
    assert.equal(question.correctIndex >= 0 && question.correctIndex < 4, true);
    assert.doesNotMatch(question.question, /coaster|launch|inversion|airtime/i);
    if (seed < chapter.trivia.length) {
      const original = chapter.trivia[seed];
      assert.equal(question.id, original.id);
      assert.equal(question.choices[question.correctIndex], original.choices[original.correctIndex]);
    }
  }
  assert.equal(new Set(questions.map(question => question.id)).size, 12);
  assert.equal(new Set(questions.slice(0, 6).map(question => question.question)).size, 6);
  assert.equal(chapter.trivia[3].choices[chapter.trivia[3].correctIndex], 'Diamond');
  assert.equal(chapter.trivia[4].choices[chapter.trivia[4].correctIndex], 'West');
  assert.equal(chapter.trivia[5].choices[chapter.trivia[5].correctIndex], 'Diamond, star, circle');
  // Pattern clues are spelled out in words: no dingbat glyphs in player copy.
  for (const question of chapter.trivia)
    assert.doesNotMatch(`${question.question} ${question.choices.join(' ')}`, /[✦●◆≋▲→]/u);
  for (let seed = 0; seed < 20; seed++) {
    const note = await content.fetchRideLore(undefined, undefined, seed);
    assert.doesNotMatch(note.body, /coaster|launch|inversion|airtime/i);
  }
});

test('the Disneyland Pirates chapter supplies a repeatable offline ride playlist', async () => {
  const chapter = chapters.getLinePlayChapter(8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean');
  const questions = new Set();
  const positions = new Set();
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const first = await content.fetchRideTrivia(12, 8, seed, chapter.id);
    const replay = await content.fetchRideTrivia(12, 8, seed, chapter.id);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(replay)));
    assert.equal(first.choices[first.correctIndex], chapter.trivia[seed].choices[0]);
    assert.equal(first.fact, chapter.trivia[seed].fact);
    assert.equal(first.source, 'Disneyland Resort');
    questions.add(first.id);
    positions.add(first.correctIndex);
  }
  assert.equal(questions.size, chapter.trivia.length);
  assert.ok(positions.size >= 3);
  const fieldNote = await content.fetchRideLore(12, 8, 0, chapter.id);
  assert.equal(fieldNote.id, chapter.fieldNotes[0].id);
  assert.equal(fieldNote.challenge.options.length, 3);
  assert.ok(fieldNote.challenge.options.every(option => option.label && option.task));
});

test('chapter trivia is varied, valid, repeatable, and used offline', async () => {
  const chapter = chapters.getLinePlayChapter(2, 'space-mountain-2', 'Space Mountain');
  const positions = new Set();
  const questions = new Set();
  for (let seed = 0; seed < chapter.trivia.length; seed++) {
    const first = await content.fetchRideTrivia(12, 2, seed, chapter.id);
    const replay = await content.fetchRideTrivia(12, 2, seed, chapter.id);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(replay)));
    assert.ok(first.correctIndex >= 0 && first.correctIndex < first.choices.length);
    assert.equal(first.choices[first.correctIndex], chapter.trivia[seed].choices[0]);
    assert.equal(first.fact, chapter.trivia[seed].fact);
    assert.ok(first.source);
    positions.add(first.correctIndex);
    questions.add(first.id);
  }
  assert.equal(questions.size, chapter.trivia.length);
  assert.ok(positions.size >= 3);
  const fieldNote = await content.fetchRideLore(12, 2, 0, chapter.id);
  assert.equal(fieldNote.id, chapter.fieldNotes[0].id);
  assert.equal(fieldNote.challenge.options.length, 3);
});
