const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const source = fs.readFileSync(path.join(root, 'src/services/lineplay/crewRelay.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: 'crewRelay.ts' });
const relay = moduleRef.exports;

test('one phone hands four distinct roles across three players and completes a branch', () => {
  let state = relay.createCrewRelay(12345);
  assert.equal(relay.isCrewRelayProgress(state), true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.memorySequence)),
    JSON.parse(JSON.stringify(relay.createCrewRelay(12345).memorySequence)));
  state = relay.chooseCrewSize(state, 3);
  assert.equal(relay.crewRelayRoleNumber(state), 1);
  assert.equal(state.ready, true); // Player 1 starts as soon as the crew chooses its size.
  state = relay.answerCrewTrivia(state, 2, 2);
  assert.equal(state.triviaCorrect, true);
  assert.equal(relay.crewRelayRoleNumber(state), 2);
  assert.equal(state.ready, false); // A different player still gets a handoff pause.
  state = relay.readyForCrewTurn(state);
  state = relay.chooseCrewObservation(state, 'sound');
  assert.equal(relay.crewRelayRoleNumber(state), 3);
  state = relay.readyForCrewTurn(state);
  state = relay.hideCrewMemory(state);
  state = relay.pickCrewMemory(state, state.memorySequence[0]);
  state = relay.undoCrewMemory(state);
  assert.equal(state.memoryPicks.length, 0);
  for (const symbol of state.memorySequence) state = relay.pickCrewMemory(state, symbol);
  assert.equal(state.memoryCorrect, true);
  assert.equal(relay.crewRelayRoleNumber(state), 1);
  state = relay.readyForCrewTurn(state);
  state = relay.chooseCrewRoute(state, 'alpha');
  assert.equal(state.step, 'complete');
  assert.equal(state.route, 'alpha');
  assert.equal(relay.crewRelayScore(state), 2);
  assert.equal(relay.crewRelayEpilogue(state).gameId, 'tap');
  assert.equal(relay.crewRelayEpilogue(state).title, 'Hold the Alpha Signal');
});

test('solo play, missed signals, and invalid persisted data stay safe', () => {
  let state = relay.chooseCrewSize(relay.createCrewRelay(88), 1);
  assert.equal(state.ready, true);
  state = relay.answerCrewTrivia(state, 0, 2);
  assert.equal(relay.crewRelayRoleNumber(state), 1);
  assert.equal(state.ready, true);
  state = relay.chooseCrewObservation(state, 'shape');
  assert.equal(state.ready, true);
  state = relay.hideCrewMemory(state);
  for (let index = 0; index < 5; index++) {
    state = relay.pickCrewMemory(state, (state.memorySequence[index] + 1) % 4);
  }
  assert.equal(state.ready, true);
  state = relay.chooseCrewRoute(state, 'omega');
  assert.equal(relay.crewRelayScore(state), 0);
  assert.equal(state.route, 'omega');
  assert.equal(relay.crewRelayEpilogue(state).gameId, 'shark');
  assert.equal(relay.isCrewRelayProgress({ ...state, memorySequence: [9] }), false);
  assert.equal(relay.isCrewRelayProgress({ ...state, crewSize: 20 }), false);
});

test('the playable epilogue stays locked until the crew finishes a route', () => {
  const state = relay.chooseCrewSize(relay.createCrewRelay(777), 1);
  assert.equal(relay.crewRelayEpilogue(state), null);
});

test('a chapter can change the crew ending without changing the earned result', () => {
  let state = relay.chooseCrewSize(relay.createCrewRelay(777), 1);
  state = relay.readyForCrewTurn(state);
  state = relay.answerCrewTrivia(state, 0, 0);
  state = relay.readyForCrewTurn(state);
  state = relay.chooseCrewObservation(state, 'shape');
  state = relay.readyForCrewTurn(state);
  state = relay.hideCrewMemory(state);
  for (const symbol of state.memorySequence) state = relay.pickCrewMemory(state, symbol);
  state = relay.readyForCrewTurn(state);
  state = relay.chooseCrewRoute(state, 'alpha');
  const ending = relay.crewRelayEpilogue(state, {
    alpha: { title: 'Steady Through the Channel', prompt: 'Enter the harbor.' },
    omega: { title: 'Search the Open Sea', prompt: 'Find a passage.' },
  });
  assert.equal(ending.title, 'Steady Through the Channel');
  assert.equal(ending.prompt, 'Your shape signal changed this round. Enter the harbor.');
  assert.equal(ending.gameId, 'tap');
  assert.equal(relay.crewRelayScore(state), 2);
});

test('Lookout choice changes the Decoder challenge and seeded finale', () => {
  const begin = () => relay.answerCrewTrivia(
    relay.chooseCrewSize(relay.createCrewRelay(2026), 1), 0, 0);
  const shape = relay.chooseCrewObservation(begin(), 'shape');
  const color = relay.chooseCrewObservation(begin(), 'color');
  const sound = relay.chooseCrewObservation(begin(), 'sound');
  assert.notDeepEqual(Array.from(shape.memorySequence), Array.from(color.memorySequence));
  assert.notDeepEqual(Array.from(color.memorySequence), Array.from(sound.memorySequence));
  const finish = (state) => {
    state = relay.hideCrewMemory(state);
    for (const symbol of state.memorySequence) state = relay.pickCrewMemory(state, symbol);
    return relay.chooseCrewRoute(state, 'alpha');
  };
  const shapeEnding = relay.crewRelayEpilogue(finish(shape));
  const colorEnding = relay.crewRelayEpilogue(finish(color));
  assert.notEqual(shapeEnding.seed, colorEnding.seed);
  assert.match(colorEnding.prompt, /color signal changed this round/i);
});
