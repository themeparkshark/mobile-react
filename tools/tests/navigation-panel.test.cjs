const assert = require('node:assert/strict');
const test = require('node:test');
const panel = require('./helpers/navigation-panel.cjs');
test('seeded repair puzzles start broken and all four route variants can be solved by tile rotation', () => {
  const variants = new Set();
  for (let seed = 0; seed < 64; seed++) for (let round = 0; round < 4; round++) {
    const board = panel.createNavigationPanel(seed, round);
    let progress = panel.createNavigationPanelProgress(seed, round);
    assert.equal(panel.traceNavigationPanel(board, progress.rotations).solved, false);
    assert.deepEqual(progress, panel.createNavigationPanelProgress(seed, round));
    assert.equal(new Set(board.relays).size, 3);
    variants.add(board.route.join(','));
    for (const index of board.route) for (let turn = 0; turn < 4; turn++) {
      if (panel.rotatePanelMask(board.masks[index], progress.rotations[index]) === board.masks[index]) break;
      progress = panel.turnNavigationTile(seed, progress, index);
    }
    const trace = panel.traceNavigationPanel(board, progress.rotations);
    assert.equal(trace.signals, 3); assert.equal(trace.reachesExit, true); assert.equal(trace.solved, true);
    assert.ok(progress.taps >= 3 && progress.taps <= 21);
    assert.equal(panel.turnNavigationTile(seed, progress, 0), progress, 'a completed board cannot be edited');
  }
  assert.equal(variants.size, 4);
});
test('the signal requires reciprocal connected ports, an entry, all three relays and the exit', () => {
  const board = panel.createNavigationPanel(0);
  const solved = Array(9).fill(0);
  assert.equal(panel.traceNavigationPanel(board, solved).solved, true);
  for (const index of board.route) {
    const broken = [...solved]; broken[index] = 1;
    assert.equal(panel.traceNavigationPanel(board, broken).solved, false);
  }
  const noEntry = [...solved]; noEntry[3] = 2;
  assert.equal(panel.traceNavigationPanel(board, noEntry).connected.length, 0);
});
test('a helpful clue identifies an actual broken link and replay changes the route without granting anything', () => {
  const seed = 7, first = panel.createNavigationPanel(seed);
  let progress = panel.createNavigationPanelProgress(seed);
  for (let step = 0; step < 24; step++) {
    const index = panel.nextNavigationRepair(first, progress);
    if (index == null) break;
    assert.ok(first.route.includes(index));
    progress = panel.turnNavigationTile(seed, progress, index);
  }
  assert.equal(panel.traceNavigationPanel(first, progress.rotations).solved, true);
  assert.equal(panel.nextNavigationRepair(first, progress), null);
  const next = panel.createNavigationPanel(seed, progress.round + 1);
  assert.notEqual(next.route.join(','), first.route.join(','));
  assert.equal(panel.traceNavigationPanel(next, panel.createNavigationPanelProgress(seed, 1).rotations).solved, false);
  assert.equal(Object.keys(progress).some(key => /reward|part|energy|ticket/i.test(key)), false);
});
test('checkpoint progress accepts only bounded rotations and keeps older completed chapter slots compatible', () => {
  const good = panel.createNavigationPanelProgress(4);
  assert.equal(panel.isNavigationPanelProgress(good), true);
  for (const bad of [null, {}, { ...good, rotations: [0] }, { ...good, round: -1 },
    { ...good, round: 1000 }, { ...good, taps: NaN }, { ...good, rotations: Array(9).fill(4) }])
    assert.equal(panel.isNavigationPanelProgress(bad), false);
  const priorCompletion = panel.createNavigationPanelProgress(4, 0, true);
  assert.equal(panel.traceNavigationPanel(panel.createNavigationPanel(4), priorCompletion.rotations).solved, true);
  assert.equal(priorCompletion.taps, 0);
});
