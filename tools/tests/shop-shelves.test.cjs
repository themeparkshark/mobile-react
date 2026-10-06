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

test('daily stays calm to the end: no countdown, never red', () => {
  const daily = { type: 'daily', ends_at: '2026-10-21T00:00:00-07:00' };
  assert.deepEqual(plain(shelves.dailyPill(daily, now)), { label: 'New stuff tonight', urgent: false, a11y: 'New items arrive tonight' });
  const late = shelves.dailyPill(daily, Date.parse('2026-10-20T23:18:00-07:00'));
  assert.equal(late.label, 'New stuff tonight');
  assert.equal(late.urgent, false);
  assert.equal(shelves.dailyPill(daily, Date.parse('2026-10-21T00:00:01-07:00')).label, 'New stuff now');
});

test('featured names the day it changes, in the shop timezone', () => {
  const featured = { type: 'featured', ends_at: '2026-10-26T00:00:00-07:00' };
  assert.equal(shelves.featuredPill(featured, now).label, 'New on Monday');
  assert.equal(shelves.featuredPill(featured, Date.parse('2026-10-25T09:00:00-07:00')).label, 'New tonight');
  // On flip day itself (a whole week away), never today's own weekday: a kid reads that as today.
  assert.equal(shelves.featuredPill(featured, Date.parse('2026-10-19T06:52:00-07:00')).label, 'New in 7 days');
});

test('events carry two honest timers: next drop and the end date', () => {
  const halloween = { type: 'event', ends_at: '2026-10-23T00:00:00-07:00', event_ends_at: '2026-11-02T00:00:00-08:00',
    event_last_day: '2026-11-01', last_chance: false, final_shelf: false };
  assert.equal(shelves.eventDropPill(halloween, now).label, 'New items in 3 days');
  assert.equal(shelves.eventDropPill(halloween, Date.parse('2026-10-21T10:00:00-07:00')).label, 'New items in 2 days');
  assert.equal(shelves.eventDropPill(halloween, Date.parse('2026-10-22T10:00:00-07:00')).label, 'New items tonight');
  assert.equal(shelves.eventEndPill(halloween, now).label, 'Ends Nov 1');
  assert.equal(shelves.eventEndPill(halloween, now).urgent, false);
  const finale = { ...halloween, final_shelf: true, last_chance: true };
  assert.equal(shelves.eventDropPill(finale, now), null, 'no fake drop on the final shelf');
  assert.equal(shelves.eventEndPill(finale, Date.parse('2026-10-30T10:00:00-07:00')).label, 'Ends Nov 1');
  assert.equal(shelves.eventEndPill(finale, Date.parse('2026-11-01T18:30:00-08:00')).label, 'Ends today');
  assert.equal(shelves.eventEndPill(finale, Date.parse('2026-11-01T23:30:00-08:00')).urgent, false, 'never a red hurry');
});

