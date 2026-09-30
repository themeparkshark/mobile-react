const assert = require('node:assert/strict');
const test = require('node:test');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const svg = { default: 'Svg', Circle: 'Circle', Line: 'Line', Path: 'Path' };
const setup = (props = {}) => {
  const forwardedRef = { current: null };
  const run = runtime('src/games/memory/MemoryCard.tsx', {
    'react-native-svg': svg,
    './theme': { MM: { cream: '#fff8e4', gold: '#fec90e', coral: '#ff6b5c' } },
  }, { w: 72, h: 96, back: 'back.png', face: { sheet: 'sheet.png', slot: 5, cols: 4, rows: 2 }, forwardedRef, ...props });
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
  calm.forwardedRef.current.pop(3, 90, true);
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
  assert.equal(run.find((n) => n.type === 'Text'), undefined);
});
