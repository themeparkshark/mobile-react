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
const { plain } = require('./helpers/plain.cjs');

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

test('How to Play is 4 to 6 big cards: 7 words or fewer, no ride-coin clash, a voice clip each, demo art is small WebP', () => {
  const { HOW_TO_CARDS, MAX_LINE_WORDS, wordCount } = loadTs('src/services/help/howToCards.ts');
  const topics = loadTs('src/services/help/helpTopics.ts');
  assert.ok(HOW_TO_CARDS.length >= 4 && HOW_TO_CARDS.length <= 6);
  assert.equal(MAX_LINE_WORDS, 7);
  for (const card of HOW_TO_CARDS) {
    assert.ok(wordCount(card.title) <= 3, `${card.id}: title is a few words`);
    assert.ok(wordCount(card.line) <= MAX_LINE_WORDS, `${card.id}: ${wordCount(card.line)} words`);
    assert.equal(card.line.split(/(?<=[.!?])\s+/).length, 1, `${card.id}: one sentence`);
    assert.doesNotMatch(card.title + card.line, EM_DASH);
    assert.doesNotMatch(card.title + card.line, /\bcoins?\b/i, `${card.id}: "coins" is the currency only`);
    assert.doesNotMatch(card.line, /play games/i, `${card.id}: cards 4 and 5 say different things`);
    assert.ok(topics.helpTopic(card.topic), `${card.id} opens a More topic`);
    assert.ok(fs.existsSync(path.join(root, `assets/sounds/howto/vo-${card.art}.mp3`)), `voice for ${card.id}`);
  }
  const dir = path.join(root, 'assets/images/howto');
  const files = fs.readdirSync(dir);
  assert.ok(files.every(file => file.endsWith('.webp')), 'demo layers are WebP');
  const total = files.reduce((sum, file) => sum + fs.statSync(path.join(dir, file)).size, 0);
  assert.ok(total < 400 * 1024, `How to Play art stays under 400 KB (${total})`);
  assert.deepEqual(plain(HOW_TO_CARDS.map(card => card.id)).sort(), ['book', 'catch', 'find', 'line', 'park']);
});

