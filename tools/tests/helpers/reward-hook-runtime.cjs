const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
exports.runtime = function(file, imports = {}, initialProps = {}) {
  const slots = [], animations = [], timers = new Map(), sounds = [], cancelled = [];
  let index = 0, dirty = true, effects = [], tree, timerId = 0, preferenceListener;
  let Component;
  const props = { ...initialProps };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useState(initial) { const i = index++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => { const value = typeof update === 'function' ? update(slots[i].value) : update;
        if (slots[i].value !== value) { slots[i].value = value; dirty = true; } }]; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn }; return slots[i].value; },
    useMemo(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useContext(context) { return context.value; },
  };
  const animation = kind => { const entry = { kind, stopped: false, started: false, start(callback) { this.started = true; this.callback = callback; }, finish() { this.callback?.({ finished: true }); }, stop() { this.stopped = true; this.callback?.({ finished: false }); } };
    animations.push(entry); return entry; };
  class Value { constructor(value) { this.value = value; this.listeners = new Map(); }
    setValue(value) { this.value = value; } stopAnimation() {} interpolate() { return this.value; }
    addListener(fn) { this.listeners.set(1, fn); return 1; } removeListener(id) { this.listeners.delete(id); } }
  const native = { Animated: { View: 'AnimatedView', Value,
    timing: () => animation('timing'), spring: () => animation('spring'), loop: () => animation('loop'),
    sequence: () => animation('sequence'), parallel: () => animation('parallel'), stagger: () => animation('stagger'), delay: () => animation('delay') },
    Platform: { OS: 'ios' }, Dimensions: { get: () => ({ width: 390, height: 844 }) }, useWindowDimensions: () => ({ width: 390, height: 844 }),
    Easing: { linear: 1, cubic: 1, sin: 1, quad: 1, out: value => value, in: value => value, inOut: value => value, back: () => 1 },
    StyleSheet: { create: value => value, absoluteFill: {}, absoluteFillObject: {} },
    AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: (name, fn) => {
      preferenceListener = fn; return { remove() { preferenceListener = undefined; } }; } },
    View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', TouchableOpacity: 'TouchableOpacity',
  };
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Math, console,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return native;
      if (name === 'react-native-reanimated') return { default: { View: 'ReanimatedView' },
        useSharedValue: value => react.useRef({ value }).current, useAnimatedStyle: fn => fn(),
        Easing: native.Easing, cancelAnimation: value => cancelled.push(value), runOnJS: fn => fn,
        withTiming: value => value, withSpring: value => value, withDelay: (ms, value) => value,
        withRepeat: value => value, withSequence: (...values) => values.at(-1) };
      if (name === 'expo-haptics') return { notificationAsync: async () => {}, impactAsync: async () => {},
        NotificationFeedbackType: { Success: 1 }, ImpactFeedbackStyle: { Light: 1, Medium: 2, Heavy: 3 } };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === '../gamekit/SFX') return { playSfx: value => sounds.push(value) };
      if (name.includes('assets/')) return name;
      return { default: name };
    },
  }, { filename: file });
  Component = module.exports.default;
  function render() { let count = 0; do {
    assert.ok(count++ < 20, 'hooks settle'); dirty = false; index = 0; effects = []; tree = Component(props); effects.forEach(fn => fn());
  } while (dirty); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }
  render();
  return { props, native, animations, timers, sounds, cancelled, render,
    get tree() { return tree; }, find: predicate => find(tree, predicate),
    change(value) { Object.assign(props, value); render(); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    preference(value) { preferenceListener?.(value); render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
};
