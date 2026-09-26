const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/parkRideAvailability.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { reportedRideStatus } = moduleRef.exports;

const suggestionFile = 'src/screens/parkRideSuggestion.ts';
const suggestionCode = ts.transpileModule(fs.readFileSync(path.join(root, suggestionFile), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const suggestionModule = { exports: {} };
vm.runInNewContext(suggestionCode, { module: suggestionModule, exports: suggestionModule.exports },
  { filename: suggestionFile });
const { nearbyUncollectedRide } = suggestionModule.exports;

test('a park reroute needs one exact ride-name match in the live feed', () => {
  const entries = [
    { id: '1', name: 'Haunted Mansion', status: 'DOWN' },
    { id: '2', name: 'Jungle Cruise', status: 'OPERATING' },
  ];
  assert.equal(reportedRideStatus(entries, 8, ' haunted mansion '), 'DOWN');
  assert.equal(reportedRideStatus(entries, 8, 'Jungle Cruise'), 'OPERATING');
  assert.equal(reportedRideStatus(entries, 8, 'Mansion'), null);
  assert.equal(reportedRideStatus([...entries, { id: '3', name: 'Haunted Mansion', status: 'OPERATING' }],
    8, 'Haunted Mansion'), null);
  assert.equal(reportedRideStatus([{ id: '4', name: 'Haunted Mansion Holiday', status: 'DOWN' }],
    8, 'Haunted Mansion'), 'DOWN');
  assert.equal(reportedRideStatus([{ id: '5', name: 'Pirates of the Caribbean', status: 'OPERATING' }],
    8, 'Pirates'), 'OPERATING');
  assert.equal(reportedRideStatus([{ id: '5', name: 'Pirates of the Caribbean', status: 'OPERATING' }],
    2, 'Pirates'), null);
});

test('a nearby non-ride coin cannot be described as a reported-open attraction', () => {
  const entries = [{ id: 'ride-1', name: 'Haunted Mansion', status: 'OPERATING' }];
  const tasks = [
    { id: 1, name: 'Fire Department', latitude: '33.81101', longitude: '-117.92000' },
    { id: 2, name: 'Haunted Mansion', latitude: '33.81200', longitude: '-117.92000' },
  ];
  const guest = { latitude: 33.811, longitude: -117.92000 };
  const reportedOpen = nearbyUncollectedRide(tasks, [], guest,
    task => reportedRideStatus(entries, 8, task.name) === 'OPERATING');
  assert.equal(reportedOpen.task.id, 2);
  assert.equal(reportedRideStatus(entries, 8, tasks[0].name), null);
});