test('How to Play shark is Alex\'s real PNG (ART_RULES rule 1), never a generated shark', () => {
  const demos = read('src/screens/HowToPlay/HowToDemos.tsx');
  assert.match(demos, /require\('..\/..\/..\/assets\/images\/howto\/shark\.webp'\)/);
  const builder = path.join(process.env.HOME, 'apps/tps-prime-time-audit/next-wave/home-hunt-v3/tools/howto_build.py');
  if (!fs.existsSync(builder)) return; // Art pipeline lives outside the repo.
  const py = fs.readFileSync(builder, 'utf8');
  assert.match(py, /sharks\/CLASSIC UPDATE 2023 WITH EYES\.png/);
  assert.match(py, /\('shark', load_shark\('CLASSIC UPDATE 2023 WITH EYES\.png'\)\), \('shark-happy', happy\)/, 'two expressions, both Alex PNGs');
  assert.match(py, /def keyline/, 'unify pass: matched outline weight');
  assert.match(demos, /styles\.shadow/, 'contact shadow under the shark');
  assert.match(demos, /happy \? SHARK_HAPPY : SHARK/);
  assert.match(demos, /POINTER/, 'a glove pointer, not a hand next to the shark');
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

test('How to Play screen: looping demos, next card peeks, read aloud, springy dots, Learn more pill, Reduce Motion', () => {
  const screen = read('src/screens/HowToPlayScreen.tsx');
  assert.match(screen, /snapToInterval=\{interval\}/);
  assert.match(screen, /const cardWidth = width - SIDE \* 2 - 20;/, 'the next card peeks in');
  assert.match(screen, /<HowToDemo art=\{card\.art\}/);
  assert.match(screen, /VOICE\[card\.art\]/);
  assert.match(screen, /'Read aloud'/);
  assert.match(screen, /if \(ticket !== voiceTicket\.current\) \{ void sound\.unloadAsync/, 'a stale clip never plays over a newer one');
  assert.match(screen, /READ_ALOUD_SEEN/, 'first visit reads card 1 aloud');
  assert.doesNotMatch(screen, /styles\.card, \{ width \}, cardStyle\]\} accessible/, 'the card never groups its speaker away from VoiceOver');
  assert.match(screen, /playSfx\('ui\.select'/);
  assert.match(screen, /interpolateColor\(distance/, 'dots follow the finger without a spring per frame');
  assert.match(screen, /scaleX: interpolate\(distance/, 'dot width is a transform, not layout');
  assert.doesNotMatch(screen, /withSpring\(on \?/);
  assert.match(screen, /Learn more/);
  assert.doesNotMatch(screen, /of \{HOW_TO_CARDS\.length\}<\/Text>/, 'no "1 OF 5" eyebrow');
  assert.match(screen, /onAccessibilityAction/);
  assert.match(screen, /BOTTOM_BAR_OVERHANG/);
  assert.match(screen, /useState\(focus != null\)/);
  const demos = read('src/screens/HowToPlay/HowToDemos.tsx');
  assert.match(demos, /if \(!active \|\| reduced\) \{ t\.value = 1; return; \}/, 'only the visible card animates; Reduce Motion shows a still');
  const more = read('src/screens/HowToPlay/HowToPlayMore.tsx');
  assert.match(more, /MORE_ORDER\.map/);
  assert.match(more, /accessibilityState=\{\{ expanded: open \}\}/, 'collapsed rows');
  assert.match(more, /LEAD: readonly HelpTopicId\[\] = \['home'/, 'the at-home hunt leads');
  assert.match(more, /GLOSSARY_KEYS\.map/);
  assert.match(more, /replayAllTutorials/);
  for (const file of ['src/screens/HowToPlayScreen.tsx', 'src/screens/HowToPlay/HowToPlayMore.tsx', 'src/screens/HowToPlay/HowToDemos.tsx', 'src/services/help/howToCards.ts']) {
    assert.doesNotMatch(read(file), EM_DASH, file);
  }
});

test('menu: real X close, whole-row targets, VoiceOver labels, reverse-stagger close, reward badge', () => {
  const menu = read('src/components/QuickAccessMenu.tsx');
  // menuDelay is a pure function; evaluate it from source.
  const fn = menu.match(/export function menuDelay[\s\S]*?\n\}/)[0].replace('export ', '').replace(/: number/g, '').replace(/: boolean/g, '');
  const model = { menuDelay: new Function(`${fn}; return menuDelay;`)() };
  assert.deepEqual([0, 1, 2, 3, 4].map(i => model.menuDelay(i, 5, true)), [0, 50, 100, 150, 200]);
  assert.deepEqual([0, 1, 2, 3, 4].map(i => model.menuDelay(i, 5, false)), [120, 90, 60, 30, 0], 'close runs bottom first');
  assert.doesNotMatch(menu, /faTimes|rotate: iconRotate|45deg/, 'never a rotated X that reads as +');
  assert.match(menu, /close-red\.webp/);
  assert.match(menu, /accessibilityLabel=\{open \? 'Close menu' : 'Open menu'\}/);
  assert.match(menu, /accessibilityElementsHidden=\{!open\}/);
  assert.match(menu, /accessibilityViewIsModal=\{open\} onAccessibilityEscape=/, 'one modal scope holds rows and the close button');
  assert.match(menu, /AnimatedBlur animatedProps=\{blurProps\}/, 'blur never sits under a fading parent');
  assert.match(menu, /reduced \? \{ opacity: t\.value \}/, 'Reduce Motion rows only fade');
  assert.match(menu, /\{round\}\s*\{label\}/, 'icon and label are one Pressable row');
  assert.match(menu, /badge=\{item\.id === 'sets' && rewardWaiting\}/);
  assert.match(menu, /useUiReducedMotion/);
  assert.doesNotMatch(menu, /bottom: 100/, 'safe-area aware placement');
});
