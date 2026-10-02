const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
  return moduleRef.exports;
}

const shelves = load('src/helpers/shopShelves.ts');
const now = Date.parse('2026-10-20T10:00:00-07:00');

test('section headers say why and when, from live timestamps', () => {
  const daily = { type: 'daily', ends_at: '2026-10-21T00:00:00-07:00' };
  assert.equal(shelves.sectionTimeLabel(daily, now), 'Leaving in 14h 0m');
  const featured = { type: 'featured', ends_at: '2026-10-26T00:00:00-07:00' };
  assert.equal(shelves.sectionTimeLabel(featured, now), 'New in 5d 14h');
  const halloween = { type: 'event', ends_at: '2026-10-21T00:00:00-07:00', event_ends_at: '2026-11-02T00:00:00-08:00', last_chance: false };
  assert.equal(shelves.sectionTimeLabel(halloween, now), '13 days left');
  assert.equal(shelves.sectionTimeLabel({ ...halloween, last_chance: true }, Date.parse('2026-10-31T10:00:00-07:00')), 'Last chance: 2 days left');
  assert.equal(shelves.sectionTimeLabel(halloween, Date.parse('2026-11-01T18:30:00-08:00')), 'Last day: 5h 30m left');
  assert.equal(shelves.sectionTimeLabel(daily, Date.parse('2026-10-21T00:00:01-07:00')), 'New items now');
});

test('copy never uses em dashes', () => {
  const src = fs.readFileSync(path.join(root, 'src/helpers/shopShelves.ts'), 'utf8')
    + fs.readFileSync(path.join(root, 'src/screens/StoreScreen/ShopShelves.tsx'), 'utf8')
    + fs.readFileSync(path.join(root, 'src/screens/StoreScreen/TryOnSheet.tsx'), 'utf8');
  assert.equal(src.includes('—'), false);
});

test('one tile tag, most useful first', () => {
  assert.equal(shelves.tileTag({ id: 1, has_purchased: true, shop: { last_chance: true } }), 'owned');
  assert.equal(shelves.tileTag({ id: 1, shop: { is_owned: false, last_chance: true, returning: true } }), 'last_chance');
  assert.equal(shelves.tileTag({ id: 1, shop: { returning: true } }), 'returning');
  assert.equal(shelves.tileTag({ id: 1 }), null);
});

test('set callouts say what finishing gets you', () => {
  const set = { slug: 'pirate-crew', name: 'Pirate Crew', title: 'Pirate Captain', owned: 2, total: 4, reward_state: 'locked', xp_reward: 120 };
  assert.equal(shelves.setRewardText(set), 'Finish the look: get the Pirate Captain title and 120 XP');
  assert.equal(shelves.setProgressText(set), '2 of 4');
  assert.equal(shelves.setProgressText({ ...set, owned: 4, reward_state: 'claimed' }), 'Complete!');
  assert.equal(shelves.setRewardText({ ...set, title: null, xp_reward: 0 }), 'Finish the look');
});

test('complete the look lists only unowned pieces on today\'s shelves', () => {
  const items = [
    { id: 1, shop: { set: { slug: 'pirate-crew' }, is_owned: true } },
    { id: 2, shop: { set: { slug: 'pirate-crew' }, is_owned: false } },
    { id: 2, shop: { set: { slug: 'pirate-crew' }, is_owned: false } },
    { id: 3, shop: { set: { slug: 'luau-day' }, is_owned: false } },
  ];
  assert.deepEqual([...shelves.missingPiecesToday("pirate-crew", items).map(i => i.id)], [2]);
});

test('hero falls back to the first unowned item', () => {
  const items = [{ id: 1, has_purchased: true }, { id: 2 }, { id: 3 }];
  assert.equal(shelves.heroItem(3, items).id, 3);
  assert.equal(shelves.heroItem(null, items).id, 2);
  assert.equal(shelves.heroItem(99, []), null);
});

test('accent ink stays readable', () => {
  assert.equal(shelves.inkOn('#ffcf3b'), '#05346e');
  assert.equal(shelves.inkOn('#6a1b9a'), '#ffffff');
  assert.equal(shelves.inkOn('nope'), '#ffffff');
  assert.equal(shelves.sectionAccent({ type: 'event', color: '#ff7a00', ends_at: '' }), '#ff7a00');
});

test('wishlist toggles optimistically', () => {
  assert.deepEqual([...shelves.toggleWish([1, 2], 2)], [1]);
  assert.deepEqual([...shelves.toggleWish([1], 3)], [1, 3]);
});
