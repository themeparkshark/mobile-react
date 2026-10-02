const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/games/current-quest/v1/logic.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { makeCurrentBoard, beginCurrentBoard, moveCurrent, scoreCurrentBoard, currentStars } = moduleRef.exports;

test('generated voyages are distinct, repeatable, and always completable', () => {
  for (let stage = 0; stage < 3; stage++) {
    for (let seed = 0; seed < 40; seed++) {
      const board = makeCurrentBoard(seed * 1777 + 17, stage);
      assert.deepEqual(JSON.parse(JSON.stringify(board)),
        JSON.parse(JSON.stringify(makeCurrentBoard(seed * 1777 + 17, stage))));
      assert.equal(board.guaranteedRoute[0], board.start);
      assert.equal(board.guaranteedRoute.at(-1), board.goal);
      assert.equal(new Set(board.guaranteedRoute).size, board.guaranteedRoute.length);
      assert.ok(board.pearls.every(index => board.guaranteedRoute.includes(index)));
      assert.ok(board.rocks.every(index => !board.guaranteedRoute.includes(index)));
      let progress = beginCurrentBoard(board);
      let result;
      for (const target of board.guaranteedRoute.slice(1)) {
        ({ progress, result } = moveCurrent(board, progress, target));
        assert.notEqual(result, 'invalid');
        assert.notEqual(result, 'blocked');
        assert.notEqual(result, 'goal-locked');
      }
      assert.equal(result, 'complete');
      assert.equal(progress.collected.length, board.pearls.length);
      assert.ok(scoreCurrentBoard(board, progress) > 0);
    }
  }
});

test('treasure stays locked until pearls are found and backtracking is honest', () => {
  const board = { size: 2, start: 0, goal: 3, pearls: [1], rocks: [],
    guaranteedRoute: [0, 1, 3], routeMoves: 2 };
  let progress = beginCurrentBoard(board);
  progress = moveCurrent(board, progress, 2).progress;
  assert.equal(moveCurrent(board, progress, 3).result, 'goal-locked');
  progress = moveCurrent(board, progress, 0).progress;
  progress = moveCurrent(board, progress, 1).progress;
  assert.equal(progress.collected.length, 1);
  progress = moveCurrent(board, progress, 0).progress;
  assert.equal(progress.collected.length, 0);
  progress = moveCurrent(board, progress, 1).progress;
  const finish = moveCurrent(board, progress, 3);
  assert.equal(finish.result, 'complete');
  assert.deepEqual(JSON.parse(JSON.stringify(finish.progress.history)), [0, 2, 0, 1, 0, 1, 3]);
  assert.ok(scoreCurrentBoard(board, finish.progress) > 0);
  assert.equal(moveCurrent(board, finish.progress, 99).result, 'invalid');
});

test('stars reward route efficiency only after all three voyages', () => {
  const boards = [0, 1, 2].map(stage => makeCurrentBoard(12345, stage));
  const rounds = boards.map(board => board.guaranteedRoute.slice(1).reduce(
    (progress, target) => moveCurrent(board, progress, target).progress,
    beginCurrentBoard(board),
  ));
  assert.equal(currentStars(boards, rounds), 3);
  assert.equal(currentStars(boards, rounds.slice(0, 2)), 0);
  const slower = rounds.map(progress => ({ ...progress, moves: progress.moves + 8 }));
  assert.equal(currentStars(boards, slower), 1);
});
