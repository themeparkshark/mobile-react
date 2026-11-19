'use strict';
/**
 * Map Calm (Dustin, Nov 19 2026: "there are multiple things covering each other and it's so busy"). One owner,
 * src/components/map/mapChrome.ts, lays out everything over the map. The rules are in
 * core-loop/dustin-nov19/map/MAP_LAYOUT.md; each test below is one rule.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');

const C = loadTs('src/components/map/mapChrome.ts');
const read = rel => fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// iPhone 17 Pro home map container (402 wide; the map runs between the header and the footer).
const PRO = { width: 402, height: 700 };
const SE = { width: 375, height: 520 };
const home = (extra = {}) => C.mapChrome({ ...PRO, card: { height: 92, rightGap: 78 }, raidChip: false, railExtras: 1, menu: true, shelf: true, ...extra });

test('(a) one card in the top slot: the guide leads, a live raid waits in its chip, a boss moment holds the screen', () => {
  assert.deepEqual(plain(C.topSlot(['raid', 'guide'])), { lead: 'guide', waiting: ['raid'] });
  assert.deepEqual(plain(C.topSlot(['project', 'adventure', 'guide'])), { lead: 'guide', waiting: ['adventure', 'project'] });
  assert.deepEqual(plain(C.topSlot(['guide', 'boss_moment'])).lead, 'boss_moment');
  assert.deepEqual(plain(C.topSlot([])), { lead: null, waiting: [] });
});

test('(a) a raid chip never pushes the card down: it lives in the rail column and the rail starts under it', () => {
  const calm = home();
  const raid = home({ raidChip: true });
  assert.equal(raid.cardTop, calm.cardTop, 'the card stays at the top');
  assert.equal(raid.controlsTop, calm.controlsTop + C.RAID_CHIP_ROW, 'the rail drops under the raid chip');
  const card = raid.cardRect;
  for (const { kind, rect } of raid.reserved) {
    if (kind === 'card') continue;
    assert.ok(!hits(card, rect), `the card never touches the ${kind}`);
  }
  // The card leaves a clear gap before the rail (his screenshot: the follow disc pressed against the card).
  assert.ok(raid.compassRect.x - (card.x + card.w) >= 8, 'a visible gap between the card and the rail buttons');
});

test('(b) the compass tip fits beside the button when nothing is there, tucked under the card when one is, else it waits', () => {
  const noCard = home({ card: null });
  const beside = C.tipSpot(noCard.compassRect, [], PRO, null);
  assert.equal(beside.placement, 'beside');
  assert.equal(beside.drop, 0);
  const withCard = home();
  const tucked = C.tipSpot(withCard.compassRect, [withCard.cardRect], PRO, withCard.cardRect);
  assert.equal(tucked.placement, 'tucked', 'beside the button it would cover the card (his screenshot)');
  assert.ok(tucked.rect.y >= withCard.cardRect.y + withCard.cardRect.h, 'below the card');
  assert.ok(!hits(tucked.rect, withCard.cardRect));
  // A treat (or an edge arrow, or the shark) where the tucked bubble would go: no spot, the tip waits.
  const treat = { x: tucked.rect.x + 40, y: tucked.rect.y + 10, w: 84, h: 92 };
  assert.equal(C.tipSpot(withCard.compassRect, [withCard.cardRect, treat], PRO, withCard.cardRect), null);
});

test('(b) on the SE the tip still never covers the shark or the card', () => {
  const se = C.mapChrome({ ...SE, card: { height: 92, rightGap: 78 }, raidChip: false, railExtras: 1, menu: true, shelf: true });
  const shark = { x: SE.width / 2 - 50, y: SE.height / 2 - 60, w: 100, h: 110 };
  const spot = C.tipSpot(se.compassRect, [se.cardRect, shark], SE, se.cardRect);
  if (spot) {
    assert.ok(!hits(spot.rect, shark), 'never over the shark');
    assert.ok(!hits(spot.rect, se.cardRect), 'never over the card');
  }
});

test('(b) never while a card is arriving, and one map tip per app open', () => {
  const spot = { placement: 'beside', drop: 0, rect: { x: 0, y: 0, w: 1, h: 1 } };
  const gate = extra => C.mapTipGate({ free: true, now: 10_000, cardChangedAt: null, allowedThisOpen: true, spot, ...extra });
  assert.ok(gate({}));
  assert.equal(gate({ cardChangedAt: 10_000 - 400 }), null, 'the card is still sliding in');
  assert.ok(gate({ cardChangedAt: 10_000 - C.TIP_CARD_SETTLE_MS }), 'settled');
  assert.equal(gate({ spot: null }), null, 'no room: it waits');
  assert.equal(gate({ free: false }), null);
  assert.equal(gate({ allowedThisOpen: false }), null);
  assert.equal(C.mapTipAllowed('open-1', 'map_compass', null, null), true);
  assert.equal(C.mapTipAllowed('open-1', 'map_compass', 'open-1', 'park_hud'), false, 'another tip already had this open');
  assert.equal(C.mapTipAllowed('open-1', 'map_compass', 'open-1', 'map_compass'), true, 'the same tip keeps showing');
  assert.equal(C.mapTipAllowed('open-2', 'map_compass', 'open-1', 'park_hud'), true, 'a new open, a new tip');
});

test('(c) a treat under a corner button or the card is under chrome; one in the open map is not', () => {
  const layout = home({ raidChip: true });
  const reserved = layout.reserved.map(r => r.rect);
  const shelf = layout.reserved.find(r => r.kind === 'shelf').rect;
  const menu = layout.reserved.find(r => r.kind === 'menu').rect;
  assert.ok(C.underChrome({ x: shelf.x + 30, y: shelf.y - 4 }, reserved), 'the sunscreen behind the Shelf');
  assert.ok(C.underChrome({ x: menu.x + 10, y: menu.y + 20 }, reserved), 'the pickle behind the menu disc');
  assert.ok(C.underChrome({ x: 100, y: layout.cardRect.y + 60 }, reserved), 'under the card');
  assert.ok(!C.underChrome({ x: PRO.width / 2, y: PRO.height / 2 }, reserved), 'the open map');
  assert.ok(C.underChrome({ x: PRO.width - 20, y: PRO.height - 12 }, reserved), 'behind the footer wave (r-home-05)');
  assert.ok(C.underChrome({ x: PRO.width - 8, y: 400 }, reserved, undefined, PRO), 'cut off by the right edge');
  assert.ok(!C.underChrome({ x: 200, y: 400 }, reserved, undefined, PRO));
});

test('(d) edge arrows: one per side led by the nearest find, merged with a count, never touching, never on chrome', () => {
  const layout = home();
  const reserved = layout.reserved.map(r => r.rect);
  const inset = { top: 12 + 92 + 8 + 62, bottom: 190, side: 30 };
  const f = (id, x, y, distance) => ({ id, point: { x, y }, distance });
  // His screenshot: pretzel and hot dog both off the right edge, one above the other.
  const finds = [f('pretzel', 520, 430, 90), f('hotdog', 530, 470, 120), f('pizza', 200, -200, 220), f('cake', -150, 400, 160)];
  const tokens = C.edgeTokens(finds, PRO, inset, reserved);
  const right = tokens.filter(t => t.side === 'right');
  assert.equal(right.length, 1, 'one arrow on the right');
  assert.equal(right[0].lead.id, 'pretzel', 'the nearest leads');
  assert.equal(right[0].count, 2);
  for (const a of tokens) for (const b of tokens) {
    if (a === b) continue;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= C.EDGE_TOKEN, `${a.lead.id} and ${b.lead.id} do not touch`);
  }
  for (const t of tokens) {
    const box = { x: t.x - C.EDGE_TOKEN / 2, y: t.y - C.EDGE_TOKEN / 2, w: C.EDGE_TOKEN, h: C.EDGE_TOKEN };
    for (const r of reserved) assert.ok(!hits(box, r), `${t.lead.id} sits clear of the chrome`);
  }
  assert.equal(tokens.reduce((n, t) => n + t.count, 0), finds.length, 'every find is still counted');
});

test('(d) two sides whose arrows would meet at a corner merge into one', () => {
  const inset = { top: 100, bottom: 190, side: 30 };
  const f = (id, x, y, distance) => ({ id, point: { x, y }, distance });
  // Just past the top right corner of the safe box: one leaves by the top, one by the right, a few points apart.
  const tokens = C.edgeTokens([f('a', PRO.width - 20, 60, 50), f('b', PRO.width + 10, 98, 70)], PRO, inset, []);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].count, 2);
  assert.equal(tokens[0].lead.id, 'a');
});

test('(e) one cue per marker: the target wears the hand and the rings, any other new find only its NEW tag', () => {
  assert.deepEqual(plain(C.markerCues({ isNew: true, inRange: true, target: true, grouped: false })),
    { finger: true, newTag: false, newDot: false, rings: true }, 'his donut: hand, not hand plus NEW');
  assert.deepEqual(plain(C.markerCues({ isNew: false, inRange: true, target: false, grouped: false })),
    { finger: false, newTag: false, newDot: false, rings: false }, 'his popcorn: no rings off target');
  assert.deepEqual(plain(C.markerCues({ isNew: true, inRange: true, target: false, grouped: false })).newTag, true);
  assert.deepEqual(plain(C.markerCues({ isNew: true, inRange: false, target: false, grouped: false })).newDot, true);
  assert.deepEqual(plain(C.markerCues({ isNew: true, inRange: true, target: false, grouped: true })).newTag, false);
});

test('(g) at rest: the edge arrows step back while a treat is in range', () => {
  assert.equal(C.edgesAtRest({ targetInRange: true }), false);
  assert.equal(C.edgesAtRest({ targetInRange: false }), true);
});

test('the home map and the park map read their chrome from the one owner', () => {
  const homeSrc = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.doesNotMatch(homeSrc, /LIVE_BAR_ROW/, 'no second rule that drops the card for the raid');
  assert.match(homeSrc, /controlsTop=\{chrome\.controlsTop\}/);
  assert.match(homeSrc, /underChrome\(point, reservedRef\.current, undefined, containerSize\)/);
  assert.match(homeSrc, /edgeTokens\(edgeFinds, containerSize/);
  assert.doesNotMatch(homeSrc, /edgeArrowPlacement/);
  const chip = read('src/screens/ExploreScreen/HomeHuntChip.tsx');
  assert.doesNotMatch(chip, /textDecorationLine: 'underline'/, '(f) no underlined link in the pill');
  assert.match(chip, /onLongPress=\{message\.longPress\?\.onPress \?\? noop\}/, '(f) Report is a long press');
  const map = read('src/components/Map.tsx');
  assert.match(map, /mapTipGate\(\{ free: hintReady/);
  const park = read('src/screens/ExploreScreen.tsx');
  assert.match(park, /tipCard=\{guideShown \?/);
  assert.match(park, /mapTipAllowed\(currentAppOpen\(\), parkTip\)/);
});

const E = loadTs('src/screens/ExploreScreen/findEdges.ts');

test('(h) markers never overlap: touching markers draw as one with a count, one NEW tag at most', () => {
  // Critic M1 (SE, cr-13): three treats piled on the shark, two NEW tags stacked one above the other.
  const out = E.clusterFinds([
    { pivot: 1, x: 150, y: 260, distance: 6 },
    { pivot: 2, x: 190, y: 225, distance: 12 },
    { pivot: 3, x: 280, y: 270, distance: 30 },
  ]);
  assert.deepEqual(plain(out.counts), { 1: 2 }, 'the pair that touches is one marker, the nearer find leads');
  assert.deepEqual(plain(out.hidden), [2]);
  // No two markers that still show touch.
  const shown = [{ x: 150, y: 260 }, { x: 280, y: 270 }];
  assert.ok(!hits(E.markerBox(shown[0]), E.markerBox(shown[1])));
  // Grouped markers wear no NEW tag (one cue per marker): never two stacked.
  assert.equal(C.markerCues({ isNew: true, inRange: true, target: false, grouped: true }).newTag, false);
});

test('(h) the shark is reserved: a treat on it folds into the nearest marker still showing; the hand keeps its own', () => {
  const shark = { x: 187, y: 260 };
  const out = E.clusterFinds([
    { pivot: 10, x: 150, y: 300, distance: 5 },   // the hand's treat, beside the shark
    { pivot: 11, x: 200, y: 230, distance: 9 },   // behind the shark's head
    { pivot: 12, x: 320, y: 420, distance: 40 },  // far and clear
  ], { shark, keep: 10 });
  assert.ok(!out.hidden.includes(10), 'the target treat is never folded away');
  assert.ok(out.hidden.includes(11), 'the treat behind the shark folds');
  assert.equal(Object.values(plain(out.counts)).reduce((a, b) => a + b, 0), 2, 'its count joins a marker that shows');
  assert.ok(!out.hidden.includes(12));
  // A treat on the shark with no other marker showing still shows (nothing vanishes).
  const lone = E.clusterFinds([{ pivot: 20, x: 190, y: 250, distance: 3 }], { shark, keep: null });
  assert.deepEqual(plain(lone.hidden), []);
  // HomeExplore groups only the finds that show, around the real shark, keeping the hand's treat.
  const homeSrc = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(homeSrc, /clusterFinds\(\[\.\.\.next\.entries\(\)\]\.filter\(\(\[pivot\]\) => !covered\.has\(pivot\) && !caughtPivots\.has\(pivot\)\)/);
  assert.match(homeSrc, /\{ shark, keep \}\)/);
});

test('(c) a marker cut by the screen edge is an edge arrow: its pill never peeks (critic M2)', () => {
  const layout = home();
  const reserved = layout.reserved.map(r => r.rect);
  assert.ok(C.underChrome({ x: 18, y: 400 }, reserved, undefined, PRO), '18 pt inside the left edge: the pill would be cut');
  assert.ok(C.underChrome({ x: PRO.width - 30, y: 400 }, reserved, undefined, PRO), '30 pt inside the right edge');
  assert.ok(!C.underChrome({ x: 60, y: 400 }, reserved, undefined, PRO), 'fully on screen');
  const homeSrc = read('src/screens/ExploreScreen/HomeExplore.tsx');
  // A point just off screen (10 pt outside) is hidden too and becomes an edge arrow candidate.
  assert.match(homeSrc, /if \(off \|\| under\) covered\.add\(item\.pivot_id\);/);
  assert.match(homeSrc, /if \(off \|\| under\) edges\.push\(\{ item, point, distance \}\);/);
});

test('(e) one cue per reward: while the home card names a reward, the rail chest drops its number', () => {
  const btn = read('src/components/map/RewardsButton.tsx');
  assert.match(btn, /model\.count > 0 && !cardHasIt && <View style=\{styles\.count\}/);
  const homeSrc = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(homeSrc, /const rewardCard = guideShown && homeStep\?\.key === 'reward';/);
  const park = read('src/screens/ExploreScreen.tsx');
  assert.match(park, /cardHasIt=\{homeRewardCard && !atParkNow\}/);
  assert.match(park, /onRewardCardChange=\{setHomeRewardCard\}/);
});

test('(c, h) a hidden find never draws or takes a tap: the catch hand-off style keeps it hidden (root of M1 and M2)', () => {
  const item = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(item, /const handOff = useAnimatedStyle\(\(\) => \(\{ opacity: hidden \|\| catchHidePivot\.value === myPivot \? 0 : 1 \}\), \[myPivot, hidden\]\);/);
  assert.match(item, /style=\{\[styles\.box, hidden && styles\.hidden, handOff\]\}/);
  const marker = read('src/screens/ExploreScreen/HomeFindMarker.tsx');
  assert.match(marker, /touchEnabled=\{!hidden\}/);
  // The group's count never sits under the hand.
  assert.match(item, /cues\.finger && !below && styles\.countBadgeLow, cues\.finger && !leftSide && styles\.countBadgeRight/);
});
