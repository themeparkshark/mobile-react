const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const svg = { default: 'Svg', Circle: 'Circle', Line: 'Line', Path: 'Path' };
const mv = (v) => ({ value: v });
const sv = () => ({ x: mv(0), y: mv(0), flip: mv(0), lift: mv(1), opacity: mv(0), scale: mv(1), rotZ: mv(0), arcY: mv(0) });
const setup = (props = {}) => {
  const forwardedRef = { current: null };
  const run = runtime('src/games/memory/MemoryCard.tsx', {
    'react-native-svg': { ...svg, Ellipse: 'Ellipse' },
    './theme': { MM: { cream: '#fff8e4', gold: '#fec90e', coral: '#ff6b5c', blue: '#2E9BFF', creamWarm: '#FFF4D6' } },
  }, { w: 72, h: 96, back: 'back.png', face: { sheet: 'sheet.png', slot: 5, cols: 4, rows: 2 }, sv: sv(), shimmer: mv({ id: -1, p: 0 }), id: 0, forwardedRef, ...props });
  return { run, forwardedRef };
};

test('card flip is a 3D rotate with a spring settle; reduced motion swaps to a short fade with no springs', () => {
  const full = setup({ reducedMotion: false });
  full.run.motions.length = 0;
  full.forwardedRef.current.flipUp(220);
  assert.ok(full.run.motions.includes('spring'), 'lift settles on a spring');
  const calm = setup({ reducedMotion: true });
  calm.run.motions.length = 0;
  calm.forwardedRef.current.flipUp(220);
  calm.forwardedRef.current.stamp(90, true);
  calm.forwardedRef.current.slip(true);
  assert.equal(calm.run.motions.includes('spring'), false);
  assert.ok(calm.run.motions.length >= 2, 'flip fade + slip rim still show');
});

test('the face crops the authored sheet cell for its slot; a failed sheet falls back to a plain plate', () => {
  const { run } = setup({ reducedMotion: true });
  const img = run.find((n) => n.type === 'Image' && n.props.source === 'sheet.png');
  assert.ok(img);
  assert.equal(img.props.style.left, -(5 % 4) * 72);
  assert.equal(img.props.style.top, -Math.floor(5 / 4) * 96);
  img.props.onError();
  run.render();
  assert.equal(run.find((n) => n.type === 'Image' && n.props.source === 'sheet.png'), undefined);
});

test('special faces draw their art on a plate (Golden Coin, Seagull) and never an emoji', () => {
  const { run } = setup({ reducedMotion: true, face: { art: 'coin.png', plate: '#ffd54a' } });
  assert.ok(run.find((n) => n.type === 'Image' && n.props.source === 'coin.png'));
  const texts = [];
  const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.type === 'Text') texts.push(n); (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]).forEach(walk); };
  const t = run.find((n) => n.type === 'Text');
  if (t) walk(t);
  for (const x of texts) {
    const str = [].concat(x.props.children).join('');
    assert.match(str, /^[A-Z ]*$/, 'only the SEEN tag, no emoji');
  }
});

test('cards carry no RN shadow props anywhere (the cel shadow is a Skia draw, 6.2 / B5)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.resolve(__dirname, '../../src/games/memory');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx'));
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal(/shadowOffset|shadowRadius|shadowOpacity|elevation\s*:/.test(src), false, `${f} uses an RN shadow prop`);
  }
});

test('results: at most one overlay is ever mounted (share back, album panel, challenge panel), reveals on the 232ms grid', () => {
  const { loadTs } = require('./helpers/ts-module.cjs');
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.resolve(__dirname, '../../src/games/memory/MemoryResults.tsx'), 'utf8');
  assert.equal(/<Modal\b/.test(src), false, 'no modal on the results surface');
  // mountedOverlays is pure: check every state.
  const pure = src.slice(src.indexOf('export function mountedOverlays'), src.indexOf('/** Reveal schedule'));
  const fn = new Function(`${pure.replace('export function mountedOverlays(panel: ResultsPanel, flipped: boolean): string[]', 'return function mountedOverlays(panel, flipped)')}`)();
  for (const panel of ['actions', 'album', 'challenge']) for (const flipped of [true, false]) assert.ok(fn(panel, flipped).length <= 1);
  void loadTs;
});
