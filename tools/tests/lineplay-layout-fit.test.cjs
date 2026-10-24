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
  assert.match(screen, /const crewLent = crewRowLent\(fit\.short, detailsOpen, boardPage\);/);
  assert.match(screen, /\{!crewLent && <Reanimated\.View/, 'a short phone reading Details (or on the board page) lends the crew row to the page');
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
  assert.equal(m.chapterPageFit(440, false), 'full', 'a roomy page: header, then the big PLAY NOW, then the named trail');
  assert.equal(m.chapterPageFit(364, false), 'compact', 'Pro Max: the named trail would end in the fade, so PLAY NOW leads');
  assert.equal(m.chapterPageFit(227, false), 'compact', '17 Pro: PLAY NOW first, then a one-line header');
  assert.equal(m.chapterPageFit(149, false), 'compact', '17 Pro reading Details: PLAY NOW still first and whole');
  assert.equal(m.chapterPageFit(400, true), 'compact', 'a short phone always leads with PLAY NOW');
  assert.equal(m.chapterPageFit(82, true), 'strip', 'SE: a one-row PLAY NOW strip that fits whole');
  // A real iPhone SE closed page is 112 to 116 pt (it moves a few points with the coin chip): always the strip,
  // never a flip to compact with the header's title sliced by the fade.
  for (const view of [110, 112, 115, 116, 120]) assert.equal(m.chapterPageFit(view, true), 'strip', `SE closed at ${view}`);
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
  assert.match(screen, /const pagesShown = pageWindowShown\(pagesHeight, detailsOpen\);/);
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
  assert.match(card, /contentStyle=\{\[styles\.card, tight && styles\.cardTight, viewport\.height <= 0 && styles\.unmeasured\]\}/);
  assert.match(card, /<KidText style=\{styles\.kicker\} numberOfLines=\{1\}>\{kicker\}<\/KidText>/);
});

test('Details opens smoothly: one commit, the crew row fades and the page window fades back in at its new size', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /LayoutAnimation/, 'LayoutAnimation does not animate on the new architecture');
  assert.match(card, /setExpanded\(next\);\n\s*onDetailsChange\?\.\(next\);/, 'same event, same commit: no pop');
  assert.equal((card.match(/onPress=\{toggleDetails\}/g) ?? []).length, 2);
  assert.match(card, /entering=\{reducedMotion \? undefined : FadeIn\.delay\(100\)\.duration\(180\)\}/);
  const screen = read(SCREEN);
  assert.match(screen, /exiting=\{reducedFx \|\| fit\.short \? undefined : FadeOut\.duration\(140\)\}\n\s*onLayout=\{event => setCrewRowHeight\(Math\.round\(event\.nativeEvent\.layout\.height\)\)\}>\{groupPlay\.strip\}<\/Reanimated\.View>/);
  // No glide through a square clip (it cut glyphs mid-move), and no blink: the window dips to 35%
  // (never 0), takes its new size inside its own rounded frame, then rises once it has its new size.
  assert.equal((screen.match(/LinearTransition/g) ?? []).length, 2, 'only the rail glides (import + one use)');
  assert.match(screen, /<Reanimated\.View style=\{\[styles\.pages, pagesFadeStyle, !pagesShown && \[styles\.pagesAside, \{ bottom: railBlock \}\]\]\}/);
  // Dip first with the old layout, THEN change the size while dim, then rise two frames after the new layout.
  assert.match(screen, /pagesFade\.value = withTiming\(PAGES_DIP_OPACITY, \{ duration: PAGES_DIP_MS \}\);\n\s*dipTimer\.current = setTimeout\(\(\) => \{/);
  assert.match(screen, /revealPending\.current = true;\n\s*changes\.forEach\(apply => apply\(\)\);/);
  assert.match(screen, /requestAnimationFrame\(\(\) => requestAnimationFrame\(rise\)\);/);
  assert.match(screen, /dipPages\(\(\) => setDetailsOpen\(open\)\);/);
  assert.doesNotMatch(screen, /pagesFade\.value = 0/, 'never an empty window');
  assert.doesNotMatch(screen, /withTiming\(0, \{ duration: 0 \}\)/);
  const m = layout();
  assert.ok(m.PAGES_DIP_OPACITY >= 0.3 && m.PAGES_DIP_OPACITY < 1);
  assert.ok(m.PAGES_DIP_MS + m.PAGES_RISE_MS < 220, 'dip plus rise under 220 ms');
  assert.ok(m.PAGES_DIP_MS + m.PAGES_RISE_FALLBACK_MS + m.PAGES_RISE_MS < 320, 'the fallback rise starts soon too');
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /clip: \{ flex: 1, borderRadius: borderRadius\.xxl - RIM, overflow: 'hidden' \}/,
    'the dimmed page is clipped by its own rounded frame, never a square edge');
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
  assert.match(card, /<GameIcon name=\{heroDetailIcon\(line\)\} size=\{20\} \/>/);
  assert.match(card, /detailLineText: \{[^}]*fontSize: 15/);
  assert.match(card, /hitSlop=\{\{ top: 8, bottom: 8, left: 12, right: 12 \}\}/, 'Details is a big target');
  assert.match(card, /rotate: expanded \? '-90deg' : '90deg'/, 'an arrow shows it opens and closes');
  assert.doesNotMatch(card, /That is the ride sign/);
  // One picture and one caption per mark: the medal (or moon) in the icon column, then the words. No badge
  // repeating it a third time.
  assert.match(card, /<GameIcon name=\{stampIcon\(stamp\.kind\)\} size=\{20\} \/>\n\s*<KidText style=\{styles\.detailLineText\}>\{stampCaption\(stamp\.kind\)\}<\/KidText>\n\s*<\/View>\)\}/);
  const hero = card.slice(card.indexOf('function HeroDetails'), card.indexOf('export default function WaitCard'));
  assert.doesNotMatch(hero, /WaitStampBadge/);
  const kid = loadTs('src/screens/LinePlay/components/KidText.tsx', { react: {}, 'react/jsx-runtime': { jsx() {}, jsxs() {} }, 'react-native': {} });
  assert.deepEqual(plain(kid.digitRuns('7:21 until your next Ride Part')), [{ text: '7:21', digits: true }, { text: ' until your next Ride Part', digits: false }]);
  assert.deepEqual(plain(kid.digitRuns('CLUE 1 OF 3')).filter(run => run.digits).map(run => run.text), ['1', '3']);
});

