const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
// Run with: node --test tools/tests/sfx-lazy-pool.test.cjs
// Battery pass: sounds load on first use, not 48 native players up front.

function manager() {
  const created = [];
  const Audio = {
    setAudioModeAsync: async () => undefined,
    Sound: { createAsync: async asset => {
      const sound = { asset, status: null, setOnPlaybackStatusUpdate(fn) { this.status = fn; },
        setStatusAsync: async () => undefined, unloadAsync: async () => undefined };
      created.push(sound);
      return { sound };
    } },
  };
  const mod = loadTs('src/gamekit/SFX.ts', {
    'expo-av': { Audio },
    '../assets/games/sfx/manifest': { SFX_MANIFEST: { tap: 1, win: 2, lose: 3, coin: 4 } },
  });
  return { SFX: mod.SFX, created };
}

test('the first cue loads only its own sound', async () => {
  const { SFX, created } = manager();
  await SFX.play('tap');
  assert.equal(created.length, 1);
  created[0].status({ isLoaded: true, didJustFinish: true });
  await SFX.play('tap');
  assert.equal(created.length, 1, 'a finished voice is reused');
  await SFX.play('nope');
  assert.equal(created.length, 1, 'unknown sounds stay a silent no-op');
});

test('overlapping plays grow a pool to three voices, then drop extra cues', async () => {
  const { SFX, created } = manager();
  for (let i = 0; i < 5; i++) await SFX.play('coin'); // none finish
  assert.equal(created.length, 3);
  created[0].status({ isLoaded: true, didJustFinish: true });
  await SFX.play('coin');
  assert.equal(created.length, 3, 'a voice freed by didJustFinish is reused');
});

test('explicit preload warms one voice per sound', async () => {
  const { SFX, created } = manager();
  await SFX.preload();
  assert.equal(created.length, 4);
});
