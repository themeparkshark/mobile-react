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
  const fakeRequire = name => (name === 'react' ? { useSyncExternalStore: () => undefined } : require(name));
  vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports, require: fakeRequire }, { filename: file });
  return moduleRef.exports;
}

const shelves = load('src/helpers/shopShelves.ts');
const now = Date.parse('2026-10-20T10:00:00-07:00');

const plain = v => JSON.parse(JSON.stringify(v));

test('daily stays calm until the last hour, then counts down in red', () => {
  const daily = { type: 'daily', ends_at: '2026-10-21T00:00:00-07:00' };
  assert.deepEqual(plain(shelves.dailyPill(daily, now)), { label: 'New stuff tonight', urgent: false, a11y: 'New items arrive tonight' });
  const late = shelves.dailyPill(daily, Date.parse('2026-10-20T23:18:00-07:00'));
  assert.equal(late.label, 'Leaving in 42m');
  assert.equal(late.urgent, true);
  assert.equal(shelves.dailyPill(daily, Date.parse('2026-10-21T00:00:01-07:00')).label, 'New stuff now');
});

test('featured names the day it changes, in the shop timezone', () => {
  const featured = { type: 'featured', ends_at: '2026-10-26T00:00:00-07:00' };
  assert.equal(shelves.featuredPill(featured, now).label, 'New on Monday');
  assert.equal(shelves.featuredPill(featured, Date.parse('2026-10-25T09:00:00-07:00')).label, 'New tonight');
});

test('events carry two honest timers: next drop and the end date', () => {
  const halloween = { type: 'event', ends_at: '2026-10-23T00:00:00-07:00', event_ends_at: '2026-11-02T00:00:00-08:00',
    event_last_day: '2026-11-01', last_chance: false, final_shelf: false };
  assert.equal(shelves.eventDropPill(halloween, now).label, 'New drop in 3 days');
  assert.equal(shelves.eventDropPill(halloween, Date.parse('2026-10-21T10:00:00-07:00')).label, 'New drop in 2 days');
  assert.equal(shelves.eventDropPill(halloween, Date.parse('2026-10-22T10:00:00-07:00')).label, 'New drop tonight');
  assert.equal(shelves.eventEndPill(halloween, now).label, 'Ends Nov 1');
  assert.equal(shelves.eventEndPill(halloween, now).urgent, false);
  const finale = { ...halloween, final_shelf: true, last_chance: true };
  assert.equal(shelves.eventDropPill(finale, now), null, 'no fake drop on the final shelf');
  assert.equal(shelves.eventEndPill(finale, Date.parse('2026-10-30T10:00:00-07:00')).label, 'Last chance: ends Nov 1');
  assert.equal(shelves.eventEndPill(finale, Date.parse('2026-11-01T18:30:00-08:00')).label, 'Last day!');
});

test('LAST CHANCE only when true; otherwise the wave name', () => {
  assert.equal(shelves.eventKicker({ type: 'event', ends_at: '', last_chance: false, wave: { title: 'Pumpkin Patch Week' } }), 'PUMPKIN PATCH WEEK');
  assert.equal(shelves.eventKicker({ type: 'event', ends_at: '', last_chance: true, wave: { title: 'Last Chance Weekend' } }), 'LAST CHANCE');
  assert.equal(shelves.eventKicker({ type: 'event', ends_at: '' }), 'SHARK SHOP EVENT');
});

test('timers use the server clock offset', () => {
  assert.equal(shelves.clockOffset('2026-10-20T10:00:00-07:00', Date.parse('2026-10-20T09:00:00-07:00')), 3_600_000);
  assert.equal(shelves.clockOffset(null, 5), 0);
});

test('coins format the same everywhere', () => {
  assert.equal(shelves.formatCoins(5000), '5,000');
  assert.equal(shelves.formatCoins(750), '750');
  assert.equal(shelves.formatCoins(1234567), '1,234,567');
  assert.equal(shelves.shortfall(630, 750), 120);
  assert.equal(shelves.shortfall(900, 750), 0);
});