test('an iPhone SE reading Details: no rail button acts on the hidden page; one "Back to games" closes Details', () => {
  const m = layout();
  assert.equal(m.pageWindowShown(30, true), false, 'Details open on an SE: the window steps aside');
  assert.equal(m.pageWindowShown(30, false), true, 'Details closed: the window always shows');
  assert.equal(m.pageRailMode(true), 'pages'); assert.equal(m.pageRailMode(false), 'back');
  const { runtime } = require('./helpers/reward-hook-runtime.cjs');
  const calls = [];
  const rail = props => runtime('src/screens/LinePlay/components/ActivityPageRail.tsx', {
    '../../../ui': { GameIcon: 'GameIcon' }, './KidText': { default: 'KidText' },
    '../../../design-system': { borderRadius: { lg: 16, md: 12 }, spacing: { sm: 8, xs: 4, md: 12, lg: 16 } },
  }, { index: 1, count: 4, nextLabel: 'Clue 2', progressText: 'CLUE 1/3', onFirst: () => calls.push('first'),
    onNext: () => calls.push('next'), onMore: () => calls.push('more'), onShowPages: () => calls.push('back'), ...props });
  const buttons = app => {
    const out = [];
    const walk = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) return node.forEach(walk);
      if (node.type === 'Pressable') out.push(node); walk(node.props?.children); };
    walk(app.tree); return out;
  };
  const words = children => children == null || typeof children === 'boolean' ? ''
    : Array.isArray(children) ? children.map(words).join('')
      : typeof children === 'object' ? words(children.props?.children) : String(children);
  const normal = rail({ mode: 'pages' });
  assert.equal(buttons(normal).length, 2, 'Chapter and Next on a shown page');
  const hidden = rail({ mode: 'back' });
  const only = buttons(hidden);
  assert.equal(only.length, 1, 'while the window is hidden: one button, no Chapter, no Next, no count');
  assert.equal(words(only[0].props.children), 'Back to games');
  assert.match(only[0].props.accessibilityLabel, /Hides the details/);
  only[0].props.onPress();
  assert.deepEqual(calls, ['back'], 'the tap closes Details; it never pages a window nobody can see');
  assert.equal(hidden.find(node => node.type === 'KidText'), undefined);
  const screen = read(SCREEN);
  assert.match(screen, /mode=\{railMode\} onShowPages=\{closeDetails\}/);
  assert.match(screen, /const closeDetails = useCallback\(\(\) => onDetailsChange\(false\), \[onDetailsChange\]\);/);
  assert.match(screen, /detailsOpen=\{detailsOpen\}\n\s*onDetailsChange=\{onDetailsChange\}/, 'the screen owns Details, so it can close it');
  // No empty hole between Details and the rail: the stepped-aside window leaves the flow under the rail.
  // The rail stays at its usual bottom spot; the stepped-aside window sits above it, out of the flow.
  assert.match(screen, /pagesAside: \{ position: 'absolute', left: 0, right: 0, top: 0 \}/);
  assert.match(screen, /activityAreaAside: \{ justifyContent: 'flex-end' \}/);
  assert.match(screen, /!pagesShown && styles\.activityAreaAside/);
  assert.match(screen, /onLayout=\{event => setRailBlock\(Math\.round\(event\.nativeEvent\.layout\.height\)\)\}/);
  assert.match(screen, /layout=\{reducedFx \? undefined : LinearTransition\.duration\(180\)\}/, 'the rail glides up on the UI thread');
});

