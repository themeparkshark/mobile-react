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
