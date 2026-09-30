'use strict';
/**
 * WS8 strict copy gate: the first-session and secondary surfaces WS8 owns ship
 * no emoji, em dashes, dingbat icons or third-party phrases. This runs strict
 * today for these files (the repo-wide gate in no-emoji.test.cjs is still in
 * report mode until integration).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { scanSource } = require('./helpers/ui-copy-rules.cjs');

const root = path.resolve(__dirname, '../..');
const WS8_CLEAN = [
  'src/screens/WelcomeScreen.tsx',
  'src/screens/Auth/LoginScreen.tsx',
  'src/components/SignInButtons.tsx',
  'src/components/signInErrors.ts',
  'src/screens/SettingsScreen.tsx',
  'src/screens/Settings/accountDeletion.ts',
  'src/screens/LeaderboardScreen.tsx',
  'src/screens/LeaderboardsScreen/Experience.tsx',
  'src/screens/LeaderboardsScreen/ParkCoins.tsx',
  'src/screens/LeaderboardsScreen/RideStandings.tsx',
  'src/screens/LeaderboardsScreen/PodiumSpot.tsx',
  'src/screens/LeaderboardsScreen/StandingsPodium.tsx',
  'src/screens/LeaderboardsScreen/StandingsRow.tsx',
  'src/screens/LeaderboardsScreen/standingsModel.ts',
];

test('WS8 surfaces have no emoji, em dashes, glyph icons or third-party phrases', () => {
  const offenders = [];
  for (const file of WS8_CLEAN) {
    for (const hit of scanSource(fs.readFileSync(path.join(root, file), 'utf8'), file)) {
      offenders.push(`${file}:${hit.line} ${hit.kind}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('Welcome drops the third-party name word and shows the fan-app disclaimer', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/WelcomeScreen.tsx'), 'utf8');
  assert.doesNotMatch(source, /'Jaws'/);
  assert.match(source, /independent fan app/);
  assert.match(source, /GameIcon name="dice"/);
  assert.doesNotMatch(source, /ActivityIndicator/);
});
