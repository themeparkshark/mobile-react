const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function transpile(file) { return ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText; }
const timing = { exports: {} };
vm.runInNewContext(transpile('src/screens/ExploreScreen/mapOpportunityTiming.ts'), { module: timing, exports: timing.exports, Date, Number, Math });
const task = { type: 'task', model: { id: 104, name: 'Forbidden Journey' } };
function mapChallenge(initial = task) {
  const slots = []; let index = 0, dirty = true, effects = [], tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const props = { redeemable: initial, park: { id: 1 }, onPress() {}, onTaskCompleted() {} };
  const playSound = () => {};
  const react = {
    useContext: () => ({ playSound }),
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useState(initial) { const i = index++; slots[i] ||= { value: initial };
      return [slots[i].value, value => { slots[i].value = value; dirty = true; }]; },
    useEffect(fn, deps) { const i = index++;
      if (!slots[i] || !same(slots[i].deps, deps)) { const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  vm.runInNewContext(transpile('src/components/RedeemModal.tsx'), { module, exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-native') return { Animated: {
        View: 'AnimatedView', Value: class { setValue() {} stopAnimation() {} },
        timing: () => ({ start() {} }),
      } };
      if (name === '../hooks/useReducedGameMotion') return { default: () => false };
      if (name.endsWith('mapOpportunityTiming')) return timing.exports;
      if (name === '../context/SoundEffectProvider') return { SoundEffectContext: {} };
      if (name.includes('assets/')) return 1;
      return { default: name };
    },
  }, { filename: 'RedeemModal.tsx' });
  function render() { let count = 0;
    do { assert.ok(count++ < 10); dirty = false; index = 0; effects = []; tree = module.exports.default(props); effects.forEach(fn => fn()); } while (dirty);
  }
  function find(node, type) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(child => find(child, type)).find(Boolean);
    if (node.type === type) return node;
    return find(node.props?.children, type);
  }
  render();
  return { get modal() { return find(tree, './RedeemRedeemableModal'); }, get button() { return find(tree, './YellowButton'); },
    open() { find(tree, './YellowButton').props.onPress(); render(); },
    nearby(value) { props.redeemable = value; render(); },
    close() { this.modal.props.close(); render(); } };
}
test('a confirmed win can remove its nearby opportunity without unmounting the reward reveal', () => {
  const map = mapChallenge(); assert.equal(map.modal, undefined); map.open();
  map.nearby(undefined);
  assert.equal(map.button, undefined);
  assert.equal(map.modal.props.open, true);
  assert.equal(map.modal.props.redeemable, task);
});
test('GPS turnover cannot swap an opened challenge; the next explicit tap opens the new one', () => {
  const map = mapChallenge(); map.open();
  const next = { type: 'task', model: { id: 15, name: 'Mummy' } }; map.nearby(next);
  assert.equal(map.modal.props.redeemable, task);
  map.close(); assert.equal(map.modal.props.open, false);
  map.open(); assert.equal(map.modal.props.redeemable, next);
});
test('expired currency pickups do not offer a stale redeem action', () => {
  const map = mapChallenge({ type: 'coin', model: { id: 1, active_from: '2020-01-01 00:00:00', active_to: '2020-01-01 00:01:00' } });
  assert.equal(map.button, undefined); assert.equal(map.modal, undefined);
});
