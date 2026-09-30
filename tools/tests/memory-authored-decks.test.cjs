const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, imports = {}) {
  const ref = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module: ref, exports: ref.exports, require(name) {
    if (name in imports) return imports[name];
    if (name.endsWith('.png')) {
      const resolved = path.resolve(path.dirname(path.join(root, file)), name);
      assert.ok(fs.existsSync(resolved), `bundled artwork exists: ${name}`);
      return resolved;
    }
    throw new Error(`Unexpected import ${name}`);
  } }, { filename: file });
  return ref.exports;
}
const broad = load('src/services/rideTheme.ts');
const decks = load('src/games/memory/decks.ts', {
  '../../services/rideTheme': broad,
  '../../gamekit': { GAME_COLORS: { blue: '#00f', coral: '#f80', gold: '#ff0' } },
});
const { buildBoard } = load('src/games/memory/logic.ts', { './engine': load('src/games/memory/engine.ts') });

test('Forbidden Journey gets authored magic art while other games and explicit decks keep their themes', () => {
  assert.equal(decks.deckIdForRideName('Harry Potter and the Forbidden Journey™'), 'wizard');
  assert.equal(decks.deckIdForRideName('  FORBIDDEN   JOURNEY  '), 'wizard');
  assert.equal(broad.deckIdForRideName('Forbidden Journey'), 'park');
  assert.equal(decks.deckIdForRideName('Space Mountain'), 'space');
  assert.equal(decks.deckIdForRideName('Pirates of the Caribbean'), 'pirates');
  assert.equal(decks.deckIdForRideName('A Magical Day'), 'park');
  assert.equal(decks.deckIdForRideName(undefined), 'park');
  assert.equal(decks.deckById('launch-code').label, 'Launch Code');
  assert.equal(decks.deckById('unknown'), null);
});

test('the magical deck supports every board size with distinct bundled face cells', () => {
  const deck = decks.deckById('wizard');
  assert.equal(deck.symbols.length, 10);
  assert.equal(new Set(deck.symbols.map(symbol => symbol.id)).size, 10);
  assert.deepEqual(Array.from(deck.symbols.slice(0, 8), symbol => symbol.sheetSlot), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Array.from(deck.symbols.slice(8), symbol => symbol.extraSheetSlot), [0, 1]);
  for (const [file, cols, rows] of [[deck.faceSheet, 4, 2], [deck.extraFaceSheet, 2, 1]]) {
    const png = fs.readFileSync(file);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width % cols, 0);
    assert.equal(height % rows, 0);
    assert.equal((width / cols) / (height / rows), 0.75);
  }
  for (const difficulty of [0, 1, 3]) {
    const board = buildBoard(difficulty, deck, 12345);
    const counts = new Map();
    for (const card of board.cards) counts.set(card.symbolIndex, (counts.get(card.symbolIndex) || 0) + 1);
    assert.equal(counts.size, board.shape.pairs);
    assert.ok(Array.from(counts.values()).every(count => count === 2));
  }
});

test('adding an authored deck preserves the existing seeded random-deck sequence', () => {
  const ids = ['ocean', 'park', 'space', 'pirates', 'mansion', 'backlot', 'jungle', 'rainbow-ridge'];
  assert.deepEqual(Array.from(decks.DECKS, deck => deck.id), ids);
  for (const seed of [0, 1, 7, 8, 100, -12345]) {
    assert.equal(decks.pickDeck(seed).id, ids[Math.abs(Math.floor(seed)) % ids.length]);
  }
});
