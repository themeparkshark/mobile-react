const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
  const rel = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
});

test('the fake "watch an ad" doubler is gone from the app', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/components/WatchAd.tsx')), false);
  const users = walk('src').filter(file => /WatchAd/.test(read(file)));
  assert.deepEqual(users, []);
});

test('key and redeemable rewards never send a client multiplier', () => {
  for (const file of ['src/api/endpoints/me/keys/redeem-key.ts', 'src/api/endpoints/me/redeemables/redeem-redeemables.ts']) {
    assert.doesNotMatch(read(file), /double_xp|double_coins|doubleXP/, file);
  }
  for (const file of ['src/components/RedeemKeyModal.tsx', 'src/components/RedeemCurrentRedeemableModel.tsx']) {
    const code = read(file);
    assert.doesNotMatch(code, /double(Key|Redeemable)/, file);
    // A failed collect keeps the find and tells the player, instead of an unhandled rejection.
    assert.match(code, /catch \{[\s\S]*gameAlert\(/, file);
  }
});

test('out-of-Tickets copy follows the server wallet flag', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const api = loadTs('src/api/endpoints/me/task-attempts.ts', { '../../client': { default: {} } });
  assert.match(api.ticketSourceCopy({ home: true, queue: true, queue_per_park_day: 2 }), /wait in line \(up to 2 a park day\)/);
  assert.doesNotMatch(api.ticketSourceCopy({ home: true, queue: false, queue_per_park_day: 2 }), /line/);
  assert.doesNotMatch(api.ticketSourceCopy(undefined), /line/);
});

test('owned HUD and home-find surfaces use art, not emoji, and no dark or purple surfaces', () => {
  for (const file of ['src/components/RadialStatsMenu.tsx', 'src/components/PrepItemRedeemModal.tsx']) {
    const code = read(file);
    assert.doesNotMatch(code, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, file);
    assert.doesNotMatch(code, /#9C27B0|rgba\(30, 34, 42/i, file);
  }
  assert.match(read('src/components/RadialStatsMenu.tsx'), /never runs out on a timer/);
  for (const dead of ['EnergyBar', 'DailyLoginCalendar', 'RewardPopup', 'XPLevelBar']) {
    assert.equal(fs.existsSync(path.join(root, `src/components/${dead}.tsx`)), false, dead);
  }
});
