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

test('a page fades into its OWN frame color, never toward the dark water (no olive band over a yellow card)', () => {
  const m = layout();
  // A near-white mist of the frame fill (70% toward white): yellow goes cream, never olive.
  assert.deepEqual(plain(m.frameFade('#bcecff')), { colors: ['rgba(235,249,255,0)', 'rgba(235,249,255,1)', 'rgba(235,249,255,1)'],
    locations: [0, 0.62, 1] });
  assert.deepEqual(plain(m.frameFade('#fff8e4').colors[1]), 'rgba(255,253,247,1)');
  const [r, g, b] = m.frameFade('#d9f4ff').colors[1].match(/\d+/g).map(Number);
  // Half-way over a gold card (#ffcf3b) the mix stays a warm cream: red and green high, no green cast.
  const mix = [255, 207, 59].map((c, i) => (c + [r, g, b][i]) / 2);
  assert.ok(mix[0] >= mix[1] && mix[0] > 240, `cream, not olive: ${mix}`);
  assert.equal(m.gradientColorAt, undefined, 'no fade blends toward the backdrop any more');
  assert.equal(m.pageEdgeFade, undefined);
  // The arrow and fade show only while more is below.
  assert.equal(m.moreBelow(800, 300, 0), true);
  assert.equal(m.moreBelow(800, 300, 495), false, 'scrolled to the end: nothing covers the last line');
  assert.equal(m.moreBelow(305, 300, 0), false, 'a page that just fits shows no arrow');
  assert.equal(m.moreBelow(0, 300, 0), false, 'before layout nothing shows');
  assert.equal(m.fadeHeight(400), 26); assert.equal(m.fadeHeight(80), 11, 'a short page gets a short fade'); assert.equal(m.fadeHeight(0), 26);
});

test('every LinePlay page is a framed window that stays put above the rail', () => {
  const screen = read(SCREEN);
  assert.doesNotMatch(screen, /pageEdgeFade|pagesEnd|measurePages/, 'the screen no longer paints a fade in the water color');
  assert.match(screen, /<LinearGradient colors=\{backdrop\} style=\{StyleSheet\.absoluteFill\} \/>/);
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /const fade = frameFade\(fill\);/, 'the fade is made from the frame fill');
  assert.match(scroll, /<LinearGradient colors=\{fade\.colors\} locations=\{fade\.locations\}/);
  assert.match(scroll, /overflow: 'hidden'/, 'content scrolls inside the frame, the frame itself never moves');
  assert.match(scroll, /accessibilityLabel="More below\. Scroll down\."/);
  for (const [file, fill] of [['ChapterCard', 'FRAME_FILL'], ['SignalCard', '"#d8f4ff"'], ['CrewRelayCard', '"#d9f4ff"'],
    ['CrewPuzzleCard', '"#d9f4ff"'], ['CrewGridCard', '"#89d7fc"'], ['NavigationPanelCard', 'BRAND.cream'], ['ActivitySlot', 'CARD_FILL']]) {
    const src = read(`src/screens/LinePlay/components/${file}.tsx`);
    assert.ok(src.includes(`fill={${fill.replace(/"/g, '')}}`) || src.includes(`fill=${fill}`), `${file} uses PageScroll with its own fill`);
    assert.doesNotMatch(src, /<ScrollView\s/, `${file}: no page scrolls its frame away`);
  }
  assert.match(screen, /coinSize=\{fit\.coinSize\}/);
  assert.match(screen, /marginTop: fit\.activityGap/);
  assert.match(screen, /compact=\{fit\.short\}/, 'a short phone gets the one-line mission header');
  assert.match(screen, /\{!\(fit\.short && detailsOpen\) && <Reanimated\.View/, 'a short phone reading Details lends the crew row to the page');
});

test('on a short phone the chapter page puts PLAY NOW on screen: one-line header, slimmer clue card', () => {
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(card, /compact && styles\.headerCompact/);
  assert.match(card, /headerCompact: \{ minHeight: 0, height: 58 \}/);
  assert.match(card, /compact && styles\.playNowCompact/);
  assert.match(card, /\{!compact && <Text style=\{styles\.playNowHint\}>/);
  assert.match(card, /\{compact \? <>\{playNow\}\{header\}<\/> : <>\{header\}\{playNow\}<\/>\}/, 'SE: the clue to play comes first');
});

test('Details opens smoothly: one commit, the crew row fades and the pages glide on the UI thread', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /LayoutAnimation/, 'LayoutAnimation does not animate on the new architecture');
  assert.match(card, /setExpanded\(next\);\n\s*onDetailsChange\?\.\(next\);/, 'same event, same commit: no pop');
  assert.equal((card.match(/onPress=\{toggleDetails\}/g) ?? []).length, 2);
  assert.match(card, /entering=\{reducedMotion \? undefined : FadeIn\.delay\(100\)\.duration\(180\)\}/, 'the lines fade in as the page glides away from them');
  const screen = read(SCREEN);
  assert.match(screen, /exiting=\{reducedFx \? undefined : FadeOut\.duration\(140\)\}>\{groupPlay\.strip\}<\/Reanimated\.View>/);
  assert.match(screen, /<Reanimated\.View layout=\{reducedFx \? undefined : LinearTransition\.duration\(220\)\} style=\{styles\.pages\}>/,
    'only the page window glides; the rail under it never moves');
  assert.match(screen, /pages: \{ flex: 1, overflow: 'hidden' \}/, 'while it glides it never slides under the rail');
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
  // The Marathon line uses the same 20 pt icon column as the other lines, caption first, badge after.
  assert.match(card, /<GameIcon name=\{stampIcon\(stamp\.kind\)\} size=\{20\} \/>\n\s*<Text style=\{styles\.detailLineText\}>\{stampCaption\(stamp\.kind\)\}<\/Text>\n\s*<WaitStampBadge/);
});