test('copy never uses em dashes', () => {
  const files = ['src/helpers/shopShelves.ts', 'src/screens/StoreScreen/ShopShelves.tsx', 'src/screens/StoreScreen/TryOnSheet.tsx',
    'src/screens/StoreScreen/ShopTile.tsx', 'src/screens/StoreScreen/SetCompleteReveal.tsx', 'src/screens/StoreScreen/shopUi.tsx'];
  for (const file of files) assert.equal(fs.readFileSync(path.join(root, file), 'utf8').includes('—'), false, file);
});

test('one tile tag, most useful first', () => {
  assert.equal(shelves.tileTag({ id: 1, has_purchased: true, shop: { last_chance: true } }), 'owned');
  assert.equal(shelves.tileTag({ id: 1, shop: { is_owned: false, last_chance: true, returning: true } }), 'last_chance');
  assert.equal(shelves.tileTag({ id: 1, shop: { returning: true } }), 'returning');
  assert.equal(shelves.tileTag({ id: 1 }), null);
});

test('try-on wears the owned set pieces, and the full look on request', () => {
  const pieces = [{ id: 1, owned: true }, { id: 2, owned: false }, { id: 3, owned: true }, { id: 4, owned: false }];
  assert.deepEqual(plain(shelves.wearingIds(2, pieces, false)), [2, 1, 3]);
  assert.deepEqual(plain(shelves.wearingIds(2, pieces, true)), [2, 1, 3, 4]);
  assert.deepEqual(plain(shelves.wearingIds(2, pieces, false, [4])), [2, 1, 3, 4]);
  assert.equal(shelves.completesSet(2, pieces), false);
  assert.equal(shelves.completesSet(2, [{ id: 1, owned: true }, { id: 2, owned: false }]), true);
});

test('set slots: owned, in the shop today, or away', () => {
  assert.equal(shelves.pieceState({ id: 1, owned: true }, []), 'owned');
  assert.equal(shelves.pieceState({ id: 2, owned: false, in_shop: true }, []), 'in_shop');
  assert.equal(shelves.pieceState({ id: 3, owned: false }, [3]), 'in_shop');
  assert.equal(shelves.pieceState({ id: 4, owned: false }, [3]), 'away');
  const set = { slug: 's', name: 'Haunted Hotel', title: 'Night Shift Ghost', owned: 2, total: 3, reward_state: 'locked' };
  assert.equal(shelves.setProgressText(set), '2 of 3');
  assert.match(shelves.setA11y(set), /Haunted Hotel set, 2 of 3, finish it for the Night Shift Ghost title/);
  assert.match(shelves.setA11y({ ...set, owned: 3, reward_state: 'ready' }), /ready to claim/);
});

test('hearts reconcile per item, so a second tap is never wiped', () => {
  // Tap A then B; A's server answer arrives listing only A.
  const local = [1, 2];
  assert.deepEqual(plain(shelves.reconcileWish(local, [1], 1)), [1, 2]);
  assert.deepEqual(plain(shelves.reconcileWish([1, 2], [2], 1)), [2]);
  assert.deepEqual(plain(shelves.toggleWish([1, 2], 2)), [1]);
});

test('a bought tile keeps its place for this visit', () => {
  // Server moved the owned item 5 to the end; the first order seen wins.
  assert.deepEqual(plain(shelves.stableOrder([6, 7, 5], [5, 6, 7])), [5, 6, 7]);
  assert.deepEqual(plain(shelves.stableOrder([6, 7, 5, 9], [5, 6, 7])), [5, 6, 7, 9]);
  assert.deepEqual(plain(shelves.stableOrder([3, 4], undefined)), [3, 4]);
});

