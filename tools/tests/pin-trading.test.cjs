const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
// Run with: node --test tools/tests/pin-trading.test.cjs
// Pin Trading polish: the hold timer, the board, error cases and the kid-safety rules.

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = loadTs('src/screens/pinTrading/pinTradeModel.ts');

const item = (id, over = {}) => ({ id, name: `Pin ${id}`, icon_url: `https://x/${id}.png`, ...over });

test('the hold clock is readable and never negative', () => {
  assert.equal(model.formatClock(120), '2:00');
  assert.equal(model.formatClock(65), '1:05');
  assert.equal(model.formatClock(9), '0:09');
  assert.equal(model.formatClock(-3), '0:00');
  assert.equal(model.secondsLeft(10_500, 10_000), 1, 'rounds up: 0:01 shows until it truly ends');
  assert.equal(model.secondsLeft(10_000, 12_000), 0);
  assert.equal(model.timerTone(90), 'calm');
  assert.equal(model.timerTone(30), 'urgent');
  assert.equal(model.timerTone(0), 'expired');
});

test('the countdown comes from the server hold length, not the phone clock', () => {
  // Server says 2 minutes; a phone 10 minutes fast still counts down 2:00.
  assert.equal(model.holdLengthMs('2026-10-04T10:00:00Z', '2026-10-04T10:02:00Z'), 120_000);
  assert.equal(model.holdLengthMs(null, '2026-10-04T10:02:00Z'), model.DEFAULT_HOLD_MS);
  assert.equal(model.holdLengthMs('2026-10-04T10:02:00Z', '2026-10-04T10:00:00Z'), model.DEFAULT_HOLD_MS, 'nonsense falls back');
  assert.equal(model.holdLengthMs('2026-10-04T10:00:00Z', '2026-10-04T12:00:00Z'), 600_000, 'capped at 10 minutes');
});

test('pins tilt a little, the same way every render', () => {
  for (let id = 1; id < 400; id++) {
    const t = model.pinTilt(id);
    assert.equal(t, model.pinTilt(id), 'stable');
    assert.ok(Math.abs(t) >= 2 && Math.abs(t) <= 7, `pin ${id} tilt ${t} in 2..7`);
    assert.ok(Math.abs(model.cardTilt(id)) <= 3);
  }
});

test('your pins page in without repeats, and the board pin is never offered back', () => {
  const merged = model.mergePins([item(1), item(2)], [item(2), item(3)]);
  assert.deepEqual(plain(merged.map(p => p.id)), [1, 2, 3]);
  assert.deepEqual(plain(model.givablePins(merged, 2).map(p => p.id)), [1, 3]);
  assert.equal(model.pinName({ name: 'Honey Pin', display_name: null }), 'Honey Pin');
  assert.equal(model.pinName({ name: 'Honey Pin', display_name: 'Hunny Pin' }), 'Hunny Pin');
});

test('the board never keeps who posted a pin', () => {
  const swap = { id: 9, pin: { id: 4, item: item(4) }, held_from: null, held_to: null, player: { id: 77, username: 'stranger' } };
  const entry = plain(model.boardEntry(swap));
  assert.equal('player' in entry, false);
  assert.deepEqual(Object.keys(entry).sort(), ['held_from', 'held_to', 'id', 'pin']);
});

test('failed holds and trades become four kid-readable cases', () => {
  const http = (status, message) => ({ response: { status, data: { message } } });
  assert.equal(model.classifyTradeError({ message: 'Network Error' }), 'network');
  assert.equal(model.classifyTradeError(http(422, 'You have already purchased this item.')), 'owned');
  assert.equal(model.classifyTradeError(http(403, 'This action is unauthorized.')), 'taken');
  assert.equal(model.classifyTradeError(http(404, 'No query results')), 'taken');
  assert.equal(model.classifyTradeError(http(422, 'The pin swap has already been accepted.')), 'taken');
  assert.equal(model.classifyTradeError(http(422, 'Sorry, this pin is unavailable right now.')), 'taken');
  assert.equal(model.classifyTradeError(http(500, 'Server Error')), 'generic');
});

test('every sheet phase has a clear status chip', () => {
  const phases = ['loading', 'picking', 'confirming', 'sending', 'expired', 'failed', 'taken'];
  const labels = phases.map(p => model.statusChip(p).label);
  assert.equal(new Set(labels.slice(2)).size, 5, 'confirming, sending, expired, failed and taken each read differently');
  assert.equal(model.statusChip('picking', true).label, 'Hurry!');
  assert.equal(model.statusChip('picking', true).tone, 'red');
  assert.equal(model.isHolding('taken'), false);
  assert.equal(model.statusChip('expired').tone, 'red');
  assert.equal(model.isHolding('picking'), true);
  assert.equal(model.isHolding('confirming'), true);
  assert.equal(model.isHolding('sending'), false);
  assert.equal(model.isHolding('expired'), false);
});

test('the trade-complete beats land in order (lift, cross, land, title, button)', () => {
  const t = plain(model.SWAP_TIMELINE);
  assert.ok(t.lift < t.cross && t.cross < t.land && t.land < t.title && t.title < t.button);
  assert.ok(t.button <= 1600, 'the Awesome button is up within 1.6 s');
});

