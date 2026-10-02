const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/stamp-book.test.cjs
// Stamp Book v2: grouping, progress, locked and secret stamps, rewards, art source and the slam.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = loadTs('src/screens/stampbook/model.ts');

const rewards = (over = {}) => ({ energy: 0, tickets: 0, xp: 0, coins: 0, title: null, ...over });
function stamp(over = {}) {
  return {
    id: 1, slug: 'explorer', name: 'Explorer', category: 'events', goal: 'Visit 2 different parks',
    metric: 'parks_visited', target_value: 2, rarity: 'uncommon', image_key: null, emoji: null,
    is_hidden: false, sort_order: 1, progress: 0, target: 2, progress_percentage: 0, progress_text: '0/2',
    is_earned: false, earned_at: null, reward_claimed: false, rewards: rewards({ xp: 250 }), ...over,
  };
}

test('server sections drive the book; an older server falls back to metric rules', () => {
  const v2 = model.buildBook({
    stamps: { regions: [stamp({ id: 1, section: 'parks' })], stamps: [stamp({ id: 2, slug: 'first-steps', section: 'hunt' })] },
    sections: [{ key: 'hunt', label: 'Treasure Hunt', color: '#FF8A3D', blurb: 'x' }, { key: 'parks', label: 'Park Passport', color: '#2F6BFF', blurb: 'y' }],
  });
  assert.deepEqual(plain(v2.map(s => s.key)), ['hunt', 'parks']);

  const old = model.buildBook({ stamps: { all: [
    stamp({ id: 1, metric: 'visited_epcot' }), stamp({ id: 2, metric: 'prep_items_collected' }),
    stamp({ id: 3, metric: 'park_coins_collected' }), stamp({ id: 4, metric: 'friends_count' }),
    stamp({ id: 5, metric: 'longest_streak' }), stamp({ id: 6, metric: 'coins_held' }),
    stamp({ id: 7, metric: 'logged_in_after_midnight' }), stamp({ id: 8, metric: 'park_shelf:10' }),
    stamp({ id: 9, metric: 'prep_items_collected', is_hidden: true }),
  ] } });
  assert.deepEqual(plain(old.map(s => [s.key, s.stamps.map(x => x.id)])), [
    ['parks', [1, 8]], ['hunt', [2]], ['rides', [3]], ['friends', [4]], ['streaks', [5]], ['milestones', [6]], ['special', [7, 9]],
  ]);
  // An unknown section from a newer server still shows, on the Special page.
  const unknown = model.buildBook({ stamps: { a: [stamp({ section: 'brand-new' })] }, sections: [...model.FALLBACK_SECTIONS] });
  assert.equal(unknown[0].key, 'special');
});

test('earned first (newest first), then closest to done, secrets last', () => {
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, progress: 1, sort_order: 1 }),
    stamp({ id: 2, is_earned: true, earned_at: '2026-09-01T00:00:00Z', progress: 2 }),
    stamp({ id: 3, is_earned: true, earned_at: '2026-10-01T00:00:00Z', progress: 2 }),
    stamp({ id: 4, is_hidden: true, progress: 1, section: 'parks' }),
    stamp({ id: 5, progress: 0, sort_order: 0 }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(book[0].stamps.map(s => s.id)), [3, 2, 1, 5, 4]);
  // Secrets do not count toward the total until found.
  assert.equal(book[0].total, 4);
  assert.equal(book[0].earned, 2);
});

test('a locked stamp shows its how-to and progress; a secret hides its name and goal', () => {
  const locked = model.toBookStamp(stamp({ progress: 1, how_to: 'Visit 2 different parks' }));
  assert.equal(locked.earned, false);
  assert.equal(locked.percent, 50);
  assert.equal(model.progressLabel(locked), '1 / 2');
  assert.equal(locked.howTo, 'Visit 2 different parks');

  const secret = model.toBookStamp(stamp({ is_hidden: true, name: '???', goal: 'Catch 100 finds' }));
  assert.equal(secret.secret, true);
  assert.equal(secret.name, 'Secret stamp');
  assert.ok(!/100/.test(secret.howTo));
  const found = model.toBookStamp(stamp({ is_hidden: true, name: 'Legend', is_earned: true }));
  assert.equal(found.secret, false);
  assert.equal(found.name, 'Legend');

  // Passports are percentages; big counts get separators; earned is always full.
  assert.equal(model.progressLabel({ progress: 40, target: 100 }), '40%');
  assert.equal(model.progressLabel({ progress: 8120, target: 30000 }), '8,120 / 30,000');
  assert.equal(model.toBookStamp(stamp({ is_earned: true, progress: 0 })).percent, 100);
});