test('LAST CHANCE only when true; otherwise the wave name', () => {
  assert.equal(shelves.eventKicker({ type: 'event', ends_at: '', last_chance: false, wave: { title: 'Pumpkin Patch Week' } }), 'PUMPKIN PATCH WEEK');
  assert.equal(shelves.eventKicker({ type: 'event', ends_at: '', last_chance: false, wave: { title: 'Halloween Finale Weekend' } }), 'HALLOWEEN FINALE WEEKEND', 'the server never sends last_chance now');
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

test('round 3: honest Favorites copy: one name for the heart, and it says where they went', () => {
  const where = 'See them in Favorites at the top of the shop.';
  assert.equal(shelves.wishSavedCopy(true), `Saved to Favorites! We’ll tell you when it’s in the shop. ${where}`);
  assert.equal(shelves.wishSavedCopy(false), `Saved to Favorites! ${where}`);
  assert.equal(shelves.wishSavedCopy(null), `Saved to Favorites! ${where}`);
  assert.equal(shelves.wishHintCopy(false, false), 'Tap the heart to save it to Favorites.');
  assert.match(shelves.wishHintCopy(true, false), /Favorites at the top of the shop/);
  assert.doesNotMatch(shelves.wishHintCopy(true, false), /tell you/, 'alerts off never promise a note');
});

test('round 3: calm last-chance copy names the season', () => {
  assert.equal(shelves.lastChanceLine('halloween'), 'It leaves soon. It comes back next Halloween.');
  assert.equal(shelves.lastChanceLine(null), 'It leaves soon. It comes back another time.');
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
  assert.deepEqual(plain(shelves.tryOnCta(base)), { label: 'Wear it now', action: 'wear', note: null, look: 'go' });
  const failed = shelves.tryOnCta({ ...base, wear: 'failed' });
  assert.equal(failed.action, 'wear');
  assert.doesNotMatch(failed.note, /charged/);
  assert.equal(shelves.tryOnCta({ ...base, worn: true }).label, 'Wearing it');
  const idle = { ...base, owned: false, phase: 'idle', wear: 'idle' };
  assert.equal(shelves.tryOnCta(idle).label, 'Buy for 200');
  assert.equal(shelves.tryOnCta({ ...idle, finishes: true }).label, 'Complete the look: 200');
  assert.equal(shelves.tryOnCta({ ...idle, phase: 'confirm' }).action, 'buy');
  assert.equal(shelves.tryOnCta({ ...idle, short: 120 }).label, 'Need 120 more coins');
  assert.equal(shelves.tryOnCta({ ...idle, phase: 'unknown' }).action, 'recheck');
});

test('round 5: the shark never floats (tail on the plinth for hero, try-on and reveal)', () => {
  // Hero (portrait), try-on (wide), reveal (square), on small and large phones.
  for (const [w, h] of [[233, 282], [250, 320], [347, 280], [374, 300], [335, 335], [362, 362]]) {
    const card = shelves.stageCard(w, h);
    assert.ok(Math.abs(card.tailY - card.plinthTopY) < 0.5, `${w}x${h}: tail ${card.tailY} vs plinth ${card.plinthTopY}`);
    assert.ok(card.box.top > -card.box.height * 0.1, `${w}x${h}: head in frame`);
    assert.ok(card.box.width <= w * 1.06, `${w}x${h}: not wider than the stage`);
  }
});

test('round 5: "Check again" never re-buys', () => {
  const unknown = shelves.tryOnCta({ owned: false, worn: false, vipLocked: false, short: 0, phase: 'unknown', wear: 'idle', finishes: false, cost: 200 });
  assert.equal(unknown.label, 'Check again');
  assert.equal(unknown.action, 'recheck');
  // Not charged after the check: back to the normal two-tap buy.
  assert.equal(shelves.afterBuyError(1000, 200, { coins: 1000, owns: false }), 'not_charged');
  const idle = shelves.tryOnCta({ owned: false, worn: false, vipLocked: false, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 200 });
  assert.equal(idle.action, 'ask');
});

// ---- Round 6 ----

const src = file => fs.readFileSync(path.join(root, file), 'utf8');
const base6 = { owned: false, worn: false, vipLocked: false, short: 0, phase: 'idle', wear: 'idle', finishes: false, cost: 200 };

test('round 6 B1: the first error confirmed not charged says so; Try again goes back to confirm', () => {
  // settleUnknown('buy') after the purchase request errored and the check found coins untouched.
  const outcome = shelves.afterBuyError(1000, 200, { coins: 1000, owns: false });
  assert.equal(shelves.settleBuyError(outcome, 'buy'), 'failed');
  const failed = shelves.tryOnCta({ ...base6, phase: 'failed' });
  assert.equal(failed.label, 'Try again');
  assert.match(failed.note, /You still have all your coins/, 'coins, not real-money words');
  assert.equal(failed.action, 'ask', 'Try again returns to the confirm step, never a direct buy');
  // Only the recheck path returns quietly to idle.
  assert.equal(shelves.settleBuyError(outcome, 'recheck'), 'idle');
  assert.equal(shelves.settleBuyError('unknown', 'buy'), 'unknown');
  assert.equal(shelves.settleBuyError('unknown', 'recheck'), 'unknown');
  assert.equal(shelves.settleBuyError('bought', 'recheck'), 'bought');
  // No state of the try-on buys without a confirm first.
  for (const phase of ['idle', 'failed', 'unknown', 'checking', 'buying', 'landing', 'bought']) {
    assert.notEqual(shelves.tryOnCta({ ...base6, phase }).action, 'buy', phase);
  }
  assert.equal(shelves.tryOnCta({ ...base6, phase: 'confirm' }).action, 'buy');
  assert.equal(src('src/screens/StoreScreen/TryOnSheet.tsx').includes('retry_buy'), false);
});

test('round 6 S2: Checking is its own state and never says "Yes, buy it!"', () => {
  const checking = shelves.tryOnCta({ ...base6, phase: 'checking' });
  assert.equal(checking.label, 'Checking…');
  assert.equal(checking.action, 'none');
  assert.equal(checking.look, 'checking', 'the muted face, pulsing: busy, never tappable');
  for (const extra of [{}, { short: 50 }, { paused: true }, { finishes: true }]) {
    assert.equal(shelves.tryOnCta({ ...base6, ...extra, phase: 'checking' }).label, 'Checking…');
  }
  // The try-on passes its real phase (no mapping of checking onto buying).
  assert.equal(/busyPhase/.test(src('src/screens/StoreScreen/TryOnSheet.tsx')), false);
});

test('round 6 S3: while landing, server ownership is ignored and the row holds still', () => {
  const buying = shelves.tryOnLayout({ phase: 'buying', serverOwned: false, startBought: false, vipLocked: false });
  for (const serverOwned of [false, true]) {
    const landing = shelves.tryOnLayout({ phase: 'landing', serverOwned, startBought: false, vipLocked: false });
    assert.deepEqual(plain(landing), plain(buying), `landing (server owned: ${serverOwned}) matches buying`);
    assert.equal(landing.showWish, false, 'the wish heart never pops back mid-landing');
  }
  assert.equal(shelves.tryOnLayout({ phase: 'checking', serverOwned: true, startBought: false, vipLocked: false }).owned, false);
  const bought = shelves.tryOnLayout({ phase: 'bought', serverOwned: true, startBought: false, vipLocked: false });
  assert.equal(bought.owned, true);
  assert.equal(bought.secondary, 'keep_shopping');
  const idle = shelves.tryOnLayout({ phase: 'idle', serverOwned: false, startBought: false, vipLocked: false });
  assert.equal(idle.showWish, true);
  assert.equal(shelves.tryOnLayout({ phase: 'idle', serverOwned: true, startBought: false, vipLocked: false }).owned, true);
  // Not now is shown but inert while the buy is in flight.
  assert.equal(buying.secondary, 'not_now');
  assert.equal(buying.secondaryEnabled, false);
  assert.equal(shelves.tryOnLayout({ phase: 'confirm', serverOwned: false, startBought: false, vipLocked: false }).secondaryEnabled, true);
});

// Width of a string in the Shark display font, straight from the TTF (cmap format 4 + hmtx).
function sharkFontWidths() {
  const buf = fs.readFileSync(path.join(root, 'assets/fonts/shark-random-funnyness-2.ttf'));
  const tables = {};
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) {
    const r = 12 + i * 16;
    tables[buf.toString('ascii', r, r + 4)] = buf.readUInt32BE(r + 8);
  }
  const upm = buf.readUInt16BE(tables.head + 18);
  const numH = buf.readUInt16BE(tables.hhea + 34);
  const cmap = tables.cmap;
  let sub = null;
  for (let i = 0, n = buf.readUInt16BE(cmap + 2); i < n; i++) {
    const r = cmap + 4 + i * 8;
    const off = cmap + buf.readUInt32BE(r + 4);
    if (buf.readUInt16BE(off) === 4) { sub = off; break; }
  }
  const seg = buf.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ranges = deltas + seg * 2;
  const glyph = code => {
    for (let i = 0; i < seg; i++) {
      if (code > buf.readUInt16BE(ends + i * 2)) continue;
      const start = buf.readUInt16BE(starts + i * 2);
      if (code < start) return 0;
      const delta = buf.readInt16BE(deltas + i * 2);
      const ro = buf.readUInt16BE(ranges + i * 2);
      if (!ro) return (code + delta) & 0xffff;
      const g = buf.readUInt16BE(ranges + i * 2 + ro + (code - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const advance = g => buf.readUInt16BE(tables.hmtx + Math.min(g, numH - 1) * 4);
  return { upm, advance: code => advance(glyph(code)) };
}

test('round 6: the layout font table is the real Shark TTF', () => {
  const font = sharkFontWidths();
  assert.equal(font.upm, 1000);
  for (const text of ["THIS WEEK'S STAR", 'New on Wednesday', 'UNCOMMON', 'SET', 'Legendary 1,250']) {
    const real = [...text].reduce((a, ch) => a + font.advance(ch.codePointAt(0)), 0) * 13 / 1000;
    assert.ok(Math.abs(shelves.displayTextWidth(text, 13) - real) < 0.01, text);
  }
});

// The pill labels the hero can show (Featured): every weekday, tonight, now.
const heroPills = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => `New on ${d}`).concat(['New tonight', 'New now']);

test('round 6 S1: hero kicker row and a 2-line name fit at 320, 375 and 390 pt', () => {
  const art = shelves.SHARK_ART;
  for (const w of [320, 375, 390]) {
    const L = shelves.heroLayout(w);
    for (const pill of heroPills) assert.ok(shelves.heroKickerFits(w, pill), `${w}pt: kicker + "${pill}"`);
    for (const owned of [false, true]) {
      const need = shelves.heroTextNeed({ nameLines: 2, nameLine: L.nameLine, set: true, pieces: true, owned });
      assert.ok(need <= L.textH, `${w}pt: text column needs ${need}, has ${L.textH} (owned ${owned})`);
    }
    // The text column ends before the shark's art starts (the name never sits on the shark).
    const card = L.card;
    const sharkLeft = L.stage.left + card.box.left + art.leftEdge * card.box.width;
    assert.ok(shelves.HERO.pad + L.textW <= sharkLeft, `${w}pt: text ends ${shelves.HERO.pad + L.textW}, shark starts ${sharkLeft}`);
    assert.ok(Math.abs(card.tailY - card.plinthTopY) < 0.5, `${w}pt: hero tail on the plinth`);
    assert.ok(card.box.width <= L.stage.width, `${w}pt: hero shark inside its stage`);
    // Everything in the column fits its width: the CTA pills, the chips, and price plus rarity (or a dot).
    for (const label of ['TRY IT ON', 'WEAR IT']) assert.ok(shelves.heroCtaWidth(label) <= L.textW, `${w}pt: ${label}`);
    const chips = shelves.heroChips(5, L.chips);
    const chipRow = (chips.shown + (chips.more ? 1 : 0)) * 36 + (chips.shown + (chips.more ? 1 : 0) - 1) * 6;
    assert.ok(chipRow <= L.textW, `${w}pt: piece chips ${chipRow} in ${L.textW}`);
    for (const label of ['UNCOMMON', 'RARE', 'EPIC']) {
      const mode = shelves.heroPriceRow(L.textW, '1,250', label);
      const row = 18 + 4 + shelves.displayTextWidth('1,250', 18) + (mode === 'inline' ? 4 + 14 + shelves.displayTextWidth(label, 12, 0.5) + 3 : 4 + 14);
      assert.ok(row <= L.textW, `${w}pt: price row ${label} (${mode})`);
    }
    // A 2-line name wraps inside the column at the column's name size (never 3 lines for these).
    for (const name of ['Purple Witch Hat', 'Castle Rainbow T-Shirt', 'Black Jurassic Shark Shirt']) {
      const words = name.split(' ');
      let lines = 1, line = '';
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (shelves.displayTextWidth(next, L.nameSize) > L.textW && line) { lines++; line = word; } else line = next;
      }
      assert.ok(lines <= 3, `${w}pt: ${name} takes ${lines} lines`);
    }
    // The stage sits under the kicker row, so the pill can never cover the hat.
    assert.equal(L.stage.top, shelves.HERO.kickerH);
    assert.ok(card.hatY >= 0, `${w}pt: hat inside the hero stage`);
  }
  const shelvesSrc = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(shelvesSrc, /heroLayout\(SCREEN_W\)/, 'ShopShelves draws from the tested layout');
  assert.match(shelvesSrc, /styles\.heroKickerRow[\s\S]{0,200}SectionPills/, 'the pill lives in the kicker row');
});

test('round 6 S4: the chip band is decided from the measured tile width, and never overflows', () => {
  for (const screen of [320, 375, 390, 430]) {
    const tile = Math.floor((screen - 2 * (10 + 3 + 8) - 12 * 2) / 3);
    for (const width of [tile, Math.min(124, tile + 8)]) {
      for (const label of ['COMMON', 'UNCOMMON', 'RARE', 'EPIC']) {
        const band = shelves.tileBand(width, label, true);
        const inner = width - shelves.TILE_BAND.tileChrome;
        const rarity = shelves.displayTextWidth(label, 12, 0.4) + 10;
        const set = 12 + 2 + shelves.displayTextWidth('SET', 12) + 13;
        if (band === 'full') assert.ok(rarity + 4 + set <= inner, `${width}pt ${label}`);
        else assert.ok(rarity + 4 + set > inner, `${width}pt ${label} shows a dot only when it must`);
        assert.equal(shelves.tileBand(width, label, false), 'full', 'no SET chip: the word always shows');
      }
    }
  }
  // A wide tile keeps the word even with SET (no fixed 120pt cutoff).
  assert.equal(shelves.tileBand(130, 'RARE', true), 'full');
  assert.equal(shelves.tileBand(118, 'EPIC', true), 'full');
  assert.equal(shelves.tileBand(84, 'UNCOMMON', true), 'dot');
  const tileSrc = src('src/screens/StoreScreen/ShopTile.tsx');
  assert.equal(/width < 120/.test(tileSrc), false);
  assert.match(tileSrc, /onLayout/);
  assert.match(tileSrc, /badge\.label \? `, \$\{badge\.label\.toLowerCase\(\)\}`/, 'rarity is in the tile a11y label');
});

test('round 6 S5: fallback polls every 15 to 30 s and Buy shows "Opening soon"', () => {
  assert.equal(shelves.fallbackPollMs(0), 15_000);
  assert.equal(shelves.fallbackPollMs(1), 30_000);
  assert.equal(shelves.fallbackPollMs(5), 30_000);
  for (const phase of ['idle', 'confirm']) {
    const paused = shelves.tryOnCta({ ...base6, phase, paused: true });
    assert.equal(paused.label, 'Opening soon');
    assert.equal(paused.look, 'paused');
    assert.equal(paused.action, 'none');
  }
  // A buy already in flight is never relabelled; owned and wear states are untouched.
  assert.equal(shelves.tryOnCta({ ...base6, phase: 'buying', paused: true }).label, 'Yes, buy it!');
  assert.equal(shelves.tryOnCta({ ...base6, owned: true, phase: 'bought', paused: true }).label, 'Wear it now');
  assert.match(src('src/screens/StoreScreen/ShopShelves.tsx'), /startFallbackPoll\(\{[\s\S]{0,700}fallbackPollMs/);
});

test('round 6 S6: a recovered set-completing buy queues the reveal, or says "Set complete!"', () => {
  const set = { slug: 'pumpkin-patch', name: 'Pumpkin Patch', title: 'Patch Boss', xp_reward: 160, item_ids: [1, 2, 3, 20], owned: 4, total: 4, reward_state: 'claimed' };
  assert.deepEqual(plain(shelves.recoveredSetOutcome(true, set)),
    { kind: 'reveal', reward: { slug: 'pumpkin-patch', name: 'Pumpkin Patch', title: 'Patch Boss', xp: 160, item_ids: [1, 2, 3, 20] } });
  assert.deepEqual(plain(shelves.recoveredSetOutcome(true, { ...set, reward_state: 'ready' })), { kind: 'ready' });
  assert.deepEqual(plain(shelves.recoveredSetOutcome(true, null)), { kind: 'toast' });
  assert.deepEqual(plain(shelves.recoveredSetOutcome(true, { ...set, owned: 3 })), { kind: 'toast' });
  assert.equal(shelves.recoveredSetOutcome(false, set), null);
  // The queued reveal then holds the try-on open for the landing beat.
  assert.equal(shelves.rewardPendingFor([{ reward: { slug: 'pumpkin-patch' } }], 'pumpkin-patch'), true);
  assert.equal(shelves.rewardPendingFor([{ reward: { slug: 'other' } }], 'pumpkin-patch'), false);
  assert.equal(shelves.rewardPendingFor([], null), false);
});

test('round 6: rewardPending holds the landing, then closes', () => {
  assert.equal(shelves.revealHoldMs(true, 0, false), null, 'not before the piece lands');
  assert.equal(shelves.revealHoldMs(true, 1, false), 1200);
  assert.equal(shelves.revealHoldMs(true, 1, true), 400);
  assert.equal(shelves.revealHoldMs(false, 1, false), null);
});

test('round 6: WEAR IT ALL is optimistic, rolls back with a message, and saves only what is missing', () => {
  let state = 'idle';
  state = shelves.wearAllNext(state, 'tap');
  assert.equal(state, 'done');
  assert.equal(shelves.wearAllCopy(state).wearing, true, 'NOW WEARING on tap');
  state = shelves.wearAllNext(state, 'fail');
  assert.equal(state, 'failed');
  const failed = shelves.wearAllCopy(state);
  assert.equal(failed.label, 'Try again');
  assert.match(failed.note, /Couldn’t put it all on/);
  assert.equal(failed.wearing, false, 'the optimistic NOW WEARING rolls back');
  assert.equal(shelves.wearAllNext('done', 'tap'), 'done', 'a second tap does nothing');
  assert.equal(shelves.wearAllNext('failed', 'tap'), 'done', 'Try again retries');
  assert.equal(shelves.wearAllCopy('idle').note, null);
  assert.deepEqual(plain(shelves.wearAllSlots([
    { id: 1, slot: 'head_item', worn: false }, { id: 2, slot: 'body_item', worn: true }, { id: 3, slot: null, worn: false },
  ])), { head_item: 1 });
  assert.match(src('src/screens/StoreScreen/SetCompleteReveal.tsx'), /allCopy\.note/);
});

test('round 6: inventory writes run one at a time, in order, even after a failure', async () => {
  const run = shelves.createSerialQueue();
  const log = [];
  let active = 0;
  const step = (name, ms, fail = false) => () => new Promise((resolve, reject) => {
    active++; assert.equal(active, 1, `${name} overlapped`); log.push(`start ${name}`);
    setTimeout(() => { active--; log.push(`end ${name}`); fail ? reject(new Error(name)) : resolve(name); }, ms);
  });
  const results = await Promise.allSettled([run(step('a', 20)), run(step('b', 5, true)), run(step('c', 1))]);
  assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled']);
  // Both shop write paths go through the one queue.
  for (const file of ['src/screens/StoreScreen/TryOnSheet.tsx', 'src/screens/StoreScreen/SetCompleteReveal.tsx']) {
    const code = src(file);
    assert.equal(/updateInventory\(/.test(code), false, `${file} writes through wearItem`);
    assert.match(code, /wearItem\(/);
  }
});

test('round 6: an empty shop day has copy, never a blank page', () => {
  assert.match(shelves.emptyShelvesCopy(false).body, /Pull down/);
  assert.match(shelves.emptyShelvesCopy(true).title, /opening/);
  assert.match(src('src/screens/StoreScreen/ShopShelves.tsx'), /emptyShelvesCopy\(today\.fallback\)/);
});

test('round 6: SVG gradient ids are unique per instance', () => {
  const ui = src('src/screens/StoreScreen/shopUi.tsx');
  const card = src('src/components/Playercard.tsx');
  assert.equal(/id="light"|url\(#light\)/.test(ui), false);
  assert.equal(/id="contact"|url\(#contact\)/.test(card), false);
  assert.match(ui, /useSvgId\('stage-light'\)/);
  assert.match(card, /contact-\$\{\+\+contactIds\}/);
});

// Decode an RGBA PNG with pngjs and measure the shark: tail tip (lowest opaque pixel), head top, left edge.
function measureShark() {
  const { PNG } = require(path.join(root, 'node_modules/pngjs'));
  const png = PNG.sync.read(fs.readFileSync(path.join(root, 'assets/images/screens/inventory/shark-colored-v2.png')));
  const { width, height, data } = png;
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] > 128;
  let tail = null, top = null, left = width;
  for (let y = height - 1; y >= 0 && !tail; y--) {
    const xs = []; for (let x = 0; x < width; x++) if (opaque(x, y)) xs.push(x);
    if (xs.length) tail = { y, x: (xs[0] + xs[xs.length - 1]) / 2 };
  }
  for (let y = 0; y < height && top == null; y++) for (let x = 0; x < width; x++) if (opaque(x, y)) { top = y; break; }
  for (let y = 0; y < height; y += 2) for (let x = 0; x < left; x++) if (opaque(x, y)) { left = x; break; }
  return { width, height, tail, top, left };
}

test('round 6: stage geometry is tied to the real shark PNG and the drawn plinth', () => {
  const m = measureShark();
  const art = shelves.SHARK_ART;
  assert.ok(Math.abs(art.aspect - m.width / m.height) < 0.002, 'aspect');
  assert.ok(Math.abs(art.tailY - m.tail.y / m.height) < 0.003, `tail y ${m.tail.y / m.height}`);
  assert.ok(Math.abs(art.tailX - m.tail.x / m.width) < 0.003, `tail x ${m.tail.x / m.width}`);
  assert.ok(Math.abs(art.headTop - m.top / m.height) < 0.003, `head top ${m.top / m.height}`);
  assert.ok(art.leftEdge <= m.left / m.width + 0.002, `left edge ${m.left / m.width}`);
  // The plinth constants match what ShopStage draws.
  const ui = src('src/screens/StoreScreen/shopUi.tsx');
  const wrap = /plinthWrap: \{[^}]*left: '(\d+)%', right: '(\d+)%', bottom: '(\d+)%', aspectRatio: (\d+) \/ (\d+)/.exec(ui);
  assert.ok(wrap, 'plinthWrap style found');
  assert.equal(Number(wrap[1]) / 100, shelves.PLINTH.side);
  assert.equal(Number(wrap[2]) / 100, shelves.PLINTH.side);
  assert.equal(Number(wrap[3]) / 100, shelves.PLINTH.bottom);
  assert.equal(Number(wrap[4]) / Number(wrap[5]), shelves.PLINTH.aspect);
  assert.match(ui, /viewBox="0 0 200 64"/);
  const face = /<Ellipse cx="100" cy="(\d+)" rx="94" ry="22" fill=\{PLINTH\[plinth\]\.top\}/.exec(ui);
  assert.match(ui, /house: \{ side: '#2b679e', line: '#123a63', band: '#3f84bf', top: '#d6ecfb' \}/, 'the house plinth keeps its colours');
  assert.ok(face, 'top face ellipse found');
  assert.equal(Number(face[1]) / 64, shelves.PLINTH.faceY);
});

test('round 6: hops never clip the head (tallest hats reach the paper frame top)', () => {
  // [stage w, stage h, lift] as the try-on (wide), reveal (square) and hero (no hop) compute them.
  const phones = [[320, 568], [375, 667], [375, 812], [390, 844], [430, 932]];
  for (const [W, H] of phones) {
    const sheetH = Math.min(H * 0.9, 780);
    const stageH = Math.round(Math.min(300, sheetH * (sheetH < 760 ? 0.34 : 0.38)));
    const tryOn = shelves.stageCard(W - 34, stageH - 6, 18 + 0.04 * (stageH / 2) + 4);
    const reveal = Math.min(W - 40, H * 0.4) - 8;
    const rev = shelves.stageCard(reveal, reveal, 24 + 6);
    for (const [name, card, hop] of [['try-on', tryOn, 18 + 0.04 * (stageH / 2)], ['reveal', rev, 24]]) {
      assert.ok(card.hatY - hop >= 0, `${W}x${H} ${name}: hat ${card.hatY.toFixed(1)} clears a ${hop.toFixed(1)}pt hop`);
      assert.ok(Math.abs(card.tailY - card.plinthTopY) < 0.5, `${W}x${H} ${name}: tail on the plinth`);
      assert.ok(card.box.height > (name === 'reveal' ? reveal : stageH) * 0.68, `${W}x${H} ${name}: shark still fills the stage`);
    }
  }
  assert.match(src('src/screens/StoreScreen/SetCompleteReveal.tsx'), /stageCard\(STAGE - 8, STAGE - 8, HOP \+ 6\)/);
  assert.match(src('src/screens/StoreScreen/TryOnSheet.tsx'), /stageCard\(SCREEN_W - 28 - 6, STAGE_H - 6, HOP \+ 0\.04 \* \(STAGE_H \/ 2\) \+ 4\)/);
});

test('round 6: shop surfaces are brand blue, never white, and every ink is AA', () => {
  const ui = src('src/screens/StoreScreen/shopUi.tsx');
  const block = /export const SHOP_SURFACE = \{([\s\S]*?)\} as const;/.exec(ui)[1];
  const color = key => new RegExp(`\\b${key}: '(#[0-9a-f]{6})'`, 'i').exec(block)[1];
  const lum = hex => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const surface of ['panel', 'card', 'well']) {
    assert.ok(lum(color(surface)) < 0.2, `${surface} is a blue, not a light surface`);
    for (const ink of ['ink', 'inkSoft', 'inkGold']) {
      assert.ok(contrast(color(ink), color(surface)) >= 4.5, `${ink} on ${surface}: ${contrast(color(ink), color(surface)).toFixed(2)}`);
    }
  }
  assert.ok(contrast('#ffffff', color('alert')) >= 4.5, 'white on the error note');
  // The shelves and both sheets read from it; none keeps a white or cream panel.
  for (const file of ['src/screens/StoreScreen/ShopShelves.tsx', 'src/screens/StoreScreen/TryOnSheet.tsx', 'src/screens/StoreScreen/WishlistSheet.tsx']) {
    const code = src(file);
    assert.match(code, /SHOP_SURFACE/, file);
    assert.equal(/rgba\(255,\s*255,\s*255,\s*0\.88\)|backgroundColor: BRAND\.cream|#fffdf4|#fffaf0/.test(code), false, `${file} has no white or cream panel`);
  }
});

test('round 6: copy never uses em dashes (new files too)', () => {
  for (const file of ['src/screens/StoreScreen/WishlistSheet.tsx', 'src/screens/StoreScreen/inventoryQueue.ts', 'src/components/Playercard.tsx']) {
    assert.equal(src(file).includes('—'), false, file);
  }
});

test('round 6 capture fix: the set reveal waits for the try-on modal to dismiss (iOS onDismiss, no idle timer)', () => {
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(code, /onClose=\{closeTryOn\}/);
  assert.match(code, /reveal && !open && revealGate/);
  const close = /const closeTryOn = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(code)[1];
  assert.ok(close.length < 40, 'closeTryOn only clears the sheet');
  assert.equal(/holdReveal/.test(close), false, 'no fixed hold after the try-on');
  assert.match(close, /setOpen\(null\);/);
  // The sheet hides its modal, then reports closed from onDismiss (with a guard and the Android path).
  assert.match(sheet, /<Modal visible=\{!leaving\}[^>]*onDismiss=\{finishClose\}/);
  assert.match(sheet, /Platform\.OS === 'ios' \? 200 : 0/);
  assert.equal(/runOnJS\(onClose\)/.test(sheet), false, 'every slide-out goes through leave()');
});

// ---- Round 6 pre-launch (panel SHIP fixes) ----

function fakeClock() {
  let now = 0; let id = 0; const timers = new Map();
  return {
    set: (fn, ms) => { const t = ++id; timers.set(t, { at: now + ms, fn }); return t; },
    clear: t => { timers.delete(t); },
    pending: () => timers.size,
    async advance(ms) {
      now += ms;
      for (const [t, { at, fn }] of [...timers]) if (at <= now) { timers.delete(t); fn(); }
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('pre-launch 1: fallback poll cancels cleanly, even with a refresh in flight', async () => {
  const clock = fakeClock();
  let resolve;
  let calls = 0;
  const stop = shelves.startFallbackPoll({
    refresh: () => { calls++; return new Promise(r => { resolve = r; }); },
    delayMs: () => 20_000, setTimer: clock.set, clearTimer: clock.clear,
  });
  assert.equal(clock.pending(), 1);
  await clock.advance(20_000);
  assert.equal(calls, 1, 'one request');
  stop(); // the kid leaves while the request is in flight
  resolve('miss');
  await clock.advance(0);
  assert.equal(clock.pending(), 0, 'nothing re-arms after cancel');
  await clock.advance(120_000);
  assert.equal(calls, 1);
});

test('pre-launch 1: fallback poll stops after repeated misses, and at once on a 404', async () => {
  const clock = fakeClock();
  const stops = [];
  let calls = 0;
  shelves.startFallbackPoll({ refresh: async () => { calls++; return 'miss'; }, delayMs: () => 15_000, maxMisses: 3,
    onStop: why => stops.push(why), setTimer: clock.set, clearTimer: clock.clear });
  for (let i = 0; i < 6; i++) await clock.advance(15_000);
  assert.equal(calls, 3);
  assert.deepEqual(stops, ['misses']);
  assert.equal(clock.pending(), 0);

  const gone = fakeClock();
  const why = [];
  let n = 0;
  shelves.startFallbackPoll({ refresh: async () => { n++; return 'gone'; }, delayMs: () => 15_000,
    onStop: w => why.push(w), setTimer: gone.set, clearTimer: gone.clear });
  for (let i = 0; i < 4; i++) await gone.advance(15_000);
  assert.equal(n, 1, 'the kill switch stops it after one answer');
  assert.deepEqual(why, ['gone']);

  // A good answer resets the miss count; a thrown error counts as a miss.
  const mixed = fakeClock();
  const answers = ['miss', 'miss', 'ok', 'miss', 'miss'];
  let k = 0; const ended = [];
  shelves.startFallbackPoll({ refresh: () => (k === 4 ? (k++, Promise.reject(new Error('net'))) : Promise.resolve(answers[k++] ?? 'miss')),
    delayMs: () => 1000, maxMisses: 3, onStop: w => ended.push(w), setTimer: mixed.set, clearTimer: mixed.clear });
  for (let i = 0; i < 10; i++) await mixed.advance(1000);
  assert.equal(k, 6, 'miss, miss, ok (reset), miss, error, miss: stops on the third miss in a row');
  assert.deepEqual(ended, ['misses']);
});

test('pre-launch 1: polling pauses off screen and in the background', () => {
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(code, /useIsFocused\(\)/);
  assert.match(code, /AppState\.addEventListener\('change'/);
  assert.match(code, /const awake = focused && appActive;/);
  assert.match(code, /if \(!today\.fallback \|\| !awake \|\| pollStopped\) return;/);
  assert.match(code, /if \(!fresh\) return 'gone';/, 'a 404 (null) stops the poll');
  // The reset reload is cancelled on cleanup and capped too.
  assert.match(code, /if \(!ok && !cancelled && attempt < 8\)/);
  assert.equal(/\.finally\(poll\)/.test(code), false, 'the leaking self re-arm is gone');
});

test('pre-launch 2: shelf jump bar highlights the shelf under the bar', () => {
  const tops = [0, 420, 1100, 1700];
  assert.equal(shelves.activeShelf(tops, 0), 0);
  assert.equal(shelves.activeShelf(tops, 395), 0);
  assert.equal(shelves.activeShelf(tops, 400), 1);
  assert.equal(shelves.activeShelf(tops, 1200), 2);
  assert.equal(shelves.activeShelf(tops, 9000), 3);
  assert.equal(shelves.activeShelf([], 300), 0);
  // At the end of the scroll the last (short) shelf is highlighted even if its top can't reach the bar.
  assert.equal(shelves.activeShelf(tops, 1500, 24, 1500), 3);
  assert.equal(shelves.activeShelf(tops, 1200, 24, 1500), 2);
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  // Alex-style icons from the UI kit only, one chip per shelf, sticky above the scroll.
  const names = require('node:fs').readFileSync(path.join(root, 'src/ui/iconNames.ts'), 'utf8');
  for (const icon of ['star', 'crown', 'timer']) {
    assert.match(code, new RegExp(`icon: '${icon}' as const`));
    assert.match(names, new RegExp(`'${icon}'`), `${icon} is a UI kit icon`);
  }
  for (const icon of ['streak', 'gift', 'sparkle', 'heart', 'ride', 'medal1', 'star', 'dice']) assert.match(names, new RegExp(`'${icon}'`), `${icon} is a UI kit icon`);
  // (The Secret Shop's four short shelves have no jump bar; the Shark Shop always does.)
  assert.match(code, /\{!secret && <JumpBar chips=\{chips\} tops=\{tops\} scrollY=\{shelfY\} maxY=\{maxY\} onJump=\{jump\} \/>\}\s*<View style=\{\{ flex: 1 \}\}>\s*<Animated\.ScrollView ref=\{scrollRef\}/);
  assert.match(code, /accessibilityLabel=\{`Jump to \$\{chip\.label\}`\}/);
  for (const key of ['hero', 'featured', 'daily']) assert.match(code, new RegExp(`onLayout=\\{measure\\('${key}'\\)\\}`));
});

test('pre-launch 3 and 4: the hero is house blue, and a fallback day hides the next-week placeholder', () => {
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(code, /<LinearGradient colors=\{\[\.\.\.NIGHT_SKY\]\} style=\{StyleSheet\.absoluteFill\} \/>/, 'the card is the night stage blue, so the stage has no seam');
  // The Secret Shop's Vault paints its own night sky on its stage (VaultHero).
  // No sky box of its own: the vault panel's navy runs behind the stage, so nothing ends on a straight line.
  assert.match(code, /tone="night" sky=\{false\} rays=\{SECRET_THEME\.inkGold\} still=\{still\}/);
  const sky = /NIGHT_SKY = \['(#[0-9a-f]{6})', '(#[0-9a-f]{6})'\]/i.exec(src('src/screens/StoreScreen/shopUi.tsx'));
  const lum = hex => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { const q = v / 255; return q <= 0.03928 ? q / 12.92 : ((q + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const bg of [sky[1], sky[2]]) for (const ink of ['#ffffff', '#e2f6ff', '#ffe07a']) {
    assert.ok((lum(ink) + 0.05) / (lum(bg) + 0.05) >= 4.5, `${ink} on ${bg}`);
  }
  assert.match(code, /tone="night"/);
  assert.equal(/'#dff3ff', '#9fd6f8'/.test(code), false, 'no pale hero gradient');
  assert.match(code, /heroName: \{[^}]*color: S\.ink \}/);
  assert.match(code, /heroKicker: \{[^}]*color: S\.inkGold/);
  assert.match(code, /const heroTease = !today\.fallback && \(today\.next_featured\?\.title \|\| today\.next_featured\?\.set_name\) \? today\.next_featured : null;/);
  assert.match(code, /tease=\{heroTease\}/);
});

test('pre-launch 6: Checking uses the muted face', () => {
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  assert.match(sheet, /muted=\{cta\.look === 'paused' \|\| cta\.look === 'checking'\}/);
  assert.match(sheet, /disabled=\{hold \|\| wear === 'spinning' \|\| cta\.look === 'paused' \|\| cta\.look === 'checking'\}/);
});

test('pre-launch 5: the buy hand-off bridges into the reveal on navy (no idle shelf)', () => {
  const shelvesCode = src('src/screens/StoreScreen/ShopShelves.tsx');
  const sheet = src('src/screens/StoreScreen/TryOnSheet.tsx');
  const reveal = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(sheet, /if \(rewardPendingRef\.current\) dusk\.value = withTiming\(1/);
  assert.match(sheet, /backgroundColor: REVEAL_NAVY \}, duskStyle\]/);
  assert.match(shelvesCode, /\{handoff && <View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: REVEAL_NAVY \}\]\} \/>\}/);
  assert.match(shelvesCode, /onShown=\{revealShown\}/);
  assert.match(shelvesCode, /const revealShown = useCallback\(\(\) => \{[^}]*coverHandoff\(false\);/);
  // The cover goes up as the sheet starts to hide (not after it is gone).
  assert.match(sheet, /onLeavingRef\.current\?\.\(\);\s*setLeaving\(true\);/);
  assert.match(shelvesCode, /onLeaving=\{leavingTryOn\}/);
  assert.match(shelvesCode, /setTimeout\(\(\) => coverHandoff\(false\), 1500\)/, 'the cover can never stick');
  assert.match(reveal, /onShow=\{onShown\}/);
  assert.match(reveal, /backgroundColor: REVEAL_NAVY/);
});

test('Reduce Motion: shop modals mount with no entering animation (a skipped one left the try-on invisible and blocking taps)', () => {
  for (const file of ['src/screens/StoreScreen/TryOnSheet.tsx', 'src/screens/StoreScreen/WishlistSheet.tsx', 'src/screens/StoreScreen/SetCompleteReveal.tsx']) {
    const code = src(file);
    for (const m of code.matchAll(/entering=\{([^}]*)\}/g)) {
      assert.match(m[1], /^still( \|\| \w+)? \? undefined :|^undefined$/, `${file}: ${m[1]}`);
    }
  }
});

// ---- Final-check polish ----

test('polish 1: event chips get distinct themed icons and their banner tint', () => {
  const two = shelves.eventChips([
    { key: 'event:halloween', event_key: 'halloween', art_url: 'http://x/shop-events/halloween.webp', color: '#ff7a00' },
    { key: 'event:park_birthday_october', event_key: 'park_birthday_october', art_url: 'http://x/shop-events/park_birthday.webp', color: '#1565c0' },
  ]);
  assert.equal(two[0].icon, 'streak');
  assert.equal(two[1].icon, 'gift');
  assert.notEqual(two[0].icon, two[1].icon);
  assert.equal(two[1].fill, shelves.EVENT_ART_TINT.park_birthday, 'the Park Birthday chip is pink like its art, not the blue accent');
  assert.equal(two[1].ring, '#1565c0');
  // Two events that would share an icon get different ones; no art falls back to the event colour.
  const same = shelves.eventChips([{ key: 'event:new_year', event_key: 'new_year', color: '#7c4dff' }, { key: 'event:july_4th', event_key: 'july_4th', color: '#d32f2f' }]);
  assert.notEqual(same[0].icon, same[1].icon);
  assert.equal(same[0].fill, '#7c4dff');
  // Every art tint is a real banner file.
  assert.equal(Object.keys(shelves.EVENT_ART_TINT).length, 15);
});

test('polish 2: the hero stage paints no sky of its own (no seam)', () => {
  assert.match(src('src/screens/StoreScreen/ShopShelves.tsx'), /tone="night" sky=\{false\}/);
  assert.match(src('src/screens/StoreScreen/shopUi.tsx'), /\) : paintSky \? \(/);
});

test('polish 3: the hand-off covers the whole screen, the reveal shows at once, and a dropped reveal remounts', () => {
  const screen = src('src/screens/StoreScreen.tsx');
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  const reveal = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  assert.match(screen, /onHandoff=\{setShopHandoff\}/);
  assert.match(screen, /\{shopHandoff && <View pointerEvents="none" style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: REVEAL_NAVY, zIndex: 50 \}\]\} \/>\}/);
  assert.match(code, /bridged=\{handoff\}/);
  assert.match(code, /const coverHandoff = useCallback\(\(on: boolean\) => \{ setHandoff\(on\); handoffRef\.current\?\.\(on\); \}/, 'both covers flip in one tick');
  assert.match(reveal, /entering=\{still \|\| bridged \? undefined : FadeIn\.duration\(260\)\}/);
  assert.match(code, /if \(shownRef\.current !== revealSlug\) holdReveal\(\); \}, 1200\)/, 'watchdog remounts a reveal iOS dropped');
});

test('polish 4: the active chip scales in a fixed box (the row never shifts)', () => {
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(code, /jumpSlot: \{ width: 50, height: 50/);
  const on = /jumpChipOn: \{([^}]*\}[^}]*)\}/.exec(code)[1];
  assert.equal(/width|height/.test(on), false, 'no size change on the active chip');
  assert.match(on, /scale: 1\.14/);
});

test('polish 5: after polling stops the banner says pull down; buying stays paused; a pull restarts it', async () => {
  assert.match(shelves.fallbackBannerCopy(true), /Pull down to try again/);
  assert.match(shelves.fallbackBannerCopy(false), /Back in a moment/);
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.match(code, /fallbackBannerCopy\(pollStopped\)/);
  assert.match(code, /buyPaused=\{!!today\.fallback\}/);
  assert.match(code, /setPollStopped\(false\);\s*try \{ await onRefresh\(\); \}/);
  // A late answer after cancel is ignored (alive() is false).
  const clock = fakeClock();
  let resolve; let aliveSeen = null;
  const stop = shelves.startFallbackPoll({ refresh: alive => new Promise(r => { resolve = () => { aliveSeen = alive(); r('ok'); }; }),
    delayMs: () => 1000, setTimer: clock.set, clearTimer: clock.clear });
  await clock.advance(1000);
  stop();
  resolve();
  await clock.advance(0);
  assert.equal(aliveSeen, false);
  assert.match(code, /if \(alive\(\)\) setToday\(fresh\);/);
});

test('polish 6: a chip change re-renders the jump bar only', () => {
  const code = src('src/screens/StoreScreen/ShopShelves.tsx');
  assert.equal(/activeChip/.test(code), false, 'no highlight state in the shelves');
  assert.match(code, /const JumpBar = memo\(function JumpBar[\s\S]{0,400}const \[active, setActive\] = useState\(0\);/);
  assert.match(code, /const chips: ShelfChip\[\] = useMemo\(/);
});

test('polish 7: confetti bursts from behind the reward title', () => {
  const reveal = src('src/screens/StoreScreen/SetCompleteReveal.tsx');
  const confetti = reveal.indexOf('<Confetti color');
  const plate = reveal.indexOf('<View style={styles.plateWrap}>');
  const contentEnd = reveal.indexOf('{/* Inside the content');
  assert.ok(contentEnd > 0 && confetti > contentEnd && confetti < plate, 'confetti renders before (under) the plate, inside the content');
  assert.equal((reveal.match(/<Confetti color/g) ?? []).length, 1);
});
