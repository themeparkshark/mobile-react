const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const chapters = loadTs('src/services/lineplay/chapters.ts');

test('L2: a fright- slug gets the Fin-ister chapter (night palette, Shusher intro, spooky-silly deck)', () => {
  const chapter = chapters.getLinePlayChapter(3, 'fright-usf26-robot-city', 'The Robot City');
  assert.equal(chapter.palette, 'night');
  assert.match(chapter.introLine, /^shh\./);
  assert.equal(chapter.parkLabel, 'FIN-ISTER NIGHTS');
  assert.ok(chapter.trivia.length >= 5);
  assert.ok(chapter.trivia.every(q => q.correctIndex >= 0 && q.correctIndex < q.choices.length));
  assert.equal(chapters.getLinePlayChapterById(chapter.id), chapter);
  assert.equal(chapters.getLinePlayChapter(3, 'fright-usf26-robot-city', 'The Robot City'), chapter, 'cached');
});

test('L2: other rides never get the night palette (circuitTheme rule)', () => {
  for (const [park, slug, name] of [[1, 'studio-tour-1', 'Studio Tour'], [8, 'haunted-mansion-8', 'Haunted Mansion'],
    [3, 'some-coaster-3', 'Some Coaster']]) {
    const chapter = chapters.getLinePlayChapter(park, slug, name);
    assert.equal(chapter.palette, undefined, slug);
    assert.equal(chapter.introLine, undefined, slug);
  }
});

test('L2: the content-pack deck registers and maps correct_index; the haunt sheet opens LinePlay games-only', () => {
  const lineplay = loadTs('src/services/fright/lineplay.ts', {
    './content/trivia.json': JSON.parse(fs.readFileSync(path.join(root, 'src/services/fright/content/trivia.json'), 'utf8')),
    '../lineplay/chapters': chapters,
  });
  const deck = lineplay.frightTriviaDeck([{ slug: 'a', question: 'Q?', choices: ['x', 'y'], correct_index: 1, difficulty: 'easy' },
    { slug: 'bad', question: 'Q?', choices: ['x'], correct_index: 3, difficulty: 'easy' }]);
  assert.equal(deck.length, 1);
  assert.equal(deck[0].correctIndex, 1);
  assert.equal(deck[0].deck, 'fright');
  const chapter = chapters.getLinePlayChapter(3, 'fright-usf26-tug', 'The Tug of the Tides');
  assert.ok(chapter.trivia.length >= 30, 'full content deck after registration');
  const sheet = fs.readFileSync(path.join(root, 'src/components/fright/frightLinePlay.ts'), 'utf8');
  assert.match(sheet, /rideId: 0/);
  assert.match(sheet, /lineRewardsReady: false/);
  assert.match(sheet, /rideSlug: `fright-\$\{spot\.key\}`/);
});
