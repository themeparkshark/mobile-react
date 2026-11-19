// Fix pass w5, lane loose-ends: no gap, no lag, no unexplained wait on the coin card and the map.
// Pure rules run for real; wiring is checked in the source where React cannot run here.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

/* W4-SMOKE-3b: one source of truth for the Ticket count (the header chip), mirrored by the coin card. */
test('W4-SMOKE-3b the header chip owns the Ticket number and a mirror draws exactly what it draws', () => {
  const hud = loadTs('src/components/Topbar/hudShown.ts');
  assert.equal(hud.hudShownNow('tickets'), null, 'no chip, nothing to mirror');
  const owner = hud.claimHudShown('tickets');
  let heard = 0;
  const off = hud.subscribeHudShown('tickets', () => { heard += 1; });
  const held = { value: 0, prev: 0, stream: null, key: 0 };
  hud.publishHudShown('tickets', owner, held);
  assert.equal(hud.hudShownNow('tickets').value, 0);
  assert.equal(heard, 1);
  // A second chip takes over; the first one can no longer publish or let go.
  const next = hud.claimHudShown('tickets');
  hud.publishHudShown('tickets', owner, { value: 99, prev: 0, stream: null, key: 5 });
  assert.equal(hud.hudShownNow('tickets').value, 0, 'an old owner is ignored');
  hud.releaseHudShown('tickets', owner);
  assert.notEqual(hud.hudShownNow('tickets'), null, 'an old owner cannot clear the number');
  // The claim: the wallet already says 10, the chip holds at 0 until the Tickets land, then rolls 0 -> 10.
  const own = { value: 10, prev: 0, stream: null, key: 1 };
  hud.publishHudShown('tickets', next, held);
  assert.equal(hud.mirrorShown(hud.hudShownNow('tickets'), own, 10).value, 0, 'the card holds with the header');
  const rolled = { value: 10, prev: 0, stream: null, key: 1 };
  hud.publishHudShown('tickets', next, rolled);
  assert.equal(hud.mirrorShown(hud.hudShownNow('tickets'), own, 10), hud.hudShownNow('tickets'), 'and rolls with it');
  // A chip ahead of the wallet the card knows (a spend not yet seen) never wins; no chip: the card's own number.
  assert.equal(hud.mirrorShown({ value: 12, prev: 10, stream: null, key: 2 }, own, 10), own);
  assert.equal(hud.mirrorShown(null, own, 10), own);
  hud.releaseHudShown('tickets', next);
  assert.equal(hud.hudShownNow('tickets'), null);
  off();
});

test('W4-SMOKE-3b the coin card line mirrors the chip and never counts up on JS timers', () => {
  const flight = read('src/components/rewards/TicketClaimFlight.tsx');
  assert.match(flight, /useSyncExternalStore\(/);
  assert.match(flight, /mirrorShown\(chip, own, tickets\)/);
  assert.match(flight, /<Text style=\{styles\.count\}>\{n\} \{n === 1 \? 'Ticket' : 'Tickets'\}<\/Text>/,
    'a plain number: no animated digit a commit of the card could reset to its first-render digit');
  assert.doesNotMatch(flight, /setCounted/, 'no JS-timer count-up');
  assert.doesNotMatch(flight, /Math\.max\(0, tickets - claimed\.amount\)/, 'never rewinds to the old number');
  const chip = read('src/components/Topbar/Currency.tsx');
  assert.match(chip, /claimHudShown\(flyTarget\)/);
  assert.match(chip, /publishHudShown\(flyTarget, ownerRef\.current,/);
  assert.match(chip, /releaseHudShown\(flyTarget, owner\)/);
  const card = read('src/components/RedeemRedeemableModal.tsx');
  const claim = card.slice(card.indexOf('const handleClaimTickets'), card.indexOf('// T055'));
  assert.ok(claim.indexOf("holdHud('tickets', CLAIM_HOLD_MS)") > -1 && claim.indexOf("holdHud('tickets', CLAIM_HOLD_MS)") < claim.indexOf('claimStampReward('),
    'the chip holds before the claim can change the wallet');
  const plan = loadTs('src/components/rewards/claimFlightModel.ts');
  assert.equal(plan.claimFlightPlan(10).flightMs, 500, "the card's Tickets land with the header's (500 ms)");
});

/* W4-SMOKE-3a: the NEED A TICKET row keeps its place while it loads and draws on its first frame. */
test('W4-SMOKE-3a the offer rows enter on the UI thread, never with an entering layout animation that stalls in a sheet', () => {
  for (const file of ['src/components/money/CalmOffer.tsx', 'src/components/money/CoinTopUpOffer.tsx']) {
    assert.doesNotMatch(read(file), /entering=\{/, `${file} has no entering layout animation`);
    assert.match(read(file), /useRowEntrance\(/);
  }
  const ui = read('src/components/money/moneyUi.tsx');
  assert.match(ui, /export function useRowEntrance\(on: boolean, delayMs: number\)/);
  assert.match(ui, /withDelay\(delayMs, withSpring\(1, SPRING\.settle\)\)/, 'a spring from motion.ts');
  assert.match(ui, /if \(reduced\) \{ enter\.value = 1; return; \}/, 'Reduce Motion draws it at once');
  assert.match(ui, /const heal = useCommitHeal\(\);[\s\S]*touchHeal\(heal\);/, 'a commit never leaves the row on its first-frame opacity 0');
});

test('W4-SMOKE-3a while the answer loads, the row keeps its place with the pack art at the same height; the card warms it', () => {
  const offer = read('src/components/money/CalmOffer.tsx');
  assert.match(offer, /export const SLIM_ROW_HEIGHT = 56;/);
  assert.match(offer, /slimKept: \{ height: SLIM_ROW_HEIGHT/);
  assert.match(offer, /minHeight: SLIM_ROW_HEIGHT/, 'the real row is the same height as the kept place');
  assert.match(offer, /<PackArt art="bag" size=\{40\} bob=\{false\} \/>/);
  assert.match(offer, /placement === 'need_ticket' && compact && !gone && !!player && switchOn && !loss && canBuy/,
    'only the NEED A TICKET row keeps a place, and never on a loss card');
  assert.match(offer, /ctxCache\.get\(ctxKey\(playerId, placement\)\)/, 'a card that opens again knows its answer on frame one');
  assert.match(offer, /keepRecord\(markShown\(/);
  assert.match(offer, /keepRecord\(markDismissed\(/);
  const card = read('src/components/RedeemRedeemableModal.tsx');
  assert.match(card, /if \(open && outOfTickets && !previewOnly\) warmCalmOffer\(player\?\.id, 'need_ticket'\)/);
});
