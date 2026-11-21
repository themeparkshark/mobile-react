// Lane app-tickets, fix pass 1 (Nov 20 2026): P13, P19, P20, P14, P23 and the Get Tickets hand-offs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { read } = require('./helpers/load-ts.cjs');

test('P13 the unwon coin card is anchored on a real view, so it opens centered from any shelf slot', () => {
  // Every sheet is drawn in a window overlay placed from its parent's native frame (ui/OverlaySheet.tsx). A shelf
  // slot's wrappers are layout only and get flattened, which put the card and its backdrop at the slot's offset.
  const src = read('src/components/UnfoundCoinModal.tsx');
  const anchorAt = src.indexOf('<View collapsable={false} pointerEvents="box-none" style={styles.modalAnchor}>');
  const modalAt = src.indexOf('<Modal', anchorAt);
  assert.ok(anchorAt > 0, 'the card has a non-collapsable anchor view');
  assert.ok(modalAt > anchorAt && !src.slice(anchorAt, modalAt).includes('</View>'), 'the Modal sits inside the anchor');
  assert.ok(src.indexOf('</Modal>\n      </View>') > modalAt, 'the anchor closes right after the Modal');
  assert.match(src, /modalAnchor: \{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 \}/);
  // It can always be closed: the backdrop, a swipe and Not now (or Got It!) all close it.
  assert.match(src, /onBackdropPress=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, /onSwipeComplete=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, />Not now</);
  assert.match(src, /text="Got It!" onPress=\{\(\) => setVisible\(false\)\}/);
});

function memoryStorage() {
  const data = new Map();
  return { data, store: { __esModule: true, default: {
    getItem: async key => (data.has(key) ? data.get(key) : null),
    setItem: async (key, value) => { data.set(key, value); },
    removeItem: async key => { data.delete(key); }, getAllKeys: async () => [...data.keys()],
    multiGet: async keys => keys.map(key => [key, data.has(key) ? data.get(key) : null]),
  } } };
}

test('P19 an old win card comes back only on its own park map, with its own price and park', async () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const { data, store } = memoryStorage();
  const pending = loadTs('src/services/task-attempt/pendingWins.ts', {
    '@react-native-async-storage/async-storage': store,
    '../../api/endpoints/me/task-attempts': { getTaskAttempt: async id => ({ attempt: { id, status: 'won', ticket_cost: 3 } }) },
  });
  const cp = loadTs('src/services/task-attempt/checkpoint.ts', { '@react-native-async-storage/async-storage': store });
  const base = { version: 1, playerId: 96, requestId: 'tps-1234567890-abcdefgh', latitude: 28.47, longitude: -81.44, savedAt: Date.now() };
  // Won at Epic Universe (park 10), card left open, app relaunched at Magic Kingdom (park 2).
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 70, attemptId: 901, card: { name: 'Stardust Racers', park_id: 10 } });
  assert.equal((await pending.findPendingWin(96, undefined, 2)).win, null, 'never on another park map');
  assert.equal(data.has('task_attempt_checkpoint_v1_96_task_70'), true, 'kept for its own park');
  assert.equal((await pending.findPendingWin(96, undefined, null)).win, null, 'never at home or with no park');
  const home = await pending.findPendingWin(96, undefined, 10);
  assert.equal(home.win.attempt.id, 901, 'back on its own park map');
  const model = pending.pendingWinRedeemable(home.win).model;
  assert.equal(model.park_id, 10);
  assert.equal(model.ticket_cost, 3, 'its own price, never a guessed 1');
  // A card saved by an older build names no park: it cannot prove where it belongs, so it stays put.
  await cp.writeTaskAttemptCheckpoint({ ...base, taskType: 'task', taskId: 71, attemptId: 902, card: { name: 'Mine-Cart Madness' }, savedAt: base.savedAt - 5 });
  assert.equal(pending.winBelongsHere(undefined, 10), false);
  assert.equal(pending.winBelongsHere(10, undefined), true, 'a caller that does not filter keeps the older rule');
  // The card writes its park; the map asks with its park.
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /\.\.\.\(park\?\.id \? \{ park_id: park\.id \} : \{\}\) \},/);
  assert.match(read('src/components/RedeemModal.tsx'), /findPendingWin\(player\.id, undefined, park\?\.id \?\? null\)/);
  assert.doesNotMatch(read('src/services/task-attempt/pendingWins.ts'), /ticket_cost: 1\b/);
});

