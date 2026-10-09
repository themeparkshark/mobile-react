const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
exports.runtime = function(file, imports = {}, initialProps = {}, globals = {}, options = {}) {
  const slots = [], animations = [], timers = new Map(), sounds = [], cancelled = [], motions = [], jsCalls = [];
  let index = 0, dirty = true, effects = [], tree, timerId = 0, preferenceListener;
  let Component;
  const props = { ...initialProps };
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    createContext: value => ({ value, Provider: 'ContextProvider' }),
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useState(initial) { const i = index++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => { const value = typeof update === 'function' ? update(slots[i].value) : update;
        if (slots[i].value !== value) { slots[i].value = value; dirty = true; } }]; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const previous = slots[i]; slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
    useCallback(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn }; return slots[i].value; },
    useMemo(fn, deps) { const i = index++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useContext(context) { return context.value; },
    forwardRef(fn) { return props => fn(props, props.forwardedRef); },
    useSyncExternalStore(subscribe, getSnapshot) {
      react.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]);
      return getSnapshot();
    },
    memo(component) { return component; },
    useImperativeHandle(ref, create, deps) { react.useEffect(() => {
      if (ref) ref.current = create();
      return () => { if (ref) ref.current = null; };
    }, deps); },
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
    AppState: { addEventListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
    View: 'View', Modal: 'Modal', Image: 'Image', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable', TouchableOpacity: 'TouchableOpacity',
  };
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  const transpile = source => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const code = transpile(fs.readFileSync(path.join(root, file), 'utf8'));
  // Shared app hooks that every poll uses run for real in the component's realm.
  const realModules = { useLivePoll: 'src/hooks/useLivePoll.ts', livePollPolicy: 'src/hooks/livePollPolicy.ts',
    gpsWatchPolicy: 'src/context/gpsWatchPolicy.ts', positionFilter: 'src/context/positionFilter.ts', useUserIdle: 'src/hooks/useUserIdle.ts',
    matchLink: 'src/services/match/matchLink.ts', useMatchLink: 'src/hooks/useMatchLink.ts' };
  const realCache = new Map();
  let sandbox;
  const loadReal = name => {
    if (realCache.has(name)) return realCache.get(name).exports;
    const real = { exports: {} }; realCache.set(name, real);
    vm.runInContext(`(function (module, exports, require) {${transpile(fs.readFileSync(path.join(root, realModules[name]), 'utf8'))}\n})`,
      sandbox, { filename: realModules[name] })(real, real.exports, sandbox.require);
    return real.exports;
  };
  sandbox = vm.createContext({ module, exports: module.exports, Date, Math, console, __DEV__: false, process: { env: {} }, ...globals,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      const base = name.split('/').pop();
      if (name.startsWith('.') && Object.hasOwn(realModules, base)) return loadReal(base);
      if (name === 'react') return react;
      if (name === '@react-navigation/native') return { useFocusEffect: fn => react.useEffect(fn, [fn]) };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return native;
      if (name === 'react-native-reanimated') { const transition = { duration() { return this; }, delay() { return this; } }; return { default: { View: 'ReanimatedView', createAnimatedComponent: type => type }, FadeIn: transition, FadeOut: transition, SlideOutDown: transition,
        useSharedValue: value => react.useRef({ value }).current, makeMutable: value => ({ value }), useAnimatedStyle: fn => fn(),
        useDerivedValue: fn => react.useEffect(fn),
        Easing: native.Easing, cancelAnimation: value => cancelled.push(value),
        runOnJS: fn => (...args) => { jsCalls.push({ fn, args }); return fn(...args); },
        withTiming: value => { motions.push('timing'); return value; }, withSpring: value => { motions.push('spring'); return value; }, withDelay: (ms, value) => value,
        interpolate: (value, inputs, outputs) => outputs[0] + value * (outputs[1] - outputs[0]),
        withRepeat: value => value, withSequence: (...values) => values.at(-1) }; }
      if (name === 'expo-haptics') return { notificationAsync: async () => {}, impactAsync: async () => {},
        NotificationFeedbackType: { Success: 1 }, ImpactFeedbackStyle: { Light: 1, Medium: 2, Heavy: 3 } };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
      if (name === '../gamekit/SFX') return { playSfx: value => sounds.push(value) };
      // Shop and rewarded ads behave as on a 1.6.0 binary unless a test stubs them.
      if (/(^|\/)services\/ads$/.test(name)) return { adsAvailable: () => false, rewardText: () => '',
        watchForReward: async () => ({ status: 'unavailable' }) };
      if (/(^|\/)services\/purchases$/.test(name)) return { storeAvailable: () => false };
      // The power budget (src/power) reads as full power unless a test stubs it.
      if (/(^|\/)power$/.test(name)) return { usePowerBudget: () => ({ level: 'full', ambient: true, animate: true,
        pollMultiplier: 1, particleScale: 1, gpsRest: false, compass: true, lowPower: false, idle: false, stationary: false }),
        markMoved() {}, useBudgetedPoll() {}, useBatterySaver: () => false, setBatterySaver() {} };
      if (name.includes('assets/')) return name;
      return { default: name };
    },
  });
  vm.runInContext(code, sandbox, { filename: file });
  Component = options.exportName ? module.exports[options.exportName] : module.exports.default ?? module.exports.MemoryCard ?? module.exports.GameShellV2 ?? module.exports.BossBrawl ?? module.exports.ScoreDisplay;
  function render() { let count = 0; do {
    assert.ok(count++ < 20, 'hooks settle'); dirty = false; index = 0; effects = []; tree = options.arguments ? Component(...options.arguments(props)) : Component(props); effects.forEach(fn => fn());
  } while (dirty); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  }
  render();
  return { props, native, animations, timers, sounds, cancelled, motions, jsCalls, render,
    get tree() { return tree; }, find: predicate => find(tree, predicate),
    change(value) { Object.assign(props, value); render(); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); render(); },
    preference(value) { preferenceListener?.(value); render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
    /** Unmount and mount again in the same module realm (module-level caches survive). */
    remount() { slots.forEach(slot => slot?.cleanup?.()); slots.length = 0; render(); },
  };
};
