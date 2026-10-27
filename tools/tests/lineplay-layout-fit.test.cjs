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
  assert.match(card, /: !compact && <Text style=\{styles\.playNowHint\}>/);
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
  assert.match(card, /<PageScroll fill=\{FRAME_FILL\} contentStyle=\{\[styles\.contentStrip, withTrail && styles\.contentStripTrail\]\}\n\s*onLayout=\{measure\} still>/,
    'the strip never scrolls, fades or shows an arrow');
  assert.match(card, /<GameIcon name=\{locked \? 'lock' : 'play'\} size=\{locked \? 26 : 40\} \/>/);
  assert.match(card, /const reducedUi = useUiReducedMotion\(\);\n\s+const rise = riseFor\(reducedUi \|\| entered\.current\);/, 'a layout switch never replays the entrance');
  const screen = read(SCREEN);
  assert.match(screen, /const pagesShown = pageWindowShown\(pagesHeight, detailsOpen\);/);
  assert.match(screen, /<View ref=\{pagesInnerRef\} style=\{\[styles\.pagesInner, !pagesShown && styles\.pagesHidden\]\}/,
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
  assert.match(card, /entering=\{reducedMotion \? undefined : detailsEnter\}/);
  const screen = read(SCREEN);
  assert.match(screen, /exiting=\{reducedFx \|\| fit\.short \? undefined : FadeOut\.duration\(140\)\}\n\s*onLayout=\{event => setCrewRowHeight\(Math\.round\(event\.nativeEvent\.layout\.height\)\)\}>\n\s*<Reanimated\.View style=\{crewFadeStyle\}>\{groupPlay\.strip\}<\/Reanimated\.View><\/Reanimated\.View>/);
  // No glide through a square clip (it cut glyphs mid-move), and no blink: the window dips to 35%
  // (never 0), takes its new size inside its own rounded frame, then rises once it has its new size.
  assert.equal((screen.match(/LinearTransition/g) ?? []).length, 2, 'only the rail glides (import + one use)');
  assert.match(screen, /<Reanimated\.View style=\{\[styles\.pages, pagesFadeStyle, !pagesShown && \[styles\.pagesAside, \{ bottom: railBlock \}\]\]\}/);
  // Dim on the UI thread and change at once (the new layout lands while dim), rise two frames after
  // the new layout, and the UI thread caps the dim so a busy JS thread never holds it.
  assert.match(screen, /pagesFade\.value = withSequence\(withTiming\(PAGES_DIP_OPACITY, \{ duration: PAGES_DIP_MS \}\),\n\s*withDelay\(PAGES_DIM_HOLD_MAX_MS, withTiming\(1, \{ duration: PAGES_RISE_MS \}\)\)\);\n\s*revealPending\.current = true;\n\s*change\(\);/);
  assert.doesNotMatch(screen, /dipTimer/);
  assert.match(screen, /requestAnimationFrame\(\(\) => requestAnimationFrame\(rise\)\);/);
  assert.match(screen, /dipPages\(\(\) => setDetailsOpen\(open\)\);/);
  assert.doesNotMatch(screen, /pagesFade\.value = 0/, 'never an empty window');
  assert.doesNotMatch(screen, /withTiming\(0, \{ duration: 0 \}\)/);
  const m = layout();
  assert.ok(m.PAGES_DIP_OPACITY >= 0.8 && m.PAGES_DIP_OPACITY < 1, 'a soft cross-fade: no frame under 80%');
  assert.ok(m.PAGES_DIP_MS + m.PAGES_RISE_MS < 220, 'dip plus rise under 220 ms');
  assert.ok(m.PAGES_DIP_MS + m.PAGES_RISE_FALLBACK_MS + m.PAGES_RISE_MS < 320, 'the fallback rise starts soon too');
  const scroll = read('src/screens/LinePlay/components/PageScroll.tsx');
  assert.match(scroll, /clip: \{ flex: 1, borderRadius: borderRadius\.xxl - RIM, overflow: 'hidden' \}/,
    'the dimmed page is clipped by its own rounded frame, never a square edge');
  assert.match(screen, /setPagesHeight\(Math\.round\(event\.nativeEvent\.layout\.height\)\);\n\s*setPagesMeasuredLent\(lentAtCommit\.current\);\n\s*revealPages\(\);/);
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
  assert.match(coach, /if \(autoHideMs <= 0\) return(?: undefined)?;/, 'CoachTip: 0 means no timer');
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
    '../../../services/lineplay/lineLayout': layout(),
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
  assert.equal(words(only[0].props.children), 'Show games', 'not paused: it shows the games, no play triangle');
  assert.match(only[0].props.accessibilityLabel, /Hides the details/);
  assert.equal(JSON.stringify(only[0].props.children).includes('"name":"play"'), false);
  only[0].props.onPress();
  assert.deepEqual(calls, ['back'], 'the tap closes Details; it never pages a window nobody can see');
  assert.equal(hidden.find(node => node.type === 'KidText'), undefined);
  const screen = read(SCREEN);
  assert.match(screen, /mode=\{railMode\} onShowPages=\{onRailBack\} backAction=\{railBack\}/);
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
  assert.match(card, />PLAY<\/Text>/);
  assert.doesNotMatch(card, /TAP TO PLAY/, 'PLAY, the one word the chapter strip uses too');
  const screen = read(SCREEN);
  assert.match(screen, /onNavigationMakeRoom=\{detailsOpen \? onBoardPlay : undefined\}/,
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
  assert.match(screen, /<OneTimeTip id="lineplay_intro" ready=\{lineTipReady && pagesShown && waitCardBottom != null\}/);
  assert.match(screen, /<OneTimeTip id="first_ride_part" ready=\{lineTipReady && partTipPending && pagesShown && waitCardBottom != null\}/);
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
  assert.equal(side + m.BESIDE_V, 151, 'the board plus its rims and padding is exactly the page: nothing to scroll');
  assert.ok(m.besideTileSide(side) >= 40, `SE tiles ${m.besideTileSide(side)} pt`);
  assert.ok(m.besideTileSide(side) + m.BESIDE_TILE_GAP >= 44, 'each tile plus its half gaps is a 44 pt touch area');
  // 17 Pro reading Details: a playable board beside the header instead of a strip.
  assert.equal(m.navBoardLayout({ width: 366, height: 149 }, 60, true), 'beside');
  // SE reading Details: too short even beside, so the "Tap to play" strip.
  assert.equal(m.navBoardLayout({ width: 337, height: 70 }, 60, true), 'strip');
  // The page sliding in before the crew row's room arrives: still beside (the board at its floor, then it grows).
  assert.equal(m.navBoardLayout({ width: 337, height: 110 }, 60, false), 'beside');
  assert.equal(m.boardBesideDrawn({ width: 337, height: 110 }), m.BESIDE_FLOOR);
  // 17 Pro, Details closed: the top board would be the 110 floor, beside gives bigger tiles.
  assert.equal(m.navBoardLayout({ width: 366, height: 227 }, 66, false), 'beside');
  assert.ok(m.boardBesideSide({ width: 366, height: 227 }) > m.boardSideFor({ width: 366, height: 227 }, 66));
  // Roomy pages (a Pro Max board page, a tall window) keep the board under the header; before layout nothing jumps.
  assert.equal(m.navBoardLayout({ width: 400, height: 520 }, 66, false), 'top');
  assert.equal(m.navBoardLayout({ width: 0, height: 0 }, 0, true), 'top');
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /if \(beside\) \{/);
  assert.match(card, /contentStyle=\{\[styles\.cardBeside, \{ paddingTop: besideTop \}\]\}/);
  assert.match(card, /navBoardLayout\(room, headerHeight \|\| HEADER_GUESS, !!onMakeRoom\)/, 'the first frame already picks the right layout');
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
  // The band runs from the card's bottom edge (back over the activity gap) to the rail; the row is a full 44 pt, centred.
  assert.match(screen, /\{!pagesShown && crewLent && groupPlay\.bandStrip != null && crewRowInBand\(pagesHeight \+ fit\.activityGap, crewRowHeight && Math\.max\(crewRowHeight, CREW_BAND_ROW\)\) && \(/);
  assert.match(screen, /style=\{\[styles\.crewBand, \{ top: -fit\.activityGap, bottom: railBlock \}\]\}/);
  assert.match(screen, /const CREW_BAND_ROW = 44;/);
  assert.match(screen, /crewBand: \{ position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'center' \}/);
});

test('one gold button per screen: the rail Next is quiet on the chapter page and the board page', () => {
  const screen = read(SCREEN);
  assert.match(screen, /const railQuiet = visibleItem\?\.kind === 'chapter_intro' \|\| boardPage;/);
  assert.match(screen, /mode=\{railMode\} onShowPages=\{onRailBack\} backAction=\{railBack\} quiet=\{railQuiet\}/);
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.match(rail, /const calm = quiet && !showMore;/);
  assert.match(rail, /nextQuiet: \{ backgroundColor: '#ffffff'/);
});

test('one count per screen: the bubbles and the rail own the clue count', () => {
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.doesNotMatch(chapter, /OF 3 · PLAY NOW/);
  assert.doesNotMatch(chapter, /'PLAY NOW'/, 'one kicker word on every size: PLAY');
  assert.match(chapter, /'KEEP THE WAIT FUN' : 'PLAY'\}/);
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
  // The crew row's offset comes from the same render's window height, never a trail layout one frame late.
  assert.match(chapter, /const trailBottom = leadBottom > 0 && trailHeight > 0 \? leadBottom \+ trailGap \+ trailHeight : trailBottomSeen;/);
  assert.match(chapter, /const leadBottom = leadBottoms\[fit\] \?\? 0;/);
  assert.match(chapter, /const trailHeight = trailHeights\[fit\] \?\? 0;/);
  // Details open on a 17 Pro: the bubbles would peek under PLAY NOW and the header, so they start below the window too.
  assert.match(chapter, /const trailGap = foldGap\(viewHeight, leadBottom, trailHeight, compact \? TRAIL_GAP_COMPACT : TRAIL_GAP\);/);
  assert.match(chapter, /\{ marginTop: trailGap \}/);
  assert.equal(m.foldGap(149, 130, 44, 8), 21, '17 Pro reading Details: bubbles below the window, not a sliver');
});

test('the coin has no box: the halo canvas reaches past the ring and no plank shadow sits in the ring', () => {
  const ring = read('src/screens/LinePlay/components/waitscreen/CoinFillRing.tsx');
  assert.match(ring, /const pad = Math\.ceil\(stroke \* 4\.5\);/);
  assert.match(ring, /<Canvas style=\{\{ position: 'absolute', left: -pad, top: -pad, width: size \+ pad \* 2, height: size \+ pad \* 2 \}\}>/);
  const stage = read('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx');
  assert.match(stage, /contactShadow=\{false\}/);
  // The level up is said once: "LEVELED UP!" on the coin, and the chip under it keeps its plain count.
  assert.doesNotMatch(stage, /setRibbon|COIN!`|labelChipRibbon/, 'no second level-up line in the chip');
  assert.match(stage, /: error \?\? \(busy \? 'Leveling up…' : progress\.chip\);/);
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

test('one name per activity: PLAY NOW, the rail and the board header say the same words', () => {
  const m = layout();
  const chapters = loadTs('src/services/lineplay/chapters.ts');
  const ch = chapters.getLinePlayChapterById('mk-space-mountain');
  assert.equal(ch.missionNames[0], 'Fix the signal');
  const play = m.chapterPlayNow(ch, new Set());
  assert.deepEqual([play.id, play.name, play.done], ['mk-space-mountain-trivia', 'Fix the signal', 0]);
  assert.equal(m.chapterPlayNow(ch, new Set(['mk-space-mountain-trivia'])).id, 'mk-space-mountain-field-note');
  const all3 = new Set(['mk-space-mountain-trivia', 'mk-space-mountain-field-note', 'mk-space-mountain-star-chart']);
  assert.equal(m.chapterPlayNow(ch, all3).id, 'mk-space-mountain-crew-relay');
  for (const id of ['mk-space-mountain-episode-1', 'mk-space-mountain-episode-2']) {
    const flight = chapters.getLinePlayChapterById(id);
    assert.ok(flight.missionNames[0].length <= 18, `${flight.missionNames[0]} is short enough for one header line`);
  }
  // The rail's Next on the chapter page skips what PLAY NOW opens; elsewhere it is the next page.
  const pages = ['chapter', 'mk-space-mountain-trivia', 'mk-space-mountain-field-note', 'game'];
  assert.equal(m.railNextIndex(pages, 0, 'mk-space-mountain-trivia'), 2);
  assert.equal(m.railNextIndex(pages, 0, 'mk-space-mountain-field-note'), 1);
  assert.equal(m.railNextIndex(pages, 1, null), 2);
  assert.equal(m.railNextIndex(pages, 3, null), 0);
  assert.equal(m.railNextIndex(['chapter', 'x'], 0, 'x'), 1, 'two pages: nothing else to point at');
  const screen = read(SCREEN);
  assert.match(screen, /const nextPageIndex = railNextIndex\(activityPages\.map\(page => page\.id\), visiblePageIndex, playNowId\);/);
  assert.match(screen, /\? chapter\.missionNames\[0\] : 'Shark Trivia';/);
  assert.match(screen, /navigationTitle=\{snapshot\.chapter\?\.navigationPanel \? snapshot\.chapter\.missionNames\[0\] : undefined\}/);
  assert.doesNotMatch(screen, /'CHAPTER'/, 'Chapter is only ever the rail button word, never a plain label too');
  assert.match(screen, /hideCount=\{!storyStep && activityPages\[visiblePageIndex\]\?\.kind === 'chapter_intro'\}/);
  assert.doesNotMatch(screen, /'Navigation panel'|'STORY'/);
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /<NavigationPanelCard seed=\{item\.seed\} title=\{navigationTitle\}/);
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /const look = missionTitle \? \{ \.\.\.baseLook, repairTitle: missionTitle \} : baseLook;/);
  assert.match(read('src/screens/LinePlay/components/ChapterCard.tsx'), /chapterPlayNow\(chapter, completedIds\)/);
});

test('roomy beside boards put "Tap a tile to turn it." on its own line; the SE keeps every point for tiles', () => {
  const m = layout();
  assert.equal(m.besideStatusRow({ width: 337, height: 151 }), false, 'SE: height is short');
  assert.equal(m.besideStatusRow({ width: 366, height: 227 }), true, '17 Pro');
  assert.equal(m.besideStatusRow({ width: 404, height: 250 }), true, 'Pro Max');
  const pro = m.boardBesideSide({ width: 366, height: 227 });
  assert.ok(pro + m.BESIDE_V + m.BESIDE_STATUS_ROW <= 227, 'the status line and the whole board fit');
  assert.ok(m.besideTileSide(pro) >= 50, `17 Pro tiles ${m.besideTileSide(pro)}`);
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /const statusRow = beside && besideStatusRow\(room\);/);
  assert.match(card, /\{statusRow && statusLine\}/);
  assert.match(card, /const titleLines = besideTitle\.length <= 15 \? 1 : 2;/);
  assert.match(card, /hitSlop=\{tileSlop\}/);
  assert.match(card, /const tileSlop = gap \/ 2;/);
});

test('an SE board page sliding in shows no small board: it stays unseen until its final size, then fades in', () => {
  const m = layout();
  assert.equal(m.navBoardSettling('beside', { width: 337, height: 110 }, false), true, 'crew row room not here yet');
  assert.equal(m.navBoardSettling('beside', { width: 337, height: 151 }, false), false, 'final size');
  assert.equal(m.navBoardSettling('strip', { width: 337, height: 70 }, true), false, 'Details open is the strip');
  assert.equal(m.navBoardSettling('beside', { width: 0, height: 0 }, false), false);
  assert.ok(m.NAV_SETTLE_FADE_MS <= 150 && m.NAV_SETTLE_MAX_MS <= 400);
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /const hideBoard = settling && !settleWaited;/);
  assert.match(card, /<PageScroll ref=\{scroll\} fill=\{BRAND\.cream\} still=\{hideBoard \|\| growing\}/, 'no more-below arrow while it settles');
  assert.match(card, /settleFade\.value = reducedMotion \? 1 : withTiming\(1, \{ duration: NAV_SETTLE_FADE_MS \}\);/);
});

test('Details: dip, layout and rise near 200 ms, and the lines are readable on the first frame', () => {
  const m = layout();
  assert.ok(m.PAGES_DIP_MS + 34 + m.PAGES_RISE_MS < 220, 'dip, two frames and rise');
  assert.ok(m.PAGES_DIP_MS + m.PAGES_RISE_FALLBACK_MS + m.PAGES_RISE_MS < 240);
  assert.ok(m.PAGES_DIP_MS + m.PAGES_DIM_HOLD_MAX_MS + m.PAGES_RISE_MS <= 300, 'never dim longer than 300 ms in all, even with a busy JS thread');
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /entering=\{reducedMotion \? undefined : detailsEnter\}/);
  assert.match(card, /initialValues: \{ opacity: 0\.6 \}/);
  assert.doesNotMatch(card, /FadeIn\.delay/, 'no delay: never an empty Details panel');
});

test('the closed SE chapter page fills its window: the 1 2 3 bubbles sit under the PLAY strip', () => {
  const m = layout();
  assert.equal(m.stripTrailFits(112), true, 'SE closed (about 110 to 120 pt)');
  assert.equal(m.stripTrailFits(80), false, 'a shorter strip page keeps the strip alone');
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(chapter, /const withTrail = stripTrailFits\(viewHeight\);/);
  assert.match(chapter, /\{withTrail && <View style=\{styles\.stripTrail\}/);
  assert.match(chapter, /<Text style=\{\[styles\.playStripKicker, locked && styles\.lockedKicker\]\}>\{locked \? 'LOCKED  ' : 'PLAY  '\}<\/Text>\{locked \? LOCKED_LINE : nextName\}/, 'the strip says PLAY (or LOCKED and why); the bubbles own the count');
  assert.doesNotMatch(chapter, /'CLUE '/);
});

test('an SE board page is drawn for its lent height from the first frame (no small board, no pop)', () => {
  const m = layout();
  // Measured before the crew row left (window 167, row 44): the board page will be 167 + 44 - 16.
  assert.equal(m.lentBoardViewport(true, false, 167, false, 44), 195);
  // Measured after: the window already has the room.
  assert.equal(m.lentBoardViewport(true, false, 211, true, 44), 195);
  assert.equal(m.lentBoardViewport(false, false, 211, false, 44), undefined, 'a tall phone never lends');
  assert.equal(m.lentBoardViewport(true, true, 211, true, 44), undefined, 'Details open: the page is what it is');
  assert.equal(m.lentBoardViewport(true, false, 0, false, 44), undefined);
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /const growing = targetHeight != null && viewport\.height > 0 && Math\.abs\(targetHeight - viewport\.height\) > 1;/);
  assert.match(card, /const layout = navBoardLayout\(room, headerHeight \|\| HEADER_GUESS, !!onMakeRoom\);/);
  assert.match(card, /still=\{hideBoard \|\| growing\}/, 'no stale more-below arrow while the window grows');
  const screen = read(SCREEN);
  assert.match(screen, /navigationTargetHeight=\{boardTargetHeight \?\? pageViewHeight\}/);
  assert.match(screen, /setPagesMeasuredLent\(lentAtCommit\.current\);/);
});

test('paused by hand with Details open on an SE: the one rail button is Play, and one tap resumes', () => {
  const m = layout();
  assert.equal(m.railBackAction('paused', 'manual'), 'play');
  assert.equal(m.railBackAction('paused', 'left_area'), 'show', 'an automatic pause cannot be played away');
  assert.equal(m.railBackAction('active', null), 'show');
  const { runtime } = require('./helpers/reward-hook-runtime.cjs');
  const calls = [];
  const rail = props => runtime('src/screens/LinePlay/components/ActivityPageRail.tsx', {
    '../../../services/lineplay/lineLayout': layout(),
    '../../../ui': { GameIcon: 'GameIcon' }, './KidText': { default: 'KidText' }, './ClueDots': { default: 'ClueDots' },
    '../../../design-system': { borderRadius: { lg: 16, md: 12 }, spacing: { sm: 8, xs: 4, md: 12, lg: 16 } },
  }, { index: 1, count: 4, nextLabel: 'Spot the clue', onFirst: () => {}, onNext: () => calls.push('next'),
    onShowPages: () => calls.push('back'), mode: 'back', ...props });
  const find = (app, type) => { const out = []; const walk = node => { if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk); if (node.type === type) out.push(node); walk(node.props?.children); };
    walk(app.tree); return out; };
  const play = rail({ backAction: 'play' });
  const [button] = find(play, 'Pressable');
  assert.equal(find(play, 'Text')[0].props.children, 'Play');
  assert.equal(find(play, 'GameIcon')[0].props.name, 'play', 'the same play picture as the card');
  assert.match(button.props.accessibilityLabel, /^Play\. Starts the games again/);
  button.props.onPress();
  assert.deepEqual(calls, ['back']);
  // The screen: the one button closes Details AND starts the same resume countdown as the card's play button.
  const screen = read(SCREEN);
  assert.match(screen, /const railBack = railBackAction\(snapshot\.state, snapshot\.pauseReason\);/);
  assert.match(screen, /const onRailBack = useCallback\(\(\) => \{\n\s*closeDetails\(\);\n\s*if \(railBack === 'play' && !resuming\) setResuming\(true\);\n\s*\}, \[closeDetails, railBack, resuming\]\);/);
  assert.match(screen, /<ResumeCountdown active=\{resuming \|\| resumeHandoff != null\} onDone=\{\(\) => \{\n\s*setResuming\(false\);\n\s*session\.resume\(\);/,
    'the countdown ends in session.resume()');
  // The card's paused line points at that one button.
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.match(card, /Tap play when you’re ready\./);
});

test('Details toggle: the pages lay out for the new window in the same frame (no sliced board), soft dip', () => {
  const screen = read(SCREEN);
  assert.match(screen, /useLayoutEffect\(\(\) => \{\n\s*pagesInnerRef\.current\?\.measure\(/, 'measured before anything is drawn');
  assert.match(screen, /\}, \[detailsOpen\]\);/);
  assert.match(screen, /const pageViewHeight = pagesHeight > PAGE_FRAME_V \? pagesHeight - PAGE_FRAME_V : undefined;/);
  assert.match(screen, /windowHeight=\{pageViewHeight\}/);
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(chapter, /const viewHeight = windowHeight != null && windowHeight > 0 \? windowHeight : measuredHeight;/);
  const m = layout();
  assert.ok(m.PAGES_DIP_OPACITY >= 0.8);
  assert.ok(m.PAGES_DIP_MS + m.PAGES_DIM_HOLD_MAX_MS + m.PAGES_RISE_MS < 250, 'under 250 ms end to end, even on a busy JS thread');
});

test('one clue count form: 3 mini bubbles on the rail, in the SE strip and on the chapter page; mission 2 has its own name', () => {
  const screen = read(SCREEN);
  assert.doesNotMatch(screen, /CLUE \$\{storyStep\}\/3/, 'no CLUE 1/3 text on the rail');
  assert.match(screen, /progressDots=\{storyStep && snapshot\.chapter \? \{ current: storyStep - 1,/);
  assert.match(screen, /nextIcon=\{railPageIcon\(activityPages\[nextPageIndex\]\?\.kind\)\}/);
  assert.match(screen, /case 'lore': return chapter && item\.id === `\$\{chapter\.id\}-field-note` \? chapter\.missionNames\[1\] : 'Field Note';/);
  assert.equal(layout().railPageIcon('lore'), 'search', 'Spot the clue gets a magnifier picture');
  assert.match(read('src/services/lineplay/chapters.ts'), /missionNames: \['Fix the signal', 'Spot the clue', 'Rebuild the star chart'\]/,
    'not two near-twin signal names');
  const m = layout();
  assert.equal(m.stripDotsFit(80), true, 'SE reading Details: the mini bubbles ride inside the strip');
  assert.equal(m.stripDotsFit(70), false);
  assert.deepEqual(plain(m.chapterMissionIds({ id: 'c', finale: { idSuffix: 'star-chart' } })), ['c-trivia', 'c-field-note', 'c-star-chart']);
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.match(chapter, /playStripFill: \{ flexGrow: 1, maxHeight: 112 \}/, 'the strip fills its window: no empty pale band');
  assert.match(chapter, /stepBadgeCurrent: \{ backgroundColor: BRAND\.gold \}/, 'the current clue is gold everywhere');
  const dots = read('src/screens/LinePlay/components/ClueDots.tsx');
  assert.match(dots, /dotNow: \{ backgroundColor: BRAND\.gold \}/);
  assert.match(dots, /\{complete \? <GameIcon name="check"/);
});

test('the paused ARCADE button rests in white with a navy outline (never faded gold, which reads grey-green)', () => {
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /playButtonDisabled/);
  assert.match(card, /\[styles\.compactArcade, paused && styles\.buttonResting, pressed && styles\.playButtonPressed\]/);
  assert.match(card, /buttonResting: \{ backgroundColor: '#e8f6ff', borderWidth: 2, borderColor: '#0b4f8a'/);
});

test('an iPhone SE board shows tiles of at least 44 pt (not only touch areas)', () => {
  const m = layout();
  const side = m.boardBesideSide({ width: 337, height: 151 });
  assert.ok(m.besideTileSide(side) >= 44, `SE tiles ${m.besideTileSide(side)} pt`);
  assert.ok(m.besideTileSide(m.boardBesideSide({ width: 366, height: 227 })) >= 50, '17 Pro keeps big tiles');
});

test('a space clue page says its own mission name and no second count (the rail bubbles own it)', () => {
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.doesNotMatch(slot, /MISSION \d OF 3/);
  assert.match(slot, /title=\{title \?\? \(navigator \? 'Spot the clue' : 'Field Note'\)\}/);
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.match(rail, /numberOfLines=\{naming \? nextWords\.lines : 1\} adjustsFontSizeToFit\n\s+minimumFontScale=\{naming && nextWords\.lines === 2 \? 0\.9 : 0\.7\}>/,
    'a long next name is never cut: two lines at the normal size on a narrow phone');
});

test('the board page "Tap to play" strip with no header fills its window (no cream band on an SE)', () => {
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /\[styles\.playStrip, !withHeader && styles\.playStripFill, paused && styles\.playStripResting,\n\s+pressed && !reducedMotion && styles\.pressed\]/);
  assert.match(card, /playStripFill: \{ flexGrow: 1, maxHeight: 112 \}/);
});

test('every picture on the board page means one thing: the hint is the turn-tile picture, the rail Next keeps the magnifier', () => {
  const m = layout();
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  const hint = card.slice(card.indexOf('const hintButton ='), card.indexOf('const relayStars'));
  assert.match(hint, /<TurnTileGlyph size=\{beside \? 22 : 26\} \/>/, 'the hint wears the same picture as the hinted tile');
  assert.doesNotMatch(hint, /GameIcon/, 'never a GameIcon a rail page could also wear');
  // The board's own pictures (the 3 relay stars, checks) are never the picture of the page after it.
  const boardIcons = [...card.matchAll(/<GameIcon[^>]*name="([a-zA-Z]+)"/g)].map(match => match[1]);
  const pages = ['chapter_intro', 'crew_grid', 'circuit', 'crew_relay', 'signal', 'puzzle', 'trivia', 'lore', 'prediction', 'minigame'];
  assert.equal(m.railPageIcon('trivia') === m.railPageIcon('lore'), false);
  // On the space board, Next is always Spot the clue (lore).
  assert.ok(!boardIcons.includes(m.railPageIcon('lore')), `board icons ${boardIcons} never include the magnifier`);
  for (const kind of pages) assert.ok(m.railPageIcon(kind), `${kind} has a picture`);
  assert.equal(m.railPageIcon(undefined), undefined);
});

test('paused, ARCADE is never a dead tap: one tap runs the resume 3 2 1, then the arcade opens', () => {
  const screen = read(SCREEN);
  assert.match(screen, /if \(snapshot\.state === 'paused' \|\| resuming\) \{\n\s+arcadeAfterResume\.current = true;\n\s+if \(!resuming\) setResuming\(true\);\n\s+void Haptics\.selectionAsync\(\);/);
  assert.match(screen, /if \(arcadeAfterResume\.current\) \{ arcadeAfterResume\.current = false; setArcadeOpen\(true\); setResumeHandoff\('arcade'\); \}/);
  assert.match(screen, /arcadeAfterResume\.current = false; pageAfterResume\.current = null; setResumeHandoff\(null\); session\.pause\('manual'\)/, 'pausing again forgets the queued arcade');
  const card = read('src/screens/LinePlay/components/WaitCard.tsx');
  assert.doesNotMatch(card, /onPress=\{onPlayBonus\} disabled=\{paused\}/, 'no disabled ARCADE while paused');
});

test('the resume countdown caption sits on a navy pill, readable over any page', () => {
  const countdown = read('src/screens/LinePlay/components/ResumeCountdown.tsx');
  assert.match(countdown, /<View style=\{styles\.hintPill\}>\n\s+<Text style=\{styles\.hint\}>Back in line<\/Text>/);
  assert.match(countdown, /hintPill: \{[^}]*backgroundColor: BRAND\.navy/);
  assert.doesNotMatch(countdown, /textShadow/, 'no bare shadowed text over the board');
});

test('in the gold SE strip the current clue reads at arm\'s length: navy capsule, white ring', () => {
  const dots = read('src/screens/LinePlay/components/ClueDots.tsx');
  assert.match(dots, /capsule: \{[^}]*backgroundColor: BRAND\.navy/);
  assert.match(dots, /dotNowOnGold: \{ borderColor: '#ffffff' \}/);
  assert.match(read('src/screens/LinePlay/components/ChapterCard.tsx'), /<ClueDots size=\{16\} onGold/);
  const m = layout();
  assert.equal(m.STRIP_WITH_DOTS, 68);
  assert.equal(m.stripDotsFit(80), true, 'still fits an SE reading Details');
});

test('one word for one idea in VoiceOver: clues found everywhere, and the coin chip says the whole sentence', () => {
  const chapters = read('src/services/lineplay/chapters.ts');
  const nouns = [...chapters.matchAll(/progressNoun: '([^']*)'/g)].map(match => match[1]);
  assert.ok(nouns.length >= 6);
  assert.deepEqual([...new Set(nouns)], ['clues found']);
  const stage = read('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx');
  assert.match(stage, /accessibilityLabel=\{showCount \? progress\.label : label\}/);
});

test('paused, the chapter PLAY and clue buttons are never a dead tap: one tap runs the 3 2 1, then that page opens', () => {
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  assert.doesNotMatch(chapter, /disabled=\{paused\}/, 'no chapter button goes dead while paused');
  assert.match(chapter, /paused && styles\.playResting/, 'the paused PLAY rests in pale blue, never a faded olive gold');
  assert.match(chapter, /playResting: \{ backgroundColor: '#e8f6ff', borderColor: '#0b4f8a' \}/);
  assert.match(chapter, /const playVerb = !locked && paused \? 'Resume and play' : done === 3 \? 'Play' : 'Start';/);
  assert.match(chapter, /accessibilityLabel=\{locked \? `\$\{nextName\}\. \$\{LOCKED_LINE\}` : `\$\{playVerb\} \$\{nextName\}`\}/);
  const screen = read(SCREEN);
  assert.match(screen, /pageAfterResume\.current = index;\n\s+if \(!resuming\) setResuming\(true\);/);
  assert.match(screen, /if \(snapshot\.state !== 'active'\) return;\n\s+jumpToPage\(index\);/);
  assert.match(screen, /const page = pageAfterResume\.current;\n\s+pageAfterResume\.current = null;/);
  assert.match(screen, /else if \(page != null\) \{ jumpToPage\(page, false\); setResumeHandoff\('page'\); \}/);
  assert.match(screen, /pageAfterResume\.current = null; setResumeHandoff\(null\); session\.pause\('manual'\)/, 'pausing again forgets the queued page');
});

test('one name per clue on every chapter: PLAY, the bubble, the rail, the page header and the recap say the mission name', () => {
  const screen = read(SCREEN);
  assert.match(screen, /case 'trivia': return chapter && item\.id === `\$\{chapter\.id\}-trivia` \? chapter\.missionNames\[0\] : 'Shark Trivia';/);
  assert.match(screen, /if \(item\?\.kind === 'trivia'\) return chapter && id === `\$\{chapter\.id\}-trivia`\n\s+\? chapter\.missionNames\[0\]/);
  assert.match(screen, /missionTitle=\{chapterMissionTitle\(snapshot\.chapter, item\.id\)\}/);
  assert.match(screen, /return index >= 0 \? chapter\.missionNames\[index\] : undefined;/);
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /<TriviaSlot title=\{missionTitle\}/);
  assert.match(slot, /title=\{title \?\? 'Shark Trivia'\} teacher \/>/);
  assert.match(slot, /<LoreSlot title=\{missionTitle\}/);
  assert.match(slot, /title=\{title \?\? \(navigator \? 'Spot the clue' : 'Field Note'\)\}/);
});

test('a one-time tip waits while the page window has stepped aside, so it never sits over the rail\'s one button', () => {
  const screen = read(SCREEN);
  assert.match(screen, /<OneTimeTip id="lineplay_intro" ready=\{lineTipReady && pagesShown && waitCardBottom != null\}/);
  assert.match(screen, /<OneTimeTip id="first_ride_part" ready=\{lineTipReady && partTipPending && pagesShown && waitCardBottom != null\}/);
});

test('the resume countdown always opens on 3, never on the last run\'s 1', () => {
  const countdown = read('src/screens/LinePlay/components/ResumeCountdown.tsx');
  assert.match(countdown, /finished\.current = false;\n\s+stepEndedAt\.current = null;\n\s+clock\.value = 0;/, 'the clock restarts from 0 (the 3) every time');
  assert.match(countdown, /clock\.value = withDelay\(RESET_DELAY_MS, withTiming\(0, \{ duration: 0 \}\)\);/, 'back at 0 once hidden: the closing frame keeps the 1 (no 3 flash) and the next run never opens on the 1');
});

test('paused, the board PLAY strip is never a tap that only hides Details: it rests in pale blue and runs the 3 2 1', () => {
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  assert.match(card, /paused && styles\.playStripResting/);
  assert.match(card, /playStripResting: \{ backgroundColor: '#e8f6ff', borderColor: '#0b4f8a' \}/);
  assert.match(card, /accessibilityLabel=\{`\$\{paused \? 'Resume and play' : 'Play'\} \$\{title\}\. Hides the details\.`\}/);
  assert.match(card, /<Text style=\{styles\.playStripCta\}>\{'PLAY  '\}<\/Text>\{title\}/, 'one row: PLAY and the mission name, like the chapter strip');
  const screen = read(SCREEN);
  assert.match(screen, /const onBoardPlay = useCallback\(\(\) => \{\n\s+closeDetails\(\);\n\s+if \(snapshot\.state === 'paused' && !resuming\) \{\n\s+setResuming\(true\);/);
});

test('the resume countdown shows 3, 2 and 1 on the UI thread, so neither a busy JS thread nor a long frame skips a number', () => {
  const countdown = read('src/screens/LinePlay/components/ResumeCountdown.tsx');
  assert.match(countdown, /const MAX_STEP_MS = 34;/);
  assert.match(countdown, /before \+ Math\.min\(info\.timeSincePreviousFrame \?\? 16, MAX_STEP_MS\) \/ STEP_MS/, 'one frame moves the clock at most 34 ms');
  assert.match(countdown, /if \(before < end && after >= end\) runOnJS\(finish\)\(true\);/, 'the game comes back once, after the 1\'s own step');
  assert.match(countdown, /if \(Math\.floor\(after\) > Math\.floor\(before\) && after < 3\) runOnJS\(tick\)\(\);/, 'the 2 and the 1 tick when they appear');
  assert.match(countdown, /\[3, 2, 1\]\.map\(\(value, index\) => <CountNumber/);
  assert.match(countdown, /const shown = t >= 0 && \(t < 1 \|\| index === 2\);/, 'each number shows only during its own step; the 1 holds until the game is back');
  assert.doesNotMatch(countdown, /setTimeout|setCount\(/, 'no JS timer or JS state drives the number');
  assert.match(countdown, /onPress=\{\(\) => finish\(false\)\}/, 'a tap still skips it');
});

test('clue 3 (the finale game) says its mission name on the rail, the page and the recap, never a second title', () => {
  const screen = read(SCREEN);
  assert.match(screen, /case 'minigame': return chapter && item\.id === chapterMissionIds\(chapter\)\[2\] \? chapter\.missionNames\[2\]/);
  assert.match(screen, /if \(item\?\.kind === 'minigame'\) return chapter && id === chapterMissionIds\(chapter\)\[2\]\n\s+\? chapter\.missionNames\[2\]/);
  assert.match(screen, /return index >= 0 \? chapter\.missionNames\[index\] : undefined;/);
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /<MiniGameSlot title=\{missionTitle\} item=\{item\}/);
  assert.match(slot, /const label = title \?\? item\.title \?\?/);
});

test('after the 3 2 1, the arcade or the page follows the 1 with no live-board gap', () => {
  const screen = read(SCREEN);
  // The countdown stays up (still on the 1) while it hands over.
  assert.match(screen, /<ResumeCountdown active=\{resuming \|\| resumeHandoff != null\}/);
  assert.match(screen, /const \[resumeHandoff, setResumeHandoff\] = useState<'arcade' \| 'page' \| null>\(null\);/);
  // The arcade: the countdown lets go on the frame the sheet starts coming in (both sheets report it).
  assert.match(screen, /const ARCADE_PRESENT_FRAMES = 3;/);
  assert.match(screen, /const onArcadeShowing = useCallback\(\(\) => \{\n\s+let frames = ARCADE_PRESENT_FRAMES;/);
  assert.match(screen, /else setResumeHandoff\(current => current === 'arcade' \? null : current\);/,
    'the 1 stays up through the frames the native sheet takes to land, so the board never shows live in between');
  assert.equal([...screen.matchAll(/onShowing=\{onArcadeShowing\}/g)].length, 2, 'QueueArcadeSheet and BonusPicker');
  const sheet = read('src/screens/LinePlay/components/QueueArcadeSheet.tsx');
  assert.match(sheet, /onModalWillShow=\{onShowing\}/);
  assert.match(sheet, /useNativeDriver hideModalContentWhileAnimating/, 'the slide runs on the UI thread, so a busy JS thread never holds it');
  assert.match(read('src/screens/LinePlay/components/BonusPicker.tsx'), /onModalWillShow=\{onShowing\}/);
  // The page: jumped to with no scroll animation under the 1, released two frames later, once it is painted.
  assert.match(screen, /frameId = requestAnimationFrame\(\(\) => \{ frameId = requestAnimationFrame\(\(\) => setResumeHandoff\(null\)\); \}\);/);
  // Never stuck: a fallback lets go after RESUME_HANDOFF_MAX_MS.
  assert.match(screen, /const RESUME_HANDOFF_MAX_MS = 1500;/);
  assert.match(screen, /const fallback = setTimeout\(\(\) => setResumeHandoff\(null\), RESUME_HANDOFF_MAX_MS\);/);
  // The countdown: a tap stops its frame clock; a clock finish lets the 1's punch run to 3, where the clock
  // rests (a hold costs no frame work); it fades out on the UI thread.
  const countdown = read('src/screens/LinePlay/components/ResumeCountdown.tsx');
  assert.match(countdown, /if \(byClock !== true\) frameRef\.current\?\.setActive\(false\);/);
  assert.match(countdown, /const after = Math\.min\(3, before \+/);
  assert.match(countdown, /exiting=\{reducedMotion \? undefined : FadeOut\.duration\(EXIT_FADE_MS\)\}/);
  assert.match(countdown, /const EXIT_FADE_MS = 140;/);
  assert.ok(140 < 250, 'the fade ends before the clock resets, so the closing frames keep the 1');
});

test('the chapter page never shows a live-looking button that does nothing (detected, ending, complete)', () => {
  const screen = read(SCREEN);
  assert.match(screen, /locked=\{\(snapshot\.state !== 'active' && snapshot\.state !== 'paused'\) \|\| previewLocked\}/);
  // The dev capture toggle exists only in dev JS.
  assert.match(screen, /if \(!__DEV__\) return undefined;\n\s+const holder = globalThis as \{ __linePlayPreviewLocked\?/);
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  // Locked is never a dead tap (wave 6): every button routes through choose(), which shakes and buzzes when locked.
  assert.match(chapter, /const off = \{ accessibilityState: \{ disabled: locked \} \} as const;/);
  assert.match(chapter, /if \(!locked\) \{ onChooseMission\(id\); return; \}\n\s+void Haptics\.notificationAsync/);
  // Every mission button (PLAY, the strip, the 3 bubbles in both layouts, the crew chips, Crew Prompts) takes it.
  const presses = [...chapter.matchAll(/onPress=\{\(\) => choose\(/g)].length;
  assert.equal(presses, 7);
  assert.equal([...chapter.matchAll(/\{\.\.\.off\}/g)].length, presses, 'every onChooseMission button can be off');
  assert.equal([...chapter.matchAll(/locked && styles\.locked(?:Play)?\b/g)].length, presses, 'and looks off');
  assert.match(chapter, /locked: \{ opacity: 0\.6 \}/);
  assert.match(chapter, /lockedPlay: \{ backgroundColor: '#eef6fd', borderColor: '#7d9cbc' \}/, 'a solid pale strip, never gold faded to olive');
  assert.match(chapter, /export const LOCKED_LINE = 'Get in line to play';/);
  // Paused stays live (the 3 2 1 runs): no button goes dead just because a kid paused.
  assert.doesNotMatch(chapter, /disabled=\{paused\}/);
});

test('the board hint is help: the turn-tile picture wears a small "?" badge, and is never the rail Next picture', () => {
  const m = layout();
  const card = read('src/screens/LinePlay/components/NavigationPanelCard.tsx');
  const hint = card.slice(card.indexOf('const hintButton ='), card.indexOf('const relayStars'));
  assert.match(hint, /<View style=\{\[styles\.helpBadge, beside && styles\.helpBadgeBeside\]\} pointerEvents="none">/);
  assert.match(hint, />\?<\/Text>/);
  assert.match(card, /helpBadge: \{[^}]*backgroundColor: BRAND\.navy/);
  // The hint never wears any rail page's picture (it has no GameIcon at all).
  const pages = ['chapter_intro', 'crew_grid', 'circuit', 'crew_relay', 'signal', 'puzzle', 'trivia', 'lore', 'prediction', 'minigame'];
  const hintIcons = [...hint.matchAll(/<GameIcon[^>]*name=["{]'?([a-zA-Z]+)/g)].map(match => match[1]);
  for (const kind of pages) assert.ok(!hintIcons.includes(m.railPageIcon(kind)), `${kind} Next picture is not the hint`);
  assert.deepEqual(hintIcons, []);
});

test('a narrow rail (iPhone SE) says the mission name alone on up to two full-size lines; wider phones keep "Next:"', () => {
  const m = layout();
  assert.equal(m.RAIL_NARROW_WIDTH, 390);
  assert.deepEqual(plain(m.railNextText('Rebuild the star chart', 375)), { text: 'Rebuild the star chart', lines: 2 });
  assert.deepEqual(plain(m.railNextText('Rebuild the star chart', 402)), { text: 'Next: Rebuild the star chart', lines: 1 });
  assert.deepEqual(plain(m.railNextText('Spot the clue', 440)), { text: 'Next: Spot the clue', lines: 1 });
  assert.deepEqual(plain(m.railNextText('Spot the clue', 0)), { text: 'Next: Spot the clue', lines: 1 }, 'before the first layout');
  const rail = read('src/screens/LinePlay/components/ActivityPageRail.tsx');
  assert.match(rail, /`Next activity: \$\{nextLabel\}`/, 'VoiceOver still hears Next');
  assert.match(rail, /nextTextTwoLines: \{ lineHeight: 18, textAlign: 'center' \}/);
});

test('the crew row in the free band is a full 44 pt with no top margin, so it sits in the middle', () => {
  const strip = read('src/screens/LinePlay/group/GroupStrip.tsx');
  assert.match(strip, /bandChip: \{ minHeight: 44, marginTop: 0 \}/);
  assert.equal([...strip.matchAll(/compact && styles\.compactChip, band && styles\.bandChip/g)].length, 2);
  const hook = read('src/screens/LinePlay/group/useGroupPlay.tsx');
  assert.match(hook, /const bandStrip: ReactNode = showStrip \? <GroupStrip group=\{group\} compact=\{compact\} band onEdit=\{onEditCrew\} \/> : null;/);
});

test('one message asks at a time: the idle nudge never shows over a one-time tip, the 3 2 1 or a sheet', () => {
  const gate = loadTs('src/services/help/tipGate.ts');
  const calm = { busy: false, tipUp: false, appActive: true, alreadyNudged: false, quietMs: 26_000 };
  assert.equal(gate.lineNudgeReady(calm), true);
  assert.equal(gate.lineNudgeReady({ ...calm, tipUp: true }), false, 'the Welcome tip is up');
  assert.equal(gate.lineNudgeReady({ ...calm, busy: true }), false, 'a sheet, the arcade or the countdown');
  assert.equal(gate.lineNudgeReady({ ...calm, quietMs: 24_000 }), false);
  assert.equal(gate.lineNudgeReady({ ...calm, alreadyNudged: true }), false);
  assert.equal(gate.lineNudgeReady({ ...calm, appActive: false }), false);
  const screen = read(SCREEN);
  assert.match(screen, /if \(!lineNudgeReady\(\{ busy: sheetOpenRef\.current, tipUp: tipsUp\.current\.size > 0,/);
  assert.match(screen, /sheetOpenRef\.current = somethingAsks;/);
  assert.match(screen, /const somethingAsks = groupPlay\.sheetOpen \|\| arcadeOpen \|\| projectOpen \|\| waitEndPrompt != null \|\| boardingAsk \|\| lineDone \|\| resuming \|\|\n\s+resumeHandoff != null;/);
  assert.match(screen, /onVisibleChange=\{onIntroTip\}/);
  assert.match(screen, /onVisibleChange=\{onPartTip\}/);
  const tip = read('src/components/help/OneTimeTip.tsx');
  assert.match(tip, /onVisibleChange\(visible\);\n\s+return visible \? \(\) => onVisibleChange\(false\) : undefined;/, 'it reports hiding too, even on unmount');
});

test('a queue toast lands just under the wait card, never over its numbers, buttons or the header (wave 6)', () => {
  const m = layout();
  // Any card height (iPhone SE no-Parts card 91..245, with Parts 92..315, a moving line's compact card 92..180):
  // the toast's whole rectangle sits below the card, so it never covers SIGN SAYS, IN LINE, the ride name or a button.
  for (let top = 60; top <= 140; top += 10) for (let bottom = top + 80; bottom <= top + 320; bottom += 7) {
    const spot = m.queueToastSpot(top, bottom);
    assert.equal(spot.slim, true);
    assert.ok(spot.top >= bottom + 6, `toast at ${spot.top} crosses a card ${top}..${bottom}`);
    assert.ok(spot.top + m.QUEUE_TOAST_SLIM_H > bottom, 'and it sits right under it');
  }
  assert.deepEqual(plain(m.queueToastSpot(91, 245)), { top: 251, slim: true }, 'iPhone SE, no Parts: under the stat row, not on it');
  assert.equal(m.queueToastSpot(null, 315), null, 'not measured yet: the default spot');
  // The crew row steps aside while a toast sits in its slot.
  assert.match(read(SCREEN), /crewFade\.value = reducedFx \? \(toast \? 0 : 1\) : withTiming\(toast \? 0 : 1, \{ duration: 160 \}\);/);
  assert.match(read(SCREEN), /<Reanimated\.View style=\{crewFadeStyle\}>\{groupPlay\.strip\}<\/Reanimated\.View>/);
  assert.match(read(SCREEN), /<QueueToast message=\{toast\} onDone=\{\(\) => setToast\(null\)\} top=\{toastSpot\?\.top\} slim=\{toastSpot\?\.slim\} \/>/);
  const toast = read('src/screens/LinePlay/components/QueueToast.tsx');
  assert.match(toast, /style=\{\[styles\.wrap, top != null && \{ top \}\]\}/);
  assert.match(toast, /toastSlim: \{ height: 54,/);
  // Its way in and out never crosses the card's top row: it travels 6 pt inside the card, under the band's margin.
  assert.match(toast, /translateY: \(1 - drop\.value\) \* \(top != null \? -TUCKED_DROP : -70\)/);
  assert.match(toast, /const TUCKED_DROP = 6;/);
  assert.equal(m.QUEUE_TOAST_SLIM_H, 54);
});

test('the arcade sheet slides in already full: its pictures are decoded while LinePlay is up', () => {
  const sheet = read('src/screens/LinePlay/components/QueueArcadeSheet.tsx');
  assert.match(sheet, /export function ArcadeIconWarmup\(\)/);
  assert.match(sheet, /\{Object\.keys\(ICONS\)\.map\(key => <Image key=\{key\} source=\{ICONS\[key\]\} style=\{styles\.gameIcon\} contentFit="contain" \/>\)\}/,
    'every tile picture, at tile size, so the cache holds exactly what the sheet draws');
  assert.match(sheet, /<Image source=\{ARCADE_HEADER_ICON\} style=\{styles\.arcadeIcon\} contentFit="contain" \/>/);
  assert.match(sheet, /warmup: \{ position: 'absolute', left: 0, top: 0, width: 72, opacity: 0 \}/);
  assert.match(sheet, /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/);
  assert.match(read(SCREEN), /\n\s+<ArcadeIconWarmup \/>\n/);
  // Every tile is there from the sheet's first frame (no tile zooms in from nothing); they only settle 88% to 100%.
  assert.doesNotMatch(sheet, /ZoomIn/);
  assert.match(sheet, /initialValues: \{ transform: \[\{ scale: 0\.88 \}\] \}/);
  assert.match(sheet, /entering=\{visible && !reducedMotion \? tileSettle\(60 \+ order \* 45\) : undefined\}/);
});

test('one name per idea on the chapter page: the header is the park and the shark while clues are left', () => {
  const chapter = read('src/screens/LinePlay/components/ChapterCard.tsx');
  const header = chapter.slice(chapter.indexOf('const header = ('), chapter.indexOf('const playNow = ('));
  assert.doesNotMatch(header, /chapter\.title/, 'the story name never sits beside a mission name');
  assert.match(header, /\{done === 3 \? <>/);
  assert.match(header, /\{chapter\.completedTitle\}/, 'finished, it celebrates');
  assert.match(header, /accessibilityLabel=\{chapterKicker\(chapter\)\}>\{chapterPageKicker\(chapter\)\}<\/KidText>\}/);
});

test('on a short window (iPhone SE) a page banner is one slim row and the clue page leads with what to do', () => {
  const m = layout();
  assert.equal(m.heroSlim(113), true, 'SE clue page window');
  assert.equal(m.heroSlim(0), false, 'before layout');
  assert.equal(m.heroSlim(179), true, 'SE clue page window, short wait card (no Ride Parts)');
  assert.equal(m.heroSlim(260), false, 'taller phones keep the full banner');
  const slot = read('src/screens/LinePlay/components/ActivitySlot.tsx');
  assert.match(slot, /const slim = heroSlim\(useContext\(PageHeightContext\)\);/);
  assert.match(slot, /heroSlim: \{ height: 46, marginBottom: spacing\.sm \}/);
  assert.match(slot, /return <>\{hero\}\{short \? <><View style=\{styles\.actionFirst\}>\{a\}<\/View>\{s\}<\/> : <>\{s\}\{a\}<\/>\}<\/>;/);
  assert.equal([...slot.matchAll(/<ActionFirstWhenShort\n/g)].length, 2, 'the clue page and the mini-game page (Play first)');
  assert.match(slot, /<ActionFirstWhenShort\n\s+hero=\{<ActivityHero kicker=\{navigator \? 'STARPORT' : 'QUEUE QUEST'\}/);
  assert.match(read('src/screens/LinePlay/components/PageScroll.tsx'), /<PageHeightContext\.Provider value=\{viewHeight\}>\{children\}<\/PageHeightContext\.Provider>/);
});
