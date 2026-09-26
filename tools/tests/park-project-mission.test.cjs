const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

const file = 'src/services/lineplay/projectMission.ts';
const source = fs.readFileSync(path.join(root, file), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: file,
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { resolveProjectMission } = moduleRef.exports;

const base = {
  id: 41,
  stage: 0,
  play_chapter: null,
  play_mission: { title: 'Search the Current', prompt: 'Swim to find it.', game_id: 'shark' },
};

test('the shared stage and vote change the actual playable queue round', () => {
  const hidden = resolveProjectMission(base);
  const first = resolveProjectMission({ ...base, stage: 1,
    play_mission: { title: 'First Clue', prompt: 'Remember it.', game_id: 'memory' } });
  const deep = resolveProjectMission({ ...base, stage: 2, play_chapter: 'a',
    play_mission: { title: 'Deep Route', prompt: 'Match the symbols.', game_id: 'memory' } });
  const star = resolveProjectMission({ ...base, stage: 2, play_chapter: 'b',
    play_mission: { title: 'Star Route', prompt: 'Tap the beat.', game_id: 'timing' } });

  assert.equal(hidden.game.gameId, 'shark');
  assert.equal(first.game.gameId, 'memory');
  assert.equal(deep.game.gameId, 'memory');
  assert.equal(star.game.gameId, 'timing');
  assert.notEqual(deep.game.id, star.game.id);
  assert.equal(deep.title, 'Deep Route');
  assert.equal(star.title, 'Star Route');
  assert.equal(resolveProjectMission({ ...base, stage: 2, play_chapter: 'b',
    play_mission: { title: 'Star Route', prompt: 'Tap the beat.', game_id: 'timing' } }).game.seed, star.game.seed);
  const nextEvent = resolveProjectMission({ ...base, id: 42, stage: 2, play_chapter: 'b',
    play_mission: { title: 'Banana Signal', prompt: 'Catch the clues.', game_id: 'banana' } });
  assert.equal(nextEvent.game.gameId, 'banana');
  assert.equal(resolveProjectMission({ ...base, play_mission: { title: 'Bad', prompt: 'Bad.', game_id: 'unknown' } }), null);
});
