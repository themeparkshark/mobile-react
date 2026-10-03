const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function mount(file, props) {
  const slots = [], timers = new Map(); let cursor = 0, effects = [], dirty = true, id = 0, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    forwardRef: fn => fn,
    useState(initial) {
      const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (value !== slots[i].value) { slots[i].value = value; dirty = true; } }];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  };
  const module = { exports: {} }, jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Set, Date,
    setTimeout(fn) { const key = ++id; timers.set(key, fn); return key; }, clearTimeout(key) { timers.delete(key); },
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return { Text: 'Text', View: 'View', StyleSheet: { create: value => value } };
      if (name === 'expo-image') return { Image: 'Image' };
      if (name === './parkDayShareMetrics') return { parkDayShareMetrics: () => [] };
      if (name === './ShareCardArtwork') return { default: 'Artwork' };
      if (name.includes('assets/')) return 1;
      throw new Error(name);
    },
  }, { filename: file });
  function render() {
    let count = 0;
    do { assert.ok(count++ < 12); dirty = false; cursor = 0; effects = [];
      tree = module.exports.default(props); effects.forEach(fn => fn()); } while (dirty);
    return tree;
  }
  render();
  return { render, get tree() { return tree; }, get timers() { return timers.size; },
    expire() { [...timers.values()].forEach(fn => fn()); timers.clear(); render(); } };
}
function all(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => all(child, type));
  return [...(node.type === type ? [node] : []), ...all(node.props?.children, type)];
}
test('loaded remote share artwork stays visible instead of timing out into a fallback', () => {
  const ready = [];
  const image = mount('src/components/ShareCardArtwork.tsx', { artworkKey: 'coin:one', onReady: key => ready.push(key), source: { uri: 'https://example.test/one.png' }, fallback: 7 });
  assert.equal(image.timers, 1);
  image.tree.props.onLoad(); image.render();
  assert.equal(image.timers, 0);
  image.expire(); assert.equal(image.tree.props.source.uri, 'https://example.test/one.png');
  assert.deepEqual(ready, ['coin:one']);
});
test('slow or failed remote share artwork waits for its themed fallback to load', () => {
  for (const failure of ['timeout', 'error']) {
    const ready = [];
    const image = mount('src/components/ShareCardArtwork.tsx', { artworkKey: 'coin:one', onReady: key => ready.push(key), source: { uri: 'https://example.test/one.png' }, fallback: 7 });
    if (failure === 'timeout') image.expire(); else { image.tree.props.onError(); image.render(); }
    assert.equal(image.tree.props.source, 7); assert.equal(ready.length, 0);
    image.tree.props.onLoad(); image.render(); assert.deepEqual(ready, ['coin:one']);
  }
});
