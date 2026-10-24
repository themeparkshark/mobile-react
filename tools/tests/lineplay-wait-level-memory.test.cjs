'use strict';
/**
 * A level reached on the ride coin during a wait stays on the coin for the
 * rest of that wait, even after leaving LinePlay and coming back (a remount),
 * and the coin wears one level marker at a time.
 */
const assert = require('node:assert/strict'), test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

const memory = loadTs('src/services/lineplay/waitLevelMemory.ts');
const words = children => children == null || typeof children === 'boolean' ? ''
  : Array.isArray(children) ? children.map(words).join('')
    : typeof children === 'object' ? words(children.props?.children) : String(children);

test('the memory keeps one mark per wait and coin, and the coin wears one level marker at a time', () => {
  memory.forgetWaitLevels();
  assert.equal(memory.waitLevelMark(1000, 7), null);
  assert.equal(memory.waitLevelMark(null, 7), null, 'no wait, no mark');
  const mark = memory.rememberWaitLevel(1000, 7, 3);
  assert.deepEqual({ ...mark }, { level: 3, partLanded: false });
  assert.equal(memory.waitLevelMark(1000, 8), null, 'another coin');
  assert.equal(memory.waitLevelMark(2000, 7), null, 'another wait');
  assert.equal(memory.coinLevelMarker(mark, 4), 'ribbon', 'right after a level up: LEVEL 3!, no goal number beside it');
  const landed = memory.markWaitPartLanded(1000, 7);
  assert.equal(landed.partLanded, true);
  assert.equal(memory.coinLevelMarker(landed, 4), 'goal', 'a new Part landed: the next goal shows instead');
  assert.equal(memory.coinLevelMarker(null, 4), 'goal');
  assert.equal(memory.coinLevelMarker(null, null), null, 'max level: the crown sits there');
  for (let wait = 0; wait < 20; wait++) memory.rememberWaitLevel(`w${wait}`, 1, 2);
  assert.equal(memory.waitLevelMark(1000, 7), null, 'old waits are dropped, the map stays small');
  assert.ok(memory.waitLevelMark('w19', 1));
  memory.forgetWaitLevels();
});

function stage(props) {
  return runtime('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx', {
    '../../../../services/lineplay/waitLevelMemory': memory,
    '../../../../constants/coinTiers': { coinTier: () => ({ name: 'Gold', ringDeep: '#8a5a00' }) },
    '../../../../hooks/usePresentationQueue': { usePresentationSlot: () => ({ visible: false, done() {} }) },
    '../../../../context/SoundEffectProvider': { SoundEffectContext: { value: {} } },
    '../../../../../modules/flash-safety': { isDimFlashingLightsEnabled: () => false },
    '../../../../components/coin/progressionModel': { levelRibbon: level => `LEVEL ${level}`, levelUpFx: () => ({ haptics: [] }) },
    '../../../../gamekit/Haptics': { queueHaptic() {} },
    '../../../../audio/sfxLimiter': { playLimited() {}, SFX_PRIORITY: { land: 1 } },
    '../../../../ui/tokens': { BRAND: { white: '#fff', navy: '#05346e', gold: '#ffcf3b' } },
  }, {
    size: 120, owned: true, active: true, reducedMotion: true, partsBanked: 0, waitKey: 1792812047825,
    coin: { id: 1, rideName: 'Space Mountain', coinUrl: 'x', level: 3, maxLevel: 10, partsToNext: 6, energyToNext: 30, nextTierName: 'Gold', boss: null },
    progress: { fill: 0, notches: 6, lit: 0, maxed: false, partsReady: false, ready: false, energyShort: 0,
      label: '0 of 6 Parts to Level 4', chip: '0 of 6', goalLevel: 4 },
    onLevelUp: async () => ({ success: true }),
    ...props,
  });
}
const ribbon = app => app.find(node => node.type === 'Text' && words(node.props.children) === 'LEVELED UP!');
const goal = app => app.find(node => node.type === 'Text' && words(node.props.children) === '4');

test('leaving LinePlay and coming back mid-wait still shows LEVELED UP! (remount), never a bare "0 of 6"', () => {
  memory.forgetWaitLevels();
  memory.rememberWaitLevel(1792812047825, 1, 3);
  const first = stage();
  assert.ok(ribbon(first), 'the ribbon shows');
  assert.equal(goal(first), undefined, 'no "4" goal beside the ribbon');
  assert.equal(first.find(node => node.type === 'Text' && /LEVEL \d/.test(words(node.props.children))), undefined,
    'the ribbon has no number: the closed card keeps its numbers to four');
  assert.ok(first.find(node => node.props?.accessibilityLabel?.includes('You leveled it up to Level 3 this wait.')));
  // A fresh mount (LinePlay left and opened again) reads the same wait's mark.
  const again = stage();
  assert.ok(ribbon(again), 'still LEVELED UP! after a remount');
  // Another wait starts clean.
  assert.equal(ribbon(stage({ waitKey: 42 })), undefined);
  // The first new Part lands: the ribbon steps aside for the next goal (an up arrow and "4", no "Lv").
  again.change({ partsBanked: 1 });
  assert.equal(ribbon(again), undefined);
  assert.ok(goal(again));
  assert.equal(again.find(node => node.type === 'Text' && /\bLv\b/.test(words(node.props.children))), undefined);
  // And that sticks for the rest of the wait, across a remount too.
  assert.equal(ribbon(stage({ partsBanked: 1 })), undefined);
  memory.forgetWaitLevels();
});

test('the goal pip fades in when it takes the ribbon\'s place, and a wait with no id is never remembered', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync('src/screens/LinePlay/components/waitscreen/WaitCoinStage.tsx', 'utf8');
  // The swap is a soft fade (the ribbon fades out, the pip fades in), only when it really swaps this visit.
  assert.match(source, /entering=\{reducedMotion \|\| !pipSwapped \? undefined : FadeIn\.delay\(120\)\.duration\(260\)\}/);
  assert.match(source, /exiting=\{reducedMotion \? undefined : FadeOut\.duration\(180\)\}/);
  assert.match(source, /setPipSwapped\(true\);/);
  // Remembered only under a real wait id: no shared 'wait' key that two waits could collide on.
  assert.match(source, /waitKey != null \? rememberWaitLevel\(waitKey, coin\.id, target\) : \{ level: target, partLanded: false \}/);
  assert.doesNotMatch(source, /waitKey \?\? 'wait'/);
  // With no wait id, the swap still happens on screen when a Part lands.
  memory.forgetWaitLevels();
  const app = stage({ waitKey: null });
  assert.equal(ribbon(app), undefined, 'nothing remembered for a null wait');
  assert.ok(goal(app));
  memory.forgetWaitLevels();
});