test('P20 no pack and no VIP line inside any win card', () => {
  const slot = read('src/components/rewards/offerSlots.tsx');
  const win = slot.slice(slot.indexOf('export function WinOfferSlot'));
  assert.doesNotMatch(win, /CalmOffer/, 'the win slot mounts no offer');
  assert.match(win, /<ShelfGiftBar gift=\{gift\} flyKey=\{winKey\} \/>/, 'the shelf gift bar stays');
  const calm = read('src/components/money/CalmOffer.tsx');
  assert.match(calm, /return placement === 'first_win' \|\| placement === 'win_vip';/);
  assert.match(calm, /const show = !inWin && /, 'a win placement never shows, whoever mounts it');
  assert.match(calm, /const decided = inWin \|\| /, 'and tells its owner so at once');
  assert.match(calm, /const wantsPack = placement === 'need_ticket';/, 'no Starter Pack catalog read for a win');
  // No other screen mounts a win placement (the dev bench shows that it draws nothing).
  const { execSync } = require('node:child_process');
  const hits = execSync("grep -rln \"placement=\\\"first_win\\\"\\|placement=\\\"win_vip\\\"\" src || true").toString().trim().split('\n').filter(Boolean);
  assert.deepEqual(hits, ['src/screens/MoneyPreviewScreen.tsx']);
});

test('P14 the coin card names the Parts already saved for a coin not won, only from the server', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const m = loadTs('src/components/tickets/coinCardPriceModel.ts');
  const base = { game: 'tap', price: 3, winParts: 4, arcade: true };
  assert.deepEqual(JSON.parse(JSON.stringify(m.coinCardPrice({ ...base, partsWaiting: 3 }).waiting)), { parts: 3, text: '3 Parts saved. Win it to grow it.' });
  assert.equal(m.coinCardPrice({ ...base, partsWaiting: 1 }).waiting.text, '1 Part saved. Win it to grow it.');
  assert.equal(m.coinCardPrice({ ...base, partsWaiting: 0 }).waiting, null, 'none saved: no line');
  assert.equal(m.coinCardPrice(base).waiting, null, 'today\'s server sends no field: no line');
  assert.equal(m.coinCardPrice({ ...base, partsWaiting: 'x' }).waiting, null);
  const view = read('src/components/tickets/CoinCardPrice.tsx');
  assert.match(view, /\{model\.waiting && <View style=\{styles\.waiting\}[^]*?<GameIcon name="parts"/);
  assert.match(read('src/components/RedeemRedeemableModal.tsx'), /partsWaiting: \(cardModel as \{ parts_waiting\?: unknown \} \| null \| undefined\)\?\.parts_waiting/);
});