test('kid safety: signed-in only, no free text, no player identity', () => {
  const screen = read('src/screens/PinSwapsScreen.tsx');
  const files = ['src/screens/PinSwapsScreen.tsx', ...fs.readdirSync(path.join(root, 'src/screens/pinTrading')).map(f => `src/screens/pinTrading/${f}`)];
  assert.match(screen, /hasPermission\(PermissionEnums\.TradePins\)/, 'the screen itself checks the trade permission');
  assert.ok(screen.indexOf('if (!signedIn) {\n    return (') > screen.lastIndexOf('useCallback('), 'every hook runs before the signed-out return');
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /TextInput/, `${file}: no free text`);
    assert.doesNotMatch(src, /\.player\b|username/, `${file}: never reads who posted a pin`);
  }
  // The Social shortcut still gates with the sign-in prompt.
  assert.match(read('src/screens/SocialScreen.tsx'), /checkPermission\(PermissionEnums\.TradePins\)\) navigation\.navigate\('PinSwaps'\)/);
  // The permission is still signed-in only.
  assert.match(read('src/hooks/usePermissions.tsx'), /trade_pins: player,/);
});

test('leaving mid-trade lets the pin go back on the board; motion has a reduced path', () => {
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /isHolding\(phaseRef\.current\)[\s\S]{0,80}unHoldPinSwap/);
  assert.match(screen, /useUiReducedMotion\(\)/);
  const cele = read('src/screens/pinTrading/SwapCelebration.tsx');
  assert.match(cele, /if \(still\) \{[\s\S]{0,80}beat\('ui\.complete', \{\}, 'success'/, 'reduced motion still plays the payoff sound and haptic');
});

test('two-line pin names break near the middle and never orphan "Pin"', () => {
  assert.equal(model.balanceName('Honey Pin'), 'Honey Pin');
  assert.equal(model.balanceName('Astronaut Shark Pin'), 'Astronaut\nShark Pin');
  assert.equal(model.balanceName('Drink Around The World Pin'), 'Drink Around\nThe World Pin');
  for (const name of ['Astronaut Shark Pin', 'Drink Around The World Pin', '100 Castle Celebration Pin', 'Shark Bike Year Open Pin']) {
    const second = model.balanceName(name).split('\n')[1] ?? '';
    assert.notEqual(second, 'Pin', name);
  }
});

test('the sheet never drops a hold on a stray tap, and a double tap cannot skip the confirm', () => {
  const sheet = read('src/screens/pinTrading/TradeSheet.tsx');
  assert.match(sheet, /never closes the sheet/);
  assert.doesNotMatch(sheet, /styles\.scrim\][^>]*>\s*<Pressable[^>]*onPress=/, 'the scrim has no onPress');
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /CONFIRM_GUARD_MS = 4\d0/);
  assert.match(screen, /Date\.now\(\) - confirmAt\.current < CONFIRM_GUARD_MS\) return/);
});

test('no hold is taken when the answer is already known (you own it, or you have no pins)', () => {
  const screen = read('src/screens/PinSwapsScreen.tsx');
  const hold = screen.indexOf('await holdPinSwap(');
  assert.ok(screen.indexOf('owned.has(swap.pin.item.id)') < hold);
  assert.ok(screen.indexOf('pins.length === 0') < hold);
});

test('r3 panel: From you cards are not held, VoiceOver stays in the sheet, owned-at-trade ends the trade', () => {
  const screen = read('src/screens/PinSwapsScreen.tsx');
  const hold = screen.indexOf('await holdPinSwap(');
  assert.ok(screen.indexOf('swap.pin.item.id === now.lastGiven') < hold, 'your own just-posted pin never starts a hold');
  assert.match(screen, /accessibilityViewIsModal=\{!done\}/);
  assert.match(screen, /importantForAccessibility=\{hold \|\| done \? 'no-hide-descendants' : 'auto'\}/);
  const start = screen.indexOf("if (kind === 'owned') {");
  const owned = screen.slice(start, screen.indexOf('return;', start));
  assert.match(owned, /unHoldPinSwap/);
  assert.match(owned, /setHold\(null\)/);
  assert.doesNotMatch(owned, /failBuzz/);
});

