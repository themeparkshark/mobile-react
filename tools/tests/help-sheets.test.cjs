'use strict';
/**
 * The "?" help sheets (src/services/help/helpSheets.ts): one shared component,
 * short picture-led pages, copy rules, and every "?" in the app routed to it.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sheets = loadTs('src/services/help/helpSheets.ts');
const icons = loadTs('src/ui/iconNames.ts');

test('every sheet is 1 to 3 pages, 3 points at most, short lines, no emoji or em dashes', () => {
  for (const sheet of Object.values(sheets.HELP_SHEETS)) {
    assert.deepEqual(plain(sheets.helpSheetProblems(sheet)), [], sheet.id);
    for (const page of sheet.pages) for (const point of page.points) assert.ok(icons.isGameIconName(point.icon), `${sheet.id}: ${point.icon}`);
  }
  // The checker itself catches long, emoji and em-dash copy.
  const bad = { id: 'x', name: 'x', pages: [{ key: 'a', hero: 'term', headline: 'One two three four five six',
    points: [{ icon: 'star', text: 'a b c d e f g h i j k l m' }, { icon: 'star', text: 'Hi \u{1F988}' }, { icon: 'star', text: 'a — b' }, { icon: 'star', text: 'x' }] }] };
  assert.equal(sheets.helpSheetProblems(bad).length, 5);
});

test('old information-modal ids open the matching sheet; server text is never shown', () => {
  assert.equal(sheets.helpSheetForInfoModal(1).id, 'pins');
  assert.equal(sheets.helpSheetForInfoModal(2).id, 'park');
  assert.equal(sheets.helpSheetForInfoModal(3).id, 'shop');
  assert.equal(sheets.helpSheetForInfoModal(5).id, 'standings');
  assert.equal(sheets.helpSheetForInfoModal(undefined, 'redeem').id, 'redeem');
  assert.equal(sheets.helpSheetForInfoModal(99).id, 'basics');
  const modal = read('src/components/InformationModal.tsx');
  assert.doesNotMatch(modal, /information-modals|getInformationModal/);
  assert.match(read('src/screens/RedeemCoinCodeScreen.tsx'), /<InformationModal sheet="redeem" \/>/);
});

test('every "?" sheet in the app renders through HelpSheet', () => {
  for (const file of ['src/components/InformationModal.tsx', 'src/screens/threads/SocialHelp.tsx', 'src/components/help/TermSheet.tsx',
    'src/components/home/HomeHuntInfoSheet.tsx', 'src/components/help/HelpProvider.tsx']) {
    assert.match(read(file), /<HelpSheet\b/, file);
  }
  // The map's "?" opens the park sheet, not the long How to play list.
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /<HelpButton sheet="park_map"/);
  assert.match(explore, /onPark: \(\) => openHelpSheet\('park_map'\)/);
});

test('the sheet is safe-area correct, dismissable every way, and its scenes stop when hidden', () => {
  const sheet = read('src/components/help/HelpSheet.tsx');
  assert.match(sheet, /<SafeAreaProvider>/);
  assert.match(sheet, /maxHeight: height - insets\.top/);
  assert.match(sheet, /onRequestClose=\{onClose\}/);
  assert.match(sheet, /accessibilityLabel="Close help"/);
  assert.match(sheet, /event\.translationY > 110/);
  assert.match(sheet, /running=\{active && index === page\}/);
  const hero = read('src/components/help/HelpHero.tsx');
  assert.match(hero, /if \(!running \|\| reduced\) \{ t\.value = rest/);
  assert.match(hero, /cancelAnimation\(t\)/);
});

test('Shark Social keeps its safety rules and grown-up links', () => {
  const social = sheets.HELP_SHEETS.social;
  const text = social.pages.flatMap(page => page.points.map(point => point.text)).join(' ');
  for (const words of [/Mean posts get removed/, /name, school and home private/, /Report/]) assert.match(text, words);
  const help = read('src/screens/threads/SocialHelp.tsx');
  assert.match(help, /BlockedPlayers/);
  assert.match(help, /Grown-ups: email us/);
  // Leaving for the mail app asks a grown-up, after the sheet has closed (never two modals at once).
  assert.match(help, /onPress: \(\) => \{ setOpen\(false\); setTimeout\(\(\) => void emailUs\(\), 350\); \}/);
  assert.match(read('src/components/help/HelpSheet.tsx'), /useModalLayer\(visible, 'show'\)/);
  assert.match(help, /askGrownUp\(\{ kind: 'leave', where: 'your email app' \}\)/);
});

test('every glossary line fits the word sheet: 12 words at most', () => {
  const glossary = loadTs('src/services/help/glossary.ts');
  for (const key of glossary.GLOSSARY_KEYS) {
    const term = glossary.LOCAL_GLOSSARY[key];
    for (const line of [term.what, term.earn]) assert.ok(sheets.wordCount(line) <= 12, `${key}: ${line}`);
  }
  // A long server line falls back to the local one on the word sheet.
  const help = loadTs('src/components/help/TermSheet.tsx', {
    './HelpSheet': { default: () => null }, react: { useEffect: () => undefined, useState: v => [v, () => undefined] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  });
  const long = { ...glossary.LOCAL_GLOSSARY.energy, earn: 'Energy powers boss raids and coin upgrades. Earn it from home finds, rides and your daily chest.' };
  assert.equal(help.termSheetContent(long, 3).pages[0].points[1].text, glossary.LOCAL_GLOSSARY.energy.earn);
  assert.equal(help.termSheetContent(long, 3).pages[0].heroData.caption, 'You have 3 Energy');
});

test('Coins and Tickets sheets link to Supplies only when the store can sell and the player is signed in', () => {
  const provider = read('src/components/help/HelpProvider.tsx');
  assert.match(provider, /onGetMore=\{playerId != null && storeAvailable\(\) \?/);
  assert.match(provider, /navigate\('Store', \{ store: 'shark-shop', tab: 'supplies', focus: key \}\)/);
  assert.deepEqual(plain(loadTs('src/components/help/TermSheet.tsx', {
    './HelpSheet': { default: () => null }, react: { useEffect: () => undefined, useState: v => [v, () => undefined] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  }).GET_MORE_KEYS), ['coins', 'tickets']);
});

test('the pin hold copy matches the trading screen constant', () => {
  const pins = loadTs('src/screens/pinTrading/pinTradeModel.ts');
  const text = sheets.HELP_SHEETS.pins.pages.flatMap(page => page.points.map(point => point.text)).join(' ');
  assert.match(text, new RegExp(`${pins.DEFAULT_HOLD_MS / 60000} minutes`));
});
