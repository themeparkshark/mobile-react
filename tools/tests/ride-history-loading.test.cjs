const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/RideTracker/RideHistoryScreen.tsx';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: file,
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const jsx = (type, props) => ({ type, props });
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);

function journal() {
  const slots = []; const requests = []; let cursor = 0; let dirty = true; let tree;
  let effects = [];
  const state = initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: initial };
    return [slots[index].value, next => {
      const value = typeof next === 'function' ? next(slots[index].value) : next;
      if (value !== slots[index].value) { slots[index].value = value; dirty = true; }
    }];
  };
  const effect = (fn, deps) => {
    const index = cursor++;
    if (!slots[index] || !same(slots[index].deps, deps)) {
      const previous = slots[index]; slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
    }
  };
  const react = {
    memo: value => value, useState: state,
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    }, useEffect: effect,
  };
  const moduleRef = { exports: {} };
  vm.runInNewContext(code, {
    module: moduleRef, exports: moduleRef.exports, Date, Map, Set, console,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return {
        View: 'View', Text: 'Text', FlatList: 'FlatList', Pressable: 'Pressable',
        ActivityIndicator: 'ActivityIndicator', RefreshControl: 'RefreshControl', Modal: 'Modal',
        StyleSheet: { create: value => value },
      };
      if (name === '@react-navigation/native') return {
        useNavigation: () => ({ goBack() {}, navigate() {} }),
        useFocusEffect: fn => effect(fn, [fn]),
      };
      if (name === '../../api/endpoints/player-rides') return {
        getPlayerRides: params => { const pending = deferred(); requests.push({ params, ...pending }); return pending.promise; },
      };
      if (name === '../../api/endpoints/rides/wishlist') return { getWishlist: async () => [] };
      if (name === '../../hooks/useReducedGameMotion') return { default: () => false, __esModule: true };
      if (name === '../../constants/parkWaitTimes') return { PARK_DISPLAY_ORDER: [{ id: 2, name: 'Magic Kingdom' }] };
      if (name === '../../design-system') return { colors: {} };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === '../../ui') return { GameIcon: 'GameIcon', SharkLoader: 'SharkLoader' };
      if (name.includes('assets/')) return 1;
      if (name.includes('RideCard') || name.includes('ShareableRideCard')) return name;
      throw new Error(`Unexpected import ${name}`);
    },
  }, { filename: file });
  const render = () => {
    let count = 0;
    do {
      assert.ok(count++ < 12, 'render settles');
      dirty = false; cursor = 0; effects = [];
      tree = moduleRef.exports.default(); effects.forEach(fn => fn());
    } while (dirty);
    return tree;
  };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, predicate)).find(Boolean);
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  };
  const history = () => find(render(), node => node.type === 'FlatList' && !node.props.horizontal);
  const settle = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { requests, settle, history, render,
    filter: () => find(render(), node => node.type === 'FlatList' && node.props.horizontal) };
}
const ride = id => ({ id, ride_id: id, ride_name: `Ride ${id}`, rode_at: new Date().toISOString() });
const page = (ids, current = 1, last = 2) => ({ data: ids.map(ride), meta: { current_page: current, last_page: last, total: 21 } });

test('Today keeps loading after 20 rides, coalesces rapid scrolls, and avoids duplicate entries', async () => {
  const app = journal();
  app.requests[0].resolve(page(Array.from({ length: 20 }, (_, i) => i + 1)));
  await app.settle();
  const list = app.history();
  assert.equal(list.props.data.length, 20);
  list.props.onEndReached(); list.props.onEndReached();
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[1].params.page, 2);
  app.requests[1].resolve(page([20, 21], 2));
  await app.settle();
  assert.equal(app.history().props.data.length, 21);
});

test('A failed page can retry the same page without skipping memories or auto-retry loops', async () => {
  const app = journal();
  app.requests[0].resolve(page([1])); await app.settle();
  app.history().props.onEndReached();
  app.requests[1].reject(new Error('offline')); await app.settle();
  app.history().props.onEndReached();
  assert.equal(app.requests.length, 2);
  app.history().props.ListFooterComponent.props.onPress();
  assert.equal(app.requests[2].params.page, 2);
  app.requests[2].resolve(page([2], 2)); await app.settle();
  assert.deepEqual(Array.from(app.history().props.data, item => item.id), [1, 2]);
});

test('A delayed response from a previous park cannot replace the selected park history', async () => {
  const app = journal();
  const filter = app.filter();
  filter.props.renderItem({ item: { id: 2, name: 'Magic Kingdom' } }).props.onPress();
  app.render();
  assert.equal(app.requests[1].params.park_id, 2);
  app.requests[1].resolve(page([22], 1, 1)); await app.settle();
  app.requests[0].resolve(page([99], 1, 1)); await app.settle();
  assert.deepEqual(Array.from(app.history().props.data, item => item.id), [22]);
});