test('P23 a won coin on the map wears its own level rim, and never a guessed level 1', () => {
  const src = read('src/screens/ExploreScreen/TaskMarker.tsx');
  const fn = src.slice(src.indexOf('export function markerCoinLevel'), src.indexOf('function LampGlow('));
  // eslint-disable-next-line no-new-func
  const markerCoinLevel = new Function(`${fn.replace('export function', 'return function').replace(/: (boolean|number \| null \| undefined|number \| null)/g, '')}`)();
  assert.equal(markerCoinLevel(true, 5), 5);
  assert.equal(markerCoinLevel(true, undefined), null, 'the map list sends no level: no "1" badge');
  assert.equal(markerCoinLevel(false, 3), null, 'a coin not won has no level');
  assert.doesNotMatch(src, /task\.coin_level \?\? 1/);
  assert.match(src, /const rim = level != null && level >= 2 \? coinTier\(level\) : null;/);
  assert.match(src, /styles\.tooltipCoinRim, rim && \{ borderColor: rim\.ring, backgroundColor: rim\.halo \}/);
  assert.match(src, /\{level != null && !isSelected && <View style=\{\[styles\.levelPip, \{ backgroundColor: coinTier\(level\)\.ring, borderColor: coinTier\(level\)\.ringDeep \}\]\}>/);
});

test('Get Tickets with no coin: one door for the top card and the header pill, no price, no ride picked', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const door = loadTs('src/components/tickets/getTicketsOpen.ts', { react: { useSyncExternalStore: () => false } });
  assert.equal(door.openGetTickets(), false, 'no map up: the caller keeps its older way');
  const release = door.registerGetTicketsHost();
  assert.equal(door.openGetTickets(), true);
  assert.equal(door.getTicketsIsOpen(), true);
  door.closeGetTickets();
  assert.equal(door.getTicketsIsOpen(), false);
  door.openGetTickets(); release();
  assert.equal(door.getTicketsIsOpen(), false, 'the host leaving closes it');
  const ways = loadTs('src/components/tickets/getTicketsModel.ts');
  const base = { price: null, tickets: 2, sources: { home: true, queue: true, queue_per_park_day: 2, line_tickets_left_today: 2, stamps_waiting_tickets: 5 },
    stampTickets: null, rideHasLine: false, queueTicketsOn: true, affordableNear: null, canPick: false, storeOn: true, arcade: true };
  const atPark = ways.getTicketsRows({ ...base, anyLine: true });
  assert.deepEqual(JSON.parse(JSON.stringify(atPark.rows.map(r => r.kind))), ['claim', 'line', 'near', 'grownups']);
  const line = atPark.rows.find(r => r.kind === 'line');
  assert.equal(line.action, null, 'no LinePlay button: no ride is picked for the player');
  assert.equal(line.text, 'Wait in any ride line: +1');
  assert.equal(atPark.have, 'You have 2 Tickets', 'no price: no "of N"');
  assert.equal(atPark.footer, 'Tomorrow at any park: +3');
  assert.equal(ways.getTicketsRows(base).rows.some(r => r.kind === 'line'), false, 'away from a park: no line row');
  assert.equal(ways.getTicketsRows({ ...base, arcade: false }).footer, null, 'today\'s server: no park gift line');
  // The host sits on the map (RedeemModal), anchored like P13; the pill and the sheet share the one door.
  const sheet = read('src/components/tickets/GetTicketsSheet.tsx');
  assert.match(sheet, /<View collapsable=\{false\} pointerEvents="box-none" style=\{styles\.anchor\}>/);
  assert.match(sheet, /<GetTicketsPanel price=\{null\}/);
  assert.match(sheet, /\{wanted && <GrownUpGateSlot \/>\}/);
  assert.match(sheet, /askGrownUp\(null\)\.then/, 'the shop row asks the grown-up gate first');
  assert.match(read('src/components/RedeemModal.tsx'), /<GetTicketsSheet atPark=\{!!park\} \/>/);
  assert.match(read('src/components/Topbar/Currency.tsx'), /if \(flyTarget === 'tickets' && openGetTickets\(\)\) return;/);
});

test('Supplies opened from Get Tickets lists the smallest pack that covers the shortfall first', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const plan = loadTs('src/services/money/suppliesPlan.ts');
  const pack = (id, tickets, price) => ({ product_id: id, grants: { tickets }, available: true, section: 'tickets', price });
  const packs = [pack('t5', 5, 0.99), pack('t12', 12, 1.99), pack('t30', 30, 3.99)];
  const prices = { t5: { amount: 0.99 }, t12: { amount: 1.99 }, t30: { amount: 3.99 } };
  const amountOf = id => plan.handoffTicketPack(packs, prices, id);
  // Whatever the price shape, the order is by price then Tickets; read back the picked id.
  assert.equal(amountOf(2).product_id, 't5', 'short 2: the 5 pack covers it');
  assert.equal(amountOf(6).product_id, 't12', 'short 6: the smallest pack that covers it, not the cheapest');
  assert.equal(amountOf(40).product_id, 't30', 'nothing covers it: the biggest gets closest');
  assert.equal(amountOf(null).product_id, 't5', 'no coin: the smallest pack');
  const params = loadTs('src/screens/StoreScreen/storeParams.ts');
  assert.equal(params.storeParams({ focus: 'tickets', from: 'get_tickets', short: 2 }).short, 2);
  assert.equal(params.storeParams({ focus: 'tickets', short: 2 }).short, undefined, 'only Get Tickets says a shortfall');
  assert.match(read('src/screens/StoreScreen.tsx'), /<SuppliesShop focus=\{focus\} short=\{shortTickets\} \/>/);
  assert.match(read('src/screens/StoreScreen/SuppliesShop.tsx'), /planSupplies\(\{ products: catalog\.products, prices, focus, wallet, priced, short \}\)/);
});
