// T2 (arcade plan, Nov 20 2026): every map island shows its served price as Ticket pictures,
// filled up to the wallet; every coin stays the same size and brightness; no Rush sparkle; no timer.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const model = loadTs('src/components/tickets/ticketPipsModel.ts');
const { islandPrice } = loadTs('src/components/tickets/islandPrice.ts', { './ticketPipsModel': model });
const marker = read('src/screens/ExploreScreen/TaskMarker.tsx');
const code = marker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('the island price is the task\'s served price, then its caller\'s, never a guessed 1', () => {
  assert.equal(islandPrice(3, 1), 3);
  assert.equal(islandPrice(undefined, 2), 2);
  assert.equal(islandPrice(undefined, undefined), null);
  assert.equal(islandPrice(null, null), null);
  assert.equal(islandPrice('2'), 2);
  assert.doesNotMatch(code, /ticketCost = 1\b/);
  assert.match(code, /const price = islandPrice\(task\.ticket_cost, ticketCost\);/);
});

test('every island draws its price as TicketPips filled up to the Tickets held', () => {
  assert.match(code, /const held = useContext\(AuthContext\)\.player\?\.tickets \?\? null;/);
  assert.match(code, /<TicketPips price=\{price\} held=\{held\} size="island" \/>/);
  // Under the island in its own box (not a declutter chip), hidden on a resting ride whose BACK or DOWN chip sits there.
  assert.match(code, /\{!resting && price !== null && <View pointerEvents="none" style=\{styles\.priceRow\}>/);
  // The selected card shows the same pictures, not the words "1 Ticket".
  assert.doesNotMatch(code, /\{ticketCost\} \{ticketCost === 1 \? 'Ticket' : 'Tickets'\}/);
});

test('no Rush sparkle, no gold Rush ring, no ticking timer: every coin the same brightness', () => {
  assert.doesNotMatch(code, /'rush' as const/);
  assert.match(code, /markerRingColor\(\{ rush: false,/);
  assert.match(code, /urgent: false/);
  assert.doesNotMatch(code, /MarkerTimer/);
  assert.doesNotMatch(code, /Bonus opportunity/);
  // SHORT LINE stays as plain words on the same white chip as every other tag.
  assert.match(code, /<Text style=\{styles\.rushText\}>SHORT LINE<\/Text>/);
  assert.doesNotMatch(code, /<GameIcon name="rush"/);
  assert.match(code, /rushBadge: \{[^}]*backgroundColor: BRAND\.white/);
  // The price never changes the island by price: no scale, glow or tint from it.
  assert.doesNotMatch(code, /price\s*(>=|>|===)\s*[23]/);
});

test('the guide target keeps its bob (it only follows the player\'s own pick after C1)', () => {
  assert.match(code, /\(isSelected \|\| near \|\| guideTarget\) && !resting && <FloatingCoin/);
});
