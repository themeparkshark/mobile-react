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
  assert.equal(m.fadeHeight(400), 26); assert.equal(m.fadeHeight(0), 26);
  // A short page's fade is about a third of it, so a cut row dissolves instead of ending on a hard edge.
  assert.equal(m.fadeHeight(60), 21); assert.equal(m.fadeHeight(30), 12, 'never thinner than 12');
  assert.ok(m.fadeHeight(60) >= 60 * 0.35 - 0.5);
});

test('every LinePlay page is a framed window that stays put above the rail', () => {
  const screen = read(SCREEN);
  assert.doesNotMatch(screen, /pageEdgeFade|pagesEnd|measurePages/, 'the screen no longer paints a fade in the water color');
  assert.match(screen, /<LinearGradient colors=\{backdrop\} style=\{StyleSheet\.absoluteFill\} \/>/);
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /const fade = frameFade\(fill\);/, 'the fade is made from the frame fill');
  assert.match(scroll, /<LinearGradient colors=\{fade\.colors\} locations=\{fade\.locations\}/);
  assert.match(scroll, /overflow: 'hidden'/, 'content scrolls inside the frame, the frame itself never moves');
  // Scrolling is watched on the UI thread; the JS thread hears only when "more below" flips.
  assert.match(scroll, /useAnimatedScrollHandler\(\{/);
  assert.match(scroll, /if \(next !== shownMore\.value\) \{\n\s*shownMore\.value = next;\n\s*runOnJS\(setMoreScrolled\)\(next\);/);
  assert.doesNotMatch(scroll, /scrollEventThrottle=\{48\}/);
  assert.match(read('src/services/lineplay/lineLayout.ts'), /export function moreBelow\([^)]*\): boolean \{\n\s*'worklet';/,
    'moreBelow runs on the UI thread');
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

test('PLAY NOW is always whole: the page leads with it, shrinks it to one row, or the window steps aside', () => {
  const m = layout();
  // The page's real height decides (it shrinks while Details is open), on every phone.
  assert.equal(m.chapterPageFit(400, false), 'full', 'Pro Max, roomy page: header, then the big PLAY NOW');
  assert.equal(m.chapterPageFit(227, false), 'compact', '17 Pro: PLAY NOW first, then a one-line header');
  assert.equal(m.chapterPageFit(149, false), 'compact', '17 Pro reading Details: PLAY NOW still first and whole');
  assert.equal(m.chapterPageFit(400, true), 'compact', 'a short phone always leads with PLAY NOW');
  assert.equal(m.chapterPageFit(82, true), 'strip', 'SE: a one-row PLAY NOW strip that fits whole');
  assert.equal(m.chapterPageFit(0, false), 'full', 'before layout nothing jumps');
  // PLAY NOW (64 pt, after 6 pt padding) always clears the fade in compact.
  for (const view of [m.CHAPTER_COMPACT_PAGE, 149, 200, 261]) assert.ok(6 + 64 <= view - m.fadeHeight(view), `compact at ${view}`);
  assert.ok(m.CHAPTER_STRIP <= 82 - 0, 'the strip fits an SE page with the crew row showing');
  // Shorter than the strip plus its frame: the window is not drawn at all (an SE reading Details).
  assert.equal(m.pageWindowShown(30), false); assert.equal(m.pageWindowShown(m.PAGE_WINDOW_MIN), true);
  assert.equal(m.pageWindowShown(0), true, 'before layout the window shows');
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(card, /const fit = chapterPageFit\(viewHeight, shortScreen\);/);
  assert.match(card, /if \(fit === 'strip'\) \{/);
  assert.match(card, /<PageScroll fill=\{FRAME_FILL\} contentStyle=\{styles\.contentStrip\} onLayout=\{measure\} still>/,
    'the strip never scrolls, fades or shows an arrow');
  assert.match(card, /<GameIcon name="play" size=\{40\} \/>/);
  assert.match(card, /const rise = riseFor\(useUiReducedMotion\(\) \|\| entered\.current\);/, 'a layout switch never replays the entrance');
  const screen = read(SCREEN);
  assert.match(screen, /const pagesShown = pageWindowShown\(pagesHeight\);/);
  assert.match(screen, /<View style=\{\[styles\.pagesInner, !pagesShown && styles\.pagesHidden\]\}/,
    'hidden, not unmounted: the page and its scroll spot stay put');
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /const more = moreBelowNow && !still;/);
});

test('the navigation board fits a short page whole, above the fade', () => {
  const m = layout(), nav = m;
  assert.equal(nav.BOARD_FLOOR, 110);
  // A 17 Pro page (227 pt, 60 pt header): the whole board sits above the fade.
  const side = nav.boardSideFor({ width: 366, height: 227 }, 60);
  assert.ok(side >= 110 && side <= 227 - m.fadeHeight(227) - 60 - (8 + 6 + 3 + 6), `board ${side}`);
  assert.equal(nav.boardTight(227), true); assert.equal(nav.boardTight(500), false);
  assert.equal(nav.boardSideFor({ width: 366, height: 700 }, 92), 286, 'a roomy page is limited by width');
  assert.equal(nav.boardSideFor({ width: 366, height: 82 }, 60), 110, 'never smaller than the floor');
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /contentStyle=\{\[styles\.card, tight && styles\.cardTight\]\}/);
  assert.match(card, /<KidText style=\{styles\.kicker\} numberOfLines=\{1\}>\{kicker\}<\/KidText>/);
});

test('Details opens smoothly: one commit, the crew row fades and the page window fades back in at its new size', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /LayoutAnimation/, 'LayoutAnimation does not animate on the new architecture');
  assert.match(card, /setExpanded\(next\);\n\s*onDetailsChange\?\.\(next\);/, 'same event, same commit: no pop');
  assert.equal((card.match(/onPress=\{toggleDetails\}/g) ?? []).length, 2);
  assert.match(card, /entering=\{reducedMotion \? undefined : FadeIn\.delay\(100\)\.duration\(180\)\}/);
  const screen = read(SCREEN);
  assert.match(screen, /exiting=\{reducedFx \? undefined : FadeOut\.duration\(140\)\}>\{groupPlay\.strip\}<\/Reanimated\.View>/);
  // No glide through a square clip (it cut glyphs mid-move): the window takes its new size unseen,
  // then fades back in once it has its new size (its onLayout, or a timer).
  assert.doesNotMatch(screen, /LinearTransition/);
  assert.match(screen, /<Reanimated\.View style=\{\[styles\.pages, pagesFadeStyle\]\}/);
  assert.match(screen, /pagesFade\.value = 0;\n\s*revealPending\.current = true;/);
  assert.match(screen, /onLayout=\{event => \{ setPagesHeight\(Math\.round\(event\.nativeEvent\.layout\.height\)\); revealPages\(\); \}\}/);
  assert.match(screen, /pages: \{ flex: 1 \}/, 'no square overflow clip on the page window');
  assert.match(screen, /onDetailsChange=\{onDetailsChange\}/);
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
  assert.match(card, /'An hour in line!'/, 'no lone 1 that reads like a capital I');
  assert.match(card, /<KidText style=\{styles\.detailLineText\}>\{line\}<\/KidText>/, 'numbers in the flagged-1 font');
  assert.match(card, /<GameIcon name=\{heroDetailIcon\(index\)\} size=\{20\} \/>/);
  assert.match(card, /detailLineText: \{[^}]*fontSize: 15/);
  assert.match(card, /hitSlop=\{\{ top: 8, bottom: 8, left: 12, right: 12 \}\}/, 'Details is a big target');
  assert.match(card, /rotate: expanded \? '-90deg' : '90deg'/, 'an arrow shows it opens and closes');
  assert.doesNotMatch(card, /That is the ride sign/);
  // The Marathon line uses the same 20 pt icon column as the other lines, caption first, badge after.
  assert.match(card, /<GameIcon name=\{stampIcon\(stamp\.kind\)\} size=\{20\} \/>\n\s*<KidText style=\{styles\.detailLineText\}>\{stampCaption\(stamp\.kind\)\}<\/KidText>\n\s*<WaitStampBadge/);
  const kid = loadTs('src/screens/LinePlay/components/KidText.tsx', { react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native': {} });
  assert.deepEqual(plain(kid.digitRuns('7:21 until your next Ride Part')), [{ text: '7:21', digits: true }, { text: ' until your next Ride Part', digits: false }]);
  assert.deepEqual(plain(kid.digitRuns('CLUE 1 OF 3')).filter(run => run.digits).map(run => run.text), ['1', '3']);
});
