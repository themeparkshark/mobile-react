'use strict';
/**
 * STICKER BOOK kit (src/ui/sticker): tokens, the two-level rule, text roles, layout (chrome covers
 * nothing), the layer queue, each part's decisions, and the kit's engineering rules.
 * Behaviour is tested through the pure decision functions the parts call (react-test-renderer is
 * not installed and no dependency may be added).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'src/ui/sticker');
const files = [];
(function walk(d) {
  for (const name of fs.readdirSync(d)) {
    const full = path.join(d, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(name)) files.push(full);
  }
})(dir);
const rel = full => path.relative(root, full);
const source = full => fs.readFileSync(full, 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
const tokens = loadTs('src/ui/sticker/tokens.ts');
const level = loadTs('src/ui/sticker/level.ts');
const layout = loadTs('src/ui/sticker/layout.ts');
const outline = loadTs('src/ui/sticker/outline.ts');
const roles = loadTs('src/ui/sticker/textRoles.ts');
const layers = loadTs('src/ui/sticker/layers.ts');

/** Stubs so a part's .tsx loads for its pure exports (nothing renders). */
function anything(name) {
  const fn = function stub() { return undefined; };
  return new Proxy(fn, { get: (t, k) => (k === 'default' ? anything(`${name}.default`) : k === '__esModule' ? true : k === 'create' ? (x => x) : anything(`${name}.${String(k)}`)), apply: () => undefined });
}
const STUBS = {
  react: { memo: x => x, createContext: v => ({ Provider: 'P', _v: v }), useContext: () => null, useMemo: f => f(), useState: v => [typeof v === 'function' ? v() : v, () => {}],
    useRef: v => ({ current: v }), useEffect: () => {}, useCallback: f => f, useSyncExternalStore: (s, g) => g() },
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  'react-native': anything('rn'),
  'react-native-reanimated': anything('rea'),
  'react-native-svg': anything('svg'),
  'react-native-safe-area-context': anything('safe'),
  'expo-linear-gradient': anything('grad'),
  '../../gamekit/Haptics': { haptic: () => {} },
  '@react-navigation/native': { NavigationContext: { Provider: 'P', _v: undefined }, NavigationRouteContext: { Provider: 'P', _v: undefined } },
  '../GameIcon': { ICON_SOURCES: { coin: 'coin.png', ticket: 'ticket.png' } },
};
const part = name => loadTs(`src/ui/sticker/${name}`, STUBS);

// ---------- palette ----------

