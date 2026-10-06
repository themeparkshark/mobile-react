const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/components/DailyGiftModal.tsx';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const gift = { id: 9, coins: 25, redeemed_at: null };
function chest({ reconciled = null, reduced = false } = {}) {
  const slots = [], updates = [], acknowledged = [], sounds = [], timers = new Map(), flights = [], alerts = [];
  let index = 0, dirty = true, effects = [], timerId = 0, tree, refreshes = 0, springs = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const AuthContext = {}; const DailyGiftContext = {};
  const react = {
    useRef(value) { const key = index++; return slots[key] ||= { current: value }; },
    useState(initial) {
      const key = index++; slots[key] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[key].value, value => { if (slots[key].value !== value) { slots[key].value = value; dirty = true; } }];
    },
    useEffect(fn, deps) {
      const key = index++;
      if (!slots[key] || !same(slots[key].deps, deps)) {
        const prev = slots[key]; slots[key] = { deps };
        effects.push(() => { prev?.cleanup?.(); slots[key].cleanup = fn(); });
      }
    },
    useContext(context) { return context === AuthContext
      ? { player: { username: 'localqa' }, refreshPlayer() { refreshes++; } }
      : { setDailyGift(value) { acknowledged.push(value); } }; },
  };
  const jsx = (type, props) => ({ type, props }); const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: value => value },
    useWindowDimensions: () => ({ width: 390 }), Alert: { alert() {} } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Date, Math,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return native;
      if (name === 'react-native-reanimated') return {
        default: { View: 'AnimatedView' }, useSharedValue: value => react.useRef({ value }).current,
        useAnimatedStyle: fn => fn(),
        cancelAnimation() {}, withTiming: value => value, Easing: { inOut: value => value, sin: 1, out: value => value, in: value => value, quad: 1 }, withDelay: (ms, value) => value,
        withSequence: (...values) => values.at(-1), withRepeat: value => value,
        withSpring(value) { springs++; return value; },
      };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === 'expo-haptics') return { impactAsync: async () => {}, notificationAsync: async () => {}, selectionAsync: async () => {},
        ImpactFeedbackStyle: { Medium: 1, Heavy: 2 }, NotificationFeedbackType: { Success: 1 } };
      if (name === '../context/AuthProvider') return { AuthContext };
      if (name === '../context/DailyGiftProvider') return { DailyGiftContext };
      if (name === '../context/CurrencyFlyProvider') return { useCurrencyFly: () => ({ triggerFly(value) { flights.push(value); } }) };
      if (name === '../dev/ws7Preview') return { ws7Preview: () => '' };
      if (name === '../ui') return { BRAND: { navy: '#05346e', blue: '#0768b9', white: '#fff', gold: '#ffcf3b', goldLip: '#d99a00' },
        GameIcon: 'GameIcon', ICON_SOURCES: { coins: 'icon:coins', energy: 'icon:energy', ticket: 'icon:ticket' },
        gameAlert(title) { alerts.push(title); } };
      if (name === './RewardBurst') return { default: 'RewardBurst' };
      if (name === '../hooks/useReducedGameMotion') return { default: () => reduced };
      if (name === '../gamekit/SFX') return { playSfx: name => sounds.push(name) };
      if (name === '../api/endpoints/daily-gifts/update') return { default: () => { const request = pending(); updates.push(request); return request.promise; } };
      if (name === '../api/endpoints/daily-gifts/create') return { default: async () => { if (reconciled) return reconciled; throw new Error('Offline'); } };
      if (name.includes('assets/')) return name;
      if (name === 'react-native-modal' || name === './Ribbon') return { default: name };
      throw new Error(`Unexpected import ${name}`);
    },
  }, { filename: file });
  function render() {
    let count = 0;
    do { assert.ok(count++ < 12); dirty = false; index = 0; effects = []; tree = module.exports.default({ dailyGift: gift }); effects.forEach(fn => fn()); } while (dirty);
  }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(value => find(value, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }
  render();
  return { updates, acknowledged, sounds, flights, alerts, get exports() { return module.exports; },
    find: predicate => find(tree, predicate),
    decline() { find(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Back to map without opening this chest').props.onPress(); render(); },
    get modal() { return tree; },
    preference(value) { reduced = value; render(); },
    get refreshes() { return refreshes; }, get springs() { return springs; },
    open() { find(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel?.startsWith('Open today')).props.onPress(); render(); },
    get disabled() { return find(tree, node => node.type === 'Pressable' && node.props.accessibilityLabel)?.props.disabled; },
    get visible() { return tree.props.isVisible; },
    get celebrated() { return !!find(tree, node => node.type === 'Text' && typeof node.props.children === 'string' && node.props.children.includes('collected!')); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    reveal() { for (let i = 0; i < 60 && timers.size; i++) { const due = [...timers.values()]; timers.clear(); due.forEach(fn => fn()); render(); } },
    dismiss() { find(tree, node => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && !node.props.accessibilityLabel).props.onPress(); render(); },
  };
}
test('daily chest coalesces taps and celebrates only a server-confirmed reward', async () => {
  const daily = chest(); daily.open(); daily.open();
  assert.equal(daily.updates.length, 1);
  assert.equal(daily.disabled, true);
  daily.reveal(); assert.equal(daily.celebrated, false);
  assert.equal(daily.sounds.includes('win'), false);
  const confirmed = { ...gift, redeemed_at: '2026-09-29T22:00:00Z' };
  daily.updates[0].resolve(confirmed); await daily.settle(); daily.reveal();
  assert.equal(daily.celebrated, true); assert.equal(daily.refreshes, 1);
  assert.equal(daily.acknowledged.length, 0, 'celebration stays visible until dismissed');
  daily.dismiss(); assert.equal(daily.acknowledged[0], confirmed);
});
test('daily chest failures keep retry available without displaying an earned reward', async () => {
  const daily = chest(); daily.open(); daily.updates[0].reject(new Error('Offline'));
  await daily.settle(); daily.reveal();
  assert.equal(daily.celebrated, false); assert.equal(daily.disabled, false);
  assert.equal(daily.refreshes, 0); assert.equal(daily.sounds.includes('win'), false);
  daily.open(); assert.equal(daily.updates.length, 2);
});
test('an already-collected chest reconciles provider state without a second celebration', async () => {
  const confirmed = { ...gift, redeemed_at: '2026-09-29T22:00:00Z' };
  const daily = chest({ reconciled: confirmed }); daily.open(); daily.updates[0].reject(new Error('Already claimed'));
  await daily.settle(); daily.reveal();
  assert.equal(daily.visible, false); assert.equal(daily.acknowledged[0], confirmed);
  assert.equal(daily.celebrated, false); assert.equal(daily.sounds.includes('win'), false);
});
test('reduced-motion chest reveals confirmed rewards without spring animations', async () => {
  const daily = chest({ reduced: true }); daily.open(); daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-29T22:00:00Z' });
  await daily.settle(); daily.reveal();
  assert.equal(daily.celebrated, true); assert.equal(daily.springs, 0);
});
test('a player can leave the unopened chest without claiming or inventing a reward', () => {
  const daily = chest(); assert.equal(daily.visible, true);
  assert.equal(typeof daily.modal.props.onBackdropPress, 'function');
  assert.equal(typeof daily.modal.props.onBackButtonPress, 'function');
  daily.decline();
  assert.equal(daily.visible, false); assert.equal(daily.updates.length, 0);
  assert.equal(daily.acknowledged.length, 0); assert.equal(daily.refreshes, 0);
  assert.equal(daily.sounds.includes('win'), false);
});
test('claiming disables dismissal, and the reveal uses the confirmed ladder reward', async () => {
  const daily = chest(); daily.open();
  assert.equal(daily.modal.props.onBackdropPress, undefined);
  assert.equal(daily.modal.props.onBackButtonPress, undefined);
  assert.equal(daily.find(node => node.props?.accessibilityLabel === 'Back to map without opening this chest'), undefined);
  daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-30T00:12:00Z', day: 2,
    ladder: [{ day: 1, coins: 25, energy: 0, tickets: 0 }, { day: 2, coins: 0, energy: 20, tickets: 0 }] });
  await daily.settle(); daily.reveal();
  const text = node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children;
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '+20 energy'));
  assert.equal(daily.find(node => node.type === 'Text' && text(node) === '+25 coins'), undefined);
});
test('turning on reduced motion during a claim prevents delayed spring celebration', async () => {
  const daily = chest(); daily.open();
  daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-30T00:12:00Z' });
  await daily.settle(); daily.preference(true); daily.reveal();
  assert.equal(daily.celebrated, true); assert.equal(daily.springs, 0);
  assert.equal(daily.updates.length, 1); assert.equal(daily.refreshes, 1);
});