test('restock retries back off', () => {
  assert.equal(shelves.restockBackoffMs(0), 5000);
  assert.equal(shelves.restockBackoffMs(1), 15000);
  assert.equal(shelves.restockBackoffMs(9), 120000);
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
  assert.equal(shelves.sectionAccent({ type: 'event', color: '#ff7a00', ends_at: '' }), '#ff7a00');
});

test('round 4: one ribbon per tile; a quiet finale banner keeps tiles calm', () => {
  assert.deepEqual(plain(shelves.tileLanes({ id: 1, shop: { last_chance: true, returning: true, is_new: true } })), { ribbon: 'last_chance' });
  assert.deepEqual(plain(shelves.tileLanes({ id: 1, shop: { last_chance: true, is_new: true } }, true)), { ribbon: 'new' }, 'quiet: no red wall');
  assert.deepEqual(plain(shelves.tileLanes({ id: 1, shop: { last_chance: true } }, true)), { ribbon: null });
  assert.deepEqual(plain(shelves.tileLanes({ id: 1, shop: { returning: true, is_new: true } })), { ribbon: 'returning' });
  assert.deepEqual(plain(shelves.tileLanes({ id: 1, has_purchased: true, shop: { is_new: true } })), { ribbon: null }, 'owned: no ribbon');
  assert.equal(shelves.newCountLabel(3), '3 new today');
  assert.equal(shelves.newCountLabel(0), null);
});

test('round 3: honest wishlist copy', () => {
  assert.equal(shelves.wishSavedCopy(true), 'Saved! We’ll tell you next time it’s in the shop.');
  assert.equal(shelves.wishSavedCopy(false), 'Saved to your wishlist.');
  assert.equal(shelves.wishSavedCopy(null), 'Saved to your wishlist.');
  assert.equal(shelves.wishHintCopy(false, false), 'Heart it to save it for later.');
  assert.doesNotMatch(shelves.wishHintCopy(true, false), /tell you/);
});

test('round 3: calm last-chance copy names the season', () => {
  assert.equal(shelves.lastChanceLine('halloween'), 'Last chance! It comes back next Halloween.');
  assert.equal(shelves.lastChanceLine(null), 'Last chance! It comes back another time.');
});

test('round 3: ready sets collapse into one card', () => {
  assert.equal(shelves.readySummary([]), null);
  assert.equal(shelves.readySummary([{ name: 'Snow Day' }]).title, 'You finished Snow Day!');
  assert.equal(shelves.readySummary([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]).title, 'You finished 4 sets!');
});

test('round 3: XP bar level context', () => {
  assert.deepEqual(plain(shelves.levelProgress(12, 480, 1000, 140)), { level: 12, from: 0.48, to: 0.62, levelUp: false });
  const up = shelves.levelProgress(12, 950, 1000, 120);
  assert.equal(up.level, 13);
  assert.equal(up.levelUp, true);
});

test('round 3: the wishlist store notifies once per real change', () => {
  const store = load('src/screens/StoreScreen/wishStore.ts');
  // wishStore.ts imports React only for its hooks; the store itself is plain.
  const s = store.wishStore;
  let calls = 0;
  const off = s.subscribe(() => { calls++; });
  s.seed([1, 2], true);
  s.seed([2, 1], true);
  assert.equal(calls, 1, 'same ids: no emit');
  s.set(3, true); s.set(3, true);
  assert.equal(calls, 2);
  assert.equal(s.has(3), true);
  assert.equal(s.count(), 3);
  s.set(1, false);
  assert.equal(s.has(1), false);
  off();
});