test('earned date is an absolute local date, never relative', () => {
  const iso = '2026-10-02T18:30:00Z';
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  assert.equal(model.earnedDate(iso), `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
  assert.equal(model.earnedDate(null), null);
  assert.equal(model.earnedDate('nope'), null);
});

test('rare and up shine once earned; rewards and claim counts read the payload', () => {
  assert.equal(model.hasShine({ rarity: 'rare', earned: true }), true);
  assert.equal(model.hasShine({ rarity: 'legendary', earned: false }), false);
  assert.equal(model.hasShine({ rarity: 'uncommon', earned: true }), false);
  assert.deepEqual(plain(model.rewardChips(rewards({ energy: 30, tickets: 1, xp: 1500, title: 'Explorer' })).map(c => c.label)),
    ['+30 Energy', '+1 Ticket', '+1,500 XP', '"Explorer" title']);
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, is_earned: true, reward_claimed: false }),
    stamp({ id: 2, is_earned: true, reward_claimed: true }),
    stamp({ id: 3, is_earned: true, reward_claimed: false, rewards: rewards() }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(model.bookTotals(book)), { earned: 3, total: 3, toClaim: 1 });
});

test('progress ring geometry is clamped', () => {
  const full = model.ring(1, 10);
  assert.equal(Math.round(full.offset), 0);
  assert.equal(model.ring(2, 10).offset, 0);
  assert.equal(model.ring(-1, 10).offset, full.circumference);
  assert.equal(model.ring(Number.NaN, 10).offset, full.circumference);
});

test('art comes from the server; bundled art is only a fallback and adds no new files', () => {
  const src = read('src/screens/stampbook/art.ts');
  assert.match(src, /if \(stamp\.iconUrl\) return \{ uri: stamp\.iconUrl/);
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
  for (const file of requires) assert.ok(fs.existsSync(path.join(root, 'src/screens/stampbook', file)), file);
  // Only the eleven stamps that already shipped: new art never grows the bundle.
  assert.equal(requires.length, 11);
  assert.match(src, /__DEV__ \? process\.env\.EXPO_PUBLIC_STAMP_ART_BASE/);
});

test('the stamp card slams: impact haptic and thunk, reveal on rare, reward stinger on claim, reduced motion fades', () => {
  const src = read('src/screens/stampbook/StampCard.tsx');
  assert.match(src, /haptic\('hitRigid'\)/);
  assert.match(src, /playSfx\('fx\.hit'\)/);
  assert.match(src, /playSfx\('fx\.reveal'/);
  assert.match(src, /haptic\('success'\); playSfx\('fx\.reward'\)/);
  assert.match(src, /if \(reducedMotion\) \{\n\s+fade\.value = withTiming/);
  assert.match(src, /runOnJS\(impact\)/);
});

test('tile shine runs on the UI thread and stops off-screen or under the card', () => {
  const tile = read('src/screens/stampbook/StampTile.tsx');
  assert.match(tile, /if \(!foil \|\| !animate\) \{\n\s+cancelAnimation\(shine\)/);
  assert.match(tile, /return \(\) => cancelAnimation\(shine\)/);
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /const animateTiles = focused && !selected;/);
});

test('stamp book copy has no em dashes and no internal words', () => {
  for (const file of ['src/screens/StampBookScreen.tsx', 'src/screens/stampbook/StampTile.tsx', 'src/screens/stampbook/StampCard.tsx',
    'src/screens/stampbook/model.ts', 'src/screens/stampbook/preview.ts']) {
    const src = read(file);
    assert.ok(!src.includes('—'), `${file} has an em dash`);
    assert.ok(!/prep item/i.test(src), `${file} says "prep item"`);
  }
});

test('preview data is dev only and the API keeps v2 fields optional', () => {
  assert.match(read('src/screens/StampBookScreen.tsx'), /const previewMode = __DEV__ && process\.env\.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';/);
  const api = read('src/api/endpoints/me/stamps.ts');
  for (const field of ['section?: string;', 'icon_url?: string | null;', 'how_to?: string;', 'sections?: StampSectionInfo[];'])
    assert.ok(api.includes(field), field);
});
