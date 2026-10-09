/**
 * Clarity pass (Oct 2026): every player-facing line in the app is held to the
 * glossary and the plain-words rules in tools/clarity/rules.cjs.
 *
 * - One name per thing (coins, tickets, energy, XP, VIP, closet, grown-up...).
 * - No jargon a 10-year-old wouldn't know (rotation, catalog edition, fx,
 *   allocation, verified, eligible, tier, perk...).
 * - No pressure or guilt (hurry, last chance, only N left...).
 * - Buying always says what you pay, what you get, and if it is real money.
 *
 * The full standard and the glossary are in
 * tps-prime-time-audit/next-wave/clarity/AUDIT.md.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { plain } = require('./helpers/plain.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { extractFile, extractSource, isDevFile } = require('../clarity/extract.cjs');
const rules = require('../clarity/rules.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name).split(path.sep).join('/');
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(tsx?|json)$/.test(name)) out.push(rel);
  }
  return out;
}

/**
 * Lines in files another branch is rewriting right now (Secret Shop and
 * catalogs). Their owners apply the AUDIT.md copy spec; each entry must still
 * exist (a stale entry fails), so the list shrinks to zero as they land.
 */
const PENDING = [
  { file: 'src/screens/ProfileScreen.tsx', text: 'VIP members only. Opens VIP membership', spec: 'AUDIT.md S1' },
  { file: 'src/screens/StoreScreen/TryOnSheet.tsx', text: '{x} Shark Coins', spec: 'AUDIT.md S5' },
  { file: 'src/screens/StoreScreen/ShopShelves.tsx', text: '{cost)} Shark Coins. Tap to try it on.', spec: 'AUDIT.md S5' },
  // Unreachable since the server stopped sending section last_chance (clarity-pass-be); the line goes with S8.
  { file: 'src/helpers/shopShelves.ts', text: 'LAST CHANCE', spec: 'AUDIT.md S8' },
  // claude/cp-catalogs already replaces this ribbon with a calm navy LEAVING tag.
  { file: 'src/screens/StoreScreen/ShopTile.tsx', text: 'LAST CHANCE', spec: 'AUDIT.md S11' },
];

test('every player line follows the glossary and has no jargon or pressure words', () => {
  const problems = [];
  const pendingSeen = new Set();
  for (const file of walk('src')) {
    if (isDevFile(file)) continue;
    for (const row of extractFile(path.join(root, file), file, true)) {
      const bad = rules.hardViolations(row.text);
      if (!bad.length) continue;
      const pending = PENDING.find(p => p.file === file && p.text === row.text);
      if (pending) { pendingSeen.add(pending); continue; }
      problems.push(`${file}:${row.line} [${bad.join(', ')}] ${row.text}`);
    }
  }
  assert.deepEqual(problems, [], `Plain words only (see tools/clarity/rules.cjs):\n${problems.join('\n')}`);
  const stale = PENDING.filter(p => !pendingSeen.has(p)).map(p => `${p.file}: ${p.text}`);
  assert.deepEqual(stale, [], 'fixed upstream: remove these from PENDING');
});

test('the rules catch the words Dustin named, and allow the safe ones', () => {
  for (const word of ['Out of rotation', 'Catalog Edition 3', 'New fx!', 'Your allocation', 'Verified time',
    'eligible minutes', 'Best tier', 'VIP perk', 'Shark Coins', 'Park Tickets', 'Open Inventory', 'Hurry!',
    'Last chance!', 'Purchase didn’t go through', 'a parent’s OK', 'underdog bonus']) {
    assert.ok(rules.hardViolations(word).length > 0, `should flag: ${word}`);
  }
  for (const ok of ['Buy for 50', 'It costs 50 coins. You have 120.', 'Ask a grown-up', 'Restore purchases',
    'Payment is charged to your Apple ID when the free trial ends.', 'VIP members get extra XP and coins']) {
    assert.deepEqual(rules.hardViolations(ok), [], `should allow: ${ok}`);
  }
});

test('the bundled server copy (crumbs) is plain too', () => {
  const rows = extractSource(read('src/api/defaults/crumbs.json'), 'src/api/defaults/crumbs.json');
  assert.ok(rows.length > 50, 'crumbs were read');
  const bad = rows.map(r => [r.text, rules.hardViolations(r.text)]).filter(([, v]) => v.length).map(([t, v]) => `${v} ${t}`);
  assert.deepEqual(bad, []);
});

test('the help glossary uses the one name for each currency', () => {
  const glossary = loadTs('src/services/help/glossary.ts');
  const label = key => glossary.LOCAL_GLOSSARY[key].label;
  assert.equal(label('coins'), 'Coins');
  assert.equal(label('tickets'), 'Tickets');
  assert.equal(label('xp'), 'XP');
  assert.equal(label('vip'), 'VIP');
  assert.equal(label('ride_coins'), 'Ride Coins');
});

