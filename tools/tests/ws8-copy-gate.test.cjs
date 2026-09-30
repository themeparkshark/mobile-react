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
const RIDE_TRACKER = fs.readdirSync(path.join(root, 'src/screens/RideTracker')).map(f => `src/screens/RideTracker/${f}`)
  .concat(fs.readdirSync(path.join(root, 'src/components/RideTracker')).map(f => `src/components/RideTracker/${f}`))
  .filter(f => /\.tsx?$/.test(f));
const WS8_CLEAN = [
  ...RIDE_TRACKER,
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
  'src/components/Tutorial/steps.ts',
  'src/components/Tutorial/TeacherShark.tsx',
  'src/components/Tutorial/TutorialProvider.tsx',
  'src/components/Tutorial/SpotlightOverlay.tsx',
  'src/screens/FriendsScreen.tsx',
  'src/screens/FriendsScreen/YourList.tsx',
  'src/screens/SocialScreen.tsx',
  'src/components/CreateThreadModal.tsx',
  'src/components/SocialPost.tsx',
  'src/components/Comment.tsx',
  'src/hooks/useFriends.tsx',
  'src/components/PushSoftAsk.tsx',
  'src/components/Toast.tsx',
  'src/screens/NewsScreen/Entry.tsx',
  'src/screens/ArticleScreen.tsx',
  'src/screens/NotificationsScreen.tsx',
  'src/components/Notification.tsx',
  'src/screens/CommunityCenterScreen.tsx',
  'src/components/CommunityCenterModal.tsx',
  'src/components/GuestInvite.tsx',
];

/** Files WS8 moved off the FontAwesome icon font onto hand-drawn art. */
const NO_ICON_FONT = [
  'src/screens/SettingsScreen.tsx',
  'src/screens/SocialScreen.tsx',
  'src/components/CreateThreadModal.tsx',
  'src/components/Comment.tsx',
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

test('WS8 social and settings surfaces use hand-drawn art, not an icon font, and one team source', () => {
  for (const file of NO_ICON_FONT) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /@fortawesome|@expo\/vector-icons/, file);
  }
  for (const file of ['src/screens/SocialScreen.tsx', 'src/components/CreateThreadModal.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /from '\.\.\/constants\/teams'/, `${file} reads teams from constants/teams.ts`);
    assert.doesNotMatch(source, /const TEAMS = \{/, `${file} has no local team copy`);
  }
  const social = fs.readFileSync(path.join(root, 'src/screens/SocialScreen.tsx'), 'utf8');
  assert.match(social, /Tap \+ below/);
  assert.doesNotMatch(social, /pencil icon above/);
});

test('toasts show art for their type, map legacy emoji to art, and never use a dark or purple fill', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/Toast.tsx'), 'utf8');
  assert.doesNotMatch(source, /156, 39, 176|#9C27B0|<Text style=\{styles\.icon\}>/);
  assert.match(source, /GameIcon name=\{toastIcon\(toast\.type, toast\.icon\)\}/);
  assert.match(source, /GameRichText/);
});

test('friend actions confirm with the game dialog and report failures', () => {
  const source = fs.readFileSync(path.join(root, 'src/hooks/useFriends.tsx'), 'utf8');
  assert.doesNotMatch(source, /Alert\.alert/);
  assert.equal((source.match(/catch \{/g) || []).length, 3);
});

test('Notifications: mark-all-read hides when nothing is unread, a failed load can retry, the empty state is art', () => {
  const source = fs.readFileSync(path.join(root, 'src/screens/NotificationsScreen.tsx'), 'utf8');
  const fn = source.slice(source.indexOf('export function showMarkAllRead'), source.indexOf('/** "All caught up"'));
  const js = require(path.join(root, 'node_modules/typescript')).transpileModule(fn, { compilerOptions: { module: 1 } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', js)(mod, mod.exports);
  assert.equal(mod.exports.showMarkAllRead([]), false);
  assert.equal(mod.exports.showMarkAllRead([{ read_at: '2026-09-29' }]), false);
  assert.equal(mod.exports.showMarkAllRead([{ read_at: '2026-09-29' }, { read_at: null }]), true);
  assert.match(source, /\{showMarkAllRead\(notifications\) && <Button/);
  assert.match(source, /state="error"/);
  assert.match(source, /GameIcon name="bell"/);
});

test('Community Center: bright blue cards, no black scrims or neon green, no stock spinners', () => {
  for (const file of ['src/screens/CommunityCenterScreen.tsx', 'src/components/CommunityCenterModal.tsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /#1a3a5c|#0a1628|#4ade80|rgba\(0,\s*0,\s*0/i, file);
    assert.doesNotMatch(source, /ActivityIndicator/, file);
  }
});

test('Ride Tracker: brand fonts instead of bold system text, art instead of stock spinners and alerts', () => {
  for (const file of RIDE_TRACKER) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /fontWeight/, `${file} uses Shark or Knockout`);
    assert.doesNotMatch(source, /ActivityIndicator|Alert\.alert/, file);
    assert.doesNotMatch(source, /rgba\(0,\s*0,\s*0/, `${file} uses navy, not black`);
  }
});

test('server icons for achievements and collections map to art and never render emoji', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const ui = loadTs('src/ui/iconTokens.ts');
  const names = loadTs('src/ui/iconNames.ts');
  const { serverIcon } = loadTs('src/components/RideTracker/rideIcons.ts', {
    '../../ui': { iconForEmoji: ui.iconForEmoji, resolveIconName: names.resolveIconName },
  });
  assert.equal(serverIcon('crown', 'trophy'), 'crown');
  assert.equal(serverIcon('[icon:streak]', 'trophy'), 'streak');
  assert.equal(serverIcon('\u{1F525}', 'trophy'), 'streak');
  assert.equal(serverIcon('\u{1F9A9}', 'trophy'), 'trophy');
  assert.equal(serverIcon(null, 'trophy'), 'trophy');
});

test('guest invite: bright card over the live map, sign-in inside, no gym promise or grey wall', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/GuestInvite.tsx'), 'utf8');
  assert.match(source, /<SignInButtons \/>/);
  assert.match(source, /absoluteFillObject/, 'overlays the map instead of replacing it');
  assert.doesNotMatch(source, /#d9d9d9|gyms?\b/i);
  assert.match(source, /reduced \? undefined/, 'reduced-motion path');
});

test('a notification row renders server copy through the icon-safe text and draws its arrow as art', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/Notification.tsx'), 'utf8');
  assert.match(source, /<GameRichText[\s\S]*notification\.content\?\.message/);
  assert.doesNotMatch(source, /<Text[^>]*>\s*\{notification\.content\?\.message/);
  assert.match(source, /<GameIcon name="arrow"/);
  assert.doesNotMatch(source, /›/);
});
