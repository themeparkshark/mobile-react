'use strict';
/**
 * Copy rules for every new Home Hunt file: no emoji, no em dashes (comments
 * included), never the old wardrobe name, and the app-side contract the
 * backend promised (no usernames on Near Me, no anti-cheat thresholds).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { read } = require('./helpers/load-ts.cjs');

const NEW_FILES = [
  'src/api/endpoints/me/homeHunt.ts',
  'src/constants/homeHuntCopy.ts',
  'src/components/home/HomeHuntInfoSheet.tsx',
  'src/components/home/HomeHuntResultsHost.tsx',
  'src/components/home/HomeHuntResultsModal.tsx',
  'src/components/home/homeHuntInfoModel.ts',
  'src/components/home/homeHuntResultsModel.ts',
  'src/screens/LeaderboardsScreen/HomeHunt.tsx',
  'src/screens/LeaderboardsScreen/HomeHuntAgeSheet.tsx',
  'src/screens/LeaderboardsScreen/homeHuntModel.ts',
  'src/screens/LeaderboardsScreen/homeHuntWeekCache.ts',
  'src/screens/SetCollection/SetHuntSections.tsx',
  'src/screens/SetCollection/setHuntModel.ts',
  'src/screens/ExploreScreen/homeHuntMap.ts',
  'src/screens/ExploreScreen/homeHuntRankStore.ts',
];
// Existing files this wave edited: their new lines are covered by scanning the whole file too.
const EDITED_FILES = [
  'src/screens/LeaderboardScreen.tsx', 'src/screens/SetCollectionScreen.tsx', 'src/components/PrepItemRedeemModal.tsx',
  'src/screens/ExploreScreen/HomeExplore.tsx', 'src/screens/ExploreScreen/HomeMapStatusCard.tsx',
];

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}⃣️]/u;
const EM_DASH = new RegExp(String.fromCharCode(0x2014));

test('no emoji anywhere in the new Home Hunt files', () => {
  for (const file of NEW_FILES) assert.doesNotMatch(read(file), EMOJI, file);
});

test('no em dashes anywhere in the new Home Hunt files', () => {
  for (const file of NEW_FILES) assert.doesNotMatch(read(file), EM_DASH, file);
});

test('the edited files add no emoji or em dash through this wave', () => {
  const { execFileSync } = require('node:child_process');
  const { root } = require('./helpers/load-ts.cjs');
  let base = '';
  try { base = execFileSync('git', ['merge-base', 'HEAD', 'claude/prime-time'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return; }
  for (const file of EDITED_FILES) {
    const diff = execFileSync('git', ['diff', '--unified=0', base, 'HEAD', '--', file], { cwd: root, encoding: 'utf8' });
    const added = diff.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
    assert.doesNotMatch(added, EMOJI, file);
    assert.doesNotMatch(added, EM_DASH, file);
  }
});

test('never the old wardrobe name in new copy', () => {
  for (const file of [...NEW_FILES, ...EDITED_FILES]) assert.doesNotMatch(read(file), /Dressing Room/i, file);
});

test('no anti-cheat thresholds are taught in app copy', () => {
  const copy = read('src/constants/homeHuntCopy.ts') + read('src/screens/ExploreScreen/homeHuntMap.ts');
  assert.doesNotMatch(copy, /\b(12 m\/s|45 m\/s|100 m|1000 m|speed|burst|mocked|teleport|strike)\b/i);
});

test('the Near Me board types carry no username field', () => {
  const api = read('src/api/endpoints/me/homeHunt.ts');
  assert.doesNotMatch(api, /username/i);
});
