'use strict';
/**
 * Home Hunt v3: the hamburger menu has no Shark Park, and How to Play is a
 * short deck of big kid-readable swipe cards with detail behind "More".
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');

const EM_DASH = new RegExp(String.fromCharCode(0x2014));

test('Shark Park is gone: no menu entry, no route, no screen or idle-game code', () => {
  const menu = read('src/components/QuickAccessMenu.tsx');
  assert.doesNotMatch(menu, /Shark Park|SharkPark|sharkpark/);
  assert.doesNotMatch(read('src/Root.tsx'), /SharkPark/);
  for (const file of ['src/screens/SharkParkScreen.tsx', 'src/helpers/idle-game.ts', 'src/models/idle-game-types.ts', 'src/components/SharkPark']) {
    assert.ok(!fs.existsSync(path.join(root, file)), `${file} removed`);
  }
  const glossary = loadTs('src/services/help/glossary.ts');
  assert.equal(glossary.LOCAL_GLOSSARY.shark_park, undefined);
  const topics = loadTs('src/services/help/helpTopics.ts');
  const all = topics.HELP_TOPICS.map(topic => topic.lines.join(' ') + topic.terms.join(' ')).join(' ');
  assert.doesNotMatch(all, /Shark Park|shark_park/);
  // The menu still opens everything else.
  for (const screen of ['SetCollection', 'StampBook', 'Store', 'HowToPlay', 'Settings']) assert.match(menu, new RegExp(`screen: '${screen}'`));
});

test('help copy no longer mentions the removed grab zone', () => {
  const glossary = loadTs('src/services/help/glossary.ts');
  const topics = loadTs('src/services/help/helpTopics.ts');
  const words = [
    ...glossary.GLOSSARY_KEYS.map(key => `${glossary.LOCAL_GLOSSARY[key].what} ${glossary.LOCAL_GLOSSARY[key].earn}`),
    ...topics.HELP_TOPICS.flatMap(topic => topic.lines),
  ].join(' ');
  assert.doesNotMatch(words, /grab zone/i);
});

test('How to Play is 4 to 6 big cards, one short sentence each, with art that exists and stays small', () => {
  const { HOW_TO_CARDS } = loadTs('src/services/help/howToCards.ts');
  const topics = loadTs('src/services/help/helpTopics.ts');
  assert.ok(HOW_TO_CARDS.length >= 4 && HOW_TO_CARDS.length <= 6);
  let total = 0;
  for (const card of HOW_TO_CARDS) {
    assert.ok(card.title.split(' ').length <= 3, `${card.id}: title is a few words`);
    assert.equal(card.line.split(/(?<=[.!?])\s+/).length, 1, `${card.id}: one sentence`);
    assert.ok(card.line.length <= 60, `${card.id}: kid-short`);
    assert.doesNotMatch(card.title + card.line, EM_DASH);
    assert.ok(topics.helpTopic(card.topic), `${card.id} opens a More topic`);
    const file = path.join(root, `assets/images/howto/${card.art}.png`);
    assert.ok(fs.existsSync(file), file);
    total += fs.statSync(file).size;
  }
  assert.ok(total < 600 * 1024, `How to Play art stays under 600 KB (${total})`);
  const ids = HOW_TO_CARDS.map(card => card.id);
  assert.deepEqual([...ids].sort(), ['book', 'catch', 'find', 'line', 'park']);
});

test('page math clamps to the deck', () => {
  const { pageForOffset } = loadTs('src/services/help/howToCards.ts');
  assert.equal(pageForOffset(0, 390), 0);
  assert.equal(pageForOffset(390 * 2 + 100, 390), 2);
  assert.equal(pageForOffset(99999, 390), 4);
  assert.equal(pageForOffset(-50, 390), 0);
  assert.equal(pageForOffset(100, 0), 0);
  assert.equal(pageForOffset(Number.NaN, 390), 0);
});

test('How to Play screen: swipe deck, springy dots, a soft sound per swipe, More holds the detail', () => {
  const screen = read('src/screens/HowToPlayScreen.tsx');
  assert.match(screen, /pagingEnabled/);
  assert.match(screen, /withSpring/);
  assert.match(screen, /playSfx\('ui\.select'/);
  assert.match(screen, /HowToPlayMore/);
  assert.match(screen, />More</);
  // A "?" sheet that links a topic opens More on that topic.
  assert.match(screen, /useState\(focus != null\)/);
  // Only the visible card floats (battery).
  assert.match(screen, /if \(!active \|\| reduced\)/);
  const more = read('src/screens/HowToPlay/HowToPlayMore.tsx');
  assert.match(more, /HELP_TOPICS\.map/);
  assert.match(more, /GLOSSARY_KEYS\.map/);
  assert.match(more, /replayAllTutorials/);
  for (const file of ['src/screens/HowToPlayScreen.tsx', 'src/screens/HowToPlay/HowToPlayMore.tsx', 'src/services/help/howToCards.ts']) {
    assert.doesNotMatch(read(file), EM_DASH, file);
  }
});