test('r3 panel: the resting board never writes the shine value, and pins share one decoded image', () => {
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /setInterval\(sweep, 6200\)/);
  assert.doesNotMatch(screen, /withRepeat\(withSequence\(withTiming\(1, \{ duration: 1900 \}\)/);
  const pin = read('src/screens/pinTrading/EnamelPin.tsx');
  assert.match(pin, /usePinImage\(uri, size\)/);
  assert.doesNotMatch(pin, /\buseImage\(/);
});

test('r4 panel: the cross flash, sparks and ring are siblings of the flying pin, never inside it', () => {
  const cele = read('src/screens/pinTrading/SwapCelebration.tsx');
  const pinEnd = cele.indexOf('recyclingKey={`slot-${got.id}`} />');
  const flash = cele.indexOf('<Flash size={220} />');
  assert.ok(pinEnd > 0 && flash > pinEnd);
  const between = cele.slice(pinEnd, flash);
  assert.equal((between.match(/<\/Animated\.View>/g) || []).length, 2, 'both the bob layer and the pin wrapper close before the flash');
  assert.match(cele, /insets\.top \+ 64/, 'the toss apex stays below the top bar');
});

test('r5 panel: the land runs off the flight clock, and the kid paths stay calm', () => {
  const cele = read('src/screens/pinTrading/SwapCelebration.tsx');
  assert.match(cele, /withTiming\(1, \{ duration: T\.land - T\.travel, easing: Easing\.linear \}, finished => \{\s*if \(!finished\) return;\s*slam\(\);\s*runOnJS\(runLandRef\)\(\);/);
  assert.match(cele, /useAnimatedReaction\(\(\) => \(travel\.value >= 0\.93 \? 2 : travel\.value >= crossAt/);
  assert.doesNotMatch(cele, /setTimeout\(runLand, T\.land\)/, 'no JS timer lands the pin on time');
  const screen = read('src/screens/PinSwapsScreen.tsx');
  const expire = screen.slice(screen.indexOf('const onExpire'), screen.indexOf('const onTick'));
  assert.doesNotMatch(expire, /'warning'|'failBuzz'/, 'no haptic when time runs out');
  assert.match(screen, /pitch: left > 5 \? 0 :/, 'the 30 s tick plays at its natural pitch');
  assert.match(screen, /gameAlert\(COPY\.takenTitle, COPY\.takenMessage/);
  assert.match(screen, /fetchAllPins\(\)\.catch\(\(\) => null\)/, 'a failed pin page never leaves the board stale');
  const timer = read('src/screens/pinTrading/PinTradeParts.tsx');
  assert.match(timer, /said30\.current/);
  assert.match(timer, /said10\.current/);
});

test('push: a refreshed board never moves cards on screen; only the traded or gone slot changes', () => {
  const sw = (id, item) => ({ id, pin: { id: item, item: item_(item) }, held_from: null, held_to: null });
  function item_(id) { return { id, name: `Pin ${id}`, icon_url: `u${id}` }; }
  const current = model.toCards([sw(1, 11), sw(2, 12), sw(3, 13), sw(4, 14)]);
  // You traded for #2: its slot shows your pin (item 99) locally with a negative id.
  current[1] = { id: -99, pin: { id: -99, item: item_(99) }, held_from: '', held_to: '', key: current[1].key };
  // The server returns a new random order, with your posted pin as swap 7 and a new pin 8; #3 was taken.
  const server = [sw(8, 18), sw(4, 14), sw(7, 99), sw(1, 11)];
  const next = model.mergeBoard(current, server, 99);
  assert.deepEqual(plain(next.map(c => c.key)), ['s1', 's2', 's3', 's4'], 'every slot keeps its key (no remount, no move)');
  assert.deepEqual(plain(next.map(c => c.id)), [1, 7, 8, 4], 'your pin takes the traded slot; the taken slot gets the new pin');
  // Nothing new: a gone slot at the end is dropped, cards before it stay put.
  const shrink = model.mergeBoard(model.toCards([sw(1, 11), sw(2, 12)]), [sw(1, 11)], null);
  assert.deepEqual(plain(shrink.map(c => c.id)), [1]);
  // Extra server pins append after the cards on screen.
  const grow = model.mergeBoard(model.toCards([sw(1, 11)]), [sw(5, 15), sw(1, 11)], null);
  assert.deepEqual(plain(grow.map(c => c.id)), [1, 5]);
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /setBoard\(mergeBoard\(boardRef\.current, swaps, live\.current\.lastGiven\)\)/);
  assert.match(screen, /key=\{swap\.key\}/);
});

test('push: the slam starts on the contact frame on the UI thread, the moment is pre-mounted, and art is decoded at drawn size', () => {
  const cele = read('src/screens/pinTrading/SwapCelebration.tsx');
  const slam = cele.slice(cele.indexOf('const slam = () => {'), cele.indexOf('const runLandRef'));
  assert.match(slam, /'worklet';/);
  assert.match(slam, /squash\.value = /);
  assert.match(slam, /burst\.value = /);
  assert.match(cele, /armed = true/);
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /armed=\{!!done\}/);
  assert.match(screen, /phase === 'confirming' \|\| phase === 'sending'/);
  const cache = read('src/screens/pinTrading/pinImageCache.ts');
  assert.match(cache, /Skia\.Surface\.Make\(dw, dh\)/);
  assert.match(cache, /makeNonTextureImage\(\)/);
});

test('push: the timer says "Time left to trade", never "expire"', () => {
  const crumbs = JSON.parse(read('src/api/defaults/crumbs.json'));
  assert.equal(crumbs.labels.trade_expiration, 'Time left to trade %s:%s');
  const screen = read('src/screens/PinSwapsScreen.tsx');
  assert.match(screen, /COPY\.timeLeft/);
  assert.doesNotMatch(screen, /labels\.trade_expiration/);
  assert.equal(model.PIN_TRADE_COPY.timeLeft, 'Time left to trade');
});