const ladder = [1, 2, 3, 4, 5, 6, 7].map(day => ({ day, coins: [25, 0, 50, 0, 75, 0, 100][day - 1],
  energy: [0, 20, 0, 30, 0, 40, 0][day - 1], tickets: day === 7 ? 1 : 0 }));
const text = node => Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children;
test('the celebration shows exactly what the server granted and never a coin pile on an Energy day', async () => {
  const daily = chest(); daily.open();
  daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-30T00:12:00Z', day: 2, ladder, streak: 2,
    reward: { coins: 0, energy: 20, tickets: 0 }, granted: { coins: 0, energy: 5, tickets: 0 } });
  await daily.settle(); daily.reveal();
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '+5 energy'), 'granted, not the ladder 20');
  const chestArt = daily.find(node => node.type === 'Image' && node.props.style?.width > 100);
  assert.match(chestArt.props.source, /chest-closed/, 'no pile of coins for an Energy prize');
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '2 day streak'));
  daily.dismiss();
  assert.deepEqual(daily.flights.map(f => f.targetPosition), ['energy']);
  assert.equal(daily.flights[0].amount, 5);
});
test('day 7 punches a Park Ticket and lists its coins, then flies both to the header', async () => {
  const daily = chest(); daily.open();
  daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-30T00:12:00Z', day: 7, ladder, streak: 14,
    granted: { coins: 250, energy: 0, tickets: 2 }, milestone: { label: 'Two-week souvenir', coins: 150, energy: 0, tickets: 1 },
    next_milestone: { day: 30, days_away: 16, label: 'Monthly souvenir', coins: 300, energy: 0, tickets: 2 } });
  await daily.settle(); daily.reveal();
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '+2 tickets'));
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '+250 coins'));
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === 'Two-week souvenir bonus!'));
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === '16 more days to your Monthly souvenir'));
  assert.ok(daily.find(node => node.type === 'Text' && text(node) === 'SEE YOU AT THE PARK!'));
  daily.dismiss();
  assert.deepEqual(daily.flights.map(f => f.targetPosition).sort(), ['coins', 'tickets']);
});
test('chest errors use the game dialog, never a system alert', async () => {
  const daily = chest(); daily.open(); daily.updates[0].reject(new Error('Offline'));
  await daily.settle();
  assert.deepEqual(daily.alerts, ['Could not open your chest']);
  assert.doesNotMatch(require('node:fs').readFileSync(require('node:path').join(root, file), 'utf8'), /Alert\.alert|[\u{1F300}-\u{1FAFF}\u2713\u203A]/u);
});