test('round 4: XP bar from the server, level-up shown, no percentages', () => {
  const up = shelves.xpBar({ level: 4, experience: 380, needed: 400 }, { level: 5, experience: 100, needed: 500 }, 120);
  assert.equal(up.levelUp, true);
  assert.equal(up.level, 5);
  assert.equal(up.from, 0);
  assert.equal(up.to, 0.2);
  assert.equal(up.caption, "Level up! You're level 5");
  // Exactly reaching the next level (leftover 0) is a level-up too.
  assert.equal(shelves.xpBar({ level: 4, experience: 280, needed: 400 }, { level: 5, experience: 0, needed: 500 }, 120).levelUp, true);
  const step = shelves.xpBar({ level: 2, experience: 40, needed: 200 }, { level: 2, experience: 160, needed: 200 }, 120);
  assert.deepEqual(plain(step), { level: 2, from: 0.2, to: 0.8, levelUp: false, caption: '+120 XP' });
  assert.doesNotMatch(step.caption, /%/);
  assert.equal(shelves.xpBar(undefined, undefined, 10), null);
});

test('round 4: claim-all reveals chain (each starts where the last ended)', () => {
  const a = shelves.xpBar({ level: 2, experience: 40, needed: 200 }, { level: 2, experience: 160, needed: 200 }, 120);
  const b = shelves.xpBar({ level: 2, experience: 160, needed: 200 }, { level: 3, experience: 120, needed: 300 }, 160);
  assert.equal(a.to, 0.8);
  assert.equal(b.levelUp, true);
  assert.equal(b.level, 3);
});

test('round 4: a set reward survives an early close (queued once, dropped once)', () => {
  let q = [];
  q = shelves.queueReveal(q, { slug: 'pumpkin-patch' });
  q = shelves.queueReveal(q, { slug: 'pumpkin-patch' });
  assert.equal(q.length, 1, 'never twice');
  q = shelves.queueReveal(q, { slug: 'snow-day' });
  assert.deepEqual(plain(q.map(r => r.slug)), ['pumpkin-patch', 'snow-day']);
  assert.deepEqual(plain(shelves.dropReveal(q, 'pumpkin-patch').map(r => r.slug)), ['snow-day']);
});

test('round 4: claim all with one failed claim keeps that set on the card', () => {
  const sets = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
  const out = shelves.settleClaims(sets, [{ xp: 1 }, null, { xp: 2 }]);
  assert.deepEqual(plain(out.won.map(w => w.set.slug)), ['a', 'c']);
  assert.deepEqual(plain(out.failed.map(s => s.slug)), ['b']);
});

test('round 4: never say "you weren\'t charged" without checking', () => {
  assert.equal(shelves.afterBuyError(1000, 200, { coins: 800, owns: false }), 'bought');
  assert.equal(shelves.afterBuyError(1000, 200, { coins: 1000, owns: true }), 'bought');
  assert.equal(shelves.afterBuyError(1000, 200, { coins: 1000, owns: false }), 'not_charged');
  assert.equal(shelves.afterBuyError(1000, 200, null), 'unknown');
  assert.equal(shelves.afterBuyError(1000, 200, { coins: 950, owns: false }), 'unknown');
});

test('round 4: wear failure has its own message and retry, never a buy', () => {
  const base = { owned: true, worn: false, vipLocked: false, short: 0, phase: 'bought', wear: 'idle', finishes: false, cost: 200 };
  assert.deepEqual(plain(shelves.tryOnCta(base)), { label: 'Wear it now', action: 'wear', note: null });
  const failed = shelves.tryOnCta({ ...base, wear: 'failed' });
  assert.equal(failed.action, 'wear');
  assert.doesNotMatch(failed.note, /charged/);
  assert.equal(shelves.tryOnCta({ ...base, worn: true }).label, 'Wearing it');
  const idle = { ...base, owned: false, phase: 'idle', wear: 'idle' };
  assert.equal(shelves.tryOnCta(idle).label, 'Buy for 200');
  assert.equal(shelves.tryOnCta({ ...idle, finishes: true }).label, 'Complete the look: 200');
  assert.equal(shelves.tryOnCta({ ...idle, phase: 'confirm' }).action, 'buy');
  assert.equal(shelves.tryOnCta({ ...idle, short: 120 }).label, 'Need 120 more coins');
  assert.equal(shelves.tryOnCta({ ...idle, phase: 'unknown' }).action, 'retry_buy');
});
