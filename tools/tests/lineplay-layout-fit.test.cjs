'use strict';
/**
 * LinePlay fits every phone: the STORY / Next rail never sits on a mission
 * header, a long page ends in a fade instead of a cut through text, and the
 * Welcome tip's OK never lets the tap land on the wait card's Details.
 */
const assert = require('node:assert/strict'), test = require('node:test'), fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const layout = () => loadTs('src/services/lineplay/lineLayout.ts');
const read = file => fs.readFileSync(file, 'utf8');
const SCREEN = 'src/screens/LinePlay/LinePlayScreen.tsx';

test('an iPhone SE tightens up; a 17 Pro and a Pro Max keep the full coin', () => {
  const m = layout();
  // usable = height minus the safe areas
  const se = m.lineScreenFit(667, 20, 0);
  assert.equal(se.short, true); assert.equal(se.coinSize, 92); assert.ok(se.activityGap < 8);
  const pro = m.lineScreenFit(874, 62, 34);
  assert.equal(pro.short, false); assert.equal(pro.coinSize, 120);
  assert.equal(m.lineScreenFit(956, 62, 34).short, false, 'Pro Max');
  assert.equal(m.lineScreenFit(0, 0, 0).short, false, 'before the first layout nothing jumps');
});

test('the page fade ends in the exact water color behind it', () => {
  const m = layout();
  const day = ['#0a7dd1', '#07569e', '#073e87'];
  assert.deepEqual(plain(m.gradientColorAt(day, 0)), [10, 125, 209]);
  assert.deepEqual(plain(m.gradientColorAt(day, 0.5)), [7, 86, 158]);
  assert.deepEqual(plain(m.gradientColorAt(day, 1)), [7, 62, 135]);
  assert.deepEqual(plain(m.gradientColorAt(day, 0.75)), [7, 74, 147]);
  assert.deepEqual(plain(m.pageEdgeFade(day, 1)), ['rgba(7,62,135,0)', 'rgba(7,62,135,1)']);
  assert.deepEqual(plain(m.gradientColorAt(day, Number.NaN)), [7, 62, 135], 'a bad measure falls back to the bottom color');
});

test('pages end above the rail in a fade, measured against the same backdrop the screen draws', () => {
  const screen = read(SCREEN);
  assert.match(screen, /<View ref=\{pagesRef\} onLayout=\{measurePages\} collapsable=\{false\} style=\{styles\.pages\}>/);
  assert.match(screen, /<LinearGradient pointerEvents="none" colors=\{pageEdgeFade\(backdrop, pagesEnd\)\}/);
  assert.match(screen, /<LinearGradient colors=\{backdrop\} style=\{StyleSheet\.absoluteFill\} \/>/);
  // The fade sits inside the pages box, so the rail below is never covered.
  const fade = screen.indexOf('pageEdgeFade(backdrop');
  const rail = screen.indexOf('<ActivityPageRail');
  assert.ok(fade > 0 && fade < rail);
  assert.match(screen, /coinSize=\{fit\.coinSize\}/);
  assert.match(screen, /marginTop: fit\.activityGap/);
  assert.match(screen, /\{!\(fit\.short && detailsOpen\) && groupPlay\.strip\}/, 'a short phone reading Details lends the crew row to the page');
  assert.match(read('src/screens/LinePlay/components/WaitCard.tsx'), /onDetailsChangeRef\.current\?\.\(expanded\)/);
});

test('the Welcome tip waits for its own tap and sits under the wait card, never on Details', () => {
  const screen = read(SCREEN);
  for (const id of ['lineplay_intro', 'first_ride_part']) {
    const tag = screen.slice(screen.indexOf(`<OneTimeTip id="${id}"`), screen.indexOf('/>', screen.indexOf(`<OneTimeTip id="${id}"`)));
    assert.match(tag, /autoHideMs=\{0\}/, `${id}: no 9 s timer that could vanish under a finger`);
    assert.match(tag, /top: waitCardBottom \+ 6/, `${id}: anchored under the wait card`);
  }
  assert.match(screen, /setWaitCardBottom\(Math\.round\(y \+ height\)\)/);
  const tip = read('src/components/help/OneTimeTip.tsx');
  assert.match(tip, /autoHideMs != null \? \{ autoHideMs \} : null/);
  const coach = read('src/components/help/CoachTip.tsx');
  assert.match(coach, /if \(autoHideMs <= 0\) return;/, 'CoachTip: 0 means no timer');
  // The card itself is one Pressable: a tap on OK (or anywhere on it) closes it and nothing under it.
  assert.match(coach, /<Pressable accessibilityRole="button"[^>]*\n\s*onPress=\{onDismiss\}/);
});

test('Details reads like the card: big lines with a picture each, and a Marathon mark says what it means', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /stampCaption\(stamp\.kind\)/);
  assert.match(card, /'1 hour in line!'/);
  assert.match(card, /<GameIcon name=\{heroDetailIcon\(index\)\} size=\{20\} \/>/);
  assert.match(card, /detailLineText: \{[^}]*fontSize: 15/);
  assert.match(card, /hitSlop=\{\{ top: 8, bottom: 8, left: 12, right: 12 \}\}/, 'Details is a big target');
  assert.match(card, /rotate: expanded \? '-90deg' : '90deg'/, 'an arrow shows it opens and closes');
  assert.doesNotMatch(card, /That is the ride sign/);
});
