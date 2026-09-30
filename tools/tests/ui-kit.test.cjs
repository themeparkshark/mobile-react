'use strict';
/** WS0 UI kit: tokens, presets, icons, icon tokens, dialog model, button, loader. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const tokens = loadTs('src/ui/tokens.ts');
const presets = loadTs('src/ui/TextPresets.ts');
const names = loadTs('src/ui/iconNames.ts');
const iconTokens = loadTs('src/ui/iconTokens.ts');

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return { h: 0, s: 0, l: (max + min) / 2 };
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1)), l: (max + min) / 2 };
}

test('brand tokens: navy scrim instead of black, and no purple or near-black surfaces', () => {
  assert.match(tokens.BRAND.scrim, /^rgba\(4,40,90,0\.55\)$/);
  assert.equal(tokens.BRAND.cream, '#fff8e4');
  assert.equal(tokens.BRAND.navy, '#05346e');
  assert.equal(tokens.BRAND.gold, '#ffcf3b');
  assert.equal(tokens.BRAND.goldLip.toLowerCase(), '#d99a00');
  // GameButton geometry comes from YellowButton (his art), not a new button design.
  assert.equal(tokens.BUTTON.aspectRatio, 3.8);
  assert.equal(tokens.BUTTON.labelAspectRatio, 4.4);
  assert.equal(tokens.BUTTON.pressScale, 0.97);
  assert.equal(tokens.BUTTON.maxWidth, 320);
  for (const [name, value] of Object.entries(tokens.BRAND)) {
    if (!value.startsWith('#')) continue;
    const { h, s, l } = hue(value);
    assert.ok(!(h > 255 && h < 330 && s > 0.25), `${name} ${value} is purple`);
    assert.ok(l > 0.2, `${name} ${value} is too dark for a surface or ink`);
  }
});

test('text presets never fake bold, use the brand faces, and outline display text on blue', () => {
  for (const name of presets.TEXT_PRESET_NAMES) {
    for (const tone of ['onLight', 'onBlue', 'onGold']) {
      const style = presets.textPreset(name, tone);
      assert.equal(style.fontWeight, undefined, `${name} sets fontWeight`);
      assert.ok(['Shark', 'Knockout'].includes(style.fontFamily));
      assert.equal(style, presets.textPreset(name, tone), 'styles are cached');
    }
  }
  assert.equal(presets.textPreset('display').fontFamily, 'Shark');
  assert.equal(presets.textPreset('body').fontFamily, 'Knockout');
  assert.equal(presets.textPreset('title', 'onBlue').textShadowColor, tokens.BRAND.navy);
  assert.equal(presets.textPreset('body', 'onBlue').textShadowColor, undefined);
  assert.equal(presets.textPreset('body').color, tokens.BRAND.navy);
});

const ICON_DIR = path.join(root, 'assets/images/icons');
/** Width, height and PNG colour type from the IHDR chunk, plus whether a tRNS chunk exists. */
function pngInfo(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} is a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25], trns: buf.includes(Buffer.from('tRNS')) };
}
function iconSources() {
  const source = fs.readFileSync(path.join(root, 'src/ui/GameIcon.tsx'), 'utf8');
  return Object.fromEntries([...source.matchAll(/\s(\w+): require\('([^']+)'\)/g)]
    .map(([, name, rel]) => [name, path.resolve(root, 'src/ui', rel)]));
}

test('icon set covers the plan list, and every icon is a PNG that exists', () => {
  const required = ['energy', 'ticket', 'rush', 'wrench', 'pin', 'gift', 'crown', 'medal1', 'medal2', 'medal3',
    'timer', 'streak', 'dice', 'bell', 'check', 'close', 'pause', 'star', 'sparkle', 'heart', 'map', 'swords', 'shark',
    'fin', 'ride', 'camera', 'play', 'retry', 'arrow', 'lock', 'info', 'trophy', 'chest', 'settings', 'xp', 'edit', 'coin', 'coins'];
  for (const name of required) assert.ok(names.isGameIconName(name), `missing icon ${name}`);
  assert.equal(new Set(names.GAME_ICON_NAMES).size, names.GAME_ICON_NAMES.length, 'icon names are unique');
  const sources = iconSources();
  assert.deepEqual(Object.keys(sources).sort(), [...names.GAME_ICON_NAMES].sort(), 'every name has exactly one source');
  for (const [name, file] of Object.entries(sources)) {
    assert.ok(file.endsWith('.png') && fs.existsSync(file), `${name}: ${file} exists`);
    const info = pngInfo(file);
    assert.ok(info.colorType === 6 || (info.colorType === 3 && info.trns), `${name} has a transparent background`);
  }
  for (const [alias, target] of Object.entries(names.ICON_ALIASES)) {
    assert.equal(names.resolveIconName(alias), target);
    assert.ok(names.isGameIconName(target), `alias ${alias} points at a real icon`);
  }
  assert.equal(names.resolveIconName('nope'), undefined);
});

test('icons are hand-drawn art: no vector shapes, no icon fonts, no drawn-over originals', () => {
  assert.ok(!fs.existsSync(path.join(root, 'src/ui/gameIconArt.ts')), 'the rejected vector icon set is gone');
  for (const file of fs.readdirSync(path.join(root, 'src/ui'))) {
    if (!/\.tsx?$/.test(file)) continue;
    const source = fs.readFileSync(path.join(root, 'src/ui', file), 'utf8');
    assert.ok(!/from 'react-native-svg'|@shopify\/react-native-skia|@expo\/vector-icons|react-native-vector-icons/.test(source),
      `src/ui/${file} draws icons with vectors or an icon font`);
  }
  const sources = iconSources();
  // New art (GPT Image 2.5 from Alex's references) lives in assets/images/icons, trimmed, long side 384.
  for (const name of names.GENERATED_ICON_NAMES) {
    assert.equal(path.dirname(sources[name]), ICON_DIR, `${name} is in assets/images/icons`);
    const { width, height } = pngInfo(sources[name]);
    assert.equal(Math.max(width, height), 384, `${name} is ~384px on the long side`);
  }
  // The Feb-2026 repo art is used only for the currencies it already represents.
  const feb2026 = ['energy.png', 'ticket-icon.png', 'sword-icon.png', 'ride-parts.png', 'coingold.png', 'shield.png'];
  const febUsers = Object.entries(sources).filter(([, file]) => feb2026.includes(path.basename(file))).map(([name]) => name).sort();
  assert.deepEqual(febUsers, ['energy', 'parts', 'swords', 'ticket']);
  // Alex's originals copied into assets/images/icons keep their names; nothing else hides in there.
  const inDir = fs.readdirSync(ICON_DIR).filter(file => file.endsWith('.png')).map(file => file.replace(/\.png$/, ''));
  const used = new Set(Object.values(sources).filter(file => path.dirname(file) === ICON_DIR).map(file => path.basename(file, '.png')));
  for (const file of inDir) assert.ok(used.has(file), `assets/images/icons/${file}.png is unused`);
});

test('icon tokens split copy, and legacy emoji become icons or disappear cleanly', () => {
  assert.deepEqual(plain(iconTokens.parseIconTokens('Spend [icon:ticket] 1 Ticket')), [
    { kind: 'text', text: 'Spend ' }, { kind: 'icon', name: 'ticket' }, { kind: 'text', text: ' 1 Ticket' }]);
  assert.deepEqual(plain(iconTokens.parseIconTokens('[icon:nope] stays text')), [{ kind: 'text', text: '[icon:nope] stays text' }]);
  assert.equal(iconTokens.tokenizeLegacyEmoji('⚡ +20 Energy'), '[icon:rush] +20 Energy');
  assert.equal(iconTokens.tokenizeLegacyEmoji('Streak \u{1F525}️ 3 days'), 'Streak [icon:streak] 3 days');
  assert.equal(iconTokens.tokenizeLegacyEmoji('Nice \u{1F92F} !'), 'Nice!');
  assert.equal(iconTokens.tokenizeLegacyEmoji('\u{1F468}‍\u{1F469}‍\u{1F467} Family day'), 'Family day');
  assert.equal(iconTokens.tokenizeLegacyEmoji('Go \u{1F1FA}\u{1F1F8} team'), 'Go team');
  assert.equal(iconTokens.tokenizeLegacyEmoji('TPS™ © 2026'), 'TPS™ © 2026');
  assert.equal(iconTokens.stripIconTokens('\u{1F3C6} Winner [icon:crown] today'), 'Winner today');
  assert.deepEqual(plain(iconTokens.parseIconTokens('\u{1F947} first', { legacyEmoji: true }).map(p => p.kind)), ['icon', 'text']);
});

const dialogModel = loadTs('src/ui/gameDialogModel.ts');

test('dialog buttons: main action on top in gold, destructive in red, cancel last and quiet', () => {
  const laid = dialogModel.layoutActions([
    { text: 'Keep playing', style: 'cancel' },
    { text: 'I left the line' },
    { text: 'I reached boarding' },
  ]);
  assert.deepEqual(plain(laid.map(a => [a.text, a.variant, a.index])), [
    ['I reached boarding', 'primary', 2], ['I left the line', 'secondary', 1], ['Keep playing', 'ghost', 0]]);
  assert.deepEqual(plain(dialogModel.layoutActions(undefined).map(a => [a.text, a.variant])), [['OK', 'primary']]);
  assert.deepEqual(plain(dialogModel.layoutActions([{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive' }])
    .map(a => a.variant)), ['danger', 'ghost']);
  assert.deepEqual(plain(dialogModel.layoutActions([{ text: 'Close', style: 'cancel' }]).map(a => a.variant)), ['primary']);
  assert.equal(dialogModel.dismissAction({ title: 'x', buttons: [{ text: 'A' }, { text: 'B', style: 'cancel' }] }), 1);
  assert.equal(dialogModel.dismissAction({ title: 'x' }), 0);
  assert.equal(dialogModel.dismissAction({ title: 'x', buttons: [{ text: 'A' }, { text: 'B' }] }), null);
  assert.equal(dialogModel.dismissAction({ title: 'x', dismissible: false }), null);
});

test('dialog store: falls back to the native alert with no host, queues one at a time with a host', async () => {
  const native = [];
  const store = dialogModel.createDialogStore((title, message, buttons) => native.push({ title, message, buttons }));
  let pressed = 0;
  const fallback = store.show({ title: 'No host', buttons: [{ text: 'Go', onPress: () => { pressed += 1; } }] });
  assert.equal(native.length, 1);
  native[0].buttons[0].onPress();
  assert.equal(await fallback, 0);
  assert.equal(pressed, 1);

  const seen = [];
  const detach = store.attach(request => seen.push(request && request.title));
  const first = store.show({ title: 'First', buttons: [{ text: 'A', onPress: () => { pressed += 10; } }] });
  const second = store.show({ title: 'Second' });
  assert.deepEqual(seen, [null, 'First']);
  assert.equal(store.pending(), 2);
  store.answer(999, 0);
  assert.equal(store.pending(), 2, 'a stale answer is ignored');
  const currentId = 1;
  store.answer(currentId, 0);
  assert.equal(await first, 0);
  assert.equal(pressed, 11);
  assert.deepEqual(seen, [null, 'First', 'Second']);
  store.answer(2, null);
  assert.equal(await second, null);
  assert.deepEqual(seen, [null, 'First', 'Second', null]);
  detach();
  assert.equal(store.hostCount(), 0);
  void store.show({ title: 'After detach' });
  assert.equal(native.length, 2, 'detached hosts fall back to native again');
});

const artText = loadTs('src/ui/artButtonText.ts');

function buttonView(props, reduced = false) {
  const hapticCalls = [];
  const view = runtime('src/ui/GameButton.tsx', {
    '../hooks/useReducedGameMotion': { default: () => reduced },
    '../gamekit/Haptics': { haptic: intent => hapticCalls.push(intent) },
    './GameIcon': { default: 'GameIcon' },
    './artButtonText': artText,
    './tokens': tokens,
  }, props);
  return { view, hapticCalls, pressable: () => view.tree };
}
const face = view => view.find(n => n.props && n.props.source && n.props.resizeMode === 'contain');
const labelArea = view => view.find(n => n.props && typeof n.props.onLayout === 'function');
const label = view => view.find(n => n.type === 'Text');

test('GameButton: press gives a light haptic and fires once; disabled and loading ignore presses', () => {
  let presses = 0;
  const { view, hapticCalls, pressable } = buttonView({ label: 'Play ride', onPress: () => { presses += 1; } });
  assert.equal(pressable().type, 'Pressable');
  assert.equal(pressable().props.accessibilityLabel, 'Play ride');
  pressable().props.onPressIn(); pressable().props.onPress(); pressable().props.onPressOut();
  assert.equal(presses, 1);
  assert.deepEqual(hapticCalls, ['tapLight']);
  assert.ok(view.motions.includes('timing'), 'press scale animates');
  assert.ok(view.find(n => n.type === 'Text' && n.props.children === 'Play ride'));

  view.change({ disabled: true });
  pressable().props.onPress();
  assert.equal(presses, 1);
  assert.equal(pressable().props.accessibilityState.disabled, true);
  view.change({ disabled: false, loading: true });
  pressable().props.onPress();
  assert.equal(presses, 1);
  assert.equal(pressable().props.accessibilityState.busy, true);
  assert.equal(buttonView({ label: 'x', haptics: false }).hapticCalls.length, 0);
});

test("GameButton: Dustin's own button art and YellowButton's label, sized from the button height", () => {
  const { view, pressable } = buttonView({ label: 'Go', onPress: () => undefined }, true);
  assert.equal(face(view).props.source, '../../assets/images/yellow_button.png', 'primary is his yellow_button.png');
  assert.equal(face(view).props.style.aspectRatio, 3.8);
  const style = label(view).props.style;
  for (const [key, value] of Object.entries({ fontFamily: 'Shark', color: 'white', textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, .5)', textShadowRadius: 0 })) assert.equal(style[key], value, `label ${key}`);
  assert.equal(labelArea(view).props.style.opacity, 0, 'label hidden for the frame before layout');
  labelArea(view).props.onLayout({ nativeEvent: { layout: { height: 52 } } });
  view.render();
  assert.equal(label(view).props.style.fontSize, 24, 'label size follows the measured label area');
  assert.equal(labelArea(view).props.style.opacity, 1);
  const outer = [].concat(pressable().props.style).find(entry => entry && entry.maxWidth);
  assert.equal(outer.maxWidth, 320);
  const before = view.motions.length;
  pressable().props.onPressIn(); pressable().props.onPressOut();
  assert.equal(view.motions.length, before, 'no tween under reduced motion');

  assert.equal(face(buttonView({ label: 'Leave', variant: 'danger' }).view).props.source, '../../assets/images/red_button.png');
  const secondary = buttonView({ label: 'Later', variant: 'secondary' });
  assert.equal(face(secondary.view).props.source, '../../assets/images/yellow_button.png');
  assert.equal([].concat(secondary.pressable().props.style).find(entry => entry && entry.maxWidth).maxWidth, 240);
  const ghost = buttonView({ label: 'Not now', variant: 'ghost' }).view;
  assert.equal(face(ghost), undefined, 'ghost is a text action, no art');
  assert.equal(label(ghost).props.style.color, tokens.BRAND.navy);
});

function loaderView(props) {
  return runtime('src/ui/SharkLoader.tsx', {
    '../hooks/useReducedGameMotion': { default: () => true },
    './GameButton': { default: 'GameButton' },
    './GameIcon': { default: 'GameIcon' },
    './GameText': { default: 'GameText' },
    './tokens': tokens,
  }, props, {}, { exportName: 'default' });
}

test('SharkLoader: loading turns slow and offers retry; error and empty never spin', () => {
  let retries = 0;
  const view = loaderView({ onRetry: () => { retries += 1; }, slowAfterMs: 5000 });
  assert.ok(view.find(n => n.type === 'GameText' && n.props.children === 'Loading'));
  assert.ok(view.find(n => n.type?.name === 'SwimmingShark' && n.props.still === true), 'reduced motion holds the shark still');
  assert.equal(view.find(n => n.type === 'GameButton'), undefined, 'no retry before it runs slow');
  assert.equal(view.timers.size, 1);
  [...view.timers.values()][0]();
  view.render();
  assert.ok(view.find(n => n.type === 'GameText' && n.props.children === 'Still loading. Hang tight.'));
  view.find(n => n.type === 'GameButton').props.onPress();
  assert.equal(retries, 1);

  view.change({ state: 'error' });
  assert.ok(view.find(n => n.type === 'GameText' && n.props.children === "Couldn't load this"));
  assert.equal(view.find(n => n.type === 'GameButton').props.variant, 'primary');
  assert.equal(view.find(n => n.type?.name === 'SwimmingShark'), undefined);
  assert.ok(view.find(n => n.type === 'Image' && n.props.source === '../../assets/images/screens/pin-collections/shark.png'), 'error shows his shark');

  const empty = loaderView({ state: 'empty', title: 'Be the first on the podium', action: { label: 'Find a ride', onPress: () => undefined } });
  assert.ok(empty.find(n => n.type === 'GameText' && n.props.children === 'Be the first on the podium'));
  assert.equal(empty.find(n => n.type === 'GameButton').props.label, 'Find a ride');
  assert.equal(empty.timers.size, 0, 'empty state starts no slow timer');
});

test('Loading is a thin wrapper over SharkLoader', () => {
  const loading = runtime('src/components/Loading.tsx', { '../ui/SharkLoader': { default: 'SharkLoader' } }, { state: 'error', onRetry: 'r' });
  assert.equal(loading.tree.type, 'SharkLoader');
  assert.equal(loading.tree.props.state, 'error');
  assert.equal(loading.tree.props.onRetry, 'r');
});

test('image button labels: one size per button height instead of shrink-from-72', () => {
  assert.equal(artText.artButtonFontSize(0), 72, 'unmeasured keeps the original start size (label hidden until measured)');
  assert.equal(artText.artButtonFontSize(80), 37);
  assert.equal(artText.artButtonFontSize(52), 24);
  assert.equal(artText.artButtonFontSize(10), artText.ART_BUTTON_MIN_FONT);
  assert.equal(artText.artButtonFontSize(400), 72);
  assert.equal(artText.artButtonFontSize(Number.NaN), 72);
});

test("YellowButton keeps Dustin's original art and label style; only the size rule changed", () => {
  const source = fs.readFileSync(path.join(root, 'src/components/YellowButton.tsx'), 'utf8');
  for (const needle of [
    "require('../../assets/images/yellow_button.png')", 'aspectRatio: 3.8', 'aspectRatio: 4.4', "resizeMode=\"contain\"",
    "color: 'white'", "fontFamily: 'Shark'", "textTransform: 'uppercase'", "textShadowColor: 'rgba(0, 0, 0, .5)'",
    'textShadowRadius: 0', 'paddingLeft: 24', 'paddingRight: 24', 'toValue: 0.97', 'opacity: disabled ? 0.5 : 1',
    'adjustsFontSizeToFit={true}', 'fontSize: artButtonFontSize(labelAreaHeight)',
  ]) assert.ok(source.includes(needle), `YellowButton lost: ${needle}`);
  assert.ok(!source.includes('fontSize: 72'), 'the fixed 72pt start size is gone');
  assert.ok(!/GameButton|react-native-svg/.test(source), 'YellowButton does not render a new button style');
});