test('Details open on a 17 Pro: the navigation page is one "Tap to play" strip, never a board row under the fade', () => {
  const m = layout();
  assert.equal(m.boardFits({ width: 366, height: 149 }, 60), false, '17 Pro reading Details');
  assert.equal(m.boardFits({ width: 366, height: 227 }, 60), true, '17 Pro, Details closed: the whole board');
  assert.equal(m.boardFits({ width: 0, height: 0 }, 0), true, 'before layout nothing jumps');
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /if \(onMakeRoom && layout === 'strip'\) \{/);
  assert.match(card, /<PageScroll fill=\{BRAND\.cream\} contentStyle=\{\[styles\.contentStrip, withHeader && styles\.contentStripHeader\]\}\n\s*onLayout=\{onLayout\} still>/);
  assert.equal(m.navStripHeader(147), true, 'a 17 Pro reading Details keeps the mission header over the strip');
  assert.equal(m.navStripHeader(90), false, 'a shorter page is just the strip');
  assert.match(card, />TAP TO PLAY<\/Text>/);
  const screen = read(SCREEN);
  assert.match(screen, /onNavigationMakeRoom=\{detailsOpen \? closeDetails : undefined\}/,
    'only while Details is open; with Details closed the board always shows');
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.equal((slot.match(/onMakeRoom=\{onNavigationMakeRoom\}/g) ?? []).length, 2);
  // A tight page says what to do on the header's top line, so nothing under the board sits in the fade.
  assert.match(card, /const statusOnTop = tight && !trace\.solved;/);
  assert.match(card, /\{!statusOnTop && <View style=\{\[styles\.statusRow, tight && styles\.statusRowTight\]\}>/);
  assert.match(card, /\? 'Tap a tile to turn it\.'/);
  assert.match(card, /\{firstTap && <TurnTileGlyph size=\{20\} \/>\}/, 'a turn-this-tile picture for kids who cannot read yet');
  assert.doesNotMatch(card, /name="retry"/, 'the round retry arrow read as "start over"');
});

test('the chapter page in compact mode ends on whole trail bubbles, no small labels in the fade', () => {
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(card, /\{!compact && <Text style=\{styles\.stepName\} numberOfLines=\{3\}>\{name\}<\/Text>\}/);
  assert.match(card, /accessibilityLabel=\{`\$\{complete \? 'Replay' : 'Open'\} \$\{name\}`\}/, 'the names stay in the spoken label');
  assert.match(card, /stepCompact: \{ minHeight: 0, paddingVertical: 5 \}/);
});

test('the Welcome tip never shows before the wait card is measured', () => {
  const screen = read(SCREEN);
  assert.match(screen, /<OneTimeTip id="lineplay_intro" ready=\{lineTipReady && waitCardBottom != null\}/);
  assert.match(screen, /<OneTimeTip id="first_ride_part" ready=\{lineTipReady && partTipPending && waitCardBottom != null\}/);
});

test('the chapter page blocks are keyed, so the order switch after the first layout never leaves a half-faded header', () => {
  const card = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(card, /<Animated\.View key="header" entering=\{rise\(compact \? 1 : 0\)\}/);
  assert.match(card, /<Animated\.View key="play-now" entering=\{rise\(compact \? 0 : 1\)\}/);
  assert.match(card, /\{compact \? <>\{playNow\}\{header\}<\/> : <>\{header\}\{playNow\}<\/>\}/);
});

test('an iPhone SE navigation page: the whole board fits BESIDE its header, no scrolling', () => {
  const m = layout();
  // SE, Details closed, crew row lent: the page is about 337 x 151.
  assert.equal(m.navBoardLayout({ width: 337, height: 151 }, 62, false), 'beside');
  const side = m.boardBesideSide({ width: 337, height: 151 });
  assert.ok(side >= m.BESIDE_FLOOR, `board ${side}`);
  assert.equal(side + 8 * 2 + (3 + 6) * 2, 151, 'the board plus its rims and padding is exactly the page: nothing to scroll');
  assert.ok((side - 12) / 3 >= 30, 'tiles stay at least 30 pt');
  // 17 Pro reading Details: a playable board beside the header instead of a strip.
  assert.equal(m.navBoardLayout({ width: 366, height: 149 }, 60, true), 'beside');
  // SE reading Details: too short even beside, so the "Tap to play" strip.
  assert.equal(m.navBoardLayout({ width: 337, height: 70 }, 60, true), 'strip');
  // 17 Pro, Details closed: the top board would be the 110 floor, beside gives bigger tiles.
  assert.equal(m.navBoardLayout({ width: 366, height: 227 }, 66, false), 'beside');
  assert.ok(m.boardBesideSide({ width: 366, height: 227 }) > m.boardSideFor({ width: 366, height: 227 }, 66));
  // Roomy pages (a Pro Max board page, a tall window) keep the board under the header; before layout nothing jumps.
  assert.equal(m.navBoardLayout({ width: 400, height: 520 }, 66, false), 'top');
  assert.equal(m.navBoardLayout({ width: 0, height: 0 }, 0, true), 'top');
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /if \(beside\) \{/);
  assert.match(card, /contentStyle=\{\[styles\.cardBeside, \{ paddingTop: besideTop \}\]\}/);
  assert.match(card, /navBoardLayout\(viewport, headerHeight \|\| HEADER_GUESS, !!onMakeRoom\)/, 'the first frame already picks the right layout');
  assert.match(card, /\{!tight && <Text style=\{styles\.footer\}>/, 'a tight page ends on the board: no arrow pointing at padding');
});

test('a short phone lends the crew row to the board page as the page changes', () => {
  const m = layout();
  assert.equal(m.crewRowLent(true, false, true), true, 'SE board page');
  assert.equal(m.crewRowLent(true, true, false), true, 'SE reading Details');
  assert.equal(m.crewRowLent(true, false, false), false, 'SE chapter page keeps the crew row');
  assert.equal(m.crewRowLent(false, true, true), false, 'a 17 Pro always keeps it');
  const screen = read(SCREEN);
  assert.match(screen, /return item\.kind === 'circuit' \|\| \(!!chapter\?\.navigationPanel && item\.kind === 'trivia' && item\.id === `\$\{chapter\.id\}-trivia`\);/);
  assert.match(screen, /const boardPage = isBoardPage\(visibleItem, snapshot\.chapter\);/);
  assert.doesNotMatch(screen, /boardLent/, 'the row is lent in the same render as the page change: no dimmed in-between frame');
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /viewport\.height <= 0 && styles\.unmeasured\]\}/,
    'the board never flashes in the wrong layout before it is measured');
});

