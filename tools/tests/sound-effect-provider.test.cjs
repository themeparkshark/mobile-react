const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function soundHarness(enabled = true) {
  const sounds = [];
  const cleanups = [];
  const warnings = [];
  const output = ts.transpileModule(
    fs.readFileSync(path.join(root, 'src/context/SoundEffectProvider.tsx'), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'react') return {
        createContext: () => ({ Provider: 'provider' }),
        useContext: () => ({ isReady: true, player: { enabled_sound_effects: enabled } }),
        useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
        useRef: value => ({ current: value }),
      };
      if (name === 'expo-av') return { Audio: { Sound: {
        async createAsync(source, options) {
          if (source === 'broken') throw new Error('decode failed');
          const sound = {
            source,
            options,
            unloaded: 0,
            played: 0,
            setOnPlaybackStatusUpdate(callback) { this.callback = callback; },
            async playAsync() { this.played++; },
            async unloadAsync() { this.unloaded++; },
          };
          sounds.push(sound);
          return { sound };
        },
      } } };
      if (name === './AuthProvider') return { AuthContext: {} };
      if (name === '../gamekit/SFX') return { SFX: { setEnabled() {} } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const play = module.exports.SoundEffectProvider({ children: null }).props.value.playSound;
  return { play, sounds, warnings, unmount: () => cleanups.forEach(cleanup => cleanup()) };
}

test('rapid reward cues finish independently and release their audio resources', async () => {
  const harness = soundHarness();
  await harness.play('ride-coin');
  await harness.play('reward');
  assert.deepEqual(harness.sounds.map(sound => sound.played), [1, 1]);
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [0, 0]);

  harness.sounds[0].callback({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 0]);
  harness.sounds[1].callback({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 1]);
});

test('sound setting, overlap limit, and unmount bound playback', async () => {
  const muted = soundHarness(false);
  await muted.play('ride-coin');
  assert.equal(muted.sounds.length, 0);

  const harness = soundHarness();
  for (let i = 0; i < 5; i++) await harness.play(`cue-${i}`);
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 0, 0, 0, 0]);
  harness.unmount();
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 1, 1, 1, 1]);
  await harness.play('late-cue');
  assert.equal(harness.sounds.at(-1).unloaded, 1);
});

test('a bad audio asset does not break later rewards', async () => {
  const harness = soundHarness();
  await harness.play('broken');
  await harness.play('reward');
  assert.equal(harness.warnings.length, 1);
  assert.equal(harness.sounds[0].played, 1);
});

test('landing cue keeps its mix while using the shared sound setting', async () => {
  const harness = soundHarness();
  await harness.play('coin-landing', { volume: 0.6, rate: 1.1 });
  assert.equal(harness.sounds[0].options.volume, 0.6);
  assert.equal(harness.sounds[0].options.rate, 1.1);
  const muted = soundHarness(false);
  await muted.play('coin-landing', { volume: 0.6, rate: 1.1 });
  assert.equal(muted.sounds.length, 0);
});