const INK_RGB = new Set(Object.values(tokens.INK).filter(v => v.startsWith('#')).map(v => {
  const n = parseInt(v.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}));

test('only tokens.ts holds a colour under src/ui/sticker: no hex, rgb, hsl or named colour', () => {
  assert.ok(files.length >= 30, 'the kit files are found');
  const named = /['"](black|gray|grey|white|red|blue|green|gold|yellow|navy|silver|orange|purple|pink|brown)['"]/;
  for (const full of files) {
    if (rel(full) === 'src/ui/sticker/tokens.ts') continue;
    const text = source(full);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/, `${rel(full)} holds a hex colour`);
    assert.doesNotMatch(text, /rgba?\(|hsla?\(/, `${rel(full)} holds an rgb or hsl colour`);
    for (const m of text.matchAll(/(?:[cC]olor|backgroundColor|borderColor|tintColor|fill|stroke|stopColor)\s*[:=]\s*\{?\s*(['"][a-z]+['"])/g)) {
      assert.ok(/^['"](transparent|none)['"]$/.test(m[1]), `${rel(full)} uses the named colour ${m[1]}`);
    }
    assert.doesNotMatch(text.replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '').replace(/tone[=:]\s*['"]\w+['"]|variant[=:]\s*['"]\w+['"]|paper[=:]\s*['"]\w+['"]/g, ''), /(?:color|Color)\s*:\s*['"](black|gray|grey)['"]/, `${rel(full)} names black or gray`);
    void named;
  }
});

test('the palette is exactly the DIRECTION.md final tokens', () => {
  const want = {
    navy: '#05346e', navySoft: '#3d5f8c', blue: '#0768b9', blueBright: '#1590e6', blueLip: '#05468f', sky: '#cfe9fb', skyLip: '#9cc9ec',
    white: '#ffffff', cream: '#fff6dc', creamDeep: '#f3e3b4', creamLip: '#dcc78c', gold: '#ffcf3b', goldLight: '#ffe37d', goldLip: '#d99a00',
    goldInk: '#8a5a00', red: '#ef4a3c', redLip: '#b92e22', green: '#3cb85c', scrim: 'rgba(5,52,110,0.52)',
  };
  assert.deepEqual({ ...tokens.INK }, want);
  assert.deepEqual({ ...tokens.LINE }, { page: 3, card: 2.5, button: 2.5, chip: 2, tag: 2, map: 3 });
  assert.deepEqual({ ...tokens.EDGE }, { page: 4, card: 3, button: 3, label: 3 });
  assert.equal(tokens.DROP.page, 5);
  assert.equal(tokens.DROP.cardOnWorld, 4);
  assert.equal(tokens.DROP.cardInPage, 3);
  assert.equal(tokens.DROP.tag, 2.5);
  assert.equal(tokens.FLOAT_SHADOW.y, 18);
  assert.equal(tokens.FLOAT_SHADOW.blur, 28);
  assert.deepEqual([tokens.BUTTON.heightLarge, tokens.BUTTON.height, tokens.BUTTON.heightSmall, tokens.BUTTON.heightKey], [58, 44, 36, 42]);
  assert.deepEqual([tokens.BUTTON.lip, tokens.BUTTON.lipSmall, tokens.BUTTON.shine], [5, 4, 2]);
  assert.deepEqual({ ...tokens.RADIUS }, { page: 24, pageSmall: 20, card: 16, buttonLarge: 22, button: 18, buttonSmall: 14, key: 15, label: 11, pill: 999 });
  assert.equal(tokens.SPACE.base, 4);
  assert.equal(tokens.SPACE.margin, 16);
  assert.equal(tokens.STROKE.max, 3);
  assert.equal(tokens.STROKE.minSize, 17);
  assert.equal(tokens.STROKE.button, 2.2);
  assert.ok(tokens.STROKE.title >= 2.6 && tokens.STROKE.title <= 2.8);
  assert.equal(tokens.TYPE.min, 12);
});

test('every translucent value is an INK colour at an alpha (drops, insets and the scrim are navy)', () => {
  const groups = { SHADE: tokens.SHADE, DROP: tokens.DROP, FLOAT_SHADOW: tokens.FLOAT_SHADOW, INK: tokens.INK };
  for (const [group, values] of Object.entries(groups)) {
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'string' || !value.startsWith('rgba')) continue;
      const m = /^rgba\((\d+),(\d+),(\d+),(0(?:\.\d+)?|1)\)$/.exec(value);
      assert.ok(m, `${group}.${key} ${value} is not rgba`);
      assert.ok(INK_RGB.has(`${m[1]},${m[2]},${m[3]}`), `${group}.${key} ${value} is not an INK colour at an alpha`);
    }
  }
  for (const key of ['color', 'inPage', 'map', 'knob']) assert.match(tokens.DROP[key], /^rgba\(5,52,110,0\.\d+\)$/, `DROP.${key} is navy`);
  assert.match(tokens.FLOAT_SHADOW.color, /^rgba\(5,52,110,/);
  assert.equal(tokens.inkAt('#05346e', 0.5), 'rgba(5,52,110,0.5)');
});

test('no black and no gray anywhere in the tokens; the off button is sky, never slate', () => {
  const all = [...Object.values(tokens.INK), ...Object.values(tokens.SHADE), ...Object.values(tokens.GALLERY)];
  for (const value of all) {
    const hex = /^#([0-9a-f]{6})$/i.exec(value);
    if (!hex) continue;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
    assert.ok(Math.max(r, g, b) > 40, `${value} is near black`);
    assert.ok(!(Math.max(r, g, b) - Math.min(r, g, b) < 12 && Math.max(r, g, b) < 240), `${value} is a neutral gray`);
  }
  for (const gone of ['offLip', 'offFaceTop', 'offFaceLow', 'offInk', 'offStroke', 'spotNextFill']) assert.ok(!(gone in tokens.SHADE), `SHADE.${gone} is gone`);
  const button = source(path.join(dir, 'StickerButton.tsx'));
  assert.match(button, /off: \{ lip: INK\.skyLip, face: \[INK\.sky, INK\.sky\], shine: null, ink: 'soft' \}/, 'off is sky paper pressed in, no top line: never slate, never the white third');
});

// ---------- the two-level rule ----------

const W = level.WORLD;
const M = level.MAP;
const P = level.insidePage();
const C = level.insideCard();
const F = level.insideFoot();

test('two levels: page and card edges on level 1 only; inside a card is always level 2 on paper', () => {
  assert.equal(level.edgeFor('page', W), 4);
  assert.equal(level.edgeFor('page', M), 3, 'a page on the map takes the card edge');
  assert.equal(level.edgeFor('page', P), 0);
  assert.equal(level.edgeFor('card', W), 3, 'World > Card wears the edge');
  assert.equal(level.edgeFor('card', P), 0, 'Page > Card never does');
  assert.equal(level.edgeFor('label', W), 3);
  assert.equal(level.edgeFor('label', P), 0);
  assert.deepEqual(plain(C), { level: 'page', surface: 'paper', foot: false }, 'insideCard is page on paper wherever the card sits');
  assert.equal(level.edgeFor('card', C), 0, 'Card > Card: no double outline');
  assert.equal(level.edgeFor('button', C, true), 0, 'World > Card > primary: no edge (the card is the level 1 piece)');
  assert.equal(level.levelNumber('world'), 1);
  assert.equal(level.levelNumber('page'), 2);
  assert.equal(level.lineFor('map', 2.5, 3), 3);
});

test('the white edge on a button: only the one primary, only on level 1 or in a wave foot', () => {
  assert.equal(level.edgeFor('button', W, true), 3);
  assert.equal(level.edgeFor('button', M, true), 3);
  assert.equal(level.edgeFor('button', W, false), 0, 'a second or third on the world: no edge');
  assert.equal(level.edgeFor('button', P, true), 0, 'a primary inside a page: no edge');
  assert.equal(level.edgeFor('button', F, true), 3, 'Page > WaveFoot > primary wears it (the win card)');
  assert.equal(level.edgeFor('button', F, false), 0);
});

test('a root ground inside a page is refused: Page > World > Card draws no white layer', () => {
  const inPage = level.groundFor(P, 'world', true);
  assert.equal(inPage.refused, true);
  assert.equal(level.edgeFor('card', inPage.place), 0);
  assert.deepEqual(plain(level.groundFor(W, 'map', true)), { place: plain(M), refused: false });
  assert.deepEqual(plain(level.groundFor(W, 'world', false)), { place: plain(W), refused: false });
  level.resetWarnings();
  const said = [];
  assert.equal(level.warnOnce('x', false, m => said.push(m), 'quiet'), false, 'release builds stay quiet');
  assert.equal(level.warnOnce('x', true, m => said.push(m), 'once'), true);
  assert.equal(level.warnOnce('x', true, m => said.push(m), 'once'), false);
  assert.equal(said.length, 1);
  assert.equal(level.tooManyPrimaries(1), false);
  assert.equal(level.tooManyPrimaries(2), true);
});

test('no part takes an edge prop, and the place providers stay internal', () => {
  for (const name of ['Card.tsx', 'StickerButton.tsx', 'TitleLabel.tsx', 'Page.tsx', 'Tag.tsx']) {
    assert.doesNotMatch(source(path.join(dir, name)), /readonly edge\?|edge: asked/, `${name} takes an edge prop`);
  }
  const index = source(path.join(dir, 'index.ts')).replace(/\/\*[^]*?\*\//g, '');
  for (const internal of ['StickerGround', 'PlaceProvider', 'StickerText', 'SHADE', 'DROP', 'GALLERY', "export * from './tokens'"]) {
    assert.ok(!index.includes(internal), `the barrel exports ${internal}`);
  }
  // No palette and no wave foot for screens: a screen that needs a colour has found a missing part,
  // and only Page, Screen, Sheet and Dialog draw a wave foot (which grants the primary its edge).
  for (const internal of ['INK', 'RADIUS', 'WaveFoot']) assert.doesNotMatch(index, new RegExp(`\\b${internal}\\b`), `the barrel exports ${internal}`);
  assert.doesNotMatch(index, /\{[^}]*\bGround\b[^}]*\}/, 'the barrel exports the internal Ground');
  for (const pub of ['Screen', 'World', 'MapGround', 'Header', 'Footer', 'Sheet', 'Dialog', 'Stage', 'Switch', 'showToast', 'StatePanel', 'ListRow', 'FilterChips', 'Body', 'Caps']) {
    assert.match(index, new RegExp(`\\b${pub}\\b`), `the barrel misses ${pub}`);
  }
  // Header, Footer and the layer host refuse to mount inside a page.
  for (const name of ['Header.tsx', 'Footer.tsx', 'Overlay.tsx']) assert.match(source(path.join(dir, name)), /useRefuseInPage\('/, `${name} does not refuse a page`);
});

// ---------- text ----------

test('outlined type: no stroke under 17 pt, never above 3 pt; 12 copies under 24 pt, 16 from 24', () => {
  assert.equal(outline.strokeFor(16), 0);
  assert.equal(outline.strokeFor(17), 2.2);
  assert.equal(outline.strokeFor(30), 2.7);
  assert.equal(outline.strokeFor(35, 5), 3, 'clamped to 3');
  assert.equal(outline.copiesFor(17), 12);
  assert.equal(outline.copiesFor(22), 12);
  assert.equal(outline.copiesFor(24), 16);
  assert.ok(outline.scallop(2.2, 12) < 0.1, 'the 12-copy ring at 2.2 pt is round to under 0.1 pt');
  assert.ok(outline.scallop(2.8, 16) < 0.06);
  const r = outline.ring(2.7, 16);
  for (const p of r) assert.ok(Math.abs(Math.hypot(p.x, p.y) - 2.7) < 0.02);
});

test('text roles are the DIRECTION.md type table, and paper is always plain navy', () => {
  const T = roles.TEXT;
  assert.equal(T.title.size, 30);
  assert.ok(T.title.spacing >= 0.09 && T.title.spacing <= 0.1);
  assert.equal(T.titleLarge.size, 32);
  assert.ok(T.titleLarge.spacing >= 0.09 && T.titleLarge.spacing <= 0.1);
  assert.equal(T.hero.size, 35);
  assert.equal(T.heading.size, 24);
  assert.ok(T.name.size >= 17 && T.name.size <= 19);
  assert.deepEqual([T.body.size, T.bodyMid.size, T.bodySmall.size], [16, 15, 14]);
  assert.equal(T.caps.size, 12);
  assert.equal(T.caps.spacing, 0.11);
  for (const [name, spec] of Object.entries(T)) {
    assert.ok(spec.size >= 12, `${name} under 12 pt`);
    assert.ok(spec.stroke <= 3, `${name} stroke above 3`);
    if (spec.size < 17) assert.equal(spec.stroke, 0, `${name} stroked under 17 pt`);
    if (spec.stroke > 0 && spec.size >= 24) assert.ok(spec.stroke >= 2.6 && spec.stroke <= 2.8, `${name} title stroke`);
    if (spec.stroke > 0 && spec.size < 24) assert.equal(spec.stroke, 2.2, `${name} button stroke`);
  }
  for (const spec of Object.values(roles.BUTTON_TEXT)) assert.ok(spec.stroke >= 2.2 && spec.stroke <= 3);
  // Paper: plain navy at every size, never a stroke.
  assert.deepEqual(plain(roles.inkFor(T.title, true)), { ink: 'navy', stroke: 0, drop: 0, smallDrop: false });
  assert.deepEqual(plain(roles.inkFor(T.caps, true)), { ink: 'goldInk', stroke: 0, drop: 0, smallDrop: false });
  assert.equal(roles.inkFor(T.body, true, 'soft').ink, 'navySoft');
  // Colour: stroked at 17 and up, plain white with the small drop under.
  assert.deepEqual(plain(roles.inkFor(T.title, false)), { ink: 'white', stroke: 2.7, drop: 2.5, smallDrop: false });
  assert.deepEqual(plain(roles.inkFor(T.caps, false)), { ink: 'white', stroke: 0, drop: 0, smallDrop: true }, 'caps on blue are plain white');
  assert.equal(roles.inkFor(T.hero, false, 'gold').ink, 'gold');
  assert.equal(roles.inkFor(T.hero, true, 'gold').ink, 'goldInk', 'gold on paper is gold ink');
  // StickerText draws with the one tested rule: its ink, stroke and drop come from inkFor.
  const st = source(path.join(dir, 'StickerText.tsx'));
  assert.match(st, /import \{ inkFor[^}]*\} from '\.\/textRoles'/, 'StickerText imports inkFor');
  assert.match(st, /const ink = inkFor\(/, 'StickerText inks from inkFor');
  assert.doesNotMatch(st, /INK\.goldInk : INK\.gold|onPaper \? INK\.navySoft/, 'no second ink rule beside inkFor');
  assert.match(st, /fit = false/, 'fit is off unless asked');
  assert.match(st, /const measureNode = shrink && natural === 0 \?/, 'the measure node unmounts once measured');
  assert.doesNotMatch(st, /adjustsFontSizeToFit|styles\.hidden/, 'no system shrink and no invisible first frame');
});

test('a one-line title is sized once for every copy: never bigger, never under 60 percent', () => {
  const text = part('StickerText.tsx');
  assert.equal(text.fitSize(30, 200, 150), 30);
  assert.equal(text.fitSize(30, 0, 150), 30, 'not measured yet: drawn at the asked size');
  assert.equal(text.fitSize(30, 150, 200), 22.5);
  assert.equal(text.fitSize(30, 50, 200), 18, 'floor at 60 percent');
});

test('screens use the text roles: no StickerText, no raw text props in proofs', () => {
  for (const name of ['ProofGate.tsx', 'ProofRewards.tsx', 'ProofShelf.tsx', 'ProofWin.tsx', 'ProofMap.tsx', 'ProofShop.tsx']) {
    const text = source(path.join(dir, 'proof', name));
    assert.doesNotMatch(text, /StickerText|stroke=\{|spacing=\{|fontSize|faceHeight|<Pressable|<Modal|<TouchableOpacity|shadowRadius|fontFamily|fontWeight/, `${name} styles text or controls by hand`);
    assert.doesNotMatch(text, /headerHeight\(|headerContentTop\(|insets\.top/, `${name} places content from the bar by hand`);
  }
});

// ---------- layout: chrome covers nothing ----------

test('the Header is never taller than today\'s top bar (status bar + 70) for the real safe areas', () => {
  const topbar = source(path.join(root, 'src/components/Topbar.tsx'));
  const today = Number(/height: (\d+) \+ Constants\.statusBarHeight/.exec(topbar)[1]);
  assert.equal(layout.TOPBAR_TODAY, today);
  // [status bar height, safe area top]: iPhone 17 Pro, 16 Pro, SE, an old notch-less iPad.
  for (const [status, inset] of [[54, 62], [54, 59], [20, 20], [24, 24]]) {
    assert.ok(layout.headerHeight(inset) <= status + today, `${status}/${inset}: ${layout.headerHeight(inset)} > ${status + today}`);
  }
  assert.equal(layout.headerContentTop(62), layout.headerHeight(62) + tokens.HEADER.gap);
  const header = source(path.join(dir, 'Header.tsx'));
  const body = header.slice(header.indexOf('function HeaderImpl'));
  assert.doesNotMatch(body, /wavePath|waveRun|WAVE\./, 'the Header draws no wave');
  assert.doesNotMatch(body, /position: 'absolute', left: 0, right: 0, top: 0, height, zIndex/, 'the Header is in flow, not an overlay');
  // The band is straight layers that end exactly at the bar's height: water, line, edge, drop.
  const hp = part('Header.tsx');
  for (const inset of [62, 59, 20, 0]) {
    const lay = plain(hp.headerLayers(inset));
    assert.ok(lay.water < lay.line && lay.line < lay.edge && lay.edge < lay.drop);
    assert.equal(lay.drop, layout.headerHeight(inset), 'the drop ends where the bar ends: nothing hangs under it');
  }
  assert.doesNotMatch(header, /from 'react-native-svg'/, 'the straight band is views and RN images (server art through the image cache)');
});

test('the Footer takes its own space: band never taller than today, hump and Map icon inside its box', () => {
  const footer = part('Footer.tsx');
  for (const width of [320, 375, 390, 402, 440]) {
    const band = layout.footerBand(width);
    assert.ok(band <= width / tokens.FOOTER.todayRatio, `${width}: band ${band} taller than today's art`);
    const box = layout.footerHeight(width);
    assert.ok(box - band <= 45, 'the rise over the band is no more than today\'s compass (45 above the bar)');
    // The raised Map icon's top stays inside the footer's box.
    const map = footer.FOOTER_ART[2];
    const s = layout.footerScale(width);
    const iconH = Math.round(Math.round(map.size * s) / map.ratio);
    assert.ok(box - map.bottom - iconH >= -0.5, `${width}: the Map icon rises out of the footer box`);
    assert.ok(layout.footerCrest() - tokens.FOOTER.hump - tokens.FOOTER.rim >= 0, 'the hump stays in the box');
    assert.equal(layout.footerContentBottom(width), box + tokens.HEADER.gap);
    const d = footer.footerPath(width, box);
    assert.match(d, new RegExp(`^M0,${layout.footerCrest()} Q`));
    assert.match(d, new RegExp(` L${width},${box + 4} L0,${box + 4} Z$`));
  }
  assert.equal(footer.FOOTER_ART.length, 5);
  // Today's order: News, Standings, Map, Social, Profile (Wrapper.tsx).
  const wrapper = source(path.join(root, 'src/components/Wrapper.tsx'));
  const order = [...wrapper.matchAll(/toolbar\/(\w+)\.png/g)].map(m => m[1]);
  assert.deepEqual(order, ['news', 'leaderboard', 'explore', 'social', 'profile']);
  const art = source(path.join(dir, 'art.ts'));
  for (const [key, file] of [['toolbarNews', 'news'], ['toolbarStandings', 'leaderboard'], ['toolbarMap', 'explore'], ['toolbarSocial', 'social'], ['toolbarProfile', 'profile']]) {
    assert.match(art, new RegExp(`${key}: require\\('../../../assets/images/toolbar/${file}\\.png'\\)`));
  }
});

test('Screen lays the bars out in flow and pads the body from the parts', () => {
  const screen = part('Screen.tsx');
  // The footer sits over the body's bottom, so the body pads by the footer's whole box and gap (clear at rest, under the wave when scrolled).
  assert.deepEqual(plain(screen.screenBodyPadding(true, 'footer', 62, 34, 402)), { top: tokens.HEADER.gap, bottom: layout.footerContentBottom(402) });
  assert.deepEqual(plain(screen.screenBodyPadding(true, 'foot', 62, 34, 402)), { top: tokens.HEADER.gap, bottom: tokens.HEADER.gap });
  assert.deepEqual(plain(screen.screenBodyPadding(false, 'none', 20, 0, 375)), { top: 20 + tokens.HEADER.gap, bottom: tokens.SPACE.margin + tokens.HEADER.gap });
  const text = source(path.join(dir, 'Screen.tsx'));
  assert.match(text, /\{header \? <Header \{\.\.\.header\}/);
  assert.ok(text.indexOf('<Header') < text.indexOf('{body}') && text.indexOf('{body}') < text.indexOf('<Footer'), 'header, body, footer in flow, in that order (VoiceOver reads in order)');
});

test('a page reserves its own rise: ribbons, labels, the lock and top art, at every phone width', () => {
  for (const width of [320, 375, 402, 440]) {
    const page = layout.layerWidth(width);
    const ribbonW = layout.ribbonWidth('page', page, width);
    const g = layout.ribbonGeometry(ribbonW);
    assert.equal(g.height, Math.round(ribbonW / tokens.RIBBON.ratio));
    assert.ok(g.rise >= g.height - g.overlap, 'the ribbon rise covers the part above the page');
    const rise = layout.pageRise({ ribbon: { kind: 'page' }, edge: 4 }, page, width);
    assert.ok(rise >= g.rise, `${width}: page rise ${rise} under the ribbon's ${g.rise}`);
    const section = layout.ribbonWidth('section', layout.screenFrameWidth(width), width);
    assert.ok(section < layout.screenFrameWidth(width));
  }
  assert.equal(layout.pageRise({ edge: 4 }, 300, 375), 4, 'a plain page rises by its own white edge');
  assert.equal(layout.pageRise({ label: { large: true }, edge: 4 }, 300, 375), 19 + 3);
  assert.equal(layout.pageRise({ label: { large: true, art: 'lock' }, edge: 4 }, 300, 375), 19 - layout.LOCK_ART.top + 3, 'the lock rises above the label');
  assert.equal(layout.pageRise({ topArt: { rise: 36 }, edge: 4 }, 300, 375), 36);
  const page = source(path.join(dir, 'Page.tsx'));
  assert.match(page, /marginTop: rise/, 'Page takes its rise as its top margin');
  assert.doesNotMatch(page, /footHeight|readonly left\?|rotate/, 'no raw label geometry, no separate foot height, nothing tilted');
  assert.match(page, /readonly foot\?: PageFoot/);
});

test('button heights: 58, 44, 36 and the 42 key, lips 5 and 4, every one at least 44 to touch', () => {
  assert.equal(layout.buttonFace('large'), 58);
  assert.equal(layout.buttonFace('medium'), 44);
  assert.equal(layout.buttonFace('small'), 36);
  assert.equal(layout.buttonFace('row'), 36);
  assert.equal(layout.buttonFace('key'), 42);
  assert.equal(layout.buttonHeight('large'), 58 + 5 + 5);
  assert.equal(layout.buttonHeight('small'), 36 + 4 + 5);
  assert.equal(layout.buttonHeight('large', true), 58 + 5 + 6, 'on the map the line is 3');
  for (const size of ['large', 'medium', 'small', 'row', 'key']) assert.ok(layout.buttonHeight(size) >= tokens.BUTTON.minTouch, `${size} under 44`);
  const button = source(path.join(dir, 'StickerButton.tsx'));
  assert.doesNotMatch(button, /faceHeight|fontSize\?|readonly primary\?|readonly color\?|showPressed/, 'no geometry overrides, no free primary flag');
  const sb = part('StickerButton.tsx');
  assert.equal(sb.kitVariant('secondary'), 'second', 'GameButton\'s secondary is the blue second');
  assert.equal(sb.kitVariant('primary'), 'primary');
  assert.equal(sb.kitSize('regular'), 'large');
  assert.equal(sb.kitSize('compact'), 'medium');
});

test('StickerButton is a drop-in for GameButton: every GameButtonProps name exists', () => {
  const game = source(path.join(root, 'src/ui/GameButton.tsx'));
  const names = [...game.slice(game.indexOf('export type GameButtonProps'), game.indexOf('};', game.indexOf('export type GameButtonProps'))).matchAll(/readonly (\w+)\??:/g)].map(m => m[1]);
  assert.ok(names.length >= 12);
  const kit = source(path.join(dir, 'StickerButton.tsx'));
  const props = kit.slice(kit.indexOf('export type StickerButtonProps'), kit.indexOf('};', kit.indexOf('export type StickerButtonProps')));
  for (const name of names) assert.match(props, new RegExp(`readonly ${name}\\??:`), `StickerButtonProps misses ${name}`);
  assert.match(kit, /useCountPrimary\(primary, label\)/, 'a primary counts itself in its screen');
});

// ---------- parts ----------

test('spots: dark navy discs on blue, a ghost is a tinted silhouette, next is a 3 pt gold ring with a gold-light ring inside', () => {
  const spot = part('Spot.tsx');
  const empty = plain(spot.spotLook('empty', false));
  assert.equal(empty.fill, tokens.SHADE.spotBlue);
  assert.match(tokens.SHADE.spotBlue, /^rgba\(5,52,110,0\.5\)$/);
  assert.equal(empty.dashed, true);
  const ghost = plain(spot.spotLook('ghost', false));
  assert.equal(ghost.ghostTint, tokens.INK.sky, 'a blue-tinted silhouette, never the art at low opacity');
  assert.ok(ghost.ghostOpacity < 0.5);
  const next = plain(spot.spotLook('next', false));
  assert.equal(next.ring, tokens.INK.gold);
  assert.equal(next.ringWidth, 3);
  assert.equal(next.inner, tokens.INK.goldLight);
  assert.equal(next.fill, tokens.SHADE.spotBlue, 'next is the same dark disc (no teal gold wash)');
  assert.equal(next.dashed, false);
  const paperGhost = plain(spot.spotLook('ghost', true));
  assert.equal(paperGhost.fill, tokens.SHADE.spotPaper);
  assert.equal(paperGhost.ghostTint, tokens.INK.navySoft, 'on paper the ghost is navy soft');
  assert.equal(ghost.ghostTrace, 0, 'no layer of the art\'s own colour');
  assert.match(source(path.join(dir, 'Spot.tsx')), /tintColor: look\.ghostTint/);
  assert.doesNotMatch(source(path.join(dir, 'Spot.tsx')), /ghostTrace \}|opacity: SPOT\.ghostTrace/, 'the art is never drawn faded under its ghost');
  // A gold ghost samples exactly as a blue one: tintColor replaces every pixel's colour, so the art's own colour never shows.
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const over = (top, a, under) => top.map((c, i) => Math.round(c * a + under[i] * (1 - a)));
  const ghostPixel = (art, paper) => {
    const look = plain(spot.spotLook('ghost', paper));
    const page = rgb(tokens.INK.blue);
    const disc = paper ? rgb(tokens.SHADE.spotPaper) : over(rgb(tokens.INK.navy), 0.5, page);
    const tinted = rgb(look.ghostTint); // tintColor: the art's colour is replaced
    void art;
    return over(tinted, look.ghostOpacity, disc);
  };
  for (const paper of [false, true]) {
    const gold = ghostPixel(rgb(tokens.INK.gold), paper);
    const blue = ghostPixel(rgb(tokens.INK.blueBright), paper);
    assert.deepEqual(gold, blue, 'the art\'s colour does not reach the ghost');
    const [r, g, b] = gold;
    assert.ok(b - r >= 30, `the ghost reads blue, not gray (${gold})`);
  }
  const fit = plain(spot.fitArt(44, 799 / 549));
  assert.deepEqual(fit, { width: 44, height: 30 }, 'a ticket fits the prize box by its longer side');
  assert.deepEqual(plain(spot.fitArt(44, 196 / 284)), { width: 30, height: 44 });
});

test('badge: the real count up to 99, then 99+; its words come from the caller', () => {
  const badge = part('Badge.tsx');
  assert.equal(badge.badgeText(0), '');
  assert.equal(badge.badgeText(3), '3');
  assert.equal(badge.badgeText(20), '20');
  assert.equal(badge.badgeText(99), '99');
  assert.equal(badge.badgeText(100), '99+');
  assert.doesNotMatch(source(path.join(dir, 'Badge.tsx')), /new`|'new'/, 'no English spoken copy in the kit');
  assert.match(source(path.join(dir, 'Badge.tsx')), /readonly label: string;/);
  // Parts compose what VoiceOver says: the caller's words, the count, the caller's noun.
  assert.equal(badge.badgeLabel('Daily chest', 2, 'ready'), 'Daily chest, 2 ready');
  assert.equal(badge.badgeLabel('Profile', 0, 'new'), 'Profile');
  assert.equal(badge.badgeLabel('Stamps', 120, 'prizes'), 'Stamps, over 99 prizes');
  assert.equal(badge.badgeLabel('Profile', 3), 'Profile, 3');
  for (const name of ['RoundButton.tsx', 'Footer.tsx', 'ListRow.tsx']) assert.match(source(path.join(dir, name)), /badgeLabel\(/, `${name} leaves the count to the caller's words`);
});

test('list rows: one gold for ready, blue second, white third and not yet, the check for done, one VoiceOver stop', () => {
  const row = part('ListRow.tsx');
  assert.equal(row.rowVariant('ready'), 'primary');
  assert.equal(row.rowVariant('second'), 'second');
  assert.equal(row.rowVariant('third'), 'third');
  assert.equal(row.rowVariant('notyet'), 'third');
  assert.equal(row.rowVariant('done'), null);
  assert.equal(row.rowBodyWidth(300, 86), 300 - 5 - 58 - 10 - 86 - 8);
  const text = source(path.join(dir, 'ListRow.tsx'));
  assert.match(text, /accessibilityActions=/, 'the row is one stop and its action is its button');
  assert.doesNotMatch(text, /to claim|`\$\{badge\} new`/, 'no English copy in the row');
  assert.match(text, /size="row"/, 'the row action is the named row size, no face override');
  assert.doesNotMatch(text, /readonly action\?:/, 'flat action props: an object prop would defeat the row\'s memo');
  assert.match(text, /handler\.current = onAction/, 'the handler lives in a ref');
  assert.match(text, /busy=\{actionBusy\} disabled=\{actionDisabled\}/, 'the action can be busy or off');
  // The art keeps 8 pt from the page's line at every width.
  for (const pad of [tokens.SPACE.pagePad, tokens.SPACE.pageSnug]) {
    const over = layout.rowArtOver(pad, tokens.ROW.artOver);
    assert.ok(pad - over >= tokens.SPACE.artClear, `pad ${pad}: art ${pad - over} pt from the page line`);
  }
  assert.equal(layout.rowArtOver(40, 14), 14, 'the board\'s 14 where there is room');
});

test('currency chips: geometry from the kind, a step width per digit count, tabular digits', () => {
  const chip = part('CurrencyChip.tsx');
  for (const kind of ['coins', 'energy', 'tickets', 'keys', 'parkCoin']) assert.ok(chip.CURRENCY[kind], kind);
  assert.equal(chip.chipWidth(5), tokens.CHIP.minWidth);
  assert.equal(chip.chipWidth(4075), chip.chipWidth(1000), 'same digits, same width: a count that ticks never jitters');
  assert.ok(chip.chipWidth(40750) > chip.chipWidth(4075));
  assert.match(source(path.join(dir, 'CurrencyChip.tsx')), /tabular/);
  assert.doesNotMatch(source(path.join(dir, 'CurrencyChip.tsx')), /readonly artHeight|readonly artOver|readonly minWidth/);
});

test('progress bar: the width lives in a shared value, the prize stands inside the bar\'s box', () => {
  const text = source(path.join(dir, 'ProgressBar.tsx'));
  assert.doesNotMatch(text, /useState/, 'no React state from layout');
  assert.doesNotMatch(text, /setState|onLayout=\{[^}]*set[A-Z]/, 'layout never goes through React state');
  const bar = part('ProgressBar.tsx');
  assert.equal(bar.prizeRoom(40), 30);
  assert.equal(bar.clamp01(2), 1);
});

test('one wave: the sheet foot and the footer share one period, drawn at the real width', () => {
  const wave = part('WaveFoot.tsx');
  const d = wave.wavePath(294, 60);
  assert.match(d, /^M0,9 Q10\.50,3\.80 21\.00,9 Q31\.50,14\.20 42\.00,9 /, 'the board wave: half-waves of 21 pt, controls at 3.8 and 14.2');
  assert.match(d, / L294,64 L0,64 Z$/);
  for (const name of ['WaveFoot.tsx', 'Footer.tsx']) {
    const text = source(path.join(dir, name));
    assert.doesNotMatch(text, /viewBox|preserveAspectRatio="none" style/, `${name} stretches a fixed viewBox`);
  }
  assert.match(source(path.join(dir, 'Footer.tsx')), /waveRun\(0, l, c\)/);
  assert.doesNotMatch(source(path.join(dir, 'tokens.ts')), /period: 48\.75/, 'one period token');
});

test('the layer queue: one at a time, in order; the next shows only after the front has left', () => {
  const q = layers.createLayerQueue();
  const a = q.present({ element: 'A', wayOut: () => {} });
  const b = q.present({ element: 'B' });
  assert.equal(q.front().id, a);
  q.close(b);
  assert.equal(q.count(), 1, 'a waiting layer is simply dropped');
  const c = q.present({ element: 'C' });
  q.drawn(a);
  q.close(a);
  assert.equal(q.front().id, a, 'the front stays while it peels off');
  assert.equal(q.front().leaving, true);
  q.close(a);
  assert.equal(q.front().leaving, true, 'closing twice changes nothing');
  q.done(a);
  assert.equal(q.front().id, c);
  q.update(c, { element: 'C2' });
  assert.equal(q.front().element, 'C2');
  assert.equal(layers.scrimAction({ wayOut: null }), null);
  const out = () => {};
  assert.equal(layers.scrimAction({ wayOut: out }), out);
  assert.equal(layers.scrimAction({ wayOut: out, dismissible: false }), null);
  // A layer no host ever drew is dropped at once on close: nothing to peel, so the queue never blocks.
  const q2 = layers.createLayerQueue();
  const lonely = q2.present({ element: 'X' });
  q2.close(lonely);
  assert.equal(q2.count(), 0);
  const drawn = q2.present({ element: 'Y' });
  q2.drawn(drawn);
  q2.close(drawn);
  assert.equal(q2.front().leaving, true, 'a drawn layer peels off');
});

test('hosts follow navigation focus: push, cover by a legacy screen, pop; the root host is the fallback', () => {
  const hosts = layers.createHostRegistry();
  assert.equal(hosts.active(), null, 'no host: nothing draws');
  const root = hosts.add({ root: true });
  assert.equal(hosts.isActive(root), true, 'only the root: it draws (a legacy screen is on top)');
  const a = hosts.add({ focused: true });
  assert.equal(hosts.isActive(a), true, 'a kit screen with focus beats the root');
  // push kit screen B over A
  hosts.setFocused(a, false);
  const b = hosts.add({ focused: true });
  assert.equal(hosts.isActive(b), true);
  // cover B with a legacy screen: B loses focus, the root host draws, never the covered B or A
  hosts.setFocused(b, false);
  assert.equal(hosts.isActive(root), true, 'covered kit screens never draw');
  // the legacy screen pops: B has focus again
  hosts.setFocused(b, true);
  assert.equal(hosts.isActive(b), true);
  // pop B: A gains focus
  hosts.remove(b);
  hosts.setFocused(a, true);
  assert.equal(hosts.isActive(a), true);
  // a host mounted first but focused last wins (mount order no longer decides)
  const c = hosts.add({ focused: false });
  hosts.setFocused(a, false);
  hosts.setFocused(c, true);
  assert.equal(hosts.isActive(c), true);
  hosts.remove(root); hosts.remove(a); hosts.remove(c);
  assert.equal(hosts.count(), 0);
  const ov = source(path.join(dir, 'Overlay.tsx'));
  assert.match(ov, /nav\.addListener\('focus'/, 'the host listens to navigation focus');
  assert.match(source(path.join(dir, 'Root.tsx')), /useHostSlot\(true\)/, 'StickerRoot is the root fallback host');
});

test('toasts: one host draws and VoiceOver hears each toast once; with no host a toast is dropped, a dialog answers at once', () => {
  const toast = part('Toast.tsx');
  const q = toast.createToastQueue();
  const id = q.show({ title: '+1 Ticket' });
  assert.equal(q.announce(id), true);
  assert.equal(q.announce(id), false, 'a second host (focus moved) does not announce again');
  assert.equal(toast.showToast({ title: 'x' }, { count: () => 0 }), -1, 'no kit host: dropped, never shown late');
  assert.match(source(path.join(dir, 'Toast.tsx')), /if \(!front \|\| !active\) return null;/, 'only the active host draws the toast');
  const dialog = loadTs('src/ui/sticker/Dialog.tsx', STUBS);
  return dialog.showStickerDialog({ title: 'Leave?', buttons: [{ text: 'Stay', style: 'cancel' }, { text: 'Leave' }] }, { count: () => 0 }).then(answer => {
    assert.equal(answer, 0, 'resolved with the dismiss answer (the cancel)');
  });
});

test('outside any kit root a part sits at level 2 on blue, and its gold still counts', () => {
  assert.deepEqual(plain(level.DEFAULT_PLACE), { level: 'page', surface: 'blue', foot: false });
  assert.equal(level.edgeFor('card', level.DEFAULT_PLACE), 0, 'a Card in a legacy box wears no white edge');
  assert.equal(level.edgeFor('button', level.DEFAULT_PLACE, true), 0, 'a gold in a legacy box wears no edge');
  assert.equal(level.edgeFor('page', level.DEFAULT_PLACE), 0);
  // Render the context with no provider: the default place is the one above, and the gold counter has a root scope.
  const ReactStub = { ...STUBS.react, createContext: v => ({ Provider: 'P', _v: v }), useContext: c => c._v };
  const ctx = loadTs('src/ui/sticker/StickerContext.tsx', { ...STUBS, react: ReactStub });
  assert.deepEqual(plain(ctx.useStickerPlace()), plain(level.DEFAULT_PLACE));
  assert.equal(ctx.useRefuseInPage('Header'), false, 'a Header outside any kit root still draws (it is the bar)');
  assert.equal(ctx.useInsidePage(), false);
  const said = [];
  const realWarn = console.warn;
  level.resetWarnings();
  assert.equal(level.primaryKey('Store', 'proof-shop'), 'primary-Store:proof-shop');
  assert.notEqual(level.primaryKey('Store'), level.primaryKey('Settings'), 'each screen is heard, not only the first in a session');
  void said; void realWarn;
  assert.match(source(path.join(dir, 'Screen.tsx')), /warnKey=\{primaryKey\(route\?\.name, testID\)\}/);
  assert.equal(level.tooManyEdgeKinds(['page', 'primary', 'label']), false);
  assert.equal(level.tooManyEdgeKinds(['page', 'primary', 'card']), true, 'cards on the world, a page and the primary: three kinds');
});

test('Screen hides header, body and footer from VoiceOver while a layer is up (the gate is a real gate)', () => {
  const screen = part('Screen.tsx');
  assert.deepEqual(plain(screen.behindLayer(true)), { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', pointerEvents: 'none' });
  assert.equal(screen.behindLayer(false).accessibilityElementsHidden, false);
  const text = source(path.join(dir, 'Screen.tsx'));
  const body = text.slice(text.indexOf('function ScreenImpl'));
  assert.match(body, /accessibilityElementsHidden=\{hide\.accessibilityElementsHidden\} importantForAccessibility=\{hide\.importantForAccessibility\}\s*pointerEvents=\{hide\.pointerEvents\}>\s*\{body\}/, 'the body is hidden under a layer');
  assert.match(body, /<Header \{\.\.\.header\} inert=\{layerUp/);
  assert.match(body, /<Footer \{\.\.\.footer\} inert=\{layerUp/);
  assert.match(body, /\{fx \? <View[^>]*importantForAccessibility="no-hide-descendants"/);
});

test('the layer host is a real modal: no native Modal, a11y modal, escape and back take the way out, modalLayers registered', () => {
  const host = source(path.join(dir, 'Overlay.tsx'));
  assert.match(host, /accessibilityViewIsModal/);
  assert.match(host, /onAccessibilityEscape=\{wayOut\}/);
  assert.match(host, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(host, /modalLayers\.add\(\)/);
  assert.match(host, /modalLayers\.isFront/);
  assert.match(host, /testID=\{front\.testID\}/);
  for (const full of files) assert.doesNotMatch(source(full), /<Modal\b|from 'react-native-modal'/, `${rel(full)} uses a native modal`);
});

test('dialogs speak the app\'s dialog model: one gold, red for danger, the cancel ghost in the foot', () => {
  const dialog = loadTs('src/ui/sticker/Dialog.tsx', STUBS);
  const confirm = dialog.dialogPlan({ title: 'Use 1 Ticket?', buttons: [{ text: 'Not now', style: 'cancel' }, { text: 'PLAY!' }] });
  assert.equal(confirm.title.placement, 'ribbon');
  assert.deepEqual(plain(confirm.bodyActions.map(a => [a.text, dialog.dialogVariant(a.variant)])), [['PLAY!', 'primary']]);
  assert.equal(confirm.footAction.text, 'Not now');
  const danger = dialog.dialogPlan({ title: 'Leave?', buttons: [{ text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive' }] });
  assert.equal(dialog.dialogVariant(danger.bodyActions[0].variant), 'danger');
  const ok = dialog.dialogPlan({ title: 'Saved!' });
  assert.equal(ok.bodyActions.length, 0);
  assert.equal(ok.footAction.text, 'OK', 'a one-button dialog holds its button in the wave foot');
  const long = dialog.dialogPlan({ title: 'Something went wrong while saving your shark' });
  assert.equal(long.title.placement, 'card');
});

test('footer, tabs, switch, toast, state panel, stage: the rules of each part', () => {
  const tabs = source(path.join(dir, 'Tabs.tsx'));
  assert.match(tabs, /minWidth: BUTTON\.minTouch/, 'tabs reach 44 pt wide');
  assert.match(tabs, /translateY: \(picked \? -LIFT : 0\)/, 'the chip lifts by a transform, not layout');
  assert.doesNotMatch(tabs, /marginTop: picked/);
  assert.doesNotMatch(tabs, /INK\.gold\b/, 'the pick is never gold');
  const sw = source(path.join(dir, 'Switch.tsx'));
  assert.match(sw, /accessibilityRole="switch"/);
  assert.match(sw, /accessibilityState=\{\{ checked: value/);
  assert.doesNotMatch(sw, /from 'react-native'[^;]*\bSwitch\b/, 'never the stock switch');
  const toast = part('Toast.tsx');
  const q = toast.createToastQueue();
  const t1 = q.show({ title: 'a' });
  q.show({ title: 'b' });
  assert.equal(q.front().id, t1);
  q.done(t1);
  assert.equal(q.front().title, 'b');
  assert.match(source(path.join(dir, 'Toast.tsx')), /announceForAccessibility/);
  const state = part('StatePanel.tsx');
  assert.equal(state.LOADING_DELAY_MS, 200);
  assert.doesNotMatch(source(path.join(dir, 'StatePanel.tsx')), /ActivityIndicator/, 'never a stock spinner');
  for (const full of files) assert.doesNotMatch(source(full), /ActivityIndicator|<Switch\b[^>]*from 'react-native'/, `${rel(full)} uses a stock control`);
  const stage = source(path.join(dir, 'Stage.tsx'));
  for (const art of ['ART.stageWater', 'ART.rays', 'ART.raysTint']) assert.ok(stage.includes(art), `the stage uses ${art}`);
  assert.match(stage, /if \(reduced\) \{ sway\.value = 0;/, 'the rays stay still under Reduce Motion');
});

test('round buttons say their count, have off and busy, and reach 48 pt', () => {
  const rb = part('RoundButton.tsx');
  assert.equal(rb.ROUND_HIT, 48);
  const text = source(path.join(dir, 'RoundButton.tsx'));
  assert.match(text, /<Badge count=\{badge\} label="" hidden/, 'the badge hides: the button\'s own label says the count');
  assert.match(text, /accessibilityState=\{\{ disabled, busy \}\}/);
  assert.match(text, /OFF\.artOpacity/);
  assert.match(source(path.join(dir, 'GhostButton.tsx')), /accessibilityState=\{\{ disabled, busy \}\}/);
});

// ---------- engineering rules ----------

test('kit engineering rules: no Skia, no measured SVG, no linear easing, springs from ui/motion, transforms for motion', () => {
  for (const full of files) {
    const text = source(full);
    const name = rel(full);
    assert.doesNotMatch(text, /@shopify\/react-native-skia/, `${name} uses Skia`);
    if (/from 'react-native-svg'/.test(text)) {
      assert.doesNotMatch(text, /onLayout/, `${name} mixes an SVG with onLayout`);
      assert.doesNotMatch(text, /createAnimatedComponent/, `${name} animates an SVG`);
    }
    assert.doesNotMatch(text, /Easing\.linear/, `${name} moves on a linear curve`);
    assert.doesNotMatch(text, /—/, `${name} has an em dash`);
    assert.doesNotMatch(text, /fontWeight/, `${name} fakes bold`);
    assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}☀-➿]/u, `${name} has an emoji or dingbat`);
    assert.doesNotMatch(text, /from '@expo\/vector-icons'|react-native-vector-icons/, `${name} uses a vector-font icon`);
    if (/withSpring\(/.test(text)) assert.match(text, /from '\.\.\/motion'|from '\.\.\/\.\.\/motion'/, `${name} springs without ui/motion`);
    for (const m of text.matchAll(/useAnimatedStyle\(\(\) => \(?(?:reduced\s*\?\s*)?\(?\{([^]*?)\}\)?\)/g)) {
      const keys = [...m[1].matchAll(/(\w+):/g)].map(k => k[1]).filter(k => !['translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate'].includes(k));
      for (const k of keys) assert.ok(['opacity', 'transform'].includes(k), `${name} animates ${k}`);
    }
  }
});

test('static cards and pages carry no animated wrapper; only arriving parts mount Arrive', () => {
  for (const name of ['Card.tsx', 'Page.tsx']) {
    const text = source(path.join(dir, name));
    assert.doesNotMatch(text, /useStickOn\(/, `${name} runs the stick-on for a static part`);
    assert.match(text, /if \(arrive\) return <Arrive/, `${name} mounts Arrive only when asked`);
  }
});

test('every pressable has a role, a VoiceOver label and its state', () => {
  for (const full of files) {
    const text = source(full);
    for (const m of text.matchAll(/<Pressable([^>]*)>/g)) {
      if (/accessible=\{false\}/.test(m[1])) continue; // the scrim: the way out is in the foot
      assert.match(m[1], /accessibilityRole="(button|tab|switch)"/, `${rel(full)} pressable without a role`);
      assert.match(m[1], /accessibilityLabel=/, `${rel(full)} pressable without a label`);
      assert.match(m[1], /accessibilityState=/, `${rel(full)} pressable without its state`);
    }
  }
  assert.equal(tokens.BUTTON.minTouch, 44);
});

test('the gallery is a dev-only route, and live screens reach the kit only through the switch', () => {
  const load = (dev, env = {}) => loadTs('src/devRoutes.tsx', {}, { __DEV__: dev, process: { env } });
  assert.ok(load(true).DEV_SCREENS.some(s => s.name === 'StickerGallery'));
  for (const env of [{}, { EXPO_PUBLIC_MOTION_CAPTURE: 'BoxRevealPreview' }, { EXPO_PUBLIC_PERF_CAPTURE: '1' }, { EXPO_PUBLIC_SHARE_WALK: '1' }]) {
    assert.ok(!load(false, env).DEV_SCREENS.some(s => s.name === 'StickerGallery'), JSON.stringify(env));
  }
  const { execFileSync } = require('node:child_process');
  let hits = '';
  try { hits = execFileSync('git', ['grep', '-l', 'ui/sticker', '--', 'src'], { cwd: root, encoding: 'utf8' }).trim(); } catch { hits = ''; }
  const outside = hits.split('\n').filter(Boolean).filter(f => !f.startsWith('src/ui/sticker/') && f !== 'src/devRoutes.tsx');
  // Step 2a: a live file may import the switch (look) and LookScreen, nothing else of the kit.
  for (const file of outside) {
    const specs = [...source(path.join(root, file)).matchAll(/from '([^']*ui\/sticker[^']*)'/g)].map(m => m[1]);
    assert.ok(specs.length > 0, `${file} names the kit outside an import`);
    for (const spec of specs) assert.match(spec, /ui\/sticker\/(LookScreen|look)$/, `${file} imports ${spec}`);
  }
  // LookScreen loads only today's parts and the switch; the kit half is required only when the look is on.
  const lookScreen = source(path.join(dir, 'LookScreen.tsx'));
  const staticKit = [...lookScreen.matchAll(/^import [^;]*from '\.\/([^']+)'/gm)].map(m => m[1]);
  assert.deepEqual(staticKit, ['look'], 'LookScreen imports no kit part at load');
  assert.match(lookScreen, /require\('\.\/LookSticker'\)/);
  assert.equal([...lookScreen.matchAll(/\bsticker\(\)/g)].length >= 4, true);
});

// ---------- the switch (step 2a) ----------

const lookStubs = flags => ({
  react: { useSyncExternalStore: (s, g) => g() },
  '../../api/endpoints/platform/feature-flags': { featureFlagsNow: () => (flags ? { flags } : null), onFeatureFlags: () => () => {} },
});

test('the look switch: off by default, the server alone cannot turn it on, the override is dev JS only', () => {
  const look = (dev, env, flags) => loadTs('src/ui/sticker/look.ts', lookStubs(flags), { __DEV__: dev, process: { env } });
  assert.equal(look(false, {}, null).STICKER_LOOK_DEFAULT, false);
  assert.equal(look(false, {}, null).STICKER_LOOK_FLAG, 'sticker_look');
  // A production build: never dev JS. No override, a server answer of either kind: today's look.
  assert.equal(look(false, {}, null).stickerLookOn(), false);
  assert.equal(look(false, {}, { sticker_look: true }).stickerLookOn(), false);
  assert.equal(look(false, { EXPO_PUBLIC_STICKER_LOOK: '1' }, null).stickerLookOn(), false);
  assert.equal(look(false, { EXPO_PUBLIC_STICKER_LOOK: '1', EXPO_PUBLIC_STUDIO_MUTE: '1' }, null).stickerLookOn(), false);
  // Dev JS: off unless the lane asks for it.
  assert.equal(look(true, {}, { sticker_look: true }).stickerLookOn(), false);
  assert.equal(look(true, { EXPO_PUBLIC_STICKER_LOOK: '1' }, null).stickerLookOn(), true);
  assert.equal(look(true, { EXPO_PUBLIC_STICKER_LOOK: '0' }, null).stickerLookOn(), false);
  // The flip (step 6) needs both keys.
  const { stickerLookFrom } = look(false, {}, null);
  assert.equal(stickerLookFrom({ override: false, fallback: true, server: true }), true);
  assert.equal(stickerLookFrom({ override: false, fallback: true, server: undefined }), false);
  assert.equal(stickerLookFrom({ override: false, fallback: false, server: true }), false);
});

test('LookScreen with the switch off: today\'s numbers, today\'s bar and footer, the kit never loaded', () => {
  const { lookPad } = loadTs('src/ui/sticker/LookScreen.tsx', {
    react: { createContext: v => ({ Provider: 'P', _v: v }), useContext: () => null },
    'react-native': anything('rn'), 'expo-image': anything('img'), 'react-native-safe-area-context': anything('safe'),
    '../../components/Button': anything('button'), '../../components/Topbar': anything('topbar'),
    '../../components/Topbar/TopbarColumn': anything('col'), '../../components/Topbar/TopbarText': anything('text'),
    '../../components/Wrapper': anything('wrapper'), './look': { useStickerLook: () => false },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'F' },
  });
  let asked = 0;
  const kit = () => { asked += 1; return { top: 12, bottom: 140 }; };
  assert.deepEqual(plain(lookPad(false, { top: -8, bottom: 120 }, kit)), { top: -8, bottom: 120, sticker: false });
  assert.deepEqual(plain(lookPad(false, undefined, kit)), { top: 0, bottom: 0, sticker: false });
  assert.equal(asked, 0, 'the kit is never asked with the switch off');
  assert.deepEqual(plain(lookPad(true, { top: -8, bottom: 120 }, kit)), { top: 12, bottom: 140, sticker: true });
  const text = source(path.join(dir, 'LookScreen.tsx'));
  // Off: today's Wrapper around today's Topbar and the body, and today's back arrow.
  assert.match(text, /\{footer \? <Wrapper previewMode=\{nav\.previewMode\} onNavigate=\{nav\.onNavigate\}>\{inner\}<\/Wrapper> : inner\}/);
  assert.match(text, /if \(!on\) return <BackButton onPress=/);
  assert.match(text, /if \(!on\) return <TodayBar header=\{header\} \/>;/);
});

/**
 * Files whose chrome moved onto LookScreen (step 2a). They draw no Topbar, Wrapper or back arrow of
 * their own: the bar, the footer and the body's top and bottom room come from LookScreen.
 */
const MIGRATED = [
  'src/screens/ProfileScreen.tsx',
  'src/screens/CoinShelfScreen.tsx',
  'src/screens/ParkScreen.tsx',
  'src/screens/StoreScreen.tsx',
];
test('migrated screens take their bar, footer and body room from LookScreen', () => {
  for (const file of MIGRATED) {
    const text = source(path.join(root, file));
    assert.doesNotMatch(text, /from '[./]*components\/Topbar(\/TopbarColumn|\/TopbarText)?'/, `${file} imports today's bar`);
    assert.doesNotMatch(text, /import Wrapper\b/, `${file} imports today's footer`);
    assert.doesNotMatch(text, /<(Topbar|Wrapper|BackButton)\b/, `${file} draws chrome by hand`);
    assert.match(text, /<LookScreen\b/, `${file} sits on LookScreen`);
    assert.doesNotMatch(text, /FOOTER_CLEARANCE/, `${file} keeps its own footer room`);
  }
});

/** Files whose body was repainted onto the kit (step 3 on): no colour outside the kit tokens. Empty in step 2a. */
const PAINTED = [];
test('repainted screens hold no colour outside the kit tokens', () => {
  for (const file of PAINTED) {
    const text = source(path.join(root, file));
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/, `${file} holds a colour`);
    assert.doesNotMatch(text, /\bINK\.|\bSHADE\./, `${file} builds a box in kit colours`);
  }
});

// ---------- proof data ----------
const proof = loadTs('src/ui/sticker/proof/proofData.ts');

test('gate keys and answer spots', () => {
  assert.equal(proof.gatePress('29', '7', 3), '297');
  assert.equal(proof.gatePress('297', '1', 3), '297');
  assert.equal(proof.gatePress('297', 'del', 3), '29');
  assert.deepEqual(plain(proof.gateSpots('29', 3).map(s => s.state)), ['yours', 'yours', 'next']);
});

test('week row as kit.png: yours in Alex\'s coin, one gold ring, dashed empties', () => {
  assert.deepEqual(plain(proof.weekSpots(3)), ['yours', 'yours', 'next', 'empty', 'empty', 'empty', 'empty']);
  assert.equal(proof.winsLeft(16, 26), 10);
});

test('shelf states: one next up, coins not out yet are empty, found are yours', () => {
  assert.deepEqual(proof.shelfStates([true, false, false, true, false], [false, false, true, false, false]), ['yours', 'next', 'empty', 'yours', 'ghost']);
  assert.equal(proof.sampleFound(35, 15).filter(Boolean).length, 15);
});

test('the shelf grid never renders React while scrolling: memoised cells, no onScroll', () => {
  const text = source(path.join(dir, 'proof', 'ProofShelf.tsx'));
  assert.match(text, /const CoinCell = memo\(/);
  assert.match(text, /const ShelfRow = memo\(/);
  assert.doesNotMatch(text, /onScroll|useAnimatedScrollHandler/);
});

// ---------- the three proofs of builder 2: map, win, shop ----------

test('the map keeps the toast lane clear: the first piece starts under the toast and its drop', () => {
  assert.ok(layout.toastLane() >= tokens.TOAST.height + tokens.DROP.cardOnWorld, 'a toast would cover the guide card');
  const map = source(path.join(dir, 'proof', 'ProofMap.tsx'));
  assert.match(map, /marginTop: toastLane\(\)/, 'the guide card row starts below the toast lane');
  assert.match(map, /require\('\.\/img\/map-park\.jpg'\)/, 'the map is the real capture');
  assert.doesNotMatch(map, /GALLERY\./, 'no drawn stand-in map');
});

test('pieces on a page\'s top edge are reserved: half their height rises, the page takes the most', () => {
  assert.equal(layout.edgeRise(27), 13.5);
  const plainRise = layout.pageRise({ edge: 4 }, 370, 402);
  assert.equal(plainRise, 4);
  assert.equal(layout.pageRise({ edge: 3, onEdge: [27] }, 370, 402), 14);
  assert.equal(layout.pageRise({ edge: 4, onEdge: [40, 27] }, 370, 402), 20);
  // A gold label still wins when it rises more than the pieces beside it.
  assert.equal(layout.pageRise({ edge: 4, label: { large: true }, onEdge: [27] }, 370, 402), 22);
  assert.equal(layout.sideArtRoom({ width: 58, over: 16 }), 50);
  assert.ok(layout.cardLabelRise(3) >= 17 + tokens.EDGE.label);
});

test('the win sequence runs in order and each count ends on its prize', () => {
  const B = proof.WIN_BEATS;
  assert.ok(B.land < B.sticker && B.sticker < B.walk && B.walk < B.prizes, 'card, coin, NEW!, dot, prizes');
  const lastPrize = B.prizes + 4 * B.prizeGap + B.countLead + 4 * B.countStep;
  assert.ok(B.fly > lastPrize, 'prizes fly only after the last one has counted');
  for (const v of [1, 10, 25, 1500]) {
    const steps = plain(proof.countSteps(v));
    assert.equal(steps[steps.length - 1], v);
    assert.ok(steps.length <= 4);
    assert.deepEqual([...steps].sort((a, b) => a - b), steps, 'counts only go up');
  }
  assert.deepEqual(plain(proof.countSteps(1)), [1]);
});

test('a prize flies on an eased arc, never linear, and skips flying under Reduce Motion', () => {
  const flight = part('Flight.tsx');
  assert.equal(flight.flightArc(0, 30), 30);
  assert.equal(flight.flightArc(300, -400), 90);
  const text = source(path.join(dir, 'Flight.tsx'));
  assert.match(text, /Easing\.inOut/);
  const win = source(path.join(dir, 'proof', 'ProofWin.tsx'));
  assert.match(win, /if \(reduced\) \{[^]*?land\(p\.chip\)/, 'under Reduce Motion the chips just take their counts');
  assert.match(win, /fx=\{/, 'flights ride the Screen fx layer, above the bars');
});

test('Screen\'s fx layer is above every bar and never takes a touch', () => {
  const text = source(path.join(dir, 'Screen.tsx'));
  assert.match(text, /\{fx \? <View style=\{StyleSheet\.absoluteFill\} pointerEvents="none"/);
});

// ---------- after the second critique ----------

test('defaults never hide words: sentences, headings and caps wrap as far as they need; titles and names wrap to two', () => {
  assert.deepEqual(plain(roles.ROLE_LINES), { title: 2, heading: 0, name: 2, count: 1, body: 0, caps: 0 });
  const text = source(path.join(dir, 'Text.tsx'));
  assert.match(text, /lines = ROLE_LINES\.body/);
  assert.match(text, /lines = ROLE_LINES\.heading/);
  assert.match(text, /lines = ROLE_LINES\.title/);
  const dialog = source(path.join(dir, 'Dialog.tsx'));
  assert.doesNotMatch(dialog, /lines=\{\d\}/, 'no dialog message or heading is capped');
  for (const name of ['GhostButton.tsx']) assert.match(source(path.join(dir, name)), /role="none" fit>/, `${name} fits its label`);
  const sb = part('StickerButton.tsx');
  assert.equal(sb.BUTTON_DEFAULTS.fit(180), true, 'a fixed width: the label fits');
  assert.equal(sb.BUTTON_DEFAULTS.fit(undefined), false);
});

test('art on a card\'s top edge is reserved: the card takes its rise as its own top margin', () => {
  assert.equal(layout.cardTopRise({ edge: 3 }), 0, 'nothing rises: the caller\'s margins stand');
  assert.equal(layout.cardTopRise({ topArt: 14, edge: 0 }), 14);
  assert.equal(layout.cardTopRise({ topRow: tokens.ART_SIZE.prize, edge: 0 }), tokens.ART_SIZE.prize / 2, 'a row standing on the edge: half rises');
  assert.equal(layout.cardTopRise({ topArt: 2, edge: 3 }), 3, 'never less than the white edge when anything rises');
  assert.equal(layout.cardTopRise({ label: true, edge: 0 }), layout.cardLabelRise(0));
  const card = source(path.join(dir, 'Card.tsx'));
  assert.match(card, /const rise = cardTopRise\(/);
  const win = source(path.join(dir, 'proof', 'ProofWin.tsx'));
  assert.doesNotMatch(win, /position: 'absolute', top: -/, 'the win card places no art above a card by hand');
  assert.match(win, /topRow=\{\{ size: 'prize'/);
});

test('the won coin never gives up size: at least 110 on the SE and 135 on the 17 Pro, breaking the window, never leaving its box', () => {
  const stage = part('Stage.tsx');
  assert.ok(stage.winHeroSize(667) >= 110, 'SE');
  assert.ok(stage.winHeroSize(874) >= 135, '17 Pro');
  assert.ok(stage.winHeroSize(956) <= 150);
  for (const [box, min] of [[130, 110], [stage.stageMinBox(110), 110], [150, 144], [400, 144]]) {
    const l = plain(stage.stageLayout(box, min));
    assert.ok(l.hero >= min, `${box}: hero ${l.hero} under ${min}`);
    assert.ok(l.heroTop >= 0 && l.heroTop + l.hero <= box, `${box}: the hero leaves the stage's own box`);
    assert.ok(l.windowTop + l.windowHeight === box);
    if (l.hero > l.windowHeight) assert.ok(l.heroTop < l.windowTop, 'the hero breaks the window\'s top edge');
  }
  assert.deepEqual(plain(stage.stageLayout(400, 144)), { hero: 344, heroTop: 28, windowTop: 0, windowHeight: 400 }, 'room to spare: the window is the whole box');
  const win = source(path.join(dir, 'proof', 'ProofWin.tsx'));
  assert.doesNotMatch(win, /STAGE_ROOM|STAGE_MIN|height \* 0\.5 -/, 'no stage size measured by hand');
  assert.match(win, /hero=\{\{ min: winHeroSize\(height\)/);
  assert.match(source(path.join(dir, 'Stage.tsx')), /withSpring\(1, SPRING\.stamp\)/, 'the landing squash springs back');
});

test('hanging art keeps 8 pt from the screen edge: Page clamps side art', () => {
  assert.equal(layout.sideArtOver(undefined), tokens.SPACE.artClear);
  assert.equal(layout.sideArtOver(16), tokens.SPACE.margin - tokens.SPACE.artClear, 'asked for 16, clamped');
  for (const asked of [0, 4, 8, 16, 30]) {
    const left = tokens.SPACE.margin - layout.sideArtOver(asked);
    assert.ok(left >= tokens.SPACE.artClear, `asked ${asked}: the art's left is ${left} pt from the screen`);
  }
  assert.match(source(path.join(dir, 'Page.tsx')), /sideArtOver\(sideArt\.over\)/);
});

test('the Shop wallet is one row at every phone width', () => {
  const chip = part('CurrencyChip.tsx');
  const row = chip.chipWidth(12) + chip.chipWidth(3825) + chip.chipWidth(935) + 2 * tokens.GAP.base;
  for (const width of [320, 375, 402, 440]) assert.ok(row <= layout.screenFrameWidth(width), `${width}: the wallet (${row}) wraps`);
  const shop = source(path.join(dir, 'proof', 'ProofShop.tsx'));
  assert.doesNotMatch(shop, /flexWrap|columnGap/, 'no wrapping wallet');
  assert.match(shop, /size="small" width=\{64\}/, 'the welcome card\'s OK is small');
});

test('the map credit ends clear of the footer\'s wave, and Alex\'s discs keep today\'s size', () => {
  const map = loadTs('src/ui/sticker/proof/ProofMap.tsx', { ...STUBS, './proofCoins': { useParkCoinArt: () => ({}) } });
  for (const [w, h] of [[375, 667], [402, 874], [440, 956]]) {
    const at = layout.mapAttributionBottom(w);
    assert.ok(at >= layout.footerBand(w) + tokens.WAVE.amplitude / 2 + tokens.SPACE.base, 'the credit line clears the wave crest');
    const plate = plain(map.platePlacement(w, h, at));
    const creditY = plate.top + (2010 / 2200) * plate.height;
    assert.ok(creditY <= h - at + 0.01, `${w}x${h}: the credit ends ${h - creditY} pt above the bottom, under ${at}`);
    assert.ok(plate.top + plate.height >= h - layout.footerBand(w), 'the map still runs under the whole band');
  }
  const text = source(path.join(dir, 'proof', 'ProofMap.tsx'));
  const disc = /const DISC = \{ follow: (\d+), chest: (\d+), help: (\d+), watch: (\d+), shelf: (\d+) \}/.exec(text).slice(1).map(Number);
  const [follow, , , watch, shelf] = disc;
  assert.ok(follow >= 56 && watch >= 72 && shelf >= 68, 'today\'s sizes: follow 56, wait times 72, Shelf 68 (atlas 018)');
  assert.match(text, /kind="follow"/, 'the follow disc carries its locate pointer');
  assert.match(text, /expand=\{\{/, 'the guide card has its chevron disc');
});

test('buttons: one height rule, the kit\'s defaults, the off look says why', () => {
  const button = source(path.join(dir, 'StickerButton.tsx'));
  assert.match(button, /const height = buttonHeight\(size, onMap\);/, 'StickerButton draws the tested height');
  assert.match(button, /const line = buttonLine\(onMap\);/);
  const sb = part('StickerButton.tsx');
  assert.equal(sb.BUTTON_DEFAULTS.variant, 'second', 'gold is only ever chosen on purpose (one gold per screen)');
  assert.equal(sb.BUTTON_DEFAULTS.fullWidth(undefined), true, 'stretches like GameButton (fullWidth = true)');
  assert.equal(sb.BUTTON_DEFAULTS.fullWidth(164), false, 'a given width wins');
  assert.equal(sb.OFF_LIP, 2);
  assert.ok(sb.glintFor('key', 42).size < sb.glintFor('medium', 44).size, 'a smaller glint under 44 pt');
  assert.ok(sb.glintFor('key', 42).left >= 10);
  assert.match(button, /readonly reason\?: string;/);
  assert.doesNotMatch(button, /Math\.max\(p\.value, held\)/, 'buttons do not pay for the gallery\'s pressed sample');
  assert.match(button, /\{e > 0 \? <EdgeLayers/, 'edge layers mount only on the edged primary');
  const icons = loadTs('src/ui/sticker/icons.ts', STUBS);
  assert.equal(icons.iconArt('ticket'), 'ticket.png', 'an icon name draws Alex\'s file');
  assert.equal(icons.iconArt('timer'), undefined, 'a generated icon draws nothing in the kit');
  const game = source(path.join(root, 'src/ui/GameButton.tsx'));
  assert.match(game, /fullWidth = true/, 'GameButton still stretches by default (the kit matches)');
});

test('parts take a layout style only: a screen cannot paint a box onto a kit part', () => {
  const style = source(path.join(dir, 'style.ts')).slice(source(path.join(dir, 'style.ts')).indexOf('Pick<ViewStyle'));
  for (const banned of ['backgroundColor', 'borderWidth', 'borderColor', 'borderRadius', 'padding', "'height'"]) assert.ok(!style.includes(banned), `LayoutStyle allows ${banned}`);
  for (const name of ['Page.tsx', 'Card.tsx', 'StickerButton.tsx', 'Tag.tsx', 'Badge.tsx', 'Tabs.tsx', 'ProgressBar.tsx', 'CurrencyChip.tsx', 'ListRow.tsx', 'Switch.tsx', 'RoundButton.tsx', 'GhostButton.tsx', 'Spot.tsx', 'Stage.tsx', 'StatePanel.tsx', 'Arrange.tsx']) {
    const text = source(path.join(dir, name));
    assert.doesNotMatch(text, /readonly style\?: StyleProp<ViewStyle>/, `${name} takes a free ViewStyle`);
  }
  const arrange = loadTs('src/ui/sticker/Arrange.tsx', STUBS);
  assert.ok(arrange.Row && arrange.Stack, 'Row and Stack exist');
  for (const gap of Object.values(tokens.GAP)) assert.equal(gap % 2, 0, 'gaps are on the 2 and 4 pt steps');
});

test('proofs carry no hand gaps: named gaps and SPACE only', () => {
  for (const name of ['ProofGate.tsx', 'ProofRewards.tsx', 'ProofShelf.tsx', 'ProofWin.tsx', 'ProofMap.tsx', 'ProofShop.tsx']) {
    const text = source(path.join(dir, 'proof', name));
    assert.doesNotMatch(text, /\bgap: \d|paddingVertical: \d|paddingBottom: \d|marginRight: \d|marginTop: \d|top: \d{2}\b/, `${name} has a hand number`);
    assert.doesNotMatch(text, /LINE\.page \* 2|SPACE\.pagePad \* 2/, `${name} re-derives a page's inner width`);
  }
});

test('the win card arrives whole over the map it was won on: no blank world, no empty box', () => {
  const win = source(path.join(dir, 'proof', 'ProofWin.tsx'));
  assert.match(win, /if \(!ready\) return <Screen testID="proof-win-wait" ground="map" mapLayer=\{mapBehind\}/, 'while the art loads, the map stays as it was');
  assert.match(win, /ground="map" mapLayer=\{mapBehind\} dim/, 'the card sits over the dimmed map');
  assert.match(win, /<Spot state="empty" stickAt=/, 'each prize is stuck into its own empty spot');
  assert.match(source(path.join(dir, 'Stage.tsx')), /<Spot state="next"/, 'a next spot waits where the coin lands');
  assert.match(source(path.join(dir, 'proof', 'ProofRewards.tsx')), /ground="map" mapLayer=\{mapLayer\}/, 'Rewards opens over the map');
  assert.match(source(path.join(dir, 'proof', 'ProofShelf.tsx')), /footer=\{\{ items: FOOTER_ITEMS/, 'the shelf proof has the footer');
});

test('empty, error and loading: Alex\'s shark big, SharkLoader\'s props by name, never a page in a page', () => {
  const state = part('StatePanel.tsx');
  assert.ok(state.stateSharkHeight('empty', false) >= 120);
  assert.ok(state.stateSharkHeight('error', false) >= 120);
  const shark = source(path.join(root, 'src/ui/SharkLoader.tsx'));
  const names = [...shark.slice(shark.indexOf('export type SharkLoaderProps'), shark.indexOf('};', shark.indexOf('export type SharkLoaderProps'))).matchAll(/readonly (\w+)\??:/g)].map(m => m[1]);
  const kit = source(path.join(dir, 'StatePanel.tsx'));
  const props = kit.slice(kit.indexOf('export type StatePanelProps'), kit.indexOf('\n};', kit.indexOf('export type StatePanelProps')));
  for (const name of names) assert.match(props, new RegExp(`readonly ${name}\\??:`), `StatePanelProps misses SharkLoader's ${name}`);
  assert.match(source(path.join(dir, 'Page.tsx')), /if \(useInsidePage\(\)\) \{/, 'a Page inside a page draws as a Card');
});

test('a flight keeps its handler in a ref and lands at once under Reduce Motion', () => {
  const text = source(path.join(dir, 'Flight.tsx'));
  assert.match(text, /landRef\.current = onLand/);
  assert.doesNotMatch(text, /\[delay, onLand, t\]/, 'a fresh onLand never restarts a flight');
  assert.match(text, /if \(reduced\) \{/);
  const bar = source(path.join(dir, 'ProgressBar.tsx'));
  assert.match(bar, /opacity: groove\.value > 0 \?/, 'the fill hides until the groove is laid out');
});
