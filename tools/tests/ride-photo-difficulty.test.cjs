// R7 difficulty proof: a +-150 ms jittered bot, 2000 first shots per tier (tools/ride-photo-difficulty.cjs).
const assert = require('node:assert/strict');
const test = require('node:test');
const { simulate } = require('../ride-photo-difficulty.cjs');

test('difficulty proof: Frame It! falls with rarity, Legendary first-try Frame It! under 15%, Uncommon stays forgiving', () => {
  const res = simulate(2000);
  const fi = [2, 3, 4, 5].map(t => res[t].frame_it);
  for (let i = 1; i < fi.length; i++) assert.ok(fi[i] < fi[i - 1], `Frame It! falls with rarity: ${fi}`);
  assert.ok(res[5].frame_it < 15, `Legendary Frame It! ${res[5].frame_it}%`);
  assert.ok(res[5].great >= 30 && res[5].great <= 40, `Legendary Great ${res[5].great}%`);
  assert.ok(res[5].blurry >= 20 && res[5].blurry <= 30, `Legendary Blurry ${res[5].blurry}%`);
  assert.ok(res[2].blurry < 15, `Uncommon Blurry ${res[2].blurry}%`);
  for (const t of [2, 3, 4, 5]) assert.ok(res[t].shots >= 20, 'at least 20 passes a tier');
  // The camera matters: a bot that ignores it misses more on Epic and Legendary.
  const naive = simulate(2000, { naive: true });
  assert.ok(naive[5].blurry > res[5].blurry && naive[4].blurry > res[4].blurry);
  // Waiting out the gull keeps the good grades (a free dodge).
  const dodge = simulate(2000, { dodge: true });
  assert.equal(dodge[3].photobombed, 0);
  assert.ok(dodge[3].dodged > 0);
});
