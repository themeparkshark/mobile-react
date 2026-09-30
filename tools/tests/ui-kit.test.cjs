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
const art = loadTs('src/ui/gameIconArt.ts');
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
  assert.equal(tokens.BUTTON.height, 58);
  assert.equal(tokens.BUTTON.maxWidth, 320);
  assert.equal(tokens.BUTTON.lip, 4);
  assert.equal(tokens.BRAND.goldLip.toLowerCase(), '#d99a00');
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

test('icon set covers the plan list and every raster icon reuses a file that exists', () => {
  const required = ['energy', 'ticket', 'rush', 'wrench', 'pin', 'gift', 'crown', 'medal1', 'medal2', 'medal3',
    'timer', 'streak', 'dice', 'bell', 'check', 'close', 'pause', 'star', 'sparkle', 'heart', 'map', 'swords', 'shark'];
  for (const name of required) assert.ok(names.isGameIconName(name), `missing icon ${name}`);
  assert.equal(new Set(names.GAME_ICON_NAMES).size, names.GAME_ICON_NAMES.length, 'icon names are unique');
  const source = fs.readFileSync(path.join(root, 'src/ui/GameIcon.tsx'), 'utf8');
  for (const name of names.RASTER_ICON_NAMES) {
    const match = new RegExp(`${name}: require\\('([^']+)'\\)`).exec(source);
    assert.ok(match, `raster ${name} is mapped`);
    assert.ok(fs.existsSync(path.resolve(root, 'src/ui', match[1])), `${match[1]} exists`);
  }
});

test('vector icons stay on the 48 grid and only use brand paint', () => {
  const allowed = new Set([...Object.values(tokens.BRAND), '#ff8f3a', '#e3ebf5', '#9fb2c9', '#eb9a5c', '#b8662f']);
  for (const [name, icon] of Object.entries(art.VECTOR_ICONS)) {
    assert.ok(icon.silhouette.length > 0, `${name} has a silhouette`);
    for (const shape of [...icon.silhouette, ...(icon.detail ?? [])]) {
      for (const paint of [shape.fill, shape.stroke]) if (paint) assert.ok(allowed.has(paint), `${name} uses ${paint}`);
      const numbers = shape.kind === 'path' ? shape.d.match(/-?\d+(\.\d+)?/g).map(Number)
        : shape.kind === 'circle' ? [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r]
        : shape.kind === 'rect' ? [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h] : [shape.x, shape.y];
      for (const value of numbers) assert.ok(value >= 0 && value <= 48, `${name} leaves the grid (${value})`);
    }
  }
  assert.equal(art.outlineWidth({ kind: 'circle', cx: 1, cy: 1, r: 1, fill: '#fff' }), art.ICON_OUTLINE * 2);
  assert.equal(art.outlineWidth({ kind: 'path', d: 'M0 0', stroke: '#fff', width: 5 }), 5 + art.ICON_OUTLINE * 2);
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

function buttonView(props, reduced = false) {
  const hapticCalls = [];
  const view = runtime('src/ui/GameButton.tsx', {
    '../hooks/useReducedGameMotion': { default: () => reduced },
    '../gamekit/Haptics': { haptic: intent => hapticCalls.push(intent) },
    './GameIcon': { default: 'GameIcon' },
    './tokens': tokens,
  }, props);
  return { view, hapticCalls, pressable: () => view.tree };
}

test('GameButton: press gives a light haptic and fires once; disabled and loading ignore presses', () => {
  let presses = 0;
  const { view, hapticCalls, pressable } = buttonView({ label: 'Play ride', onPress: () => { presses += 1; } });
  assert.equal(pressable().type, 'Pressable');
  assert.equal(pressable().props.accessibilityLabel, 'Play ride');
  pressable().props.onPressIn(); pressable().props.onPress(); pressable().props.onPressOut();
  assert.equal(presses, 1);
  assert.deepEqual(hapticCalls, ['tapLight']);
  assert.ok(view.motions.includes('timing'), 'press collapse animates');
  assert.ok(view.find(n => n.type === 'Text' && n.props.children === 'Play ride'));

  view.change({ disabled: true });
  pressable().props.onPress();
  assert.equal(presses, 1);
  assert.equal(pressable().props.accessibilityState.disabled, true);
  view.change({ disabled: false, loading: true });
  pressable().props.onPress();
  assert.equal(presses, 1);
  assert.equal(pressable().props.accessibilityState.busy, true);
});

test('GameButton: fixed Shark 24 (not shrink-from-72), 58 tall, capped at 320; reduced motion skips tweens', () => {
  const { view, pressable } = buttonView({ label: 'Go', onPress: () => undefined }, true);
  const label = view.find(n => n.type === 'Text');
  assert.equal(label.props.style.fontSize, 24);
  assert.equal(label.props.style.fontFamily, 'Shark');
  const outer = [].concat(pressable().props.style).find(style => style && style.height);
  assert.equal(outer.height, 58);
  assert.equal(outer.maxWidth, 320);
  const before = view.motions.length;
  pressable().props.onPressIn(); pressable().props.onPressOut();
  assert.equal(view.motions.length, before, 'no tween under reduced motion');
  const compact = buttonView({ label: 'Go', size: 'compact' }).view.find(n => n.type === 'Text');
  assert.equal(compact.props.style.fontSize, 20);
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
  assert.ok(view.find(n => n.type?.name === 'SwimmingFin' && n.props.still === true), 'reduced motion holds the fin still');
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
  assert.equal(view.find(n => n.type?.name === 'SwimmingFin'), undefined);

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

const artText = loadTs('src/ui/artButtonText.ts');

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
