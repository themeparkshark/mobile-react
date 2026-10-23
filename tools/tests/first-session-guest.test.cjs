'use strict';
/**
 * First session (Oct 23 polish): a guest plays before signing in, "Not now" on
 * location keeps playing, and a signed-out LinePlay never hangs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function guestTasteModule(store = new Map(), { broken = false } = {}) {
  const AsyncStorage = {
    async getItem(key) { if (broken) throw new Error('disk'); return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) { if (broken) throw new Error('disk'); store.set(key, value); },
  };
  return loadTs('src/services/guestTaste.ts', {
    '@react-native-async-storage/async-storage': { default: AsyncStorage, __esModule: true },
  });
}

test('guest taste: find, play, coin, then the sign-in ask, in that order', () => {
  const { guestStep, EMPTY_GUEST_TASTE } = guestTasteModule();
  assert.equal(guestStep(EMPTY_GUEST_TASTE), 'find');
  assert.equal(guestStep({ caught: true, won: false, shelved: false }), 'play');
  assert.equal(guestStep({ caught: true, won: true, shelved: false }), 'coin');
  assert.equal(guestStep({ caught: true, won: true, shelved: true }), 'save');
});

test('guest taste progress is saved on the phone and a damaged save starts over safely', async () => {
  const store = new Map();
  const mod = guestTasteModule(store);
  assert.equal(await mod.guestPlayedWarmup(), false);
  await mod.saveGuestTaste({ caught: true, won: true, shelved: false });
  assert.equal(await mod.guestPlayedWarmup(), true);
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'coin');
  // A win without a catch, or junk, never skips a step.
  store.set(mod.GUEST_TASTE_KEY, JSON.stringify({ won: true, shelved: true }));
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'find');
  store.set(mod.GUEST_TASTE_KEY, '{not json');
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'find');
  const broken = guestTasteModule(new Map(), { broken: true });
  assert.equal(await broken.guestPlayedWarmup(), false, 'an unreadable store never blocks play');
  await broken.saveGuestTaste({ caught: true, won: false, shelved: false });
});

test('a guest who already won the warm-up is greeted back and never replays it', () => {
  const { getStepsForSequence } = loadTs('src/components/Tutorial/steps.ts');
  const fresh = getStepsForSequence('onboarding');
  const back = getStepsForSequence('onboarding', { guestPlayed: true });
  assert.equal(back.length, 1);
  assert.match(back[0].text, /back/i);
  assert.equal(back[0].nextText, fresh[0].nextText, 'same Grab it! step, so the first home find still opens');
  for (const steps of [getStepsForSequence('onboarding', { inPark: true, guestPlayed: true }),
    getStepsForSequence('park_arrival', { guestPlayed: true })]) {
    assert.ok(steps.length > 0);
    assert.ok(steps.every(step => step.activity !== 'memory_warmup'), 'no second warm-up');
  }
  assert.equal(getStepsForSequence('onboarding', { inPark: true })[0].activity, 'memory_warmup', 'new players still get it');
});

test('guest and Not now copy is short, kid readable and has no em dashes', () => {
  const { GUEST_TASTE_COPY } = guestTasteModule();
  const lines = [];
  const walk = value => typeof value === 'string' ? lines.push(value) : Object.values(value).forEach(walk);
  walk(GUEST_TASTE_COPY);
  const notNow = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx').match(/NOT_NOW_COPY = \{([\s\S]*?)\} as const/)[1];
  const arcade = read('src/components/HomeArcade.tsx').match(/HOME_ARCADE_COPY = \{([\s\S]*?)\} as const/)[1];
  for (const block of [notNow, arcade]) for (const [, text] of block.matchAll(/'([^']+)'/g)) lines.push(text);
  assert.ok(lines.length >= 15);
  for (const line of lines) {
    assert.doesNotMatch(line, /—/, line);
    assert.ok(line.split(/\s+/).length <= 14, `short enough for a 7-year-old: ${line}`);
  }
});

test('Not now on location opens play (home arcade and a park pick), not News', () => {
  const source = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  const notNow = source.slice(source.indexOf('>Not now<') - 400, source.indexOf('>Not now<'));
  assert.doesNotMatch(notNow, /navigate\('News'\)/, 'Not now no longer leaves the game');
  assert.match(notNow, /setPlaying\(true\)/);
  assert.match(source, /<HomeArcade /);
  assert.match(source, /navigate\('CoinShelf'\)/);
  assert.match(source, /Turn On Location/);
});

test('home arcade is practice only: no coins, no Parts, no location', () => {
  const source = read('src/components/HomeArcade.tsx');
  assert.match(source, /isPractice/);
  assert.doesNotMatch(source, /redeem|reward(?!Mode)/i);
});

test('the guest sign-in ask is a game dialog with a Not now that keeps playing', () => {
  const source = read('src/hooks/usePermissions.tsx');
  assert.doesNotMatch(source, /Alert\.alert/);
  assert.match(source, /text: 'Not now', style: 'cancel'/);
  assert.match(source, /text: 'Sign in'/);
});

test('a signed-out LinePlay starts a local session instead of waiting forever', () => {
  const source = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(source, /if \(!ride \|\| !playerId\) return;/);
  assert.match(source, /guest: playerId == null/);
});

test('the login guest door is a real Play now button, not small grey text', () => {
  const source = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(source, /GUEST_PLAY_LABEL = 'Play now'/);
  assert.match(source, /<GameButton label=\{GUEST_PLAY_LABEL\}/);
  assert.match(source, /navigation\.navigate\('Explore'\)/);
});