test('buying with coins: the confirm restates the price, the balance and what is left', () => {
  const stub = {};
  const hook = loadTs('src/hooks/usePurchaseItem.tsx', {
    react: { useCallback: fn => fn, useContext: () => ({}), useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-native': { StyleSheet: { create: v => v }, Text: 'Text', View: 'View' },
    'expo-image': { Image: 'Image' }, 'expo-haptics': {}, 'sprintf-js': { vsprintf: s => s },
    '../api/endpoints/me/inventory/purchase-item': stub, '../RootNavigation': stub,
    '../context/AuthProvider': stub, '../context/SoundEffectProvider': stub,
    '../ui': { BRAND: {}, GameDialog: 'GameDialog' }, './useCrumbs': { default: () => ({}) },
  });
  assert.equal(hook.confirmLine({ cost: 300, currency: { name: 'Coins' } }, 325), 'It costs 300 coins. You have 325. You’ll have 25 left.');
  assert.equal(hook.currencyLabel('Tickets', 2), 'tickets');
});

test('real money: the shop and the VIP page say "real money" before any price, and the gate restates it', () => {
  const supplies = read('src/screens/StoreScreen/SuppliesShop.tsx');
  assert.match(supplies, /Supplies cost real money\. A grown-up buys them\./);
  assert.doesNotMatch(supplies, /new deal in \$\{/, 'no countdown on a real-money deal');
  const vip = read('src/screens/MembershipScreen.tsx');
  assert.match(vip, /REAL MONEY/);
  assert.match(vip, /It keeps going until a grown-up turns it off in Apple\\u00A0ID settings\./);

  const gate = loadTs('src/components/GrownUpGate.tsx', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null, setItem: async () => {} } },
    react: { useEffect() {}, useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    'react-native': { Modal: 'Modal', Pressable: 'Pressable', StyleSheet: { create: s => s }, Text: 'Text', View: 'View' },
    '../RootNavigation': { navigate() {} }, '../ui/iconNames': {}, '../ui/modalLayers': { useModalLayer: () => true },
    '../ui': { BRAND: {}, FONT: {}, GameIcon: 'GameIcon' }, './RealMoneyMark': { default: 'RealMoneyMark' },
  });
  const money = gate.gateReasonLines({ kind: 'money', price: '$0.99', gets: '6 tickets and 60 Energy' });
  assert.equal(money.head, 'This costs real money.');
  assert.equal(money.line, 'A grown-up sees the details next.', 'no price or offer before the grown-up answers');
  assert.equal(gate.gateReasonLines({ kind: 'vip' }).head, 'VIP costs real money.');
  // After the answer the grown-up (only) sees the price and what it gets.
  assert.deepEqual(plain(gate.gateDetails({ kind: 'money', price: '$0.99', gets: '6 tickets and 60 Energy' })),
    { head: '$0.99', lines: ['For 6 tickets and 60 Energy.', 'Paid with the Apple ID on this device.'] });
  // A plan that renews: the trial, the renewal and how to cancel (App Store 3.1.2), never shown to the child first.
  const renews = { kind: 'renews', what: 'VIP', price: '$4.99', period: 'month', trial: 'One week free' };
  assert.doesNotMatch(JSON.stringify(gate.gateReasonLines(renews)), /free|\$/);
  const d = gate.gateDetails(renews);
  assert.equal(d.head, 'One week free, then $4.99 a month');
  assert.match(d.lines.join(' '), /renews by itself at \$4\.99 a month until you cancel/);
  assert.match(d.lines.join(' '), /Cancel anytime in Settings.*24 hours before it renews/);
  assert.equal(gate.gateDetails({ kind: 'leave', where: 'a website' }), null, 'leaving the game needs no offer card');
  assert.equal(gate.gateReasonLines({ kind: 'leave', where: 'a website' }).line, 'It opens a website.');
  assert.equal(gate.gateReasonLines(null), null);
  assert.equal(gate.vipPriceLine([{ price: '$39.99 a year', trial: 'One week free' }, { price: '$4.99 a month', trial: null }]),
    '$39.99 a year, with one week free first. Or $4.99 a month.', 'the free week belongs to its own plan');
});

test('shop timers stay calm: no red countdown, no "last chance"', () => {
  const shelves = loadTs('src/helpers/shopShelves.ts');
  const now = Date.parse('2026-10-20T23:50:00-07:00');
  const daily = shelves.dailyPill({ type: 'daily', ends_at: '2026-10-21T00:00:00-07:00' }, now);
  assert.equal(daily.urgent, false);
  const end = shelves.eventEndPill({ type: 'event', ends_at: '2026-10-21T00:00:00-07:00', event_ends_at: '2026-10-21T00:00:00-07:00',
    event_last_day: '2026-10-20', last_chance: true }, now);
  assert.equal(end.urgent, false);
  assert.doesNotMatch(end.label, /last chance|hurry|!/i);
});

test('the screenshot harness never ships', () => {
  const hits = walk('src').filter(file => /CAPTURE ONLY|EXPO_PUBLIC_CAPTURE_/.test(read(file)));
  assert.deepEqual(hits, [], 'capture-only harness code left in src/');
});

test('the classic shop says the restock day, never a ticking countdown', () => {
  const note = loadTs('src/components/StoreRestockNote.tsx', {
    react: { useEffect() {}, useState: v => [v, () => {}] },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    'react-native': { StyleSheet: { create: v => v }, Text: 'Text', View: 'View' },
    '../ui': { BRAND: {}, GameIcon: 'GameIcon' },
  });
  const now = new Date(2026, 9, 20, 10, 0).getTime();
  assert.equal(note.restockLine(new Date(2026, 9, 20, 23, 0).toISOString(), now), 'New gear tonight');
  assert.equal(note.restockLine(new Date(2026, 9, 21, 9, 0).toISOString(), now), 'New gear tomorrow');
  assert.equal(note.restockLine(new Date(2026, 9, 24, 9, 0).toISOString(), now), 'New gear on Saturday');
  assert.equal(note.restockLine(new Date(2026, 9, 20, 9, 0).toISOString(), now), 'New gear is coming. Check back soon.');
  // StoreScreen swaps <StoreCountdown> for <StoreRestockNote> in claude/profile-title-sheet (AUDIT.md T1), which owns those lines.
});
