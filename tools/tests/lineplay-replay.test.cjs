const assert = require('node:assert/strict');
const test = require('node:test');
const replay = require('./helpers/lineplay-replay.cjs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

test('replay seeds keep the first board and spread every later play', () => {
  assert.equal(replay.replaySeed(1234, 0), 1234);
  const seen = new Set();
  for (let plays = 1; plays <= 200; plays++) {
    const seed = replay.replaySeed(1234, plays);
    assert.notEqual(seed, 1234);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
    seen.add(seed);
  }
  assert.equal(seen.size, 200);
  assert.equal(replay.replaySeed(NaN, 2), replay.replaySeed(0, 2));
});

test('stars follow the shell multipliers and difficulty steps only on 2+ stars', () => {
  assert.equal(replay.starsFromMultiplier(0), 0);
  assert.equal(replay.starsFromMultiplier(1), 1);
  assert.equal(replay.starsFromMultiplier(1.5), 2);
  assert.equal(replay.starsFromMultiplier(2), 3);
  assert.equal(replay.nextQueueDifficulty(undefined, 1), 1);
  assert.equal(replay.nextQueueDifficulty(1, 2), 2);
  assert.equal(replay.nextQueueDifficulty(3, 3), 3);
});

test('the crew story names who did what, in turn order, for solo and crews', () => {
  const crewStory = loadTs('src/services/lineplay/crewStory.ts');
  const done = { step: 'complete', crewSize: 3, triviaCorrect: true, observation: 'sound',
    memoryCorrect: false, route: 'omega' };
  assert.deepEqual(plain(crewStory.crewStoryBeats(done, ['Harbor', 'Open Sea'])), [
    { role: 'navigator', who: 'Player 1', action: 'solved the clue' },
    { role: 'lookout', who: 'Player 2', action: 'spotted a sound' },
    { role: 'decoder', who: 'Player 3', action: 'tried the lock' },
    { role: 'captain', who: 'Player 1', action: 'chose Open Sea' },
  ]);
  const solo = crewStory.crewStoryBeats({ ...done, crewSize: 1, route: 'alpha' }, ['Harbor', 'Open Sea']);
  assert.equal(solo.every(beat => beat.who === 'You'), true);
  assert.equal(solo[3].action, 'chose Harbor');
  assert.deepEqual(plain(crewStory.crewStoryBeats({ ...done, step: 'route' }, ['A', 'B'])), []);
});

test('label overrides keep today\'s copy by default and can relabel sources and kickers', () => {
  const labels = loadTs('src/services/lineplay/labels.ts');
  assert.equal(labels.factSourceLine('Disney Parks Blog'), 'Source: Disney Parks Blog');
  assert.equal(labels.factSourceLine('  '), null);
  assert.equal(labels.chapterKicker({ parkLabel: 'MAGIC KINGDOM' }), 'SHARK FAN MISSION · MAGIC KINGDOM');
  const pending = { sourceLabel: 'Park fact', hideParkInKicker: true };
  assert.equal(labels.factSourceLine('Disney Parks Blog', pending), 'Park fact');
  assert.equal(labels.chapterKicker({ parkLabel: 'MAGIC KINGDOM' }, pending), 'SHARK FAN MISSION');
});

test('each ride theme dresses the circuit with a bright flow colour and its own place', () => {
  const theme = loadTs('src/services/lineplay/circuitTheme.ts', { '../rideTheme': loadTs('src/services/rideTheme.ts') });
  assert.equal(theme.circuitThemeFor('Space Mountain').place, 'STARPORT');
  assert.equal(theme.circuitThemeFor('Pirates of the Caribbean').place, 'HARBOR');
  assert.equal(theme.circuitThemeFor('Some Carousel').place, 'MIDWAY');
  assert.equal(theme.circuitThemeFor('Pirates of the Caribbean', true).place, 'STARPORT');
  for (const name of ['Space', 'Pirate', 'Haunted', 'Studio', 'Jungle', 'Reef', 'Carousel']) {
    const flow = theme.circuitThemeFor(name).flow;
    const [r, g, b] = [1, 3, 5].map(i => parseInt(flow.slice(i, i + 2), 16));
    // Bright, never dark: the flow must read on a white tile.
    assert.ok((r * 299 + g * 587 + b * 114) / 1000 > 120, `${name} flow ${flow} is too dark`);
    assert.ok(!(b > r + 40 && r > g), `${name} flow ${flow} reads purple`);
  }
});
