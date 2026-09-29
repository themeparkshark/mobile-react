const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/components/parkDayShareMetrics.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, Number });
const { parkDayShareMetrics, parkDayCaptureSize } = moduleUnderTest.exports;
const day = { new_coins: 1, coin_upgrades: 1, eligible_line_minutes: 0, ride_parts_earned: 0, ride_wins: 1, park_project_points: 0 };
test('a first-coin park story emphasizes earned activity without empty queue stats', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parkDayShareMetrics(day))), [
    { value: 1, label: 'new coin' }, { value: 1, label: 'upgrade' }, { value: 1, label: 'ride win' },
  ]);
});
test('queue parts stay distinct from ride-win parts and only positive confirmed metrics appear', () => {
  const stats = parkDayShareMetrics({ ...day, new_coins: 0, coin_upgrades: 0, eligible_line_minutes: 12, ride_parts_earned: 2 });
  assert.equal(stats[0].label, 'verified min'); assert.equal(stats[1].label, 'Queue Parts');
  assert.ok(stats.every(stat => stat.value > 0)); assert.equal(stats.length, 3);
});
test('iOS native capture options produce exactly 1080 by 1920 pixels at each display density', () => {
  for (const density of [1, 2, 3]) {
    const size = parkDayCaptureSize('ios', density);
    assert.equal(size.width * density, 1080); assert.equal(size.height * density, 1920);
  }
});
test('Android receives pixel dimensions directly and invalid densities cannot corrupt capture size', () => {
  for (const [platform, density] of [['android', 3], ['ios', 0], ['ios', NaN]]) {
    const size = parkDayCaptureSize(platform, density); assert.equal(size.width, 1080); assert.equal(size.height, 1920);
  }
});
