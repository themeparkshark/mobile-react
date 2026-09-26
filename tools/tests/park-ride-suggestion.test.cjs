const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/parkRideSuggestion.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { nearbyUncollectedRide } = moduleRef.exports;

const ride = (id, latitude, longitude) => ({
  id, name: `Ride ${id}`, latitude: String(latitude), longitude: String(longitude),
});
const location = { latitude: 28.418, longitude: -81.581 };

test('the live suggestion moves to the nearest uncollected ride area', () => {
  const rides = [ride(1, 28.420, -81.581), ride(2, 28.4181, -81.581)];
  assert.equal(nearbyUncollectedRide(rides, [], location).task.id, 2);
  assert.equal(nearbyUncollectedRide(rides, [rides[1]], location).task.id, 1);
  assert.equal(nearbyUncollectedRide(rides, rides, location), null);
});

test('missing or invalid coordinates cannot create a fake nearby recommendation', () => {
  const rides = [ride(1, '', ''), ride(2, 'NaN', '-81.581'), ride(3, '91', '-81.581'),
    ride(4, '0', '0')];
  assert.equal(nearbyUncollectedRide(rides, [], location), null);
  assert.equal(nearbyUncollectedRide([ride(4, 28.418, -81.581)], [], undefined), null);
});

test('a reported-down ride is skipped only while a fresh feed excludes it', () => {
  const rides = [ride(1, 28.4181, -81.581), ride(2, 28.420, -81.581)];
  assert.equal(nearbyUncollectedRide(rides, [], location).task.id, 1);
  assert.equal(nearbyUncollectedRide(rides, [], location, task => task.id !== 1).task.id, 2);
  assert.equal(nearbyUncollectedRide(rides, [], location, () => false), null);
});
