'use strict';
/**
 * Tutorial flow (WS8): tutorials start only when a screen's content is on
 * screen, Finn parks above the spotlit "next park coin" card, the scrim is
 * navy, and the copy is accurate and free of third-party phrases.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const layout = loadTs('src/components/Tutorial/tutorialLayout.ts');
const { getStepsForSequence } = loadTs('src/components/Tutorial/steps.ts');

test('a tutorial starts only after progress loads and the screen content is ready', () => {
  const base = { loaded: true, completed: false, active: false, contentReady: true };
  assert.equal(layout.canStartTutorial(base), true);
  assert.equal(layout.canStartTutorial({ ...base, contentReady: false }), false, 'never over a spinner');
  assert.equal(layout.canStartTutorial({ ...base, loaded: false }), false);
  assert.equal(layout.canStartTutorial({ ...base, completed: true }), false);
  assert.equal(layout.canStartTutorial({ ...base, active: true }), false);
});

test('Finn sits above the spotlit card when there is room, else keeps the default offset', () => {
  const step = { placement: 'above-spotlight' };
  const card = { x: 16, y: 560, width: 358, height: 120, shape: 'rounded', padding: 8 };
  const offset = layout.teacherBottomOffset(step, card, 844, 120);
  assert.equal(offset, 844 - (560 - 8) + layout.ABOVE_SPOTLIGHT_GAP);
  assert.ok(844 - offset <= card.y - 8, 'Finn and the bubble end above the card');
  assert.equal(layout.teacherBottomOffset(step, { ...card, y: 180 }, 844, 120), 120, 'no room above: default');
  assert.equal(layout.teacherBottomOffset(step, null, 844, 120), 120, 'card not registered: default');
  assert.equal(layout.teacherBottomOffset({}, card, 844, 20), 20);
});

test('first-park guide spotlights the next park coin with a one-line subtitle', () => {
  for (const inPark of [true]) {
    const [warmup, ride] = getStepsForSequence('onboarding', { inPark });
    assert.equal(warmup.activity, 'memory_warmup');
    assert.equal(ride.spotlightRef, 'next_park_coin');
    assert.equal(ride.placement, 'above-spotlight');
    assert.ok(ride.subtitle.length <= 52, `subtitle fits one line: ${ride.subtitle}`);
    // No screen registers 'next_park_coin' yet, so the line must not point at the card.
    assert.doesNotMatch(ride.text, /\bthis is\b|\bhere\b|\bthis card\b/i, 'copy does not depend on the spotlight');
  }
  const arrival = getStepsForSequence('park_arrival');
  assert.equal(arrival[1].placement, 'above-spotlight');
});

test('tutorial copy: no third-party phrases, no em dashes, accurate Community Center rewards', () => {
  const all = ['onboarding', 'home_first_find', 'park_arrival', 'park', 'store', 'gym', 'community_center', 'friends', 'pins']
    .flatMap(sequence => getStepsForSequence(sequence));
  for (const step of all) {
    const copy = `${step.title ?? ''} ${step.text} ${step.subtitle ?? ''}`;
    assert.doesNotMatch(copy, /gotta catch|premium|—/i, step.id);
  }
  const cc = getStepsForSequence('community_center')[0];
  assert.match(cc.subtitle, /350 coins/);
  assert.match(cc.subtitle, /2 Tickets/);
  assert.match(cc.subtitle, /1 Ticket/);
});

test('the spotlight scrim is navy, never black, and screens do not start tutorials on a timer', () => {
  const overlay = fs.readFileSync(path.join(root, 'src/components/Tutorial/SpotlightOverlay.tsx'), 'utf8');
  assert.doesNotMatch(overlay, /rgba\(0,\s*0,\s*0/);
  assert.match(overlay, /rgba\(4,40,90,/);
  const friends = fs.readFileSync(path.join(root, 'src/screens/FriendsScreen.tsx'), 'utf8');
  assert.doesNotMatch(friends, /setTimeout\(\(\) => startTutorial/);
  assert.match(friends, /useTutorialWhenReady\('friends', listReady\)/);
});