test('the window stepped aside: the rail stays put and the crew row comes back into the free band', () => {
  const m = layout();
  assert.equal(m.crewRowInBand(75, 44), true);
  assert.equal(m.crewRowInBand(40, 44), false, 'never squeezed into a band too short for it');
  assert.equal(m.crewRowInBand(75, 0), false, 'not before it was measured');
  const screen = read(SCREEN);
  assert.match(screen, /\{!pagesShown && crewLent && groupPlay\.strip != null && crewRowInBand\(pagesHeight, crewRowHeight\) && \(/);
  assert.match(screen, /crewBand: \{ position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'center' \}/);
});

test('one gold button per screen: the rail Next is quiet on the chapter page and the board page', () => {
  const screen = read(SCREEN);
  assert.match(screen, /const railQuiet = visibleItem\?\.kind === 'chapter_intro' \|\| boardPage;/);
  assert.match(screen, /mode=\{railMode\} onShowPages=\{closeDetails\} quiet=\{railQuiet\}/);
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.match(rail, /const calm = quiet && !showMore;/);
  assert.match(rail, /nextQuiet: \{ backgroundColor: '#ffffff'/);
});

test('one count per screen: the bubbles and the rail own the clue count', () => {
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.doesNotMatch(chapter, /OF 3 · PLAY NOW/);
  assert.match(chapter, /'PLAY NOW'/);
  assert.match(chapter, /\{chapterPageKicker\(chapter\)\}/);
  const nav = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.doesNotMatch(nav, /MISSION 1 OF 3/);
  const labels = loadTs('src/services/lineplay/labels.ts');
  assert.equal(labels.chapterPageKicker({ parkLabel: 'MAGIC KINGDOM', episodeLabel: 'FLIGHT 1 OF 3' }), 'MAGIC KINGDOM');
  assert.equal(labels.chapterPageKicker({ parkLabel: '' }), 'SHARK FAN MISSION');
});

test('the chapter page ends on whole blocks: the crew row starts below the window instead of peeking', () => {
  const m = layout();
  // 17 Pro compact page: 210 tall, bubbles end at 176, the crew row is 52 tall: it would peek, so it moves below.
  assert.equal(m.foldGap(210, 176, 52, 12), 36);
  // Room for the whole crew row above the fade: normal gap.
  assert.equal(m.foldGap(400, 176, 52, 12), 12);
  assert.equal(m.foldGap(0, 176, 52, 12), 12, 'before layout');
  assert.equal(m.foldGap(150, 176, 52, 12), 12, 'the bubbles themselves are below the window');
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(chapter, /marginTop: foldGap\(viewHeight, trailBottom, crewHeight, CREW_ROW_GAP\)/);
  // Details open on a 17 Pro: the bubbles would peek under PLAY NOW and the header, so they start below the window too.
  assert.match(chapter, /marginTop: foldGap\(viewHeight, leadBottom, trailHeight, compact \? TRAIL_GAP_COMPACT : TRAIL_GAP\)/);
  assert.equal(m.foldGap(149, 130, 44, 8), 21, '17 Pro reading Details: bubbles below the window, not a sliver');
});

test('the coin has no box: the halo canvas reaches past the ring and no plank shadow sits in the ring', () => {
  const ring = read('src/screens/LinePlay/components/waitscreen/CoinFillRing.tsx');
  assert.match(ring, /const pad = Math\.ceil\(stroke \* 4\.5\);/);
  assert.match(ring, /<Canvas style=\{\{ position: 'absolute', left: -pad, top: -pad, width: size \+ pad \* 2, height: size \+ pad \* 2 \}\}>/);
  const stage = read('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx');
  assert.match(stage, /contactShadow=\{false\}/);
  assert.match(stage, /setRibbon\(`\$\{coinTier\(target\)\.name\.toUpperCase\(\)\} COIN!`\);/, 'no level number beside LEVELED UP!');
  const shelf = read('src/components/collection/ShelfCoin.tsx');
  assert.match(shelf, /\{contactShadow && <View style=\{\[styles\.contact,/);
});

test('"more below" is decided from JS-side sizes, so a page that grew to fit drops its fade and arrow', () => {
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /const next = moreBelow\(js\.current\.content, js\.current\.view, offset\.value\);/);
  assert.match(scroll, /if \(next === js\.current\.shown\) return;/);
  assert.match(scroll, /js\.current\.view = event\.nativeEvent\.layout\.height;/);
  assert.match(scroll, /js\.current\.content = height;/);
});
