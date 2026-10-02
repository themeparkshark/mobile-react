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

test('art comes from the server in four variants; one small bundled fallback; failures never leave a hole', () => {
  const src = read('src/screens/stampbook/art.ts');
  const requires = [...src.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]);
  assert.deepEqual(requires, ['../../../assets/images/stamps/stamp-fallback.png']);
  assert.ok(fs.statSync(path.join(root, 'assets/images/stamps/stamp-fallback.png')).size < 60_000, 'fallback must stay small');
  assert.match(src, /size === 'thumb' \? stamp\.lockedThumbUrl : stamp\.lockedUrl/);
  assert.match(src, /size === 'thumb' \? stamp\.thumbUrl : stamp\.iconUrl/);
  const artView = read('src/screens/stampbook/StampArt.tsx');
  assert.match(artView, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(artView, /source=\{failed \? FALLBACK_ART : source\}/);
  // Tiles use thumbs, the card uses the big art.
  assert.match(read('src/screens/stampbook/StampTile.tsx'), /<StampArt stamp=\{stamp\} size="thumb"/);
  assert.match(read('src/screens/stampbook/StampCard.tsx'), /<StampArt stamp=\{stamp\} size="full"/);
  // Preview data never ships in the production bundle path.
  assert.ok(!/^import .*preview/m.test(read('src/screens/StampBookScreen.tsx')));
});

test('the slam: anticipation, exp drop, hit-stop, squash, one-overshoot settle, ink, shake, flash, impact on a predicted timer', () => {
  const src = read('src/screens/stampbook/StampCard.tsx');
  assert.match(src, /Easing\.in\(Easing\.exp\)/);
  assert.match(src, /const hold = rank >= 5 \? 120 : 50;/);
  assert.match(src, /withTiming\(1\.08, \{ duration: 60 \}\)/);
  assert.match(src, /const settle = \{ damping: 12, stiffness: 380 \};/);
  assert.match(src, /later\(300, \(\) => impact\(celebrate\)\)/);
  assert.ok(!/runOnJS/.test(src), 'impact must not hop through runOnJS');
  assert.match(src, /haptic\('hitRigid'\);\n\s+playSfx\('fx\.hit'\);/);
  assert.match(src, /<InkBurst /);
  assert.match(src, /if \(reducedMotion\) \{\n\s+fade\.value = withTiming/);
  // Timers die with the card.
  assert.match(src, /useEffect\(\(\) => \(\) => \{ timers\.current\.forEach\(clearTimeout\)/);
  // VoiceOver: the backdrop does not swallow the card.
  assert.match(src, /accessibilityViewIsModal onAccessibilityEscape=\{onClose\}/);
  assert.match(src, /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{onClose\} accessible=\{false\}/);
  assert.ok(!/accessibilityLabel="Close stamp"/.test(src));
});

test('claim cascade: tokens pop, particles arc to the HUD with rising ticks, counters, Got it!, then the next reward', () => {
  const src = read('src/screens/stampbook/StampCard.tsx');
  assert.match(src, /<Particle key=\{b\.id\}/);
  assert.match(src, /GameAudio\.play\('fx\.coinTick', \{ pitch: Math\.min\(12, n\)/);
  assert.match(src, /label=\{gotIt \? 'Got it!' : 'Stamped!'\}/);
  assert.match(src, /label=\{`Next reward \(\$\{nextCount\} left\)`\}/);
  assert.match(src, /accessibilityLabel=\{`Claim rewards: \$\{rewardSpeech\(stamp\.rewards\)\}`\}/);
});

test('tiles never re-render for the card or scroll: one shared shine clock with a real rest, gated on screen', () => {
  const fx = read('src/screens/stampbook/BookFx.tsx');
  assert.match(fx, /withDelay\(2500, withTiming\(0, \{ duration: 0 \}\)\)/);
  const tile = read('src/screens/stampbook/StampTile.tsx');
  assert.ok(!/withRepeat/.test(tile), 'tiles must not own infinite animations');
  assert.match(tile, /!fx\.paused\.value && onScreen\(/);
  assert.ok(!/animate:/.test(tile));
  const screen = read('src/screens/StampBookScreen.tsx');
  assert.match(screen, /useBookClocks\(focused && !selected, reducedMotion\)/);
  assert.match(screen, /const REFETCH_MS = 30_000;/);
  assert.match(screen, /buildBook\(response, prevIndex\.current\)/);
});

test('stable identity: an unchanged stamp keeps its object across rebuilds', () => {
  const resp = { stamps: { a: [stamp({ id: 1, section: 'parks' }), stamp({ id: 2, section: 'parks' })] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] };
  const first = model.buildBook(resp);
  const idx = model.stampIndex(first);
  const second = model.buildBook({ ...resp, stamps: { a: [stamp({ id: 1, section: 'parks' }), stamp({ id: 2, section: 'parks', progress: 1 })] } }, idx);
  const byId = new Map(second[0].stamps.map(s => [s.id, s]));
  assert.equal(byId.get(1), idx.get(1));
  assert.notEqual(byId.get(2), idx.get(2));
});

test('zero-reading: pictograms, pips, positive lines, Go targets, claim chain and next up', () => {
  const r = (metric, target) => model.requirement({ metric, target });
  assert.equal(r('prep_items_collected', 25).icon, 'pin');
  assert.equal(r('prep_items_collected', 25).count, 25);
  assert.equal(r('longest_streak', 7).pips, true);
  assert.equal(r('friends_count', 3).go, 'Friends');
  assert.equal(r('visited_epcot', 1).count, null);
  assert.equal(r('logged_in_after_midnight', 1).go, null);
  assert.equal(model.remainingLine({ metric: 'longest_streak', target: 7, progress: 4, earned: false, secret: false }), '3 more days!');
  assert.equal(model.remainingLine({ metric: 'prep_items_collected', target: 25, progress: 24, earned: false, secret: false }), '1 more find!');
  assert.equal(model.remainingLine({ metric: 'park_shelf:2', target: 100, progress: 40, earned: false, secret: false }), '60% to go!');
  const book = model.buildBook({ stamps: { a: [
    stamp({ id: 1, section: 'parks', is_earned: true, reward_claimed: false }),
    stamp({ id: 2, section: 'parks', progress: 1, target: 5, target_value: 5 }),
    stamp({ id: 3, section: 'parks', progress: 4, target: 5, target_value: 5 }),
  ] }, sections: [{ key: 'parks', label: 'P', color: '#000000', blurb: '' }] });
  assert.deepEqual(plain(model.claimQueue(book).map(s => s.id)), [1]);
  assert.equal(model.nextUp(book).id, 3);
  assert.equal(model.almostThere(book[0].stamps.find(s => s.id === 3)), true);
  assert.equal(model.tileLabel(book[0].stamps.find(s => s.id === 3)), 'Explorer. Locked. 4 of 5. Visit 2 different parks');
  assert.equal(model.tileLabel(book[0].stamps.find(s => s.id === 1)), 'Explorer. Earned. Rewards ready to claim.');
});

test('stamp book copy has no em dashes and no internal words', () => {
  for (const file of ['src/screens/StampBookScreen.tsx', 'src/screens/stampbook/StampTile.tsx', 'src/screens/stampbook/StampCard.tsx',
    'src/screens/stampbook/model.ts', 'src/screens/stampbook/preview.ts', 'src/screens/stampbook/SlamFx.tsx', 'src/screens/stampbook/Foil.tsx']) {
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