test('the count-up never shows +0 and the prize reserves its own height', () => {
  const daily = chest();
  const { countStart, prizeBlockHeight } = daily.exports;
  assert.equal(countStart(20), 1);
  assert.equal(countStart(1), 1);
  assert.equal(countStart(0), 0);
  assert.ok(prizeBlockHeight(1, true, false) > prizeBlockHeight(0, false, false));
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(source, /\+\{Math\.max\(shown, countStart\(amount\)\)\}/, 'the first open frame already shows at least 1');
  assert.match(source, /prizeSlot, \{ height: prizeBlockHeight\(/);
});
test('the day 7 punch is motion and GameIcon art only, and its timer is cleared on unmount', () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /punchHole|borderRadius: 11/, 'no vector hole drawn over the ticket art');
  assert.match(source, /<GameIcon name="sparkle"/);
  assert.match(source, /if \(punchTimer\.current\) clearTimeout\(punchTimer\.current\);\n    \};/);
  assert.doesNotMatch(source, /coingold\.png|ticket-icon\.png|energy\.png/, 'the fly uses the same GameIcon art as the prize');
});
test('flights carry the GameIcon art of each prize', async () => {
  const daily = chest(); daily.open();
  daily.updates[0].resolve({ ...gift, redeemed_at: '2026-09-30T00:12:00Z', day: 7, ladder,
    granted: { coins: 100, energy: 0, tickets: 1 } });
  await daily.settle(); daily.reveal(); daily.dismiss();
  const byTarget = Object.fromEntries(daily.flights.map(f => [f.targetPosition, f.imageSource]));
  assert.deepEqual(byTarget, { coins: 'icon:coins', tickets: 'icon:ticket' });
});
