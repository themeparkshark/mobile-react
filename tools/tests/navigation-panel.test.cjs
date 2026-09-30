const assert = require('node:assert/strict');
const test = require('node:test');
const panel = require('./helpers/navigation-panel.cjs');
test('procedural repair boards start broken, stay deterministic and are solvable by tile rotation', () => {
  const variants = new Set();
  const sizes = new Set();
  for (let seed = 0; seed < 400; seed++) for (let round = 0; round < 3; round++) {
    const board = panel.createNavigationPanel(seed, round);
    let progress = panel.createNavigationPanelProgress(seed, round);
    sizes.add(board.size);
    assert.equal(board.masks.length, board.size * board.size);
    assert.equal(progress.rotations.length, board.size * board.size);
    assert.equal(panel.traceNavigationPanel(board, progress.rotations).solved, false);
    assert.deepEqual(progress, panel.createNavigationPanelProgress(seed, round));
    assert.deepEqual(board, panel.createNavigationPanel(seed, round));
    assert.equal(new Set(board.relays).size, 3);
    assert.equal(board.route[0], board.entry);
    assert.equal(board.route.at(-1), board.exit);
    assert.equal(board.entry % board.size, 0, 'the signal enters on the west edge');
    assert.equal(board.exit % board.size, board.size - 1, 'the signal leaves on the east edge');
    variants.add(`${board.size}:${board.route.join(',')}`);
    const par = panel.navigationPanelPar(seed, round);
    assert.ok(par >= 3 && par <= (board.size === 3 ? 8 : 12), `par ${par} stays glanceable`);
    for (const index of board.route) for (let turn = 0; turn < 4; turn++) {
      if (panel.rotatePanelMask(board.masks[index], progress.rotations[index]) === board.masks[index]) break;
      progress = panel.turnNavigationTile(seed, progress, index);
    }
    const trace = panel.traceNavigationPanel(board, progress.rotations);
    assert.equal(trace.signals, 3); assert.equal(trace.reachesExit, true); assert.equal(trace.solved, true);
    assert.equal(progress.taps, par);
    assert.equal(panel.navigationPanelStars(seed, progress), 3);
    assert.equal(panel.turnNavigationTile(seed, progress, 0), progress, 'a completed board cannot be edited');
  }
  // Not four fixed layouts any more: hundreds of distinct routes.
  assert.ok(variants.size > 200, `only ${variants.size} layouts`);
  assert.deepEqual([...sizes].sort(), [3, 4]);
  // A first repair can be 3x3; every replay grows to 4x4.
  for (let seed = 0; seed < 50; seed++) assert.equal(panel.createNavigationPanel(seed, 1).size, 4);
});
test('the signal requires reciprocal connected ports, an entry, all three relays and the exit', () => {
  for (const seed of [0, 8, 9, 31]) {
    const board = panel.createNavigationPanel(seed);
    const solved = Array(board.size * board.size).fill(0);
    const trace = panel.traceNavigationPanel(board, solved);
    assert.equal(trace.solved, true);
    // The flow animation reads depth: the entry lights first and depth grows along the route.
    assert.equal(trace.depth[board.entry], 0);
    board.route.forEach((index, step) => assert.ok(trace.depth[index] <= step));
    for (const index of board.route) {
      const broken = [...solved]; broken[index] = 1;
      if (panel.rotatePanelMask(board.masks[index], 1) === board.masks[index]) continue;
      assert.equal(panel.traceNavigationPanel(board, broken).solved, false);
    }
    const noEntry = [...solved];
    noEntry[board.entry] = [1, 2, 3].find(turns => !(panel.rotatePanelMask(board.masks[board.entry], turns) & 8));
    assert.equal(panel.traceNavigationPanel(board, noEntry).connected.length, 0);
  }
});
test('stars reward a clean repair: par is three stars, double par two, anything else one', () => {
  const seed = 12;
  const board = panel.createNavigationPanel(seed);
  const par = panel.navigationPanelPar(seed, 0);
  const start = panel.createNavigationPanelProgress(seed, 0);
  assert.equal(panel.navigationPanelStars(seed, { ...start, taps: par }), 3);
  assert.equal(panel.navigationPanelStars(seed, { ...start, taps: par * 2 }), 2);
  assert.equal(panel.navigationPanelStars(seed, { ...start, taps: par * 2 + 1 }), 1);
  assert.ok(board.name.length > 0);
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
    { ...good, round: 1000 }, { ...good, taps: NaN }, { ...good, rotations: Array(9).fill(4) },
    { ...good, rotations: Array(12).fill(0) }])
    assert.equal(panel.isNavigationPanelProgress(bad), false);
  const priorCompletion = panel.createNavigationPanelProgress(4, 0, true);
  assert.equal(panel.traceNavigationPanel(panel.createNavigationPanel(4), priorCompletion.rotations).solved, true);
  assert.equal(priorCompletion.taps, 0);
});
